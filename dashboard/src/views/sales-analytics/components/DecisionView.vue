<template>
  <DetailShell title="智能决策建议" subtitle="优先级、触发依据、关联对象与建议动作">
    <template #actions>
      <v-select
        v-model="state.decisionFilter"
        :items="PRIORITY_OPTIONS"
        item-title="title"
        item-value="value"
        density="compact"
        variant="outlined"
        hide-details
        class="filter-select"
        label="优先级筛选"
      />
    </template>

    <div class="advice-list">
      <article v-for="item in filteredAdvice" :key="item.id" class="advice-card" :class="`advice-card--${item.priority}`">
        <span class="advice-card__dot"></span>
        <div class="advice-card__body">
          <div class="advice-card__head">
            <strong>{{ item.title }}</strong>
            <v-chip size="x-small" :color="priorityColor(item.priority)" variant="tonal">{{ PRIORITY_LABELS[item.priority] }}</v-chip>
            <v-chip v-if="item.handled" size="x-small" color="success" variant="tonal">已处理</v-chip>
          </div>
          <p class="advice-card__detail">{{ item.detail }}</p>
          <div class="advice-card__meta">
            <span>触发依据：{{ item.trigger }}</span>
            <span>关联对象：{{ item.related }}</span>
          </div>
        </div>
        <v-btn
          size="small"
          variant="tonal"
          :disabled="item.handled"
          @click="markAdviceHandled(item.id)"
        >
          <Check v-if="item.handled" :size="14" class="mr-1" />
          {{ item.handled ? '已处理' : '标记已处理' }}
        </v-btn>
      </article>
      <div v-if="!filteredAdvice.length" class="empty">当前筛选下暂无建议</div>
    </div>
  </DetailShell>
</template>

<script setup lang="ts">
import { Check } from '@lucide/vue';
import { computed } from 'vue';
import DetailShell from './shared/DetailShell.vue';
import { useSalesAnalytics } from '@/views/sales-analytics/composables/useSalesAnalytics';
import { FOLLOWUP_PRIORITY_LABELS } from '@/views/sales-analytics/types';

const { state, advice, markAdviceHandled } = useSalesAnalytics();

const PRIORITY_LABELS = FOLLOWUP_PRIORITY_LABELS;

const PRIORITY_OPTIONS = [
  { value: 'all', title: '全部优先级' },
  { value: 'high', title: '高' },
  { value: 'medium', title: '中' },
  { value: 'low', title: '低' },
];

const filteredAdvice = computed(() =>
  advice.value.filter((a) => state.decisionFilter === 'all' || a.priority === state.decisionFilter),
);

function priorityColor(priority: 'high' | 'medium' | 'low'): string {
  if (priority === 'high') return 'error';
  if (priority === 'medium') return 'warning';
  return 'primary';
}
</script>

<style scoped>
.filter-select { max-width: 180px; }

.advice-list {
  display: grid;
  gap: 12px;
}

.advice-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  border: 1px solid var(--sa-border);
  border-radius: 12px;
  background: var(--sa-card);
}

.advice-card__dot {
  width: 9px;
  height: 9px;
  margin-top: 6px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: rgb(var(--v-theme-primary));
}

.advice-card--high .advice-card__dot { background: rgb(var(--v-theme-error)); }
.advice-card--medium .advice-card__dot { background: rgb(var(--v-theme-warning)); }

.advice-card__body {
  flex: 1;
  min-width: 0;
}

.advice-card__head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.advice-card__head strong { font-size: 14px; }
.advice-card__detail { margin: 6px 0; color: var(--sa-muted); font-size: 13px; line-height: 1.55; }
.advice-card__meta { display: flex; gap: 16px; flex-wrap: wrap; color: var(--sa-subtle); font-size: 11px; }

.empty {
  padding: 32px;
  color: var(--sa-muted);
  text-align: center;
}
</style>
