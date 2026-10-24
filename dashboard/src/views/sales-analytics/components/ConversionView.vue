<template>
  <DetailShell title="成交转化分析" subtitle="询价 → 报价 → 跟进 → 成交，及流失原因与销售周期">
    <div class="conversion-layout">
      <div class="panel">
        <div class="panel__title">转化漏斗（点击查看明细）</div>
        <div class="funnel">
          <button
            v-for="(level, index) in funnel"
            :key="level.key"
            type="button"
            class="funnel-row"
            :class="{ active: selectedStage === level.key }"
            @click="selectStage(level.key)"
          >
            <span class="funnel-row__label">{{ level.label }}</span>
            <div class="funnel-row__bar">
              <div class="funnel-row__fill" :style="{ width: `${level.pct}%` }"></div>
            </div>
            <span class="funnel-row__count">{{ level.count }}</span>
            <span class="funnel-row__rate">{{ index === 0 ? '—' : `${level.rate}%` }}</span>
          </button>
        </div>
        <div class="cycle-meta">
          <span>平均销售周期</span>
          <strong>{{ avgSalesCycleDays }} 天</strong>
        </div>
      </div>

      <div class="panel">
        <div class="panel__title">流失原因（点击查看明细）</div>
        <VueApexCharts type="donut" height="220" :options="lostDonutOptions" :series="lostDonutSeries" />
        <div class="lost-list">
          <button
            v-for="item in lostReasonBreakdown"
            :key="item.key"
            type="button"
            class="lost-row"
            :class="{ active: selectedReason === item.key }"
            @click="selectReason(item.key)"
          >
            <span>{{ item.label }}</span>
            <strong>{{ item.count }}</strong>
          </button>
        </div>
      </div>
    </div>

    <div v-if="detailRecords.length" class="panel detail-panel">
      <div class="panel__title">{{ detailTitle }}</div>
      <div class="record-list">
        <div v-for="r in detailRecords" :key="r.id" class="record-row">
          <span class="record-row__id">{{ r.id }}</span>
          <span>{{ r.customerName }}</span>
          <span>{{ r.modelName }}</span>
          <span>{{ formatCny(r.amountCny) }}</span>
          <span>{{ STAGE_LABELS[r.stage] }}</span>
          <span v-if="r.salesCycleDays != null">{{ r.salesCycleDays }} 天</span>
        </div>
      </div>
    </div>
  </DetailShell>
</template>

<script setup lang="ts">
import VueApexCharts from 'vue3-apexcharts';
import type { ApexOptions } from 'apexcharts';
import { computed, ref } from 'vue';
import { useTheme } from 'vuetify';
import DetailShell from './shared/DetailShell.vue';
import { formatCny, useSalesAnalytics } from '@/views/sales-analytics/composables/useSalesAnalytics';
import { STAGE_LABELS } from '@/views/sales-analytics/types';

const { funnel, lostReasonBreakdown, lostRecords, avgSalesCycleDays, filteredRecords, wonRecords } =
  useSalesAnalytics();
const theme = useTheme();
const isDark = computed(() => theme.global.current.value.dark);
const palette = computed(() => {
  const colors = theme.global.current.value.colors as Record<string, string>;
  return { muted: colors.secondaryText ?? colors.primaryText ?? colors.primary };
});

const selectedStage = ref('');
const selectedReason = ref('');

function selectStage(key: string) {
  selectedStage.value = selectedStage.value === key ? '' : key;
  selectedReason.value = '';
}

function selectReason(key: string) {
  selectedReason.value = selectedReason.value === key ? '' : key;
  selectedStage.value = '';
}

const detailRecords = computed(() => {
  if (selectedStage.value === 'inquiry') return filteredRecords.value;
  if (selectedStage.value === 'quoted') return filteredRecords.value.filter((r) => ['quoted', 'won', 'lost'].includes(r.stage));
  if (selectedStage.value === 'followed') return filteredRecords.value.filter((r) => ['quoted', 'won', 'lost'].includes(r.stage) && r.followupCount > 0);
  if (selectedStage.value === 'won') return wonRecords.value;
  if (selectedReason.value) return lostRecords.value.filter((r) => (r.lostReason ?? 'no_decision') === selectedReason.value);
  return [];
});

const detailTitle = computed(() => {
  if (selectedStage.value) {
    const level = funnel.value.find((f) => f.key === selectedStage.value);
    return level ? `${level.label} · 明细（${level.count} 条）` : '明细';
  }
  if (selectedReason.value) {
    const reason = lostReasonBreakdown.value.find((r) => r.key === selectedReason.value);
    return reason ? `流失原因「${reason.label}」· 明细（${reason.count} 条）` : '明细';
  }
  return '明细';
});

const lostDonutSeries = computed(() => lostReasonBreakdown.value.map((e) => e.count));
const lostDonutOptions = computed<ApexOptions>(() => ({
  chart: { background: 'transparent', toolbar: { show: false }, fontFamily: '"SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  theme: { mode: isDark.value ? 'dark' : 'light' },
  labels: lostReasonBreakdown.value.map((e) => e.label),
  colors: ['#e25555', '#f2a33c', '#7d54d7', '#3c96ca', '#03c9d7', '#9aa1af'],
  dataLabels: { enabled: true, formatter: (value) => `${Number(value).toFixed(0)}%` },
  stroke: { colors: [isDark.value ? '#242424' : '#ffffff'] },
  legend: { show: false },
  tooltip: { theme: isDark.value ? 'dark' : 'light' },
}));
</script>

<style scoped>
.conversion-layout {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: 16px;
  align-items: start;
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

.funnel {
  display: grid;
  gap: 10px;
}

.funnel-row {
  display: grid;
  grid-template-columns: 60px 1fr 48px 48px;
  align-items: center;
  gap: 10px;
  border: 0;
  background: transparent;
  padding: 0;
  color: inherit;
  font-size: 13px;
  cursor: pointer;
  text-align: left;
}

.funnel-row__label { color: var(--sa-muted); }
.funnel-row__bar { height: 26px; overflow: hidden; border-radius: 6px; background: var(--sa-soft); }
.funnel-row__fill { height: 100%; border-radius: 6px; background: linear-gradient(90deg, rgb(var(--v-theme-primary)), rgb(var(--v-theme-secondary))); transition: width 0.3s ease; }
.funnel-row__count { font-weight: 700; font-variant-numeric: tabular-nums; }
.funnel-row__rate { color: var(--sa-muted); font-size: 12px; }

.funnel-row.active .funnel-row__label { color: rgb(var(--v-theme-primary)); font-weight: 700; }
.funnel-row.active .funnel-row__fill { box-shadow: 0 0 0 2px rgb(var(--v-theme-primary)); }

.cycle-meta {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-top: 14px;
  border-top: 1px solid var(--sa-border);
  padding-top: 12px;
}

.cycle-meta span { color: var(--sa-muted); font-size: 12px; }
.cycle-meta strong { font-size: 18px; }

.lost-list {
  display: grid;
  gap: 4px;
  margin-top: 8px;
}

.lost-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 0;
  background: transparent;
  padding: 8px 0;
  border-bottom: 1px solid var(--sa-border);
  color: var(--sa-muted);
  font-size: 13px;
  cursor: pointer;
}

.lost-row strong { color: inherit; }
.lost-row.active { color: rgb(var(--v-theme-primary)); font-weight: 700; }

.detail-panel { margin-top: 16px; }

.record-list {
  display: grid;
  gap: 6px;
  max-height: 320px;
  overflow-y: auto;
}

.record-row {
  display: grid;
  grid-template-columns: 150px 1fr 1fr 100px 80px 70px;
  align-items: center;
  gap: 12px;
  padding: 9px 10px;
  border-radius: 8px;
  background: var(--sa-soft);
  font-size: 12px;
}

.record-row__id { color: var(--sa-subtle); }

@media (max-width: 900px) {
  .conversion-layout { grid-template-columns: 1fr; }
  .record-row { grid-template-columns: 110px 1fr 90px; }
  .record-row > :nth-child(4), .record-row > :nth-child(6) { display: none; }
}
</style>
