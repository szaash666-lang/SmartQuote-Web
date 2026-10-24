<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { RouterView, useRoute, useRouter } from 'vue-router';
import { useDisplay } from 'vuetify';
import {
  Bot,
  Braces,
  Boxes,
  BrainCircuit,
  Clock3,
  CircleHelp,
  FileCog,
  Gauge,
  Library,
  MessagesSquare,
  Network,
  Palette,
  Puzzle,
  ScrollText,
  ShieldCheck,
  Sparkles,
  UserRound,
  Waypoints,
  Wrench,
} from '@lucide/vue';
import { useI18n } from '@/i18n/composables';
import { useBotProfileStore } from '@/stores/botProfile';

interface ConfigNavigationItem {
  key: string;
  labelKey: string;
  to: string;
  icon: any;
}

interface ConfigNavigationGroup {
  key: string;
  labelKey: string;
  items: ConfigNavigationItem[];
}

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const { smAndDown } = useDisplay();
const profileStore = useBotProfileStore();
const search = ref('');
const activeChild = ref<any>(null);

const groups: ConfigNavigationGroup[] = [
  {
    key: 'current',
    labelKey: 'core.navigation.pluginEdition.groups.current',
    items: [
      { key: 'overview', labelKey: 'core.navigation.pluginEdition.overview', to: '/bot-config/overview', icon: Gauge },
      { key: 'models', labelKey: 'core.navigation.pluginEdition.models', to: '/bot-config/models', icon: BrainCircuit },
      { key: 'runtime', labelKey: 'core.navigation.pluginEdition.runtime', to: '/bot-config/runtime', icon: FileCog },
    ],
  },
  {
    key: 'shared',
    labelKey: 'core.navigation.pluginEdition.groups.shared',
    items: [
      { key: 'platforms', labelKey: 'core.navigation.pluginEdition.platforms', to: '/bot-config/platforms', icon: Bot },
      { key: 'extensions', labelKey: 'core.navigation.pluginEdition.extensions', to: '/bot-config/extensions/plugins', icon: Puzzle },
      { key: 'mcp', labelKey: 'core.navigation.pluginEdition.mcp', to: '/bot-config/extensions/mcp', icon: Network },
      { key: 'skills', labelKey: 'core.navigation.pluginEdition.skills', to: '/bot-config/extensions/skills', icon: Sparkles },
      { key: 'components', labelKey: 'core.navigation.pluginEdition.components', to: '/bot-config/extensions/components', icon: Wrench },
      { key: 'personas', labelKey: 'core.navigation.pluginEdition.personas', to: '/bot-config/personas', icon: UserRound },
      { key: 'knowledge', labelKey: 'core.navigation.pluginEdition.knowledgeBase', to: '/bot-config/knowledge-base', icon: Library },
      { key: 'subagents', labelKey: 'core.navigation.pluginEdition.subagents', to: '/bot-config/subagents', icon: Boxes },
      { key: 'automation', labelKey: 'core.navigation.pluginEdition.automation', to: '/bot-config/automation', icon: Clock3 },
    ],
  },
  {
    key: 'system',
    labelKey: 'core.navigation.pluginEdition.groups.system',
    items: [
      { key: 'sessions', labelKey: 'core.navigation.pluginEdition.sessions', to: '/bot-config/sessions', icon: MessagesSquare },
      { key: 'conversations', labelKey: 'core.navigation.pluginEdition.conversations', to: '/bot-config/data/conversations', icon: MessagesSquare },
      { key: 'statistics', labelKey: 'core.navigation.pluginEdition.statistics', to: '/bot-config/data/statistics', icon: Gauge },
      { key: 'logs', labelKey: 'core.navigation.pluginEdition.logs', to: '/bot-config/data/logs', icon: ScrollText },
      { key: 'trace', labelKey: 'core.navigation.pluginEdition.trace', to: '/bot-config/data/trace', icon: Waypoints },
      { key: 'general', labelKey: 'core.navigation.pluginEdition.general', to: '/bot-config/system', icon: FileCog },
      { key: 'security', labelKey: 'core.navigation.pluginEdition.security', to: '/bot-config/system#settings-security', icon: ShieldCheck },
      { key: 'network', labelKey: 'core.navigation.pluginEdition.network', to: '/bot-config/system#settings-network', icon: Network },
      { key: 'appearance', labelKey: 'core.navigation.pluginEdition.appearance', to: '/bot-config/system#settings-appearance', icon: Palette },
      { key: 'maintenance', labelKey: 'core.navigation.pluginEdition.maintenance', to: '/bot-config/system#settings-maintenance', icon: Wrench },
      { key: 'openapi', labelKey: 'core.navigation.pluginEdition.openapi', to: '/bot-config/system#settings-openapi', icon: Braces },
      { key: 'about', labelKey: 'core.navigation.pluginEdition.about', to: '/bot-config/about', icon: CircleHelp },
    ],
  },
];

const filteredGroups = computed(() => {
  const keyword = search.value.trim().toLocaleLowerCase();
  if (!keyword) return groups;
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        t(item.labelKey).toLocaleLowerCase().includes(keyword),
      ),
    }))
    .filter((group) => group.items.length > 0);
});

const allItems = computed(() => groups.flatMap((group) => group.items));
const activeItem = computed(() => {
  const matches = allItems.value.filter(
    (item) => {
      const [path, hash = ''] = item.to.split('#');
      return (
        (route.path === path || route.path.startsWith(`${path}/`)) &&
        (!hash || route.hash === `#${hash}`)
      );
    },
  );
  return matches.sort((a, b) => b.to.length - a.to.length)[0] || allItems.value[0];
});

const profileItems = computed(() =>
  profileStore.profiles.map((profile) => ({
    title: profile.id === 'default' ? profile.name || '默认助手' : profile.name,
    subtitle: profile.id,
    value: profile.id,
  })),
);

const childProps = computed(() =>
  route.meta.profileEditor
    ? { initialConfigId: profileStore.activeProfileId, embedded: true }
    : {},
);

async function selectSection(path: string | null) {
  if (path && path !== route.path) await router.push(path);
}

async function selectProfile(profileId: string | null) {
  if (!profileId || profileId === profileStore.activeProfileId) return;
  const canSwitch = await activeChild.value?.beforeProfileChange?.(profileId);
  if (canSwitch === false) return;
  profileStore.select(profileId);
  await router.replace({
    path: route.path,
    query: { ...route.query, profile: profileId },
    hash: route.hash,
  });
}

async function restoreProfile(profileId: string) {
  profileStore.select(profileId);
  await router.replace({
    path: route.path,
    query: { ...route.query, profile: profileId },
    hash: route.hash,
  });
}

onMounted(async () => {
  await profileStore.load();
  const requestedProfile = String(route.query.profile || '');
  if (requestedProfile && profileStore.profiles.some((item) => item.id === requestedProfile)) {
    profileStore.select(requestedProfile);
  }
});

watch(
  () => route.query.profile,
  (profileId) => {
    const normalized = String(profileId || '');
    if (normalized && normalized !== profileStore.activeProfileId) {
      profileStore.select(normalized);
    }
  },
);
</script>

<template>
  <div class="bot-config-workspace">
    <aside v-if="!smAndDown" class="bot-config-directory">
      <div class="bot-config-directory__heading">
        <h1>{{ t('core.navigation.pluginEdition.workspaceTitle') }}</h1>
        <p>{{ t('core.navigation.pluginEdition.workspaceSubtitle') }}</p>
      </div>

      <label class="bot-config-directory__profile-label">
        {{ t('core.navigation.pluginEdition.currentProfile') }}
      </label>
      <v-select
        :model-value="profileStore.activeProfileId"
        :items="profileItems"
        item-title="title"
        item-value="value"
        density="compact"
        variant="outlined"
        hide-details
        :loading="profileStore.loading"
        @update:model-value="selectProfile"
      />

      <v-text-field
        v-model="search"
        class="bot-config-directory__search"
        density="compact"
        variant="outlined"
        prepend-inner-icon="mdi-magnify"
        :placeholder="t('core.navigation.pluginEdition.searchPlaceholder')"
        hide-details
        clearable
      />

      <nav class="bot-config-directory__groups" aria-label="Configuration">
        <section v-for="group in filteredGroups" :key="group.key">
          <div class="bot-config-directory__group-title">{{ t(group.labelKey) }}</div>
          <RouterLink
            v-for="item in group.items"
            :key="item.key"
            :to="item.to"
            class="bot-config-directory__item"
            :class="{ 'bot-config-directory__item--active': activeItem.key === item.key }"
          >
            <component :is="item.icon" :size="19" :stroke-width="1.8" />
            <span>{{ t(item.labelKey) }}</span>
          </RouterLink>
        </section>
      </nav>
    </aside>

    <div class="bot-config-content">
      <div v-if="smAndDown" class="bot-config-mobile-toolbar">
        <div>
          <strong>{{ t('core.navigation.pluginEdition.workspaceTitle') }}</strong>
          <span>{{ profileStore.activeProfile.name }}</span>
        </div>
        <v-select
          :model-value="activeItem.to"
          :items="allItems.map((item) => ({ title: t(item.labelKey), value: item.to }))"
          item-title="title"
          item-value="value"
          density="compact"
          variant="outlined"
          hide-details
          @update:model-value="selectSection"
        />
      </div>

      <RouterView v-slot="{ Component }">
        <component
          :is="Component"
          ref="activeChild"
          v-bind="childProps"
          @profile-switch-rejected="restoreProfile"
        />
      </RouterView>
    </div>
  </div>
</template>

<style scoped>
.bot-config-workspace {
  display: grid;
  width: 100%;
  height: 100%;
  min-height: 0;
  grid-template-columns: 312px minmax(0, 1fr);
  overflow: hidden;
  background: #fff;
  color: #0c173b;
}

.bot-config-directory {
  display: flex;
  min-height: 0;
  flex-direction: column;
  border-right: 1px solid #e5e9f2;
  background: #fff;
  padding: 22px 16px 18px;
}

.bot-config-directory__heading {
  padding: 0 6px 18px;
}

.bot-config-directory__heading h1 {
  margin: 0 0 3px;
  font-size: 23px;
  font-weight: 760;
  letter-spacing: -0.025em;
}

.bot-config-directory__heading p {
  margin: 0;
  color: #6f7891;
  font-size: 13px;
}

.bot-config-directory__profile-label {
  margin: 0 6px 7px;
  color: #5f6983;
  font-size: 12px;
  font-weight: 650;
}

.bot-config-directory__search {
  margin-top: 12px;
}

.bot-config-directory__groups {
  min-height: 0;
  margin-top: 14px;
  overflow-y: auto;
  scrollbar-width: none;
}

.bot-config-directory__groups::-webkit-scrollbar {
  display: none;
}

.bot-config-directory__groups section + section {
  margin-top: 12px;
  border-top: 1px solid #edf0f5;
  padding-top: 12px;
}

.bot-config-directory__group-title {
  padding: 0 10px 7px;
  color: #7b849a;
  font-size: 12px;
  font-weight: 650;
}

.bot-config-directory__item {
  display: flex;
  min-height: 42px;
  align-items: center;
  gap: 12px;
  border-radius: 8px;
  padding: 0 11px;
  color: #273453;
  font-size: 14px;
  font-weight: 540;
  text-decoration: none;
}

.bot-config-directory__item:hover {
  background: #f5f7fb;
}

.bot-config-directory__item--active {
  background: #eef2ff;
  color: #315cf4;
}

.bot-config-content {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: #fff;
}

.bot-config-content > :deep(*) {
  min-height: 0;
}

.bot-config-mobile-toolbar {
  display: grid;
  gap: 10px;
  border-bottom: 1px solid #e5e9f2;
  padding: 12px 14px;
}

.bot-config-mobile-toolbar > div {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.bot-config-mobile-toolbar strong {
  font-size: 18px;
}

.bot-config-mobile-toolbar span {
  color: #707990;
  font-size: 12px;
}

:global(.v-theme--PurpleThemeDark .bot-config-workspace),
:global(.v-theme--PurpleThemeDark .bot-config-directory),
:global(.v-theme--PurpleThemeDark .bot-config-content) {
  background: rgb(var(--v-theme-background));
  color: rgb(var(--v-theme-on-surface));
}

:global(.v-theme--PurpleThemeDark .bot-config-directory),
:global(.v-theme--PurpleThemeDark .bot-config-mobile-toolbar) {
  border-color: rgba(255, 255, 255, 0.1);
}

:global(.v-theme--PurpleThemeDark .bot-config-directory__item) {
  color: rgba(var(--v-theme-on-surface), 0.86);
}

:global(.v-theme--PurpleThemeDark .bot-config-directory__item--active) {
  background: rgba(var(--v-theme-primary), 0.16);
  color: rgb(var(--v-theme-primary));
}

@media (max-width: 959.98px) {
  .bot-config-workspace {
    display: block;
  }

  .bot-config-content {
    display: flex;
    height: 100%;
    flex-direction: column;
  }

  .bot-config-content > :deep(:last-child) {
    flex: 1;
    min-height: 0;
  }
}
</style>
