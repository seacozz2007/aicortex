const SESSION_ID_LABEL =
  /(?:session[\s_-]*id|resume[\s_-]*(?:id)?|chat[\s_-]*id|conversation[\s_-]*id)\s*[:=]\s*["']?([a-zA-Z0-9][a-zA-Z0-9._-]{7,127})/gi;

const UUID =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

function lastMatch(text: string, pattern: RegExp): string | null {
  let match: RegExpExecArray | null = null;
  let found: string | null = null;
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const re = new RegExp(pattern.source, flags);
  while ((match = re.exec(text)) !== null) {
    found = match[1] ?? match[0];
  }
  return found?.trim() || null;
}

function normalizeProvider(provider: string | null | undefined): string {
  return provider?.trim().toLowerCase() ?? "";
}

/**
 * Best-effort extraction of an agent session id from interactive CLI scrollback.
 * Returns the most recently observed candidate.
 */
export function extractAgentSessionIdFromTerminalOutput(
  provider: string | null | undefined,
  text: string,
): string | null {
  const labeled = lastMatch(text, SESSION_ID_LABEL);
  if (labeled) return labeled;

  const slug = normalizeProvider(provider);
  if (slug === "claude" || slug === "cursor" || slug === "copilot" || slug === "gemini") {
    const uuid = lastMatch(text, UUID);
    if (uuid) return uuid.toLowerCase();
  }

  return null;
}

export const TERMINAL_SESSION_DETECT_BUFFER_LIMIT = 16 * 1024;

export function appendTerminalDetectBuffer(current: string, chunk: string): string {
  const combined = `${current}${chunk}`;
  if (combined.length <= TERMINAL_SESSION_DETECT_BUFFER_LIMIT) return combined;
  return combined.slice(combined.length - TERMINAL_SESSION_DETECT_BUFFER_LIMIT);
}
