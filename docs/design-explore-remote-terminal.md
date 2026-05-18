# 设计文档：探索（Explore）— 远程 Runtime 终端

## 概述

在侧边栏新增"探索"菜单，允许 **workspace admin** 从 Web UI 直接连接到远程 Runtime 的 shell/PTY。

终端会话具有**持久性**：用户关闭浏览器后，PTY 进程继续在 Daemon 上运行；重新打开页面时可从会话列表恢复，查看历史输出并继续交互。

## 动机

- 直接在 Runtime 上执行命令（调试、检查环境）
- 交互式运行 agent CLI（如 `kiro-cli chat`）
- 无需 SSH 配置即可远程操作
- 关闭浏览器后恢复之前的终端会话

---

## 架构方案

### 数据流

```
┌─────────────┐       WebSocket        ┌──────────────┐      WebSocket       ┌──────────────┐
│  Browser    │ ◄─────────────────────► │  Go Server   │ ◄──────────────────► │   Daemon     │
│  (xterm.js) │   terminal:data         │  (relay)     │   terminal:data      │  (pty spawn) │
└─────────────┘   terminal:resize       └──────────────┘   terminal:resize    └──────────────┘
```

Server 作为中继（relay），Browser 和 Daemon 之间通过 Server 转发 PTY I/O。

### 为什么 Server 中继？

- Daemon 在用户本地网络，无公网 IP，浏览器无法直连
- 复用现有 daemonws hub WebSocket 连接，零额外网络配置
- 权限控制集中在 Server 层

---

## 会话生命周期

```
[新建会话] → [连接中] → [活跃] ←→ [已分离(detached)] → [已关闭]
                                        ↑
                              用户关闭浏览器/切换页面
```

### 关键行为

| 场景 | 行为 |
|------|------|
| 用户新建会话 | 选择 Runtime → Daemon 启动 PTY → 返回 session_id |
| 用户关闭浏览器 | PTY 继续运行，会话变为 detached 状态 |
| 用户重新打开页面 | 会话列表显示所有活跃会话，点击恢复 |
| 恢复会话 | Server 通知 Daemon 回放 scrollback buffer → 前端渲染历史 |
| 会话空闲超时 | Daemon 在 24h 无 attach 后自动关闭 PTY |
| PTY 进程退出 | 会话标记为 closed，保留最后输出供查看 |
| Runtime 离线 | 会话标记为 disconnected，Runtime 重连后自动恢复 |

---

## 详细设计

### 1. 数据库（会话持久化）

新增 `terminal_sessions` 表：

```sql
-- migration: 093_terminal_sessions.up.sql
CREATE TABLE terminal_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    runtime_id UUID NOT NULL REFERENCES runtimes(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active',  -- active, detached, closed
    shell TEXT NOT NULL DEFAULT '',
    cols INT NOT NULL DEFAULT 120,
    rows INT NOT NULL DEFAULT 30,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_at TIMESTAMPTZ,
    last_attached_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_terminal_sessions_workspace ON terminal_sessions(workspace_id, status);
CREATE INDEX idx_terminal_sessions_runtime ON terminal_sessions(runtime_id, status);
```

### 2. 协议扩展（server/pkg/protocol）

```go
// events.go 新增
const (
    EventTerminalOpen   = "terminal:open"    // browser → server → daemon
    EventTerminalAttach = "terminal:attach"  // browser → server → daemon (恢复会话)
    EventTerminalData   = "terminal:data"    // 双向: PTY I/O
    EventTerminalResize = "terminal:resize"  // browser → server → daemon
    EventTerminalDetach = "terminal:detach"  // browser → server → daemon
    EventTerminalClose  = "terminal:close"   // 任一方 → 关闭
    EventTerminalError  = "terminal:error"   // daemon → server → browser
)

// messages.go 新增
type TerminalOpenPayload struct {
    SessionID string `json:"session_id"`
    RuntimeID string `json:"runtime_id"`
    Title     string `json:"title,omitempty"`
    Cols      int    `json:"cols"`
    Rows      int    `json:"rows"`
    Shell     string `json:"shell,omitempty"` // 默认系统 shell
}

type TerminalAttachPayload struct {
    SessionID string `json:"session_id"`
    Cols      int    `json:"cols"`
    Rows      int    `json:"rows"`
}

type TerminalDataPayload struct {
    SessionID string `json:"session_id"`
    Data      string `json:"data"` // base64
}

type TerminalResizePayload struct {
    SessionID string `json:"session_id"`
    Cols      int    `json:"cols"`
    Rows      int    `json:"rows"`
}

type TerminalClosePayload struct {
    SessionID string `json:"session_id"`
    Reason    string `json:"reason,omitempty"`
}

type TerminalErrorPayload struct {
    SessionID string `json:"session_id"`
    Error     string `json:"error"`
}
```

### 3. Daemon 端

#### 会话管理

```go
// server/internal/daemon/terminal.go
type TerminalSession struct {
    ID         string
    PTY        *os.File
    Cmd        *exec.Cmd
    Scrollback *RingBuffer  // 保留最近 50KB 输出用于恢复
    Cols, Rows int
    Attached   bool         // 是否有 browser 连接
    Done       chan struct{}
}
```

#### 核心行为

- **Open**: 启动 PTY，开始读取输出到 scrollback buffer；如果有 browser attached，同时转发
- **Detach**: browser 断开，PTY 继续运行，输出仅写入 scrollback
- **Attach**: browser 重连，先发送 scrollback 内容（`terminal:data` 批量），再切换为实时转发
- **Close**: kill PTY 进程，清理资源，通知 server 更新状态

#### Scrollback Buffer

环形缓冲区，保留最近 **50KB** 输出。恢复时一次性发送给 browser，前端 xterm.js 渲染历史。

### 4. Server 端

#### 4.1 REST API

```
POST   /api/workspaces/:id/terminal-sessions          # 创建会话
GET    /api/workspaces/:id/terminal-sessions          # 列出会话
DELETE /api/workspaces/:id/terminal-sessions/:sid     # 关闭会话
```

- 创建时 server 写入 DB，然后通过 daemonws 发送 `terminal:open` 给 daemon
- 列表返回所有 active/detached 会话（含 runtime 名称、创建时间等）

#### 4.2 WebSocket 中继

Server 在 realtime WS（browser）和 daemonws hub（daemon）之间路由 terminal 消息：

- 用 `session_id` 关联两端
- 内存维护 `map[sessionID]*TerminalRelay`
- Browser 断开时通知 daemon detach（不 kill）
- Daemon 断开时标记会话为 disconnected

#### 4.3 权限

- **仅 workspace admin** 可访问探索功能
- Server 在 `terminal:open` 和 REST API 中检查 `member.role == "admin" || member.role == "owner"`

### 5. 前端

#### 5.1 路由

```typescript
// packages/core/paths/paths.ts
explore: () => `${ws}/explore`,
```

#### 5.2 导航菜单（侧边栏 + 顶部导航栏）

**侧边栏** (`app-sidebar.tsx`)：在 `workspaceNav` 新增，仅 admin 可见：

```typescript
{ key: "explore", labelKey: "explore", icon: Terminal },
```

渲染时检查 `member.role`，非 admin/owner 不显示。

**顶部导航栏** (`top-nav.tsx`)：在 `navItems` 数组中新增，同样仅 admin 可见：

```typescript
// 条件渲染，类似 forum 的处理方式
...(isAdmin
  ? [{ key: "explore", label: t(($) => $.nav.explore), href: p.explore(), icon: Terminal }]
  : []),
```

位置：放在 `agents` 之后。

#### 5.3 页面结构

```
packages/views/explore/
├── index.ts
└── components/
    ├── explore-page.tsx          # 主页面
    ├── session-list.tsx          # 左侧会话列表
    ├── terminal-panel.tsx        # xterm.js 终端
    └── new-session-dialog.tsx    # 新建会话：选择 runtime
```

#### 5.4 UI 布局

```
┌─────────────────────────────────────────────────────┐
│  探索                                    [+ 新建会话] │
├────────────┬────────────────────────────────────────┤
│ 会话列表    │                                        │
│            │                                        │
│ ● my-dev   │  $ kiro-cli chat                       │
│   Runtime A│  > Hello! How can I help?              │
│   2h ago   │  █                                     │
│            │                                        │
│ ○ debug    │                                        │
│   Runtime B│                                        │
│   离线      │                                        │
│            │                                        │
│ ✕ old-sess │                                        │
│   已关闭    │                                        │
└────────────┴────────────────────────────────────────┘
```

- **●** 活跃/已分离（可恢复）
- **○** Runtime 离线（等待重连）
- **✕** 已关闭（只读查看最后输出）

#### 5.5 新建会话对话框

- 选择目标 Runtime（下拉列表，仅显示在线 runtime）
- 可选：自定义标题
- 可选：指定 shell 或启动命令（如 `kiro-cli`）
- 确认后调用 REST API 创建

#### 5.6 终端恢复流程

1. 用户点击已分离会话
2. 前端发送 `terminal:attach`
3. Daemon 回放 scrollback buffer（一批 `terminal:data`）
4. 前端 xterm.js 写入历史内容
5. 切换为实时模式

---

## 实现计划

### Phase 1：MVP

1. DB migration + REST API（会话 CRUD）
2. Protocol 新增 terminal 事件
3. Daemon PTY 管理 + scrollback buffer
4. Server 中继逻辑
5. 前端探索页面 + xterm.js
6. 侧边栏菜单（admin only）

### Phase 2：体验优化

- 会话自动命名（基于首条命令）
- 终端主题切换
- 快捷命令面板（一键 `kiro-cli`、`claude` 等）
- 终端输出搜索

---

## 依赖

| 组件 | 新增依赖 |
|------|----------|
| Daemon (Go) | `github.com/creack/pty` |
| Frontend | `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-web-links` |

**平台支持：** Linux、macOS、WSL。不支持原生 Windows（无需 conpty）。

---

## 安全考虑

1. **权限**: 仅 workspace admin/owner 可使用
2. **隔离**: 每个终端会话绑定到特定 runtime，daemon 以当前系统用户身份执行
3. **限流**: 每 runtime 最多 5 个并发会话，每用户最多 10 个
4. **超时**: 无 attach 状态超过 24h 自动关闭
5. **审计**: 记录 open/close/attach 事件到 activity log（不记录终端内容）
6. **Runtime 离线**: 会话保持 disconnected 状态，runtime 重连后 daemon 报告存活会话

---

## 文件变更清单

```
# 数据库
server/migrations/093_terminal_sessions.up.sql
server/migrations/093_terminal_sessions.down.sql

# 后端
server/pkg/protocol/events.go              # 新增 terminal 事件常量
server/pkg/protocol/messages.go            # 新增 terminal payload 类型
server/internal/daemon/terminal.go         # 新增: PTY 会话管理 + scrollback
server/internal/daemonws/hub.go            # 路由 terminal 消息
server/internal/handler/terminal.go        # 新增: REST API
server/internal/service/terminal.go        # 新增: 业务逻辑

# 前端
packages/core/paths/paths.ts               # 新增 explore 路径
packages/core/terminal/store.ts            # 新增: 会话状态管理
packages/core/terminal/queries.ts          # 新增: React Query hooks
packages/core/terminal/mutations.ts        # 新增: 创建/关闭会话
packages/views/layout/app-sidebar.tsx      # 新增 explore 菜单项 (admin only)
packages/views/layout/top-nav.tsx          # 新增 explore 导航项 (admin only)
packages/views/explore/                    # 新增: 探索页面组件
apps/web/app/[workspaceSlug]/explore/      # 新增: Next.js 路由页面
```
