/**
 * 销售数据分析工作台的本地类型定义。
 *
 * 只服务于前端 mock 展示，独立于 `@/features/rfq/types.ts`，
 * 因此可以在不接入后端的情况下自行扩展跟进、匹配、决策等分析字段。
 */

export type Medium = 'clean_water' | 'mild_corrosive';

/** 过流材质（按耐腐蚀等级递增：HT200 < 304 < 316L）。 */
export type Material = 'HT200' | '304' | '316L';

/** 询价漏斗各阶段（比后端多出 won / lost 两个用于分析的终态）。 */
export type DealStage =
  | 'inquiry'
  | 'clarification'
  | 'sales_confirmation'
  | 'technical_review'
  | 'quoted'
  | 'won'
  | 'lost';

export type LostReason =
  | 'price'
  | 'lead_time'
  | 'spec_mismatch'
  | 'budget'
  | 'competitor'
  | 'no_decision';

export type FollowupStatus = 'pending_reply' | 'slow_response' | 'overdue' | 'none';

export type FollowupPriority = 'high' | 'medium' | 'low';

/** 产品目录条目（含匹配所需的扬程 / 材质 / 温度参数）。 */
export interface ProductInfo {
  sku: string;
  modelName: string;
  category: string;
  priceCny: number;
  leadTimeDays: number;
  mediums: Medium[];
  flowMinM3h: number;
  flowMaxM3h: number;
  headMinM: number;
  headMaxM: number;
  material: Material;
  tempMinC: number | null;
  tempMaxC: number | null;
}

/** 客户画像。 */
export interface CustomerProfile {
  id: string;
  name: string;
  industry: string;
  region: string;
  tier: 'A' | 'B' | 'C';
  preferredMedium: Medium;
  avgBudgetCny: number;
  typicalFlowM3h: number;
  typicalHeadM: number;
  activityLevel: 'high' | 'medium' | 'low';
  preferences: string[];
}

/** 单条报价 / 询价记录。 */
export interface QuoteRecord {
  id: string;
  customerId: string;
  customerName: string;
  industry: string;
  region: string;
  productSku: string;
  modelName: string;
  quantity: number;
  amountCny: number;
  medium: Medium;
  stage: DealStage;
  createdAt: string;
  responseHours: number;
  followupStatus: FollowupStatus;
  followupCount: number;
  lastActivityAt: string;
  salesCycleDays?: number;
  lostReason?: LostReason;
  lostAtStage?: DealStage;
}

export const STAGE_ORDER: DealStage[] = [
  'inquiry',
  'clarification',
  'sales_confirmation',
  'technical_review',
  'quoted',
];

export const STAGE_LABELS: Record<DealStage, string> = {
  inquiry: '询价',
  clarification: '补充参数',
  sales_confirmation: '销售确认',
  technical_review: '工程审批',
  quoted: '已报价',
  won: '成交',
  lost: '流失',
};

export const LOST_REASON_LABELS: Record<LostReason, string> = {
  price: '价格偏高',
  lead_time: '交期不满足',
  spec_mismatch: '型号不匹配',
  budget: '预算不足',
  competitor: '竞品中标',
  no_decision: '客户搁置',
};

export const MEDIUM_LABELS: Record<Medium, string> = {
  clean_water: '清水',
  mild_corrosive: '弱腐蚀',
};

export const MATERIAL_LABELS: Record<Material, string> = {
  HT200: '铸铁 HT200',
  '304': '不锈钢 304',
  '316L': '耐腐蚀 316L',
};

export const FOLLOWUP_STATUS_LABELS: Record<FollowupStatus, string> = {
  pending_reply: '待回复',
  slow_response: '响应较慢',
  overdue: '逾期跟进',
  none: '无需跟进',
};

export const FOLLOWUP_PRIORITY_LABELS: Record<FollowupPriority, string> = {
  high: '高',
  medium: '中',
  low: '低',
};

/** 智能决策建议（含可标记的已处理状态）。 */
export interface ActionAdvice {
  id: string;
  priority: 'high' | 'medium' | 'low';
  title: string;
  detail: string;
  trigger: string;
  related: string;
  handled: boolean;
}

/** 产品历史表现（成交率口径：won / (won + lost)）。 */
export interface ProductPerformance {
  sku: string;
  modelName: string;
  category: string;
  quoteCount: number;
  wonCount: number;
  winRate: number;
  revenueCny: number;
  sampleSize: number;
}

/** 匹配维度判定：满足 / 不满足 / 信息不足。 */
export type Verdict = 'pass' | 'fail' | 'insufficient';

export interface MatchDimension {
  key: string;
  label: string;
  verdict: Verdict;
  detail: string;
}

export interface MatchResult {
  sku: string;
  modelName: string;
  category: string;
  priceCny: number;
  leadTimeDays: number;
  score: number;
  dimensions: MatchDimension[];
  qualified: boolean;
  reason: string;
  performance: ProductPerformance | null;
  sampleInsufficient: boolean;
  budgetFit: 'within' | 'over' | 'unknown';
}

export interface MatchInput {
  flowM3h: number | null;
  headM: number | null;
  medium: Medium | null;
  material: Material | 'any';
  tempC: number | null;
  budgetCny: number | null;
}

/** 工作台视图标识。 */
export type ViewKey =
  | 'overview'
  | 'performance'
  | 'customers'
  | 'matching'
  | 'followup'
  | 'conversion'
  | 'advice';
