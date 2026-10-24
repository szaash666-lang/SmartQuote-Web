<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import { BrainCircuit, DatabaseZap, Globe2, Save } from '@lucide/vue';
import { configProfileApi, pluginApi } from '@/api/v1';
import ProviderSelector from '@/components/shared/ProviderSelector.vue';
import UnsavedChangesConfirmDialog from '@/components/config/UnsavedChangesConfirmDialog.vue';
import ProviderPage from '@/views/ProviderPage.vue';
import { useBotProfileStore } from '@/stores/botProfile';

const RFQ_PLUGIN_ID = 'astrbot_plugin_rfq_assistant';

const profileStore = useBotProfileStore();
const loading = ref(false);
const saving = ref(false);
const profileConfig = ref<Record<string, any>>({});
const mainProviderId = ref('');
const analysisProviderId = ref('');
const pluginConfig = ref<Record<string, any>>({});
const pluginAvailable = ref(true);
const originalSnapshot = ref('');
const snackbar = ref({ show: false, color: 'success', message: '' });
const unsavedChangesDialog = ref<InstanceType<typeof UnsavedChangesConfirmDialog> | null>(null);

const activeProfileName = computed(
  () => profileStore.activeProfile.name || profileStore.activeProfile.id,
);
const isLocalRunner = computed(
  () => profileConfig.value?.agent_runner?.runner_type === 'local',
);
const currentSnapshot = computed(() =>
  JSON.stringify({
    mainProviderId: mainProviderId.value,
    analysisProviderId: analysisProviderId.value,
  }),
);
const dirty = computed(
  () => Boolean(originalSnapshot.value) && currentSnapshot.value !== originalSnapshot.value,
);

async function loadBindings() {
  loading.value = true;
  try {
    const profileResponse = await configProfileApi.get(profileStore.activeProfileId);
    const profilePayload = profileResponse.data.data as any;
    profileConfig.value = structuredClone(profilePayload?.config || profilePayload || {});
    mainProviderId.value = String(
      profileConfig.value?.agent_runner?.config?.model?.provider_id || '',
    );

    try {
      const pluginResponse = await pluginApi.config(RFQ_PLUGIN_ID);
      const pluginPayload = pluginResponse.data.data as any;
      pluginConfig.value = structuredClone(pluginPayload?.config || {});
      analysisProviderId.value = String(pluginConfig.value.analysis_provider_id || '');
      pluginAvailable.value = true;
    } catch {
      pluginConfig.value = {};
      analysisProviderId.value = '';
      pluginAvailable.value = false;
    }
    originalSnapshot.value = currentSnapshot.value;
  } catch (error: any) {
    snackbar.value = {
      show: true,
      color: 'error',
      message: error?.response?.data?.message || error?.message || '加载模型配置失败。',
    };
  } finally {
    loading.value = false;
  }
}

async function saveBindings() {
  if (!dirty.value || saving.value) return true;
  saving.value = true;
  try {
    if (!profileConfig.value.agent_runner) profileConfig.value.agent_runner = {};
    if (!profileConfig.value.agent_runner.config) profileConfig.value.agent_runner.config = {};
    if (!profileConfig.value.agent_runner.config.model) {
      profileConfig.value.agent_runner.config.model = {};
    }
    profileConfig.value.agent_runner.config.model.provider_id = mainProviderId.value;

    const profileResponse = await configProfileApi.update(
      profileStore.activeProfileId,
      profileConfig.value,
    );
    if (profileResponse.data.status !== 'ok') {
      throw new Error(profileResponse.data.message || '保存机器人档案失败。');
    }

    if (pluginAvailable.value) {
      pluginConfig.value.analysis_provider_id = analysisProviderId.value;
      const pluginResponse = await pluginApi.updateConfig(RFQ_PLUGIN_ID, pluginConfig.value);
      if (pluginResponse.data.status !== 'ok') {
        throw new Error(pluginResponse.data.message || '保存询价分析模型失败。');
      }
    }

    originalSnapshot.value = currentSnapshot.value;
    snackbar.value = { show: true, color: 'success', message: '模型绑定已保存。' };
    return true;
  } catch (error: any) {
    snackbar.value = {
      show: true,
      color: 'error',
      message: error?.response?.data?.message || error?.message || '保存模型配置失败。',
    };
    return false;
  } finally {
    saving.value = false;
  }
}

async function beforeProfileChange() {
  if (!dirty.value) return true;
  const confirmed = await unsavedChangesDialog.value?.open({
    title: '存在未保存的模型绑定',
    message: '切换机器人档案前，请选择保存、放弃或取消。',
    confirmHint: '保存并切换:确认',
    cancelHint: '放弃并切换:取消',
    closeHint: '留在当前档案:"x"',
  });
  if (confirmed === 'close') return false;
  if (confirmed) return saveBindings();
  originalSnapshot.value = currentSnapshot.value;
  return true;
}

defineExpose({ beforeProfileChange });

onBeforeRouteLeave(async () => (await beforeProfileChange()) !== false);
onMounted(loadBindings);
watch(() => profileStore.activeProfileId, loadBindings);
</script>

<template>
  <main class="bot-models">
    <header class="bot-models__header">
      <div>
        <h1>模型与提供商</h1>
        <p>分别管理当前机器人档案的模型绑定，以及所有机器人共享的提供商资源。</p>
      </div>
      <v-btn
        color="primary"
        :loading="saving"
        :disabled="loading || !dirty"
        @click="saveBindings"
      >
        <Save :size="17" class="mr-2" />
        保存更改
      </v-btn>
    </header>

    <v-progress-linear v-if="loading" indeterminate color="primary" />

    <section class="bot-models__bindings">
      <article class="binding-card">
        <div class="binding-card__icon"><BrainCircuit :size="22" /></div>
        <div class="binding-card__copy">
          <div class="binding-card__scope">当前档案</div>
          <h2>主对话模型</h2>
          <p>作用于“{{ activeProfileName }}”的新对话；已有对话保持原会话绑定。</p>
        </div>
        <ProviderSelector
          v-model="mainProviderId"
          provider-type="chat_completion"
        />
        <v-alert v-if="!isLocalRunner" type="info" variant="tonal" density="compact">
          当前档案未使用本地 Agent Runner，保存的主模型只在切换为本地运行后生效。
        </v-alert>
      </article>

      <article class="binding-card">
        <div class="binding-card__icon binding-card__icon--teal"><DatabaseZap :size="22" /></div>
        <div class="binding-card__copy">
          <div class="binding-card__scope">询价插件</div>
          <h2>RFQ 需求分析模型</h2>
          <p>只抽取询价字段，不生成产品、价格或匹配结论；其他插件配置会原样保留。</p>
        </div>
        <ProviderSelector
          v-if="pluginAvailable"
          v-model="analysisProviderId"
          provider-type="chat_completion"
        />
        <v-alert v-else type="warning" variant="tonal" density="compact">
          未检测到 RFQ 插件，安装并启用后即可单独绑定分析模型。
        </v-alert>
      </article>
    </section>

    <section class="bot-models__global">
      <div class="bot-models__global-heading">
        <div class="binding-card__icon binding-card__icon--neutral"><Globe2 :size="22" /></div>
        <div>
          <span>全局共享</span>
          <h2>提供商资源</h2>
          <p>密钥、接口地址和可用模型由所有机器人档案共享。</p>
        </div>
      </div>
      <div class="bot-models__provider-page">
        <ProviderPage default-tab="chat_completion" />
      </div>
    </section>

    <UnsavedChangesConfirmDialog ref="unsavedChangesDialog" />
    <v-snackbar
      v-model="snackbar.show"
      :color="snackbar.color"
      :timeout="3200"
      location="top"
    >
      {{ snackbar.message }}
    </v-snackbar>
  </main>
</template>

<style scoped>
.bot-models {
  height: 100%;
  overflow-y: auto;
  padding: 26px 30px 48px;
  color: #0c173b;
}

.bot-models__header,
.bot-models__global-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}

.bot-models__header h1,
.bot-models__global-heading h2 {
  margin: 0;
  font-size: 24px;
  letter-spacing: -0.025em;
}

.bot-models__header p,
.bot-models__global-heading p,
.binding-card__copy p {
  margin: 5px 0 0;
  color: #70798e;
  font-size: 13px;
}

.bot-models__bindings {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin: 22px 0;
}

.binding-card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
  gap: 14px;
  border: 1px solid #e4e8f1;
  border-radius: 10px;
  background: #fff;
  padding: 18px;
}

.binding-card > .provider-select-menu,
.binding-card > .v-alert {
  grid-column: 1 / -1;
}

.binding-card__icon {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border-radius: 9px;
  background: #eef2ff;
  color: #315cf4;
}

.binding-card__icon--teal {
  background: #e9faf7;
  color: #087f6d;
}

.binding-card__icon--neutral {
  flex: 0 0 auto;
  background: #f0f2f6;
  color: #4e5b75;
}

.binding-card__scope,
.bot-models__global-heading span {
  color: #315cf4;
  font-size: 11px;
  font-weight: 750;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.binding-card__copy h2 {
  margin: 2px 0 0;
  font-size: 17px;
}

.bot-models__global {
  overflow: hidden;
  border: 1px solid #e4e8f1;
  border-radius: 10px;
  background: #fff;
}

.bot-models__global-heading {
  justify-content: flex-start;
  border-bottom: 1px solid #e8ebf2;
  padding: 18px 20px;
}

.bot-models__global-heading h2 {
  margin-top: 1px;
  font-size: 18px;
}

.bot-models__provider-page {
  min-height: 560px;
}

:global(.v-theme--PurpleThemeDark .bot-models) {
  color: rgb(var(--v-theme-on-surface));
}

:global(.v-theme--PurpleThemeDark .binding-card),
:global(.v-theme--PurpleThemeDark .bot-models__global) {
  border-color: rgba(255, 255, 255, 0.11);
  background: rgb(var(--v-theme-surface));
}

@media (max-width: 900px) {
  .bot-models {
    padding: 18px 14px 30px;
  }

  .bot-models__header,
  .bot-models__bindings {
    grid-template-columns: 1fr;
  }

  .bot-models__header {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
