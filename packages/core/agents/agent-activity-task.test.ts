import { describe, expect, it } from "vitest";
import {
  isAgentActivityTask,
  isDesignStudioTask,
  isDevStudioTask,
} from "./agent-activity-task";
import type { AgentTask } from "../types";

function task(partial: Partial<AgentTask>): AgentTask {
  return {
    id: "t1",
    agent_id: "a1",
    runtime_id: "r1",
    issue_id: "",
    status: "running",
    priority: 0,
    dispatched_at: null,
    started_at: null,
    completed_at: null,
    result: null,
    error: null,
    created_at: "2026-01-01T00:00:00Z",
    ...partial,
  };
}

describe("isDesignStudioTask", () => {
  it("detects design kind and design_mode", () => {
    expect(isDesignStudioTask(task({ kind: "design" }))).toBe(true);
    expect(isDesignStudioTask(task({ design_mode: "prototype" }))).toBe(true);
    expect(isDesignStudioTask(task({ chat_session_id: "s1" }))).toBe(false);
  });
});

describe("isDevStudioTask", () => {
  it("detects dev kind", () => {
    expect(isDevStudioTask(task({ kind: "dev" }))).toBe(true);
    expect(isDevStudioTask(task({ chat_session_id: "s1", kind: "chat" }))).toBe(false);
  });
});

describe("isAgentActivityTask", () => {
  it("includes design studio chat tasks but hides regular chat tasks", () => {
    expect(
      isAgentActivityTask(
        task({ chat_session_id: "s1", kind: "design", design_mode: "prototype" }),
      ),
    ).toBe(true);
    expect(
      isAgentActivityTask(task({ chat_session_id: "s1", kind: "dev" })),
    ).toBe(true);
    expect(isAgentActivityTask(task({ chat_session_id: "s1", kind: "chat" }))).toBe(false);
    expect(isAgentActivityTask(task({ issue_id: "i1" }))).toBe(true);
  });
});
