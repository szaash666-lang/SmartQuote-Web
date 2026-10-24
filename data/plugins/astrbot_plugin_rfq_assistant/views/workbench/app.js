const bridge = window.AstrBotPluginView;

const STATUS_LABELS = {
  draft: "草稿",
  needs_clarification: "待补充参数",
  awaiting_sales_confirmation: "待销售确认",
  awaiting_technical_review: "待工程审批",
  approved_for_export: "已批准可导出",
};

const FIELD_DEFINITIONS = [
  ["customer_name", "客户名称", "", false, "text"],
  ["project_name", "项目名称", "", false, "text"],
  ["quantity", "数量", "台", true, "number"],
  ["flow_m3h", "流量", "m³/h", true, "number"],
  ["head_m", "扬程", "m", true, "number"],
  ["medium", "介质", "", true, "medium"],
  ["temperature_c", "介质温度", "°C", true, "number"],
  ["voltage_v", "电压", "V", true, "number"],
  ["frequency_hz", "频率", "Hz", true, "number"],
  ["material_requirement", "材质要求", "", false, "text"],
  ["installation_environment", "安装环境", "", false, "text"],
  ["delivery_date", "期望交期", "", false, "text"],
  ["budget_cny", "预算", "CNY", false, "number"],
  ["soft_preferences", "其他偏好", "", false, "text"],
];

const state = {
  cases: [],
  current: null,
  activeStatus: "",
  dirtyFields: new Set(),
  activeTab: "requirements",
};

const elements = Object.fromEntries(
  [
    "caseCount",
    "caseSearch",
    "statusFilters",
    "caseList",
    "emptyState",
    "caseContent",
    "caseStatus",
    "caseRevision",
    "caseTitle",
    "caseSubtitle",
    "analyzeButton",
    "exportButton",
    "solutionCount",
    "missingNotice",
    "sourceText",
    "attachmentInput",
    "attachmentList",
    "clarificationText",
    "requirementsForm",
    "saveHint",
    "saveRequirementsButton",
    "catalogVersion",
    "solutionCards",
    "conflictList",
    "responseText",
    "copyReplyButton",
    "knowledgeEvidence",
    "auditList",
    "workflowSteps",
    "approvalComment",
    "salesConfirmButton",
    "rejectButton",
    "approveButton",
    "newCaseButton",
    "catalogButton",
    "createDialog",
    "createForm",
    "newRequestText",
    "createSubmitButton",
    "catalogDialog",
    "catalogForm",
    "downloadTemplateButton",
    "catalogInput",
    "catalogImportButton",
    "loadingLayer",
    "loadingText",
    "toastRegion",
  ].map((id) => [id, document.getElementById(id)]),
);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showLoading(message = "处理中…") {
  elements.loadingText.textContent = message;
  elements.loadingLayer.classList.remove("hidden");
}

function hideLoading() {
  elements.loadingLayer.classList.add("hidden");
}

function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  elements.toastRegion.append(toast);
  window.setTimeout(() => toast.remove(), 3200);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error || "操作失败");
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return String(value);
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function humanSize(bytes) {
  if (!Number.isFinite(Number(bytes))) return "";
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function caseDisplayTitle(item) {
  return item.customer_name || item.project_name || "未命名询价";
}

async function refreshCases({ preserveSelection = true } = {}) {
  const params = {
    search: elements.caseSearch.value.trim(),
    status: state.activeStatus,
  };
  const response = await bridge.apiGet("cases", params);
  state.cases = Array.isArray(response.cases) ? response.cases : [];
  renderCaseList();
  if (!preserveSelection || !state.current) {
    if (state.cases.length) await openCase(state.cases[0].id);
    else showEmptyState();
    return;
  }
  const stillVisible = state.cases.some((item) => item.id === state.current.id);
  if (!stillVisible && state.cases.length) await openCase(state.cases[0].id);
  else if (!stillVisible) showEmptyState();
}

function renderCaseList() {
  elements.caseCount.textContent = state.cases.length;
  if (!state.cases.length) {
    elements.caseList.innerHTML = '<div class="rail-empty">暂无符合条件的询价</div>';
    return;
  }
  elements.caseList.innerHTML = state.cases
    .map(
      (item) => `
        <article class="case-item ${state.current?.id === item.id ? "active" : ""}" data-case-id="${escapeHtml(item.id)}" tabindex="0">
          <div class="case-item-top">
            <span class="case-id">${escapeHtml(item.id)}</span>
            <i class="mini-status ${escapeHtml(item.status)}" title="${escapeHtml(STATUS_LABELS[item.status] || item.status)}"></i>
          </div>
          <div class="case-item-title">${escapeHtml(caseDisplayTitle(item))}</div>
          <div class="case-item-meta">${escapeHtml(STATUS_LABELS[item.status] || item.status)} · ${escapeHtml(formatDate(item.updated_at))}</div>
        </article>`,
    )
    .join("");
}

function showEmptyState() {
  state.current = null;
  elements.emptyState.classList.remove("hidden");
  elements.caseContent.classList.add("hidden");
  renderCaseList();
}

async function openCase(caseId) {
  showLoading("加载询价详情…");
  try {
    state.current = await bridge.apiGet(`cases/${encodeURIComponent(caseId)}`);
    state.dirtyFields.clear();
    elements.emptyState.classList.add("hidden");
    elements.caseContent.classList.remove("hidden");
    renderCaseList();
    renderCurrentCase();
  } catch (error) {
    showToast(errorMessage(error), "error");
  } finally {
    hideLoading();
  }
}

function renderCurrentCase() {
  const current = state.current;
  if (!current) return;
  const statusLabel = STATUS_LABELS[current.status] || current.status;
  elements.caseStatus.className = `status-badge ${current.status}`;
  elements.caseStatus.textContent = statusLabel;
  elements.caseRevision.textContent = `修订 ${current.active_revision}`;
  elements.caseTitle.textContent = caseDisplayTitle(current);
  elements.caseSubtitle.textContent = `${current.id} · 创建于 ${formatDate(current.created_at)}`;
  elements.sourceText.textContent = current.source_text || "未提供文本原文";
  elements.responseText.textContent = current.revision.response_text || "";
  elements.solutionCount.textContent = current.recommendation?.candidates?.length || 0;
  elements.exportButton.disabled = current.status !== "approved_for_export";
  renderMissingNotice();
  renderAttachments();
  renderRequirements();
  renderSolutions();
  renderEvidence();
  renderWorkflow();
  selectTab(state.activeTab);
}

function renderMissingNotice() {
  const missing = state.current.revision.missing || [];
  const labels = new Map(FIELD_DEFINITIONS.map(([key, label]) => [key, label]));
  if (missing.length) {
    elements.missingNotice.className = "notice warning";
    elements.missingNotice.innerHTML = `<strong>还差 ${missing.length} 个必填参数：</strong>${missing.map((key) => escapeHtml(labels.get(key) || key)).join("、")}。补齐后才能生成确定性候选方案。`;
  } else {
    elements.missingNotice.className = "notice complete";
    elements.missingNotice.innerHTML = "<strong>必填参数已齐全。</strong> 请核对原文证据与人工值，确认后提交工程审批。";
  }
}

function renderAttachments() {
  const attachments = state.current.attachments || [];
  elements.attachmentList.innerHTML = attachments.length
    ? attachments
        .map(
          (item) => `<span class="attachment-pill"><span aria-hidden="true">▣</span>${escapeHtml(item.filename)} <small>${escapeHtml(humanSize(item.size_bytes))}</small></span>`,
        )
        .join("")
    : '<span class="microcopy">暂未上传附件</span>';
}

function fieldValue(key, field) {
  const value = field?.value;
  if (key === "soft_preferences" && Array.isArray(value)) return value.join("；");
  return value ?? "";
}

function renderRequirements() {
  const requirements = state.current.revision.requirements || {};
  const missing = new Set(state.current.revision.missing || []);
  elements.requirementsForm.innerHTML = FIELD_DEFINITIONS.map(
    ([key, label, unit, required, inputType]) => {
      const field = requirements[key] || {};
      const value = fieldValue(key, field);
      const origin = field.origin || "inferred";
      const originLabel = { explicit: "原文", manual: "人工", inferred: "推断" }[origin] || origin;
      const requiredMark = required ? '<i class="required-dot" title="必填"></i>' : "";
      let input;
      if (inputType === "medium") {
        input = `<select class="requirement-select" data-field="${key}">
          <option value="">请选择</option>
          <option value="clean_water" ${value === "clean_water" ? "selected" : ""}>清水</option>
          <option value="mild_corrosive" ${value === "mild_corrosive" ? "selected" : ""}>弱腐蚀性液体</option>
        </select>`;
      } else {
        input = `<input class="requirement-input" data-field="${key}" type="${inputType}" ${inputType === "number" ? 'step="any"' : ""} value="${escapeHtml(value)}" placeholder="未提供" />`;
      }
      return `<label class="requirement-field ${missing.has(key) ? "missing" : ""}">
        <span class="requirement-label"><span>${requiredMark} ${escapeHtml(label)}</span><span class="origin-tag ${escapeHtml(origin)}">${escapeHtml(originLabel)}</span></span>
        <span class="field-input-wrap">${input}${unit ? `<span class="field-unit">${escapeHtml(unit)}</span>` : ""}</span>
        <span class="field-evidence" title="${escapeHtml(field.evidence || "暂无证据")}">证据：${escapeHtml(field.evidence || "暂无原文证据")}</span>
      </label>`;
    },
  ).join("");
  elements.saveHint.textContent = "修改字段后生成新修订";
}

function renderSolutions() {
  const recommendation = state.current.recommendation;
  const candidates = recommendation?.candidates || [];
  elements.catalogVersion.textContent = recommendation
    ? `目录版本 #${recommendation.catalog_version_id} · 需求修订 ${recommendation.revision_no}`
    : "等待完整参数";
  if (!candidates.length) {
    elements.solutionCards.innerHTML = `<div class="empty-card">${state.current.revision.missing.length ? "补齐必填参数后，这里会显示最多三套候选方案。" : "当前目录没有同时满足全部硬约束的型号，请查看冲突并由工程师复核。"}</div>`;
  } else {
    elements.solutionCards.innerHTML = candidates
      .map((item, index) => {
        const risk = (item.risks || []).join("；");
        return `<article class="solution-card">
          <span class="solution-rank">${index === 0 ? "推荐" : `方案 ${index + 1}`}</span>
          <div class="solution-sku">${escapeHtml(item.sku)}</div>
          <div class="solution-name">${escapeHtml(item.model_name)}</div>
          <div class="fit-row"><span>综合匹配度</span><span class="fit-score">${Number(item.fit_score).toFixed(1)}<small>/100</small></span></div>
          <div class="fit-bar"><span style="width:${Math.max(0, Math.min(100, Number(item.fit_score)))}%"></span></div>
          <dl class="spec-list">
            <div class="spec-row"><dt>流量区间</dt><dd>${escapeHtml(item.flow_min_m3h)}–${escapeHtml(item.flow_max_m3h)} m³/h</dd></div>
            <div class="spec-row"><dt>扬程区间</dt><dd>${escapeHtml(item.head_min_m)}–${escapeHtml(item.head_max_m)} m</dd></div>
            <div class="spec-row"><dt>温度范围</dt><dd>${escapeHtml(item.temp_min_c)}–${escapeHtml(item.temp_max_c)} °C</dd></div>
            <div class="spec-row"><dt>过流材质</dt><dd>${escapeHtml(item.wetted_material)}</dd></div>
            <div class="spec-row"><dt>电机 / 防护</dt><dd>${escapeHtml(item.motor_power_kw)} kW · ${escapeHtml(item.ip_rating)}</dd></div>
            <div class="spec-row"><dt>参考交期</dt><dd>${escapeHtml(item.lead_time_days)} 天</dd></div>
          </dl>
          <div class="price-block"><span>参考单价</span><strong>¥${Number(item.reference_price_cny).toLocaleString("zh-CN")}</strong></div>
          ${risk ? `<p class="risk-note">⚠ ${escapeHtml(risk)}</p>` : ""}
        </article>`;
      })
      .join("");
  }
  const conflicts = recommendation?.conflicts || [];
  elements.conflictList.innerHTML = conflicts.length
    ? `<strong>未入选型号与冲突：</strong><br>${conflicts.map((item) => `${escapeHtml(item.sku)}：${(item.reasons || []).map(escapeHtml).join("、")}`).join("<br>")}`
    : "";
}

function renderEvidence() {
  const evidence = state.current.recommendation?.evidence || [];
  elements.knowledgeEvidence.innerHTML = evidence.length
    ? evidence
        .map(
          (item) => `<article class="evidence-item"><strong>${escapeHtml(item.doc_name || item.title || "知识库片段")}</strong><p>${escapeHtml(item.content || item.text || "")}</p></article>`,
        )
        .join("")
    : '<div class="quiet-empty">未配置知识库，或本次没有检索到手册与历史案例证据。<br>选型仍由结构化产品目录完成。</div>';
  const audit = state.current.audit || [];
  elements.auditList.innerHTML = audit.length
    ? audit
        .map(
          (item) => `<div class="audit-item"><i class="audit-dot"></i><strong>${escapeHtml(auditLabel(item.event_type))}</strong><span>${escapeHtml(item.actor)}</span><time>${escapeHtml(formatDate(item.created_at))}</time></div>`,
        )
        .join("")
    : '<div class="quiet-empty">暂无审计记录</div>';
}

function auditLabel(eventType) {
  return (
    {
      case_created: "创建询价",
      requirements_updated: "更新需求",
      recommendations_generated: "生成候选方案",
      requirements_confirmed: "销售确认需求",
      solutions_approved: "工程批准方案",
      solutions_rejected: "工程驳回方案",
      reference_export_generated: "生成 Excel",
    }[eventType] || eventType
  );
}

function renderWorkflow() {
  const status = state.current.status;
  const order = [
    ["needs_clarification", "补齐参数", "明确全部硬约束"],
    ["awaiting_sales_confirmation", "销售确认", "确认需求与原文证据"],
    ["awaiting_technical_review", "工程审批", "复核候选型号与风险"],
    ["approved_for_export", "商务导出", "下载参考价格表"],
  ];
  const currentIndex = Math.max(0, order.findIndex(([key]) => key === status));
  elements.workflowSteps.innerHTML = order
    .map(
      ([, label, description], index) => `<div class="workflow-step ${index < currentIndex ? "done" : index === currentIndex ? "current" : ""}">
        <span class="step-marker">${index < currentIndex ? "✓" : index + 1}</span>
        <span class="step-copy"><strong>${label}</strong><span>${description}</span></span>
      </div>`,
    )
    .join("");
  elements.salesConfirmButton.disabled = status !== "awaiting_sales_confirmation";
  elements.rejectButton.disabled = status !== "awaiting_technical_review";
  elements.approveButton.disabled = status !== "awaiting_technical_review";
}

function selectTab(tabName) {
  state.activeTab = tabName;
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.tab === tabName);
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === `panel-${tabName}`);
  });
}

function openCreateDialog() {
  elements.newRequestText.value = "";
  elements.createDialog.showModal();
  window.setTimeout(() => elements.newRequestText.focus(), 20);
}

async function createCase() {
  const requestText = elements.newRequestText.value.trim();
  if (!requestText) {
    showToast("请输入客户询价原文", "error");
    return;
  }
  showLoading("提取需求并创建询价…");
  try {
    const created = await bridge.apiPost("cases/create", { request_text: requestText });
    elements.createDialog.close();
    await refreshCases({ preserveSelection: true });
    await openCase(created.id);
    showToast("询价已创建，请核对缺失参数");
  } catch (error) {
    showToast(errorMessage(error), "error");
  } finally {
    hideLoading();
  }
}

async function saveRequirements() {
  if (!state.current) return;
  const fields = {};
  state.dirtyFields.forEach((key) => {
    const input = elements.requirementsForm.querySelector(`[data-field="${key}"]`);
    if (input) fields[key] = input.value;
  });
  const clarificationText = elements.clarificationText.value.trim();
  if (!Object.keys(fields).length && !clarificationText) {
    showToast("请先修改字段或填写客户补充信息", "error");
    return;
  }
  showLoading("保存新修订并重新选型…");
  try {
    state.current = await bridge.apiPost(`cases/${encodeURIComponent(state.current.id)}/update`, {
      expected_revision: state.current.active_revision,
      clarification_text: clarificationText,
      fields,
    });
    state.dirtyFields.clear();
    elements.clarificationText.value = "";
    renderCurrentCase();
    await refreshCases();
    showToast("新修订已保存，已有确认与审批已按修订隔离");
  } catch (error) {
    showToast(errorMessage(error), "error");
    if (errorMessage(error).includes("刷新")) await openCase(state.current.id);
  } finally {
    hideLoading();
  }
}

async function reanalyzeCase() {
  if (!state.current) return;
  showLoading("重新分析原始资料…");
  try {
    state.current = await bridge.apiPost(`cases/${encodeURIComponent(state.current.id)}/analyze`, {
      expected_revision: state.current.active_revision,
    });
    renderCurrentCase();
    await refreshCases();
    showToast("已生成新的分析修订");
  } catch (error) {
    showToast(errorMessage(error), "error");
  } finally {
    hideLoading();
  }
}

async function uploadAttachment(file) {
  if (!state.current || !file) return;
  showLoading("解析附件并重新分析…");
  try {
    state.current = await bridge.upload(
      `cases/${encodeURIComponent(state.current.id)}/attachments`,
      file,
    );
    renderCurrentCase();
    await refreshCases();
    showToast(`附件 ${file.name} 已解析`);
  } catch (error) {
    showToast(errorMessage(error), "error");
  } finally {
    elements.attachmentInput.value = "";
    hideLoading();
  }
}

async function confirmRequirements() {
  if (!state.current) return;
  showLoading("记录销售确认…");
  try {
    state.current = await bridge.apiPost(
      `cases/${encodeURIComponent(state.current.id)}/confirm-requirements`,
      {
        expected_revision: state.current.active_revision,
        comment: elements.approvalComment.value.trim(),
      },
    );
    elements.approvalComment.value = "";
    renderCurrentCase();
    await refreshCases();
    showToast("需求已确认，现等待工程审批");
  } catch (error) {
    showToast(errorMessage(error), "error");
  } finally {
    hideLoading();
  }
}

async function technicalDecision(decision) {
  if (!state.current) return;
  showLoading(decision === "approved" ? "记录工程批准…" : "记录工程驳回…");
  try {
    state.current = await bridge.apiPost(
      `cases/${encodeURIComponent(state.current.id)}/approve-solutions`,
      {
        expected_revision: state.current.active_revision,
        decision,
        comment: elements.approvalComment.value.trim(),
      },
    );
    elements.approvalComment.value = "";
    renderCurrentCase();
    await refreshCases();
    showToast(decision === "approved" ? "工程审批通过，可以导出" : "方案已驳回，请修改需求后重新提交");
  } catch (error) {
    showToast(errorMessage(error), "error");
  } finally {
    hideLoading();
  }
}

async function exportCase() {
  if (!state.current) return;
  try {
    await bridge.download(
      `cases/${encodeURIComponent(state.current.id)}/export`,
      {},
      `${state.current.id}_选型与参考价格表.xlsx`,
    );
    await openCase(state.current.id);
    showToast("选型与参考价格表已下载");
  } catch (error) {
    showToast(errorMessage(error), "error");
  }
}

async function importCatalog() {
  const file = elements.catalogInput.files[0];
  if (!file) return;
  showLoading("校验并原子导入产品目录…");
  try {
    const result = await bridge.upload("catalog/import", file);
    elements.catalogDialog.close();
    elements.catalogInput.value = "";
    elements.catalogImportButton.disabled = true;
    showToast(`目录版本 #${result.version_id} 已启用，共 ${result.product_count} 个型号`);
    if (state.current) await reanalyzeCase();
  } catch (error) {
    showToast(errorMessage(error), "error");
  } finally {
    hideLoading();
  }
}

function wireEvents() {
  elements.newCaseButton.addEventListener("click", openCreateDialog);
  document.querySelectorAll('[data-action="open-create"]').forEach((button) =>
    button.addEventListener("click", openCreateDialog),
  );
  elements.catalogButton.addEventListener("click", () => elements.catalogDialog.showModal());
  elements.createForm.addEventListener("submit", (event) => {
    if (event.submitter?.value !== "default") return;
    event.preventDefault();
    createCase();
  });
  elements.catalogForm.addEventListener("submit", (event) => {
    if (event.submitter?.value === "cancel") return;
    event.preventDefault();
  });
  elements.caseList.addEventListener("click", (event) => {
    const item = event.target.closest("[data-case-id]");
    if (item) openCase(item.dataset.caseId);
  });
  elements.caseList.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const item = event.target.closest("[data-case-id]");
    if (item) openCase(item.dataset.caseId);
  });
  let searchTimer;
  elements.caseSearch.addEventListener("input", () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => refreshCases(), 250);
  });
  elements.statusFilters.addEventListener("click", (event) => {
    const button = event.target.closest("[data-status]");
    if (!button) return;
    state.activeStatus = button.dataset.status;
    elements.statusFilters.querySelectorAll(".filter-chip").forEach((chip) =>
      chip.classList.toggle("active", chip === button),
    );
    refreshCases();
  });
  document.querySelector(".tabs").addEventListener("click", (event) => {
    const tab = event.target.closest("[data-tab]");
    if (tab) selectTab(tab.dataset.tab);
  });
  elements.requirementsForm.addEventListener("input", (event) => {
    const key = event.target.dataset.field;
    if (!key) return;
    state.dirtyFields.add(key);
    elements.saveHint.textContent = `有 ${state.dirtyFields.size} 个字段待保存`;
  });
  elements.saveRequirementsButton.addEventListener("click", saveRequirements);
  elements.analyzeButton.addEventListener("click", reanalyzeCase);
  elements.attachmentInput.addEventListener("change", () =>
    uploadAttachment(elements.attachmentInput.files[0]),
  );
  elements.salesConfirmButton.addEventListener("click", confirmRequirements);
  elements.approveButton.addEventListener("click", () => technicalDecision("approved"));
  elements.rejectButton.addEventListener("click", () => technicalDecision("rejected"));
  elements.exportButton.addEventListener("click", exportCase);
  elements.copyReplyButton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(elements.responseText.textContent || "");
      showToast("回复文案已复制");
    } catch {
      showToast("浏览器未允许复制，请手动选择文本", "error");
    }
  });
  elements.downloadTemplateButton.addEventListener("click", () =>
    bridge.download("catalog/template", {}, "离心泵产品目录模板.xlsx"),
  );
  elements.catalogInput.addEventListener("change", () => {
    elements.catalogImportButton.disabled = !elements.catalogInput.files.length;
  });
  elements.catalogImportButton.addEventListener("click", importCatalog);
}

async function initialize() {
  if (!bridge) {
    showToast("AstrBot 插件页面桥接未加载", "error");
    return;
  }
  try {
    await bridge.ready();
    wireEvents();
    await refreshCases({ preserveSelection: false });
  } catch (error) {
    showToast(errorMessage(error), "error");
    showEmptyState();
  }
}

initialize();
