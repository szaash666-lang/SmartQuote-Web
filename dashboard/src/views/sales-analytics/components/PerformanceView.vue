<template>
  <DetailShell title="报价业绩" subtitle="报价数量、成交率、成交金额与趋势">
    <template #actions>
      <v-select
        v-model="state.performanceStatus"
        :items="STATUS_OPTIONS"
        item-title="title"
        item-value="value"
        density="compact"
        variant="outlined"
        hide-details
        class="status-select"
        label="报价状态"
      />
    </template>

    <div class="kpi-grid">
      <StatCard label="报价数量" :value="formatInt(statusRecords.length)" note="当前状态" :icon="TrendingUp" tone="default" />
      <StatCard label="成交数量" :value="formatInt(statusWonCount)" note="已成交" :icon="CheckCircle2" tone="success" />
      <StatCard label="流失数量" :value="formatInt(statusLostCount)" note="已流失" :icon="XCircle" tone="error" />
      <StatCard label="成交金额" :value="formatCompact(statusRevenue)" note="演示参考价" :icon="Wallet" tone="primary" />
    </div>

    <section class="panel">
      <div class="panel__title">报价与成交趋势（按月）</div>
      <VueApexCharts type="area" height="320" :options="trendOptions" :series="trendSeries" />
    </section>

    <section class="panel">
      <div class="panel__title">趋势明细</div>
      <div v-if="trendRows.length" class="trend-table">
        <div v-for="row in trendRows" :key="row.month" class="trend-table__row">
          <span>{{ row.month }}</span>
          <strong>报价 {{ row.quotes }}</strong>
          <strong>成交 {{ row.won }}</strong>
          <strong>流失 {{ row.lost }}</strong>
        </div>
      </div>
      <div v-else class="empty">当前筛选下暂无数据</div>
    </section>
  </DetailShell>
</template>

<script setup lang="ts">
import VueApexCharts from 'vue3-apexcharts';
import type { ApexOptions } from 'apexcharts';
import { CheckCircle2, TrendingUp, Wallet, XCircle } from '@lucide/vue';
import { computed } from 'vue';
import { useTheme } from 'vuetify';
import DetailShell from './shared/DetailShell.vue';
import StatCard from './shared/StatCard.vue';
import { formatCompact, formatInt, useSalesAnalytics } from '@/views/sales-analytics/composables/useSalesAnalytics';

const STATUS_OPTIONS = [
  { title: '全部状态', value: 'all' },
  { title: '待处理', value: 'pending' },
  { title: '已成交', value: 'won' },
  { title: '已流失', value: 'lost' },
];

const { state, filteredRecords, wonRecords, lostRecords, pendingRecords, monthLabels } = useSalesAnalytics();
const theme = useTheme();
const isDark = computed(() => theme.global.current.value.dark);
const palette = computed(() => {
  const colors = theme.global.current.value.colors as Record<string, string>;
  return {
    primary: colors.primary,
    success: colors.success,
    error: colors.error,
    border: colors.border ?? colors.borderLight ?? colors.primary,
    muted: colors.secondaryText ?? colors.primaryText ?? colors.primary,
  };
});

function hexToRgba(color: string | undefined, alpha: number): string {
  if (!color) return `rgba(0,0,0,${alpha})`;
  if (!color.startsWith('#')) return color;
  let hex = color.slice(1);
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  if (hex.length !== 6) return color;
  return `rgba(${Number.parseInt(hex.slice(0, 2), 16)}, ${Number.parseInt(hex.slice(2, 4), 16)}, ${Number.parseInt(hex.slice(4, 6), 16)}, ${alpha})`;
}

const statusRecords = computed(() => {
  if (state.performanceStatus === 'pending') return pendingRecords.value;
  if (state.performanceStatus === 'won') return wonRecords.value;
  if (state.performanceStatus === 'lost') return lostRecords.value;
  return filteredRecords.value;
});

const statusWonCount = computed(() => statusRecords.value.filter((r) => r.stage === 'won').length);
const statusLostCount = computed(() => statusRecords.value.filter((r) => r.stage === 'lost').length);
const statusRevenue = computed(() =>
  statusRecords.value.filter((r) => r.stage === 'won').reduce((sum, r) => sum + r.amountCny, 0),
);

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

const trendSeries = computed(() => {
  const quotes = new Array(monthLabels.value.length).fill(0);
  const won = new Array(monthLabels.value.length).fill(0);
  const lost = new Array(monthLabels.value.length).fill(0);
  for (const r of statusRecords.value) {
    const index = monthLabels.value.indexOf(monthKey(new Date(r.createdAt)));
    if (index < 0) continue;
    quotes[index] += 1;
    if (r.stage === 'won') won[index] += 1;
    else if (r.stage === 'lost') lost[index] += 1;
  }
  return [
    { name: '报价数', data: quotes },
    { name: '成交数', data: won },
    { name: '流失数', data: lost },
  ];
});

const trendOptions = computed<ApexOptions>(() => ({
  chart: { background: 'transparent', toolbar: { show: false }, zoom: { enabled: false }, fontFamily: '"SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  theme: { mode: isDark.value ? 'dark' : 'light' },
  colors: [isDark.value ? '#A78BFA' : '#8B5CF6', palette.value.success, isDark.value ? '#FBBF24' : '#F59E0B'],
  stroke: { curve: 'smooth', width: 2.4 },
  fill: { type: 'solid', opacity: 0.08 },
  grid: { borderColor: hexToRgba(palette.value.border, isDark.value ? 0.4 : 0.26) },
  dataLabels: { enabled: false },
  xaxis: { categories: monthLabels.value, labels: { style: { colors: palette.value.muted } } },
  yaxis: { labels: { style: { colors: palette.value.muted } } },
  tooltip: { theme: isDark.value ? 'dark' : 'light' },
  legend: { position: 'top', horizontalAlign: 'right', labels: { colors: palette.value.muted } },
}));

const trendRows = computed(() =>
  monthLabels.value.map((month, index) => ({
    month,
    quotes: trendSeries.value[0].data[index] as number,
    won: trendSeries.value[1].data[index] as number,
    lost: trendSeries.value[2].data[index] as number,
  })),
);
</script>

<style scoped>
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.status-select { max-width: 220px; }

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

.trend-table {
  display: grid;
  gap: 6px;
  max-height: 260px;
  overflow-y: auto;
}

.trend-table__row {
  display: flex;
  gap: 20px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--sa-soft);
  font-size: 13px;
}

.trend-table__row span { flex: 1; color: var(--sa-muted); }
.trend-table__row strong { font-variant-numeric: tabular-nums; }

.empty {
  padding: 24px;
  color: var(--sa-muted);
  text-align: center;
}

@media (max-width: 1200px) {
  .kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 640px) {
  .kpi-grid { grid-template-columns: 1fr; }
}
</style>
