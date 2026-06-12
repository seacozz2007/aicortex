import { describe, expect, it } from "vitest";
import {
  TERMINAL_SCOPES,
  findTerminalSessionForContext,
  type TerminalSession,
} from "./queries";

function session(partial: Partial<TerminalSession> & Pick<TerminalSession, "id">): TerminalSession {
  return {
    workspace_id: "ws",
    runtime_id: "rt",
    user_id: "user",
    scope: TERMINAL_SCOPES.DEFAULT,
    bootstrapped: false,
    title: "",
    status: "active",
    shell: "",
    cols: 80,
    rows: 24,
    created_at: "",
    last_attached_at: "",
    ...partial,
  };
}

describe("findTerminalSessionForContext", () => {
  it("matches chat session, scope, and runtime", () => {
    const sessions = [
      session({
        id: "a",
        chat_session_id: "chat-1",
        scope: TERMINAL_SCOPES.CLI_MAIN,
        runtime_id: "rt-1",
      }),
      session({
        id: "b",
        chat_session_id: "chat-1",
        scope: TERMINAL_SCOPES.DEFAULT,
        runtime_id: "rt-1",
      }),
    ];
    expect(
      findTerminalSessionForContext(sessions, {
        chatSessionId: "chat-1",
        runtimeId: "rt-1",
        scope: TERMINAL_SCOPES.CLI_MAIN,
      })?.id,
    ).toBe("a");
  });

  it("ignores closed sessions", () => {
    const sessions = [
      session({
        id: "closed",
        chat_session_id: "chat-1",
        status: "closed",
      }),
    ];
    expect(
      findTerminalSessionForContext(sessions, {
        chatSessionId: "chat-1",
        runtimeId: "rt",
      }),
    ).toBeNull();
  });
});
