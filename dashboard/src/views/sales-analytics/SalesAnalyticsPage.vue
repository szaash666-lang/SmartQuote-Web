<template>
  <div class="sales-page" :class="{ 'is-dark': isDark }">
    <v-container fluid class="sales-shell">
      <!-- 统一页头：标题 + 模拟数据标识 + 时间范围筛选 -->
      <header class="page-head">
        <div class="page-head__title">
          <div class="page-head__row">
            <h1>销售数据分析</h1>
            <v-chip size="small" color="warning" variant="tonal">模拟数据</v-chip>
          </div>
          <p>统一本地 Mock 数据源 · 演示用途，未接入真实接口</p>
        </div>
        <div class="range-switch" role="tablist" aria-label="时间范围">
          <button
            v-for="option in RANGE_OPTIONS"
            :key="option.value"
            type="button"
            class="range-chip"
            :class="{ active: state.timeRange === option.value }"
            @click="state.timeRange = option.value"
          >
            {{ option.label }}
          </button>
        </div>
      </header>

      <!-- 视图切换（模块内状态导航，不改共享路由） -->
      <OverviewView v-if="state.currentView === 'overview'" />
      <PerformanceView v-else-if="state.currentView === 'performance'" />
      <CustomerInsightView v-else-if="state.currentView === 'customers'" />
      <FollowupView v-else-if="state.currentView === 'followup'" />
      <ConversionView v-else-if="state.currentView === 'conversion'" />
    </v-container>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useTheme } from 'vuetify';
import { useSalesAnalytics } from './composables/useSalesAnalytics';
import OverviewView from './components/OverviewView.vue';
import PerformanceView from './components/PerformanceView.vue';
import CustomerInsightView from './components/CustomerInsightView.vue';
import FollowupView from './components/FollowupView.vue';
import ConversionView from './components/ConversionView.vue';

const RANGE_OPTIONS = [
  { value: 1, label: '近1月' },
  { value: 3, label: '近3月' },
  { value: 6, label: '近6月' },
  { value: 12, label: '近12月' },
];

const { state } = useSalesAnalytics();
const theme = useTheme();
const isDark = computed(() => theme.global.current.value.dark);
</script>

<style scoped>
.sales-page {
  --v-theme-primary: 139, 92, 246;
  --v-theme-secondary: 167, 139, 250;
  --sa-bg: #f8f7fa;
  --sa-card: #ffffff;
  --sa-text: rgb(var(--v-theme-on-surface));
  --sa-muted: rgba(var(--v-theme-on-surface), 0.58);
  --sa-subtle: rgba(var(--v-theme-on-surface), 0.42);
  --sa-border: rgba(var(--v-theme-on-surface), 0.08);
  --sa-border-strong: rgba(var(--v-theme-on-surface), 0.12);
  --sa-soft: rgba(var(--v-theme-primary), 0.08);
  --sa-soft-strong: rgba(var(--v-theme-primary), 0.16);
  --sa-radius: 24px;
  --sa-shadow: 0 4px 24px rgba(31, 35, 40, 0.05);
  --sa-customers-bg: #f3e8ff;
  --sa-conversion-bg: #f0ecfb;
  --sa-list-item: #f5f6f8;
  min-height: 100%;
  background: var(--sa-bg);
  color: var(--sa-text);
  font-family: 'SF Pro Display', 'SF Pro Text', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

.sales-page.is-dark {
  --v-theme-primary: 167, 139, 250;
  --v-theme-secondary: 196, 181, 253;
  --sa-bg: #151419;
  --sa-card: rgba(var(--v-theme-on-surface), 0.06);
  --sa-muted: rgba(var(--v-theme-on-surface), 0.6);
  --sa-subtle: rgba(var(--v-theme-on-surface), 0.45);
  --sa-border: rgba(var(--v-theme-on-surface), 0.1);
  --sa-border-strong: rgba(var(--v-theme-on-surface), 0.16);
  --sa-soft: rgba(var(--v-theme-primary), 0.12);
  --sa-soft-strong: rgba(var(--v-theme-primary), 0.2);
  --sa-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
  --sa-customers-bg: rgba(167, 139, 250, 0.14);
  --sa-conversion-bg: rgba(125, 84, 215, 0.16);
  --sa-list-item: rgba(var(--v-theme-on-surface), 0.05);
}

.sales-shell {
  max-width: 1280px;
  margin: 0 auto;
}

.page-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}

.page-head__row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.page-head__title h1 {
  margin: 0;
  font-size: 24px;
  letter-spacing: -0.02em;
}

.page-head__title p {
  margin: 4px 0 0;
  color: var(--sa-muted);
  font-size: 13px;
}

.range-switch {
  display: inline-flex;
  gap: 8px;
  padding: 6px;
  border: 1px solid var(--sa-border);
  border-radius: 999px;
  background: rgb(var(--v-theme-surface));
}

.range-chip {
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--sa-muted);
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.18s ease, color 0.18s ease;
}

.range-chip.active {
  background: var(--sa-soft);
  color: rgb(var(--v-theme-primary));
}

.sales-page.is-dark .range-chip { color: var(--sa-muted); }
.sales-page.is-dark .range-chip.active { background: var(--sa-soft-strong); color: rgb(var(--v-theme-primary)); }
</style>
