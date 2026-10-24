<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useDisplay } from 'vuetify';
import { useI18n } from '@/i18n/composables';
import { useCommonStore } from '@/stores/common';
import ChatUILogo from '@/components/chat/ChatUILogo.vue';
import sidebarItems from './sidebarItem';

const route = useRoute();
const { smAndDown } = useDisplay();
const { t } = useI18n();
const commonStore = useCommonStore();

const botVersion = computed(() =>
  commonStore.astrbotVersion ? `v${commonStore.astrbotVersion}` : '',
);

function isActive(target?: string) {
  if (!target) return false;
  if (target === '/chat') {
    return route.path === '/chat' || route.path.startsWith('/chat/');
  }
  if (target.startsWith('/bot-config')) {
    return route.path.startsWith('/bot-config');
  }
  return route.path === target || route.path.startsWith(`${target}/`);
}
</script>

<template>
  <v-navigation-drawer
    v-if="!smAndDown"
    permanent
    app
    width="236"
    elevation="0"
    class="edition-primary-nav"
  >
    <div class="edition-primary-nav__brand" data-tauri-drag-region>
      <ChatUILogo class="edition-primary-nav__logo" />
      <span class="edition-primary-nav__name Outfit">AstrBot</span>
    </div>

    <nav class="edition-primary-nav__items" aria-label="Primary">
      <RouterLink
        v-for="item in sidebarItems"
        :key="item.to"
        :to="item.to || '/'"
        class="edition-primary-nav__item"
        :class="{ 'edition-primary-nav__item--active': isActive(item.to) }"
      >
        <component :is="item.icon" :size="22" :stroke-width="1.9" />
        <span>{{ t(item.title || '') }}</span>
      </RouterLink>
    </nav>

    <div v-if="botVersion" class="edition-primary-nav__version">
      {{ botVersion }} · Plugin Edition
    </div>
  </v-navigation-drawer>

  <nav v-else class="edition-mobile-nav" aria-label="Primary">
    <RouterLink
      v-for="item in sidebarItems"
      :key="item.to"
      :to="item.to || '/'"
      class="edition-mobile-nav__item"
      :class="{ 'edition-mobile-nav__item--active': isActive(item.to) }"
    >
      <component :is="item.icon" :size="21" :stroke-width="1.9" />
      <span>{{ t(item.title || '') }}</span>
    </RouterLink>
  </nav>
</template>

<style scoped>
.edition-primary-nav {
  border-right: 1px solid #e5e9f2 !important;
  background: #ffffff !important;
  color: #0b173c;
}

:global(.v-theme--PurpleThemeDark .edition-primary-nav) {
  border-right-color: rgba(255, 255, 255, 0.1) !important;
  background: rgb(var(--v-theme-surface)) !important;
  color: rgb(var(--v-theme-on-surface));
}

.edition-primary-nav :deep(.v-navigation-drawer__content) {
  display: flex;
  min-height: 0;
  flex-direction: column;
}

.edition-primary-nav__brand {
  display: flex;
  min-height: 76px;
  align-items: center;
  gap: 10px;
  padding: 14px 26px 8px;
}

.edition-primary-nav__logo {
  width: 24px;
  height: 24px;
}

.edition-primary-nav__name {
  font-size: 26px;
  font-weight: 800;
  letter-spacing: -0.025em;
}

.edition-primary-nav__items {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 18px 12px;
}

.edition-primary-nav__item {
  position: relative;
  display: flex;
  min-height: 58px;
  align-items: center;
  gap: 16px;
  border-radius: 10px;
  padding: 0 18px;
  color: #172348;
  font-size: 16px;
  font-weight: 560;
  text-decoration: none;
  transition: background-color 150ms ease, color 150ms ease;
}

.edition-primary-nav__item:hover {
  background: #f5f7fc;
}

.edition-primary-nav__item--active {
  background: #eef2ff;
  color: #315cf4;
}

.edition-primary-nav__item--active::before {
  position: absolute;
  top: 8px;
  bottom: 8px;
  left: -12px;
  width: 4px;
  border-radius: 0 4px 4px 0;
  background: #315cf4;
  content: '';
}

:global(.v-theme--PurpleThemeDark .edition-primary-nav__item) {
  color: rgba(var(--v-theme-on-surface), 0.88);
}

:global(.v-theme--PurpleThemeDark .edition-primary-nav__item:hover) {
  background: rgba(255, 255, 255, 0.06);
}

:global(.v-theme--PurpleThemeDark .edition-primary-nav__item--active) {
  background: rgba(var(--v-theme-primary), 0.16);
  color: rgb(var(--v-theme-primary));
}

.edition-primary-nav__version {
  margin-top: auto;
  padding: 18px 28px 22px;
  color: #8a93aa;
  font-size: 11px;
}

.edition-mobile-nav {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 1010;
  display: grid;
  height: calc(64px + env(safe-area-inset-bottom));
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border-top: 1px solid #e3e8f2;
  background: rgba(255, 255, 255, 0.97);
  padding: 5px 8px env(safe-area-inset-bottom);
  backdrop-filter: blur(16px);
}

:global(.v-theme--PurpleThemeDark .edition-mobile-nav) {
  border-top-color: rgba(255, 255, 255, 0.1);
  background: rgba(var(--v-theme-surface), 0.96);
}

.edition-mobile-nav__item {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 2px;
  border-radius: 9px;
  color: #6f7890;
  font-size: 11px;
  line-height: 1.2;
  text-decoration: none;
}

.edition-mobile-nav__item--active {
  color: #315cf4;
}

.edition-mobile-nav__item span {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
  .edition-primary-nav__item {
    transition: none;
  }
}
</style>
