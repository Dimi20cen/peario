import { createApp } from 'vue';
import { createMetaManager } from 'vue-meta'
import { createI18n } from 'vue-i18n';
import Toaster from '@meforma/vue-toaster';
import IoniconsPlugin from './plugins/ionicons';
import App from './App.vue';
import router from './router';
import store from './store';
import locales from './common/locales';
import toTimer from './directives/toTimer';
import LogService from './services/log.service';

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: locales
});

window.addEventListener('error', ({ message, filename, lineno }) => LogService.error('uncaught error', { message, source: `${filename}:${lineno}` }));
window.addEventListener('unhandledrejection', ({ reason }) => {
  // play() interrupted by a pause (e.g. the room holding for someone) is expected, not an error.
  if (reason && reason.name === 'AbortError') return;
  LogService.error('unhandled promise rejection', { reason: (reason && reason.message) || String(reason) });
});

const app = createApp(App);
app.config.errorHandler = (error, _, info) => LogService.error('app error', { error: error && (error.stack || error.message), info });

app
  .use(i18n)
  .use(createMetaManager())
  .use(Toaster, {
    position: 'bottom',
    duration: 3000
  })
  .use(IoniconsPlugin)
  .directive('to-timer', toTimer)
  .use(router)
  .use(store)
  .mount('#app');
