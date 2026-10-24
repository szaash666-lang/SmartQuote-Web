/**
 * 独立预览入口。
 *
 * 只用于本地开发预览本页面，不接入路由 / i18n / Pinia，
 * 因此无需启动后端，也不会触碰主工作台或路由配置。
 */
import { createApp } from 'vue';
import vuetify from '@/plugins/vuetify';
import SalesAnalyticsPage from './SalesAnalyticsPage.vue';

createApp(SalesAnalyticsPage).use(vuetify).mount('#app');
