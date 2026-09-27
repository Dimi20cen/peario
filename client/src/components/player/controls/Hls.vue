<template>
    <div class="hls" @click="toggleHls()" :title="isHls ? $t('components.player.hlsOn') : $t('components.player.hlsOff')">
        <ion-icon name="color-wand-outline" v-show="!isHls"></ion-icon>
        <ion-icon name="color-wand" v-show="isHls"></ion-icon>
    </div>
</template>

<script>
import { mapGetters } from 'vuex';
import store from '../../../store';

export default {
    name: 'HlsControl',
    props: {
        options: Object
    },
    computed: mapGetters({
        isHls: 'player/hls'
    }),
    methods: {
        async toggleHls() {
            const enabled = await store.dispatch('player/setHls', {
                enabled: !this.isHls,
                src: this.options.src,
                playlist: this.options.hls
            });
            enabled ? this.$toast.success(this.$t('toasts.hlsStream')) : this.$toast.success(this.$t('toasts.sourceStream'));
        }
    }
}
</script>