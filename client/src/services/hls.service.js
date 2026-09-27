import Hls from 'hls.js';
import hat from 'hat';
import { STREMIO_STREAMING_SERVER } from '@/common/config';
import LogService from '@/services/log.service';

// Stremio's hlsv2 restarts timestamps at 0 after a seek, which stalls hls.js; retime each fragment to its playlist start.
const playlistStarts = {};

const readUint64 = (view, offset) => view.getUint32(offset) * 2 ** 32 + view.getUint32(offset + 4);
const writeUint64 = (view, offset, value) => {
    view.setUint32(offset, Math.floor(value / 2 ** 32));
    view.setUint32(offset + 4, value % 2 ** 32);
};

const readBoxes = (view, start, end) => {
    const boxes = [];
    for (let offset = start; offset + 8 <= end;) {
        let size = view.getUint32(offset);
        if (size === 1) size = readUint64(view, offset + 8);
        if (size < 8) break;

        const type = String.fromCharCode(...new Uint8Array(view.buffer, view.byteOffset + offset + 4, 4));
        boxes.push({ type, start: offset, end: offset + size });
        offset += size;
    }
    return boxes;
};

const childBoxes = (view, parent, type) => readBoxes(view, parent.start + 8, parent.end).filter(box => box.type === type);

const retimeFragment = (data, startSeconds) => {
    const view = new DataView(data);
    const top = readBoxes(view, 0, data.byteLength);

    const sidx = top.find(({ type }) => type === 'sidx');
    if (!sidx) return;
    const timescale = view.getUint32(sidx.start + 16);

    const tfdts = top
        .filter(({ type }) => type === 'moof')
        .flatMap(moof => childBoxes(view, moof, 'traf'))
        .flatMap(traf => childBoxes(view, traf, 'tfdt'));
    if (!tfdts.length) return;

    const isVersion1 = box => view.getUint8(box.start + 8) === 1;
    const read = box => isVersion1(box) ? readUint64(view, box.start + 12) : view.getUint32(box.start + 12);
    const write = (box, value) => isVersion1(box) ? writeUint64(view, box.start + 12, value) : view.setUint32(box.start + 12, value);

    const delta = Math.round(startSeconds * timescale) - read(tfdts[0]);
    if (delta !== 0) tfdts.forEach(box => write(box, read(box) + delta));
};

const wrapSuccess = (callbacks, transform) => ({
    ...callbacks,
    onSuccess: (response, stats, context, networkDetails) => {
        transform(response);
        callbacks.onSuccess(response, stats, context, networkDetails);
    }
});

class PlaylistLoader extends Hls.DefaultConfig.loader {
    load(context, config, callbacks) {
        const track = context.type === 'level' ? 'main' : context.type === 'audioTrack' ? 'audio' : null;
        if (track) {
            callbacks = wrapSuccess(callbacks, ({ data }) => {
                const starts = new Map();
                let sequenceNumber = 1;
                let time = 0;

                data.split('\n').forEach(line => {
                    if (line.startsWith('#EXT-X-MEDIA-SEQUENCE:')) {
                        sequenceNumber = parseInt(line.split(':')[1], 10);
                    } else if (line.startsWith('#EXTINF:')) {
                        starts.set(sequenceNumber++, time);
                        time += parseFloat(line.slice('#EXTINF:'.length));
                    }
                });

                playlistStarts[track] = starts;
            });
        }
        super.load(context, config, callbacks);
    }
}

class FragmentLoader extends Hls.DefaultConfig.loader {
    load(context, config, callbacks) {
        const { frag } = context;
        if (frag && frag.sn !== 'initSegment') {
            callbacks = wrapSuccess(callbacks, ({ data }) => {
                const start = playlistStarts[frag.type] && playlistStarts[frag.type].get(frag.sn);
                if (start !== undefined) retimeFragment(data, start);
            });
        }
        super.load(context, config, callbacks);
    }
}

const HlsService = {

    hls: null,

    async createPlaylist(mediaURL) {
        const id = hat();

        const queryParams = new URLSearchParams([
            ['mediaURL', mediaURL],
            ['videoCodecs', 'h264'],
            ['videoCodecs', 'vp9'],
            ['audioCodecs', 'aac'],
            ['audioCodecs', 'mp3'],
            ['audioCodecs', 'opus'],
            ['maxAudioChannels', 2],
        ]);

        return `${STREMIO_STREAMING_SERVER}/hlsv2/${id}/master.m3u8?${queryParams.toString()}`;
    },

    loadHls(playlistUrl, videoElement, startPosition) {
        this.clear();

        this.hls = new Hls({
            autoStartLoad: false,
            pLoader: PlaylistLoader,
            fLoader: FragmentLoader,
        });

        return new Promise((resolve, reject) => {
            this.hls.once(Hls.Events.MANIFEST_PARSED, () => {
                this.hls.startLoad(startPosition);
                resolve();
            });
            this.hls.on(Hls.Events.ERROR, (_, { fatal, type, details }) => {
                if (!fatal) return;
                LogService.error('HLS playback error', { type, details });
                reject(new Error(details));
            });

            this.hls.attachMedia(videoElement);
            // Otherwise currentTime reads 0 while loading and the owner's sync would rewind the room.
            videoElement.currentTime = startPosition;
            this.hls.loadSource(playlistUrl);
        });
    },

    clear() {
        if (!this.hls) return;
        this.hls.detachMedia();
        this.hls.destroy();
        this.hls = null;
    }

};

export default HlsService;
