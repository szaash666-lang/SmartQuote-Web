<template>
  <DetailShell title="客户洞察" subtitle="客户活跃度、行业、介质、预算与采购偏好">
    <template #actions>
      <v-select
        v-model="state.customerFilter"
        :items="customerOptions"
        item-title="title"
        item-value="value"
        density="compact"
        variant="outlined"
        hide-details
        class="customer-select"
        label="筛选客户"
      />
    </template>

    <div class="donut-grid">
      <div class="panel">
        <div class="panel__title">行业分布</div>
        <VueApexCharts type="donut" height="240" :options="industryOptions" :series="industrySeries" />
      </div>
      <div class="panel">
        <div class="panel__title">介质分布</div>
        <VueApexCharts type="donut" height="240" :options="mediumOptions" :series="mediumSeries" />
      </div>
    </div>

    <div v-if="selectedCustomer" class="panel customer-detail">
      <div class="panel__title">{{ selectedCustomer.name }} · 采购记录与关联报价</div>
      <div class="customer-tags">
        <v-chip size="small" variant="tonal">{{ selectedCustomer.industry }}</v-chip>
        <v-chip size="small" variant="tonal">{{ selectedCustomer.region }}</v-chip>
        <v-chip size="small" variant="tonal">预算 {{ formatCompact(selectedCustomer.avgBudgetCny) }}</v-chip>
        <v-chip size="small" variant="tonal">活跃度 {{ ACTIVITY_LABELS[selectedCustomer.activityLevel] }}</v-chip>
        <v-chip v-for="pref in selectedCustomer.preferences" :key="pref" size="small" variant="outlined">{{ pref }}</v-chip>
      </div>
      <div class="record-list">
        <div v-for="r in selectedCustomer.records" :key="r.id" class="record-row">
          <span class="record-row__id">{{ r.id }}</span>
          <span class="record-row__product">{{ r.modelName }}</span>
          <span class="record-row__qty">×{{ r.quantity }}</span>
          <span class="record-row__amount">{{ formatCny(r.amountCny) }}</span>
          <span class="record-row__stage" :class="`stage--${r.stage}`">{{ STAGE_LABELS[r.stage] }}</span>
        </div>
        <div v-if="!selectedCustomer.records.length" class="empty">该客户暂无关联报价</div>
      </div>
    </div>
  </DetailShell>
</template>

<script setup lang="ts">
import VueApexCharts from 'vue3-apexcharts';
import type { ApexOptions } from 'apexcharts';
import { computed } from 'vue';
import { useTheme } from 'vuetify';
import DetailShell from './shared/DetailShell.vue';
import { formatCompact, formatCny, useSalesAnalytics } from '@/views/sales-analytics/composables/useSalesAnalytics';
import { STAGE_LABELS } from '@/views/sales-analytics/types';

const ACTIVITY_LABELS: Record<string, string> = { high: '高', medium: '中', low: '低' };

const { state, customerStats, filteredRecords } = useSalesAnalytics();
const theme = useTheme();
const isDark = computed(() => theme.global.current.value.dark);
const palette = computed(() => {
  const colors = theme.global.current.value.colors as Record<string, string>;
  return {
    info: colors.info,
    warning: colors.warning,
    muted: colors.secondaryText ?? colors.primaryText ?? colors.primary,
  };
});

const customerOptions = computed(() => [
  { value: 'all', title: '全部客户' },
  ...customerStats.value.map((c) => ({ value: c.id, title: c.name })),
]);

const selectedCustomer = computed(() =>
  customerStats.value.find((c) => c.id === state.customerFilter) ?? null,
);

const industryCount = computed(() => {
  const map = new Map<string, number>();
  for (const r of filteredRecords.value) map.set(r.industry, (map.get(r.industry) ?? 0) + 1);
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
});

const industrySeries = computed(() => industryCount.value.slice(0, 6).map((e) => e[1]));
const industryOptions = computed<ApexOptions>(() =>
  donutOptions(industryCount.value.slice(0, 6).map((e) => e[0])),
);

const mediumCount = computed(() => {
  const counts = { clean_water: 0, mild_corrosive: 0 };
  for (const r of filteredRecords.value) counts[r.medium] += 1;
  return counts;
});
const mediumSeries = computed(() => [mediumCount.value.clean_water, mediumCount.value.mild_corrosive]);
const mediumOptions = computed<ApexOptions>(() => donutOptions(['清水', '弱腐蚀']));

const DONUT_COLORS = ['#3c96ca', '#5ba4d4', '#f2a33c', '#18a262', '#7d54d7', '#e25555'];

function donutOptions(labels: string[]): ApexOptions {
  return {
    chart: { background: 'transparent', toolbar: { show: false }, fontFamily: '"SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
    theme: { mode: isDark.value ? 'dark' : 'light' },
    labels,
    colors: DONUT_COLORS,
    dataLabels: { enabled: true, formatter: (value) => `${Number(value).toFixed(0)}%` },
    stroke: { colors: [isDark.value ? '#242424' : '#ffffff'] },
    legend: { position: 'bottom', labels: { colors: palette.value.muted } },
    tooltip: { theme: isDark.value ? 'dark' : 'light' },
  };
}
</script>

<style scoped>
.customer-select { max-width: 220px; }

.donut-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.panel {
  border-radius: var(--sa-radius);
  background: var(--sa-card);
  box-shadow: var(--sa-shadow);
  padding: 24px;
}

.panel__title {
  margin-bottom: 12px;
  font-size: 15px;
  font-weight: 650;
}

.customer-detail {
  margin-top: 14px;
}

.customer-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 14px;
}

.record-list {
  display: grid;
  gap: 6px;
  max-height: 320px;
  overflow-y: auto;
}

.record-row {
  display: grid;
  grid-template-columns: 150px 1fr 50px 110px 90px;
  align-items: center;
  gap: 12px;
  padding: 9px 10px;
  border-radius: 8px;
  background: var(--sa-soft);
  font-size: 12px;
}

.record-row__id { color: var(--sa-subtle); }
.record-row__product { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.record-row__qty { color: var(--sa-muted); }
.record-row__amount { text-align: right; font-variant-numeric: tabular-nums; }
.record-row__stage { text-align: center; }

.stage--won { color: rgb(var(--v-theme-success)); font-weight: 700; }
.stage--lost { color: rgb(var(--v-theme-error)); font-weight: 700; }

.empty {
  padding: 24px;
  color: var(--sa-muted);
  text-align: center;
}

@media (max-width: 900px) {
  .donut-grid { grid-template-columns: 1fr; }
  .record-row { grid-template-columns: 110px 1fr 40px 90px; }
  .record-row__stage { display: none; }
}
</style>
