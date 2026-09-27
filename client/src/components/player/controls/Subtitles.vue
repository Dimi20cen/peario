<template>
    <div id="subtitles-control">
        <ion-icon name="chatbox-ellipses-outline" v-show="!activePanel" @click="togglePanel"></ion-icon>
        <ion-icon name="chatbox-ellipses" v-show="activePanel" @click="togglePanel"></ion-icon>

        <transition name="fade">
            <div class="panel" v-if="activePanel">
                <div class="bar">
                    <div class="toggle" @click="subtitles.active = !subtitles.active">
                        <div v-show="subtitles.active" class="status">
                            <ion-icon name="toggle"></ion-icon> On
                        </div>
                        <div v-show="!subtitles.active" class="status">
                            <ion-icon name="toggle-outline" class="flip"></ion-icon> Off
                        </div>
                    </div>

                    <List class="sizes" small v-model="subtitles.size" :items="sizes">
                        <template #left>
                            <ion-icon name="text-outline"></ion-icon>
                        </template>
                    </List>
                </div>

                <div class="loading" v-if="loading">
                    <ion-icon name="sync-outline" class="spin"></ion-icon>
                </div>

                <div class="loading" v-else-if="!langs.length">
                    {{ $t('components.player.noSubtitles') }}
                </div>

                <div class="lists" v-else>
                    <List class="langs" small v-model="panelLang" :items="langs" itemKey="key">
                        <template #left="{ item }">
                            {{ item.name }}
                        </template>
                    </List>
                    <List class="subs" small v-model="subtitles.current" :items="filterSubs()" itemKey="id" @click="pickedByHand = true">
                        <template #left="{ item, index }">
                            <div class="variant">
                                <div class="name">{{ item.label || `${$t(`components.player.subtitle`)} ${ index + 1 }` }}</div>
                                <div class="source">{{ sourceName(item) }}</div>
                            </div>
                        </template>
                    </List>
                </div>
            </div>
        </transition>
    </div>
</template>

<script>
import { where } from 'langs';
import { mapGetters } from 'vuex';
import List from '@/components/ui/List.vue';
import StremioService from '@/services/stremio.service';
import AddonService from '@/services/addon.service';

// OpenSubtitles' own codes for regional variants, which aren't in the standard lists.
const REGIONAL_LANGUAGES = {
    pob: { key: 'pt-BR', name: 'Português (Brasil)' },
    pom: { key: 'pt-MZ', name: 'Português (Moçambique)' },
    spl: { key: 'es-419', name: 'Español (Latinoamérica)' },
    spn: { key: 'es-ES', name: 'Español (España)' },
    zht: { key: 'zh-TW', name: '中文 (繁體)' },
    zhe: { key: 'zh-bilingual', name: '中文 (双语)' },
    ze: { key: 'zh-bilingual', name: '中文 (双语)' },
};

// Sources send either the 2-letter (e.g. "en"), 3-letter (e.g. "eng") or
// regional (e.g. "en-GB") form; they all map to one key so each language is listed once.
const languageOf = code => {
    const raw = (code || '').trim();
    if (raw === 'user') return { key: 'user', name: 'User' };
    if (REGIONAL_LANGUAGES[raw.toLowerCase()]) return REGIONAL_LANGUAGES[raw.toLowerCase()];

    const [base, region] = raw.split(/[-_]/);
    const found = base && ['1', '2', '2B', '2T', '3'].map(type => where(type, base.toLowerCase())).find(language => language);
    // Never render a blank, unpickable entry for a missing or unrecognized code.
    if (!found) return { key: raw || 'und', name: raw && raw !== 'und' ? raw : 'Unknown' };

    return region
        ? { key: `${found['1']}-${region.toUpperCase()}`, name: `${found.local} (${region.toUpperCase()})` }
        : { key: found['1'], name: found.local };
};

export default {
    name: 'SubtitlesControl',
    components: {
        List
    },
    props: {
        videoUrl: String,
        meta: Object,
        userSubtitle: File
    },
    computed: {
        sizes() {
            return [
                'small',
                'medium',
                'large'
            ];
        },
        ...mapGetters(['installedSubtitles', 'subtitles'])
    },
    data() {
        return {
            activePanel: false,
            panelLang: null,
            list: [],
            localeLang: (this.$i18n && this.$i18n.locale) || 'en',
            langs: [],
            loading: true,
            // Once someone picks a subtitle, sources that answer later don't change it.
            pickedByHand: false
        };
    },
    watch: {
        list() {
            this.langs = this.extractLangs(this.list);

            if (!this.list.length) {
                this.panelLang = null;
                return;
            }

            const keep = this.pickedByHand && this.list.includes(this.subtitles.current);
            // The track inside the file is made for this exact video, so it's the best default.
            const inLocale = this.list.filter(s => languageOf(s.lang).key.startsWith(this.localeLang));
            const current = keep ? this.subtitles.current : inLocale.find(s => s.embedded) || inLocale[0] || this.list[0];

            this.panelLang = this.langs.find(({ key }) => key === languageOf(current.lang).key);
            if (current !== this.subtitles.current) this.$store.dispatch('updateCurrent', current);
        },
        'subtitles.active'(state) {
            this.$store.dispatch('updateActive', state);
        },
        'subtitles.current'(state) {
            this.$store.dispatch('updateCurrent', state);
        },
        'subtitles.size'(state) {
            this.$store.dispatch('updateSize', state);
        },
        userSubtitle(file) {
            const reader = new FileReader();
            reader.readAsText(file, 'ASCII');
            reader.addEventListener('load', () => {
                const userIndex = this.list.filter(({ lang }) => lang === 'user').length;

                const subtitle = {
                    id: `user-${userIndex}`,
                    lang: 'user',
                    label: file.name,
                    data: reader.result
                };

                this.$store.dispatch('updateCurrent', subtitle);
                this.pickedByHand = true;
                this.list = [
                    subtitle,
                    ...this.list
                ];
            });
        },
        installedSubtitles() {
            this.fetchSubtitles();
        }
    },
    methods: {
        togglePanel() {
            this.activePanel = !this.activePanel;
        },
        fetchSubtitles() {
            this.loading = true;

            // For a series, `id` is the whole show; subtitles are listed per episode.
            const id = this.meta.videoId || this.meta.id;

            const addToList = subtitles => {
                const known = new Set(this.list.map(({ url, id }) => url || id));
                this.list = [...this.list, ...subtitles.filter(({ url, id }) => !known.has(url || id))];
            };

            const embeddedFetch = StremioService.getEmbeddedSubtitles(this.videoUrl)
                .then(embeddedSubtitles => addToList(embeddedSubtitles));

            const stremioFetch = StremioService.getSubtitles({
                type: this.meta.type,
                id,
                url: this.videoUrl,
            }).then(stremioSubtitles => addToList(stremioSubtitles));

            const addonFetches = this.installedSubtitles
                .map(addon => AddonService.getSubtitles([addon], this.meta.type, id)
                .then(addonsSubtitles => addToList(addonsSubtitles)));

            Promise.all([embeddedFetch, stremioFetch, ...addonFetches]).finally(() => {
                this.loading = false;
            });
        },
        filterSubs() {
            if (!this.panelLang) return [];
            // Tracks inside the video first: they're timed for this exact file.
            return this.list
                .filter(s => languageOf(s.lang).key === this.panelLang.key)
                .sort((a, b) => !!b.embedded - !!a.embedded);
        },
        sourceName(subtitle) {
            if (subtitle.embedded) return this.$t('components.player.embedded');
            if (subtitle.lang === 'user') return this.$t('components.player.yourFile');
            return subtitle.source || '';
        },
        extractLangs(list) {
            const rank = ({ key }) => key === 'user' ? 0 : key.startsWith(this.localeLang) ? 1 : 2;
            return list
                    .map(({ lang }) => languageOf(lang))
                    .filter((language, i, self) => i === self.findIndex(({ key }) => key === language.key))
                    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
        }
    },
    mounted() {
        this.$store.dispatch('updateSize', this.sizes[1]);
        this.fetchSubtitles();
    }
}
</script>

<style lang="scss" scoped>
#subtitles-control {
    .panel {
        position: fixed;
        bottom: $player-controls-height;
        right: 0;
        height: 300px;
        width: 100%;
        display: flex;
        flex-direction: column;
        border-radius: 10px;
        font-size: 15px;
        overflow: hidden;
        background-color: rgba($primary-color, 0.8);
        backdrop-filter: blur(10px);
        cursor: default;

        .bar {
            flex: none;
            height: 4rem;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding-left: 10px;
            padding-right: 20px;
            font-size: 20px;

            .toggle {
                height: 100%;
                display: grid;
                align-items: center;
                padding: 0 10px;
                cursor: pointer;

                .status {
                    display: flex;
                    align-items: center;

                    ion-icon {
                        margin-right: 10px;
                    }
                }
            }
        }

        .loading {
            top: 4rem;
            position: absolute;
            height: calc(100% - 4rem);
            width: 100%;
            display: grid;
            place-items: center;
            font-size: 30px;
        }

        .lists {
            display: flex;
            flex-direction: row;
            justify-content: space-between;
            padding: 0 5px;
            overflow: hidden;

            .list {
                flex: 0 1 50%;
                height: 100%;
                padding: 0 10px;
                padding-bottom: 10px;

                :deep(.item) {
                    padding: 0.75em 1em;
                }

                &:first-child .item div:last-child {
                    font-family: 'Montserrat-SemiBold' !important;
                }

                .variant {
                    min-width: 0;

                    .name {
                        overflow: hidden;
                        white-space: nowrap;
                        text-overflow: ellipsis;
                    }

                    .source {
                        margin-top: 0.2em;
                        font-size: 0.8em;
                        opacity: 0.6;
                    }
                }
            }
        }
    }
}

@media only screen and (orientation: landscape) {
    .panel {
        height: 230px !important;
        width: 45% !important;
    }
}

@media only screen and (min-width: 768px) and (min-height: 768px) {
    .panel {
        position: absolute !important;
        height: 300px !important;
        width: 400px !important;
        bottom: calc(#{$player-controls-height} + 2em) !important;
    }
}
</style>

<style lang="scss">
.panel {
    .bar {
        .sizes {
            display: flex;
            flex-direction: row;

            .item {
                font-size: 20px;
                --ionicon-stroke-width: 40px;

                &:first-child {
                    font-size: 13px;
                    --ionicon-stroke-width: 30px;
                }

                &:last-child {
                    font-size: 25px;
                    --ionicon-stroke-width: 60px;
                }
            }
        }
    }
}
</style>