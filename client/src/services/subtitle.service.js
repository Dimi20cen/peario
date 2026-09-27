import axios from "axios";
import LogService from "@/services/log.service";
import { parseSync } from 'subtitle';

// Chunks of an embedded track kept loaded ahead of the play position (~10s each).
const EMBEDDED_CHUNKS_AHEAD = 3;
// A chunk that failed to load is tried again after this long.
const EMBEDDED_RETRY_MS = 5000;

// Stretches with no dialogue come back as a bare "WEBVTT" header, which the parser rejects.
const parseCues = text => (text || '').includes('-->') ? parseSync(text).filter(({ type }) => type === 'cue') : [];

const SubtitleService = {

    subtitles: null,
    chunks: null,
    // Bumped on every switch, so a slow download for an earlier choice never replaces the current one.
    generation: 0,

    getCurrent(seconds) {
        if (this.chunks) this.loadChunksAround(seconds);
        if (this.subtitles) {
            const ms = seconds * 1000;
            const line = this.subtitles.find(({ data }) => ms >= data.start && ms <= data.end);
            return line ? line.data.text : '';
        }
        return null;
    },

    reset() {
        this.generation++;
        this.subtitles = null;
        this.chunks = null;
        return this.generation;
    },

    async set(url) {
        const generation = this.reset();
        try {
            // Force https: subtitle hosts served over http get silently blocked
            // as mixed content on this (https) site, which used to fail here quietly.
            const secureUrl = url.replace(/^http:\/\//, 'https://');
            const { data } = await axios.get(secureUrl);
            if (!Object.keys(data).length) return Promise.reject();
            if (generation !== this.generation) return Promise.resolve();

            this.subtitles = parseSync(data);
            return Promise.resolve();
        } catch(err) {
            LogService.warn('failed to load subtitle', { url, error: err && err.message });
            return Promise.reject(err);
        }
    },

    // Embedded tracks can't be downloaded whole: Stremio pulls each ~10s chunk
    // out of the video on request, so chunks are loaded as playback reaches them.
    async setEmbedded(playlistUrl) {
        const generation = this.reset();
        try {
            const { data } = await axios.get(playlistUrl, { responseType: 'text' });
            if (generation !== this.generation) return;

            const chunks = [];
            let start = 0;
            let duration = null;
            data.split('\n').map(line => line.trim()).forEach(line => {
                if (line.startsWith('#EXTINF:')) {
                    duration = parseFloat(line.slice('#EXTINF:'.length));
                } else if (line && !line.startsWith('#') && duration !== null) {
                    chunks.push({ start, end: start + duration, url: new URL(line, playlistUrl).toString(), state: 'idle', failedAt: 0 });
                    start += duration;
                    duration = null;
                }
            });

            this.subtitles = [];
            this.chunks = chunks;
        } catch(err) {
            LogService.warn('failed to load subtitles inside the video', { url: playlistUrl, error: err && err.message });
            throw err;
        }
    },

    loadChunksAround(seconds) {
        const index = this.chunks.findIndex(({ start, end }) => seconds >= start && seconds < end);
        if (index < 0) return;

        // One at a time, nearest first: each chunk is a separate extraction from the video.
        if (this.chunks.some(({ state }) => state === 'loading')) return;

        const now = Date.now();
        const chunk = this.chunks
            .slice(index, index + 1 + EMBEDDED_CHUNKS_AHEAD)
            .find(({ state, failedAt }) => state === 'idle' || (state === 'failed' && now - failedAt > EMBEDDED_RETRY_MS));
        if (!chunk) return;

        const generation = this.generation;
        chunk.state = 'loading';
        axios.get(chunk.url, { responseType: 'text' })
            .then(({ data }) => {
                if (generation !== this.generation) return;
                chunk.state = 'done';
                this.subtitles = this.subtitles.concat(parseCues(data));
            })
            .catch(err => {
                if (generation !== this.generation) return;
                if (!chunk.failedAt) LogService.warn('failed to load part of the subtitles inside the video', { at: Math.round(chunk.start), error: err && err.message });
                chunk.state = 'failed';
                chunk.failedAt = Date.now();
            });
    },

    setCustom(data) {
        this.reset();
        this.subtitles = parseSync(data);
    }

};

export default SubtitleService;
