<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { useRoute, useRouter } from "vue-router";
import { useDisplay } from "vuetify";
import {
  AlertCircle,
  Bot,
  ChevronLeft,
  ChevronRight,
  Inbox,
  MessageCircle,
  RefreshCw,
  Search,
  Send,
  Settings2,
  UserRound,
  Users,
} from "@lucide/vue";
import DOMPurify from "dompurify";
import MarkdownIt from "markdown-it";
import { conversationApi } from "@/api/v1";
import { useI18n, useModuleI18n } from "@/i18n/composables";
import { useHeaderContextStore } from "@/stores/headerContext";
import { useMobileDrawerStore } from "@/stores/mobileDrawer";
import { getPlatformIcon } from "@/utils/platformUtils";

type UmoInfo = {
  umo?: string;
  platform?: string;
  message_type?: string;
  session_id?: string;
  auto_name?: string;
  user_alias?: string;
  display_name?: string;
};

type PlatformConversation = {
  platform_id: string;
  user_id: string;
  cid: string;
  title?: string | null;
  created_at?: number | string;
  updated_at?: number | string;
  umo_info?: UmoInfo;
};

type BotOption = {
  id: string;
  type: string;
};

type VisiblePart = {
  kind: "text" | "image" | "attachment";
  text: string;
  html?: string;
};

type VisibleMessage = {
  role: "user" | "assistant";
  parts: VisiblePart[];
};

const props = withDefaults(defineProps<{ active?: boolean }>(), {
  active: true,
});

const route = useRoute();
const router = useRouter();
const { smAndDown } = useDisplay();
const { locale } = useI18n();
const { tm } = useModuleI18n("features/conversation");
const mobileDrawer = useMobileDrawerStore();
const headerContext = useHeaderContextStore();
const markdown = new MarkdownIt({ html: false, breaks: true, linkify: true });

const conversations = ref<PlatformConversation[]>([]);
const availableBots = ref<BotOption[]>([]);
const keyword = ref("");
const platformFilter = ref("");
const messageTypeFilter = ref("");
const page = ref(1);
const pageSize = 30;
const total = ref(0);
const totalPages = ref(1);
const listLoading = ref(false);
const listError = ref("");
const activeConversation = ref<PlatformConversation | null>(null);
const rawHistory = ref<unknown[]>([]);
const detailLoading = ref(false);
const detailError = ref("");
const messageScroller = ref<HTMLElement | null>(null);
const replyDraft = ref("");
const sendingMessage = ref(false);
const sendError = ref("");
const sendWarning = ref("");
const maxMessageLength = 10000;
let keywordTimer: number | null = null;
let pollTimer: number | null = null;
let listRequestId = 0;
let detailRequestId = 0;

const externalBots = computed(() =>
  availableBots.value.filter((bot) => bot.id !== "webchat"),
);
const hasFilters = computed(
  () =>
    Boolean(keyword.value.trim()) ||
    Boolean(platformFilter.value) ||
    Boolean(messageTypeFilter.value),
);
const activeKey = computed(() =>
  activeConversation.value
    ? `${activeConversation.value.user_id}\u0000${activeConversation.value.cid}`
    : "",
);
const canSendMessage = computed(
  () =>
    Boolean(activeConversation.value) &&
    Boolean(replyDraft.value.trim()) &&
    !sendingMessage.value,
);
const visibleMessages = computed<VisibleMessage[]>(() => {
  const result: VisibleMessage[] = [];

  for (const entry of rawHistory.value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const message = entry as Record<string, unknown>;
    if (message.role !== "user" && message.role !== "assistant") continue;

    const parts: VisiblePart[] = [];
    const content = Array.isArray(message.content)
      ? message.content
      : [message.content];
    for (const item of content) {
      if (typeof item === "string") {
        const cleaned = item
          .replace(/<system_reminder>[\s\S]*?<\/system_reminder>/gi, "")
          .trim();
        if (cleaned) {
          parts.push({
            kind: "text",
            text: cleaned,
            html: DOMPurify.sanitize(markdown.render(cleaned)),
          });
        }
        continue;
      }
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;

      const record = item as Record<string, any>;
      const type = typeof record.type === "string" ? record.type : "";
      if (type === "text" && typeof record.text === "string") {
        const cleaned = record.text
          .replace(/<system_reminder>[\s\S]*?<\/system_reminder>/gi, "")
          .trim();
        if (cleaned) {
          parts.push({
            kind: "text",
            text: cleaned,
            html: DOMPurify.sanitize(markdown.render(cleaned)),
          });
        }
        continue;
      }
      if (type === "think" || type === "reasoning") continue;

      const imageUrl =
        type === "image_url" && typeof record.image_url?.url === "string"
          ? record.image_url.url
          : type === "image" && typeof record.url === "string"
          ? record.url
          : "";
      if (
        imageUrl &&
        /^(https?:\/\/|data:image\/(png|jpe?g|gif|webp);base64,|\/api\/)/i.test(
          imageUrl,
        )
      ) {
        parts.push({ kind: "image", text: imageUrl });
        continue;
      }

      if (
        ["audio", "input_audio", "video", "file", "document"].includes(type)
      ) {
        parts.push({
          kind: "attachment",
          text:
            typeof record.name === "string" && record.name
              ? record.name
              : tm("inbox.attachment"),
        });
      }
    }

    if (parts.length) {
      result.push({
        role: message.role as "user" | "assistant",
        parts,
      });
    }
  }

  return result;
});

function getUmoInfo(item: PlatformConversation | null): Required<UmoInfo> {
  const umo = item?.user_id || item?.umo_info?.umo || "";
  const pieces = umo.split(":");
  const info = item?.umo_info || {};
  return {
    umo,
    platform: info.platform || pieces[0] || item?.platform_id || "",
    message_type: info.message_type || pieces[1] || "",
    session_id: info.session_id || pieces.slice(2).join(":") || umo,
    auto_name: info.auto_name || "",
    user_alias: info.user_alias || "",
    display_name: info.display_name || umo,
  };
}

function conversationIdentity(item: PlatformConversation | null) {
  const info = getUmoInfo(item);
  return (
    info.user_alias ||
    info.auto_name ||
    item?.title ||
    info.session_id ||
    info.umo ||
    tm("inbox.unknownContact")
  );
}

function conversationTitle(item: PlatformConversation) {
  return item.title?.trim() || conversationIdentity(item);
}

function conversationKey(item: PlatformConversation) {
  return `${item.user_id}\u0000${item.cid}`;
}

function messageTypeLabel(item: PlatformConversation | null) {
  const type = getUmoInfo(item).message_type;
  if (["GroupMessage", "group"].includes(type)) {
    return tm("messageTypes.group");
  }
  if (["FriendMessage", "friend", "private"].includes(type)) {
    return tm("messageTypes.friend");
  }
  return tm("messageTypes.unknown");
}

function platformType(item: PlatformConversation | null) {
  const platformId = item?.platform_id || getUmoInfo(item).platform;
  return (
    availableBots.value.find((bot) => bot.id === platformId)?.type ||
    platformId.split("-")[0] ||
    platformId
  );
}

function platformIcon(item: PlatformConversation | null) {
  return getPlatformIcon(platformType(item));
}

function formatTimestamp(value?: number | string) {
  if (value === undefined || value === null || value === "") {
    return tm("status.unknown");
  }
  const date = new Date(
    typeof value === "number" && value < 1_000_000_000_000
      ? value * 1000
      : value,
  );
  if (Number.isNaN(date.getTime())) return tm("status.unknown");
  return new Intl.DateTimeFormat(locale.value || "zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

async function fetchFilterOptions() {
  try {
    const response = await conversationApi.filterOptions();
    if (response.data.status === "ok") {
      availableBots.value = Array.isArray(response.data.data?.bots)
        ? response.data.data.bots
        : [];
    }
  } catch (error) {
    console.error("Failed to load platform conversation filters:", error);
  }
}

async function fetchConversations(silent = false) {
  const requestId = ++listRequestId;
  if (!silent) listLoading.value = true;
  listError.value = "";
  const params: Record<string, string | number | boolean> = {
    page: page.value,
    page_size: pageSize,
    include_history: false,
    exclude_platforms: "webchat",
    sort_by: "updated_at",
    sort_order: "desc",
  };
  if (keyword.value.trim()) params.keyword = keyword.value.trim();
  if (platformFilter.value) params.platforms = platformFilter.value;
  if (messageTypeFilter.value) {
    params.message_types = messageTypeFilter.value;
  }

  try {
    const response = await conversationApi.list(params);
    if (requestId !== listRequestId) return;
    if (response.data.status !== "ok") {
      throw new Error(response.data.message || tm("inbox.listError"));
    }
    const data = response.data.data || {};
    conversations.value = Array.isArray(data.conversations)
      ? data.conversations
      : [];
    total.value = Number(data.pagination?.total || 0);
    totalPages.value = Math.max(Number(data.pagination?.total_pages || 1), 1);

    if (activeConversation.value) {
      const current = conversations.value.find(
        (item) => conversationKey(item) === activeKey.value,
      );
      if (current) {
        activeConversation.value = {
          ...activeConversation.value,
          ...current,
        };
      }
    }
  } catch (error: any) {
    if (requestId !== listRequestId) return;
    listError.value =
      error?.response?.data?.message || error?.message || tm("inbox.listError");
  } finally {
    if (requestId === listRequestId) listLoading.value = false;
  }
}

async function loadConversation(item: PlatformConversation, silent = false) {
  const selectionChanged = conversationKey(item) !== activeKey.value;
  const requestId = ++detailRequestId;
  activeConversation.value = item;
  if (selectionChanged) {
    replyDraft.value = "";
    sendError.value = "";
    sendWarning.value = "";
  }
  if (!silent) {
    rawHistory.value = [];
    detailLoading.value = true;
  }
  detailError.value = "";

  try {
    const response = await conversationApi.get(item.user_id, item.cid);
    if (requestId !== detailRequestId) return;
    if (response.data.status !== "ok") {
      throw new Error(response.data.message || tm("inbox.detailError"));
    }
    const detail = response.data.data || {};
    activeConversation.value = { ...item, ...detail };
    const history =
      typeof detail.history === "string"
        ? JSON.parse(detail.history)
        : detail.history;
    if (!Array.isArray(history)) {
      throw new Error(tm("inbox.detailError"));
    }
    rawHistory.value = history;
    await nextTick();
    if (messageScroller.value) {
      messageScroller.value.scrollTop = messageScroller.value.scrollHeight;
    }
  } catch (error: any) {
    if (requestId !== detailRequestId) return;
    detailError.value =
      error?.response?.data?.message ||
      error?.message ||
      tm("inbox.detailError");
  } finally {
    if (requestId === detailRequestId) detailLoading.value = false;
  }
}

async function sendDirectMessage() {
  const target = activeConversation.value;
  const message = replyDraft.value.trim();
  if (!target || !message || sendingMessage.value) return;

  const targetKey = conversationKey(target);
  sendingMessage.value = true;
  sendError.value = "";
  sendWarning.value = "";

  try {
    const response = await conversationApi.sendMessage(
      target.user_id,
      target.cid,
      { message },
    );
    if (response.data.status !== "ok") {
      throw new Error(response.data.message || tm("inbox.sendFailed"));
    }

    if (activeKey.value === targetKey) {
      const entry = response.data.data?.entry || {
        role: "assistant",
        content: message,
      };
      rawHistory.value = [...rawHistory.value, entry];
      if (replyDraft.value.trim() === message) replyDraft.value = "";
      if (response.data.data?.history_saved === false) {
        sendWarning.value = tm("inbox.historySaveWarning");
      }
      activeConversation.value = {
        ...activeConversation.value!,
        updated_at: new Date().toISOString(),
      };
      await nextTick();
      if (messageScroller.value) {
        messageScroller.value.scrollTop = messageScroller.value.scrollHeight;
      }
    }
    void fetchConversations(true);
  } catch (error: any) {
    if (activeKey.value === targetKey) {
      sendError.value =
        error?.response?.data?.message ||
        error?.message ||
        tm("inbox.sendFailed");
    }
  } finally {
    sendingMessage.value = false;
  }
}

function handleComposerKeydown(event: KeyboardEvent) {
  if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  void sendDirectMessage();
}

function selectConversation(item: PlatformConversation) {
  mobileDrawer.SET(false);
  void loadConversation(item);
  void router.push({
    name: "ChatDetail",
    params: { conversationId: item.cid },
    query: { umo: item.user_id },
  });
}

function clearFilters() {
  keyword.value = "";
  platformFilter.value = "";
  messageTypeFilter.value = "";
  if (page.value !== 1) page.value = 1;
  else void fetchConversations();
}

function closeMobileConversation() {
  detailRequestId += 1;
  activeConversation.value = null;
  rawHistory.value = [];
  detailError.value = "";
  replyDraft.value = "";
  sendError.value = "";
  sendWarning.value = "";
  mobileDrawer.SET(false);
  void router.push("/chat");
}

function queryValue(value: unknown) {
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : "";
  return typeof value === "string" ? value : "";
}

async function syncSelectionFromRoute() {
  if (!props.active || !route.path.startsWith("/chat")) return;
  const cid = queryValue(route.params.conversationId);
  const umo = queryValue(route.query.umo);
  if (cid && umo) {
    const existing = conversations.value.find(
      (item) => item.cid === cid && item.user_id === umo,
    );
    const item: PlatformConversation = existing || {
      cid,
      user_id: umo,
      platform_id: umo.split(":")[0] || "",
    };
    if (
      conversationKey(item) !== activeKey.value ||
      (!detailLoading.value && !rawHistory.value.length)
    ) {
      await loadConversation(item);
    }
    return;
  }

  if (smAndDown.value) {
    activeConversation.value = null;
    rawHistory.value = [];
  } else if (!activeConversation.value && conversations.value.length) {
    selectConversation(conversations.value[0]);
  }
}

async function refreshAll(silent = false) {
  await Promise.all([fetchFilterOptions(), fetchConversations(silent)]);
  if (activeConversation.value) {
    await loadConversation(activeConversation.value, silent);
  } else {
    await syncSelectionFromRoute();
  }
}

function startPolling() {
  if (pollTimer !== null || !props.active) return;
  pollTimer = window.setInterval(() => {
    if (!document.hidden && props.active) void refreshAll(true);
  }, 2_000);
}

function stopPolling() {
  if (pollTimer !== null) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
}

function handleVisibilityChange() {
  if (!document.hidden && props.active) void refreshAll(true);
}

watch(keyword, () => {
  if (keywordTimer !== null) window.clearTimeout(keywordTimer);
  keywordTimer = window.setTimeout(() => {
    keywordTimer = null;
    if (page.value !== 1) page.value = 1;
    else void fetchConversations();
  }, 320);
});

watch([platformFilter, messageTypeFilter], () => {
  if (page.value !== 1) page.value = 1;
  else void fetchConversations();
});

watch(page, () => void fetchConversations());

watch(
  () => [route.fullPath, props.active],
  () => void syncSelectionFromRoute(),
);

watch(
  () => props.active,
  (active) => {
    if (active) {
      headerContext.SET_COMPONENT(null);
      startPolling();
      void refreshAll(true);
    } else {
      stopPolling();
      mobileDrawer.SET(false);
    }
  },
);

watch(smAndDown, (mobile) => {
  if (!mobile && !activeConversation.value && conversations.value.length) {
    selectConversation(conversations.value[0]);
  }
});

onMounted(async () => {
  headerContext.SET_COMPONENT(null);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  await Promise.all([fetchFilterOptions(), fetchConversations()]);
  await syncSelectionFromRoute();
  startPolling();
});

onBeforeUnmount(() => {
  if (keywordTimer !== null) window.clearTimeout(keywordTimer);
  stopPolling();
  detailRequestId += 1;
  listRequestId += 1;
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  mobileDrawer.SET(false);
});
</script>

<template>
  <div
    class="platform-inbox"
    :class="{
      'platform-inbox--detail': Boolean(activeConversation),
      'platform-inbox--drawer-open': mobileDrawer.open,
    }"
  >
    <button
      v-if="smAndDown && activeConversation && mobileDrawer.open"
      type="button"
      class="mobile-backdrop"
      :aria-label="tm('inbox.closeList')"
      @click="mobileDrawer.SET(false)"
    />

    <aside class="conversation-rail" :aria-label="tm('inbox.listTitle')">
      <header class="rail-header">
        <div>
          <p class="eyebrow">{{ tm("inbox.eyebrow") }}</p>
          <h1>{{ tm("inbox.title") }}</h1>
        </div>
        <button
          type="button"
          class="icon-button"
          :class="{ 'icon-button--spinning': listLoading }"
          :aria-label="tm('inbox.refresh')"
          :title="tm('inbox.refresh')"
          @click="refreshAll()"
        >
          <RefreshCw :size="17" />
        </button>
      </header>

      <div class="rail-filters">
        <label class="search-field">
          <Search :size="16" aria-hidden="true" />
          <input
            v-model="keyword"
            type="search"
            :placeholder="tm('inbox.searchPlaceholder')"
          />
        </label>
        <div class="select-row">
          <label>
            <span class="sr-only">{{ tm("inbox.platformFilter") }}</span>
            <select v-model="platformFilter">
              <option value="">{{ tm("inbox.allPlatforms") }}</option>
              <option v-for="bot in externalBots" :key="bot.id" :value="bot.id">
                {{ bot.id }}
              </option>
            </select>
          </label>
          <label>
            <span class="sr-only">{{ tm("inbox.typeFilter") }}</span>
            <select v-model="messageTypeFilter">
              <option value="">{{ tm("inbox.allTypes") }}</option>
              <option value="FriendMessage">
                {{ tm("messageTypes.friend") }}
              </option>
              <option value="GroupMessage">
                {{ tm("messageTypes.group") }}
              </option>
            </select>
          </label>
        </div>
      </div>

      <div class="list-summary">
        <span>{{ tm("inbox.conversationCount", { count: total }) }}</span>
        <span>{{ tm("inbox.externalOnly") }}</span>
      </div>

      <div class="conversation-list">
        <div v-if="listLoading && !conversations.length" class="list-state">
          <span class="loading-dot" />
          {{ tm("inbox.loading") }}
        </div>
        <div v-else-if="listError && !conversations.length" class="list-state">
          <AlertCircle :size="25" />
          <strong>{{ tm("inbox.loadFailed") }}</strong>
          <span>{{ listError }}</span>
          <button
            type="button"
            class="text-button"
            @click="fetchConversations()"
          >
            {{ tm("inbox.retry") }}
          </button>
        </div>
        <div
          v-else-if="!conversations.length"
          class="list-state list-state--empty"
        >
          <Inbox :size="30" />
          <strong>{{
            hasFilters ? tm("inbox.filteredEmpty") : tm("inbox.emptyTitle")
          }}</strong>
          <span>{{
            hasFilters
              ? tm("inbox.filteredEmptyHint")
              : tm("inbox.emptyDescription")
          }}</span>
          <button
            v-if="hasFilters"
            type="button"
            class="text-button"
            @click="clearFilters"
          >
            {{ tm("inbox.clearFilters") }}
          </button>
          <RouterLink v-else class="text-button" to="/bot-config/platforms">
            <Settings2 :size="14" />
            {{ tm("inbox.configurePlatforms") }}
          </RouterLink>
        </div>

        <button
          v-for="item in conversations"
          v-else
          :key="conversationKey(item)"
          type="button"
          class="conversation-item"
          :class="{
            'conversation-item--active': conversationKey(item) === activeKey,
          }"
          @click="selectConversation(item)"
        >
          <span class="platform-avatar">
            <img v-if="platformIcon(item)" :src="platformIcon(item)" alt="" />
            <Bot v-else :size="18" aria-hidden="true" />
          </span>
          <span class="conversation-item__body">
            <span class="conversation-item__heading">
              <strong>{{ conversationTitle(item) }}</strong>
              <time>{{ formatTimestamp(item.updated_at) }}</time>
            </span>
            <span class="conversation-item__meta">
              <span>{{ item.platform_id }}</span>
              <span class="dot" aria-hidden="true" />
              <span>{{ messageTypeLabel(item) }}</span>
            </span>
            <span class="session-id">{{ getUmoInfo(item).session_id }}</span>
          </span>
          <ChevronRight class="item-chevron" :size="16" aria-hidden="true" />
        </button>
      </div>

      <footer v-if="totalPages > 1" class="rail-pagination">
        <button
          type="button"
          class="icon-button"
          :disabled="page <= 1"
          :aria-label="tm('workspace.list.previous')"
          @click="page--"
        >
          <ChevronLeft :size="16" />
        </button>
        <span>{{
          tm("workspace.list.page", { page, total: totalPages })
        }}</span>
        <button
          type="button"
          class="icon-button"
          :disabled="page >= totalPages"
          :aria-label="tm('workspace.list.next')"
          @click="page++"
        >
          <ChevronRight :size="16" />
        </button>
      </footer>
    </aside>

    <main class="conversation-detail">
      <div v-if="!activeConversation" class="detail-empty">
        <span class="detail-empty__icon"><MessageCircle :size="34" /></span>
        <h2>{{ tm("inbox.selectTitle") }}</h2>
        <p>{{ tm("inbox.selectDescription") }}</p>
      </div>

      <template v-else>
        <header class="detail-header">
          <button
            v-if="smAndDown"
            type="button"
            class="icon-button detail-back"
            :aria-label="tm('inbox.backToList')"
            @click="closeMobileConversation"
          >
            <ChevronLeft :size="19" />
          </button>
          <span class="platform-avatar platform-avatar--large">
            <img
              v-if="platformIcon(activeConversation)"
              :src="platformIcon(activeConversation)"
              alt=""
            />
            <Bot v-else :size="21" aria-hidden="true" />
          </span>
          <div class="detail-title">
            <h2>{{ conversationIdentity(activeConversation) }}</h2>
            <p>
              <span>{{ activeConversation.platform_id }}</span>
              <span class="dot" aria-hidden="true" />
              <span>{{ messageTypeLabel(activeConversation) }}</span>
              <span class="dot" aria-hidden="true" />
              <span>{{
                tm("inbox.updatedAt", {
                  time: formatTimestamp(activeConversation.updated_at),
                })
              }}</span>
            </p>
          </div>
          <span class="sync-badge">
            <span />
            {{ tm("inbox.autoSync") }}
          </span>
        </header>

        <div class="visibility-note">
          <MessageCircle :size="14" aria-hidden="true" />
          {{ tm("inbox.visibleMessagesOnly") }}
        </div>

        <div ref="messageScroller" class="message-scroller">
          <div v-if="detailLoading" class="detail-state">
            <span class="loading-dot" />
            {{ tm("inbox.loadingMessages") }}
          </div>
          <div v-else-if="detailError" class="detail-state detail-state--error">
            <AlertCircle :size="28" />
            <strong>{{ tm("inbox.messageLoadFailed") }}</strong>
            <span>{{ detailError }}</span>
            <button
              type="button"
              class="text-button"
              @click="loadConversation(activeConversation!)"
            >
              {{ tm("inbox.retry") }}
            </button>
          </div>
          <div v-else-if="!visibleMessages.length" class="detail-state">
            <Inbox :size="28" />
            <strong>{{ tm("inbox.noVisibleMessages") }}</strong>
            <span>{{ tm("inbox.noVisibleMessagesHint") }}</span>
          </div>

          <div v-else class="message-stream">
            <article
              v-for="(message, index) in visibleMessages"
              :key="index"
              class="message-row"
              :class="`message-row--${message.role}`"
            >
              <span class="message-avatar">
                <UserRound
                  v-if="message.role === 'user'"
                  :size="17"
                  aria-hidden="true"
                />
                <Bot v-else :size="17" aria-hidden="true" />
              </span>
              <div class="message-column">
                <span class="message-author">{{
                  message.role === "user"
                    ? conversationIdentity(activeConversation)
                    : tm("inbox.bot")
                }}</span>
                <div class="message-bubble">
                  <template
                    v-for="(part, partIndex) in message.parts"
                    :key="partIndex"
                  >
                    <div
                      v-if="part.kind === 'text'"
                      class="message-markdown"
                      v-html="part.html"
                    />
                    <img
                      v-else-if="part.kind === 'image'"
                      class="message-image"
                      :src="part.text"
                      :alt="tm('inbox.image')"
                      loading="lazy"
                      referrerpolicy="no-referrer"
                    />
                    <span v-else class="message-attachment">
                      <MessageCircle :size="14" />
                      {{ part.text }}
                    </span>
                  </template>
                </div>
              </div>
            </article>
          </div>
        </div>

        <section class="message-composer" :aria-label="tm('inbox.replyLabel')">
          <p
            v-if="sendError"
            class="composer-feedback composer-feedback--error"
            role="alert"
          >
            <AlertCircle :size="14" aria-hidden="true" />
            {{ sendError }}
          </p>
          <p
            v-else-if="sendWarning"
            class="composer-feedback composer-feedback--warning"
            role="status"
          >
            <AlertCircle :size="14" aria-hidden="true" />
            {{ sendWarning }}
          </p>
          <div class="composer-row">
            <textarea
              v-model="replyDraft"
              rows="2"
              :maxlength="maxMessageLength"
              :disabled="sendingMessage"
              :placeholder="
                tm('inbox.replyPlaceholder', {
                  name: conversationIdentity(activeConversation),
                })
              "
              @keydown="handleComposerKeydown"
            />
            <button
              type="button"
              class="send-button"
              :disabled="!canSendMessage"
              :aria-label="tm('inbox.send')"
              :title="tm('inbox.send')"
              @click="sendDirectMessage"
            >
              <span
                v-if="sendingMessage"
                class="loading-dot loading-dot--small"
                aria-hidden="true"
              />
              <Send v-else :size="16" aria-hidden="true" />
              <span>{{
                sendingMessage ? tm("inbox.sending") : tm("inbox.send")
              }}</span>
            </button>
          </div>
          <div class="composer-meta">
            <span>{{ tm("inbox.sendHint") }}</span>
            <span>{{ replyDraft.length }} / {{ maxMessageLength }}</span>
          </div>
        </section>

        <footer class="detail-footer">
          <span>
            <Users
              v-if="
                getUmoInfo(activeConversation).message_type === 'GroupMessage'
              "
              :size="14"
            />
            <UserRound v-else :size="14" />
            {{ getUmoInfo(activeConversation).session_id }}
          </span>
          <span>{{ tm("inbox.syncEvery") }}</span>
        </footer>
      </template>
    </main>
  </div>
</template>

<style scoped>
.platform-inbox {
  position: relative;
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: rgb(var(--v-theme-background));
  color: rgb(var(--v-theme-on-surface));
}

.conversation-rail {
  position: relative;
  z-index: 2;
  display: flex;
  width: 350px;
  min-width: 300px;
  max-width: 38%;
  min-height: 0;
  flex-direction: column;
  border-right: 1px solid rgba(var(--v-theme-on-surface), 0.09);
  background: rgb(var(--v-theme-surface));
}

.rail-header,
.detail-header,
.conversation-item__heading,
.conversation-item__meta,
.select-row,
.list-summary,
.rail-pagination,
.visibility-note,
.detail-footer,
.detail-footer span,
.sync-badge,
.search-field,
.message-attachment {
  display: flex;
  align-items: center;
}

.message-composer {
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  background: rgba(var(--v-theme-surface), 0.94);
  padding: 12px clamp(16px, 4vw, 46px) 9px;
}

.composer-row {
  display: flex;
  width: min(860px, 100%);
  align-items: flex-end;
  gap: 10px;
  margin: 0 auto;
}

.composer-row textarea {
  min-width: 0;
  min-height: 54px;
  max-height: 132px;
  flex: 1;
  resize: vertical;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.13);
  border-radius: 12px;
  outline: none;
  background: rgb(var(--v-theme-background));
  padding: 10px 12px;
  color: rgb(var(--v-theme-on-surface));
  font: inherit;
  font-size: 13px;
  line-height: 1.55;
  transition: 140ms ease;
}

.composer-row textarea:focus {
  border-color: rgba(var(--v-theme-primary), 0.55);
  box-shadow: 0 0 0 3px rgba(var(--v-theme-primary), 0.09);
}

.composer-row textarea:disabled {
  cursor: wait;
  opacity: 0.65;
}

.composer-row textarea::placeholder {
  color: rgba(var(--v-theme-on-surface), 0.4);
}

.send-button {
  display: inline-flex;
  min-width: 88px;
  min-height: 42px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border-radius: 11px;
  background: rgb(var(--v-theme-primary));
  padding: 0 15px;
  color: rgb(var(--v-theme-on-primary));
  font-size: 12px;
  font-weight: 680;
  transition: 140ms ease;
}

.send-button:hover:not(:disabled) {
  filter: brightness(1.06);
  transform: translateY(-1px);
}

.send-button:disabled {
  cursor: default;
  opacity: 0.48;
}

.composer-meta,
.composer-feedback {
  display: flex;
  width: min(860px, 100%);
  align-items: center;
  margin: 6px auto 0;
  font-size: 9px;
}

.composer-meta {
  justify-content: space-between;
  color: rgba(var(--v-theme-on-surface), 0.4);
}

.composer-feedback {
  gap: 6px;
  margin-top: 0;
  margin-bottom: 7px;
}

.composer-feedback--error {
  color: rgb(var(--v-theme-error));
}

.composer-feedback--warning {
  color: rgb(184, 109, 18);
}

.loading-dot--small {
  width: 14px;
  height: 14px;
  border-color: rgba(var(--v-theme-on-primary), 0.35);
  border-top-color: rgb(var(--v-theme-on-primary));
}

.rail-header {
  min-height: 76px;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 18px 12px;
}

.eyebrow {
  margin: 0 0 3px;
  color: rgb(var(--v-theme-primary));
  font-size: 10px;
  font-weight: 750;
  letter-spacing: 0.13em;
  text-transform: uppercase;
}

.rail-header h1,
.detail-header h2,
.detail-empty h2 {
  margin: 0;
  letter-spacing: -0.02em;
}

.rail-header h1 {
  font-size: 21px;
  line-height: 1.2;
}

.icon-button {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  border-radius: 9px;
  color: rgba(var(--v-theme-on-surface), 0.68);
  transition: 140ms ease;
}

.icon-button:hover:not(:disabled) {
  border-color: rgba(var(--v-theme-primary), 0.3);
  background: rgba(var(--v-theme-primary), 0.07);
  color: rgb(var(--v-theme-primary));
}

.icon-button:disabled {
  cursor: default;
  opacity: 0.35;
}

.icon-button--spinning svg {
  animation: spin 0.85s linear infinite;
}

.rail-filters {
  display: grid;
  gap: 8px;
  padding: 0 14px 12px;
}

.search-field {
  height: 38px;
  gap: 8px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  border-radius: 9px;
  background: rgba(var(--v-theme-on-surface), 0.035);
  padding: 0 11px;
  color: rgba(var(--v-theme-on-surface), 0.46);
}

.search-field:focus-within {
  border-color: rgba(var(--v-theme-primary), 0.5);
  box-shadow: 0 0 0 3px rgba(var(--v-theme-primary), 0.08);
}

.search-field input {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: rgb(var(--v-theme-on-surface));
  font-size: 13px;
}

.search-field input::placeholder {
  color: rgba(var(--v-theme-on-surface), 0.42);
}

.select-row {
  gap: 8px;
}

.select-row label {
  min-width: 0;
  flex: 1;
}

.select-row select {
  width: 100%;
  height: 34px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  border-radius: 8px;
  outline: 0;
  background: rgb(var(--v-theme-surface));
  padding: 0 8px;
  color: rgba(var(--v-theme-on-surface), 0.72);
  font-size: 11px;
}

.list-summary {
  justify-content: space-between;
  border-block: 1px solid rgba(var(--v-theme-on-surface), 0.07);
  padding: 8px 16px;
  color: rgba(var(--v-theme-on-surface), 0.46);
  font-size: 10px;
}

.conversation-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
}

.conversation-item {
  position: relative;
  display: flex;
  width: 100%;
  min-height: 86px;
  align-items: flex-start;
  gap: 11px;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.065);
  padding: 14px 12px 13px 14px;
  color: inherit;
  text-align: left;
  transition: background-color 130ms ease;
}

.conversation-item:hover {
  background: rgba(var(--v-theme-on-surface), 0.035);
}

.conversation-item--active {
  background: rgba(var(--v-theme-primary), 0.085);
}

.conversation-item--active::before {
  position: absolute;
  inset-block: 12px;
  left: 0;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: rgb(var(--v-theme-primary));
  content: "";
}

.platform-avatar,
.message-avatar,
.detail-empty__icon {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
}

.platform-avatar {
  width: 38px;
  height: 38px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  border-radius: 11px;
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-primary));
  box-shadow: 0 3px 10px rgba(19, 31, 64, 0.06);
}

.platform-avatar img {
  width: 23px;
  height: 23px;
  object-fit: contain;
}

.conversation-item__body {
  min-width: 0;
  flex: 1;
}

.conversation-item__heading {
  min-width: 0;
  justify-content: space-between;
  gap: 8px;
}

.conversation-item__heading strong {
  overflow: hidden;
  min-width: 0;
  font-size: 13px;
  font-weight: 680;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conversation-item__heading time {
  flex: 0 0 auto;
  color: rgba(var(--v-theme-on-surface), 0.42);
  font-size: 9px;
}

.conversation-item__meta {
  min-width: 0;
  gap: 5px;
  margin-top: 6px;
  color: rgba(var(--v-theme-on-surface), 0.58);
  font-size: 10px;
}

.conversation-item__meta span:first-child {
  overflow: hidden;
  min-width: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dot {
  width: 3px;
  height: 3px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.55;
}

.session-id {
  display: block;
  overflow: hidden;
  margin-top: 5px;
  color: rgba(var(--v-theme-on-surface), 0.38);
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-chevron {
  align-self: center;
  flex: 0 0 auto;
  color: rgba(var(--v-theme-on-surface), 0.25);
}

.list-state,
.detail-state,
.detail-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  color: rgba(var(--v-theme-on-surface), 0.5);
  text-align: center;
}

.list-state {
  min-height: 240px;
  gap: 8px;
  padding: 28px 22px;
  font-size: 12px;
}

.list-state strong,
.detail-state strong {
  color: rgba(var(--v-theme-on-surface), 0.78);
  font-size: 13px;
}

.text-button {
  display: inline-flex;
  min-height: 32px;
  align-items: center;
  gap: 6px;
  border-radius: 8px;
  background: rgba(var(--v-theme-primary), 0.1);
  padding: 0 11px;
  color: rgb(var(--v-theme-primary));
  font-size: 11px;
  font-weight: 650;
  text-decoration: none;
}

.loading-dot {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(var(--v-theme-primary), 0.2);
  border-top-color: rgb(var(--v-theme-primary));
  border-radius: 50%;
  animation: spin 0.85s linear infinite;
}

.rail-pagination {
  min-height: 48px;
  justify-content: center;
  gap: 12px;
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.07);
  color: rgba(var(--v-theme-on-surface), 0.52);
  font-size: 10px;
}

.rail-pagination .icon-button {
  width: 28px;
  height: 28px;
  border-radius: 7px;
}

.conversation-detail {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  background: radial-gradient(
      circle at 80% 0%,
      rgba(var(--v-theme-primary), 0.055),
      transparent 32%
    ),
    rgb(var(--v-theme-background));
}

.detail-empty {
  flex: 1;
  gap: 9px;
  padding: 32px;
}

.detail-empty__icon {
  width: 72px;
  height: 72px;
  margin-bottom: 5px;
  border-radius: 22px;
  background: rgba(var(--v-theme-primary), 0.09);
  color: rgb(var(--v-theme-primary));
}

.detail-empty h2 {
  color: rgba(var(--v-theme-on-surface), 0.84);
  font-size: 20px;
}

.detail-empty p {
  max-width: 380px;
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
}

.detail-header {
  min-height: 76px;
  gap: 12px;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  background: rgba(var(--v-theme-surface), 0.86);
  padding: 12px 20px;
  backdrop-filter: blur(14px);
}

.platform-avatar--large {
  width: 42px;
  height: 42px;
}

.detail-title {
  min-width: 0;
  flex: 1;
}

.detail-title h2 {
  overflow: hidden;
  font-size: 15px;
  font-weight: 720;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-title p {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
  overflow: hidden;
  margin: 5px 0 0;
  color: rgba(var(--v-theme-on-surface), 0.48);
  font-size: 10px;
  white-space: nowrap;
}

.detail-title p span {
  overflow: hidden;
  text-overflow: ellipsis;
}

.sync-badge {
  flex: 0 0 auto;
  gap: 6px;
  border-radius: 999px;
  background: rgba(34, 176, 108, 0.1);
  padding: 6px 9px;
  color: rgb(24, 142, 84);
  font-size: 10px;
  font-weight: 650;
}

.sync-badge span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.visibility-note {
  min-height: 34px;
  justify-content: center;
  gap: 6px;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.06);
  background: rgba(var(--v-theme-on-surface), 0.025);
  color: rgba(var(--v-theme-on-surface), 0.45);
  font-size: 10px;
}

.message-scroller {
  flex: 1;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

.message-stream {
  display: flex;
  width: min(860px, 100%);
  min-height: 100%;
  margin: 0 auto;
  flex-direction: column;
  justify-content: flex-end;
  gap: 18px;
  padding: 28px clamp(18px, 4vw, 52px) 34px;
}

.message-row {
  display: flex;
  max-width: 82%;
  align-items: flex-start;
  gap: 9px;
}

.message-row--user {
  align-self: flex-start;
}

.message-row--assistant {
  align-self: flex-end;
  flex-direction: row-reverse;
}

.message-avatar {
  width: 30px;
  height: 30px;
  border-radius: 9px;
  background: rgba(var(--v-theme-on-surface), 0.075);
  color: rgba(var(--v-theme-on-surface), 0.62);
}

.message-row--assistant .message-avatar {
  background: rgba(var(--v-theme-primary), 0.13);
  color: rgb(var(--v-theme-primary));
}

.message-column {
  min-width: 0;
}

.message-author {
  display: block;
  margin: 0 4px 5px;
  color: rgba(var(--v-theme-on-surface), 0.48);
  font-size: 10px;
}

.message-row--assistant .message-author {
  text-align: right;
}

.message-bubble {
  overflow: hidden;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.075);
  border-radius: 4px 15px 15px;
  background: rgb(var(--v-theme-surface));
  padding: 11px 14px;
  box-shadow: 0 5px 18px rgba(20, 31, 65, 0.055);
  font-size: 13px;
  line-height: 1.65;
  overflow-wrap: anywhere;
}

.message-row--assistant .message-bubble {
  border-color: rgba(var(--v-theme-primary), 0.12);
  border-radius: 15px 4px 15px 15px;
  background: rgba(var(--v-theme-primary), 0.09);
}

.message-bubble > * + * {
  margin-top: 9px;
}

.message-markdown :deep(p) {
  margin: 0 0 0.65em;
}

.message-markdown :deep(> :last-child) {
  margin-bottom: 0;
}

.message-markdown :deep(pre) {
  overflow: auto;
  border-radius: 7px;
  background: rgba(var(--v-theme-on-surface), 0.06);
  padding: 9px;
}

.message-markdown :deep(code) {
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 0.92em;
}

.message-image {
  display: block;
  max-width: min(100%, 360px);
  max-height: 360px;
  border-radius: 9px;
  object-fit: contain;
}

.message-attachment {
  gap: 6px;
  color: rgba(var(--v-theme-on-surface), 0.65);
  font-size: 11px;
}

.detail-state {
  min-height: 100%;
  gap: 8px;
  padding: 30px;
  font-size: 12px;
}

.detail-state--error svg {
  color: rgb(var(--v-theme-error));
}

.detail-footer {
  min-height: 40px;
  justify-content: space-between;
  gap: 16px;
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.07);
  background: rgba(var(--v-theme-surface), 0.82);
  padding: 0 20px;
  color: rgba(var(--v-theme-on-surface), 0.4);
  font-size: 9px;
}

.detail-footer span {
  min-width: 0;
  gap: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-backdrop {
  display: none;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 959.98px) {
  .conversation-rail {
    position: absolute;
    inset: 0;
    width: 100%;
    max-width: none;
    border-right: 0;
    transform: translateX(0);
    transition:
      transform 180ms ease,
      width 180ms ease;
  }

  .platform-inbox--detail .conversation-rail {
    width: min(88%, 380px);
    border-right: 1px solid rgba(var(--v-theme-on-surface), 0.1);
    box-shadow: 12px 0 30px rgba(13, 23, 50, 0.14);
    transform: translateX(-105%);
  }

  .platform-inbox--detail.platform-inbox--drawer-open .conversation-rail {
    transform: translateX(0);
  }

  .mobile-backdrop {
    position: absolute;
    inset: 0;
    z-index: 1;
    display: block;
    background: rgba(8, 15, 35, 0.38);
  }

  .detail-header {
    min-height: 68px;
    gap: 8px;
    padding: 9px 12px;
  }

  .detail-back {
    width: 32px;
    height: 32px;
  }

  .platform-avatar--large {
    width: 36px;
    height: 36px;
  }

  .sync-badge {
    display: none;
  }

  .visibility-note {
    padding: 0 12px;
    text-align: center;
  }

  .message-stream {
    gap: 14px;
    padding: 18px 12px 24px;
  }

  .message-row {
    max-width: 94%;
  }

  .message-bubble {
    padding: 10px 12px;
  }

  .message-composer {
    padding: 10px 10px 7px;
  }

  .composer-row {
    gap: 8px;
  }

  .composer-row textarea {
    min-height: 46px;
    padding: 8px 10px;
  }

  .send-button {
    min-width: 72px;
    min-height: 40px;
    padding: 0 11px;
  }

  .detail-footer {
    padding: 0 12px;
  }

  .detail-footer > span:last-child {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .conversation-rail,
  .conversation-item,
  .icon-button {
    transition: none;
  }

  .icon-button--spinning svg,
  .loading-dot {
    animation: none;
  }
}
</style>
