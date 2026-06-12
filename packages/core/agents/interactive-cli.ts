export type AgentInteractiveCliSpec = {
  /** Provider slug from runtime.provider */
  provider: string;
  /** Human label for buttons / tooltips */
  label: string;
  binary: string;
  baseArgs: string[];
  allPermissionArgs: string[];
  /** CLI flag used to resume an agent session in interactive mode, if supported. */
  resumeFlag?: string;
};

const INTERACTIVE_CLI_SPECS: AgentInteractiveCliSpec[] = [
  {
    provider: "claude",
    label: "Claude",
    binary: "claude",
    baseArgs: [],
    allPermissionArgs: ["--dangerously-skip-permissions"],
    resumeFlag: "--resume",
  },
  {
    provider: "kiro",
    label: "Kiro",
    binary: "kiro-cli",
    baseArgs: ["chat"],
    allPermissionArgs: ["chat", "--skip-dangerous-all", "--trust-all-tools"],
    resumeFlag: "--resume-id",
  },
  {
    provider: "codex",
    label: "Codex",
    binary: "codex",
    baseArgs: [],
    allPermissionArgs: [],
  },
  {
    provider: "gemini",
    label: "Gemini",
    binary: "gemini",
    baseArgs: [],
    allPermissionArgs: [],
    resumeFlag: "-r",
  },
  {
    provider: "cursor",
    label: "Cursor",
    binary: "cursor-agent",
    baseArgs: [],
    allPermissionArgs: [],
    resumeFlag: "--resume",
  },
  {
    provider: "copilot",
    label: "Copilot",
    binary: "copilot",
    baseArgs: [],
    allPermissionArgs: [],
    resumeFlag: "--resume",
  },
  {
    provider: "opencode",
    label: "OpenCode",
    binary: "opencode",
    baseArgs: [],
    allPermissionArgs: [],
    resumeFlag: "--session",
  },
  {
    provider: "openclaw",
    label: "OpenClaw",
    binary: "openclaw",
    baseArgs: [],
    allPermissionArgs: [],
  },
  {
    provider: "hermes",
    label: "Hermes",
    binary: "hermes",
    baseArgs: [],
    allPermissionArgs: [],
  },
  {
    provider: "pi",
    label: "Pi",
    binary: "pi",
    baseArgs: [],
    allPermissionArgs: [],
  },
  {
    provider: "kimi",
    label: "Kimi",
    binary: "kimi",
    baseArgs: [],
    allPermissionArgs: [],
  },
];

const INTERACTIVE_CLI_BY_PROVIDER = new Map(
  INTERACTIVE_CLI_SPECS.map((spec) => [spec.provider, spec]),
);

export function resolveAgentInteractiveCli(
  provider: string | null | undefined,
): AgentInteractiveCliSpec | null {
  if (!provider) return null;
  return INTERACTIVE_CLI_BY_PROVIDER.get(provider) ?? null;
}

function joinCommand(binary: string, args: string[]): string {
  return [binary, ...args].join(" ");
}

function appendResumeArgs(args: string[], spec: AgentInteractiveCliSpec, resumeSessionId?: string | null): string[] {
  const id = resumeSessionId?.trim();
  if (!id || !spec.resumeFlag) return args;
  return [...args, spec.resumeFlag, id];
}

/** Shell-safe path quoting (cmd.exe, PowerShell, bash). */
function shellQuote(value: string): string {
  return JSON.stringify(value);
}

function isWindowsAbsolutePath(path: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(path) || path.startsWith("\\\\");
}

/** Build a `cd` command compatible with Windows cmd and Unix shells. */
export function buildShellCdCommand(workDir: string): string {
  const trimmed = workDir.trim();
  const quoted = shellQuote(trimmed);
  if (isWindowsAbsolutePath(trimmed)) {
    return `cd /d ${quoted}`;
  }
  return `cd ${quoted}`;
}

/**
 * Build shell commands that launch the provider's interactive CLI.
 * Returns separate steps so the terminal can send cd and launch with Enter between them.
 */
export function buildAgentInteractiveCliLaunchSteps(input: {
  provider: string | null | undefined;
  workDir?: string | null;
  allPermissions?: boolean;
  resumeSessionId?: string | null;
}): string[] | null {
  const spec = resolveAgentInteractiveCli(input.provider);
  if (!spec) return null;

  let args =
    input.allPermissions && spec.allPermissionArgs.length > 0
      ? [...spec.allPermissionArgs]
      : [...spec.baseArgs];
  args = appendResumeArgs(args, spec, input.resumeSessionId);
  const launch = joinCommand(spec.binary, args);

  const steps: string[] = [];
  if (input.workDir?.trim()) {
    steps.push(buildShellCdCommand(input.workDir));
  }
  steps.push(launch);
  return steps;
}

/**
 * Build a shell command that launches the provider's interactive CLI.
 * When {@link allPermissions} is true, provider-specific trust / bypass flags
 * are appended (configured per project in Dev Studio).
 */
export function buildAgentInteractiveCliLaunch(input: {
  provider: string | null | undefined;
  workDir?: string | null;
  allPermissions?: boolean;
  resumeSessionId?: string | null;
}): string | null {
  const steps = buildAgentInteractiveCliLaunchSteps(input);
  if (!steps) return null;
  return steps.length === 1 ? steps[0]! : steps.join(" && ");
}

/** @deprecated Use {@link buildAgentInteractiveCliLaunch} */
export const buildAgentInteractiveCliShellLaunch = buildAgentInteractiveCliLaunch;
