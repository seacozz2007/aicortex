import { describe, expect, it } from "vitest";
import { needsTerminalBootstrap, resolveAgentResumeId } from "./agent-resume";

describe("resolveAgentResumeId", () => {
  it("returns primary pointer when runtime matches", () => {
    expect(
      resolveAgentResumeId(
        { agent_session_id: "sess-1", runtime_id: "rt-1" },
        "rt-1",
      ),
    ).toBe("sess-1");
  });

  it("falls back to last task session id", () => {
    expect(
      resolveAgentResumeId(
        {
          runtime_id: "rt-1",
          last_task_agent_session_id: "task-sess-2",
        },
        "rt-1",
      ),
    ).toBe("task-sess-2");
  });

  it("returns null when runtime mismatches", () => {
    expect(
      resolveAgentResumeId(
        { agent_session_id: "sess-1", runtime_id: "rt-old" },
        "rt-new",
      ),
    ).toBeNull();
  });
});

describe("needsTerminalBootstrap", () => {
  it("bootstraps fresh terminals", () => {
    expect(needsTerminalBootstrap({ bootstrapped: false, ptyRecreated: false })).toBe(true);
  });

  it("re-bootstraps recreated pty", () => {
    expect(needsTerminalBootstrap({ bootstrapped: true, ptyRecreated: true })).toBe(true);
  });

  it("skips when pty is alive and already bootstrapped", () => {
    expect(needsTerminalBootstrap({ bootstrapped: true, ptyRecreated: false })).toBe(false);
  });
});
