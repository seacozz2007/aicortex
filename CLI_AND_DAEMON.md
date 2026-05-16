# CLI and Agent Daemon Guide

The `aicortex` CLI connects your local machine to AICortex. It handles authentication, workspace management, issue tracking, and runs the agent daemon that executes AI tasks locally.

## Installation

### Homebrew (macOS/Linux)

```bash
brew install aicortex/tap/aicortex
```

### Build from Source

```bash
git clone https://github.com/aicortex/aicortex.git
cd aicortex
make build
cp server/bin/aicortex /usr/local/bin/aicortex
```

### Update

```bash
brew upgrade aicortex/tap/aicortex
```

For install script or manual installs, use:

```bash
aicortex update
```

`aicortex update` auto-detects your installation method and upgrades accordingly.

## Quick Start

```bash
# One-command setup: configure, authenticate, and start the daemon
aicortex setup

# For self-hosted (local) deployments:
aicortex setup self-host
```

Or step by step:

```bash
# 1. Authenticate (opens browser for login)
aicortex login

# 2. Start the agent daemon
aicortex daemon start

# 3. Done — agents in your watched workspaces can now execute tasks on your machine
```

`aicortex login` automatically discovers all workspaces you belong to and adds them to the daemon watch list.

## Authentication

### Browser Login

```bash
aicortex login
```

Opens your browser for OAuth authentication, creates a 90-day personal access token, and auto-configures your workspaces.

### Token Login

```bash
aicortex login --token <mul_...>
```

Authenticate using a personal access token directly. Useful for headless environments. Pass `--token=` with an empty value to be prompted interactively (so the token never lands in shell history).

### Check Status

```bash
aicortex auth status
```

Shows your current server, user, and token validity.

### Logout

```bash
aicortex auth logout
```

Removes the stored authentication token.

## Agent Daemon

The daemon is the local agent runtime. It detects available AI CLIs on your machine, registers them with the AICortex server, and executes tasks when agents are assigned work.

### Start

```bash
aicortex daemon start
```

By default, the daemon runs in the background and logs to `~/.aicortex/daemon.log`.

To run in the foreground (useful for debugging):

```bash
aicortex daemon start --foreground
```

### Stop

```bash
aicortex daemon stop
```

### Status

```bash
aicortex daemon status
aicortex daemon status --output json
```

Shows PID, uptime, detected agents, and watched workspaces.

### Logs

```bash
aicortex daemon logs              # Last 50 lines
aicortex daemon logs -f           # Follow (tail -f)
aicortex daemon logs -n 100       # Last 100 lines
```

### Supported Agents

The daemon auto-detects these AI CLIs on your PATH:

| CLI | Command | Description |
|-----|---------|-------------|
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | `claude` | Anthropic's coding agent |
| [Codex](https://github.com/openai/codex) | `codex` | OpenAI's coding agent |
| [GitHub Copilot CLI](https://docs.github.com/en/copilot) | `copilot` | GitHub's coding agent (model routed by your GitHub entitlement) |
| OpenCode | `opencode` | Open-source coding agent |
| OpenClaw | `openclaw` | Open-source coding agent |
| Hermes | `hermes` | Nous Research coding agent |
| Gemini | `gemini` | Google's coding agent |
| [Pi](https://pi.dev/) | `pi` | Pi coding agent |
| [Cursor Agent](https://cursor.com/) | `cursor-agent` | Cursor's headless coding agent |
| Kimi | `kimi` | Moonshot coding agent |
| Kiro CLI | `kiro-cli` | Kiro ACP coding agent |

You need at least one installed. The daemon registers each detected CLI as an available runtime.

### How It Works

1. On start, the daemon detects installed agent CLIs and registers a runtime for each agent in each watched workspace
2. It polls the server at a configurable interval (default: 3s) for claimed tasks
3. When a task arrives, it creates an isolated workspace directory, spawns the agent CLI, and streams results back
4. Heartbeats are sent periodically (default: 15s) so the server knows the daemon is alive
5. On shutdown, all runtimes are deregistered

### Configuration

Daemon behavior is configured via flags or environment variables:

| Setting | Flag | Env Variable | Default |
|---------|------|--------------|---------|
| Poll interval | `--poll-interval` | `AICORTEX_DAEMON_POLL_INTERVAL` | `3s` |
| Heartbeat interval | `--heartbeat-interval` | `AICORTEX_DAEMON_HEARTBEAT_INTERVAL` | `15s` |
| Agent timeout | `--agent-timeout` | `AICORTEX_AGENT_TIMEOUT` | `2h` |
| Codex semantic inactivity timeout | `--codex-semantic-inactivity-timeout` | `AICORTEX_CODEX_SEMANTIC_INACTIVITY_TIMEOUT` | `10m` |
| Max concurrent tasks | `--max-concurrent-tasks` | `AICORTEX_DAEMON_MAX_CONCURRENT_TASKS` | `20` |
| Daemon ID | `--daemon-id` | `AICORTEX_DAEMON_ID` | hostname |
| Device name | `--device-name` | `AICORTEX_DAEMON_DEVICE_NAME` | hostname |
| Runtime name | `--runtime-name` | `AICORTEX_AGENT_RUNTIME_NAME` | `Local Agent` |
| Workspaces root | — | `AICORTEX_WORKSPACES_ROOT` | `~/aicortex_workspaces` |
| GC enabled | — | `AICORTEX_GC_ENABLED` | `true` (set `false`/`0` to disable) |
| GC scan interval | — | `AICORTEX_GC_INTERVAL` | `1h` |
| GC TTL (done/cancelled issues) | — | `AICORTEX_GC_TTL` | `24h` |
| GC orphan TTL (no `.gc_meta.json`) | — | `AICORTEX_GC_ORPHAN_TTL` | `72h` |
| GC artifact TTL (open issues) | — | `AICORTEX_GC_ARTIFACT_TTL` | `12h` (set `0` to disable) |
| GC artifact patterns | — | `AICORTEX_GC_ARTIFACT_PATTERNS` | `node_modules,.next,.turbo` |

#### Workspace garbage collection

The daemon periodically scans `AICORTEX_WORKSPACES_ROOT` and reclaims disk space in three modes:

- **Full task cleanup** — when an issue's status is `done` or `cancelled` and has been idle for `AICORTEX_GC_TTL`, the entire task directory is removed.
- **Orphan cleanup** — task directories with no `.gc_meta.json` (e.g. left over from a daemon crash) are removed once they exceed `AICORTEX_GC_ORPHAN_TTL`.
- **Artifact-only cleanup** — when a task has been completed for at least `AICORTEX_GC_ARTIFACT_TTL` but the issue is still open, regenerable build outputs whose directory basename matches `AICORTEX_GC_ARTIFACT_PATTERNS` are removed; the rest of the workdir (source, `.git`, `output/`, `logs/`, `.gc_meta.json`) is preserved so the agent can resume the same workdir on the next task.

Patterns are basename-only — entries containing `/` or `\` are silently dropped — and `.git` subtrees are never descended into. The default list (`node_modules`, `.next`, `.turbo`) is intentionally narrow; extend it per deployment if your repos consistently produce other regenerable directories (for example, `AICORTEX_GC_ARTIFACT_PATTERNS=node_modules,.next,.turbo,target,__pycache__`). To disable artifact cleanup entirely, set `AICORTEX_GC_ARTIFACT_TTL=0`.

Agent-specific overrides:

| Variable | Description |
|----------|-------------|
| `AICORTEX_CLAUDE_PATH` | Custom path to the `claude` binary |
| `AICORTEX_CLAUDE_MODEL` | Override the Claude model used |
| `AICORTEX_CLAUDE_ARGS` | Default extra arguments for Claude Code runs |
| `AICORTEX_CODEX_PATH` | Custom path to the `codex` binary |
| `AICORTEX_CODEX_MODEL` | Override the Codex model used |
| `AICORTEX_CODEX_ARGS` | Default extra arguments for Codex runs |
| `AICORTEX_COPILOT_PATH` | Custom path to the `copilot` binary |
| `AICORTEX_COPILOT_MODEL` | Override the Copilot model used (note: GitHub Copilot routes models through your account entitlement, so this may not be honoured) |
| `AICORTEX_OPENCODE_PATH` | Custom path to the `opencode` binary |
| `AICORTEX_OPENCODE_MODEL` | Override the OpenCode model used |
| `AICORTEX_OPENCLAW_PATH` | Custom path to the `openclaw` binary |
| `AICORTEX_OPENCLAW_MODEL` | Override the OpenClaw model used |
| `AICORTEX_HERMES_PATH` | Custom path to the `hermes` binary |
| `AICORTEX_HERMES_MODEL` | Override the Hermes model used |
| `AICORTEX_GEMINI_PATH` | Custom path to the `gemini` binary |
| `AICORTEX_GEMINI_MODEL` | Override the Gemini model used |
| `AICORTEX_PI_PATH` | Custom path to the `pi` binary |
| `AICORTEX_PI_MODEL` | Override the Pi model used |
| `AICORTEX_CURSOR_PATH` | Custom path to the `cursor-agent` binary |
| `AICORTEX_CURSOR_MODEL` | Override the Cursor Agent model used |
| `AICORTEX_KIMI_PATH` | Custom path to the `kimi` binary |
| `AICORTEX_KIMI_MODEL` | Override the Kimi model used |
| `AICORTEX_KIRO_PATH` | Custom path to the `kiro-cli` binary |
| `AICORTEX_KIRO_MODEL` | Override the Kiro model used |

`AICORTEX_CLAUDE_ARGS` and `AICORTEX_CODEX_ARGS` are parsed with POSIX shellword quoting, so values such as `--model "gpt-5.1 codex" --sandbox read-only` are split like a shell command line. Agent arguments are applied in this order: hardcoded AICortex defaults, daemon-wide env defaults, then per-agent `custom_args` from the task.

### Self-Hosted Server

When connecting to a self-hosted AICortex instance, the easiest approach is:

```bash
# One command — configures for localhost, authenticates, starts daemon
aicortex setup self-host

# Or for on-premise with custom domains:
aicortex setup self-host --server-url https://api.example.com --app-url https://app.example.com
```

Or configure manually:

```bash
# Set URLs individually
aicortex config set server_url http://localhost:8080
aicortex config set app_url http://localhost:3000

# For production with TLS:
# aicortex config set server_url https://api.example.com
# aicortex config set app_url https://app.example.com

aicortex login
aicortex daemon start
```

### Profiles

Profiles let you run multiple daemons on the same machine — for example, one for production and one for a staging server.

```bash
# Set up a staging profile
aicortex setup self-host --profile staging --server-url https://api-staging.example.com --app-url https://staging.example.com

# Start its daemon
aicortex daemon start --profile staging

# Default profile runs separately
aicortex daemon start
```

Each profile gets its own config directory (`~/.aicortex/profiles/<name>/`), daemon state, health port, and workspace root.

## Workspaces

### List Workspaces

```bash
aicortex workspace list
```

Watched workspaces are marked with `*`. The daemon only processes tasks for watched workspaces.

### Watch / Unwatch

```bash
aicortex workspace watch <workspace-id>
aicortex workspace unwatch <workspace-id>
```

### Get Details

```bash
aicortex workspace get <workspace-id>
aicortex workspace get <workspace-id> --output json
```

### List Members

```bash
aicortex workspace members <workspace-id>
```

## Issues

### List Issues

```bash
aicortex issue list
aicortex issue list --status in_progress
aicortex issue list --priority urgent --assignee "Agent Name"
aicortex issue list --assignee-id 5fb87ac7-23b5-4a7a-81fa-ed295a54545d
aicortex issue list --full-id
aicortex issue list --limit 20 --output json
```

Table output shows a routable issue `KEY` such as `ACX-123`; copy that key into follow-up commands like `issue get`, `issue comment list`, `issue status`, or `--parent`. Add `--full-id` when you need canonical UUIDs. Available filters: `--status`, `--priority`, `--assignee` / `--assignee-id`, `--project`, `--limit`. Use `--assignee-id <uuid>` for unambiguous filtering when names overlap.

### Get Issue

```bash
aicortex issue get <id>
aicortex issue get <id> --output json
```

### Create Issue

```bash
aicortex issue create --title "Fix login bug" --description "..." --priority high --assignee "Lambda"
aicortex issue create --title "Fix login bug" --assignee-id 5fb87ac7-23b5-4a7a-81fa-ed295a54545d
```

Flags: `--title` (required), `--description`, `--status`, `--priority`, `--assignee` / `--assignee-id`, `--parent`, `--project`, `--due-date`. Pass `--assignee-id <uuid>` (mutually exclusive with `--assignee`) when scripting against the IDs returned by `aicortex workspace members --output json` / `aicortex agent list --output json`.

### Update Issue

```bash
aicortex issue update <id> --title "New title" --priority urgent
```

### Assign Issue

```bash
aicortex issue assign <id> --to "Lambda"
aicortex issue assign <id> --to-id 5fb87ac7-23b5-4a7a-81fa-ed295a54545d
aicortex issue assign <id> --unassign
```

Pass `--to-id <uuid>` to assign by canonical UUID (mutually exclusive with `--to`); useful when names overlap across members and agents.

### Change Status

```bash
aicortex issue status <id> in_progress
```

Valid statuses: `backlog`, `todo`, `in_progress`, `in_review`, `done`, `blocked`, `cancelled`.

### Comments

```bash
# List comments
aicortex issue comment list <issue-id>

# Add a comment
aicortex issue comment add <issue-id> --content "Looks good, merging now"

# Reply to a specific comment
aicortex issue comment add <issue-id> --parent <comment-id> --content "Thanks!"

# Delete a comment
aicortex issue comment delete <comment-id>
```

### Subscribers

```bash
# List subscribers of an issue
aicortex issue subscriber list <issue-id>

# Subscribe yourself to an issue
aicortex issue subscriber add <issue-id>

# Subscribe another member or agent by name
aicortex issue subscriber add <issue-id> --user "Lambda"

# Unsubscribe yourself
aicortex issue subscriber remove <issue-id>

# Unsubscribe another member or agent
aicortex issue subscriber remove <issue-id> --user "Lambda"
```

Subscribers receive notifications about issue activity (new comments, status changes, etc.). Without `--user`, the command acts on the caller.

### Execution History

```bash
# List all execution runs for an issue
aicortex issue runs <issue-id>
aicortex issue runs <issue-id> --full-id
aicortex issue runs <issue-id> --output json

# View messages for a specific execution run
aicortex issue run-messages <task-id>
aicortex issue run-messages <short-task-id> --issue <issue-id>
aicortex issue run-messages <task-id> --output json

# Incremental fetch (only messages after a given sequence number)
aicortex issue run-messages <task-id> --since 42 --output json
```

The `runs` command shows all past and current executions for an issue, including running tasks. Table output uses short task UUID prefixes by default; pass `--full-id` to print canonical task UUIDs. The `run-messages` command accepts full task UUIDs directly; copied short task prefixes must be scoped with `--issue <issue-id>` so the CLI only checks that issue's runs. It shows the detailed message log (tool calls, thinking, text, errors) for a single run. Use `--since` for efficient polling of in-progress runs.

## Projects

Projects group related issues (e.g. a sprint, an epic, a workstream). Every project
belongs to a workspace and can optionally have a lead (member or agent).

### List Projects

```bash
aicortex project list
aicortex project list --status in_progress
aicortex project list --output json
```

Available filters: `--status`.

### Get Project

```bash
aicortex project get <id>
aicortex project get <id> --output json
```

### Create Project

```bash
aicortex project create --title "2026 Week 16 Sprint" --icon "🏃" --lead "Lambda"
```

Flags: `--title` (required), `--description`, `--status`, `--icon`, `--lead`.

### Update Project

```bash
aicortex project update <id> --title "New title" --status in_progress
aicortex project update <id> --lead "Lambda"
```

Flags: `--title`, `--description`, `--status`, `--icon`, `--lead`.

### Change Status

```bash
aicortex project status <id> in_progress
```

Valid statuses: `planned`, `in_progress`, `paused`, `completed`, `cancelled`.

### Delete Project

```bash
aicortex project delete <id>
```

### Associating Issues with Projects

Use the `--project` flag on `issue create` / `issue update` to attach an issue to a
project, or on `issue list` to filter issues by project:

```bash
aicortex issue create --title "Login bug" --project <project-id>
aicortex issue update <issue-id> --project <project-id>
aicortex issue list --project <project-id>
```

## Setup

```bash
# One-command setup for AICortex Cloud: configure, authenticate, and start the daemon
aicortex setup

# For local self-hosted deployments
aicortex setup self-host

# Custom ports
aicortex setup self-host --port 9090 --frontend-port 4000

# On-premise with custom domains
aicortex setup self-host --server-url https://api.example.com --app-url https://app.example.com
```

`aicortex setup` configures the CLI, opens your browser for authentication, and starts the daemon — all in one step. Use `aicortex setup self-host` to connect to a self-hosted server instead of AICortex Cloud.

## Configuration

### View Config

```bash
aicortex config show
```

Shows config file path, server URL, app URL, and default workspace.

### Set Values

```bash
aicortex config set server_url https://api.example.com
aicortex config set app_url https://app.example.com
aicortex config set workspace_id <workspace-id>
```

## Autopilot Commands

Autopilots are scheduled/triggered automations that dispatch agent tasks (either by creating an issue or by running an agent directly).

### List Autopilots

```bash
aicortex autopilot list
aicortex autopilot list --full-id
aicortex autopilot list --status active --output json
```

Autopilot table IDs are short UUID prefixes; follow-up autopilot commands accept copied prefixes when they are unique in the current workspace. Use `--full-id` to print canonical UUIDs.

### Get Autopilot Details

```bash
aicortex autopilot get <id>
aicortex autopilot get <id> --output json   # includes triggers
```

### Create / Update / Delete

```bash
aicortex autopilot create \
  --title "Nightly bug triage" \
  --description "Scan todo issues and prioritize." \
  --agent "Lambda" \
  --mode create_issue

aicortex autopilot update <id> --status paused
aicortex autopilot update <id> --description "New prompt"
aicortex autopilot delete <id>
```

`--mode` currently only accepts `create_issue` (creates a new issue on each run and assigns it to the agent). The server data model also defines `run_only`, but the daemon task path doesn't yet resolve a workspace for runs without an issue, so it's not exposed by the CLI. `--agent` accepts either a name or UUID.

### Manual Trigger

```bash
aicortex autopilot trigger <id>            # Fires the autopilot once, returns the run
```

### Run History

```bash
aicortex autopilot runs <id>
aicortex autopilot runs <id> --limit 50 --output json
```

### Schedule Triggers

```bash
aicortex autopilot trigger-add <autopilot-id> --cron "0 9 * * 1-5" --timezone "America/New_York"
aicortex autopilot trigger-update <autopilot-id> <trigger-id> --enabled=false
aicortex autopilot trigger-delete <autopilot-id> <trigger-id>
```

Only cron-based `schedule` triggers are currently exposed via the CLI. The data model also defines `webhook` and `api` kinds, but there is no server endpoint that fires them yet, so they're not surfaced here.

## Other Commands

```bash
aicortex version              # Show CLI version and commit hash
aicortex update               # Update to latest version
aicortex agent list           # List agents in the current workspace
```

## Output Formats

Most commands support `--output` with two formats:

- `table` — human-readable table (default for list commands)
- `json` — structured JSON (useful for scripting and automation)

```bash
aicortex issue list --output json
aicortex daemon status --output json
```
