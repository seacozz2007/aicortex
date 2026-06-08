# Design Studio 集成方案（导航 + Open Design 能力）

> Status: **Phase A/B 已实现**（`develop-od-dev` 分支开发中）
> Owner: TBD
> Last updated: 2026-06-07
> 分支参考: `develop-od-dev`（基于 `develop-od`；Chat 工具侧栏 + Design Studio MVP）

## TL;DR

- **目标**：在 aicortex 上实现 Open Design（OD）的设计工作流，且不改变现有 Issue / 工程 Chat / Agent 任务的默认行为。
- **导航**：Web 的 TopNav 与 Desktop 的 AppSidebar 共用一份 `workspace-nav` 配置；Web 用一级 + 二级下拉，Desktop 用侧栏分组；Chat 进 **Create ▾**（Home / + 菜单 / ChatFab 补偿）。
- **产品边界**：OD 能力挂在可选的 **Design Studio** 产品域（Feature Flag），不是重写 Chat。
- **Project 必选**：进入 Design Studio **必须先选 aicortex Project**；**DESIGN.md 存 Project Resource**（`resource_type: design_system`），不建 workspace 级设计系统库。
- **数据模型**：**复用现有 `project` 表**；设计会话 = `chat_session`（`session_kind=design`，`project_id` 必填）+ 扩展 design 字段；**不**新建 `design_project` 表。
- **Agent**：Workspace 配置 **专用 Design Agent**（如 `frontend-builder` 模板）；Design Studio 内不可换成工程 Agent。
- **Skills**：方案 D（curated 内置 + `skill import` 扩展），**排除图片 / 视频 / HyperFrames / 音频类** OD skills。
- **Jury**：**Phase D** 再上 daemon orchestrator + Theater UI；之前不做。
- **执行链**：复用 task / daemon / work_dir / artifact API；仅 `design_mode` task 走 OD Prompt 栈。
- **已完成基础**（`develop-od`）：Chat 工具侧栏；`ChatSession` 含 `work_dir` / `runtime_id` / `last_task_id`。
- **已实现 MVP**（`develop-od-dev`）：migration 100、Design API/UI、导航 Create ▾、Project 选择器、Composer、Studio 三栏、craft/discovery prompt、Comment/Viewport、design_system 资源 UI、Settings 默认 Design Agent；Feature Flag **默认开启**（本地 dev）。

---

## 1. 背景

### 1.1 Open Design 是什么

OD 是本地优先的「Agent 原生设计」产品：通过 **Skill + DESIGN.md + craft + discovery** 驱动编码 Agent 在 work_dir 写真实 HTML/CSS 文件，在 iframe 预览，支持 comment 改稿、导出 PDF/PPTX、Design Jury 多轮评审等。

### 1.2 aicortex 现状

| 能力 | 状态 |
|------|------|
| Agent + Skill（agentskills.io 兼容） | ✅ 已有 |
| Chat → task → daemon → work_dir | ✅ 已有 |
| `buildChatPrompt` | 仅转发用户消息，**无** design 栈 |
| Agent Instructions + Skill | **≠** skill + DESIGN.md + craft + discovery（见 §4.2） |
| Chat 工具侧栏（develop-od） | ✅ 文件 / 终端 / 网页 |
| Issue HTML 预览 | ✅ `issue-preview-section` |
| TopNav / AppSidebar | **两套独立导航配置**，Web 只用 TopNav |

### 1.3 TopNav 与 AppSidebar 的关系（现状）

**不是一级 + 二级关系，是两套壳、两套清单：**

| 壳 | 布局 | 主导航 |
|----|------|--------|
| **Web**（`apps/web`） | `DashboardLayout` | 仅 **TopNav**（13 项平铺 + Chat） |
| **Desktop**（`apps/desktop`） | `DesktopShell` | **AppSidebar**（分组）+ TabBar，**不用 TopNav** |

- 配置分散在 `packages/views/layout/top-nav.tsx` 与 `app-sidebar.tsx`，**无共享数据源**。
- Sidebar 有 Personal / Workspace / Configure 分组、Pinned、Recent；TopNav 几乎全平铺。
- Chat：Web 顶栏有入口；Desktop Sidebar **无** Chat 链接（靠 ChatFab / ChatWindow）。

**改导航时必须两边一起改，或先抽 shared config。**

---

## 2. 导航栏修改方案

### 2.1 设计目标

| 目标 | 做法 |
|------|------|
| 一级项 ≤ 6 | 高频直出，低频进下拉 |
| 与 OD 心智对齐 | Work / Agents / **Create** / More |
| 不破坏路由 | 只改导航壳，URL 保持不变 |
| Feature Flag | `design_studio`、`forum_enabled` 等关时不占坑 |
| 单一数据源 | `packages/core/nav/workspace-nav.ts`（名称待定） |

### 2.2 推荐结构（方案 A，默认）

**桌面 TopNav：**

```
[Logo] [Workspace ▾]  │  Home  │  Work ▾  │  Agents ▾  │  Create ▾  │  More ▾  │     [⌘K] [+ ▾] [头像 ▾]
```

| 一级 | 类型 | 说明 |
|------|------|------|
| **Home** | 直链 | 工作台入口 |
| **Work ▾** | 下拉 | Issue / Project 核心路径 |
| **Agents ▾** | 下拉 | Agent 运行与自动化 |
| **Create ▾** | 下拉 | **Chat + Design Studio**（OD 主入口） |
| **More ▾** | 下拉 | 会议 / Office / 论坛等低频模块 |

**右侧：**

- **Search**（⌘K）：保持
- **+ ▾**（替代单一 New Issue）：
  - 新建 Issue
  - 新建设计…（Design composer）
  - 新对话（Chat）
- **头像 ▾**：账户 + Workspace 设置 + Configure（Runtimes、Skills、Integrations、Labs）

Configure **不出现在 TopNav 一级**（与 OD Integrations/Settings 一致）。

### 2.3 二级菜单内容

#### Work ▾

| 项 | 路由 key |
|----|----------|
| 收件箱 | `inbox` |
| 我的 Issue | `myIssues` |
| 全部 Issue | `issues` |
| 项目 | `projects` |
| 最近访问 | `recent` |

#### Agents ▾

| 项 | 路由 key | OD 对照 |
|----|----------|---------|
| Agents | `agents` | — |
| Autopilots | `autopilots` | OD Automation |
| Squads | `squads` | — |
| Explore | `explore` | — |
| 用量 | `usage` | — |

#### Create ▾（`AICORTEX_FEATURE_DESIGN_STUDIO=true` 时完整显示）

| 项 | 路由 | 说明 |
|----|------|------|
| Chat | `/chat` | 工程对话（现有） |
| Design Studio | `/projects` → 选 Project → `/projects/:id/design` | **须先选 Project** |
| — | — | 分隔线 |
| 新建设计… | `/projects/:id/design/new?mode=…` | 快捷：Prototype / Deck / Template |
| 模板 | `/design/templates` 或 Project 内 catalog | Template gallery（Phase B 内置） |

**设计系统（DESIGN.md）** 不在 Create 菜单单独入口 → 在 **Project → Resources** 管理（与决策一致）。

Flag 关闭时：**Create** 仅保留 Chat，或 Chat 改回一级直链。

#### More ▾

| 项 | 路由 key | 条件 |
|----|----------|------|
| 会议 | `meetings` | 始终 |
| Office | `office` | 始终 |
| 论坛 | `forum` | `forum_enabled` |

### 2.4 AppSidebar 映射（Desktop）

读同一份 `workspace-nav`，呈现为侧栏分组（与 TopNav 语义一致）：

```
Personal     → Home, Inbox, My Issues, Recent
Work         → Issues, Projects
Agents       → Agents, Autopilots, Squads, Explore, Usage
Create       → Chat, Design Studio（经 Project）, Templates
More         → Meetings, Office, Forum
Configure    → Runtimes, Skills, Settings
Pinned       → （保持现有）
```

### 2.5 激活态与高亮

- 父级 dropdown 在**任一子路由 active** 时高亮（如 `/design/*` → **Create** 高亮）。
- 下拉内当前项显示 ✓。
- Mobile Sheet：分组标题（Work / Agents / Create / More / Configure），禁止 15 行平铺。

### 2.6 与 OD 页面对照

| OD | aicortex 导航 |
|----|---------------|
| Home | Home + Create ▾ 快捷发起 |
| Studio | Create → Design Studio |
| Automation | Agents → Autopilots |
| Design System | Project → Resources（`design_system`） |
| Plugins | v2：Configure → Skills 或 Design 插件子页 |
| Integrations | 头像 → Integrations |
| Chat（工程） | Create → Chat |

### 2.7 实现任务清单

- [x] 新增 `packages/core/nav/workspace-nav.ts`（分组、path、icon、feature、i18n key）
- [x] 重构 `top-nav.tsx`：dropdown 渲染 + active 检测
- [x] 重构 `app-sidebar.tsx`：读 shared config
- [x] 新增 i18n：`layout.json` 中 `nav.group.*`
- [ ] 右侧 **+ ▾** 菜单
- [ ] Home 快捷卡片（Issue / Chat / Design / Agent）补偿 Chat 不进一级的点击成本
- [x] Mobile Sheet 分组（随 TopNav dropdown 一并落地）
- [ ] 单测：`isNavGroupActive(pathname, group)`

### 2.8 备选方案（不默认）

**方案 B**：Design 一级直出 `Home | Work ▾ | Design ▾ | Agents ▾ | Chat | More ▾` — 设计团队曝光高，但一级项仍偏多。

**方案 C**：全面改用 OD 英文命名 — 与 aicortex 文档/CLI 术语不一致，**不推荐**。

---

## 3. OD 功能实现方案

### 3.1 核心原则

| 原则 | 含义 |
|------|------|
| **默认关** | `AICORTEX_FEATURE_DESIGN_STUDIO=false` 时零行为变化（**本地 dev 默认 true**，生产仍建议显式配置） |
| **新域，不改旧域** | `/api/design/*` + `/design/*` UI，不动现有 chat/issue 默认契约 |
| **复用执行链** | 仍用 task queue、daemon spawn、work_dir、artifact API |
| **Prompt 分叉** | 仅 `design_mode` 非空 task 走 OD prompt；普通 chat 仍 `buildChatPrompt` |
| **内容 vendoring** | 从 OD 导入 skills / DESIGN.md / craft / templates，不 fork OD daemon |

### 3.2 Agent Instructions + Skill ≠ OD 四层

| OD 层 | aicortex 现状 | 缺口 |
|-------|---------------|------|
| Skill 正文 | Agent 挂载 Skill → execenv 写入 | ✅ |
| DESIGN.md | **`project_resource`（`design_system`）** + Project Resources UI + OD 预设导入 | ✅ MVP |
| craft | `server/internal/design/craft/*.md` 按 mode 注入 | ⚠️ 未接 skill `od.craft.requires` metadata |
| discovery | question-form UI + `snippets/discovery.md` 指令栈 | ✅ MVP |
| official 设计师人格 / deck 框架 / Jury | `snippets/official-system.md`、`deck_framework.md`；Jury 仅 API 桩 | ⚠️ Jury Theater 未做 |

### 3.3 架构

```
┌─ 现有 aicortex（不变）────────────────────────────┐
│ Chat / Issue / Agent 管理 / Task / Daemon        │
└───────────────────────┬───────────────────────────┘
                        │ design_mode 分支
┌─ Design Studio（Feature Flag）────────────────────┐
│ /design UI  │  /api/design/*  │  PromptComposer   │
│ Export      │  Critique(Jury) │  Project Resource │
└───────────────────────────────────────────────────┘
```

**不做：**

- 合并 OD `od daemon` 进 aicortex server
- 给所有 Chat 默认注入 discovery + DESIGN.md
- 长期 iframe 嵌 OD Web App

### 3.4 数据模型（已确认）

#### 3.4.1 「项目」复用 aicortex Project

**不复用 OD 的 `.od/projects` 概念，也不新建 `design_project` 表。**

| 实体 | 是否复用 | 说明 |
|------|----------|------|
| **`project`** | ✅ 复用 | Design Studio 入口 **必须先选 Project**；产物、权限、资源与 Project 绑定 |
| **`chat_session`** | ✅ 扩展 | 一次设计对话 = 一条 session；同一 Project 下可有 **多条** design session |
| **`agent_task_queue`** | ✅ 扩展 | 每条 user message 仍 enqueue task；带 `design_*` 字段 |
| **`project_resource`** | ✅ 扩展类型 | 存 DESIGN.md（见 §3.4.2） |

关系示意：

```
Project (已有)
  ├── project_resource[]     ← design_system（DESIGN.md）、github_repo、local_path…
  └── chat_session[]       ← session_kind=design, project_id NOT NULL
        └── agent_task_queue[]  ← design_mode, design_skill_id, …
              └── work_dir / artifacts
```

#### 3.4.2 Design System = Project Resource

新增 `resource_type: design_system`（validator + execenv 注入）：

```json
{
  "name": "linear-app",
  "content": "# DESIGN.md …",
  "source": "import:open-design/design-systems/linear-app/DESIGN.md"
}
```

- 在 **Project 详情 → Resources** 添加 / 编辑 / 从 OD 导入。
- Composer 里 **Design System 下拉** = 当前 Project 下所有 `design_system` resources。
- 每个 design session 记录 **`design_system_resource_id`**（选用哪一个 resource）。

#### 3.4.3 chat_session 扩展

```text
session_kind             'chat' | 'design'     -- 默认 'chat'；Design Studio 创建时为 'design'
project_id               uuid NOT NULL         -- design session 必填；工程 chat 仍可选
design_mode              prototype | deck | template | design_system
design_skill_id          uuid
design_system_resource_id uuid                  -- → project_resource.id
artifact_entry           string                -- 默认 index.html
```

工程 Chat（`session_kind=chat`）**不填** design 字段 → 行为与今天一致。

#### 3.4.4 agent_task_queue 扩展（nullable）

```text
design_mode
design_skill_id
design_system_resource_id
```

Task 创建时从 session 快照复制；现有 task 字段全 null → 无行为变化。

#### 3.4.5 专用 Design Agent

- Workspace 设置 **`default_design_agent_id`**（或创建 workspace 时 seed `frontend-builder` 模板 Agent）。
- Design Studio API：**拒绝** `session_kind=design` 使用非 Design Agent。
- Design Agent 预挂 curated design skills（§4.2）；与 Issue 工程 Agent 分离。

#### 3.4.6 路由建议

```
/projects/:projectId/design                    # 该项目下 design session 列表
/projects/:projectId/design/sessions/:id       # Studio 三栏
/projects/:projectId/resources                 # 管理 design_system resources
```

Create ▾ → Design Studio：先 **选 Project**（`/{slug}/design` 项目选择器），再进 `/projects/:id/design`。

Feature flags（`.env`）：

```env
AICORTEX_FEATURE_DESIGN_STUDIO=false
AICORTEX_FEATURE_DESIGN_EXPORT=false      # 可选子开关
AICORTEX_FEATURE_DESIGN_JURY=false
# 已有
AICORTEX_FEATURE_ARTIFACT_BROWSE=
AICORTEX_FEATURE_RUNTIME_TUNNEL=
```

### 3.5 Prompt 组装（对标 OD `composeSystemPrompt`）

新建 `server/internal/design/prompt.go`，仅在 design task 调用：

| 顺序 | 内容 | 来源 |
|------|------|------|
| 1 | Prompt injection resistance | OD 精简 |
| 2 | 设计师身份 + 工作流 | port `official-system` 精简版 |
| 3 | discovery 指令 | port `discovery.ts` 精简版 |
| 4 | Active DESIGN.md | 当前 session 的 `design_system_resource_id` → Project Resource 正文 |
| 5 | Skill 正文 | 已有 AgentSkills |
| 6 | craft | skill `od.craft.requires` → craft/*.md |
| 7 | Deck 框架 | mode=deck 时 deck-framework 指令 |

Daemon 分支：

```go
if task.DesignMode != "" {
    prompt = design.BuildPrompt(task)
    execenv.InjectDesignContext(env, task)
} else if task.ChatSessionID != "" {
    prompt = buildChatPrompt(task)
} else {
    prompt = BuildPrompt(task)
}
```

### 3.6 UI：Design Studio 交互

布局 **复用 develop-od Chat 三栏**，中间为设计对话，右侧为工作室侧栏：

```
┌──────────┬─────────────────────────────┬──────────────────────────┐
│ Session  │  对话 + question-form        │  [预览][文件][终端][导出] │
│ 列表     │  TodoWrite（Jury 仅 Phase D）│  iframe / 树 / xterm     │
│ (同 Project)│ Composer: 模式/Skill/DS   │                          │
└──────────┴─────────────────────────────┴──────────────────────────┘
```

**入口约束（已确认）：**

1. 未选 **Project** → 只显示 Project 选择器，不能发 brief。
2. Project 下无 `design_system` resource → 引导去 **Project Resources** 添加或导入 DESIGN.md。
3. Agent 固定为 **Design Agent**（不在 Studio 内切换工程 Agent）。

**Composer（对标 OD Home）：**

- **Project**（进入 Studio 前或顶栏只读展示）
- 模式：Prototype / Deck / Template / Design System
- Skill、**Design System**（当前 Project 的 resources 下拉）
- Brief + 生成

**改稿三种方式：**

1. 对话自然语言
2. **Comment mode**：预览 iframe 点选 `data-aicortex-id` → 浮层 note → 带回 composer
3. **Parameter sliders**：skill 声明 `od.parameters` 时 live tweak

**与现有 Chat 关系：**

- 工程 Chat：**不变**（无 discovery 强制、无 Jury）
- 桥接：Chat/Issue 预览区「在 Design Studio 中继续编辑」→ 继承 work_dir / task_id

### 3.7 代码组织

```
packages/
  core/nav/workspace-nav.ts       # 导航共享配置
  design/                         # types、prompt 片段、craft 解析
  views/design-studio/            # Design UI
  views/shared/artifact-preview/  # Chat + Design + Issue 共用预览

server/internal/
  design/                         # handler、prompt、export、critique
  artifact/                       # 已有
  daemon/                         # design 分支

apps/web/app/[workspaceSlug]/(dashboard)/
  projects/[projectId]/design/   # 新路由（Studio）
  chat/                          # 不变
```

### 3.8 OD 能力对照与落点

| OD 能力 | aicortex 落点 | 阶段 | 状态 |
|---------|---------------|------|------|
| Home 三件套 | Design Composer + 模板 catalog | B | ✅ MVP |
| discovery question-form | 已有 UI + discovery prompt | B | ✅ |
| Studio 预览 | DesignToolsSidebar + viewport + 自动识别 HTML 入口 | B | ✅ MVP |
| Comment mode | iframe 点选 `data-aicortex-id` → Composer | C | ✅ MVP |
| 导出 HTML/PDF/PPTX/ZIP | `/api/design/export` + 侧栏 HTML 下载 | C | ⚠️ metadata 桩 + HTML 下载 |
| Design Jury | daemon orchestrator + Theater UI | **D only** | ❌ API 桩 |
| HyperFrames / 图片 / 视频 / 音频 | **不做** | — | — |
| Plugins 261 | Skills + registry 渐进 | D | ❌ |
| Automation | 现有 Autopilots | — | — |
| 终端 auto cd work_dir | `ChatTerminalPanel` bootstrapCommand | C | ✅ |
| 文本文件可编辑 | daemon write API | C | ❌ |
| Issue → Design 深链 | Issue 预览区链接到 Project Design Hub | D | ⚠️ 已链 Hub，未继承 work_dir |

### 3.9 内容资产

| 资产 | 做法 |
|------|------|
| Skills | **方案 D**：workspace curated 内置 + `skill import` 扩展；**排除**图片/视频/HyperFrames/音频类（见 §4.2） |
| DESIGN.md | **Project Resource**（`design_system`）；从 OD `design-systems/` 导入到某 Project |
| craft | repo 静态 `resources/craft/*.md`，skill metadata 按需注入 |
| Templates | Phase B 只读内置 catalog；挂 Project 或 workspace 模板目录 |

Design Agent 种子模板：`frontend-builder`、`html-slides`（`server/internal/agenttmpl/templates/`）。

### 3.9 实施阶段

#### 阶段 A — 隔离壳（1–2 周）

- [x] Feature flag + migration（nullable design 字段，`100_design_studio`）
- [x] `server/internal/design/` 骨架（prompt、craft、templates、features）
- [x] `/design` 项目选择器 + `/projects/:id/design` 路由
- [x] `workspace-nav` + TopNav/Sidebar 重构（§2）

#### 阶段 B — MVP 主循环（2–3 周）

- [x] `project_resource` 新增 `design_system` 类型 + OD DESIGN.md 预设导入
- [x] Design Composer（Project / mode / skill / DS resource / brief / 模板）
- [x] `design.BuildPrompt` + daemon `design_mode` 分支 + execenv 设计模式文案
- [x] `chat_session.session_kind=design` + 专用 Design Agent（Settings 可配）
- [x] Studio 三栏（`/projects/:id/design/sessions/:sid`）
- [x] discovery 指令 + question-form 流程
- [x] Phase B Deck：**仅 HTML**（PPTX → Phase C）
- [x] `chat:done` 刷新 design session / 侧栏 `work_dir` + `last_task_id`

#### 阶段 C — 体验对齐（3–4 周）

- [x] Comment mode（MVP：iframe 点选 + Composer 注入）
- [x] Viewport（desktop / tablet / mobile）
- [ ] 导出 PDF / PPTX / ZIP（真实打包）
- [x] 终端 cwd = work_dir（bootstrapCommand）
- [ ] artifact 文本可编辑 + daemon write
- [ ] 抽 `shared/artifact-preview`

#### 阶段 D — 高级（按需）

- [ ] **Design Jury**：daemon orchestrator + Theater UI（SSE `critique.*`）
- [ ] Plugins registry（仍不含 OD 图片/视频类）
- [ ] Issue/Chat → Design Studio 深链（带 work_dir 续接）

每个阶段：**flag 关 = 现有 e2e 不变**。

### 3.10 关键改动文件

| 优先级 | 区域 | 文件 |
|--------|------|------|
| P0 | 导航 | `packages/core/nav/workspace-nav.ts`, `top-nav.tsx`, `app-sidebar.tsx` |
| P1 | DB + API | `chat.sql` session 扩展, `project_resource` design_system, `server/internal/handler/design.go` |
| P1 | Prompt | `server/internal/design/prompt.go`, `server/internal/daemon/prompt.go` 分支 |
| P1 | execenv | `server/internal/daemon/execenv/context.go` |
| P1 | 前端 | `packages/views/design-studio/*`, `packages/core/types/design.ts` |
| P2 | 预览 | `chat-html-file-preview.tsx` → shared |
| P2 | 终端 cwd | daemon shell + `chat-terminal-panel.tsx` |
| P3 | 导出 | `server/internal/design/export.go` |

### 3.11 develop-od 已有 vs 待做

**已完成（develop-od）：**

- Chat 工具侧栏：文件树 + 预览、终端、网页（static + tunnel）
- HTML 渲染/源码切换
- `ChatSession.work_dir / runtime_id / last_task_id`
- `AICORTEX_FEATURE_ARTIFACT_BROWSE` / `RUNTIME_TUNNEL`

**已完成（develop-od-dev，Design Studio）：**

- migration `100_design_studio` + `/api/design/*` + `/api/projects/:id/design/*`
- 导航 `workspace-nav` + Create ▾ → `/{slug}/design` 项目选择器
- Project 详情「设计工作室」入口；Resources 添加 `design_system` + OD 预设
- Design Composer（mode / skill / DS / 模板 / brief）；Studio 三栏 + DesignToolsSidebar
- Prompt 栈（injection resistance、official-system、discovery、craft、deck-framework）
- Comment mode、Viewport、终端 auto cd、Issue 预览深链（→ Project Design Hub）
- Settings 默认 Design Agent；e2e `design-studio.spec.ts`
- 侧栏 artifact 在 `chat:done` 后刷新（合并 chat session + enrichDesignSession work_dir）

**待做（与 OD 对齐）：**

- 右侧 **+ ▾** 快捷菜单、Home 卡片
- 真实导出 PDF / PPTX / ZIP
- Design Jury orchestrator + Theater UI
- artifact 文本可编辑、shared/artifact-preview 抽取
- Issue → Design Session **work_dir 续接**（非仅 Hub 链接）
- skill metadata `od.craft.requires` 动态 craft 注入

---

## 4. 产品决策 Log（已确认 2026-06-07）

### 4.1 汇总表

| # | 决策点 | **结论** |
|---|--------|----------|
| 1 | Design System 存哪 | **Project Resource**（`resource_type: design_system`）；Design Studio **必须先选 Project** |
| 2 | 项目 / 会话 / 任务建模 | **复用 `project`**；session = `chat_session`（`session_kind=design`）；task 扩展 `design_*`；**不**建 `design_project` 表 |
| 3 | Chat TopNav | **Create ▾** + Home 卡片 / **+ ▾** / ChatFab 补偿（见 §2.2） |
| 4 | OD Skills | **方案 D**（curated + import）；**排除图片 / 视频 / HyperFrames / 音频** 相关 skill |
| 5 | Phase B Deck | **仅 HTML**；PDF/PPTX → Phase C |
| 6 | Design Jury | **仅 Phase D**：daemon orchestrator + Theater UI |
| 7 | Design Agent | **Workspace 专用 Design Agent**（Studio 内不可换工程 Agent） |
| 8 | 产物与 Project | **必须挂 Project**（`project_id` 必填） |
| 9 | Craft | repo 静态文件 + skill metadata（§3.9） |
| 10 | Template | Phase B 内置 catalog |
| 11 | 导出执行位置 | Runtime daemon |
| 12 | Feature Flag | `DESIGN_STUDIO` + `DESIGN_EXPORT` + `DESIGN_JURY` 分层 |
| 13 | 导航 config | Web TopNav / Desktop Sidebar **共用** `workspace-nav.ts` |
| 14 | Comment 元素 ID | `data-aicortex-id` |
| 15 | 命名 | 品牌 **Design System（DESIGN.md）** vs UI 规范 `docs/design.md` 分开 |

### 4.2 Curated Skills（含排除规则）

**纳入（示例方向，Phase B 约 15 个）：**

- Prototype / landing：`saas-landing`、`dashboard`、`login-flow`、`frontend-design`、`web-artifacts-builder`
- Deck / slides：`slides`、`frontend-slides`、`html-ppt` 系列（无视频导出依赖）
- Design system 模式：生成/修订 DESIGN.md 的 skill
- 评审（Phase D 前可选轻量）：`plan-design-review` 仅作 skill 参考，**无 Theater 直到 Phase D**
- Craft / 质量：`web-design-guidelines`、`impeccable-design-polish` 等**非媒体**类

**排除（不内置、文档不推荐 import）：**

- 图片生成 / 编辑：`imagegen*`、`imagen`、`venice-image*`、`poster-hero`、…
- 视频 / HyperFrames / 动效 MP4：`video-*`、`hyperframes`、`remotion`、`sora`、`venice-video*`、…
- 音频 / 语音：`speech`、`venice-audio*`、…
- 依赖外部 media provider 的 OD frame skills

其余 skill 用户可自行 `skill import`，但不进入 Design Agent 默认捆绑。

### 4.3 「项目可以复用吗？」— 结论

| 问题 | 答案 |
|------|------|
| aicortex **Project** 实体复用？ | **是**。不新建平行「设计项目」表。 |
| 一个 Project 多次设计？ | **是**。多条 `session_kind=design` 的 chat_session。 |
| 一个 DESIGN.md 多 session 共用？ | **是**。同一 Project 下多个 `design_system` resource；session 选一个 `design_system_resource_id`。 |
| 工程 Chat 的 Project 关联？ | 工程 Chat 仍可选 `project_id`；**仅 design session 强制必填**。 |

---

## 5. 参考

- 外部：`D:\CODE\open-design`（OD 源码）
- aicortex：`docs/design.md`（**视觉**设计系统，与本方案 Design Studio 不同）
- aicortex：`packages/views/layout/top-nav.tsx`、`app-sidebar.tsx`
- aicortex：`packages/views/chat/components/chat-tools-sidebar.tsx`
- aicortex：`server/internal/daemon/prompt.go`
- OD 文档：`docs/architecture.md`、`docs/modes.md`、`docs/skills-protocol.md`、`craft/README.md`
