# PRD: Agent 虚拟办公室动画

## 概述

在 AICortex 前端新增一个 **2.5D 像素风虚拟办公室** 视图，将 Workspace 中的每个 Agent 以像素小人形象呈现，根据实时状态在办公室不同区域执行对应动画，让团队协作状态一目了然。

## 目标

- 提供直观、有趣的方式展示所有 Agent 的实时工作状态
- 利用现有 WebSocket 实时事件驱动动画切换，无需新增后端接口
- 像素风格降低美术资产制作成本，同时保持视觉吸引力

## 可行性分析

**结论：完全可行。**

| 维度 | 评估 |
|------|------|
| 数据源 | 现有 `buildPresenceMap` 已提供 `availability` + `workload` 两个维度，WebSocket 事件实时推送状态变更，无需新增 API |
| 渲染方案 | Canvas (PixiJS) 或纯 CSS sprite animation 均可实现 2.5D 等距视角 + 像素动画 |
| 性能 | Workspace 通常 < 50 Agent，像素 sprite 体积极小，无性能瓶颈 |
| 美术成本 | 像素风 sprite sheet 制作简单，可用 Aseprite 等工具批量产出 |

## 办公室场景设计

### 2.5D 等距视角布局

```
┌─────────────────────────────────────────────────────┐
│                    虚拟办公室                          │
│                                                     │
│   ┌──────────┐   ┌──────────────────┐   ┌───────┐  │
│   │  会议室   │   │     工位区        │   │ 休息室 │  │
│   │          │   │  ╔══╗ ╔══╗ ╔══╗  │   │       │  │
│   │  ○  ○    │   │  ║🖥║ ║🖥║ ║🖥║  │   │ ☕ 🛋 │  │
│   │    🗣    │   │  ╚══╝ ╚══╝ ╚══╝  │   │       │  │
│   │  ○  ○    │   │  ╔══╗ ╔══╗ ╔══╗  │   │  ○ ○  │  │
│   │          │   │  ║🖥║ ║🖥║ ║🖥║  │   │       │  │
│   └──────────┘   │  ╚══╝ ╚══╝ ╚══╝  │   └───────┘  │
│                   └──────────────────┘              │
│                                                     │
│   ┌──────────────────────────────────────────────┐  │
│   │                  走廊 / 过渡区                  │  │
│   └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### 区域定义

| 区域 | 用途 | 对应状态 |
|------|------|---------|
| **工位区** | Agent 在电脑前工作 | `availability: online` + `workload: working` |
| **休息室** | Agent 空闲等待 | `availability: online` + `workload: idle` |
| **会议室** | Squad 成员讨论/分配任务 | Squad 的 leader 正在 dispatch 任务给成员 |
| **走廊** | 状态过渡动画路径 | Agent 在区域间移动时的过渡 |
| **门外/灰显** | Agent 离线 | `availability: offline` |

### 座位分配策略

当多个 Agent 同时处于同一区域时，需要合理分配位置避免重叠：

- **工位区**：预设 6 个固定工位槽位，按 Agent 加入 Workspace 的顺序分配固定工位（`agentIndex % MAX_DESKS`）。当 Agent 数量超过工位数时，超出的 Agent 共享最后一排工位，以微小偏移（±2px）错开显示
- **休息室**：不设固定位置，Agent 进入时随机选取区域内一个空闲坐标点（预设 4-6 个休息点位），若全满则在区域内随机偏移站立
- **会议室**：最多容纳 6 人（1 leader + 5 成员），超出的成员保持在走廊等待区，头顶显示会议图标表示参与中
- **动态扩展**：当 Workspace Agent 总数 > 12 时，背景自动切换为"大办公室"布局（工位扩展为 3×4），通过 `constants.ts` 中的布局配置切换

## 状态 → 动画映射

### 核心映射规则

| Availability | Workload | 场景位置 | 动画 |
|---|---|---|---|
| online | working | 工位 | 小人坐在电脑前打字，屏幕闪烁 |
| online | queued | 工位（等待） | 小人坐在工位，头顶显示 ⏳ 气泡 |
| online | idle | 休息室 | 小人喝咖啡 / 看手机 / 伸懒腰（随机） |
| unstable | * | 当前位置 | 小人半透明闪烁（信号不稳） |
| offline | * | 门外或工位灰显 | 小人变灰色，显示 💤 或从画面淡出 |

### Squad 会议室场景

当检测到以下条件 **任一** 满足时触发会议室动画：

1. **精确触发（优先）**：收到 `squad:dispatch` WebSocket 事件（Squad leader 正在分配任务给成员）
2. **启发式触发（兜底）**：一个 Squad 的 leader Agent 处于 `working` 状态，且同时该 Squad 有 ≥2 个成员 Agent 处于 `queued`（等待被分配），持续 ≥3 秒

> 注：启发式触发是近似表现，可能存在误判（如 leader 在做非 dispatch 的工作）。若后端后续新增 `squad:dispatch` 事件，应优先使用精确触发并移除启发式逻辑。

动画表现：Leader 站在白板前，成员围坐，白板上显示任务分配动画。会议结束（leader 不再 working 或成员离开 queued 状态）后，成员依次走回各自区域。

### 特殊状态动画

| 事件 | 动画效果 |
|------|---------|
| `task:completed` | 小人站起来伸懒腰 + 头顶 ✅ 气泡，然后走向休息室 |
| `task:failed` | 小人头顶 ❌ 气泡 + 挠头动作 |
| `task:queued` → `task:dispatch` | 小人从休息室走向工位坐下 |
| Agent 从 offline → online | 小人从门外走进办公室 |
| Agent 从 online → offline | 小人走向门口，淡出 |

## 技术方案

### 渲染引擎选型

推荐 **PixiJS** (v8)：
- 轻量级 2D WebGL/Canvas 渲染器，适合 sprite 动画
- 成熟的 sprite sheet 和动画系统
- React 集成方案：`@pixi/react` 或自定义 Canvas hook
- 性能优秀，50+ sprite 无压力
- **必须懒加载**：通过 `React.lazy()` + 动态 `import()` 按需加载，仅在用户进入 Office 视图时才下载 PixiJS 及相关资产，避免影响主 bundle 首屏体积

备选：纯 CSS animation + DOM 元素（更简单但扩展性差）

### 架构设计

```
┌─────────────────────────────────────────────┐
│              VirtualOffice 组件               │
├─────────────────────────────────────────────┤
│                                             │
│  ┌─────────────┐    ┌───────────────────┐   │
│  │OfficeScene  │    │ AgentSpriteManager│   │
│  │(背景+家具)   │    │ (小人状态机)       │   │
│  └─────────────┘    └───────────────────┘   │
│         │                    │               │
│         ▼                    ▼               │
│  ┌─────────────┐    ┌───────────────────┐   │
│  │PixiJS Stage │◄───│PresenceMap 数据源  │   │
│  └─────────────┘    └───────────────────┘   │
│                              ▲               │
│                              │               │
│                    ┌───────────────────┐     │
│                    │ WebSocket Events  │     │
│                    │ (existing infra)  │     │
│                    └───────────────────┘     │
└─────────────────────────────────────────────┘
```

### 数据流

```
WebSocket Event (agent:status / task:*)
  → React Query invalidation (existing)
    → buildPresenceMap() 重新计算
      → VirtualOffice 组件 re-render
        → AgentSpriteManager 比对状态差异
          → 触发对应动画 transition
```

无需新增后端接口，完全复用现有实时数据管道。

### Sprite 状态机

每个 Agent 小人是一个独立的有限状态机：

```
States: idle_rest | walking | working | waiting | meeting | entering | leaving | disconnected

Transitions:
  idle_rest  → walking    (workload 变为 working/queued)
  walking    → working    (到达工位)
  walking    → meeting    (到达会议室)
  working    → walking    (task completed, 走向休息室)
  working    → waiting    (workload 变为 queued)
  *          → disconnected (availability → offline)
  disconnected → entering (availability → online)
  entering   → idle_rest  (到达休息室)
```

### 状态机防抖与过渡队列

由于 React Query invalidation 可能在短时间内多次触发（如 WebSocket 事件密集到达），状态机需要以下保护机制：

- **Debounce**：状态变更信号经过 300ms debounce 窗口，窗口内的多次相同目标状态合并为一次 transition
- **Transition Queue**：当 Agent 正在执行一个动画过渡（如行走中）时，新的状态变更进入队列，当前动画完成后按队列顺序执行下一个 transition。队列最大深度为 2，超出时丢弃中间状态直接跳到最新目标状态
- **最小停留时间**：每个状态至少停留 500ms 后才允许 transition，避免视觉上的闪烁
- **中断规则**：`offline` 事件为高优先级，可立即中断任何进行中的动画并直接切换到 `disconnected` 状态

### 区域间移动：路径点路由

Agent 在区域间移动不使用通用寻路算法（如 A*），而是采用**预定义路径点（Waypoints）**方案：

- 办公室仅有 5 个固定区域，区域间路径是静态的
- 每对区域之间预定义 1-2 个中间路径点（经过走廊），存储在 `constants.ts` 中
- Agent 移动时按路径点序列做线性插值（lerp），配合行走动画即可
- 优势：零运行时计算开销，实现简单，路径可视化可控

```typescript
// constants.ts 示例
const WAYPOINTS: Record<string, Position[]> = {
  'rest→desk': [REST_EXIT, CORRIDOR_MID, DESK_ENTRANCE],
  'desk→rest': [DESK_EXIT, CORRIDOR_MID, REST_ENTRANCE],
  'desk→meeting': [DESK_EXIT, CORRIDOR_LEFT, MEETING_ENTRANCE],
  'outside→rest': [DOOR, CORRIDOR_RIGHT, REST_ENTRANCE],
}
```

### Sprite Sheet 资产规格

| 资产 | 尺寸 | 帧数 | 说明 |
|------|------|------|------|
| 小人-行走 | 16×24 px | 4帧 | 四方向行走循环 |
| 小人-打字 | 16×24 px | 2帧 | 坐姿打字循环 |
| 小人-休息 | 16×24 px | 2帧 | 站立喝咖啡 |
| 小人-会议 | 16×24 px | 2帧 | 坐姿讨论 |
| 小人-离线 | 16×24 px | 1帧 | 灰色静态 |
| 气泡图标 | 8×8 px | - | ✅ ❌ ⏳ 💤 等 |
| 办公室背景 | 480×320 px | 1帧 | 等距视角静态背景 |
| 家具-工位 | 32×32 px | 1-2帧 | 电脑屏幕闪烁 |
| 家具-沙发 | 32×16 px | 1帧 | 休息室装饰 |
| 家具-白板 | 32×32 px | 2帧 | 会议室白板 |

### 前端组件结构

```
packages/views/virtual-office/
├── VirtualOffice.tsx          # 入口组件
├── hooks/
│   └── useOfficeState.ts      # 将 PresenceMap 转换为办公室场景状态
├── engine/
│   ├── OfficeRenderer.ts      # PixiJS 渲染器封装
│   ├── AgentSprite.ts         # 单个 Agent 小人 sprite + 状态机
│   ├── WaypointRouter.ts      # 预定义路径点路由（区域间移动）
│   └── AnimationController.ts # 动画过渡控制器
├── assets/
│   ├── office-bg.png          # 背景
│   ├── agents.json            # sprite sheet 描述
│   └── agents.png             # sprite sheet 图片
└── constants.ts               # 区域坐标、动画时长等配置
```

## 交互设计

### 用户操作

- **Hover Agent 小人**：显示 tooltip（Agent 名称 + 当前状态 + 正在处理的 Issue 标题）
- **点击 Agent 小人**：跳转到 Agent 详情页
- **缩放**：支持滚轮缩放查看细节
- **全屏**：支持全屏模式

### 入口位置

在 Workspace 导航栏新增 "Office" 入口（与 Board / List / Agents 同级），或作为 Agents 页面的一个视图切换选项。

## 里程碑

| 阶段 | 内容 | 预估工时 |
|------|------|---------|
| M1 - 静态场景 | 等距办公室背景 + Agent 小人静态渲染 + 基于 PresenceMap 的位置分配 | 4天 |
| M2 - 基础动画 | 行走动画 + 工作/休息动画循环 + 状态切换过渡 | 4天 |
| M3 - 实时联动 | WebSocket 事件驱动动画切换 + 气泡提示 | 2天 |
| M4 - 会议室 | Squad 会议场景 + 多人互动动画 | 3天 |
| M5 - 交互完善 | Hover/Click 交互 + 缩放 + 全屏 + 响应式 + 移动端降级 | 2天 |
| M6 - 美术打磨 | 像素美术精修 + 多套皮肤 + 动画细节 | 3天 |

**总计约 18 个工作日**（含 20% buffer，覆盖 PixiJS 集成调试和动画调优的不确定性）。

## 测试策略

| 层级 | 测试内容 | 工具 |
|------|---------|------|
| 单元测试 | 状态机 transition 逻辑、debounce/queue 行为、座位分配算法、路径点路由计算 | Vitest |
| 集成测试 | `useOfficeState` hook 对 PresenceMap 变更的响应、WebSocket 事件 → 状态映射的完整链路 | Vitest + Testing Library |
| 视觉回归 | 各状态下的办公室场景截图对比，防止 sprite/布局意外变化 | Playwright screenshot comparison |
| 性能测试 | 50 Agent 同时渲染时的帧率（目标 ≥ 30fps）、懒加载后首次渲染时间（目标 < 1s） | Chrome DevTools / Lighthouse CI |

重点覆盖：
- 状态机边界情况（快速连续状态切换、offline 中断、队列溢出）
- 座位分配在 Agent 数量 > 工位数时的正确性
- 移动端降级切换的正确触发

## 扩展方向

- **自定义 Avatar**：允许用户为 Agent 选择不同像素皮肤/颜色
- **办公室主题**：提供多套办公室风格（科技风、复古风、太空站）
- **音效**：可选的环境音效（键盘声、咖啡机声）
- **成就徽章**：Agent 完成里程碑时在办公室内展示奖杯
- **访客模式**：分享只读链接让外部人员观看团队工作状态

## 约束与注意事项

- 该功能为纯前端展示层，不修改任何后端逻辑或数据模型
- 需遵循现有包边界规则：渲染逻辑放 `packages/views/`，状态推导复用 `packages/core/`
- PixiJS 作为新依赖需锁定版本（推荐 `pixi.js@^8.x`）
- 需考虑无障碍：提供纯文本 fallback 或 `aria-label` 描述当前场景
- 移动端可降级为简化静态视图

### 移动端降级方案

当视口宽度 < 768px 时，不加载 PixiJS Canvas，改为以下降级展示：

- 使用纯 CSS 卡片列表展示 Agent 状态（复用现有 Agent 列表组件样式）
- 每个卡片显示：Agent 头像（静态像素图标）+ 名称 + 当前状态标签（Working / Idle / Offline）
- 卡片按区域分组（工位区 / 休息室 / 离线），用分隔标题区分
- 保留点击跳转 Agent 详情的交互
- 通过 `matchMedia` 监听视口变化，支持横屏时切回 Canvas 视图
