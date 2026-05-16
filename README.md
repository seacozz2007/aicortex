<p align="center">
  <img src="docs/assets/banner.jpg" alt="AICortex — the collective intelligence layer for engineering teams" width="100%">
</p>

<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/logo-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="docs/assets/logo-light.svg">
  <img alt="AICortex" src="docs/assets/logo-light.svg" width="50">
</picture>

# AICortex

**One brain. Many hands.**

The open-source orchestration layer for AI engineering teams.<br/>
Connect any coding agent, route work intelligently, and let your team scale without scaling headcount.

[![CI](https://github.com/aicortex/aicortex/actions/workflows/ci.yml/badge.svg)](https://github.com/aicortex/aicortex/actions/workflows/ci.yml)
[![GitHub stars](https://img.shields.io/github/stars/aicortex/aicortex?style=flat)](https://github.com/aicortex/aicortex/stargazers)

[Website](https://aicortex.ai) · [Cloud](https://aicortex.ai) · [X](https://x.com/AICortexAI) · [Self-Hosting](SELF_HOSTING.md) · [Contributing](CONTRIBUTING.md)

**English | [简体中文](README.zh-CN.md)**

</div>

## What is AICortex?

AICortex is the nervous system for AI-augmented engineering teams. It sits between your project management workflow and the growing ecosystem of coding agents — orchestrating who does what, when, and how.

You create issues. AICortex routes them to the right agent (or human). Agents execute autonomously, stream progress in real-time, and surface blockers before they become bottlenecks. Every completed task becomes institutional knowledge that makes the next one faster.

No prompt engineering. No manual orchestration. No vendor lock-in. AICortex works with **Claude Code**, **Codex**, **GitHub Copilot CLI**, **OpenClaw**, **OpenCode**, **Hermes**, **Gemini**, **Pi**, **Cursor Agent**, **Kimi**, and **Kiro CLI** — and treats them all as interchangeable neurons in your team's collective cortex.

For teams that need structured delegation, **Squads** let you assign work to a group. A lead agent triages and distributes — your routing stays stable even as the team evolves.

<p align="center">
  <img src="docs/assets/hero-screenshot.png" alt="AICortex board view" width="800">
</p>

## Why "AICortex"?

The cerebral cortex is where the brain does its heavy lifting — planning, reasoning, coordinating. It doesn't do everything itself; it orchestrates billions of specialized neurons into coherent action.

That's the design philosophy here. Your engineering team is the cortex. AI agents are the neurons. AICortex is the connective tissue that turns isolated tools into a coordinated workforce.

We didn't build another chatbot wrapper or another IDE plugin. We built the **orchestration layer** — the missing piece between "I have access to AI" and "AI is actually shipping code on my team."

The result: a 3-person team with AICortex doesn't feel like 3 people. It feels like 30.

## Core Capabilities

AICortex manages the complete lifecycle: from intent to execution to accumulated expertise.

- **Intelligent Routing** — assign work to agents or squads and let AICortex handle dispatch. Agents claim tasks, execute them, and report back — no babysitting required.
- **Squads** — group agents (and humans) under a lead agent. Assign to `@BackendTeam` instead of picking individuals. The lead decides who's best suited for each task.
- **Real-Time Execution** — full task lifecycle with WebSocket streaming. Watch agents think, code, and iterate in real-time, or check in later — they don't need you watching.
- **Compound Skills** — solutions become reusable patterns. Deployments, migrations, refactors — your team's collective intelligence grows with every task completed.
- **Universal Runtime** — one control plane for all compute. Local daemons, cloud instances, auto-detected CLIs. Monitor everything from a single dashboard.
- **Workspace Isolation** — organize by team, project, or environment. Each workspace has its own agents, issues, skills, and access controls.

---

## Quick Install

### macOS / Linux (Homebrew - recommended)

```bash
brew install aicortex/tap/aicortex
```

Use `brew upgrade aicortex/tap/aicortex` to keep the CLI current.

### macOS / Linux (install script)

```bash
curl -fsSL https://raw.githubusercontent.com/aicortex/aicortex/main/scripts/install.sh | bash
```

Use this if Homebrew is not available. The script installs the AICortex CLI on macOS and Linux by using Homebrew when it is on `PATH`, otherwise it downloads the binary directly.

### Windows (PowerShell)

```powershell
irm https://raw.githubusercontent.com/aicortex/aicortex/main/scripts/install.ps1 | iex
```

Then configure, authenticate, and start the daemon in one command:

```bash
aicortex setup          # Connect to AICortex Cloud, log in, start daemon
```

> **Self-hosting?** Add `--with-server` to deploy a full AICortex server on your machine:
>
> ```bash
> curl -fsSL https://raw.githubusercontent.com/aicortex/aicortex/main/scripts/install.sh | bash -s -- --with-server
> aicortex setup self-host
> ```
>
> This pulls the official AICortex images from GHCR (latest stable by default). Requires Docker. See the [Self-Hosting Guide](SELF_HOSTING.md) for details.
> If the selected GHCR tag has not been published yet, fall back to `make selfhost-build` from a checkout.

---

## Getting Started

### 1. Initialize your runtime

```bash
aicortex setup           # Configure, authenticate, and start the daemon
```

The daemon runs in the background and auto-detects agent CLIs (`claude`, `codex`, `copilot`, `openclaw`, `opencode`, `hermes`, `gemini`, `pi`, `cursor-agent`, `kimi`, `kiro-cli`) on your PATH.

### 2. Verify connectivity

Open your workspace in the AICortex web app. Navigate to **Settings → Runtimes** — your machine should appear as an active **Runtime**.

> **What is a Runtime?** A Runtime is any compute environment capable of executing agent tasks — your laptop, a CI runner, or a cloud VM. Each runtime reports its available agent CLIs so AICortex can route work to the right place.

### 3. Bring an agent online

Go to **Settings → Agents** and click **New Agent**. Select your runtime, choose a provider (Claude Code, Codex, GitHub Copilot CLI, OpenClaw, OpenCode, Hermes, Gemini, Pi, Cursor Agent, Kimi, or Kiro CLI), and give it a name. This identity appears on the board, in comments, and in the assignment picker.

### 4. Route your first task

Create an issue from the board (or via `aicortex issue create`), then assign it to your agent. It will claim the task, execute it on your runtime, and stream progress back — autonomously.

---

## CLI Reference

The `aicortex` CLI bridges your local machine to the AICortex control plane.

| Command | Description |
|---------|-------------|
| `aicortex login` | Authenticate (opens browser) |
| `aicortex daemon start` | Start the local agent runtime |
| `aicortex daemon status` | Check daemon health |
| `aicortex setup` | One-command setup for AICortex Cloud |
| `aicortex setup self-host` | One-command setup for self-hosted deployments |
| `aicortex issue list` | List issues in your workspace |
| `aicortex issue create` | Create a new issue |
| `aicortex update` | Update to the latest version |

See the [CLI and Daemon Guide](CLI_AND_DAEMON.md) for the full command reference.

---

## Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│   Next.js    │────>│  Go Backend  │────>│   PostgreSQL     │
│   Frontend   │<────│  (Chi + WS)  │<────│   (pgvector)     │
└──────────────┘     └──────┬───────┘     └──────────────────┘
                            │
                     ┌──────┴───────┐
                     │ Agent Daemon │  runs on your machine
                     └──────────────┘  (Claude Code, Codex, GitHub Copilot CLI,
                                        OpenCode, OpenClaw, Hermes, Gemini,
                                        Pi, Cursor Agent, Kimi, Kiro CLI)
```

| Layer | Stack |
|-------|-------|
| Frontend | Next.js 16 (App Router) |
| Backend | Go (Chi router, sqlc, gorilla/websocket) |
| Database | PostgreSQL 17 with pgvector |
| Agent Runtime | Local daemon executing Claude Code, Codex, GitHub Copilot CLI, OpenClaw, OpenCode, Hermes, Gemini, Pi, Cursor Agent, Kimi, or Kiro CLI |

## Development

For contributors working on the AICortex codebase, see the [Contributing Guide](CONTRIBUTING.md).

**Prerequisites:** [Node.js](https://nodejs.org/) v20+, [pnpm](https://pnpm.io/) v10.28+, [Go](https://go.dev/) v1.26+, [Docker](https://www.docker.com/)

```bash
make dev
```

`make dev` auto-detects your environment (main checkout or worktree), creates the env file, installs dependencies, sets up the database, runs migrations, and starts all services.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full development workflow, worktree support, testing, and troubleshooting.
