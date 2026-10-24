(function () {
  const TOKEN_KEY = "sq_token";
  const USER_KEY = "sq_user";
  const ASTRBOT_ORIGIN = "http://127.0.0.1:6185";
  let creating = false;
  let booted = false;

  function token() {
    return localStorage.getItem(TOKEN_KEY) || "";
  }
  function username() {
    return localStorage.getItem(USER_KEY) || "";
  }
  function authed() {
    return !!token();
  }
  function clock() {
    const now = new Date();
    return (
      String(now.getHours()).padStart(2, "0") +
      ":" +
      String(now.getMinutes()).padStart(2, "0")
    );
  }
  function chatStore() {
    const root = document.querySelector("#app");
    const app = root && root.__vue_app__;
    const pinia = app && app.config.globalProperties.$pinia;
    return pinia && pinia._s ? pinia._s.get("chat") : null;
  }
  function uiStore() {
    const root = document.querySelector("#app");
    const app = root && root.__vue_app__;
    const pinia = app && app.config.globalProperties.$pinia;
    return pinia && pinia._s ? pinia._s.get("ui") : null;
  }
  async function api(path, options) {
    const headers = Object.assign({}, (options && options.headers) || {});
    if (!headers["Content-Type"] && options && options.body) {
      headers["Content-Type"] = "application/json";
    }
    if (token()) headers.Authorization = "Bearer " + token();
    const res = await fetch(path, Object.assign({}, options, { headers }));
    const type = res.headers.get("content-type") || "";
    if (type.includes("text/event-stream")) return { res, data: null, stream: true };
    const data = await res.json().catch(function () {
      return {};
    });
    return { res, data, stream: false };
  }
  function textFromContent(content) {
    if (!content) return "";
    if (typeof content === "string") return content;
    const parts = Array.isArray(content) ? content : content.message || [];
    if (typeof parts === "string") return parts;
    if (!Array.isArray(parts)) return "";
    return parts
      .map(function (part) {
        if (!part) return "";
        if (typeof part === "string") return part;
        if (part.type === "plain" || part.type === "text") return part.text || "";
        return "";
      })
      .join("");
  }
  function toBubble(entry) {
    const content = entry.content || {};
    const isBot = content.type === "bot" || entry.sender_id === "bot";
    const when = entry.created_at ? new Date(entry.created_at) : new Date();
    const time = isNaN(when.getTime())
      ? clock()
      : String(when.getHours()).padStart(2, "0") +
        ":" +
        String(when.getMinutes()).padStart(2, "0");
    return {
      id: entry.id || Date.now() + Math.random(),
      role: isBot ? "agent" : "sales",
      time: time,
      name: isBot ? "机器人" : username() || "我",
      blocks: [{ type: "text", text: textFromContent(content) }],
    };
  }
  function platformKey(item) {
    return item.user_id + "\u0000" + item.cid;
  }
  function platformName(item) {
    const info = item.umo_info || {};
    return (
      info.user_alias ||
      info.auto_name ||
      item.title ||
      info.display_name ||
      info.session_id ||
      item.user_id ||
      "未知联系人"
    );
  }
  function parseHistory(history) {
    if (Array.isArray(history)) return history;
    if (typeof history === "string") {
      try {
        const parsed = JSON.parse(history);
        return Array.isArray(parsed) ? parsed : [];
      } catch (error) {
        return [];
      }
    }
    return [];
  }
  function messageText(message) {
    if (!message || typeof message !== "object") return "";
    const content = Array.isArray(message.content) ? message.content : [message.content];
    return content
      .map(function (item) {
        if (typeof item === "string") return item;
        if (item && (item.type === "text" || item.type === "plain") && item.text) return item.text;
        return "";
      })
      .join("")
      .replace(/<system_reminder>[\s\S]*?<\/system_reminder>/gi, "")
      .trim();
  }
  function asDate(value) {
    if (value == null || value === "") return null;
    const date =
      typeof value === "number"
        ? new Date(value < 1e12 ? value * 1000 : value)
        : new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }
  function formatDay(value) {
    const date = asDate(value);
    return date ? date.getMonth() + 1 + "/" + date.getDate() : "";
  }
  function formatClock(value) {
    const date = asDate(value);
    if (!date) return "";
    return (
      String(date.getHours()).padStart(2, "0") +
      ":" +
      String(date.getMinutes()).padStart(2, "0")
    );
  }
  function lastPreview(history) {
    const list = parseHistory(history);
    for (let index = list.length - 1; index >= 0; index -= 1) {
      const text = messageText(list[index]).replace(/\s+/g, " ");
      if (text) return text.slice(0, 42);
    }
    return "";
  }
  function mapSessions(list) {
    const colors = ["#5B8FF9", "#3ECF8E", "#F5A623", "#8B5CF6", "#F06595"];
    return list.map(function (item, index) {
      const label = platformName(item);
      const platform = (item.umo_info && item.umo_info.platform) || item.platform_id || "平台";
      const snippet = lastPreview(item.history);
      return {
        id: platformKey(item),
        userId: item.user_id,
        cid: item.cid,
        label: label,
        company: platform,
        preview: snippet ? platform + " · " + snippet : platform,
        time: formatDay(item.updated_at || item.created_at),
        avatar: label.slice(0, 1) || "会",
        color: colors[index % colors.length],
      };
    });
  }
  function historyBubbles(history, contactName) {
    return parseHistory(history)
      .map(function (message) {
        if (!message || (message.role !== "user" && message.role !== "assistant" && message.role !== "tool")) return null;
        const text = messageText(message);
        if (!text) return null;
        const fromUser = message.role === "user";
        return {
          id: message.id || Date.now() + Math.random(),
          role: fromUser ? "customer" : "sales",
          time: formatClock(message.timestamp || message.created_at),
          name: fromUser ? contactName || "对方" : username() || "我",
          blocks: [{ type: "text", text: text }],
        };
      })
      .filter(Boolean);
  }
  function keepLocalTail(current, next) {
    if (!current || !current.length) return next;
    const tail = [];
    for (let index = current.length - 1; index >= 0; index -= 1) {
      const item = current[index];
      const text = item.blocks && item.blocks[0] ? item.blocks[0].text : "";
      const found = next.some(function (msg) {
        return msg.role === item.role && msg.blocks[0].text === text;
      });
      if (found && item.role !== "agent") break;
      tail.unshift(item);
      if (tail.length > 6) break;
    }
    return tail.length ? next.concat(tail) : next;
  }
  function sameBubbles(current, next) {
    if (!current || current.length !== next.length) return false;
    for (let index = 0; index < current.length; index += 1) {
      if (current[index].role !== next[index].role) return false;
      if (current[index].blocks[0].text !== next[index].blocks[0].text) return false;
    }
    return true;
  }
  function sessionIdOf(row) {
    const parts = String((row && row.userId) || "").split(":");
    return parts.length >= 3 ? parts.slice(2).join(":") : "";
  }
  function formatPrice(value) {
    const number = Number(value);
    if (!isFinite(number)) return "";
    return "¥" + Math.round(number).toLocaleString("zh-CN");
  }
  function showValue(value) {
    if (Array.isArray(value)) {
      return value
        .map(function (item) {
          return { clean_water: "清水", mild_corrosive: "弱腐蚀性液体" }[item] || item;
        })
        .join("、");
    }
    if (value == null || value === "") return "";
    return String(value);
  }
  function rangeText(min, max, unit) {
    if (min == null && max == null) return "";
    const unitText = unit ? " " + unit : "";
    if (min == null) return "≤" + max + unitText;
    if (max == null) return "≥" + min + unitText;
    return min + "–" + max + unitText;
  }
  function candidateReply(candidate) {
    const name = candidate.model_name || candidate.sku;
    return (
      name +
      "（" +
      candidate.sku +
      "）：匹配度 " +
      Number(candidate.fit_score).toFixed(1) +
      "，流量 " +
      rangeText(candidate.flow_min_m3h, candidate.flow_max_m3h, "m³/h") +
      "，扬程 " +
      rangeText(candidate.head_min_m, candidate.head_max_m, "m") +
      "，过流材质 " +
      showValue(candidate.wetted_material) +
      "，参考单价 " +
      formatPrice(candidate.reference_price_cny) +
      "，参考交期 " +
      candidate.lead_time_days +
      " 天。以上均为虚构演示参考价，需商务核价，不得直接作为正式报价。"
    );
  }
  function optionFields(pairs) {
    return pairs.filter(function (pair) {
      return pair.value != null && pair.value !== "";
    });
  }
  function buildOptions(detail) {
    const revision = (detail && detail.revision) || {};
    const full = String(revision.response_text || "").trim();
    const options = [];
    if (full) {
      options.push({
        kind: "full",
        label: "完整回复",
        title: "完整回复",
        subtitle: detail.id || "",
        body: full,
        fields: [],
        risks: [],
        text: full,
      });
    }
    const candidates =
      (detail.recommendation && detail.recommendation.candidates) || [];
    candidates.forEach(function (candidate) {
      if (!candidate || !candidate.sku) return;
      options.push({
        kind: "product",
        label: candidate.sku,
        title: candidate.model_name || candidate.sku,
        subtitle: candidate.sku,
        body: candidate.match_reason || "",
        risks: Array.isArray(candidate.risks) ? candidate.risks : [],
        fields: optionFields([
          { label: "匹配度", value: candidate.fit_score != null ? Number(candidate.fit_score).toFixed(1) : "" },
          { label: "参考单价", value: formatPrice(candidate.reference_price_cny) },
          { label: "参考交期", value: candidate.lead_time_days != null ? candidate.lead_time_days + " 天" : "" },
          { label: "流量", value: rangeText(candidate.flow_min_m3h, candidate.flow_max_m3h, "m³/h") },
          { label: "扬程", value: rangeText(candidate.head_min_m, candidate.head_max_m, "m") },
          { label: "介质", value: showValue(candidate.compatible_media) },
          { label: "温度", value: rangeText(candidate.temp_min_c, candidate.temp_max_c, "°C") },
          { label: "过流材质", value: showValue(candidate.wetted_material) },
          { label: "功率", value: candidate.motor_power_kw != null ? candidate.motor_power_kw + " kW" : "" },
          { label: "电压 / 频率", value: [candidate.voltage_v && candidate.voltage_v + " V", candidate.frequency_hz && candidate.frequency_hz + " Hz"].filter(Boolean).join(" / ") },
          { label: "防护", value: showValue(candidate.ip_rating) },
          { label: "机封", value: showValue(candidate.seal_type) },
        ]),
        note: candidate.price_note || "",
        text: candidateReply(candidate),
      });
    });
    return options;
  }
  function customerTexts(messages) {
    return (messages || [])
      .filter(function (message) {
        return message.role === "customer";
      })
      .slice(-6)
      .map(function (message) {
        return message.blocks && message.blocks[0] ? message.blocks[0].text : "";
      });
  }
  function sourceOverlaps(source, texts) {
    const hay = String(source || "").replace(/\s+/g, "");
    return texts.some(function (text) {
      const needle = String(text || "").replace(/\s+/g, "");
      return needle.length >= 4 && (hay.indexOf(needle) !== -1 || needle.indexOf(hay) !== -1);
    });
  }
  function lastSentText(messages) {
    const list = messages || [];
    for (let index = list.length - 1; index >= 0; index -= 1) {
      const message = list[index];
      if (message.role === "agent" && message.name === "提示") return "";
      if (message.role === "sales") {
        return message.blocks && message.blocks[0] ? String(message.blocks[0].text || "").trim() : "";
      }
    }
    return "";
  }
  let optionRequest = 0;
  let pendingOptions = [];
  let expandedOptionText = "";
  function chatBody() {
    return document.querySelector(".main.view-chat .chat-body") || document.querySelector(".chat-body");
  }
  function fillDraft(text) {
    const store = chatStore();
    if (!store || store.processing) return;
    store.draft = text;
    const area = document.querySelector(".main.view-chat .chat-input textarea, .chat-input textarea");
    if (area) {
      area.value = text;
      area.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }
  function appendText(parent, className, text) {
    const node = document.createElement("div");
    node.className = className;
    node.textContent = text;
    parent.appendChild(node);
    return node;
  }
  function renderOptions(options, selectedText) {
    pendingOptions = options || [];
    const body = chatBody();
    let bar = document.querySelector(".sq-options");
    if (!body || !pendingOptions.length) {
      if (bar) bar.remove();
      return;
    }
    if (!bar || bar.parentElement !== body) {
      if (bar) bar.remove();
      bar = document.createElement("div");
      bar.className = "sq-options";
    }
    body.appendChild(bar);
    if (expandedOptionText && !pendingOptions.some(function (option) {
      return option.text === expandedOptionText;
    })) {
      expandedOptionText = "";
    }
    bar.replaceChildren();
    const card = document.createElement("article");
    card.className = "sq-option-card";
    appendText(card, "sq-options-title", "待确认后发送");
    const row = document.createElement("div");
    row.className = "sq-options-row";
    pendingOptions.forEach(function (option) {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className =
        "sq-option-tab" +
        (option.text === expandedOptionText ? " open" : "") +
        (option.text === selectedText ? " active" : "");
      tab.textContent = option.label;
      tab.addEventListener("click", function () {
        expandedOptionText = expandedOptionText === option.text ? "" : option.text;
        renderOptions(pendingOptions, selectedText);
      });
      row.appendChild(tab);
    });
    card.appendChild(row);
    const open = pendingOptions.find(function (option) {
      return option.text === expandedOptionText;
    });
    if (open) {
      const detail = document.createElement("div");
      detail.className = "sq-option-detail";
      const head = document.createElement("div");
      head.className = "sq-option-head";
      appendText(head, "sq-option-title", open.title);
      if (open.subtitle) appendText(head, "sq-option-sub", open.subtitle);
      detail.appendChild(head);
      if (open.fields && open.fields.length) {
        const grid = document.createElement("div");
        grid.className = "sq-option-fields";
        open.fields.forEach(function (field) {
          const cell = document.createElement("div");
          cell.className = "sq-option-field";
          const label = document.createElement("em");
          label.textContent = field.label;
          cell.appendChild(label);
          cell.appendChild(document.createTextNode(field.value));
          grid.appendChild(cell);
        });
        detail.appendChild(grid);
      }
      if (open.body) appendText(detail, "sq-option-body", open.body);
      if (open.note) appendText(detail, "sq-option-note", open.note);
      (open.risks || []).forEach(function (risk) {
        appendText(detail, "sq-option-risk", risk);
      });
      const button = document.createElement("button");
      button.type = "button";
      button.className = "sq-option";
      button.textContent = open.text === selectedText ? "已填入，按发送确认" : "选用，确认后发送";
      button.addEventListener("click", function () {
        fillDraft(open.text);
        renderOptions(pendingOptions, open.text);
      });
      detail.appendChild(button);
      card.appendChild(detail);
    }
    bar.appendChild(card);
  }
  async function fetchCase(id) {
    const result = await api(
      "/api/plug/astrbot_plugin_rfq_assistant/cases/" + encodeURIComponent(id)
    );
    if (!result.res.ok || !result.data || result.data.status === "error") return null;
    return result.data;
  }
  async function refreshOptions(store) {
    const requestId = ++optionRequest;
    const row = (store.remoteSessions || []).find(function (item) {
      return item.id === store.activeCustomerId;
    });
    if (!row) {
      renderOptions([]);
      return;
    }
    const messages =
      (store.conversations[row.id] && store.conversations[row.id].messages) || [];
    const result = await api(
      "/api/plug/astrbot_plugin_rfq_assistant/cases?status=awaiting_sales_confirmation"
    );
    if (requestId !== optionRequest) return;
    if (!result.res.ok || !result.data || result.data.status === "error") {
      renderOptions([]);
      return;
    }
    const cases = Array.isArray(result.data.cases) ? result.data.cases : [];
    const sessionId = sessionIdOf(row);
    let detail = null;
    const linked = cases.find(function (item) {
      const actor = String(item.created_by || "");
      return sessionId && (actor === "chat:" + sessionId || actor.indexOf(sessionId) !== -1);
    });
    if (linked) detail = await fetchCase(linked.id);
    if (requestId !== optionRequest) return;
    if (!detail) {
      const texts = customerTexts(messages);
      const limit = Math.min(cases.length, 8);
      for (let index = 0; index < limit; index += 1) {
        const item = await fetchCase(cases[index].id);
        if (requestId !== optionRequest) return;
        if (item && sourceOverlaps(item.source_text, texts)) {
          detail = item;
          break;
        }
      }
    }
    if (requestId !== optionRequest) return;
    const options = detail && detail.status === "awaiting_sales_confirmation" ? buildOptions(detail) : [];
    const sent = lastSentText(messages);
    if (!store.processing && sent && options.some(function (option) {
      return option.text.trim() === sent;
    })) {
      renderOptions([]);
      return;
    }
    renderOptions(options, store.draft);
  }
  async function loadHistory(store, id) {
    const row = (store.remoteSessions || []).find(function (item) {
      return item.id === id;
    });
    if (!row) {
      renderOptions([]);
      return;
    }
    const result = await api(
      "/api/v1/conversations/" +
        encodeURIComponent(row.cid) +
        "?user_id=" +
        encodeURIComponent(row.userId)
    );
    if (!result.res.ok || result.data.status === "error") {
      await refreshOptions(store);
      return;
    }
    const detail = result.data.data || {};
    const next = keepLocalTail(
      store.conversations[id] && store.conversations[id].messages,
      historyBubbles(detail.history, row.label)
    );
    if (!store.conversations[id]) {
      store.conversations[id] = { messages: [], demoStep: 999 };
    }
    if (!sameBubbles(store.conversations[id].messages, next)) {
      store.conversations[id].messages = next;
    }
    await refreshOptions(store);
  }
  async function refreshSessions(store, selectId, options) {
    const result = await api(
      "/api/v1/conversations?page=1&page_size=30&include_history=true&exclude_platforms=webchat&sort_by=updated_at&sort_order=desc"
    );
    if (!result.res.ok || result.data.status === "error") {
      throw new Error((result.data && result.data.message) || "无法读取平台会话");
    }
    const payload = result.data.data || {};
    const list = Array.isArray(payload.conversations) ? payload.conversations : [];
    store.platformMode = true;
    const mapped = mapSessions(list);
    store.remoteSessions = mapped;
    if (!mapped.length) {
      if (store.activeCustomerId !== "__platform_empty") store.switchCustomer("__platform_empty");
      if (store.conversations.__platform_empty) store.conversations.__platform_empty.messages = [];
      renderOptions([]);
      return null;
    }
    const next =
      (selectId && mapped.some(function (item) { return item.id === selectId; })
        ? selectId
        : null) ||
      (mapped.some(function (item) { return item.id === store.activeCustomerId; })
        ? store.activeCustomerId
        : mapped[0].id);
    if (store.processing && !(options && options.force)) return next;
    if (store.activeCustomerId !== next) store.switchCustomer(next);
    else await loadHistory(store, next);
    return next;
  }
  function createSession() {
    window.alert("平台会话由对方发来的消息产生，不能在这里新建。");
  }
  function consumeSse(buffer, onEvent) {
    const chunks = buffer.split("\n\n");
    const rest = chunks.pop() || "";
    chunks.forEach(function (chunk) {
      let payload = "";
      chunk.split("\n").forEach(function (line) {
        if (line.indexOf("data:") === 0) payload += line.slice(5).trim();
      });
      if (!payload) return;
      try {
        onEvent(JSON.parse(payload));
      } catch (error) {}
    });
    return rest;
  }
  async function send(store, raw) {
    const text = String(raw || "").trim();
    if (!text || store.processing) return;
    const row = (store.remoteSessions || []).find(function (item) {
      return item.id === store.activeCustomerId;
    });
    if (!row || !row.userId || !row.cid) return;
    store.draft = "";
    const hm = clock();
    store.messages.push({
      id: Date.now(),
      role: "sales",
      time: hm,
      name: username() || "我",
      blocks: [{ type: "text", text: text }],
    });
    store.processing = true;
    try {
      const result = await api(
        "/api/v1/conversations/" +
          encodeURIComponent(row.cid) +
          "/messages?user_id=" +
          encodeURIComponent(row.userId),
        { method: "POST", body: JSON.stringify({ message: text }) }
      );
      const data = result.data || {};
      if (!result.res.ok || data.status === "error") {
        store.messages.push({
          id: Date.now() + 1,
          role: "agent",
          time: hm,
          name: "提示",
          blocks: [{ type: "text", text: data.message || "发送失败" }],
        });
        if (result.res.status === 401) showLogin(data.message || "请重新登录");
        return;
      }
      await refreshSessions(store, row.id, { force: true });
    } catch (error) {
      store.messages.push({
        id: Date.now() + 1,
        role: "agent",
        time: hm,
        name: "提示",
        blocks: [{ type: "text", text: error.message || String(error) }],
      });
    } finally {
      store.processing = false;
    }
  }
  const LANGUAGES = [
    { code: "zh-CN", label: "简体中文", flag: "🇨🇳" },
    { code: "en-US", label: "English", flag: "🇺🇸" },
    { code: "ja-JP", label: "日本語", flag: "🇯🇵" },
    { code: "ru-RU", label: "Русский", flag: "🇷🇺" },
  ];
  const THEMES = [
    { mode: "light", label: "浅色" },
    { mode: "dark", label: "深色" },
    { mode: "system", label: "跟随系统" },
  ];
  function getLocale() {
    return localStorage.getItem("sq-locale") || "zh-CN";
  }
  function getTheme() {
    return localStorage.getItem("sq-theme") || "light";
  }
  function resolvedTheme(mode) {
    if (mode === "dark") return "dark";
    if (mode === "light") return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  function applyTheme() {
    const mode = getTheme();
    document.documentElement.dataset.theme = mode;
    document.documentElement.dataset.resolvedTheme = resolvedTheme(mode);
    document.documentElement.lang = getLocale();
  }
  function syncEmbeds() {
    const message = { type: "sq-pref", locale: getLocale(), theme: getTheme() };
    document.querySelectorAll("iframe.settings-frame").forEach(function (frame) {
      if (frame.contentWindow) frame.contentWindow.postMessage(message, ASTRBOT_ORIGIN);
    });
  }
  function frameUrl(next, embed) {
    return (
      ASTRBOT_ORIGIN +
      "/token-bridge.html?token=" +
      encodeURIComponent(token()) +
      "&username=" +
      encodeURIComponent(username()) +
      "&next=" +
      encodeURIComponent(next) +
      "&embed=" +
      encodeURIComponent(embed) +
      "&locale=" +
      encodeURIComponent(getLocale()) +
      "&theme=" +
      encodeURIComponent(getTheme())
    );
  }
  function settingsUrl() {
    return frameUrl("/bot-config/overview", "config");
  }
  function chatUrl() {
    return frameUrl("/chat", "chat");
  }
  function refreshFrames() {
    document.querySelectorAll("iframe.chat-frame, iframe.settings-frame").forEach(function (frame) {
      if (frame.classList.contains("chat-frame")) frame.src = chatUrl();
      else frame.src = settingsUrl();
    });
  }
  function openSettings(ui) {
    if (!authed()) {
      showLogin();
      return;
    }
    const store = ui || uiStore();
    if (store) store.setView("settings");
    const button = document.querySelector(".rail-settings");
    if (button) button.classList.add("active");
  }
  function onSwitch(store, id) {
    if (
      store.remoteSessions &&
      store.remoteSessions.some(function (item) {
        return item.id === id;
      })
    ) {
      loadHistory(store, id);
    }
  }
  function mountSettingsButton() {
    const rail = document.querySelector(".rail");
    if (!rail || rail.querySelector(".rail-settings")) return;
    const sample = rail.querySelector(".rail-item");
    const scope = sample
      ? Array.from(sample.attributes).find(function (attr) {
          return attr.name.indexOf("data-v-") === 0;
        })
      : null;
    const spacer = document.createElement("div");
    spacer.className = "rail-spacer";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "rail-item rail-settings";
    button.title = "设置";
    button.innerHTML =
      '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c.3.6.9 1 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"></path></svg>';
    if (scope) {
      spacer.setAttribute(scope.name, "");
      button.setAttribute(scope.name, "");
    }
    button.addEventListener("click", function () {
      openSettings();
    });
    rail.addEventListener("click", function (event) {
      const item = event.target.closest && event.target.closest(".rail-item");
      if (item && !item.classList.contains("rail-settings")) {
        button.classList.remove("active");
      }
    });
    rail.appendChild(spacer);
    rail.appendChild(button);
  }
  function showLogin(message) {
    let mask = document.querySelector(".sq-login");
    if (!mask) {
      mask = document.createElement("div");
      mask.className = "sq-login";
      mask.innerHTML =
        '<form class="sq-login-card">' +
        '<h1>登录 AstrBot</h1>' +
        '<p class="sq-login-sub">登录后才能使用对话和机器人配置</p>' +
        '<label>用户名<input name="username" autocomplete="username" required></label>' +
        '<label>密码<input name="password" type="password" autocomplete="current-password" required></label>' +
        '<label class="sq-totp" hidden>验证码<input name="code" inputmode="text" autocomplete="one-time-code" placeholder="需要两步验证时填写"></label>' +
        '<p class="sq-login-error" hidden></p>' +
        '<button type="submit">登录</button>' +
        "</form>";
      document.body.appendChild(mask);
      mask.querySelector("form").addEventListener("submit", onSubmit);
    }
    mask.hidden = false;
    const errorNode = mask.querySelector(".sq-login-error");
    if (message) {
      errorNode.hidden = false;
      errorNode.textContent = message;
    }
  }
  function hideLogin() {
    const mask = document.querySelector(".sq-login");
    if (mask) mask.hidden = true;
  }
  async function onSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector("button");
    const errorNode = form.querySelector(".sq-login-error");
    const payload = {
      username: form.username.value.trim(),
      password: form.password.value,
    };
    if (form.code.value.trim()) payload.code = form.code.value.trim();
    button.disabled = true;
    errorNode.hidden = true;
    try {
      const result = await api("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const data = result.data || {};
      if (data.data && data.data.totp_required) {
        form.querySelector(".sq-totp").hidden = false;
        errorNode.hidden = false;
        errorNode.textContent = data.message || "需要 TOTP 验证码";
        return;
      }
      if (!result.res.ok || data.status === "error" || !(data.data && data.data.token)) {
        errorNode.hidden = false;
        errorNode.textContent = data.message || "登录失败";
        return;
      }
      localStorage.setItem(TOKEN_KEY, data.data.token);
      localStorage.setItem(USER_KEY, data.data.username || payload.username);
      hideLogin();
      refreshFrames();
      await bootSessions();
    } catch (error) {
      errorNode.hidden = false;
      errorNode.textContent = error.message || "无法连接 AstrBot";
    } finally {
      button.disabled = false;
    }
  }
  let pollTimer = null;
  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(function () {
      if (document.hidden || !authed()) return;
      const store = chatStore();
      if (!store || store.processing) return;
      refreshSessions(store).catch(function () {});
    }, 3000);
  }
  async function bootSessions() {
    const store = chatStore();
    if (!store || !authed()) return;
    try {
      await refreshSessions(store);
      startPolling();
    } catch (error) {
      showLogin(error.message || "无法连接 AstrBot");
    }
  }
  function watchOptions() {
    const root = document.querySelector("#app");
    if (!root || root.dataset.sqOptionsWatch) return;
    root.dataset.sqOptionsWatch = "1";
    new MutationObserver(function () {
      if (!pendingOptions.length) return;
      const body = chatBody();
      const bar = document.querySelector(".sq-options");
      if (body && (!bar || bar.parentElement !== body || body.lastElementChild !== bar)) {
        const store = chatStore();
        renderOptions(pendingOptions, store ? store.draft : "");
      }
    }).observe(root, { childList: true, subtree: true });
  }
  function boot() {
    if (booted) return;
    if (!chatStore()) return;
    booted = true;
    applyTheme();
    mountSettingsButton();
    watchOptions();
    if (authed()) {
      refreshFrames();
      bootSessions();
    } else showLogin();
  }
  function closeUserMenu() {
    const menu = document.querySelector(".sq-user-menu");
    if (menu) menu.hidden = true;
  }
  function setLocale(code) {
    localStorage.setItem("sq-locale", code);
    applyTheme();
    syncEmbeds();
    closeUserMenu();
  }
  function setTheme(mode) {
    localStorage.setItem("sq-theme", mode);
    applyTheme();
    syncEmbeds();
    closeUserMenu();
  }
  function showAccountDialog() {
    closeUserMenu();
    let mask = document.querySelector(".sq-account");
    if (!mask) {
      mask = document.createElement("div");
      mask.className = "sq-account";
      mask.innerHTML =
        '<form class="sq-login-card">' +
        "<h1>修改账户</h1>" +
        '<label>新用户名<input name="new_username" autocomplete="username" placeholder="留空则不修改"></label>' +
        '<label>当前密码<input name="password" type="password" autocomplete="current-password" required></label>' +
        '<label>新密码<input name="new_password" type="password" autocomplete="new-password" required></label>' +
        '<label>确认新密码<input name="confirm_password" type="password" autocomplete="new-password" required></label>' +
        '<p class="sq-login-error" hidden></p>' +
        '<div class="sq-account-actions"><button type="button" class="sq-ghost">取消</button><button type="submit">保存</button></div>' +
        "</form>";
      document.body.appendChild(mask);
      mask.querySelector(".sq-ghost").addEventListener("click", function () {
        mask.hidden = true;
      });
      mask.querySelector("form").addEventListener("submit", onAccountSubmit);
    }
    mask.hidden = false;
    mask.querySelector("form").new_username.value = username();
  }
  async function onAccountSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const errorNode = form.querySelector(".sq-login-error");
    const button = form.querySelector('button[type="submit"]');
    errorNode.hidden = true;
    if (form.new_password.value !== form.confirm_password.value) {
      errorNode.hidden = false;
      errorNode.textContent = "两次输入的新密码不一致";
      return;
    }
    button.disabled = true;
    try {
      const result = await api("/api/v1/auth/account", {
        method: "PATCH",
        body: JSON.stringify({
          password: form.password.value,
          new_password: form.new_password.value,
          confirm_password: form.confirm_password.value,
          new_username: form.new_username.value.trim() || undefined,
        }),
      });
      const data = result.data || {};
      if (!result.res.ok || data.status === "error") {
        errorNode.hidden = false;
        errorNode.textContent = data.message || "修改失败";
        return;
      }
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      form.reset();
      document.querySelector(".sq-account").hidden = true;
      showLogin("账户已更新，请重新登录");
    } catch (error) {
      errorNode.hidden = false;
      errorNode.textContent = error.message || "无法连接 AstrBot";
    } finally {
      button.disabled = false;
    }
  }
  function ensureUserMenu() {
    let menu = document.querySelector(".sq-user-menu");
    if (menu) return menu;
    menu = document.createElement("div");
    menu.className = "sq-user-menu";
    menu.hidden = true;
    const locale = getLocale();
    const theme = getTheme();
    const lang = LANGUAGES.find(function (item) { return item.code === locale; }) || LANGUAGES[0];
    menu.innerHTML =
      '<button type="button" class="sq-menu-item" data-panel="lang"><span>语言</span><span>' + lang.flag + " ›</span></button>" +
      '<div class="sq-submenu" data-for="lang" hidden>' +
      LANGUAGES.map(function (item) {
        return '<button type="button" data-locale="' + item.code + '">' + item.flag + " " + item.label + "</button>";
      }).join("") +
      "</div>" +
      '<button type="button" class="sq-menu-item" data-panel="theme"><span>主题</span><span>' + (THEMES.find(function (item) { return item.mode === theme; }) || THEMES[0]).label + " ›</span></button>" +
      '<div class="sq-submenu" data-for="theme" hidden>' +
      THEMES.map(function (item) {
        return '<button type="button" data-theme="' + item.mode + '">' + item.label + "</button>";
      }).join("") +
      "</div>" +
      '<button type="button" class="sq-menu-item" data-account>修改账户</button>';
    menu.addEventListener("click", function (event) {
      const target = event.target.closest("button");
      if (!target) return;
      if (target.dataset.panel) {
        const panel = menu.querySelector('.sq-submenu[data-for="' + target.dataset.panel + '"]');
        menu.querySelectorAll(".sq-submenu").forEach(function (node) {
          if (node !== panel) node.hidden = true;
        });
        panel.hidden = !panel.hidden;
        return;
      }
      if (target.dataset.locale) setLocale(target.dataset.locale);
      if (target.dataset.theme) setTheme(target.dataset.theme);
      if (target.hasAttribute("data-account")) showAccountDialog();
    });
    document.body.appendChild(menu);
    document.addEventListener("click", function (event) {
      if (menu.hidden) return;
      if (event.target.closest(".sq-user-menu") || event.target.closest(".user-trigger")) return;
      closeUserMenu();
    });
    return menu;
  }
  function toggleUserMenu() {
    const trigger = document.querySelector(".user-trigger");
    const menu = ensureUserMenu();
    if (!menu.hidden) {
      closeUserMenu();
      return;
    }
    if (!trigger) return;
    const box = trigger.getBoundingClientRect();
    menu.hidden = false;
    menu.style.top = Math.round(box.bottom + 8) + "px";
    menu.style.left = "auto";
    menu.style.right = Math.max(8, Math.round(window.innerWidth - box.right)) + "px";
  }
  window.SQ = {
    authed: authed,
    send: send,
    createSession: function () {
      return createSession(chatStore());
    },
    openSettings: openSettings,
    settingsUrl: settingsUrl,
    chatUrl: chatUrl,
    refreshFrames: refreshFrames,
    onSwitch: onSwitch,
    toggleUserMenu: toggleUserMenu,
  };
  if (document.readyState === "complete") boot();
  window.addEventListener("load", function () {
    boot();
    if (!booted) {
      let tries = 0;
      const timer = setInterval(function () {
        boot();
        if (booted || ++tries > 20) clearInterval(timer);
      }, 100);
    }
  });
})();
