<template>
  <DetailShell title="跟进与商机" subtitle="待回复、响应较慢与逾期跟进事项">
    <template #actions>
      <v-select
        v-model="state.followupStatusFilter"
        :items="STATUS_OPTIONS"
        item-title="title"
        item-value="value"
        density="compact"
        variant="outlined"
        hide-details
        class="filter-select"
        label="跟进状态"
      />
      <v-select
        v-model="state.followupPriorityFilter"
        :items="PRIORITY_OPTIONS"
        item-title="title"
        item-value="value"
        density="compact"
        variant="outlined"
        hide-details
        class="filter-select"
        label="优先级"
      />
    </template>

    <div class="followup-list">
      <div v-for="item in filteredFollowups" :key="item.id" class="followup-row">
        <span class="priority-dot" :class="`priority-dot--${item.priority}`"></span>
        <div class="followup-row__main">
          <strong>{{ item.customerName }}</strong>
          <span class="followup-row__quote">{{ item.id }} · {{ item.modelName }} · ×{{ item.quantity }}</span>
        </div>
        <span class="followup-row__amount">{{ formatCny(item.amountCny) }}</span>
        <v-chip size="x-small" :color="priorityColor(item.priority)" variant="tonal">{{ FOLLOWUP_PRIORITY_LABELS[item.priority] }}</v-chip>
        <span class="followup-row__last">最近活动 {{ formatDate(item.lastActivityAt) }}</span>
        <v-select
          :model-value="item.followupStatus"
          :items="UPDATE_OPTIONS"
          item-title="title"
          item-value="value"
          density="compact"
          variant="outlined"
          hide-details
          class="update-select"
          @update:model-value="(v) => updateFollowupStatus(item.id, v as FollowupStatus)"
        />
      </div>
      <div v-if="!filteredFollowups.length" class="empty">当前筛选下暂无跟进事项</div>
    </div>
  </DetailShell>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import DetailShell from './shared/DetailShell.vue';
import { formatCny, useSalesAnalytics } from '@/views/sales-analytics/composables/useSalesAnalytics';
import { FOLLOWUP_PRIORITY_LABELS, type FollowupPriority, type FollowupStatus } from '@/views/sales-analytics/types';

const { state, followups, updateFollowupStatus } = useSalesAnalytics();

const STATUS_OPTIONS = [
  { value: 'all', title: '全部状态' },
  { value: 'pending_reply', title: '待回复' },
  { value: 'slow_response', title: '响应较慢' },
  { value: 'overdue', title: '逾期跟进' },
];

const PRIORITY_OPTIONS = [
  { value: 'all', title: '全部优先级' },
  { value: 'high', title: '高' },
  { value: 'medium', title: '中' },
  { value: 'low', title: '低' },
];

const UPDATE_OPTIONS = [
  { value: 'pending_reply', title: '待回复' },
  { value: 'slow_response', title: '响应较慢' },
  { value: 'overdue', title: '逾期跟进' },
  { value: 'none', title: '已完成 / 无需跟进' },
];

const filteredFollowups = computed(() =>
  followups.value.filter((f) => {
    const statusOk = state.followupStatusFilter === 'all' || f.followupStatus === state.followupStatusFilter;
    const priorityOk = state.followupPriorityFilter === 'all' || f.priority === state.followupPriorityFilter;
    return statusOk && priorityOk;
  }),
);

function priorityColor(priority: FollowupPriority): string {
  if (priority === 'high') return 'error';
  if (priority === 'medium') return 'warning';
  return 'primary';
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return '—';
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' }).format(date);
}
</script>

<style scoped>
.filter-select { max-width: 180px; }

.followup-list {
  display: grid;
  gap: 10px;
}

.followup-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) 110px 70px 120px 160px;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 18px;
  background: var(--sa-card);
  box-shadow: var(--sa-shadow);
}

.priority-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: rgb(var(--v-theme-primary));
}

.priority-dot--high { background: rgb(var(--v-theme-error)); }
.priority-dot--medium { background: rgb(var(--v-theme-warning)); }

.followup-row__main {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.followup-row__main strong { font-size: 14px; }
.followup-row__quote { overflow: hidden; color: var(--sa-muted); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.followup-row__amount { font-variant-numeric: tabular-nums; font-weight: 600; }
.followup-row__last { color: var(--sa-subtle); font-size: 11px; }

.update-select { min-width: 160px; }

.empty {
  padding: 32px;
  color: var(--sa-muted);
  text-align: center;
}

@media (max-width: 900px) {
  .followup-row { grid-template-columns: auto minmax(0, 1fr) auto; }
  .followup-row__amount, .followup-row__last { display: none; }
  .update-select { grid-column: 2 / -1; }
}
</style>
