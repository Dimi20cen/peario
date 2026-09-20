<template>
    <div class="home">
        <div class="title">
            <ATitle translate="views.home.title"/>
            <ATitle type="tertiary">
                <i18n-t keypath="views.home.sub" tag="span">
                    <ALink href="https://stremio.com">Stremio</ALink>
                </i18n-t>
            </ATitle>
        </div>

        <AButton large icon="play" @click="goToSearch()">
            {{ $t('views.home.button') }}
        </AButton>

        <div class="join">
            <ATitle type="tertiary">{{ $t('views.home.join.title') }}</ATitle>

            <form class="join-form" @submit.prevent="joinRoom()">
                <TextInput
                    large
                    v-model="roomCode"
                    :placeholder="$t('views.home.join.placeholder')"
                />
                <AButton large icon="arrow-forward" type="submit" :disabled="!roomCode.trim()"/>
            </form>
        </div>
    </div>
</template>

<script setup>
import { ref } from 'vue';
import router from '@/router';

import ATitle from '@/components/ui/Title.vue';
import ALink from '@/components/ui/Link.vue';
import AButton from '@/components/ui/Button.vue';
import TextInput from '@/components/ui/TextInput.vue';

const roomCode = ref('');

const goToSearch = () => router.push({ name: 'search' });

const joinRoom = () => {
    const id = roomCode.value.trim();
    if (!id) return;

    router.push({ name: 'room', params: { id } });
};
</script>

<style lang="scss" scoped>
.home {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 45px;

    .title {
        display: flex;
        flex-direction: column;
        gap: 15px;
    }

    .join {
        display: flex;
        flex-direction: column;
        gap: 15px;

        .join-form {
            display: flex;
            gap: 10px;

            :deep(input) {
                flex: 1;
                min-width: 0;
                text-transform: uppercase;
            }

            :deep(button.large) {
                flex: none;
                width: auto;
                padding: 0 25px;
            }
        }
    }
}
</style>