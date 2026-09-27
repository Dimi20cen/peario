import HlsService from '@/services/hls.service';

export default {
    namespaced: true,
    state: {
        video: null,
        paused: true,
        currentTime: 0,
        locked: true,
        controlsHidden: false,
        buffering: true,
        volume: 0.5,
        autoSync: true,
        pictureReady: false,
        hls: false
    },
    getters: {
        video(state) {
            return state.video;
        },
        pictureReady(state) {
            return state.pictureReady;
        },
        hls(state) {
            return state.hls;
        },
        paused(state) {
            return state.paused;
        },
        currentTime(state) {
            return state.currentTime;
        },
        locked(state) {
            return state.locked;
        },
        controlsHidden(state) {
            return state.controlsHidden;
        },
        buffering(state) {
            return state.buffering;
        },
        volume(state) {
            return state.volume;
        },
        autoSync(state) {
            return state.autoSync;
        }
    },
    mutations: {
        updateVideo(state, value) {
            state.video = value;
        },
        updatePaused(state, value) {
            state.paused = value;
        },
        updateCurrentTime(state, value) {
            state.currentTime = value;
        },
        updateVideoSrc(state, value) {
            state.video.src = value;
        },
        updateVideoCurrentTime(state, value) {
            state.video.currentTime = value;
        },
        updateAutoSync(state, value) {
            state.autoSync = value;
        },
        updateLockState(state, value) {
            state.locked = value;
        },
        updateHideState(state, value) {
            state.controlsHidden = value;
        },
        updateBuffering(state, value) {
            state.buffering = value;
        },
        updateVolume(state, value) {
            state.volume = value;
        },
        updatePictureReady(state, value) {
            state.pictureReady = value;
        },
        updateHls(state, value) {
            state.hls = value;
        }
    },
    actions: {
        setCurrentTime(context, time) {
            context.commit('updateCurrentTime', time);
            context.commit('updateVideoCurrentTime', time);
        },
        async setHls({ state, commit }, { enabled, src, playlist }) {
            const { video } = state;
            const currentTime = video.currentTime;
            const wasPlaying = !video.paused;

            if (enabled) {
                try {
                    await HlsService.loadHls(playlist, video, currentTime);
                } catch (error) {
                    console.error('Failed to switch to HLS:', error);
                    enabled = false;
                }
            }

            if (!enabled) {
                HlsService.clear();
                commit('updateVideoSrc', src);
                commit('updateVideoCurrentTime', currentTime);
            }

            commit('updateHls', enabled);
            if (wasPlaying) video.play().catch(() => {});
            return enabled;
        }
    }
};