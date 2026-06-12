import { describe, expect, it } from "vitest";
import {
  buildAgentInteractiveCliLaunch,
  buildAgentInteractiveCliLaunchSteps,
  buildShellCdCommand,
  resolveAgentInteractiveCli,
} from "./interactive-cli";

describe("resolveAgentInteractiveCli", () => {
  it("maps known providers", () => {
    expect(resolveAgentInteractiveCli("kiro")?.binary).toBe("kiro-cli");
    expect(resolveAgentInteractiveCli("claude")?.binary).toBe("claude");
  });

  it("returns null for unknown providers", () => {
    expect(resolveAgentInteractiveCli("unknown")).toBeNull();
  });
});

describe("buildAgentInteractiveCliLaunch", () => {
  it("builds kiro chat with optional all-permission flags", () => {
    const cmd = buildAgentInteractiveCliLaunch({
      provider: "kiro",
      allPermissions: true,
    });
    expect(cmd).toBe("kiro-cli chat --skip-dangerous-all --trust-all-tools");
  });

  it("builds kiro chat without flags by default", () => {
    const cmd = buildAgentInteractiveCliLaunch({ provider: "kiro" });
    expect(cmd).toBe("kiro-cli chat");
  });

  it("builds claude with dangerously-skip-permissions when enabled", () => {
    const cmd = buildAgentInteractiveCliLaunch({
      provider: "claude",
      allPermissions: true,
    });
    expect(cmd).toBe("claude --dangerously-skip-permissions");
  });

  it("prefixes work dir cd with double-quoted path", () => {
    const cmd = buildAgentInteractiveCliLaunch({
      provider: "claude",
      workDir: "/tmp/project",
    });
    expect(cmd).toBe('cd "/tmp/project" && claude');
  });

  it("uses cd /d for Windows absolute paths", () => {
    const path = "C:\\Users\\dev\\project";
    expect(buildShellCdCommand(path)).toBe(`cd /d ${JSON.stringify(path)}`);
  });

  it("returns separate launch steps", () => {
    const workDir = "C:\\repo";
    expect(
      buildAgentInteractiveCliLaunchSteps({
        provider: "claude",
        workDir,
      }),
    ).toEqual([`cd /d ${JSON.stringify(workDir)}`, "claude"]);
  });

  it("appends claude --resume when session id is provided", () => {
    expect(
      buildAgentInteractiveCliLaunch({
        provider: "claude",
        resumeSessionId: "sess-abc",
      }),
    ).toBe("claude --resume sess-abc");
  });

  it("appends kiro-cli --resume-id for kiro", () => {
    expect(
      buildAgentInteractiveCliLaunch({
        provider: "kiro",
        resumeSessionId: "kiro-sess",
      }),
    ).toBe("kiro-cli chat --resume-id kiro-sess");
  });

  it("appends cursor-agent --resume for cursor", () => {
    expect(
      buildAgentInteractiveCliLaunch({
        provider: "cursor",
        resumeSessionId: "cursor-sess",
      }),
    ).toBe("cursor-agent --resume cursor-sess");
  });
});
