import { defineStore } from 'pinia';
import { configProfileApi } from '@/api/v1';
import {
  getStoredSelectedChatConfigId,
  setStoredSelectedChatConfigId,
} from '@/utils/chatConfigBinding';

export interface BotProfileSummary {
  id: string;
  name: string;
}

export const useBotProfileStore = defineStore('botProfile', {
  state: () => ({
    profiles: [] as BotProfileSummary[],
    activeProfileId: getStoredSelectedChatConfigId(),
    loading: false,
    loaded: false,
  }),
  getters: {
    activeProfile(state): BotProfileSummary {
      return (
        state.profiles.find((profile) => profile.id === state.activeProfileId) || {
          id: state.activeProfileId,
          name: state.activeProfileId,
        }
      );
    },
  },
  actions: {
    async load() {
      if (this.loading) return;
      this.loading = true;
      try {
        const response = await configProfileApi.list();
        this.profiles = (response.data.data?.info_list || []).map((profile: any) => ({
          id: String(profile.id || ''),
          name: String(profile.name || profile.id || ''),
        }));
        if (!this.profiles.some((profile) => profile.id === this.activeProfileId)) {
          this.activeProfileId = this.profiles[0]?.id || 'default';
          setStoredSelectedChatConfigId(this.activeProfileId);
        }
        this.loaded = true;
      } finally {
        this.loading = false;
      }
    },
    select(profileId: string) {
      const normalized = profileId.trim() || 'default';
      this.activeProfileId = normalized;
      setStoredSelectedChatConfigId(normalized);
    },
  },
});
