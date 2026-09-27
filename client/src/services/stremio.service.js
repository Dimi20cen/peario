import axios from "axios";
import LogService from "@/services/log.service";
import HlsService from "@/services/hls.service";
import { CINEMETA_URL, OPENSUBTITLES_URL, STREMIO_API_URL, STREMIO_STREAMING_SERVER } from "@/common/config";

const StremioService = {

    async isServerOpen() {
        try {
            await axios.get(`${STREMIO_STREAMING_SERVER}/stats.json`);
            return Promise.resolve(true);
        } catch(e) {
            return Promise.resolve(false);
        }
    },

    async getMetaSeries(imdbId) {
        const { data } = await axios.get(`${CINEMETA_URL}/meta/series/${imdbId}.json`);
        return data.meta;
    },

    async getMetaMovie(imdbId) {
        const { data } = await axios.get(`${CINEMETA_URL}/meta/movie/${imdbId}.json`);
        return data.meta;
    },

    async searchMovies(title) {
        const { data } = await axios.get(`${CINEMETA_URL}/catalog/movie/top/search=${title}.json`);
        return data.metas;
    },

    async searchSeries(title) {
        const { data } = await axios.get(`${CINEMETA_URL}/catalog/series/top/search=${title}.json`);
        return data.metas;
    },

    async getAddons() {
        const { data } = await axios.get(`${STREMIO_API_URL}/addonscollection.json`);
        return data;
    },

    async createTorrentStream(stream) {
        let { infoHash, fileIdx = null } = stream;
        const { data } = await axios.get(`${STREMIO_STREAMING_SERVER}/${infoHash}/create`);
        const { files } = data;
        if (!fileIdx) fileIdx = files.indexOf(files.sort((a, b) => a.length - b.length).reverse()[0]);
        return `${STREMIO_STREAMING_SERVER}/${infoHash}/${fileIdx}`;
    },

    async getStats(streamUrl) {
        const { data } = await axios.get(`${streamUrl}/stats.json`);
        console.log(data);
        
        return data;
    },

    async getSubtitles({ type, id, url }) {
        const withSource = subtitles => (subtitles || []).map(subtitle => ({ ...subtitle, source: 'OpenSubtitles' }));
        return withSource(await findOpenSubtitles({ type, id, url }));
    },

    // Subtitle tracks stored inside the video file itself. Stremio's HLS
    // playlist lists them, and serves each one as a series of short WebVTT
    // chunks (see SubtitleService.setEmbedded).
    async getEmbeddedSubtitles(videoUrl) {
        try {
            // A playlist of its own, so reading subtitles never disturbs the
            // conversion the HLS fix may be running on the video.
            const masterUrl = await HlsService.createPlaylist(videoUrl);
            const { data } = await axios.get(masterUrl);

            return data.split('\n')
                .filter(line => line.startsWith('#EXT-X-MEDIA:TYPE=SUBTITLES'))
                .map((line, index) => {
                    const attribute = name => (line.match(new RegExp(`${name}="([^"]*)"`)) || [])[1];
                    const language = attribute('LANGUAGE');
                    const name = attribute('NAME');
                    const uri = attribute('URI');
                    return uri && {
                        id: `embedded-${index}`,
                        url: new URL(uri, masterUrl).toString(),
                        lang: language || 'und',
                        // Stremio falls back to the language code (or track number) when a track has no title.
                        label: name && name !== language && !/^\d+$/.test(name) ? name : null,
                        source: 'Embedded',
                        embedded: true,
                    };
                })
                .filter(subtitle => subtitle);
        } catch (err) {
            LogService.warn('could not list subtitles inside the video', { error: err.message });
            return [];
        }
    }

};

async function findOpenSubtitles({ type, id, url }) {
    try {
        // The hash only narrows the search together with the file size;
        // on its own OpenSubtitles returns nothing at all.
        const { hash, size } = await getOpenSubInfo(url);
        const matched = await queryOpenSubtitles({ type, id, videoHash: hash, videoSize: size });
        return matched.length ? matched : await queryOpenSubtitles({ type, id });
    } catch(err) {
        // The local streaming server's /opensubHash often can't be reached
        // (blocked by its own CORS policy for this origin), so fall back to
        // a hash-less lookup instead of silently returning no subtitles.
        LogService.warn('subtitle hash lookup failed, searching without it', { error: err.message });
        try {
            return await queryOpenSubtitles({ type, id });
        } catch (fallbackErr) {
            LogService.warn('subtitle search failed', { error: fallbackErr.message });
            return [];
        }
    }
}

async function getOpenSubInfo(streamUrl) {
    const { data } = await axios.get(`${STREMIO_STREAMING_SERVER}/opensubHash?videoUrl=${encodeURIComponent(streamUrl)}`);
    const { result } = data;
    return result;
}

async function queryOpenSubtitles({ type, id, videoHash, videoSize }) {
    const extra = videoHash && videoSize ? `/videoHash=${videoHash}&videoSize=${videoSize}` : '';
    const { data } = await axios.get(`${OPENSUBTITLES_URL}/subtitles/${type}/${id}${extra}.json`);
    return data.subtitles || [];
}

export default StremioService;