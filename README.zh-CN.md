# AICortex

**一个大脑，无数双手。**

开源的 AI 工程团队编排层。<br/>
接入任意编码 Agent，智能路由工作，让团队规模化而无需扩招。

**[English](README.md) | 简体中文**

## AICortex 是什么？

AICortex 是 AI 增强型工程团队的神经系统。它位于你的项目管理流程和日益壮大的编码 Agent 生态之间——编排谁做什么、何时做、怎么做。

你创建 Issue，AICortex 将其路由给合适的 Agent（或人类）。Agent 自主执行、实时推送进度、在阻塞变成瓶颈之前主动暴露问题。每个完成的任务都成为组织知识，让下一个任务更快。

无需 prompt 工程，无需手动编排，无厂商锁定。AICortex 支持 **Claude Code**、**Codex**、**GitHub Copilot CLI**、**OpenClaw**、**OpenCode**、**Hermes**、**Gemini**、**Pi**、**Cursor Agent**、**Kimi** 和 **Kiro CLI** —— 将它们视为团队集体皮层中可互换的神经元。

面向需要结构化委派的团队，**Squads（小队）** 让你把工作分配给一个组。由 Leader Agent 进行分诊和分发——即使团队演进，路由方式也保持稳定。



## 为什么叫 "AICortex"？

大脑皮层（Cortex）是大脑进行高级思维的地方——规划、推理、协调。它不亲自做所有事，而是将数十亿专门化的神经元编排成协调一致的行动。

这就是我们的设计哲学。你的工程团队是皮层，AI Agent 是神经元，AICortex 是将孤立工具变成协调劳动力的结缔组织。

我们没有构建又一个聊天机器人包装器，也没有构建又一个 IDE 插件。我们构建的是**编排层**——"我能用 AI"和"AI 真正在我的团队里交付代码"之间缺失的那一块。

结果：一个 3 人团队加上 AICortex，感觉不像 3 个人，而像 30 个。

## 核心能力

AICortex 管理完整的生命周期：从意图到执行到积累的专业知识。

- **智能路由** — 将工作分配给 Agent 或小队，AICortex 处理调度。Agent 认领任务、执行、汇报——无需看管。
- **Squads（小队）** — 将 Agent（和人类）组合在一个 Leader Agent 下。分配给 `@后端组` 而非挑选个人。Leader 决定谁最适合每个任务。
- **实时执行** — 完整的任务生命周期，WebSocket 流式推送。实时观看 Agent 思考、编码、迭代，或稍后查看——它们不需要你盯着。
- **复合技能** — 解决方案变成可复用模式。部署、迁移、重构——团队的集体智能随每个完成的任务而增长。
- **统一运行时** — 一个控制面管理所有算力。本地 daemon、云实例、自动检测的 CLI。从单一仪表板监控一切。
- **工作区隔离** — 按团队、项目或环境组织。每个工作区有独立的 Agent、Issue、技能和访问控制。

---

## 快速安装

### macOS / Linux（推荐 Homebrew）

```bash
brew install aicortex/tap/aicortex
```

后续可用 `brew upgrade aicortex/tap/aicortex` 更新 CLI。

### macOS / Linux（安装脚本）

```bash
curl -fsSL https://raw.githubusercontent.com/aicortex/aicortex/main/scripts/install.sh | bash
```

如果没有 Homebrew，可以使用安装脚本。脚本会安装 AICortex CLI：检测到 `brew` 时通过 Homebrew 安装，否则直接下载二进制。

### Windows (PowerShell)

```powershell
irm https://raw.githubusercontent.com/aicortex/aicortex/main/scripts/install.ps1 | iex
```

安装完成后，一条命令完成配置、认证和启动：

```bash
aicortex setup          # 连接 AICortex Cloud，登录，启动 daemon
```

> **自部署？** 加上 `--with-server` 在本地部署完整的 AICortex 服务：
>
> ```bash
> curl -fsSL https://raw.githubusercontent.com/aicortex/aicortex/main/scripts/install.sh | bash -s -- --with-server
> aicortex setup self-host
> ```
>
> 需要 Docker。详见 [自部署指南](SELF_HOSTING.md)。

---

## 快速上手

### 1. 初始化运行时

```bash
aicortex setup           # 配置、认证、启动 daemon（一条命令搞定）
```

daemon 在后台运行，自动检测 PATH 中可用的 Agent CLI（`claude`、`codex`、`copilot`、`openclaw`、`opencode`、`hermes`、`gemini`、`pi`、`cursor-agent`、`kimi`、`kiro-cli`）。

### 2. 确认连接

在 AICortex Web 端打开你的工作区，进入 **设置 → 运行时（Runtimes）**，你应该能看到你的机器已作为一个活跃的 **Runtime** 出现。

> **什么是 Runtime（运行时）？** Runtime 是可以执行 Agent 任务的计算环境——你的笔记本、CI runner 或云端 VM。每个 Runtime 上报可用的 Agent CLI，AICortex 据此将工作路由到正确的位置。

### 3. 上线一个 Agent

进入 **设置 → Agents**，点击 **新建 Agent**。选择你的 Runtime，选择 Provider（Claude Code、Codex、GitHub Copilot CLI、OpenClaw、OpenCode、Hermes、Gemini、Pi、Cursor Agent、Kimi 或 Kiro CLI），并为 Agent 起个名字。这个身份会出现在看板、评论和分配选择器中。

### 4. 路由你的第一个任务

在看板上创建一个 Issue（或通过 `aicortex issue create`），然后分配给你的 Agent。它会认领任务、在你的 Runtime 上执行、并自主地将进度流式回传。

---

## CLI 参考

`aicortex` CLI 将你的本地机器桥接到 AICortex 控制面。

| 命令 | 描述 |
|------|------|
| `aicortex login` | 认证（打开浏览器） |
| `aicortex daemon start` | 启动本地 Agent 运行时 |
| `aicortex daemon status` | 检查 daemon 健康状态 |
| `aicortex setup` | AICortex Cloud 一键配置 |
| `aicortex setup self-host` | 自部署一键配置 |
| `aicortex issue list` | 列出工作区中的 Issue |
| `aicortex issue create` | 创建新 Issue |
| `aicortex update` | 更新到最新版本 |

完整命令参考请查看 [CLI 和 Daemon 指南](CLI_AND_DAEMON.md)。

---

## 架构

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│   Next.js    │────>│  Go 后端     │────>│   PostgreSQL     │
│   前端       │<────│  (Chi + WS)  │<────│   (pgvector)     │
└──────────────┘     └──────┬───────┘     └──────────────────┘
                            │
                     ┌──────┴───────┐
                     │ Agent Daemon │  运行在你的机器上
                     └──────────────┘  （Claude Code、Codex、GitHub Copilot CLI、
                                        OpenCode、OpenClaw、Hermes、Gemini、
                                        Pi、Cursor Agent、Kimi、Kiro CLI）
```

| 层级 | 技术栈 |
|------|--------|
| 前端 | Next.js 16 (App Router) |
| 后端 | Go (Chi router, sqlc, gorilla/websocket) |
| 数据库 | PostgreSQL 17 with pgvector |
| Agent 运行时 | 本地 daemon 执行 Claude Code、Codex、GitHub Copilot CLI、OpenClaw、OpenCode、Hermes、Gemini、Pi、Cursor Agent、Kimi 或 Kiro CLI |

## 开发

参与 AICortex 代码贡献，请参阅 [贡献指南](CONTRIBUTING.md)。

**环境要求：** [Node.js](https://nodejs.org/) v20+, [pnpm](https://pnpm.io/) v10.28+, [Go](https://go.dev/) v1.26+, [Docker](https://www.docker.com/)

```bash
make dev
```

`make dev` 自动检测你的环境（主 checkout 或 worktree），创建 env 文件，安装依赖，设置数据库，运行迁移，启动所有服务。

完整的开发流程、worktree 支持、测试和问题排查请参阅 [CONTRIBUTING.md](CONTRIBUTING.md)。
