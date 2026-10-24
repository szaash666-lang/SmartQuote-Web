<script setup lang="ts">
import { computed, onMounted } from "vue";
import ProviderModelMenu from "@/components/chat/ProviderModelMenu.vue";
import { useChatHeaderStore } from "@/stores/chatHeader";
import { useBotProfileStore } from "@/stores/botProfile";

const chatHeader = useChatHeaderStore();
const profileStore = useBotProfileStore();
const title = computed(() => {
  const t = chatHeader.title.trim();
  const s = chatHeader.subtitle.trim();
  if (t && s) return `${s} / ${t}`;
  return t || s;
});

onMounted(() => profileStore.load());
</script>

<template>
  <div class="chat-toolbar-context">
    <v-menu location="bottom start" offset="8">
      <template #activator="{ props }">
        <button v-bind="props" type="button" class="bot-profile-trigger">
          <v-icon size="17" color="primary">mdi-robot-outline</v-icon>
          <span>{{ profileStore.activeProfile.name || profileStore.activeProfile.id }}</span>
          <v-icon size="16">mdi-chevron-down</v-icon>
        </button>
      </template>
      <v-card min-width="240" rounded="lg">
        <v-list density="compact" nav>
          <v-list-subheader>新对话默认机器人</v-list-subheader>
          <v-list-item
            v-for="profile in profileStore.profiles"
            :key="profile.id"
            :active="profile.id === profileStore.activeProfileId"
            :title="profile.name || profile.id"
            :subtitle="profile.id"
            rounded="lg"
            @click="profileStore.select(profile.id)"
          >
            <template #append>
              <v-icon v-if="profile.id === profileStore.activeProfileId" size="17" color="primary">mdi-check</v-icon>
            </template>
          </v-list-item>
        </v-list>
      </v-card>
    </v-menu>
    <ProviderModelMenu variant="header" />
    <span v-if="title" class="chat-toolbar-context-title">{{ title }}</span>
  </div>
</template>

<style scoped>
.chat-toolbar-context {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.bot-profile-trigger {
  display: inline-flex;
  height: 30px;
  max-width: 220px;
  align-items: center;
  gap: 7px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.14);
  border-radius: 8px;
  background: rgba(var(--v-theme-surface), 0.72);
  padding: 0 10px;
  color: rgb(var(--v-theme-on-surface));
  cursor: pointer;
}

.bot-profile-trigger span {
  overflow: hidden;
  font-size: 12px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Slim the trigger down so the selector and title stack inside the 40px band. */
.chat-toolbar-context :deep(.provider-select-menu) {
  height: 20px;
  display: flex;
}

.chat-toolbar-context :deep(.provider-trigger--header) {
  height: 20px;
}

.chat-toolbar-context :deep(.provider-trigger--header .provider-trigger-title) {
  font-size: 0.8125rem;
  line-height: 20px;
}

.chat-toolbar-context :deep(.provider-trigger--header .provider-trigger-chevron) {
  font-size: 16px;
}

.chat-toolbar-context-title {
  max-width: 20vw;
  color: rgba(var(--v-theme-on-surface), 0.62);
  font-size: 0.6875rem;
  font-weight: 500;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

@media (max-width: 700px) {
  .bot-profile-trigger {
    max-width: 130px;
  }

  .chat-toolbar-context-title {
    display: none;
  }
}
</style>
