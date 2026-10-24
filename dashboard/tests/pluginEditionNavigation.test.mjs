import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const sidebarSource = fs.readFileSync(
  new URL(
    "../src/layouts/full/vertical-sidebar/sidebarItem.ts",
    import.meta.url,
  ),
  "utf8",
);
const routeSource = fs.readFileSync(
  new URL("../src/router/MainRoutes.ts", import.meta.url),
  "utf8",
);
const routerGuardSource = fs.readFileSync(
  new URL("../src/router/index.ts", import.meta.url),
  "utf8",
);
const onboardingSource = fs.readFileSync(
  new URL("../src/stores/onboarding.ts", import.meta.url),
  "utf8",
);
const profileSource = fs.readFileSync(
  new URL("../src/stores/botProfile.ts", import.meta.url),
  "utf8",
);
const configSource = fs.readFileSync(
  new URL("../src/views/ConfigPage.vue", import.meta.url),
  "utf8",
);
const workbenchSource = fs.readFileSync(
  new URL("../src/views/rfq/RfqWorkbenchPage.vue", import.meta.url),
  "utf8",
);
const headerSource = fs.readFileSync(
  new URL(
    "../src/layouts/full/vertical-header/VerticalHeader.vue",
    import.meta.url,
  ),
  "utf8",
);
const fullLayoutSource = fs.readFileSync(
  new URL("../src/layouts/full/FullLayout.vue", import.meta.url),
  "utf8",
);
const chatPageSource = fs.readFileSync(
  new URL("../src/views/ChatPage.vue", import.meta.url),
  "utf8",
);
const platformInboxSource = fs.readFileSync(
  new URL("../src/views/chat/PlatformConversationPage.vue", import.meta.url),
  "utf8",
);
const chatboxSource = fs.readFileSync(
  new URL("../src/views/ChatBoxPage.vue", import.meta.url),
  "utf8",
);
const darkThemeStyleSources = [
  "../src/layouts/full/vertical-sidebar/VerticalSidebar.vue",
  "../src/views/bot-config/BotConfigWorkspacePage.vue",
  "../src/views/bot-config/BotModelsPage.vue",
  "../src/views/bot-config/BotOverviewPage.vue",
  "../src/views/rfq/RfqWorkbenchPage.vue",
].map((path) => fs.readFileSync(new URL(path, import.meta.url), "utf8"));

test("keeps exactly three primary entries in the required order", () => {
  const paths = [...sidebarSource.matchAll(/\bto:\s*'([^']+)'/g)].map(
    (match) => match[1],
  );
  assert.deepEqual(paths, ["/chat", "/bot-config/overview", "/workbench"]);
});

test("preserves legacy entry points through plugin-edition redirects", () => {
  const expectedRedirects = [
    ["/welcome", "/bot-config/overview"],
    ["/dashboard/default", "/chat"],
    ["/platforms", "/bot-config/platforms"],
    ["/providers", "/bot-config/models"],
    ["/config", "/bot-config/runtime"],
    ["/settings", "/bot-config/system"],
  ];
  for (const [legacyPath, newPath] of expectedRedirects) {
    assert.match(
      routeSource,
      new RegExp(
        `path: '${legacyPath.replace("/", "\\/")}'.+${newPath.replaceAll(
          "/",
          "\\/",
        )}`,
      ),
    );
  }
  assert.match(
    routeSource,
    /astrbot_plugin_rfq_assistant[\s\S]+return \{ path: '\/workbench'/,
  );
});

test("gates chat and workbench until both provider and platform exist", () => {
  assert.match(routeSource, /path: '\/chat'[\s\S]+requiresOnboarding: true/);
  assert.match(
    routeSource,
    /path: '\/workbench\/:caseId\?'[\s\S]+requiresOnboarding: true/,
  );
  assert.match(routerGuardSource, /record\.meta\.requiresOnboarding/);
  assert.match(
    onboardingSource,
    /this\.completed = this\.hasPlatform && this\.hasProvider/,
  );
});

test("persists the active profile and protects unsaved profile switches", () => {
  assert.match(profileSource, /setStoredSelectedChatConfigId\(normalized\)/);
  assert.match(configSource, /async beforeProfileChange\(\)/);
  assert.match(configSource, /confirmed === 'close'[\s\S]+return false/);
  assert.match(configSource, /await this\.updateConfig\(\)/);
});

test("keeps the workbench entry with explicit plugin diagnostics and conflict reload", () => {
  assert.match(workbenchSource, /pluginState\.value = 'unavailable'/);
  assert.match(workbenchSource, /前往插件配置/);
  assert.match(workbenchSource, /apiError\?\.isConflict === true/);
  assert.match(workbenchSource, /重新加载/);
});

test("pauses Plugin Edition update discovery and hides update entry points", () => {
  assert.match(headerSource, /const PLUGIN_EDITION_UPDATES_PAUSED = true/);
  assert.match(
    headerSource,
    /if \(!PLUGIN_EDITION_UPDATES_PAUSED\) \{\s*checkUpdate\(\);/,
  );
  assert.match(
    headerSource,
    /if \(!PLUGIN_EDITION_UPDATES_PAUSED && isDesktopReleaseMode\.value\)/,
  );
  assert.match(headerSource, /v-if="!PLUGIN_EDITION_UPDATES_PAUSED"/);
});

test("shows only external-platform conversations in the primary chat entry", () => {
  assert.match(chatPageSource, /PlatformConversationPage/);
  assert.match(
    fullLayoutSource,
    /import ChatPage from "@\/views\/ChatPage\.vue"/,
  );
  assert.match(platformInboxSource, /exclude_platforms:\s*"webchat"/);
  assert.match(platformInboxSource, /message\.role !== "user"/);
  assert.match(platformInboxSource, /message\.role !== "assistant"/);
  assert.match(platformInboxSource, /conversationApi\.sendMessage\(/);
  assert.match(platformInboxSource, /async function sendDirectMessage\(\)/);
  assert.match(platformInboxSource, /@keydown="handleComposerKeydown"/);
  assert.match(platformInboxSource, /class="message-composer"/);
  assert.doesNotMatch(
    platformInboxSource,
    /ChatInput|ConfigSelector|ProjectView/,
  );
  assert.match(chatboxSource, /<Chat :chatbox-mode="true"/);
});

test("keeps dark-theme overrides scoped to plugin-edition surfaces", () => {
  for (const source of darkThemeStyleSources) {
    assert.doesNotMatch(source, /:global\(\.v-theme--PurpleThemeDark\)\s+/);
  }
});
