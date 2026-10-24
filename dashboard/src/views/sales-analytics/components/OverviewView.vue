<template>
  <div class="overview">
    <!-- 顶部四个指标卡 -->
    <div class="kpi-grid">
      <StatCard
        v-for="card in kpiCards"
        :key="card.label"
        :label="card.label"
        :value="card.value"
        :note="card.note"
        :icon="card.icon"
        :tone="card.tone"
      />
    </div>

    <div class="entry-grid">
      <!-- 报价业绩：趋势图外置 -->
      <section class="panel perf-panel">
        <header class="panel__head">
          <div>
            <h2 class="panel__title">报价业绩</h2>
            <p class="panel__subtitle">报价 / 成交 / 流失趋势（按月）</p>
          </div>
          <button type="button" class="detail-link" @click="setView('performance')">
            进入详情 <ChevronRight :size="14" />
          </button>
        </header>
        <VueApexCharts type="area" height="280" :options="trendOptions" :series="trendSeries" />
        <div class="ai-insight">
          <div class="ai-insight__head">
            <Sparkles :size="16" class="ai-insight__icon" />
            <span class="ai-insight__title">AI 智能洞察</span>
          </div>
          <p class="ai-insight__text">基于当前数据趋势：本月报价总量较上月呈上升趋势，但 Q3 阶段流失率有所抬头。建议重点关注逾期 {{ overdueCount }} 条商机中的大客户跟进节奏，并针对主要失单原因优化报价策略，提升整体转化效率。</p>
        </div>
      </section>

      <!-- 客户洞察 / 成交转化：两个入口卡 -->
      <button
        v-for="entry in entries"
        :key="entry.key"
        type="button"
        class="entry-card"
        :class="`entry-card--${entry.key}`"
        @click="setView(entry.key)"
      >
        <div class="entry-card__top">
          <span class="entry-card__icon"><component :is="entry.icon" :size="22" /></span>
          <span class="entry-card__badge">{{ entry.badge }}</span>
        </div>
        <h3>{{ entry.title }}</h3>
        <div class="entry-card__metric">{{ entry.value }}</div>
        <p class="entry-card__summary">{{ entry.summary }}</p>
        <span class="entry-card__action">进入详情 <ChevronRight :size="14" /></span>
      </button>

      <!-- 跟进与商机：待办列表 -->
      <section class="panel followup-panel">
        <header class="panel__head">
          <div>
            <h2 class="panel__title">跟进与商机</h2>
            <p class="panel__subtitle">共 {{ formatInt(kpi.pendingFollowups) }} 条待跟进 · 逾期 {{ overdueCount }} 条</p>
          </div>
          <button type="button" class="detail-link" @click="setView('followup')">
            进入详情 <ChevronRight :size="14" />
          </button>
        </header>
        <div class="followup-list">
          <div v-for="item in topFollowups" :key="item.id" class="followup-item">
            <span class="priority-dot" :class="`priority-dot--${item.priority}`"></span>
            <div class="followup-item__main">
              <strong>{{ item.customerName }}</strong>
              <span class="followup-item__quote">{{ item.id }} · {{ item.modelName }} · ×{{ item.quantity }}</span>
            </div>
            <span class="followup-item__amount">{{ formatCny(item.amountCny) }}</span>
            <span v-if="item.followupStatus === 'overdue'" class="tag tag--overdue">逾期</span>
            <span v-else class="tag" :class="`tag--${item.priority}`">{{ FOLLOWUP_PRIORITY_LABELS[item.priority] }}</span>
          </div>
          <div v-if="!topFollowups.length" class="empty">暂无跟进事项</div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import VueApexCharts from 'vue3-apexcharts';
import type { ApexOptions } from 'apexcharts';
import { ChevronRight, Clock, Filter, Sparkles, TrendingUp, Users } from '@lucide/vue';
import { computed, type Component } from 'vue';
import { useTheme } from 'vuetify';
import StatCard from './shared/StatCard.vue';
import {
  formatCompact,
  formatCny,
  formatInt,
  formatPercent,
  useSalesAnalytics,
} from '@/views/sales-analytics/composables/useSalesAnalytics';
import { FOLLOWUP_PRIORITY_LABELS, type ViewKey } from '@/views/sales-analytics/types';

const {
  kpi,
  customerStats,
  followups,
  winRate,
  avgSalesCycleDays,
  monthLabels,
  trendSeries,
  setView,
} = useSalesAnalytics();

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

const kpiCards = computed<
  Array<{ label: string; value: string; note: string; icon: Component; tone: 'default' | 'primary' | 'success' | 'warning' | 'error' }>
>(() => [
  { label: '报价数量', value: formatInt(kpi.value.quoteCount), note: '时间范围内', icon: TrendingUp, tone: 'default' },
  { label: '成交率', value: formatPercent(kpi.value.winRate), note: '成交 / (成交 + 流失)', icon: Filter, tone: 'success' },
  { label: '成交金额', value: formatCompact(kpi.value.revenue), note: '演示参考价', icon: Users, tone: 'primary' },
  { label: '待跟进报价', value: formatInt(kpi.value.pendingFollowups), note: '待回复 / 响应慢 / 逾期', icon: Clock, tone: 'warning' },
]);

const overdueCount = computed(() => followups.value.filter((f) => f.followupStatus === 'overdue').length);

const entries = computed<
  Array<{ key: ViewKey; title: string; icon: Component; badge: string; value: string; summary: string }>
>(() => [
  { key: 'customers', title: '客户洞察', icon: Users, badge: '画像', value: `${customerStats.value.length} 家`, summary: '行业、介质、预算与采购偏好' },
  { key: 'conversion', title: '成交转化分析', icon: Filter, badge: '漏斗', value: formatPercent(winRate.value), summary: `平均销售周期 ${avgSalesCycleDays.value} 天` },
]);

const topFollowups = computed(() => followups.value.slice(0, 6));

const trendOptions = computed<ApexOptions>(() => ({
  chart: { background: 'transparent', toolbar: { show: false }, zoom: { enabled: false }, fontFamily: '"SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  theme: { mode: isDark.value ? 'dark' : 'light' },
  colors: [isDark.value ? '#A78BFA' : '#8B5CF6', palette.value.success, isDark.value ? '#FBBF24' : '#F59E0B'],
  stroke: { curve: 'smooth', width: 2.4 },
  fill: { type: 'solid', opacity: 0.08 },
  grid: { borderColor: hexToRgba(palette.value.border, isDark.value ? 0.35 : 0.2) },
  dataLabels: { enabled: false },
  xaxis: { categories: monthLabels.value, labels: { style: { colors: palette.value.muted } } },
  yaxis: { labels: { style: { colors: palette.value.muted } } },
  tooltip: { theme: isDark.value ? 'dark' : 'light' },
  legend: { position: 'top', horizontalAlign: 'right', labels: { colors: palette.value.muted } },
}));
</script>

<style scoped>
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 18px;
}

.entry-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr) minmax(0, 1fr);
  grid-template-areas:
    'performance customers conversion'
    'performance followup   followup';
  gap: 16px;
}

/* 卡片基础 */
.panel {
  border-radius: var(--sa-radius);
  background: var(--sa-card);
  box-shadow: var(--sa-shadow);
  padding: 24px;
}

.perf-panel {
  grid-area: performance;
  display: flex;
  flex-direction: column;
}

.ai-insight {
  margin-top: 18px;
  border-top: 1px dashed var(--sa-border);
  padding-top: 16px;
}

.ai-insight__head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
}

.ai-insight__icon { color: rgb(var(--v-theme-primary)); }

.ai-insight__title {
  font-size: 13px;
  font-weight: 700;
  color: rgb(var(--v-theme-primary));
}

.ai-insight__text {
  margin: 0;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(var(--v-theme-primary), 0.06);
  color: var(--sa-muted);
  font-size: 13px;
  line-height: 1.7;
}

.followup-panel { grid-area: followup; }

.panel__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.panel__title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--sa-text);
}

.panel__subtitle {
  margin: 4px 0 0;
  color: var(--sa-muted);
  font-size: 12px;
}

.detail-link {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  border: 0;
  background: transparent;
  padding: 6px 12px;
  border-radius: 999px;
  color: rgb(var(--v-theme-primary));
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.detail-link:hover { background: rgba(var(--v-theme-primary), 0.1); }

/* 入口卡 */
.entry-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  border-radius: var(--sa-radius);
  box-shadow: var(--sa-shadow);
  padding: 22px;
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}

.entry-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.07);
}

.entry-card--customers { grid-area: customers; background: var(--sa-customers-bg); min-height: 150px; }
.entry-card--conversion { grid-area: conversion; background: var(--sa-conversion-bg); min-height: 150px; }

.entry-card__top {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
}

.entry-card__icon {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.65);
  color: rgb(var(--v-theme-primary));
}

.entry-card__badge {
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.6);
  color: var(--sa-text);
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 600;
}

.entry-card h3 {
  margin: 14px 0 6px;
  font-size: 15px;
  font-weight: 700;
}

.entry-card__metric {
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.entry-card__summary {
  flex: 1;
  margin: 6px 0 14px;
  color: var(--sa-muted);
  font-size: 12px;
  line-height: 1.5;
}

.entry-card__action {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: rgb(var(--v-theme-primary));
  font-size: 12px;
  font-weight: 600;
}

/* 跟进列表 */
.followup-list {
  display: grid;
  gap: 8px;
}

.followup-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 12px;
  padding: 11px 14px;
  border-radius: 14px;
  background: var(--sa-list-item);
}

.priority-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgb(var(--v-theme-primary));
}

.priority-dot--high { background: rgb(var(--v-theme-error)); }
.priority-dot--medium { background: rgb(var(--v-theme-warning)); }

.followup-item__main {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.followup-item__main strong { font-size: 13px; font-weight: 650; }
.followup-item__quote { overflow: hidden; color: var(--sa-muted); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.followup-item__amount { font-variant-numeric: tabular-nums; font-weight: 700; font-size: 13px; }

.tag {
  border-radius: 999px;
  padding: 3px 10px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.5;
}

.tag--high { background: rgba(var(--v-theme-error), 0.12); color: rgb(var(--v-theme-error)); }
.tag--medium { background: rgba(var(--v-theme-warning), 0.16); color: rgb(var(--v-theme-warning)); }
.tag--low { background: rgba(var(--v-theme-primary), 0.12); color: rgb(var(--v-theme-primary)); }
.tag--overdue { background: rgba(var(--v-theme-error), 0.1); color: rgb(var(--v-theme-error)); }

.empty {
  padding: 20px;
  color: var(--sa-muted);
  font-size: 12px;
  text-align: center;
}

@media (max-width: 1200px) {
  .kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .entry-grid {
    grid-template-columns: 1fr;
    grid-template-areas:
      'performance'
      'customers'
      'conversion'
      'followup';
  }
  .entry-card--customers,
  .entry-card--conversion { min-height: 150px; }
}

@media (max-width: 640px) {
  .kpi-grid { grid-template-columns: 1fr; }
  .followup-item { grid-template-columns: auto minmax(0, 1fr) auto; }
  .followup-item__amount { display: none; }
}
</style>
