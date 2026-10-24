# AstrBot WebUI 登录页面设计交接说明

本文面向接手登录页视觉与交互设计的设计师或前端开发者，按当前工作区代码梳理。当前登录入口是 `/#/auth/login`，它是 AstrBot Dashboard 管理账户的登录页，不是开放注册页。

## 1. 交接范围

本次登录页设计包含：

- 用户名、密码登录；
- TOTP 两步验证；
- 恢复码登录；
- 登录错误、提交中和按钮禁用状态；
- 语言切换、浅色/深色/跟随系统主题；
- WebUI 与 AstrBot 版本信息、版本不一致提示弹窗；
- 桌面端和移动端的响应式、键盘操作与可访问性表现。

本次不包含：

- `/#/auth/setup` 首次账户设置或默认密码升级页；
- 用户注册、多账户管理、忘记密码、短信/邮箱验证码、第三方登录；
- 飞书、钉钉、QQ、微信等平台接入时的“注册/授权”流程；
- 登录成功后的聊天页、Bot 配置页和 onboarding 页面重设计。

> 当前产品只有一个 Dashboard 管理账户。恢复码用于 TOTP 恢复，不等于密码找回。设计稿不要加入后端尚不支持的注册、忘记密码或社交登录入口。

## 2. 最重要的前端文件

### 2.1 页面与登录状态：设计实现的主要修改区

| 文件 | 当前职责 | 设计改动建议 |
| --- | --- | --- |
| [`src/views/authentication/auth/LoginPage.vue`](src/views/authentication/auth/LoginPage.vue) | 登录页外层、Logo、标题、语言和主题入口、版本信息及版本异常弹窗 | 页面布局、背景、卡片、顶部工具区和版本区优先在此修改 |
| [`src/views/authentication/authForms/AuthLogin.vue`](src/views/authentication/authForms/AuthLogin.vue) | 管理 `account`、`totp`、`recovery` 三个阶段，提交登录并统一展示错误 | 保留三阶段状态机和提交逻辑，可调整阶段切换动效与公共表单样式 |
| [`src/views/authentication/authForms/stages/AuthStageAccount.vue`](src/views/authentication/authForms/stages/AuthStageAccount.vue) | 用户名、密码、密码显隐、首次登录提示和登录按钮 | 普通登录表单的主要视觉实现文件 |
| [`src/views/authentication/authForms/stages/AuthStageTotp.vue`](src/views/authentication/authForms/stages/AuthStageTotp.vue) | TOTP 验证码、信任设备、返回账户阶段和进入恢复码阶段 | 两步验证状态必须单独设计，不可只交付账号密码状态 |
| [`src/views/authentication/authForms/stages/AuthStageRecovery.vue`](src/views/authentication/authForms/stages/AuthStageRecovery.vue) | 恢复码格式化、风险提示、返回和提交 | 保留 32 位 Base32 恢复码校验与分组显示 |

组件关系如下：

```text
LoginPage.vue
└── AuthLogin.vue
    ├── AuthStageAccount.vue
    ├── AuthStageTotp.vue
    └── AuthStageRecovery.vue
```

### 2.2 文案与多语言：有新文案时必须同步

登录相关文案统一位于以下四个同结构文件：

- [`src/i18n/locales/zh-CN/features/auth.json`](src/i18n/locales/zh-CN/features/auth.json)
- [`src/i18n/locales/en-US/features/auth.json`](src/i18n/locales/en-US/features/auth.json)
- [`src/i18n/locales/ja-JP/features/auth.json`](src/i18n/locales/ja-JP/features/auth.json)
- [`src/i18n/locales/ru-RU/features/auth.json`](src/i18n/locales/ru-RU/features/auth.json)

不要在 Vue 模板中新增硬编码的用户可见文案。四种语言必须保持键名一致，并检查英文、俄文等长文本不会挤压标题、按钮和弹窗。

### 2.3 共用视觉依赖：修改会影响其他页面

| 文件 | 与登录页的关系 | 注意事项 |
| --- | --- | --- |
| [`public/favicon.svg`](public/favicon.svg) | 登录卡片左上角 Logo，当前通过 `/favicon.svg` 引用 | 只替换此文件会影响站点图标等其他使用位置 |
| [`src/components/shared/LanguageSwitcher.vue`](src/components/shared/LanguageSwitcher.vue) | 登录页语言按钮 | 是全局共用组件，修改前检查 Header 和 ChatBox 变体 |
| [`src/components/shared/StyledMenu.vue`](src/components/shared/StyledMenu.vue) | 语言菜单及登录页主题菜单共用的菜单类名 | 样式未局部隔离，修改可能影响全站菜单 |
| [`src/layouts/blank/BlankLayout.vue`](src/layouts/blank/BlankLayout.vue) | 登录路由的空白布局容器 | 通常无需修改；它也承载账户设置等认证页面 |
| [`src/theme/LightTheme.ts`](src/theme/LightTheme.ts) / [`src/theme/DarkTheme.ts`](src/theme/DarkTheme.ts) | 提供 `primary`、`secondary`、`containerBg`、`surface` 等颜色令牌 | 登录页应优先使用主题令牌，避免写死仅适配单一主题的颜色 |
| [`src/plugins/vuetify.ts`](src/plugins/vuetify.ts) | Vuetify 组件和圆角等全局默认值 | 除非目标是全站调整，否则不要为登录页改全局默认值 |
| [`src/scss/style.scss`](src/scss/style.scss) | 全局样式入口 | 登录页专属样式优先留在登录组件中，避免污染其他页面 |

## 3. 行为依赖文件

这些文件决定登录行为，设计任务通常只需阅读，不应随意修改：

| 文件 | 关键职责 |
| --- | --- |
| [`src/router/AuthRoutes.ts`](src/router/AuthRoutes.ts) | 注册公开路由 `/auth/login`，并使用 `BlankLayout` |
| [`src/router/index.ts`](src/router/index.ts) | 未登录访问受保护页面时跳转登录页；已有 token 再访问登录页时跳转主入口 |
| [`src/stores/auth.ts`](src/stores/auth.ts) | 发起登录、保存 token/用户名、识别 TOTP 挑战、处理旧版本恢复并决定登录后的跳转 |
| [`src/api/v1.ts`](src/api/v1.ts) | 封装登录、setup-status、公开版本接口及旧接口回退 |
| [`src/api/http.ts`](src/api/http.ts) | 附加认证和语言请求头；处理 401、429 及返回登录页 |
| [`src/App.vue`](src/App.vue) | 挂载全局升级恢复弹窗 |
| [`src/components/shared/UpgradeRecoveryDialog.vue`](src/components/shared/UpgradeRecoveryDialog.vue) | 旧版 WebUI/API 不匹配时展示阻断式恢复弹窗 |
| [`src/main.ts`](src/main.ts) / [`src/stores/customizer.ts`](src/stores/customizer.ts) | 初始化并同步浅色、深色和系统主题 |

生成文件 [`src/api/generated/openapi-v1/sdk.gen.ts`](src/api/generated/openapi-v1/sdk.gen.ts) 和 [`src/api/generated/openapi-v1/types.gen.ts`](src/api/generated/openapi-v1/types.gen.ts) 只作为接口类型参考，不要手工编辑。只有后端路由、Schema 或 OpenAPI 定义发生变化时，才运行 `pnpm generate:api` 重新生成。

## 4. 当前页面结构和状态

### 4.1 页面外层

- 全屏容器使用主题色 `containerBg`，内容水平、垂直居中。
- 登录卡片当前固定宽度为 `400px`，内边距为 `8px`。
- 顶部左侧是 AstrBot Logo，右侧是语言和主题菜单。
- 普通登录标题是 “AstrBot WebUI/Dashboard” 和欢迎副标题；进入 TOTP 或恢复码阶段后，标题切换为两步验证并隐藏欢迎副标题。
- 卡片底部异步展示 WebUI、运行时和代码版本；版本不一致时出现帮助按钮和说明弹窗。

### 4.2 三个登录阶段

1. **账户阶段 `account`**
   - 用户名输入框使用 `autocomplete="username"`。
   - 密码输入框使用 `autocomplete="current-password"`，支持显隐切换。
   - 用户名或密码为空时提交按钮禁用。
   - 页面提示首次登录密码可从启动日志获取。

2. **TOTP 阶段 `totp`**
   - 后端返回 `401` 且 `data.totp_required=true` 后进入。
   - 展示当前用户名、验证码输入框、信任设备 30 天选项、返回按钮和恢复码入口。
   - 返回账户阶段时清空 TOTP 验证码和信任设备选项，但保留已输入的用户名和密码。

3. **恢复码阶段 `recovery`**
   - 提示使用恢复码登录会关闭双因素认证。
   - 输入自动转为大写，只保留 `A-Z` 和 `2-7`，最多 32 位，并按每 8 位加连字符显示。
   - 只有恢复码完整时提交按钮才可用。

三个阶段共用 `loading` 和 `apiError`。请求期间按钮和相关控件需要保持明确的加载/禁用反馈；错误当前通过 tonal `v-alert` 原样展示。

### 4.3 页面进入和登录后的分支

```text
打开 /#/auth/login
├── 本地已有 token → 跳转 /chat
├── setup-status 要求免旧密码初始化 → 跳转 /auth/setup
└── 显示登录页
    ├── 登录成功 → 保存 token/用户名 → 跳转 /chat
    ├── 需要修改默认/旧密码 → 跳转 /auth/setup
    ├── 需要 TOTP → 进入 totp 阶段
    └── 旧版前后端不匹配 → 打开升级恢复弹窗
```

`/chat` 当前带 onboarding 守卫；尚未完成配置的用户可能继续被引导至 Bot 配置入口。登录页设计不应绕过这条守卫。

## 5. 接口契约

登录页直接依赖以下公开接口：

| 方法与路径 | 用途 | 关键数据 |
| --- | --- | --- |
| `POST /api/v1/auth/login` | 账号密码、TOTP 或恢复码登录 | 请求：`username`、`password`、可选 `code`、`trust_device_flag` |
| `GET /api/v1/auth/setup-status` | 判断是否应进入首次账户设置 | `setup_required`、`skip_default_password_auth`、`password_upgrade_required` |
| `GET /api/v1/stats/versions` | 显示登录页底部版本并判断不一致 | `webui_version`、`astrbot_version`、`astrbot_code_version` |

接口同时保留旧路径回退。后端契约源文件是 [`../openspec/openapi-v1.yaml`](../openspec/openapi-v1.yaml)，设计改动不需要修改接口。

## 6. 设计与实现约束

- 保留账户、TOTP、恢复码、错误、加载、版本异常六类关键状态；设计稿不能只画默认账号密码表单。
- 同时交付浅色、深色和移动端状态，建议至少检查 `320px`、`375px`、`768px` 和桌面宽度。
- 当前容器使用 `100vw × 100vh` 且 `overflow: hidden`。若增加插画、页脚或较长文案，必须处理小屏和低高度窗口，避免内容无法滚动。
- 保留原生表单提交和 Enter 键操作、输入框 label、密码管理器所需的 `name`/`autocomplete` 属性、清晰的焦点态和错误反馈。
- 主题和语言按钮必须在键盘、触屏及浅/深色主题下可识别；图标不能成为唯一的状态说明。
- 弹窗标题继续使用项目规范类 `text-h3 pa-4 pb-0 pl-6`；弹窗按钮使用 `variant="text"` 或 `variant="tonal"`。
- 优先在现有五个登录组件内完成改造。不要为一次性布局拆出小组件，也不要为纯视觉改动修改认证 Store、路由或 API。
- 如果必须调整共用组件或主题文件，应在提交说明中列出全局影响，并回归 Header、ChatBox、账户设置页和其他菜单。
- 所有新增代码注释和日志使用英文。

## 7. 已知实现细节

- `LoginPage.vue` 中 `cardVisible` 会在挂载后延迟设为 `true`，但当前模板和样式没有使用它；不要把它当作已经生效的入场动画。
- 版本信息是异步加载的，接口失败时登录仍可继续；布局不能依赖版本区始终存在。
- API 错误文案目前可能来自后端，长度和语言不完全可控；错误区域应允许换行和高度增长。
- 登录页当前相关 Vue 组件没有专门的组件测试；现有 [`tests/httpAuth.test.mjs`](tests/httpAuth.test.mjs) 主要覆盖 HTTP 认证处理，因此视觉和交互需要完整手工回归。
- 当前工作区的登录成功目标是 `/chat`。如接手时主导航仍在调整，以 `src/stores/auth.ts` 和 `src/router/index.ts` 的最新代码为准。

## 8. 本地运行和验收清单

### 启动

在仓库根目录启动后端：

```bash
uv sync
uv run main.py
```

在 `dashboard` 目录启动前端：

```bash
pnpm install
pnpm dev
```

- 后端默认地址：`http://localhost:6185`
- 前端默认地址：`http://localhost:3000/#/auth/login`

### 交付前检查

- 普通登录：空值、密码显隐、Enter 提交、加载、成功和错误状态。
- TOTP：进入、返回、错误码、信任设备开关、恢复码入口。
- 恢复码：粘贴、自动格式化、长度限制、返回和成功/失败状态。
- 路由：已登录访问登录页、未登录访问受保护页、需要账户设置时的跳转。
- 版本区：无版本数据、正常版本、WebUI/运行时不一致、运行时/代码不一致。
- 主题：浅色、深色、跟随系统；检查文本、边框、焦点态和弹窗对比度。
- 多语言：中、英、日、俄四种语言，重点检查长文案换行。
- 视口：手机、小高度笔记本、普通桌面；页面不能出现不可达内容。
- 可访问性：键盘遍历顺序、可见焦点、按钮可辨识、错误提示和触控区域。

完成实现后至少运行：

```bash
cd dashboard
pnpm typecheck
pnpm i18n:check
pnpm build
```

如果改动了 Python、后端接口或 OpenAPI，再按仓库规范执行 `ruff format .`、`ruff check .`，并在接口变化后运行 `pnpm generate:api`。
