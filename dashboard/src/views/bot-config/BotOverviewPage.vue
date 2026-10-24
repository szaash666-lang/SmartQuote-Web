<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { Bot, BrainCircuit, CheckCircle2, CircleAlert, RefreshCw } from '@lucide/vue';
import { useOnboardingStore } from '@/stores/onboarding';

const router = useRouter();
const onboarding = useOnboardingStore();

const headline = computed(() =>
  onboarding.completed
    ? '机器人已准备好，可以开始对话'
    : '先完成两项基础配置，再开始使用机器人',
);

onMounted(() => onboarding.check());
</script>

<template>
  <main class="bot-overview">
    <header class="bot-overview__header">
      <div>
        <h1>机器人配置概览</h1>
        <p>{{ headline }}</p>
      </div>
      <v-btn
        variant="text"
        color="primary"
        :loading="onboarding.checking"
        @click="onboarding.check"
      >
        <RefreshCw :size="17" class="mr-2" />
        重新检查
      </v-btn>
    </header>

    <section class="bot-overview__status" :class="{ complete: onboarding.completed }">
      <CheckCircle2 v-if="onboarding.completed" :size="24" />
      <CircleAlert v-else :size="24" />
      <div>
        <strong>{{ onboarding.completed ? '初始化完成' : '对话与工作台暂未解锁' }}</strong>
        <span>需要至少一个可用对话模型和一个消息平台。</span>
      </div>
      <v-btn v-if="onboarding.completed" color="primary" @click="router.push('/chat')">
        进入机器人对话
      </v-btn>
    </section>

    <div class="bot-overview__steps">
      <article>
        <div class="bot-overview__step-icon"><BrainCircuit :size="22" /></div>
        <div class="bot-overview__step-copy">
          <span>步骤 1</span>
          <h2>配置对话模型</h2>
          <p>连接模型提供商，并为当前机器人档案选择主对话模型。</p>
        </div>
        <span class="bot-overview__state" :class="{ done: onboarding.hasProvider }">
          {{ onboarding.hasProvider ? '已完成' : '待配置' }}
        </span>
        <v-btn variant="tonal" color="primary" @click="router.push('/bot-config/models')">
          管理模型
        </v-btn>
      </article>

      <article>
        <div class="bot-overview__step-icon"><Bot :size="22" /></div>
        <div class="bot-overview__step-copy">
          <span>步骤 2</span>
          <h2>接入消息平台</h2>
          <p>创建至少一个平台机器人，用于接收客户消息和询价资料。</p>
        </div>
        <span class="bot-overview__state" :class="{ done: onboarding.hasPlatform }">
          {{ onboarding.hasPlatform ? '已完成' : '待配置' }}
        </span>
        <v-btn variant="tonal" color="primary" @click="router.push('/bot-config/platforms')">
          管理平台
        </v-btn>
      </article>
    </div>

    <section class="bot-overview__note">
      <strong>配置作用域</strong>
      <p>当前机器人档案保存模型、人格、知识库和运行行为；提供商、平台、插件与系统能力属于全局共享资源。</p>
    </section>
  </main>
</template>

<style scoped>
.bot-overview {
  height: 100%;
  overflow-y: auto;
  padding: 28px 32px 48px;
  color: #0d183b;
}

.bot-overview__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding-bottom: 24px;
}

.bot-overview__header h1 {
  margin: 0 0 5px;
  font-size: 24px;
  letter-spacing: -0.025em;
}

.bot-overview__header p,
.bot-overview__step-copy p,
.bot-overview__note p {
  margin: 0;
  color: #6f7890;
  font-size: 14px;
}

.bot-overview__status {
  display: flex;
  align-items: center;
  gap: 14px;
  border: 1px solid #f0d7ae;
  border-radius: 10px;
  background: #fffaf0;
  padding: 17px 18px;
  color: #a86008;
}

.bot-overview__status.complete {
  border-color: #bfe5ce;
  background: #f3fbf6;
  color: #15804a;
}

.bot-overview__status > div {
  display: flex;
  flex: 1;
  flex-direction: column;
}

.bot-overview__status span {
  margin-top: 2px;
  color: #7a6d5c;
  font-size: 13px;
}

.bot-overview__steps {
  display: grid;
  gap: 14px;
  margin-top: 22px;
}

.bot-overview__steps article {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 18px;
  border: 1px solid #e5e9f2;
  border-radius: 10px;
  padding: 20px;
}

.bot-overview__step-icon {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border-radius: 9px;
  background: #eef2ff;
  color: #315cf4;
}

.bot-overview__step-copy > span {
  color: #7b8499;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
}

.bot-overview__step-copy h2 {
  margin: 2px 0 4px;
  font-size: 17px;
}

.bot-overview__state {
  border-radius: 999px;
  background: #fff3dc;
  padding: 5px 10px;
  color: #a8630a;
  font-size: 12px;
  font-weight: 650;
}

.bot-overview__state.done {
  background: #e8f7ee;
  color: #18804b;
}

.bot-overview__note {
  margin-top: 22px;
  border-left: 3px solid #315cf4;
  padding: 8px 0 8px 16px;
}

.bot-overview__note strong {
  display: block;
  margin-bottom: 4px;
  font-size: 14px;
}

:global(.v-theme--PurpleThemeDark .bot-overview) {
  color: rgb(var(--v-theme-on-surface));
}

:global(.v-theme--PurpleThemeDark .bot-overview__steps article) {
  border-color: rgba(255, 255, 255, 0.1);
}

@media (max-width: 700px) {
  .bot-overview {
    padding: 18px 14px 30px;
  }

  .bot-overview__header,
  .bot-overview__status {
    align-items: stretch;
    flex-direction: column;
  }

  .bot-overview__steps article {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .bot-overview__state,
  .bot-overview__steps .v-btn {
    grid-column: 2;
    justify-self: start;
  }
}
</style>
