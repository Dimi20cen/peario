<template>
    <div class="hls" @click="toggleHls()">
        <ion-icon name="color-wand-outline" v-show="!isHls"></ion-icon>
        <ion-icon name="color-wand" v-show="isHls"></ion-icon>
    </div>
</template>

<script>
import { mapGetters } from 'vuex';
import HlsService from "@/services/hls.service";
import store from '../../../store';

export default {
    name: 'HlsControl',
    props: {
        options: Object
    },
    computed: mapGetters({
        video: 'player/video'
    }),
    data() {
        return {
            isHls: false
        }
    },
    methods: {
        async toggleHls() {
            const currentTime = this.video.currentTime;
            const wasPlaying = !this.video.paused;

            if (!this.isHls) {
                try {
                    await HlsService.loadHls(this.options.hls, this.video, currentTime);
                } catch (error) {
                    console.error('Failed to switch to HLS:', error);
                    HlsService.clear();
                    store.commit('player/updateVideoSrc', this.options.src);
                    store.commit('player/updateVideoCurrentTime', currentTime);
                    if (wasPlaying) this.video.play().catch(() => {});
                    return;
                }
            } else {
                HlsService.clear();
                store.commit('player/updateVideoSrc', this.options.src);
                store.commit('player/updateVideoCurrentTime', currentTime);
            }

            this.isHls = !this.isHls;

            if (wasPlaying) this.video.play().catch(() => {});
            this.isHls ? this.$toast.success(this.$t('toasts.hlsStream')) : this.$toast.success(this.$t('toasts.sourceStream'));
        },
        onVideoError() {
            if (!this.isHls) this.toggleHls();
        }
    },
    mounted() {
        this.video.addEventListener('error', this.onVideoError);
    },
    unmounted() {
        HlsService.clear();
        this.video.removeEventListener('error', this.onVideoError);
    }
}
</script>