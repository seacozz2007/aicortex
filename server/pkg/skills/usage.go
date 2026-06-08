package skills

import (
	"fmt"
	"strings"
)

var platformDisplayNames = map[string]string{
	"claude": "Claude Code",
	"cursor": "Cursor",
	"kiro":   "Kiro",
}

// UsageSkillContent returns the SKILL.md body for teaching an agent how to use AICortex.
func UsageSkillContent(platform string) (string, error) {
	platform, err := NormalizeProvider(platform)
	if err != nil {
		return "", err
	}

	platformName := platformDisplayNames[platform]
	agentCLI := agentCLIName(platform)

	var b strings.Builder
	b.WriteString("---\n")
	b.WriteString("name: aicortex\n")
	b.WriteString("description: \"Operate the AICortex platform and CLI to manage issues, agents, skills, squads, and the local execution daemon. Use when the user wants to track work, assign agents, or run team workflows via aicortex.\"\n")
	b.WriteString("inclusion: always\n")
	b.WriteString("---\n\n")
	b.WriteString("# aicortex\n\n")
	b.WriteString("Use this skill when the user wants to work with **AICortex** — creating or updating issues, assigning agents, managing skills, checking daemon/runtime status, or driving team workflows from the terminal.\n\n")
	b.WriteString("## Platform\n\n")
	b.WriteString(fmt.Sprintf("This skill is for **%s**.\n\n", platformName))
	b.WriteString("## Requirements\n\n")
	b.WriteString("- `aicortex` CLI installed and on `PATH`\n")
	b.WriteString("- Authenticated session: `aicortex login` (check with `aicortex auth status`)\n")
	b.WriteString("- Local execution: `aicortex daemon start` (check with `aicortex daemon status`)\n")
	b.WriteString(fmt.Sprintf("- Agent runtime: **%s** (registered by the daemon when healthy)\n\n", agentCLI))

	b.WriteString("## When to use AICortex vs direct coding\n\n")
	b.WriteString("- **Use `aicortex`** for workspace operations: issues, projects, agents, skills, comments, assignments, squads, autopilots, attachments, and runtime visibility.\n")
	b.WriteString(fmt.Sprintf("- **Use the local agent CLI** (%s) for code edits inside a repo checkout.\n", agentCLI))
	b.WriteString("- **Prefer AICortex issues** when work should be tracked, assigned to an agent, reviewed, or executed asynchronously by the daemon.\n\n")

	b.WriteString("## Quick setup\n\n")
	b.WriteString("```bash\n")
	b.WriteString("# Cloud (default)\n")
	b.WriteString("aicortex setup\n")
	b.WriteString("aicortex login\n")
	b.WriteString("aicortex daemon start\n\n")
	b.WriteString("# Self-hosted\n")
	b.WriteString("aicortex setup self-host --server-url http://localhost:8080 --app-url http://localhost:3000\n")
	b.WriteString("aicortex login\n")
	b.WriteString("aicortex daemon start\n")
	b.WriteString("```\n\n")

	b.WriteString("## Core commands\n\n")
	b.WriteString("### Issues\n\n")
	b.WriteString("| Command | Description |\n")
	b.WriteString("|---------|-------------|\n")
	b.WriteString("| `aicortex issue list` | List issues |\n")
	b.WriteString("| `aicortex issue get <key-or-id>` | Get issue details |\n")
	b.WriteString("| `aicortex issue create --title \"...\"` | Create issue |\n")
	b.WriteString("| `aicortex issue update <id> --status in_progress` | Update issue |\n")
	b.WriteString("| `aicortex issue assign <id> --to \"Agent\"` | Assign issue |\n")
	b.WriteString("| `aicortex issue status <id> done` | Change status |\n")
	b.WriteString("| `aicortex issue comment add <id> --content \"...\"` | Add comment |\n")
	b.WriteString("| `aicortex issue runs <id>` | List execution runs |\n\n")

	b.WriteString("### Agents and skills\n\n")
	b.WriteString("| Command | Description |\n")
	b.WriteString("|---------|-------------|\n")
	b.WriteString("| `aicortex agent list` | List agents |\n")
	b.WriteString("| `aicortex agent get <slug>` | Get agent config |\n")
	b.WriteString("| `aicortex agent create --name \"...\" --instructions \"...\"` | Create agent |\n")
	b.WriteString("| `aicortex agent skills set <agent-id> --skill-ids <ids>` | Attach skills |\n")
	b.WriteString("| `aicortex skill list` | List workspace skills |\n")
	b.WriteString("| `aicortex skill import --url <url>` | Import skill from URL |\n\n")

	b.WriteString("### Daemon and runtimes\n\n")
	b.WriteString("| Command | Description |\n")
	b.WriteString("|---------|-------------|\n")
	b.WriteString("| `aicortex daemon status` | Daemon health |\n")
	b.WriteString("| `aicortex daemon logs -n 100` | Daemon logs |\n")
	b.WriteString("| `aicortex runtime list` | List runtimes |\n")
	b.WriteString("| `aicortex workspace list` | List workspaces |\n")
	b.WriteString("| `aicortex workspace watch <workspace-id>` | Watch workspace |\n\n")

	b.WriteString("### Projects and squads\n\n")
	b.WriteString("| Command | Description |\n")
	b.WriteString("|---------|-------------|\n")
	b.WriteString("| `aicortex project list` | List projects |\n")
	b.WriteString("| `aicortex project create --title \"...\"` | Create project |\n")
	b.WriteString("| `aicortex squad list` | List squads |\n")
	b.WriteString("| `aicortex squad create --name \"...\" --leader <slug>` | Create squad |\n\n")

	b.WriteString("## Rules\n\n")
	b.WriteString("1. Run `aicortex <command> --help` before guessing flags.\n")
	b.WriteString("2. Use issue keys (e.g. `MUL-123`) from `aicortex issue list` when possible.\n")
	b.WriteString("3. Check `aicortex auth status` and `aicortex daemon status` on auth/runtime errors.\n")
	b.WriteString("4. For scripting, add `--output json` to list/get commands.\n")
	b.WriteString("5. Do not invent API endpoints; use the CLI subcommands above.\n\n")

	b.WriteString("## Refresh this skill\n\n")
	b.WriteString("```bash\n")
	b.WriteString(fmt.Sprintf("aicortex skill -p %s\n", platform))
	b.WriteString("```\n")

	return b.String(), nil
}

func agentCLIName(platform string) string {
	switch platform {
	case "claude":
		return "Claude Code (`claude`)"
	case "cursor":
		return "Cursor Agent (`cursor-agent`)"
	case "kiro":
		return "Kiro CLI (`kiro-cli`)"
	default:
		return platform
	}
}
