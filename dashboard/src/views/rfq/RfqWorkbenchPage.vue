<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useDisplay } from 'vuetify';
import {
  AlertTriangle,
  Check,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Copy,
  Download,
  FileSpreadsheet,
  Menu,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Upload,
  X,
} from '@lucide/vue';
import { RfqApiError, rfqApi } from '@/features/rfq/api';
import type {
  RequirementField,
  RfqCase,
  RfqCaseSummary,
  RfqFieldDefinition,
  RfqStatus,
} from '@/features/rfq/types';

const STATUS_LABELS: Record<RfqStatus, string> = {
  draft: '草稿',
  needs_clarification: '待补充参数',
  awaiting_sales_confirmation: '待销售确认',
  awaiting_technical_review: '待工程审批',
  approved_for_export: '已批准可导出',
};

const STATUS_FILTERS: Array<{ title: string; value: RfqStatus | '' }> = [
  { title: '全部状态', value: '' },
  { title: '待补充参数', value: 'needs_clarification' },
  { title: '待销售确认', value: 'awaiting_sales_confirmation' },
  { title: '待工程审批', value: 'awaiting_technical_review' },
  { title: '已批准可导出', value: 'approved_for_export' },
];

const FIELD_DEFINITIONS: RfqFieldDefinition[] = [
  { key: 'customer_name', label: '客户名称', unit: '', required: false, type: 'text' },
  { key: 'project_name', label: '项目名称', unit: '', required: false, type: 'text' },
  { key: 'quantity', label: '数量', unit: '台', required: true, type: 'number' },
  { key: 'flow_m3h', label: '流量', unit: 'm³/h', required: true, type: 'number' },
  { key: 'head_m', label: '扬程', unit: 'm', required: true, type: 'number' },
  { key: 'medium', label: '介质', unit: '', required: true, type: 'medium' },
  { key: 'temperature_c', label: '介质温度', unit: '°C', required: true, type: 'number' },
  { key: 'voltage_v', label: '电压', unit: 'V', required: true, type: 'number' },
  { key: 'frequency_hz', label: '频率', unit: 'Hz', required: true, type: 'number' },
  { key: 'material_requirement', label: '材质要求', unit: '', required: false, type: 'text' },
  { key: 'installation_environment', label: '安装环境', unit: '', required: false, type: 'text' },
  { key: 'delivery_date', label: '期望交期', unit: '', required: false, type: 'text' },
  { key: 'budget_cny', label: '预算', unit: 'CNY', required: false, type: 'number' },
  { key: 'soft_preferences', label: '其他偏好', unit: '', required: false, type: 'text' },
];

const WORKFLOW_STEPS = [
  { label: '补齐参数', description: '明确全部硬约束' },
  { label: '销售确认', description: '确认需求与原文证据' },
  { label: '工程审批', description: '复核候选型号与风险' },
  { label: '商务导出', description: '下载参考价格表' },
];

const route = useRoute();
const router = useRouter();
const { mdAndDown } = useDisplay();
const pluginState = ref<'loading' | 'ready' | 'unavailable' | 'error'>('loading');
const pluginDiagnostic = ref('');
const loading = ref(false);
const cases = ref<RfqCaseSummary[]>([]);
const current = ref<RfqCase | null>(null);
const search = ref('');
const statusFilter = ref<RfqStatus | ''>('');
const activeTab = ref<'requirements' | 'solutions' | 'evidence'>('requirements');
const mobileCasesOpen = ref(false);
const createDialog = ref(false);
const catalogDialog = ref(false);
const requestText = ref('');
const clarificationText = ref('');
const approvalComment = ref('');
const editedFields = ref<Record<string, string>>({});
const dirtyFields = ref(new Set<string>());
const catalogFile = ref<File | null>(null);
const snackbar = ref({ show: false, color: 'success', message: '' });
const conflict = ref(false);
let searchTimer = 0;

const caseTitle = computed(() =>
  current.value?.customer_name || current.value?.project_name || '未命名询价',
);
const missingLabels = computed(() => {
  const missing = new Set(current.value?.revision.missing || []);
  return FIELD_DEFINITIONS.filter((field) => missing.has(field.key)).map(
    (field) => field.label,
  );
});
const candidates = computed(() => current.value?.recommendation?.candidates || []);
const workflowIndex = computed(() => {
  const status = current.value?.status;
  if (status === 'awaiting_sales_confirmation') return 1;
  if (status === 'awaiting_technical_review') return 2;
  if (status === 'approved_for_export') return 3;
  return 0;
});

function formatDate(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function displayTitle(item: RfqCaseSummary) {
  return item.customer_name || item.project_name || '未命名询价';
}

function formatField(field?: RequirementField) {
  const value = field?.value;
  if (Array.isArray(value)) return value.join('；');
  return value == null ? '' : String(value);
}

function setCurrent(rfqCase: RfqCase) {
  current.value = rfqCase;
  editedFields.value = Object.fromEntries(
    FIELD_DEFINITIONS.map((definition) => [
      definition.key,
      formatField(rfqCase.revision.requirements[definition.key]),
    ]),
  );
  dirtyFields.value = new Set();
  clarificationText.value = '';
  conflict.value = false;
}

function showError(error: unknown) {
  const apiError = error instanceof RfqApiError ? error : null;
  conflict.value = apiError?.isConflict === true;
  snackbar.value = {
    show: true,
    color: 'error',
    message: apiError?.message || (error as Error)?.message || '操作失败，请稍后重试。',
  };
}

async function loadCases(selectFromRoute = false) {
  try {
    const result = await rfqApi.list(search.value.trim(), statusFilter.value);
    cases.value = result.cases;
    pluginState.value = 'ready';
    if (selectFromRoute) {
      const requested = String(route.params.caseId || '');
      if (requested) await openCase(requested, false);
      else if (cases.value[0]) await openCase(cases.value[0].id, true);
    } else if (current.value && !cases.value.some((item) => item.id === current.value?.id)) {
      current.value = null;
    }
  } catch (error) {
    const apiError = error instanceof RfqApiError ? error : null;
    if (apiError?.status === 404) {
      pluginState.value = 'unavailable';
      pluginDiagnostic.value = '未找到 RFQ 插件接口。请确认插件已安装、启用并完成重载。';
    } else {
      pluginState.value = 'error';
      pluginDiagnostic.value = apiError?.message || '询价插件暂时不可用。';
    }
  }
}

async function openCase(caseId: string, updateRoute = true) {
  if (!caseId || current.value?.id === caseId) return;
  loading.value = true;
  try {
    setCurrent(await rfqApi.get(caseId));
    mobileCasesOpen.value = false;
    if (updateRoute) {
      await router.replace({
        name: 'RfqWorkbench',
        params: { caseId },
        query: route.query,
      });
    }
  } catch (error) {
    showError(error);
  } finally {
    loading.value = false;
  }
}

async function reloadCurrent() {
  if (!current.value) return;
  const id = current.value.id;
  current.value = null;
  await openCase(id, false);
  await loadCases();
}

async function createCase() {
  if (!requestText.value.trim()) return;
  loading.value = true;
  try {
    const created = await rfqApi.create(requestText.value.trim());
    createDialog.value = false;
    requestText.value = '';
    setCurrent(created);
    await loadCases();
    await router.replace({ name: 'RfqWorkbench', params: { caseId: created.id } });
    snackbar.value = { show: true, color: 'success', message: '询价已创建，请核对缺失参数。' };
  } catch (error) {
    showError(error);
  } finally {
    loading.value = false;
  }
}

function markDirty(fieldKey: string) {
  dirtyFields.value = new Set(dirtyFields.value).add(fieldKey);
}

async function saveRequirements() {
  if (!current.value) return;
  const fields = Object.fromEntries(
    [...dirtyFields.value].map((key) => [key, editedFields.value[key]]),
  );
  if (!Object.keys(fields).length && !clarificationText.value.trim()) {
    snackbar.value = { show: true, color: 'warning', message: '请先修改字段或填写客户补充信息。' };
    return;
  }
  loading.value = true;
  try {
    const result = await rfqApi.update(current.value.id, {
      expected_revision: current.value.active_revision,
      clarification_text: clarificationText.value.trim(),
      fields,
    });
    setCurrent(result);
    await loadCases();
    snackbar.value = { show: true, color: 'success', message: '新修订已保存，旧确认与审批已失效。' };
  } catch (error) {
    showError(error);
  } finally {
    loading.value = false;
  }
}

async function analyze() {
  if (!current.value) return;
  loading.value = true;
  try {
    setCurrent(await rfqApi.analyze(current.value.id, current.value.active_revision));
    await loadCases();
    snackbar.value = { show: true, color: 'success', message: '已生成新的分析修订。' };
  } catch (error) {
    showError(error);
  } finally {
    loading.value = false;
  }
}

async function uploadAttachments(files: File[] | FileList) {
  if (!current.value) return;
  const selected = Array.from(files).slice(0, 3);
  loading.value = true;
  try {
    let result = current.value;
    for (const file of selected) result = await rfqApi.uploadAttachment(result.id, file);
    setCurrent(result);
    await loadCases();
    snackbar.value = { show: true, color: 'success', message: `已解析 ${selected.length} 个附件。` };
  } catch (error) {
    showError(error);
  } finally {
    loading.value = false;
  }
}

async function confirmRequirements() {
  if (!current.value) return;
  loading.value = true;
  try {
    setCurrent(
      await rfqApi.confirm(
        current.value.id,
        current.value.active_revision,
        approvalComment.value.trim(),
      ),
    );
    approvalComment.value = '';
    await loadCases();
    snackbar.value = { show: true, color: 'success', message: '销售已确认，现等待工程审批。' };
  } catch (error) {
    showError(error);
  } finally {
    loading.value = false;
  }
}

async function technicalDecision(decision: 'approved' | 'rejected') {
  if (!current.value) return;
  loading.value = true;
  try {
    setCurrent(
      await rfqApi.decide(
        current.value.id,
        current.value.active_revision,
        decision,
        approvalComment.value.trim(),
      ),
    );
    approvalComment.value = '';
    await loadCases();
    snackbar.value = {
      show: true,
      color: 'success',
      message: decision === 'approved' ? '工程审批通过，可以导出。' : '方案已驳回，请更新需求。',
    };
  } catch (error) {
    showError(error);
  } finally {
    loading.value = false;
  }
}

function saveDownload(blob: Blob, fallbackName: string, contentDisposition = '') {
  const utf8 = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const plain = contentDisposition.match(/filename="?([^";]+)"?/i)?.[1];
  let filename = fallbackName;
  try {
    filename = utf8 ? decodeURIComponent(utf8) : plain || fallbackName;
  } catch {
    filename = utf8 || plain || fallbackName;
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function exportCase() {
  if (!current.value) return;
  try {
    const result = await rfqApi.exportCase(current.value.id);
    saveDownload(result.blob, `${current.value.id}_选型与参考价格表.xlsx`, result.contentDisposition);
    await reloadCurrent();
  } catch (error) {
    showError(error);
  }
}

async function downloadTemplate() {
  try {
    const result = await rfqApi.catalogTemplate();
    saveDownload(result.blob, '离心泵产品目录模板.xlsx', result.contentDisposition);
  } catch (error) {
    showError(error);
  }
}

async function importCatalog() {
  if (!catalogFile.value) return;
  loading.value = true;
  try {
    const result = await rfqApi.importCatalog(catalogFile.value);
    catalogDialog.value = false;
    catalogFile.value = null;
    snackbar.value = {
      show: true,
      color: 'success',
      message: `目录版本 #${result.version_id} 已启用，共 ${result.product_count} 个型号。`,
    };
    if (current.value) await analyze();
  } catch (error) {
    showError(error);
  } finally {
    loading.value = false;
  }
}

async function copyReply() {
  try {
    await navigator.clipboard.writeText(current.value?.revision.response_text || '');
    snackbar.value = { show: true, color: 'success', message: '客户回复文案已复制。' };
  } catch {
    snackbar.value = { show: true, color: 'error', message: '浏览器未允许复制，请手动选择文本。' };
  }
}

function auditLabel(eventType: string) {
  return (
    {
      case_created: '创建询价',
      requirements_updated: '更新需求',
      recommendations_generated: '生成候选方案',
      requirements_confirmed: '销售确认需求',
      solutions_approved: '工程批准方案',
      solutions_rejected: '工程驳回方案',
      reference_export_generated: '生成 Excel',
    }[eventType] || eventType
  );
}

watch([search, statusFilter], () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => loadCases(), 250);
});

watch(
  () => route.params.caseId,
  (caseId) => {
    const normalized = String(caseId || '');
    if (normalized && normalized !== current.value?.id && pluginState.value === 'ready') {
      openCase(normalized, false);
    }
  },
);

onMounted(() => loadCases(true));
onBeforeUnmount(() => window.clearTimeout(searchTimer));
</script>

<template>
  <main class="rfq-workbench">
    <div v-if="pluginState === 'loading'" class="rfq-state">
      <v-progress-circular indeterminate color="primary" />
      <p>正在连接询价插件…</p>
    </div>

    <div v-else-if="pluginState !== 'ready'" class="rfq-state rfq-state--diagnostic">
      <div class="rfq-state__icon"><AlertTriangle :size="30" /></div>
      <h1>询价工作台暂不可用</h1>
      <p>{{ pluginDiagnostic }}</p>
      <div class="rfq-state__actions">
        <v-btn color="primary" @click="loadCases(true)"><RefreshCw :size="17" class="mr-2" />重新检测</v-btn>
        <v-btn variant="tonal" to="/bot-config/extensions/plugins">前往插件配置</v-btn>
      </div>
      <small>第三个一级入口会始终保留；原插件 HTML 工作台仍可用于非定制 Dashboard。</small>
    </div>

    <template v-else>
      <aside v-if="!mdAndDown" class="case-rail">
        <div class="case-rail__heading">
          <div>
            <span>销售询价</span>
            <strong>任务列表</strong>
          </div>
          <v-btn icon size="small" color="primary" @click="createDialog = true"><Plus :size="17" /></v-btn>
        </div>
        <v-text-field
          v-model="search"
          density="compact"
          variant="outlined"
          hide-details
          clearable
          placeholder="搜索客户、项目或编号"
        >
          <template #prepend-inner><Search :size="16" /></template>
        </v-text-field>
        <v-select
          v-model="statusFilter"
          :items="STATUS_FILTERS"
          item-title="title"
          item-value="value"
          density="compact"
          variant="outlined"
          hide-details
          label="状态筛选"
        />
        <div class="case-rail__count">共 {{ cases.length }} 个任务</div>
        <div class="case-rail__list">
          <button
            v-for="item in cases"
            :key="item.id"
            type="button"
            class="case-item"
            :class="{ 'case-item--active': item.id === current?.id }"
            @click="openCase(item.id)"
          >
            <span class="case-item__id">{{ item.id }}</span>
            <span class="case-item__title">{{ displayTitle(item) }}</span>
            <span class="case-item__meta">
              <i :class="`status-dot status-dot--${item.status}`"></i>
              {{ STATUS_LABELS[item.status] }} · {{ formatDate(item.updated_at) }}
            </span>
          </button>
          <div v-if="!cases.length" class="case-rail__empty">暂无符合条件的询价</div>
        </div>
      </aside>

      <section class="case-workspace">
        <header class="workbench-header">
          <v-btn v-if="mdAndDown" icon variant="text" @click="mobileCasesOpen = true"><Menu :size="20" /></v-btn>
          <div class="workbench-header__copy">
            <div class="workbench-header__eyebrow">
              <span v-if="current" :class="`status-badge status-badge--${current.status}`">
                {{ STATUS_LABELS[current.status] }}
              </span>
              <span v-if="current">修订 {{ current.active_revision }}</span>
            </div>
            <h1>{{ current ? caseTitle : '询价工作台' }}</h1>
            <p v-if="current">{{ current.id }} · 创建于 {{ formatDate(current.created_at) }}</p>
            <p v-else>从一份询价单开始，补齐参数并生成可追溯的候选方案。</p>
          </div>
          <div class="workbench-header__actions">
            <v-btn variant="tonal" @click="catalogDialog = true"><FileSpreadsheet :size="17" class="mr-2" />产品目录</v-btn>
            <v-btn variant="tonal" :disabled="!current" @click="analyze"><RefreshCw :size="17" class="mr-2" />重新分析</v-btn>
            <v-btn
              color="primary"
              :disabled="current?.status !== 'approved_for_export'"
              @click="exportCase"
            ><Download :size="17" class="mr-2" />导出 Excel</v-btn>
          </div>
        </header>

        <div v-if="conflict" class="conflict-banner">
          <AlertTriangle :size="19" />
          <span>该询价已被其他操作更新。为避免覆盖，请重新加载最新修订。</span>
          <v-btn size="small" variant="tonal" @click="reloadCurrent">重新加载</v-btn>
        </div>

        <div v-if="!current" class="empty-workspace">
          <div class="empty-workspace__icon"><ClipboardList :size="34" /></div>
          <h2>{{ cases.length ? '请选择一个询价任务' : '创建第一份询价' }}</h2>
          <p>粘贴客户原始需求，系统会先识别明确参数并标记缺失项。</p>
          <v-btn color="primary" @click="createDialog = true"><Plus :size="17" class="mr-2" />新建询价</v-btn>
        </div>

        <template v-else>
          <div class="workflow-strip">
            <div
              v-for="(step, index) in WORKFLOW_STEPS"
              :key="step.label"
              class="workflow-strip__step"
              :class="{ done: index < workflowIndex, active: index === workflowIndex }"
            >
              <span>{{ index < workflowIndex ? '✓' : index + 1 }}</span>
              <div><strong>{{ step.label }}</strong><small>{{ step.description }}</small></div>
              <ChevronRight v-if="index < WORKFLOW_STEPS.length - 1" :size="16" />
            </div>
          </div>

          <div
            class="requirements-alert"
            :class="{ 'requirements-alert--complete': !missingLabels.length }"
          >
            <AlertTriangle v-if="missingLabels.length" :size="20" />
            <Check v-else :size="20" />
            <div>
              <strong>{{ missingLabels.length ? `还差 ${missingLabels.length} 个必填参数` : '必填参数已齐全' }}</strong>
              <span>{{ missingLabels.length ? missingLabels.join('、') : '请核对原文证据后提交销售确认。' }}</span>
            </div>
          </div>

          <div class="case-tabs" role="tablist">
            <button :class="{ active: activeTab === 'requirements' }" @click="activeTab = 'requirements'">需求确认</button>
            <button :class="{ active: activeTab === 'solutions' }" @click="activeTab = 'solutions'">
              方案对比 <span>{{ candidates.length }}</span>
            </button>
            <button :class="{ active: activeTab === 'evidence' }" @click="activeTab = 'evidence'">证据与审批</button>
          </div>

          <div class="case-body">
            <div class="case-main">
              <div v-if="activeTab === 'requirements'" class="tab-panel">
                <section class="source-card">
                  <div class="section-heading"><div><span>原始资料</span><h2>客户询价原文</h2></div></div>
                  <pre>{{ current.source_text || '未提供文本原文' }}</pre>
                  <div class="attachment-row">
                    <span v-for="file in current.attachments" :key="file.id" class="attachment-pill">
                      <Paperclip :size="14" /> {{ file.filename }}
                    </span>
                    <label class="upload-pill">
                      <Upload :size="14" /> 上传附件
                      <input
                        type="file"
                        multiple
                        accept=".pdf,.docx,.xlsx,.xls,.md,.txt"
                        @change="uploadAttachments(($event.target as HTMLInputElement).files || [])"
                      />
                    </label>
                  </div>
                </section>

                <section class="requirements-card">
                  <div class="section-heading">
                    <div><span>字段证据</span><h2>需求参数</h2></div>
                    <small>{{ dirtyFields.size ? `${dirtyFields.size} 项待保存` : '所有修改将生成新修订' }}</small>
                  </div>
                  <div class="requirements-grid">
                    <label
                      v-for="field in FIELD_DEFINITIONS"
                      :key="field.key"
                      class="requirement-field"
                      :class="{ missing: current.revision.missing.includes(field.key) }"
                    >
                      <span class="requirement-field__label">
                        <span><i v-if="field.required"></i>{{ field.label }}</span>
                        <em :class="current.revision.requirements[field.key]?.origin || 'inferred'">
                          {{ { explicit: '原文', inferred: '推断', manual: '人工' }[current.revision.requirements[field.key]?.origin || 'inferred'] }}
                        </em>
                      </span>
                      <span class="requirement-field__input">
                        <select
                          v-if="field.type === 'medium'"
                          v-model="editedFields[field.key]"
                          @change="markDirty(field.key)"
                        >
                          <option value="">请选择</option>
                          <option value="clean_water">清水</option>
                          <option value="mild_corrosive">弱腐蚀性液体</option>
                        </select>
                        <input
                          v-else
                          v-model="editedFields[field.key]"
                          :type="field.type"
                          :step="field.type === 'number' ? 'any' : undefined"
                          placeholder="未提供"
                          @input="markDirty(field.key)"
                        />
                        <b v-if="field.unit">{{ field.unit }}</b>
                      </span>
                      <small :title="current.revision.requirements[field.key]?.evidence || '暂无原文证据'">
                        证据：{{ current.revision.requirements[field.key]?.evidence || '暂无原文证据' }}
                      </small>
                    </label>
                  </div>
                  <v-textarea
                    v-model="clarificationText"
                    label="客户补充信息"
                    placeholder="例如：介质为 40°C 清水，50 Hz"
                    variant="outlined"
                    rows="2"
                    hide-details
                  />
                  <div class="panel-actions">
                    <v-btn color="primary" @click="saveRequirements">保存并重新选型</v-btn>
                  </div>
                </section>
              </div>

              <div v-else-if="activeTab === 'solutions'" class="tab-panel">
                <div class="price-warning">
                  <AlertTriangle :size="19" />
                  <strong>演示参考价，需商务核价，不得直接作为正式报价。</strong>
                  <span>不计算小计、总计、税费、折扣或运费。</span>
                </div>
                <div class="solution-meta">
                  <span v-if="current.recommendation">
                    目录版本 #{{ current.recommendation.catalog_version_id }} · 需求修订 {{ current.recommendation.revision_no }}
                  </span>
                  <span v-else>等待完整参数</span>
                </div>
                <div v-if="candidates.length" class="solution-grid">
                  <article v-for="(candidate, index) in candidates" :key="candidate.sku" class="solution-card">
                    <span class="solution-card__rank">{{ index === 0 ? '推荐' : `方案 ${index + 1}` }}</span>
                    <h2>{{ candidate.sku }}</h2>
                    <p>{{ candidate.model_name }}</p>
                    <div class="fit-score"><span>综合匹配度</span><strong>{{ Number(candidate.fit_score).toFixed(1) }}<small>/100</small></strong></div>
                    <div class="fit-bar"><span :style="{ width: `${Math.max(0, Math.min(100, Number(candidate.fit_score)))}%` }"></span></div>
                    <dl>
                      <div><dt>流量区间</dt><dd>{{ candidate.flow_min_m3h }}–{{ candidate.flow_max_m3h }} m³/h</dd></div>
                      <div><dt>扬程区间</dt><dd>{{ candidate.head_min_m }}–{{ candidate.head_max_m }} m</dd></div>
                      <div><dt>温度范围</dt><dd>{{ candidate.temp_min_c }}–{{ candidate.temp_max_c }} °C</dd></div>
                      <div><dt>过流材质</dt><dd>{{ candidate.wetted_material }}</dd></div>
                      <div><dt>电机 / 防护</dt><dd>{{ candidate.motor_power_kw }} kW · {{ candidate.ip_rating }}</dd></div>
                      <div><dt>参考交期</dt><dd>{{ candidate.lead_time_days }} 天</dd></div>
                    </dl>
                    <div class="reference-price"><span>演示参考单价</span><strong>¥{{ Number(candidate.reference_price_cny).toLocaleString('zh-CN') }}</strong></div>
                    <small class="price-note">{{ candidate.price_note || '需商务核价，不得直接作为正式报价' }}</small>
                    <p v-if="candidate.risks?.length" class="risk-note">{{ candidate.risks.join('；') }}</p>
                  </article>
                </div>
                <div v-else class="quiet-empty">
                  {{ current.revision.missing.length ? '补齐必填参数后显示最多三套候选方案。' : '当前目录没有同时满足全部硬约束的型号。' }}
                </div>
                <section v-if="current.recommendation?.conflicts?.length" class="conflict-list">
                  <h3>未入选型号与冲突</h3>
                  <p v-for="item in current.recommendation.conflicts" :key="item.sku"><strong>{{ item.sku }}</strong>：{{ item.reasons.join('、') }}</p>
                </section>
                <section class="reply-card">
                  <div class="section-heading"><div><span>商务响应</span><h2>客户回复文案</h2></div><v-btn size="small" variant="text" @click="copyReply"><Copy :size="15" class="mr-1" />复制</v-btn></div>
                  <p>{{ current.revision.response_text || '补齐参数后生成客户回复建议。' }}</p>
                </section>
              </div>

              <div v-else class="tab-panel evidence-panel">
                <section>
                  <div class="section-heading"><div><span>可选增强</span><h2>知识库来源</h2></div></div>
                  <article v-for="(item, index) in current.recommendation?.evidence || []" :key="index" class="evidence-card">
                    <strong>{{ item.doc_name || item.title || '知识库片段' }}</strong>
                    <p>{{ item.content || item.text }}</p>
                  </article>
                  <div v-if="!current.recommendation?.evidence?.length" class="quiet-empty">未配置知识库，或本次没有检索到手册与历史案例证据。选型仍由结构化产品目录完成。</div>
                </section>
                <section>
                  <div class="section-heading"><div><span>追溯记录</span><h2>审计事件</h2></div></div>
                  <div class="audit-list">
                    <div v-for="(item, index) in current.audit" :key="`${item.created_at}-${index}`">
                      <i></i><strong>{{ auditLabel(item.event_type) }}</strong><span>{{ item.actor }}</span><time>{{ formatDate(item.created_at) }}</time>
                    </div>
                  </div>
                </section>
              </div>
            </div>

            <aside class="approval-panel">
              <div class="approval-panel__heading"><ShieldCheck :size="21" /><div><strong>协作审批</strong><span>当前修订 {{ current.active_revision }}</span></div></div>
              <div class="approval-timeline">
                <div v-for="(step, index) in WORKFLOW_STEPS.slice(1)" :key="step.label" :class="{ done: index + 1 < workflowIndex, active: index + 1 === workflowIndex }">
                  <i>{{ index + 1 < workflowIndex ? '✓' : index + 2 }}</i><span><strong>{{ step.label }}</strong><small>{{ step.description }}</small></span>
                </div>
              </div>
              <v-textarea v-model="approvalComment" label="审批备注" variant="outlined" rows="3" hide-details />
              <v-btn
                block
                color="primary"
                :disabled="current.status !== 'awaiting_sales_confirmation'"
                @click="confirmRequirements"
              ><ClipboardCheck :size="17" class="mr-2" />销售确认需求</v-btn>
              <div class="approval-panel__decision">
                <v-btn
                  color="error"
                  variant="tonal"
                  :disabled="current.status !== 'awaiting_technical_review'"
                  @click="technicalDecision('rejected')"
                ><X :size="16" class="mr-1" />驳回</v-btn>
                <v-btn
                  color="primary"
                  :disabled="current.status !== 'awaiting_technical_review'"
                  @click="technicalDecision('approved')"
                ><Check :size="16" class="mr-1" />批准</v-btn>
              </div>
              <div class="approval-panel__note">审批仅用于演示工作流，不代表正式商务报价授权。</div>
            </aside>
          </div>
        </template>
      </section>
    </template>

    <v-dialog v-model="mobileCasesOpen" fullscreen transition="dialog-bottom-transition">
      <v-card class="mobile-case-dialog">
        <v-toolbar color="white">
          <v-btn icon @click="mobileCasesOpen = false"><X :size="20" /></v-btn>
          <v-toolbar-title>询价任务</v-toolbar-title>
          <v-btn icon color="primary" @click="createDialog = true"><Plus :size="19" /></v-btn>
        </v-toolbar>
        <div class="mobile-case-dialog__filters">
          <v-text-field v-model="search" density="compact" variant="outlined" hide-details clearable placeholder="搜索询价" />
          <v-select v-model="statusFilter" :items="STATUS_FILTERS" item-title="title" item-value="value" density="compact" variant="outlined" hide-details />
        </div>
        <button v-for="item in cases" :key="item.id" class="case-item" @click="openCase(item.id)">
          <span class="case-item__id">{{ item.id }}</span><span class="case-item__title">{{ displayTitle(item) }}</span><span class="case-item__meta">{{ STATUS_LABELS[item.status] }} · {{ formatDate(item.updated_at) }}</span>
        </button>
      </v-card>
    </v-dialog>

    <v-dialog v-model="createDialog" max-width="620">
      <v-card>
        <v-card-title class="text-h3 pa-4 pb-0 pl-6">新建询价</v-card-title>
        <v-card-text class="pt-5">
          <p class="dialog-description">粘贴客户邮件、聊天记录或询价单正文。文档中的指令只作为不可信资料处理。</p>
          <v-textarea v-model="requestText" label="客户询价原文" variant="outlined" rows="8" autofocus />
        </v-card-text>
        <v-card-actions class="pa-4"><v-spacer /><v-btn variant="text" @click="createDialog = false">取消</v-btn><v-btn color="primary" :disabled="!requestText.trim()" @click="createCase">提取需求并创建</v-btn></v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="catalogDialog" max-width="620">
      <v-card>
        <v-card-title class="text-h3 pa-4 pb-0 pl-6">产品目录</v-card-title>
        <v-card-text class="pt-5">
          <p class="dialog-description">下载固定列模板，填写后以 .xlsx 导入。校验通过时才会原子切换目录版本。</p>
          <v-btn variant="tonal" color="primary" @click="downloadTemplate"><Download :size="17" class="mr-2" />下载目录模板</v-btn>
          <v-file-input
            class="mt-5"
            label="选择产品目录 .xlsx"
            accept=".xlsx"
            variant="outlined"
            show-size
            @update:model-value="catalogFile = Array.isArray($event) ? $event[0] || null : $event"
          />
        </v-card-text>
        <v-card-actions class="pa-4"><v-spacer /><v-btn variant="text" @click="catalogDialog = false">取消</v-btn><v-btn color="primary" :disabled="!catalogFile" @click="importCatalog">校验并导入</v-btn></v-card-actions>
      </v-card>
    </v-dialog>

    <div v-if="loading" class="loading-layer"><v-progress-circular indeterminate color="primary" /><span>正在处理，请稍候…</span></div>
    <v-snackbar v-model="snackbar.show" :color="snackbar.color" :timeout="3600" location="top">{{ snackbar.message }}</v-snackbar>
  </main>
</template>

<style scoped>
.rfq-workbench {
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: #f6f7f9;
  color: #0c173b;
}

.rfq-state {
  display: grid;
  width: 100%;
  place-content: center;
  justify-items: center;
  gap: 12px;
  padding: 32px;
  text-align: center;
}

.rfq-state--diagnostic { max-width: 660px; margin: auto; }
.rfq-state--diagnostic h1 { margin: 4px 0 0; font-size: 25px; }
.rfq-state--diagnostic p { margin: 0; color: #6e778d; }
.rfq-state--diagnostic small { max-width: 520px; color: #8790a2; }
.rfq-state__icon { display: grid; width: 62px; height: 62px; place-items: center; border-radius: 16px; background: #fff4df; color: #b56a08; }
.rfq-state__actions { display: flex; gap: 10px; margin: 10px 0; }

.case-rail {
  display: flex;
  width: 284px;
  min-width: 284px;
  min-height: 0;
  flex-direction: column;
  gap: 10px;
  border-right: 1px solid #e3e7ee;
  background: #fff;
  padding: 18px 13px;
}

.case-rail__heading { display: flex; align-items: center; justify-content: space-between; padding: 0 4px 5px; }
.case-rail__heading > div { display: flex; flex-direction: column; }
.case-rail__heading span { color: #7b8497; font-size: 11px; font-weight: 700; text-transform: uppercase; }
.case-rail__heading strong { font-size: 18px; }
.case-rail__count { padding: 4px 5px 0; color: #8a92a3; font-size: 11px; }
.case-rail__list { min-height: 0; flex: 1; overflow-y: auto; }

.case-item {
  display: flex;
  width: 100%;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  padding: 11px 10px;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.case-item:hover { background: #f6f8fb; }
.case-item--active { border-color: #cbd7ff; background: #eef2ff; }
.case-item__id { color: #7d869a; font-size: 10px; font-weight: 650; letter-spacing: .03em; }
.case-item__title { max-width: 100%; overflow: hidden; font-size: 13px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.case-item__meta { display: flex; align-items: center; gap: 5px; color: #80899c; font-size: 10px; }
.status-dot { width: 6px; height: 6px; border-radius: 50%; background: #9ea6b5; }
.status-dot--needs_clarification { background: #e89b26; }
.status-dot--awaiting_sales_confirmation { background: #3475ee; }
.status-dot--awaiting_technical_review { background: #7d54d7; }
.status-dot--approved_for_export { background: #18a262; }
.case-rail__empty { padding: 30px 10px; color: #929aab; font-size: 12px; text-align: center; }

.case-workspace { display: flex; min-width: 0; min-height: 0; flex: 1; flex-direction: column; overflow-y: auto; }
.workbench-header { display: flex; align-items: center; gap: 18px; border-bottom: 1px solid #e5e8ef; background: #fff; padding: 17px 22px; }
.workbench-header__copy { min-width: 0; flex: 1; }
.workbench-header__copy h1 { margin: 2px 0 1px; overflow: hidden; font-size: 21px; letter-spacing: -.025em; text-overflow: ellipsis; white-space: nowrap; }
.workbench-header__copy p { margin: 0; color: #7b8498; font-size: 11px; }
.workbench-header__eyebrow { display: flex; align-items: center; gap: 8px; color: #7a8396; font-size: 10px; }
.workbench-header__actions { display: flex; gap: 8px; }
.status-badge { border-radius: 999px; padding: 3px 8px; background: #f0f2f5; color: #687287; font-weight: 700; }
.status-badge--needs_clarification { background: #fff3dc; color: #a55f04; }
.status-badge--awaiting_sales_confirmation { background: #eaf1ff; color: #245ed1; }
.status-badge--awaiting_technical_review { background: #f1ebff; color: #6c3dc1; }
.status-badge--approved_for_export { background: #e7f7ed; color: #127944; }

.conflict-banner { display: flex; align-items: center; gap: 10px; margin: 12px 18px 0; border: 1px solid #f1c781; border-radius: 8px; background: #fff7e8; padding: 10px 12px; color: #9b5b09; font-size: 12px; }
.conflict-banner span { flex: 1; }
.empty-workspace { display: grid; flex: 1; place-content: center; justify-items: center; padding: 28px; text-align: center; }
.empty-workspace__icon { display: grid; width: 72px; height: 72px; place-items: center; border-radius: 18px; background: #edf1ff; color: #315cf4; }
.empty-workspace h2 { margin: 18px 0 5px; }
.empty-workspace p { margin: 0 0 20px; color: #747d90; }

.workflow-strip { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border-bottom: 1px solid #e5e8ef; background: #fff; padding: 11px 18px; }
.workflow-strip__step { display: flex; align-items: center; gap: 9px; color: #99a0af; }
.workflow-strip__step > span { display: grid; width: 24px; height: 24px; place-items: center; border: 1px solid #d8dce5; border-radius: 50%; font-size: 10px; font-weight: 700; }
.workflow-strip__step > div { display: flex; min-width: 0; flex: 1; flex-direction: column; }
.workflow-strip__step strong { font-size: 11px; }
.workflow-strip__step small { overflow: hidden; font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
.workflow-strip__step.active { color: #315cf4; }
.workflow-strip__step.active > span { border-color: #315cf4; background: #315cf4; color: #fff; }
.workflow-strip__step.done { color: #1c8b54; }
.workflow-strip__step.done > span { border-color: #1c9a5d; background: #e7f7ed; }

.requirements-alert { display: flex; align-items: center; gap: 10px; margin: 14px 18px 0; border: 1px solid #f0cf94; border-radius: 8px; background: #fff8ea; padding: 10px 13px; color: #a2640b; }
.requirements-alert--complete { border-color: #bfe2ca; background: #eff9f3; color: #147a46; }
.requirements-alert > div { display: flex; flex-direction: column; }
.requirements-alert strong { font-size: 12px; }
.requirements-alert span { color: #7b7469; font-size: 10px; }
.case-tabs { display: flex; gap: 22px; border-bottom: 1px solid #dfe3eb; margin: 12px 18px 0; }
.case-tabs button { border: 0; border-bottom: 2px solid transparent; background: transparent; padding: 9px 2px; color: #778095; font-size: 12px; font-weight: 650; cursor: pointer; }
.case-tabs button.active { border-color: #315cf4; color: #1e45c7; }
.case-tabs button span { margin-left: 4px; border-radius: 8px; background: #e9edf5; padding: 1px 5px; font-size: 9px; }

.case-body { display: grid; min-height: 0; grid-template-columns: minmax(0, 1fr) 260px; gap: 14px; padding: 14px 18px 26px; }
.case-main { min-width: 0; }
.tab-panel { display: grid; gap: 13px; }
.source-card, .requirements-card, .reply-card, .evidence-panel > section, .approval-panel, .solution-card, .conflict-list { border: 1px solid #e2e6ee; border-radius: 9px; background: #fff; }
.source-card, .requirements-card, .reply-card, .evidence-panel > section, .conflict-list { padding: 16px; }
.section-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.section-heading > div { display: flex; flex-direction: column; }
.section-heading span { color: #315cf4; font-size: 9px; font-weight: 750; letter-spacing: .07em; text-transform: uppercase; }
.section-heading h2 { margin: 1px 0 0; font-size: 15px; }
.section-heading small { color: #8a92a3; font-size: 10px; }
.source-card pre { max-height: 150px; overflow: auto; margin: 0; border-radius: 7px; background: #f7f8fa; padding: 12px; color: #4f596d; font-family: inherit; font-size: 11px; line-height: 1.6; white-space: pre-wrap; }
.attachment-row { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 10px; }
.attachment-pill, .upload-pill { display: inline-flex; align-items: center; gap: 4px; border-radius: 999px; background: #eef1f6; padding: 5px 9px; color: #5f6980; font-size: 10px; }
.upload-pill { border: 1px dashed #aeb9d5; background: #fff; color: #315cf4; cursor: pointer; }
.upload-pill input { display: none; }
.requirements-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-bottom: 13px; }
.requirement-field { display: flex; min-width: 0; flex-direction: column; gap: 4px; border: 1px solid #e1e5ed; border-radius: 7px; padding: 9px; }
.requirement-field.missing { border-color: #efca8d; background: #fffaf0; }
.requirement-field__label { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: #576177; font-size: 10px; font-weight: 650; }
.requirement-field__label i { display: inline-block; width: 5px; height: 5px; margin-right: 4px; border-radius: 50%; background: #e25555; }
.requirement-field__label em { border-radius: 999px; background: #f0f2f6; padding: 2px 5px; color: #7a8499; font-size: 8px; font-style: normal; }
.requirement-field__label em.explicit { background: #eaf1ff; color: #2d65d4; }
.requirement-field__label em.manual { background: #e8f7ed; color: #16804a; }
.requirement-field__input { display: flex; align-items: center; border-bottom: 1px solid #dfe3eb; }
.requirement-field input, .requirement-field select { width: 100%; min-width: 0; border: 0; outline: 0; background: transparent; padding: 6px 0; color: inherit; font-size: 12px; }
.requirement-field__input b { color: #8c94a4; font-size: 9px; font-weight: 500; white-space: nowrap; }
.requirement-field > small { overflow: hidden; color: #9aa1af; font-size: 8px; text-overflow: ellipsis; white-space: nowrap; }
.panel-actions { display: flex; justify-content: flex-end; margin-top: 12px; }

.price-warning { display: flex; align-items: center; gap: 8px; border: 1px solid #f2cd8b; border-radius: 8px; background: #fff6e5; padding: 11px 13px; color: #9c5c07; font-size: 11px; }
.price-warning span { margin-left: auto; color: #82776a; font-size: 9px; }
.solution-meta { color: #848d9f; font-size: 10px; }
.solution-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.solution-card { position: relative; min-width: 0; padding: 16px 14px 13px; }
.solution-card__rank { position: absolute; top: 0; right: 0; border-radius: 0 8px 0 8px; background: #eaf0ff; padding: 5px 8px; color: #315cf4; font-size: 8px; font-weight: 750; }
.solution-card h2 { margin: 0; font-size: 16px; }
.solution-card > p { margin: 2px 0 12px; overflow: hidden; color: #7c8597; font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
.fit-score { display: flex; align-items: flex-end; justify-content: space-between; color: #788195; font-size: 9px; }
.fit-score strong { color: #284fd1; font-size: 17px; }
.fit-score small { font-size: 8px; }
.fit-bar { height: 3px; overflow: hidden; border-radius: 3px; background: #e8ebf1; }
.fit-bar span { display: block; height: 100%; background: #315cf4; }
.solution-card dl { display: grid; gap: 5px; margin: 13px 0; }
.solution-card dl div { display: flex; justify-content: space-between; gap: 8px; font-size: 9px; }
.solution-card dt { color: #9299a8; }
.solution-card dd { margin: 0; color: #4d576b; text-align: right; }
.reference-price { display: flex; align-items: flex-end; justify-content: space-between; border-top: 1px solid #e6e9ef; padding-top: 10px; }
.reference-price span { color: #7c8598; font-size: 9px; }
.reference-price strong { color: #173dbb; font-size: 18px; }
.price-note { display: block; margin-top: 4px; color: #a2712d; font-size: 7px; line-height: 1.4; }
.risk-note { color: #a75d10 !important; font-size: 8px !important; white-space: normal !important; }
.conflict-list h3 { margin: 0 0 8px; font-size: 13px; }
.conflict-list p { margin: 3px 0; color: #6e778a; font-size: 10px; }
.reply-card > p, .evidence-card p { margin: 0; color: #5c667a; font-size: 11px; line-height: 1.65; white-space: pre-wrap; }
.quiet-empty { border: 1px dashed #d7dce6; border-radius: 9px; padding: 28px 18px; color: #8991a1; font-size: 11px; text-align: center; }
.evidence-panel { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: start; }
.evidence-card { border-left: 3px solid #315cf4; padding: 5px 0 5px 10px; }
.evidence-card + .evidence-card { margin-top: 10px; }
.evidence-card strong { font-size: 11px; }
.audit-list { display: grid; gap: 9px; }
.audit-list > div { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 7px; font-size: 9px; }
.audit-list i { width: 7px; height: 7px; border-radius: 50%; background: #315cf4; }
.audit-list span { grid-column: 2; color: #8790a1; }
.audit-list time { grid-column: 3; grid-row: 1 / 3; color: #9ca3b0; }

.approval-panel { align-self: start; padding: 15px; }
.approval-panel__heading { display: flex; gap: 9px; color: #315cf4; }
.approval-panel__heading > div { display: flex; flex-direction: column; }
.approval-panel__heading strong { color: #26314b; font-size: 13px; }
.approval-panel__heading span { color: #8c94a4; font-size: 9px; }
.approval-timeline { display: grid; gap: 0; margin: 15px 0; }
.approval-timeline > div { display: flex; gap: 9px; color: #a0a6b3; }
.approval-timeline i { display: grid; width: 23px; height: 23px; flex: 0 0 auto; place-items: center; border: 1px solid #d8dce5; border-radius: 50%; font-size: 9px; font-style: normal; }
.approval-timeline > div:not(:last-child)::after { content: ''; position: relative; left: -79px; top: 23px; width: 1px; height: 24px; background: #dfe2e8; }
.approval-timeline span { display: flex; flex-direction: column; padding-bottom: 17px; }
.approval-timeline strong { font-size: 10px; }
.approval-timeline small { font-size: 8px; }
.approval-timeline .active { color: #315cf4; }
.approval-timeline .active i { border-color: #315cf4; background: #315cf4; color: #fff; }
.approval-timeline .done { color: #17834c; }
.approval-panel > .v-btn { margin-top: 10px; }
.approval-panel__decision { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; margin-top: 7px; }
.approval-panel__note { margin-top: 12px; border-radius: 6px; background: #f7f8fa; padding: 8px; color: #8a92a2; font-size: 8px; line-height: 1.5; }

.mobile-case-dialog { padding-bottom: 75px; }
.mobile-case-dialog__filters { display: grid; gap: 8px; padding: 12px; }
.dialog-description { margin: 0 0 16px; color: #727b8f; font-size: 13px; }
.loading-layer { position: absolute; z-index: 30; inset: 0; display: grid; place-content: center; justify-items: center; gap: 12px; background: rgba(255, 255, 255, .72); color: #536079; font-size: 12px; backdrop-filter: blur(2px); }

:global(.v-theme--PurpleThemeDark .rfq-workbench) { background: rgb(var(--v-theme-background)); color: rgb(var(--v-theme-on-surface)); }
:global(.v-theme--PurpleThemeDark .case-rail),
:global(.v-theme--PurpleThemeDark .workbench-header),
:global(.v-theme--PurpleThemeDark .workflow-strip),
:global(.v-theme--PurpleThemeDark .source-card),
:global(.v-theme--PurpleThemeDark .requirements-card),
:global(.v-theme--PurpleThemeDark .reply-card),
:global(.v-theme--PurpleThemeDark .evidence-panel > section),
:global(.v-theme--PurpleThemeDark .approval-panel),
:global(.v-theme--PurpleThemeDark .solution-card),
:global(.v-theme--PurpleThemeDark .conflict-list) { background: rgb(var(--v-theme-surface)); border-color: rgba(255, 255, 255, .1); }

@media (max-width: 1260px) {
  .requirements-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .case-body { grid-template-columns: minmax(0, 1fr) 238px; }
}

@media (max-width: 960px) {
  .workbench-header { align-items: flex-start; flex-wrap: wrap; padding: 12px 13px; }
  .workbench-header__copy { order: 1; }
  .workbench-header__actions { order: 3; width: 100%; overflow-x: auto; }
  .workbench-header__actions .v-btn { flex: 0 0 auto; }
  .workflow-strip { grid-template-columns: repeat(4, 150px); overflow-x: auto; }
  .case-body { grid-template-columns: 1fr; padding: 12px 10px 24px; }
  .approval-panel { width: 100%; }
  .solution-grid { display: flex; overflow-x: auto; scroll-snap-type: x mandatory; }
  .solution-card { min-width: min(82vw, 310px); scroll-snap-align: start; }
  .evidence-panel { grid-template-columns: 1fr; }
}

@media (max-width: 600px) {
  .requirements-alert { margin-inline: 10px; }
  .case-tabs { margin-inline: 10px; gap: 14px; overflow-x: auto; }
  .requirements-grid { grid-template-columns: 1fr; }
  .price-warning { align-items: flex-start; flex-wrap: wrap; }
  .price-warning span { width: 100%; margin-left: 27px; }
  .rfq-state { padding: 20px; }
  .rfq-state__actions { flex-direction: column; }
}
</style>
