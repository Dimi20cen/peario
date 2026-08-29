import axios from "axios";
import { parseSync } from 'subtitle';

const SubtitleService = {
    
    subtitles: null,

    getCurrent(seconds) {
        if (this.subtitles) {
            const ms = seconds * 1000;
            const line = this.subtitles.find(({ data }) => ms >= data.start && ms <= data.end);
            return line ? line.data.text : '';
        }
        return null;
    },

    async set(url) {
        try {
            // Force https: subtitle hosts served over http get silently blocked
            // as mixed content on this (https) site, which used to fail here quietly.
            const secureUrl = url.replace(/^http:\/\//, 'https://');
            const { data } = await axios.get(secureUrl);
            if (!Object.keys(data).length) return Promise.reject();

            this.subtitles = parseSync(data);
            return Promise.resolve();
        } catch(err) {
            console.error('Failed to load subtitle:', err);
            return Promise.reject(err);
        }
    },

    setCustom(data) {
        this.subtitles = parseSync(data);
    }

};

export default SubtitleService;