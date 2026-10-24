/**
 * 销售数据分析工作台的核心组合式函数。
 *
 * - 使用模块级单例状态（reactive），让总览与各详情视图共享同一份筛选状态，
 *   返回总览时保留之前的选择。
 * - 所有 KPI / 趋势 / 客户 / 产品 / 漏斗 / 建议 / 匹配均从统一数据源 quoteRecords
 *   派生，口径一致（成交率 = 成交 / (成交 + 流失)）。
 */
import { computed, reactive } from 'vue';
import { CUSTOMERS, PRODUCTS, quoteRecords } from '../mock/salesData';
import {
  FOLLOWUP_PRIORITY_LABELS,
  LOST_REASON_LABELS,
  MATERIAL_LABELS,
  MEDIUM_LABELS,
  type ActionAdvice,
  type FollowupPriority,
  type FollowupStatus,
  type MatchDimension,
  type MatchInput,
  type MatchResult,
  type Material,
  type ProductInfo,
  type ProductPerformance,
  type QuoteRecord,
  type Verdict,
  type ViewKey,
} from '../types';

// ---------------------------------------------------------------------------
// 格式化工具（模块级，全站统一）
// ---------------------------------------------------------------------------

export function formatInt(value: number): string {
  return new Intl.NumberFormat('zh-CN').format(value);
}

export function formatCny(value: number): string {
  return `¥${new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(value)}`;
}

export function formatCompact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return `${value}`;
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

// ---------------------------------------------------------------------------
// 匹配引擎（纯函数，可解释）
// ---------------------------------------------------------------------------

const MATERIAL_RANK: Record<Material, number> = { HT200: 1, '304': 2, '316L': 3 };

function dimension(key: string, label: string, verdict: Verdict, detail: string): MatchDimension {
  return { key, label, verdict, detail };
}

function buildReason(
  dims: MatchDimension[],
  perf: ProductPerformance | null,
  sampleInsufficient: boolean,
  budgetFit: 'within' | 'over' | 'unknown',
  score: number,
): string {
  const fails = dims.filter((d) => d.verdict === 'fail').map((d) => d.label);
  if (fails.length) return `不满足：${fails.join('、')}。`;

  const parts: string[] = [];
  const insufficient = dims.filter((d) => d.verdict === 'insufficient').map((d) => d.label);
  if (insufficient.length) parts.push(`${insufficient.join('、')} 信息不足，需进一步确认`);
  else parts.push('流量/扬程/介质/材质/温度均满足');

  if (perf) {
    parts.push(sampleInsufficient ? `样本量不足（n=${perf.sampleSize}），成交率仅供参考` : `历史成交率 ${formatPercent(perf.winRate)}（样本 ${perf.sampleSize} 单）`);
  }

  if (budgetFit === 'within') parts.push('价格在预算内');
  else if (budgetFit === 'over') parts.push('价格超出预算');
  parts.push(`综合得分 ${score}`);

  return parts.join('；') + '。';
}

export function computeMatch(
  input: MatchInput,
  products: ProductInfo[],
  perfMap: Map<string, ProductPerformance>,
): MatchResult[] {
  return products.map((p) => {
    const dims: MatchDimension[] = [];

    if (input.flowM3h != null) {
      const ok = input.flowM3h >= p.flowMinM3h && input.flowM3h <= p.flowMaxM3h;
      dims.push(
        dimension('flow', '流量', ok ? 'pass' : 'fail', ok
          ? `${input.flowM3h} m³/h 落在 [${p.flowMinM3h}, ${p.flowMaxM3h}]`
          : `${input.flowM3h} m³/h 超出 [${p.flowMinM3h}, ${p.flowMaxM3h}]`),
      );
    } else {
      dims.push(dimension('flow', '流量', 'insufficient', '未提供流量'));
    }

    if (input.headM != null) {
      const ok = input.headM >= p.headMinM && input.headM <= p.headMaxM;
      dims.push(
        dimension('head', '扬程', ok ? 'pass' : 'fail', ok
          ? `${input.headM} m 落在 [${p.headMinM}, ${p.headMaxM}]`
          : `${input.headM} m 超出 [${p.headMinM}, ${p.headMaxM}]`),
      );
    } else {
      dims.push(dimension('head', '扬程', 'insufficient', '未提供扬程'));
    }

    if (input.medium != null) {
      const ok = p.mediums.includes(input.medium);
      dims.push(
        dimension('medium', '介质', ok ? 'pass' : 'fail', ok
          ? `支持${MEDIUM_LABELS[input.medium]}`
          : `不支持${MEDIUM_LABELS[input.medium]}`),
      );
    } else {
      dims.push(dimension('medium', '介质', 'insufficient', '未提供介质'));
    }

    if (input.material === 'any') {
      dims.push(dimension('material', '材质', 'pass', '未限定材质要求'));
    } else {
      const ok = MATERIAL_RANK[p.material] >= MATERIAL_RANK[input.material];
      dims.push(
        dimension('material', '材质', ok ? 'pass' : 'fail', ok
          ? `${MATERIAL_LABELS[p.material]} 满足「${MATERIAL_LABELS[input.material]}及以上」`
          : `${MATERIAL_LABELS[p.material]} 不满足「${MATERIAL_LABELS[input.material]}及以上」`),
      );
    }

    if (input.tempC == null) {
      dims.push(dimension('temp', '温度', 'insufficient', '未提供温度，未做温度校验'));
    } else if (p.tempMinC == null || p.tempMaxC == null) {
      dims.push(dimension('temp', '温度', 'insufficient', '产品温度参数缺失，需进一步确认'));
    } else {
      const ok = input.tempC >= p.tempMinC && input.tempC <= p.tempMaxC;
      dims.push(
        dimension('temp', '温度', ok ? 'pass' : 'fail', ok
          ? `${input.tempC}°C 落在 [${p.tempMinC}, ${p.tempMaxC}]`
          : `${input.tempC}°C 超出 [${p.tempMinC}, ${p.tempMaxC}]`),
      );
    }

    const qualified = !dims.some((d) => d.verdict === 'fail');
    const perf = perfMap.get(p.sku) ?? null;
    const sampleInsufficient = perf == null || perf.sampleSize < 5;
    const effWinRate = sampleInsufficient ? 0.5 : (perf?.winRate ?? 0.5);

    let budgetFit: 'within' | 'over' | 'unknown' = 'unknown';
    if (input.budgetCny != null) budgetFit = p.priceCny <= input.budgetCny ? 'within' : 'over';

    let score = 0;
    if (qualified) {
      const centerFlow = (p.flowMinM3h + p.flowMaxM3h) / 2;
      const halfFlow = Math.max(1, (p.flowMaxM3h - p.flowMinM3h) / 2);
      const flowFit = input.flowM3h != null ? Math.max(0, 1 - Math.abs(input.flowM3h - centerFlow) / halfFlow) : 0.5;
      const centerHead = (p.headMinM + p.headMaxM) / 2;
      const halfHead = Math.max(1, (p.headMaxM - p.headMinM) / 2);
      const headFit = input.headM != null ? Math.max(0, 1 - Math.abs(input.headM - centerHead) / halfHead) : 0.5;

      const techScore = ((flowFit + headFit) / 2) * 50;
      const histScore = effWinRate * 30;
      const budgetScore = budgetFit === 'within' ? 15 : budgetFit === 'over' ? 0 : 7;
      const leadScore = (1 - p.leadTimeDays / 42) * 5;
      score = Math.round(techScore + histScore + budgetScore + leadScore);
    }

    return {
      sku: p.sku,
      modelName: p.modelName,
      category: p.category,
      priceCny: p.priceCny,
      leadTimeDays: p.leadTimeDays,
      score,
      dimensions: dims,
      qualified,
      reason: buildReason(dims, perf, sampleInsufficient, budgetFit, score),
      performance: perf,
      sampleInsufficient,
      budgetFit,
    };
  });
}

// ---------------------------------------------------------------------------
// 模块级单例状态（跨视图共享，返回总览时保留筛选）
// ---------------------------------------------------------------------------

const state = reactive({
  currentView: 'overview' as ViewKey,
  timeRange: 12,
  performanceStatus: 'all' as 'all' | 'pending' | 'won' | 'lost',
  customerFilter: 'all',
  followupStatusFilter: 'all' as FollowupStatus | 'all',
  followupPriorityFilter: 'all' as FollowupPriority | 'all',
  decisionFilter: 'all' as 'all' | 'high' | 'medium' | 'low',
  handledAdviceIds: [] as string[],
  followupOverrides: {} as Record<string, FollowupStatus>,
});

function followupPriority(record: QuoteRecord): FollowupPriority {
  if (record.followupStatus === 'overdue') return 'high';
  if (record.followupStatus === 'slow_response') return 'medium';
  return record.amountCny > 200000 ? 'medium' : 'low';
}

const PRIORITY_RANK: Record<FollowupPriority, number> = { high: 0, medium: 1, low: 2 };

// ---------------------------------------------------------------------------
// 组合式函数
// ---------------------------------------------------------------------------

export function useSalesAnalytics() {
  const cutoff = computed(() => {
    const date = new Date();
    date.setMonth(date.getMonth() - state.timeRange);
    date.setDate(1);
    date.setHours(0, 0, 0, 0);
    return date;
  });

  const filteredRecords = computed(() =>
    quoteRecords.filter((r) => new Date(r.createdAt) >= cutoff.value),
  );

  const wonRecords = computed(() => filteredRecords.value.filter((r) => r.stage === 'won'));
  const lostRecords = computed(() => filteredRecords.value.filter((r) => r.stage === 'lost'));
  const pendingRecords = computed(() =>
    filteredRecords.value.filter((r) => r.stage !== 'won' && r.stage !== 'lost'),
  );

  const winRate = computed(() => {
    const closed = wonRecords.value.length + lostRecords.value.length;
    return closed ? wonRecords.value.length / closed : 0;
  });

  const totalRevenue = computed(() =>
    wonRecords.value.reduce((sum, r) => sum + r.amountCny, 0),
  );

  const pendingFollowups = computed(
    () => filteredRecords.value.filter((r) => r.followupStatus !== 'none').length,
  );

  const kpi = computed(() => ({
    quoteCount: filteredRecords.value.length,
    winRate: winRate.value,
    revenue: totalRevenue.value,
    pendingFollowups: pendingFollowups.value,
  }));

  // 趋势（按月）
  const monthLabels = computed(() => {
    const labels: string[] = [];
    const cursor = new Date(cutoff.value);
    const now = new Date();
    while (cursor <= now) {
      labels.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return labels;
  });

  function monthKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  const trendSeries = computed(() => {
    const quotes = new Array(monthLabels.value.length).fill(0);
    const won = new Array(monthLabels.value.length).fill(0);
    const lost = new Array(monthLabels.value.length).fill(0);
    for (const r of filteredRecords.value) {
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

  // 产品历史表现（成交率口径：won / (won + lost)）
  const productPerformanceMap = computed(() => {
    const map = new Map<string, ProductPerformance>();
    for (const p of PRODUCTS) {
      const records = filteredRecords.value.filter((r) => r.productSku === p.sku);
      const won = records.filter((r) => r.stage === 'won').length;
      const lost = records.filter((r) => r.stage === 'lost').length;
      map.set(p.sku, {
        sku: p.sku,
        modelName: p.modelName,
        category: p.category,
        quoteCount: records.length,
        wonCount: won,
        winRate: won + lost ? won / (won + lost) : 0,
        revenueCny: records.filter((r) => r.stage === 'won').reduce((sum, r) => sum + r.amountCny, 0),
        sampleSize: won + lost,
      });
    }
    return map;
  });

  const productPerformance = computed(() =>
    [...productPerformanceMap.value.values()].sort((a, b) => b.quoteCount - a.quoteCount),
  );

  // 客户统计
  const customerStats = computed(() => {
    return CUSTOMERS.map((c) => {
      const records = filteredRecords.value.filter((r) => r.customerId === c.id);
      const won = records.filter((r) => r.stage === 'won').length;
      const lost = records.filter((r) => r.stage === 'lost').length;
      const last = records.reduce<number>((max, r) => Math.max(max, new Date(r.lastActivityAt).getTime()), 0);
      return {
        ...c,
        quoteCount: records.length,
        wonCount: won,
        winRate: won + lost ? won / (won + lost) : 0,
        totalAmount: records.reduce((sum, r) => sum + r.amountCny, 0),
        lastActivityAt: last ? new Date(last).toISOString() : null,
        records,
      };
    });
  });

  // 成交转化漏斗：询价 → 已报价 → 已跟进 → 成交
  const funnel = computed(() => {
    const inquiry = filteredRecords.value.length;
    const quoted = filteredRecords.value.filter((r) => ['quoted', 'won', 'lost'].includes(r.stage)).length;
    const followed = filteredRecords.value.filter(
      (r) => ['quoted', 'won', 'lost'].includes(r.stage) && r.followupCount > 0,
    ).length;
    const won = wonRecords.value.length;
    const levels = [
      { key: 'inquiry', label: '询价', count: inquiry },
      { key: 'quoted', label: '已报价', count: quoted },
      { key: 'followed', label: '已跟进', count: followed },
      { key: 'won', label: '成交', count: won },
    ];
    const max = inquiry || 1;
    return levels.map((level, index) => ({
      ...level,
      pct: Math.round((level.count / max) * 100),
      rate: index === 0 ? 100 : levels[index - 1].count ? Math.round((level.count / levels[index - 1].count) * 100) : 0,
    }));
  });

  const lostReasonBreakdown = computed(() => {
    const map = new Map<string, number>();
    for (const r of lostRecords.value) {
      const key = r.lostReason ?? 'no_decision';
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([key, count]) => ({ key, label: LOST_REASON_LABELS[key as keyof typeof LOST_REASON_LABELS] ?? key, count }))
      .sort((a, b) => b.count - a.count);
  });

  const avgSalesCycleDays = computed(() => {
    const closed = filteredRecords.value.filter((r) => r.salesCycleDays != null);
    return closed.length
      ? Math.round(closed.reduce((sum, r) => sum + (r.salesCycleDays ?? 0), 0) / closed.length)
      : 0;
  });

  // 跟进列表（应用本地模拟的状态覆盖）
  const followups = computed(() => {
    return filteredRecords.value
      .map((r) => {
        const effectiveStatus = state.followupOverrides[r.id] ?? r.followupStatus;
        const effective = { ...r, followupStatus: effectiveStatus };
        return { ...effective, priority: followupPriority(effective) };
      })
      .filter((r) => r.followupStatus !== 'none')
      .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
  });

  // 智能决策建议
  const advice = computed<ActionAdvice[]>(() => {
    const list: ActionAdvice[] = [];
    const overallWin = winRate.value;

    if (overallWin < 0.5) {
      list.push({
        id: 'advice-win-rate',
        priority: 'high',
        title: '整体成交率偏低',
        detail: `当前成交率 ${formatPercent(overallWin)}，建议复盘报价定价与竞品对标。`,
        trigger: `成交率 ${formatPercent(overallWin)} 低于 50%`,
        related: '全部报价',
        handled: state.handledAdviceIds.includes('advice-win-rate'),
      });
    }

    const topLost = lostReasonBreakdown.value[0];
    if (topLost?.key === 'price') {
      list.push({
        id: 'advice-price',
        priority: 'high',
        title: '价格是首要失单原因',
        detail: `${topLost.count} 单因价格流失，建议对高频型号制定阶梯报价或含税 / 运费打包方案。`,
        trigger: `失单原因「价格偏高」占比最高（${topLost.count} 单）`,
        related: '失单分析',
        handled: state.handledAdviceIds.includes('advice-price'),
      });
    }
    if (topLost?.key === 'lead_time') {
      list.push({
        id: 'advice-lead-time',
        priority: 'high',
        title: '交期不满足导致流失',
        detail: '建议提前备货或在前端明确承诺交期，降低客户等待焦虑。',
        trigger: `失单原因「交期不满足」占比最高（${topLost.count} 单）`,
        related: '失单分析',
        handled: state.handledAdviceIds.includes('advice-lead-time'),
      });
    }

    const hotLowWin = productPerformance.value
      .filter((p) => p.quoteCount >= 8 && p.winRate < overallWin)
      .slice(0, 1)[0];
    if (hotLowWin) {
      list.push({
        id: 'advice-hot-low-win',
        priority: 'medium',
        title: `热门型号 ${hotLowWin.sku} 成交率偏低`,
        detail: `报价 ${hotLowWin.quoteCount} 次但成交率仅 ${formatPercent(hotLowWin.winRate)}，需排查型号匹配度或价格竞争力。`,
        trigger: `报价量 ≥ 8 且成交率 ${formatPercent(hotLowWin.winRate)} < 整体 ${formatPercent(overallWin)}`,
        related: `产品 ${hotLowWin.sku}`,
        handled: state.handledAdviceIds.includes('advice-hot-low-win'),
      });
    }

    const overdueCount = followups.value.filter((f) => f.followupStatus === 'overdue').length;
    if (overdueCount > 0) {
      list.push({
        id: 'advice-overdue',
        priority: 'high',
        title: `${overdueCount} 条逾期跟进待处理`,
        detail: '建议优先联系逾期客户，确认项目进度并推动下一步。',
        trigger: `存在 ${overdueCount} 条「逾期跟进」`,
        related: '跟进与商机',
        handled: state.handledAdviceIds.includes('advice-overdue'),
      });
    }

    const topPush = [...productPerformance.value].sort((a, b) => b.winRate - a.winRate)[0];
    if (topPush && topPush.sampleSize >= 5) {
      list.push({
        id: 'advice-top-push',
        priority: 'low',
        title: `建议主推 ${topPush.sku}`,
        detail: `成交率 ${formatPercent(topPush.winRate)}、累计成交额 ${formatCny(topPush.revenueCny)}，适合作为重点推荐型号。`,
        trigger: `成交率最高且样本 ≥ 5（${topPush.sampleSize} 单）`,
        related: `产品 ${topPush.sku}`,
        handled: state.handledAdviceIds.includes('advice-top-push'),
      });
    }

    return list;
  });

  // -------------------------------------------------------------------------
  // 动作
  // -------------------------------------------------------------------------

  function setView(view: ViewKey) {
    state.currentView = view;
  }

  function goBack() {
    state.currentView = 'overview';
  }

  function markAdviceHandled(id: string) {
    if (!state.handledAdviceIds.includes(id)) state.handledAdviceIds.push(id);
  }

  function updateFollowupStatus(id: string, status: FollowupStatus) {
    state.followupOverrides[id] = status;
  }

  function matchProducts(input: MatchInput): MatchResult[] {
    return computeMatch(input, PRODUCTS, productPerformanceMap.value);
  }

  return {
    state,
    cutoff,
    filteredRecords,
    wonRecords,
    lostRecords,
    pendingRecords,
    winRate,
    kpi,
    monthLabels,
    trendSeries,
    productPerformance,
    productPerformanceMap,
    customerStats,
    funnel,
    lostReasonBreakdown,
    avgSalesCycleDays,
    followups,
    advice,
    setView,
    goBack,
    markAdviceHandled,
    updateFollowupStatus,
    matchProducts,
  };
}

export { FOLLOWUP_PRIORITY_LABELS };
