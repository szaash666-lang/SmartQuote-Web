<template>
  <section class="detail-shell">
    <header class="detail-shell__head">
      <v-btn variant="tonal" size="small" @click="back">
        <ArrowLeft :size="16" class="mr-1" />{{ backLabel }}
      </v-btn>
      <div class="detail-shell__title">
        <h2>{{ title }}</h2>
        <p v-if="subtitle">{{ subtitle }}</p>
      </div>
      <div class="detail-shell__actions"><slot name="actions" /></div>
    </header>
    <div class="detail-shell__body"><slot /></div>
  </section>
</template>

<script setup lang="ts">
import { ArrowLeft } from '@lucide/vue';
import { useSalesAnalytics } from '@/views/sales-analytics/composables/useSalesAnalytics';

withDefaults(defineProps<{ title: string; subtitle?: string; backLabel?: string }>(), {
  backLabel: '返回总览',
});

const { goBack } = useSalesAnalytics();

function back() {
  goBack();
}
</script>

<style scoped>
.detail-shell {
  display: grid;
  gap: 16px;
}

.detail-shell__head {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.detail-shell__title h2 {
  margin: 0;
  font-size: 20px;
  letter-spacing: -0.02em;
}

.detail-shell__title p {
  margin: 2px 0 0;
  color: var(--sa-muted);
  font-size: 12px;
}

.detail-shell__actions {
  margin-left: auto;
}
</style>
