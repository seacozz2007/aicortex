import { describe, expect, it } from "vitest";
import {
  appendTerminalDetectBuffer,
  extractAgentSessionIdFromTerminalOutput,
} from "./terminal-session-detect";

describe("extractAgentSessionIdFromTerminalOutput", () => {
  it("reads labeled session ids", () => {
    expect(
      extractAgentSessionIdFromTerminalOutput(
        "kiro",
        "Started chat\nSession ID: kiro-sess-42\n>",
      ),
    ).toBe("kiro-sess-42");
  });

  it("reads resume-id labels", () => {
    expect(
      extractAgentSessionIdFromTerminalOutput(
        "cursor",
        "Resuming conversation resume-id=cursor-chat-9",
      ),
    ).toBe("cursor-chat-9");
  });

  it("falls back to uuid for claude", () => {
    const id = "550e8400-e29b-41d4-a716-446655440000";
    expect(
      extractAgentSessionIdFromTerminalOutput("claude", `Connected ${id} ready`),
    ).toBe(id);
  });
});

describe("appendTerminalDetectBuffer", () => {
  it("truncates from the front", () => {
    const next = appendTerminalDetectBuffer("aaaa", "bbbb");
    expect(next).toBe("aaaabbbb");
  });
});
