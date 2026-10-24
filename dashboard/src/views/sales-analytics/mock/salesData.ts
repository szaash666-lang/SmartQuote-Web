/**
 * 销售数据分析工作台的本地 Mock 数据源（统一数据源）。
 *
 * 使用固定种子伪随机数生成器（mulberry32），保证每次刷新数据一致，
 * 所有 KPI / 图表 / 排行 / 漏斗 / 建议 / 匹配均从本文件的数据派生，口径统一。
 * 所有数据均为演示用途，不接入真实接口，不代表真实客户行为或产品性能。
 */
import type {
  CustomerProfile,
  DealStage,
  FollowupStatus,
  LostReason,
  Medium,
  ProductInfo,
  QuoteRecord,
} from '../types';

// ---------------------------------------------------------------------------
// 固定种子随机数
// ---------------------------------------------------------------------------

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20261022);

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)];
}

function between(min: number, max: number): number {
  return min + rand() * (max - min);
}

function intBetween(min: number, max: number): number {
  return Math.floor(between(min, max));
}

function pickWeighted<T>(items: readonly T[], weights: readonly number[]): T {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = rand() * total;
  for (let index = 0; index < items.length; index += 1) {
    roll -= weights[index];
    if (roll <= 0) return items[index];
  }
  return items[items.length - 1];
}

// ---------------------------------------------------------------------------
// 产品目录（含流量 / 扬程 / 材质 / 温度 参数，供智能匹配硬性过滤）
// ---------------------------------------------------------------------------

export const PRODUCTS: ProductInfo[] = [
  {
    sku: 'CP-32-125E',
    modelName: 'CP-32-125E 标准清水泵',
    category: '清水泵',
    priceCny: 4800,
    leadTimeDays: 7,
    mediums: ['clean_water'],
    flowMinM3h: 5,
    flowMaxM3h: 25,
    headMinM: 12,
    headMaxM: 28,
    material: 'HT200',
    tempMinC: 0,
    tempMaxC: 80,
  },
  {
    sku: 'CP-40-160E',
    modelName: 'CP-40-160E 高效清水泵',
    category: '清水泵',
    priceCny: 8500,
    leadTimeDays: 14,
    mediums: ['clean_water'],
    flowMinM3h: 15,
    flowMaxM3h: 45,
    headMinM: 20,
    headMaxM: 40,
    material: 'HT200',
    tempMinC: 0,
    tempMaxC: 80,
  },
  {
    sku: 'CP-40-160S',
    modelName: 'CP-40-160S 不锈钢泵',
    category: '不锈钢泵',
    priceCny: 12600,
    leadTimeDays: 21,
    mediums: ['clean_water', 'mild_corrosive'],
    flowMinM3h: 12,
    flowMaxM3h: 48,
    headMinM: 18,
    headMaxM: 42,
    material: '304',
    tempMinC: -10,
    tempMaxC: 110,
  },
  {
    sku: 'CP-50-200H',
    modelName: 'CP-50-200H 高扬程泵',
    category: '高扬程泵',
    priceCny: 21800,
    leadTimeDays: 28,
    mediums: ['clean_water'],
    flowMinM3h: 20,
    flowMaxM3h: 80,
    headMinM: 25,
    headMaxM: 55,
    material: 'HT200',
    tempMinC: 0,
    tempMaxC: 100,
  },
  {
    sku: 'CP-65-160X',
    modelName: 'CP-65-160X 耐腐蚀化工泵',
    category: '化工泵',
    priceCny: 32800,
    leadTimeDays: 35,
    mediums: ['mild_corrosive'],
    flowMinM3h: 30,
    flowMaxM3h: 120,
    headMinM: 22,
    headMaxM: 60,
    material: '316L',
    tempMinC: -20,
    tempMaxC: 150,
  },
  {
    sku: 'CP-80-200D',
    modelName: 'CP-80-200D 大流量双吸泵',
    category: '双吸泵',
    priceCny: 45600,
    leadTimeDays: 42,
    mediums: ['clean_water'],
    flowMinM3h: 80,
    flowMaxM3h: 240,
    headMinM: 15,
    headMaxM: 35,
    material: 'HT200',
    tempMinC: 0,
    tempMaxC: 90,
  },
];

// ---------------------------------------------------------------------------
// 客户画像（含活跃度与采购偏好）
// ---------------------------------------------------------------------------

export const CUSTOMERS: CustomerProfile[] = [
  { id: 'C-001', name: '华东水务集团', industry: '市政水处理', region: '华东', tier: 'A', preferredMedium: 'clean_water', avgBudgetCny: 300000, typicalFlowM3h: 60, typicalHeadM: 30, activityLevel: 'high', preferences: ['大批量采购', '关注交期'] },
  { id: 'C-002', name: '苏州绿源环保', industry: '环保工程', region: '华东', tier: 'A', preferredMedium: 'clean_water', avgBudgetCny: 180000, typicalFlowM3h: 35, typicalHeadM: 25, activityLevel: 'high', preferences: ['价格敏感', '关注能耗'] },
  { id: 'C-003', name: '广州日化工业', industry: '日化化工', region: '华南', tier: 'B', preferredMedium: 'mild_corrosive', avgBudgetCny: 220000, typicalFlowM3h: 40, typicalHeadM: 28, activityLevel: 'medium', preferences: ['偏好不锈钢', '小批量多批'] },
  { id: 'C-004', name: '成都蜀都制药', industry: '制药', region: '西南', tier: 'A', preferredMedium: 'mild_corrosive', avgBudgetCny: 350000, typicalFlowM3h: 25, typicalHeadM: 22, activityLevel: 'high', preferences: ['耐腐蚀优先', '关注卫生等级'] },
  { id: 'C-005', name: '青岛啤酒供应链', industry: '食品饮料', region: '华北', tier: 'B', preferredMedium: 'clean_water', avgBudgetCny: 150000, typicalFlowM3h: 50, typicalHeadM: 32, activityLevel: 'medium', preferences: ['关注交期', '大批量采购'] },
  { id: 'C-006', name: '武汉钢铁水处理', industry: '冶金', region: '华中', tier: 'A', preferredMedium: 'mild_corrosive', avgBudgetCny: 500000, typicalFlowM3h: 80, typicalHeadM: 45, activityLevel: 'high', preferences: ['耐腐蚀优先', '高扬程'] },
  { id: 'C-007', name: '宁波海天装备', industry: '装备制造', region: '华东', tier: 'B', preferredMedium: 'clean_water', avgBudgetCny: 120000, typicalFlowM3h: 30, typicalHeadM: 24, activityLevel: 'low', preferences: ['价格敏感', '关注交期'] },
  { id: 'C-008', name: '沈阳恒通热电', industry: '能源电力', region: '东北', tier: 'C', preferredMedium: 'clean_water', avgBudgetCny: 260000, typicalFlowM3h: 70, typicalHeadM: 35, activityLevel: 'low', preferences: ['关注能耗', '长期合作'] },
  { id: 'C-009', name: '佛山陶瓷新材料', industry: '建材', region: '华南', tier: 'C', preferredMedium: 'mild_corrosive', avgBudgetCny: 90000, typicalFlowM3h: 20, typicalHeadM: 18, activityLevel: 'low', preferences: ['价格敏感', '小批量'] },
  { id: 'C-010', name: '昆明水务科技', industry: '市政水处理', region: '西南', tier: 'B', preferredMedium: 'clean_water', avgBudgetCny: 200000, typicalFlowM3h: 45, typicalHeadM: 28, activityLevel: 'medium', preferences: ['关注交期', '大批量采购'] },
  { id: 'C-011', name: '无锡半导体材料', industry: '电子', region: '华东', tier: 'A', preferredMedium: 'mild_corrosive', avgBudgetCny: 420000, typicalFlowM3h: 28, typicalHeadM: 26, activityLevel: 'high', preferences: ['耐腐蚀优先', '高精度'] },
  { id: 'C-012', name: '兰州化工集团', industry: '化工', region: '西北', tier: 'B', preferredMedium: 'mild_corrosive', avgBudgetCny: 310000, typicalFlowM3h: 55, typicalHeadM: 40, activityLevel: 'medium', preferences: ['耐腐蚀优先', '长期合作'] },
];

// ---------------------------------------------------------------------------
// 报价记录生成
// ---------------------------------------------------------------------------

const LOST_REASON_WEIGHTS: Array<{ reason: LostReason; weight: number }> = [
  { reason: 'price', weight: 30 },
  { reason: 'competitor', weight: 22 },
  { reason: 'lead_time', weight: 16 },
  { reason: 'spec_mismatch', weight: 12 },
  { reason: 'budget', weight: 12 },
  { reason: 'no_decision', weight: 8 },
];

const LOST_STAGE_WEIGHTS: Array<{ stage: DealStage; weight: number }> = [
  { stage: 'quoted', weight: 55 },
  { stage: 'technical_review', weight: 28 },
  { stage: 'sales_confirmation', weight: 17 },
];

const PRODUCT_QUOTE_WEIGHTS = [3, 4, 3, 2, 2, 1];

const PRODUCT_WIN_BIAS: Record<string, number> = {
  'CP-32-125E': 0.9,
  'CP-40-160E': 1.0,
  'CP-40-160S': 1.35,
  'CP-50-200H': 1.25,
  'CP-65-160X': 1.1,
  'CP-80-200D': 0.7,
};

function genResponseHours(stage: DealStage): number {
  const base = stage === 'won' ? 14 : stage === 'lost' ? 60 : 30;
  const spread = stage === 'won' ? 22 : stage === 'lost' ? 90 : 48;
  return Math.max(2, Math.round(base + between(-spread / 2, spread)));
}

function genFollowupStatus(lastActivityDaysAgo: number, responseHours: number): FollowupStatus {
  if (lastActivityDaysAgo > 7) return 'overdue';
  if (responseHours > 72) return 'slow_response';
  return 'pending_reply';
}

function generateRecords(count: number): QuoteRecord[] {
  const records: QuoteRecord[] = [];
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  for (let index = 0; index < count; index += 1) {
    const customer = pick(CUSTOMERS);
    const product = pickWeighted(PRODUCTS, PRODUCT_QUOTE_WEIGHTS);
    const medium: Medium = product.mediums.includes(customer.preferredMedium)
      ? customer.preferredMedium
      : pick(product.mediums);

    const quantity = intBetween(1, 40);
    const amountCny = Math.round(product.priceCny * quantity * between(0.92, 1.08));

    const daysAgo = Math.floor(Math.pow(rand(), 0.7) * 364);
    const createdAt = new Date(now - daysAgo * dayMs - intBetween(0, 24) * 3600_000);

    const roll = rand();
    let stage: DealStage;
    let lostReason: LostReason | undefined;
    let lostAtStage: DealStage | undefined;

    if (roll < 0.26) {
      stage = 'lost';
      lostReason = pickWeighted(
        LOST_REASON_WEIGHTS.map((item) => item.reason),
        LOST_REASON_WEIGHTS.map((item) => item.weight),
      );
      lostAtStage = pickWeighted(
        LOST_STAGE_WEIGHTS.map((item) => item.stage),
        LOST_STAGE_WEIGHTS.map((item) => item.weight),
      );
    } else if (roll < 0.56) {
      stage = rand() < PRODUCT_WIN_BIAS[product.sku] * 0.8 ? 'won' : 'quoted';
    } else {
      stage = pickWeighted<DealStage>(
        ['inquiry', 'clarification', 'sales_confirmation', 'technical_review', 'quoted'],
        [0.8, 1.1, 1.4, 1.6, 2.1],
      );
    }

    const responseHours = genResponseHours(stage);
    let followupStatus: FollowupStatus;
    let followupCount: number;
    let lastActivityAt: string;
    let salesCycleDays: number | undefined;

    if (stage === 'won' || stage === 'lost') {
      followupStatus = 'none';
      followupCount = intBetween(0, 2);
      salesCycleDays = intBetween(5, 90);
      const closedAgoDays = Math.max(0, daysAgo - intBetween(0, 20));
      lastActivityAt = new Date(now - closedAgoDays * dayMs).toISOString();
    } else {
      const lastActivityDaysAgo = intBetween(0, 20);
      lastActivityAt = new Date(now - lastActivityDaysAgo * dayMs).toISOString();
      followupCount = intBetween(1, 3);
      followupStatus = genFollowupStatus(lastActivityDaysAgo, responseHours);
      salesCycleDays = undefined;
    }

    records.push({
      id: `RFQ-${createdAt.getFullYear()}${String(createdAt.getMonth() + 1).padStart(2, '0')}-${String(1000 + index).slice(1)}`,
      customerId: customer.id,
      customerName: customer.name,
      industry: customer.industry,
      region: customer.region,
      productSku: product.sku,
      modelName: product.modelName,
      quantity,
      amountCny,
      medium,
      stage,
      createdAt: createdAt.toISOString(),
      responseHours,
      followupStatus,
      followupCount,
      lastActivityAt,
      salesCycleDays,
      lostReason,
      lostAtStage,
    });
  }

  return records;
}

export const quoteRecords: QuoteRecord[] = generateRecords(160);
