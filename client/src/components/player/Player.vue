<template>
    <div class="player" ref="playerRef" :class="{ 'controlsHidden': controlsHidden }"
        @mousemove="showControls"
        @touchmove="showControls"
        @dragover="onSubtitlesDropped"
        @drop="onSubtitlesDropped"
        @mouseleave="hideControls">

        <LockScreen :options="props.options" v-if="locked"></LockScreen>
        
        <div class="buffering" v-if="!locked && (waitingMessage || (!paused && buffering))">
            <div class="waiting">
                <ion-icon name="sync-outline" class="spin"></ion-icon>
                <div class="message" v-if="waitingMessage">{{ waitingMessage }}</div>
            </div>
        </div>

        <Subtitle v-if="videoRef" :timecode="currentTime" :controlsShown="!controlsHidden"></Subtitle>

        <video ref="videoRef" :src="options.src" :poster="options.meta.background"
            @click="showControls"
            @timeupdate="updateCurrentTime"
            @waiting="() => updateBuffering(true)"
            @loadedmetadata="() => updateBuffering(false)"
            @canplay="() => updateBuffering(false)">
        </video>

        <div class="controls" v-if="!locked && videoRef">
            <AutoSyncControl></AutoSyncControl>

            <div class="panel">
                <PlayPauseControl class="control" :options="options" @change="onPlayerChange()"></PlayPauseControl>

                <div class="timer control" v-to-timer="currentTime"></div>
            </div>

            <div class="panel stretch">
                <TimeBarControl class="control" :options="options"></TimeBarControl>
            </div>

            <div class="panel">
                <VolumeContol class="control" />
                <SubtitlesControl class="control" v-if="options.src && options.meta" :videoUrl="options.src" :meta="options.meta" :userSubtitle="userSubtitle" />
                <HlsControl class="control" v-if="options.hls" :options="options" />
                <FullScreenControl class="control" :player="playerRef" :video="videoRef" />
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed, onMounted, ref, watch, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import store from '@/store';
import ClientService from '@/services/client.service';
import HlsService from '@/services/hls.service';

import LockScreen from "./LockScreen.vue";
import Subtitle from "./Subtitle.vue";
import AutoSyncControl from "./controls/AutoSync.vue";
import PlayPauseControl from "./controls/PlayPause.vue";
import TimeBarControl from "./controls/TimeBar.vue";
import VolumeContol from "./controls/Volume.vue";
import SubtitlesControl from "./controls/Subtitles.vue";
import HlsControl from "./controls/Hls.vue";
import FullScreenControl from "./controls/FullScreen.vue";

const props = defineProps({
    options: {
        src: String,
        hls: String,
        meta: {
            id: String,
            type: String,
            logo: String,
            background: String,
        },
        isOwner: Boolean
    }
});

const emit = defineEmits(['change']);

const locked = computed(() => store.state.player.locked);
const paused = computed(() => store.state.player.paused);
const currentTime = computed(() => store.state.player.currentTime);
const controlsHidden = computed(() => store.state.player.controlsHidden);
const buffering = computed(() => store.state.player.buffering);
const volume = computed(() => store.state.player.volume);
const hls = computed(() => store.state.player.hls);
const pictureReady = computed(() => store.state.player.pictureReady);

const { t } = useI18n();
const myId = computed(() => store.state.client.user && store.state.client.user.id);
const roomUsers = computed(() => (store.state.client.room && store.state.client.room.users) || []);
const loadingUsers = computed(() => roomUsers.value.filter(({ loading }) => loading));

const waitingMessage = computed(() => {
    if (!pictureReady.value || loadingUsers.value.some(({ id }) => id === myId.value))
        return hls.value ? t('loading.player.converting') : t('loading.player.loading');
    if (store.state.player.autoSync && loadingUsers.value.length)
        return t('loading.player.waiting', { names: loadingUsers.value.map(({ name }) => name).join(', ') });
    return null;
});

const playerRef = ref(null);
const videoRef = ref(null);
const userSubtitle = ref(null);

// "Ready" means the picture is actually being decoded, not just that sound or metadata has arrived.
const decodedFrames = (video) => video.getVideoPlaybackQuality ? video.getVideoPlaybackQuality().totalVideoFrames : video.webkitVideoDecodedByteCount;

let lastDecodedFrames = 0;
let lastDecodeProgressAt = 0;
const hasPicture = (now) => {
    const video = videoRef.value;
    if (!video || video.error) return false;

    const frames = decodedFrames(video);
    // The counter resets whenever the source changes (e.g. switching to HLS), so any change counts.
    if (video.paused || video.seeking || document.hidden || frames !== lastDecodedFrames) lastDecodeProgressAt = now;
    lastDecodedFrames = frames;

    if (video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA || video.videoWidth === 0) return false;
    if (!document.hidden && video.webkitVideoDecodedByteCount === 0) return false;

    // While playing, sound running on without new picture frames means the picture is stuck.
    return now - lastDecodeProgressAt < 1500;
};

// The browser has data but can't decode the picture (e.g. HEVC): try the HLS transcode once.
let undecodableSince = null;
let autoHlsTried = false;
const switchToHlsIfUndecodable = (now) => {
    const video = videoRef.value;
    if (hls.value || autoHlsTried || !props.options.hls || !video) return;

    // Background tabs don't decode frames at all, which would look like an undecodable picture.
    if (document.hidden) {
        undecodableSince = null;
        return;
    }

    const undecodable = !!video.error || (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
        && (video.videoWidth === 0 || video.webkitVideoDecodedByteCount === 0));
    if (!undecodable) {
        undecodableSince = null;
        return;
    }

    if (undecodableSince === null) undecodableSince = now;
    if (now - undecodableSince > 3000) {
        autoHlsTried = true;
        store.dispatch('player/setHls', { enabled: true, src: props.options.src, playlist: props.options.hls });
    }
};

let notReadySince = null;
let lastReported = null;
let lastReportedAt = 0;
const checkPicture = () => {
    const now = Date.now();
    switchToHlsIfUndecodable(now);
    if (hasPicture(now)) notReadySince = null;
    else if (notReadySince === null) notReadySince = now;

    // A short hiccup shouldn't pause the whole room.
    const ready = notReadySince === null || (pictureReady.value && now - notReadySince < 1000);
    if (ready !== pictureReady.value) store.commit('player/updatePictureReady', ready);

    const me = roomUsers.value.find(({ id }) => id === myId.value);
    if (me && me.loading === ready && (lastReported !== ready || now - lastReportedAt > 2000)) {
        ClientService.send('player.loading', { loading: !ready });
        lastReported = ready;
        lastReportedAt = now;
    }
};
let pictureInterval = null;

watch(volume, (value) => {
    videoRef.value.volume = value;
});

let hideTimeout = null;
const showControls = () => {
    clearTimeout(hideTimeout);
    store.commit('player/updateHideState', false);
    hideTimeout = setTimeout(hideControls, 3000);
};

const hideControls = () => {
    if (!paused.value) store.commit('player/updateHideState', true);
};

const onPlayerChange = () => {
    if (paused.value) showControls();
        emit('change');
};

const updateBuffering = (value) => {
    store.commit('player/updateBuffering', value);
};

const updateCurrentTime = () => {
    if (videoRef.value)
        store.commit('player/updateCurrentTime', videoRef.value.currentTime);
};

const onSubtitlesDropped = (event) => {
    event.preventDefault();

    const { files } = event.dataTransfer;
    if (files.length) {
        const file = files[0];
        if (file.name.endsWith('.srt'))
            userSubtitle.value = file;
    }
};

onMounted(() => {
    store.commit('player/updateLockState', true);
    store.commit('player/updateVideo', videoRef.value);
    store.commit('player/updatePictureReady', false);
    store.commit('player/updateHls', false);
    videoRef.value.volume = volume.value;

    pictureInterval = setInterval(checkPicture, 500);
});

onUnmounted(() => {
    store.commit('player/updateVideo', null);
    clearTimeout(hideTimeout);
    hideTimeout = null;
    clearInterval(pictureInterval);
    pictureInterval = null;
    HlsService.clear();
    store.commit('player/updateHls', false);
});
</script>

<style lang="scss" scoped>
$overlay-background-color: rgba(0, 0, 0, 0.5);

.player {
    position: relative;
    font-family: 'Montserrat-Regular';
    height: 100%;
    width: 100%;
    overflow: hidden;
    background-color: black;

    &.controlsHidden {
        cursor: none;

        .controls {
            opacity: 0;
            visibility: hidden;
        }
    }

    .buffering {
        position: absolute;
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: $text-color;
        background-color: $overlay-background-color;

        .waiting {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 1rem;
            padding: 0 2rem;
            text-align: center;
        }

        .message {
            font-family: 'Montserrat-SemiBold';
            font-size: 1.2rem;
        }

        ion-icon {
            font-size: 5rem;
        }
    }

    video {
        height: 100%;
        width: 100%;
        outline: none;
        align-self: center;

        // In real fullscreen, once idle, Chromium can promote a playing <video>
        // to a hardware/OS-compositor overlay plane that bypasses the normal DOM
        // paint pipeline entirely - no z-index on sibling overlays (subtitles,
        // controls) can win against that, since they're not in the same
        // compositing tree anymore. A no-op filter disqualifies the video from
        // that fast path, keeping it in normal layered compositing.
        filter: brightness(1);
    }

    .controls {
        height: $player-controls-height;
        display: flex;
        align-items: center;
        justify-content: space-between;
        position: absolute;
        bottom: 0;
        width: 100%;
        padding: 0 1vw;
        user-select: none;
        opacity: 1;
        transition: all 0.2s ease-in;
        color: $text-color;
        background-color: $overlay-background-color;
        box-shadow: 0px -40px 100px 60px $overlay-background-color;

        .panel {
            display: flex;
            align-items: center;

            &.stretch {
                width: 100%;

                .control {
                    display: flex;
                    width: 100%;
                }
            }
        }

        .control {
            position: relative;
            display: flex;
            flex-direction: row;
            align-items: center;
            justify-content: center;
            padding: 0.5em;
            font-size: 1.8em;
            cursor: pointer;
        }

        .timer {
            width: 4em;
            padding: 0;
            font-size: 1.3em;
            font-family: 'Montserrat-Medium';
            text-align: center;
        }
    }
}

@media only screen and (max-width: 768px) {
    .panel.stretch {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 70px;
        padding: 0 10px;
    }
}
</style>