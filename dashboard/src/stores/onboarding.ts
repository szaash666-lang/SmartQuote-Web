import { defineStore } from 'pinia';
import { providerApi, systemConfigApi } from '@/api/v1';

export const useOnboardingStore = defineStore('onboarding', {
  state: () => ({
    completed: null as boolean | null,
    checking: false,
    hasPlatform: false,
    hasProvider: false,
  }),
  actions: {
    async check() {
      if (this.checking) return this.completed === true;
      this.checking = true;
      try {
        const [systemResponse, providerResponse] = await Promise.all([
          systemConfigApi.get(),
          providerApi.schema(),
        ]);
        const systemConfig = (systemResponse.data.data as any)?.config || {};
        this.hasPlatform =
          Array.isArray(systemConfig.platform) &&
          systemConfig.platform.some((platform: any) => platform?.enable !== false);

        const payload = providerResponse.data.data || {};
        const providers = (payload as any).providers || [];
        const sources = (payload as any).provider_sources || [];
        const sourceTypes = new Map(
          sources.map((source: any) => [source.id, source.provider_type]),
        );
        this.hasProvider = providers.some((provider: any) => {
          const providerType =
            provider.provider_type || sourceTypes.get(provider.provider_source_id) || provider.type;
          return provider.enable !== false && String(providerType || '').includes('chat_completion');
        });
        this.completed = this.hasPlatform && this.hasProvider;
      } catch (error) {
        console.error('Failed to check onboarding state:', error);
        this.completed = false;
      } finally {
        this.checking = false;
      }
      return this.completed === true;
    },
  },
});
