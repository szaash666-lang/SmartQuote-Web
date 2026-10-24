<template>
  <DetailShell title="智能产品匹配" subtitle="先做硬性技术过滤，再对合格品透明排序（演示数据）">
    <div class="match-layout">
      <!-- 需求输入 -->
      <aside class="panel form-panel">
        <div class="panel__title">需求输入</div>
        <v-select
          v-model="customerId"
          :items="customerOptions"
          item-title="title"
          item-value="value"
          density="compact"
          variant="outlined"
          hide-details
          label="选择客户（或手动填写）"
          @update:model-value="onSelectCustomer"
        />
        <v-text-field v-model="flowStr" type="number" density="compact" variant="outlined" hide-details label="流量 (m³/h)" />
        <v-text-field v-model="headStr" type="number" density="compact" variant="outlined" hide-details label="扬程 (m)" />
        <v-select v-model="medium" :items="MEDIUM_OPTIONS" item-title="title" item-value="value" density="compact" variant="outlined" hide-details label="输送介质" />
        <v-select v-model="material" :items="MATERIAL_OPTIONS" item-title="title" item-value="value" density="compact" variant="outlined" hide-details label="材质要求" />
        <v-text-field v-model="tempStr" type="number" density="compact" variant="outlined" hide-details label="温度 (°C)（可选）" />
        <v-text-field v-model="budgetStr" type="number" density="compact" variant="outlined" hide-details label="预算 (CNY)（可选）" />
        <div class="form-note">
          硬性技术条件（流量 / 扬程 / 介质 / 材质 / 温度）：✗ 即排除；历史成交率 / 热销仅用于合格品排序；预算为商务适配，不参与硬性过滤。
        </div>
      </aside>

      <!-- 匹配结果 -->
      <div class="results">
        <div v-if="!hasCore" class="panel insufficient">
          <div class="insufficient__icon"><AlertCircle :size="26" /></div>
          <div>
            <strong>信息不足，无法确认匹配</strong>
            <p>请至少填写「流量、扬程、输送介质」后自动匹配；缺失参数不会被默认判定为满足。</p>
          </div>
        </div>

        <template v-else>
          <div v-if="topPick" class="panel top-pick">
            <div class="top-pick__head">
              <span class="top-pick__rank">首选产品</span>
              <span class="top-pick__score">{{ topPick.score }} 分</span>
            </div>
            <h3>{{ topPick.modelName }}</h3>
            <p class="top-pick__reason">{{ topPick.reason }}</p>
            <div class="dim-list">
              <span v-for="d in topPick.dimensions" :key="d.key" class="dim" :class="`dim--${d.verdict}`">
                <i>{{ verdictIcon(d.verdict) }}</i>{{ d.label }}：{{ d.detail }}
              </span>
            </div>
          </div>
          <div v-else class="panel insufficient">
            <strong>无符合硬性技术条件的产品</strong>
            <p>请调整流量 / 扬程 / 介质 / 材质 / 温度条件后重试。</p>
          </div>

          <div class="panel">
            <div class="panel__title">匹配结果（{{ results.length }}）</div>
            <div v-for="item in sortedResults" :key="item.sku" class="result-row" :class="{ 'result-row--unqualified': !item.qualified }">
              <div class="result-row__main">
                <span class="result-row__sku">{{ item.sku }}</span>
                <span class="result-row__name">{{ item.modelName }}</span>
                <span class="result-row__price">{{ formatCny(item.priceCny) }}</span>
                <span class="result-row__score">{{ item.score }} 分</span>
                <v-chip v-if="item.sampleInsufficient" size="x-small" color="warning" variant="tonal">样本不足</v-chip>
                <v-chip size="x-small" :color="budgetTone(item.budgetFit)" variant="tonal">{{ budgetLabel(item.budgetFit) }}</v-chip>
              </div>
              <div class="result-row__dims">
                <span v-for="d in item.dimensions" :key="d.key" class="dim" :class="`dim--${d.verdict}`">
                  <i>{{ verdictIcon(d.verdict) }}</i>{{ d.label }}
                </span>
              </div>
              <p class="result-row__reason">{{ item.reason }}</p>
              <div class="result-row__actions">
                <v-btn size="x-small" variant="tonal" :disabled="!item.qualified" @click="toggleCompare(item.sku)">
                  {{ compareSet.includes(item.sku) ? '移除对比' : '加入对比' }}
                </v-btn>
              </div>
            </div>
          </div>

          <div v-if="compareItems.length" class="panel">
            <div class="panel__title">关键参数对比</div>
            <div class="compare-table">
              <table>
                <thead>
                  <tr>
                    <th>参数</th>
                    <th v-for="item in compareItems" :key="item.sku">{{ item.sku }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td>流量区间 (m³/h)</td><td v-for="item in compareItems" :key="item.sku">{{ item.flowMinM3h }}–{{ item.flowMaxM3h }}</td></tr>
                  <tr><td>扬程区间 (m)</td><td v-for="item in compareItems" :key="item.sku">{{ item.headMinM }}–{{ item.headMaxM }}</td></tr>
                  <tr><td>介质</td><td v-for="item in compareItems" :key="item.sku">{{ item.mediums.map((m) => MEDIUM_LABELS[m]).join(' / ') }}</td></tr>
                  <tr><td>材质</td><td v-for="item in compareItems" :key="item.sku">{{ MATERIAL_LABELS[item.material] }}</td></tr>
                  <tr><td>温度 (°C)</td><td v-for="item in compareItems" :key="item.sku">{{ item.tempLabel }}</td></tr>
                  <tr><td>参考价</td><td v-for="item in compareItems" :key="item.sku">{{ formatCny(item.priceCny) }}</td></tr>
                  <tr><td>交期 (天)</td><td v-for="item in compareItems" :key="item.sku">{{ item.leadTimeDays }}</td></tr>
                  <tr><td>成交率</td><td v-for="item in compareItems" :key="item.sku">{{ item.winRateLabel }}</td></tr>
                  <tr><td>样本量</td><td v-for="item in compareItems" :key="item.sku">{{ item.sampleLabel }}</td></tr>
                  <tr><td>匹配得分</td><td v-for="item in compareItems" :key="item.sku">{{ item.score }}</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="panel">
            <div class="panel__title">推荐摘要</div>
            <v-btn size="small" color="primary" variant="tonal" @click="generateSummary">
              <FileText :size="15" class="mr-1" />生成推荐摘要
            </v-btn>
            <pre v-if="summaryText" class="summary-text">{{ summaryText }}</pre>
          </div>
        </template>
      </div>
    </div>
  </DetailShell>
</template>

<script setup lang="ts">
import { AlertCircle, FileText } from '@lucide/vue';
import { computed, ref } from 'vue';
import DetailShell from './shared/DetailShell.vue';
import { PRODUCTS, CUSTOMERS } from '@/views/sales-analytics/mock/salesData';
import { formatCny, formatPercent, useSalesAnalytics } from '@/views/sales-analytics/composables/useSalesAnalytics';
import { MATERIAL_LABELS, MEDIUM_LABELS, type Material, type MatchInput, type Medium, type Verdict } from '@/views/sales-analytics/types';

const { matchProducts } = useSalesAnalytics();

const MEDIUM_OPTIONS = [
  { value: 'clean_water', title: '清水' },
  { value: 'mild_corrosive', title: '弱腐蚀' },
];
const MATERIAL_OPTIONS = [
  { value: 'any', title: '不限' },
  { value: 'HT200', title: '铸铁 HT200' },
  { value: '304', title: '不锈钢 304' },
  { value: '316L', title: '耐腐蚀 316L' },
];

const customerId = ref('manual');
const flowStr = ref('');
const headStr = ref('');
const medium = ref<Medium | null>(null);
const material = ref<Material | 'any'>('any');
const tempStr = ref('');
const budgetStr = ref('');

const customerOptions = computed(() => [
  { value: 'manual', title: '手动填写需求' },
  ...CUSTOMERS.map((c) => ({ value: c.id, title: c.name })),
]);

function onSelectCustomer(id: unknown) {
  const key = String(id);
  if (key === 'manual') return;
  const customer = CUSTOMERS.find((c) => c.id === key);
  if (!customer) return;
  flowStr.value = String(customer.typicalFlowM3h);
  headStr.value = String(customer.typicalHeadM);
  medium.value = customer.preferredMedium;
  budgetStr.value = String(customer.avgBudgetCny);
  material.value = customer.preferences.includes('耐腐蚀优先')
    ? '316L'
    : customer.preferences.includes('偏好不锈钢')
      ? '304'
      : 'any';
}

const matchInput = computed<MatchInput>(() => ({
  flowM3h: flowStr.value === '' ? null : Number(flowStr.value),
  headM: headStr.value === '' ? null : Number(headStr.value),
  medium: medium.value,
  material: material.value,
  tempC: tempStr.value === '' ? null : Number(tempStr.value),
  budgetCny: budgetStr.value === '' ? null : Number(budgetStr.value),
}));

const hasCore = computed(
  () => matchInput.value.flowM3h != null && matchInput.value.headM != null && matchInput.value.medium != null,
);

const results = computed(() => (hasCore.value ? matchProducts(matchInput.value) : []));

const sortedResults = computed(() =>
  [...results.value].sort((a, b) => {
    if (a.qualified !== b.qualified) return a.qualified ? -1 : 1;
    return b.score - a.score;
  }),
);

const topPick = computed(() => sortedResults.value.find((r) => r.qualified) ?? null);

const compareSet = ref<string[]>([]);
function toggleCompare(sku: string) {
  if (compareSet.value.includes(sku)) {
    compareSet.value = compareSet.value.filter((s) => s !== sku);
  } else if (compareSet.value.length < 3) {
    compareSet.value = [...compareSet.value, sku];
  }
}

const compareItems = computed(() =>
  compareSet.value
    .map((sku) => {
      const product = PRODUCTS.find((p) => p.sku === sku);
      const result = results.value.find((r) => r.sku === sku);
      if (!product || !result) return null;
      const perf = result.performance;
      return {
        sku: product.sku,
        modelName: product.modelName,
        flowMinM3h: product.flowMinM3h,
        flowMaxM3h: product.flowMaxM3h,
        headMinM: product.headMinM,
        headMaxM: product.headMaxM,
        mediums: product.mediums,
        material: product.material,
        tempLabel: product.tempMinC != null && product.tempMaxC != null ? `${product.tempMinC}–${product.tempMaxC}` : '信息不足',
        priceCny: product.priceCny,
        leadTimeDays: product.leadTimeDays,
        winRateLabel: perf ? formatPercent(perf.winRate) : '—',
        sampleLabel: perf ? `${perf.sampleSize} 单` : '—',
        score: result.score,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x != null),
);

function verdictIcon(verdict: Verdict): string {
  if (verdict === 'pass') return '✓';
  if (verdict === 'fail') return '✗';
  return '?';
}

function budgetTone(fit: 'within' | 'over' | 'unknown'): string {
  if (fit === 'within') return 'success';
  if (fit === 'over') return 'error';
  return 'default';
}

function budgetLabel(fit: 'within' | 'over' | 'unknown'): string {
  if (fit === 'within') return '预算内';
  if (fit === 'over') return '超预算';
  return '未提供预算';
}

const summaryText = ref('');
function generateSummary() {
  const pick = topPick.value;
  if (!pick) {
    summaryText.value = '（无法生成摘要：当前没有符合硬性技术条件的产品。）';
    return;
  }
  const dims = pick.dimensions
    .filter((d) => d.verdict === 'pass')
    .map((d) => d.label)
    .join('、');
  const missing = pick.dimensions.filter((d) => d.verdict === 'insufficient').map((d) => d.label);
  summaryText.value = [
    '【本地模拟推荐摘要 · 未创建真实报价，未调用 AI】',
    `首选：${pick.modelName}（${pick.sku}）`,
    `匹配得分：${pick.score}，参考价 ${formatCny(pick.priceCny)}，交期 ${pick.leadTimeDays} 天`,
    `满足项：${dims || '—'}`,
    missing.length ? `待确认项：${missing.join('、')} 信息不足，需进一步确认` : '',
    pick.budgetFit === 'within' ? '预算：在预算内' : pick.budgetFit === 'over' ? '预算：超出预算' : '预算：未提供',
    pick.sampleInsufficient ? `历史成交率样本不足（n=${pick.performance?.sampleSize ?? 0}），仅供参考` : `历史成交率 ${formatPercent(pick.performance?.winRate ?? 0)}`,
  ].filter(Boolean).join('\n');
}
</script>

<style scoped>
.match-layout {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.panel {
  border: 1px solid var(--sa-border);
  border-radius: 14px;
  background: var(--sa-card);
  padding: 18px;
}

.panel__title {
  margin-bottom: 12px;
  font-size: 15px;
  font-weight: 650;
}

.form-panel {
  display: grid;
  gap: 10px;
  position: sticky;
  top: 0;
}

.form-note {
  color: var(--sa-muted);
  font-size: 11px;
  line-height: 1.6;
}

.results {
  display: grid;
  gap: 16px;
}

.insufficient {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  border: 1px dashed var(--sa-border-strong);
}

.insufficient__icon { color: rgb(var(--v-theme-warning)); flex: 0 0 auto; }
.insufficient p { margin: 4px 0 0; color: var(--sa-muted); font-size: 12px; }

.top-pick {
  border-color: rgb(var(--v-theme-primary));
  background: linear-gradient(180deg, rgba(var(--v-theme-primary), 0.06), var(--sa-card));
}

.top-pick__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.top-pick__rank {
  border-radius: 999px;
  background: rgb(var(--v-theme-primary));
  color: #fff;
  padding: 4px 12px;
  font-size: 11px;
  font-weight: 700;
}

.top-pick__score { font-size: 22px; font-weight: 700; color: rgb(var(--v-theme-primary)); }
.top-pick h3 { margin: 10px 0 4px; font-size: 18px; }
.top-pick__reason { margin: 0 0 10px; color: var(--sa-muted); font-size: 12px; line-height: 1.5; }

.dim-list {
  display: grid;
  gap: 4px;
}

.dim {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--sa-muted);
}

.dim i { font-style: normal; font-weight: 700; }
.dim--pass i { color: rgb(var(--v-theme-success)); }
.dim--fail i { color: rgb(var(--v-theme-error)); }
.dim--insufficient i { color: rgb(var(--v-theme-warning)); }

.result-row {
  display: grid;
  gap: 8px;
  padding: 12px 0;
  border-bottom: 1px solid var(--sa-border);
}

.result-row:last-child { border-bottom: 0; }
.result-row--unqualified { opacity: 0.55; }

.result-row__main {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.result-row__sku { font-size: 11px; color: var(--sa-subtle); }
.result-row__name { flex: 1; min-width: 140px; font-weight: 600; }
.result-row__price { font-variant-numeric: tabular-nums; }
.result-row__score { font-weight: 700; color: rgb(var(--v-theme-primary)); }

.result-row__dims {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.result-row__reason {
  margin: 0;
  color: var(--sa-muted);
  font-size: 12px;
  line-height: 1.5;
}

.compare-table {
  overflow-x: auto;
}

.compare-table table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.compare-table th,
.compare-table td {
  padding: 8px 10px;
  text-align: left;
  border-bottom: 1px solid var(--sa-border);
}

.compare-table th {
  color: rgb(var(--v-theme-primary));
  font-weight: 700;
}

.summary-text {
  margin: 12px 0 0;
  border-radius: 8px;
  background: var(--sa-soft);
  padding: 12px;
  color: var(--sa-text);
  font-family: inherit;
  font-size: 12px;
  line-height: 1.7;
  white-space: pre-wrap;
}

@media (max-width: 1080px) {
  .match-layout { grid-template-columns: 1fr; }
  .form-panel { position: static; }
}
</style>
