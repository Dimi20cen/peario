<template>
    <div :class="['room', { 'chat-open': isChatOpen }]">
        <Loading type="room" v-if="!playerOptions"></Loading>

        <UsersList
            :show="!playerState.controlsHidden"
            :roomOwner="roomOwner"
            :isUserOwner="isUserOwner"
            :users="usersList"
            :isPlayerPaused="playerState.paused"
            @onUpdateOwnership="onUpdateOwnership"
        />

        <div class="controls">
            <Button clear icon="close" v-if="isChatOpen" @click="isChatOpen = false"></Button>
            <Button clear icon="chatbubbles-outline" v-else @click="isChatOpen = true">Open Chat</Button>
        </div>

        <Player v-if="playerOptions" :options="playerOptions" @change="syncPlayer()"></Player>

        <transition name="fade">
            <Chat v-if="isChatOpen"></Chat>
        </transition>
    </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import router from '@/router';
import store from '@/store';

import Loading from "@/components/Loading.vue";
import Button from "@/components/ui/Button.vue";
import Player from "@/components/player/Player.vue";
import Chat from "@/components/Chat.vue";
import UsersList from './UsersList/UsersList.vue';
import StremioService from "@/services/stremio.service";
import HlsService from "@/services/hls.service";
import ClientService from "@/services/client.service";
import LogService from "@/services/log.service";
import { onBeforeRouteLeave } from 'vue-router';

const initialized = ref(false); 
const playerOptions = ref(null); 
const isChatOpen = ref(false); 

const clientState = computed(() => store.state.client);
const clientRoomState = computed(() => store.state.client.room);
const playerState = computed(() => store.state.player);

const roomOwner = computed(() => clientRoomState.value && clientState.value.room.owner ? clientState.value.room.owner : null);
const usersList = computed(() => clientRoomState.value && clientState.value.room.users ? clientState.value.room.users : []);
const isUserOwner = computed(() => clientState.value && clientState.value.user && clientState.value.user.id ? roomOwner.value === clientState.value.user.id : false);

const syncRoom = async () => {
    const { stream, meta, player, owner } = clientState.value.room;

    playerOptions.value = {
        ...playerOptions.value,
        meta,
        isOwner: clientState.value.user.id === owner,
    };

    if (!initialized.value) {
        const isTorrentStream = stream.infoHash != null;
    
        LogService.info('opening stream', { title: meta.name, type: isTorrentStream ? 'torrent' : 'direct link', url: stream.url });
        const videoUrl = isTorrentStream ? await StremioService.createTorrentStream(stream) : stream.url;

        // Offered for direct URLs too: browsers can't decode some audio codecs
        // (e.g. EAC3), and the HLS transcode is the only in-player way around it.
        const playlistUrl = await HlsService.createPlaylist(videoUrl);
        const check = await HlsService.checkPlayable(videoUrl);
        if (check) LogService.info(check.playable ? 'browser can play the stream' : 'browser cannot play the stream, starting with the HLS fix', { container: check.container, video: check.video, audio: check.audio, problems: check.problems.join(', ') || undefined });

        playerOptions.value = {
            ...playerOptions.value,
            src: videoUrl,
            hls: playlistUrl,
            startHls: !!check && !check.playable,
        };

        initialized.value = true;
    }

    if (playerState.value.autoSync && playerState.value.video && !playerState.value.locked) {
        const video = playerState.value.video;
        const isOwner = clientState.value.user.id === owner;
        const someoneLoading = clientState.value.room.users.some(({ loading }) => loading);

        // The owner is the source of play/pause; only guests follow the room's state.
        if (!isOwner) {
            const unsync = player.time - video.currentTime;
            if (unsync > 1 || unsync < -1) {
                video.currentTime = player.time;
            }

            store.commit('player/updatePaused', player.paused);
            playerState.value.buffering = player.buffering;
        }

        playerState.value.paused || someoneLoading ? video.pause() : video.play().catch(() => {});
    }
};

const syncPlayer = () => {
    if (playerState.value.autoSync) {
        const { currentTime } = playerState.value.video;
        ClientService.send('player.sync', {
            paused: playerState.value.paused,
            buffering: playerState.value.buffering,
            time: currentTime,
        });
    }
};

const onUpdateOwnership = (userId) => {
    ClientService.send('room.updateOwnership', { userId });
};

watch(clientRoomState, () => {
    syncRoom();
});

let syncPlayerInterval = null;

onMounted(() => {
    const { id } = router.currentRoute.value.params;
    ClientService.send('room.join', { id });
    
    syncPlayerInterval = setInterval(() => {
        if (playerState.value.video && !playerState.value.paused) {
            syncPlayer();
        }
    }, 1000);
});

onUnmounted(() => {
    clearInterval(syncPlayerInterval);
    syncPlayerInterval = null;
});

onBeforeRouteLeave(() => {
    store.commit('client/updateError', null);
});
</script>

<style lang="scss" scoped>
.room {
    display: flex;
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    width: 100%;
    user-select: none;

    &.chat-open {
        .users-list {
            display: none;
        }
    }

    .controls {
        z-index: 97;
        position: absolute;
        top: 0.75rem;
        right: 1rem;
    }
}

@media only screen and (min-width: 768px) and (min-height: 768px) {
    .room {
        &.chat-open {
            .users-list {
                display: inherit;
            }
        }
    }
}
</style>