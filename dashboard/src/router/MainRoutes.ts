import type { RouteLocationNormalized } from 'vue-router';
import {
  EXTENSION_DETAILS_ROUTE_NAME,
  EXTENSION_ROUTE_NAME,
} from './routeConstants.mjs';

const preserveLocation = (path: string) => (to: RouteLocationNormalized) => ({
  path,
  query: to.query,
  hash: to.hash,
});

const redirectToDataTab = (name: string) => (to: RouteLocationNormalized) => ({
  name,
  query: to.query,
  hash: to.hash,
});

const MainRoutes = {
  path: '/main',
  meta: { requiresAuth: true },
  redirect: '/chat',
  component: () => import('@/layouts/full/FullLayout.vue'),
  children: [
    {
      name: 'MainPage',
      path: '/',
      redirect: preserveLocation('/chat'),
    },
    {
      name: 'Chat',
      path: '/chat',
      component: () => import('@/views/ChatPage.vue'),
      meta: { requiresOnboarding: true },
      children: [
        {
          path: 'models',
          redirect: '/bot-config/models',
        },
        {
          path: ':conversationId',
          name: 'ChatDetail',
          component: () => import('@/views/ChatPage.vue'),
          props: true,
          meta: { requiresOnboarding: true },
        },
      ],
    },
    {
      path: '/bot-config',
      component: () => import('@/views/bot-config/BotConfigWorkspacePage.vue'),
      redirect: '/bot-config/overview',
      children: [
        {
          name: 'BotConfigOverview',
          path: 'overview',
          component: () => import('@/views/bot-config/BotOverviewPage.vue'),
        },
        {
          name: 'BotConfigModels',
          path: 'models',
          component: () => import('@/views/bot-config/BotModelsPage.vue'),
        },
        {
          name: 'Configs',
          path: 'runtime',
          component: () => import('@/views/ConfigPage.vue'),
          meta: { profileEditor: true },
        },
        {
          name: 'Platforms',
          path: 'platforms',
          component: () => import('@/views/PlatformPage.vue'),
        },
        {
          path: 'extensions',
          component: () => import('@/views/extension/PluginWorkspacePage.vue'),
          children: [
            { path: '', redirect: { name: EXTENSION_ROUTE_NAME } },
            {
              name: EXTENSION_ROUTE_NAME,
              path: 'plugins',
              component: () => import('@/views/ExtensionPage.vue'),
              props: { initialTab: 'installed' },
              meta: { extensionTab: 'installed', pluginView: 'installed' },
            },
            {
              name: 'ExtensionMarketplace',
              path: 'plugins/market',
              component: () => import('@/views/ExtensionPage.vue'),
              props: { initialTab: 'market' },
              meta: { extensionTab: 'installed', pluginView: 'market' },
            },
            {
              name: 'ExtensionMarketDetails',
              path: 'plugins/market/:pluginId',
              component: () => import('@/views/ExtensionPage.vue'),
              props: { initialTab: 'market' },
              meta: { extensionTab: 'installed', pluginView: 'market' },
            },
            {
              name: EXTENSION_DETAILS_ROUTE_NAME,
              path: 'plugins/:pluginId',
              component: () => import('@/views/ExtensionPage.vue'),
              props: { initialTab: 'installed' },
              meta: { extensionTab: 'installed', pluginView: 'installed' },
            },
            {
              name: 'ExtensionMcp',
              path: 'mcp',
              component: () => import('@/views/extension/McpServersPage.vue'),
              meta: { extensionTab: 'mcp' },
            },
            {
              name: 'ExtensionSkills',
              path: 'skills',
              component: () => import('@/views/extension/SkillsPage.vue'),
              meta: { extensionTab: 'skills' },
            },
            {
              name: 'ExtensionComponents',
              path: 'components',
              component: () => import('@/views/extension/ComponentsPage.vue'),
              meta: { extensionTab: 'components' },
            },
            {
              name: 'PluginView',
              path: 'view/:pluginName/:pageName',
              component: () => import('@/views/PluginViewPage.vue'),
              meta: { extensionTab: 'installed' },
            },
          ],
        },
        {
          name: 'Persona',
          path: 'personas',
          component: () => import('@/views/PersonaPage.vue'),
        },
        {
          path: 'knowledge-base',
          component: () => import('@/views/knowledge-base/index.vue'),
          children: [
            {
              path: '',
              name: 'NativeKBList',
              component: () => import('@/views/knowledge-base/KBList.vue'),
            },
            {
              path: ':kbId',
              name: 'NativeKBDetail',
              component: () => import('@/views/knowledge-base/KBDetail.vue'),
              props: true,
            },
            {
              path: ':kbId/document/:docId',
              name: 'NativeDocumentDetail',
              component: () => import('@/views/knowledge-base/DocumentDetail.vue'),
              props: true,
            },
          ],
        },
        {
          name: 'SubAgent',
          path: 'subagents',
          component: () => import('@/views/SubAgentPage.vue'),
        },
        {
          name: 'CronJobs',
          path: 'automation',
          component: () => import('@/views/CronJobPage.vue'),
        },
        {
          name: 'SessionManagement',
          path: 'sessions',
          component: () => import('@/views/SessionManagementPage.vue'),
        },
        {
          name: 'Data',
          path: 'data',
          component: () => import('@/views/DataPage.vue'),
          redirect: (to: RouteLocationNormalized) => {
            const lastTab = localStorage.getItem('data_last_tab');
            return redirectToDataTab(
              lastTab && ['Stats', 'Conversation', 'Console', 'Trace'].includes(lastTab)
                ? lastTab
                : 'Stats',
            )(to);
          },
          children: [
            {
              name: 'Stats',
              path: 'statistics',
              component: () => import('@/views/stats/StatsPage.vue'),
              meta: { dataTab: 'statistics' },
            },
            {
              name: 'Conversation',
              path: 'conversations',
              component: () => import('@/views/conversation/ConversationWorkspacePage.vue'),
              meta: { dataTab: 'conversations' },
            },
            {
              name: 'ConversationLegacy',
              path: 'conversations/legacy',
              component: () => import('@/views/conversation/LegacyConversationPage.vue'),
              meta: { dataTab: 'conversations' },
            },
            {
              name: 'Console',
              path: 'logs',
              component: () => import('@/views/ConsolePage.vue'),
              meta: { dataTab: 'logs' },
            },
            {
              name: 'Trace',
              path: 'trace',
              component: () => import('@/views/TracePage.vue'),
              meta: { dataTab: 'trace' },
            },
          ],
        },
        {
          name: 'Settings',
          path: 'system',
          component: () => import('@/views/Settings.vue'),
        },
        {
          name: 'About',
          path: 'about',
          component: () => import('@/views/AboutPage.vue'),
        },
      ],
    },
    {
      name: 'RfqWorkbench',
      path: '/workbench/:caseId?',
      component: () => import('@/views/rfq/RfqWorkbenchPage.vue'),
      props: true,
      meta: { requiresOnboarding: true },
    },

    // Legacy routes remain as redirects so bookmarks and plugin links keep working.
    { path: '/welcome', redirect: preserveLocation('/bot-config/overview') },
    { path: '/dashboard/default', redirect: preserveLocation('/chat') },
    { path: '/platforms', redirect: preserveLocation('/bot-config/platforms') },
    { path: '/providers', redirect: preserveLocation('/bot-config/models') },
    { path: '/config', redirect: preserveLocation('/bot-config/runtime') },
    { path: '/normal', redirect: preserveLocation('/bot-config/runtime') },
    { path: '/system', redirect: preserveLocation('/bot-config/system') },
    { path: '/settings', redirect: preserveLocation('/bot-config/system') },
    { path: '/about', redirect: preserveLocation('/bot-config/about') },
    { path: '/persona', redirect: preserveLocation('/bot-config/personas') },
    { path: '/subagent', redirect: preserveLocation('/bot-config/subagents') },
    { path: '/cron', redirect: preserveLocation('/bot-config/automation') },
    { path: '/session-management', redirect: preserveLocation('/bot-config/sessions') },
    { path: '/knowledge-base', redirect: preserveLocation('/bot-config/knowledge-base') },
    { path: '/alkaid/knowledge-base', redirect: preserveLocation('/bot-config/knowledge-base') },
    { path: '/data', redirect: preserveLocation('/bot-config/data') },
    { path: '/conversation', redirect: redirectToDataTab('Conversation') },
    { path: '/console', redirect: redirectToDataTab('Console') },
    { path: '/trace', redirect: redirectToDataTab('Trace') },
    { path: '/observability', redirect: redirectToDataTab('Stats') },
    {
      path: '/extension',
      redirect: (to: RouteLocationNormalized) => {
        const legacyTab = String(to.hash || '').replace(/^#/, '');
        const paths: Record<string, string> = {
          market: '/bot-config/extensions/plugins/market',
          mcp: '/bot-config/extensions/mcp',
          skills: '/bot-config/extensions/skills',
          components: '/bot-config/extensions/components',
        };
        return { path: paths[legacyTab] || '/bot-config/extensions/plugins', query: to.query };
      },
    },
    { path: '/extension/market', redirect: preserveLocation('/bot-config/extensions/plugins/market') },
    {
      path: '/extension/market/:pluginId',
      redirect: (to: RouteLocationNormalized) => ({
        name: 'ExtensionMarketDetails',
        params: { pluginId: to.params.pluginId },
        query: to.query,
      }),
    },
    {
      path: '/extension/:pluginId',
      redirect: (to: RouteLocationNormalized) => ({
        name:
          String(to.hash || '').replace(/^#/, '') === 'market'
            ? 'ExtensionMarketDetails'
            : EXTENSION_DETAILS_ROUTE_NAME,
        params: { pluginId: to.params.pluginId },
        query: to.query,
        hash: to.hash === '#plugin-components' ? to.hash : '',
      }),
    },
    { path: '/extension-marketplace', redirect: preserveLocation('/bot-config/extensions/plugins/market') },
    {
      path: '/plugin-view/:pluginName/:pageName',
      redirect: (to: RouteLocationNormalized) => {
        if (
          to.params.pluginName === 'astrbot_plugin_rfq_assistant' &&
          to.params.pageName === 'workbench'
        ) {
          return { path: '/workbench', query: to.query };
        }
        return { name: 'PluginView', params: to.params, query: to.query };
      },
    },
    {
      path: '/plugin-page/:pluginName/:pageName',
      redirect: (to: RouteLocationNormalized) => ({
        path: `/plugin-view/${String(to.params.pluginName)}/${String(to.params.pageName)}`,
        query: to.query,
      }),
    },
  ],
};

export default MainRoutes;
