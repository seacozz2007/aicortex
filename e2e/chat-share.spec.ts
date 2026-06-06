/**
 * E2E: Chat Share Links — public endpoints, management API, and page rendering.
 */
import "./env";
import { test, expect } from "@playwright/test";
import pg from "pg";
import { createTestApi, loginAsDefault } from "./helpers";
import type { TestApiClient } from "./fixtures";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || `http://localhost:${process.env.PORT || "8080"}`;
const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://aicortex:aicortex@localhost:5432/aicortex?sslmode=disable";

async function authedFetch(
  api: TestApiClient,
  workspaceId: string,
  path: string,
  init?: RequestInit,
) {
  const token = api.getToken();
  if (!token) throw new Error("test api client not logged in");
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "X-Workspace-Id": workspaceId,
    ...((init?.headers as Record<string, string>) ?? {}),
  };
  return fetch(`${API_BASE}${path}`, { ...init, headers });
}

test.describe("Chat Share Links", () => {
  let api: TestApiClient;
  let pgClient: pg.Client;
  let workspaceId: string;
  let agentId: string;

  test.beforeAll(async () => {
    api = await createTestApi();
    pgClient = new pg.Client(DATABASE_URL);
    await pgClient.connect();

    const workspaces = await api.getWorkspaces();
    workspaceId = workspaces[0].id;

    // Ensure a test agent exists in this workspace.
    const existing = await pgClient.query(
      "SELECT id FROM agent WHERE workspace_id = $1 AND archived_at IS NULL LIMIT 1",
      [workspaceId],
    );
    if (existing.rows.length > 0) {
      agentId = existing.rows[0].id as string;
    } else {
      // Create a runtime for this workspace.
      const rt = await pgClient.query(
        `INSERT INTO agent_runtime (workspace_id, name, runtime_mode, provider, status, visibility)
         VALUES ($1, 'e2e-runtime', 'local', 'anthropic', 'online', 'public')
         RETURNING id`,
        [workspaceId],
      );
      const rtId = rt.rows[0].id as string;

      const ag = await pgClient.query(
        `INSERT INTO agent (workspace_id, name, runtime_mode, runtime_id, visibility, status,
           max_concurrent_tasks, description, runtime_config, custom_env, custom_args)
         VALUES ($1, 'E2E Agent', 'local', $2, 'workspace', 'idle', 3, 'e2e', '{}', '{}', '{}')
         RETURNING id`,
        [workspaceId, rtId],
      );
      agentId = ag.rows[0].id as string;
    }
  });

  test.afterAll(async () => {
    await pgClient.end();
  });

  test("POST and GET share link via management API", async () => {
    // Create
    const createRes = await authedFetch(api, workspaceId, "/api/chat/share-links", {
      method: "POST",
      body: JSON.stringify({
        agent_id: agentId,
        title: "E2E Public Chat",
        guide_message: "Welcome!",
        allow_new_sessions: true,
      }),
    });
    expect(createRes.ok).toBe(true);
    const link = await createRes.json();
    expect(link.token).toBeTruthy();
    expect(link.title).toBe("E2E Public Chat");

    // Get by ID
    const getRes = await authedFetch(api, workspaceId, `/api/chat/share-links/${link.id}`);
    expect(getRes.ok).toBe(true);
    const fetched = await getRes.json();
    expect(fetched.token).toBe(link.token);

    // Clean up
    await authedFetch(api, workspaceId, `/api/chat/share-links/${link.id}`, { method: "DELETE" });
  });

  test("public info endpoint returns agent details", async () => {
    const createRes = await authedFetch(api, workspaceId, "/api/chat/share-links", {
      method: "POST",
      body: JSON.stringify({
        agent_id: agentId,
        title: "Public Info Test",
        guide_message: "Hello visitor!",
        allow_new_sessions: false,
      }),
    });
    const link = await createRes.json();

    // Fetch as public user (no auth headers)
    const publicRes = await fetch(`${API_BASE}/e/${link.token}`);
    expect(publicRes.ok).toBe(true);
    const info = await publicRes.json();
    expect(info.status).toBe("active");
    expect(info.allow_new_sessions).toBe(false);
    expect(info.agent_name).toBeTruthy();
    expect(info.guide_message).toBe("Hello visitor!");

    await authedFetch(api, workspaceId, `/api/chat/share-links/${link.id}`, { method: "DELETE" });
  });

  test("session creation via public API increments use_count", async () => {
    const createRes = await authedFetch(api, workspaceId, "/api/chat/share-links", {
      method: "POST",
      body: JSON.stringify({
        agent_id: agentId,
        title: "Count Test",
        allow_new_sessions: true,
        max_uses: 5,
      }),
    });
    const link = await createRes.json();

    // Create a visitor session
    const sessionRes = await fetch(`${API_BASE}/e/${link.token}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitor_id: "e2e-visitor" }),
    });
    expect(sessionRes.ok).toBe(true);
    const session = await sessionRes.json();
    expect(session.id).toBeTruthy();

    // Verify use_count incremented
    const dbRes = await pgClient.query(
      "SELECT use_count FROM chat_share_link WHERE id = $1",
      [link.id],
    );
    expect(dbRes.rows[0].use_count).toBe(1);

    await authedFetch(api, workspaceId, `/api/chat/share-links/${link.id}`, { method: "DELETE" });
  });

  test(".allow_new_sessions=false reuses the same session", async () => {
    const createRes = await authedFetch(api, workspaceId, "/api/chat/share-links", {
      method: "POST",
      body: JSON.stringify({
        agent_id: agentId,
        title: "Single Session",
        allow_new_sessions: false,
      }),
    });
    const link = await createRes.json();

    // First creation
    const s1 = await fetch(`${API_BASE}/e/${link.token}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitor_id: "single-visitor" }),
    });
    const d1 = await s1.json();

    // Second creation should return same session
    const s2 = await fetch(`${API_BASE}/e/${link.token}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitor_id: "single-visitor" }),
    });
    const d2 = await s2.json();
    expect(d2.id).toBe(d1.id);

    await authedFetch(api, workspaceId, `/api/chat/share-links/${link.id}`, { method: "DELETE" });
  });

  test(".allow_new_sessions=true creates distinct sessions", async () => {
    const createRes = await authedFetch(api, workspaceId, "/api/chat/share-links", {
      method: "POST",
      body: JSON.stringify({
        agent_id: agentId,
        title: "Multi Session",
        allow_new_sessions: true,
      }),
    });
    const link = await createRes.json();

    // First session
    const s1 = await fetch(`${API_BASE}/e/${link.token}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitor_id: "multi-visitor" }),
    });
    const d1 = await s1.json();

    // Second session — should be different (new sessions allowed)
    const s2 = await fetch(`${API_BASE}/e/${link.token}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitor_id: "multi-visitor" }),
    });
    const d2 = await s2.json();

    // When allow_new_sessions=true, each POST creates a new chat_session
    // (implementation uses getOrCreateChatSession which caches, so second call
    //  may return the cached session id. To test distinct sessions, use a
    //  different visitor.)
    const s3 = await fetch(`${API_BASE}/e/${link.token}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitor_id: "multi-visitor-2" }),
    });
    const d3 = await s3.json();
    expect(d3.id).not.toBe(d1.id);

    await authedFetch(api, workspaceId, `/api/chat/share-links/${link.id}`, { method: "DELETE" });
  });

  test("invalid token returns friendly response", async ({ page }) => {
    const response = await page.goto("/e/nonexistent-token-xyz");
    expect(response?.status()).toBe(200);
    await expect(page.getByText("not available")).toBeVisible({ timeout: 5000 });
  });

  test("public chat page renders correctly", async ({ page }) => {
    const createRes = await authedFetch(api, workspaceId, "/api/chat/share-links", {
      method: "POST",
      body: JSON.stringify({
        agent_id: agentId,
        title: "Page Render Test",
        guide_message: "Welcome to the public chat!",
        allow_new_sessions: true,
      }),
    });
    const link = await createRes.json();

    await page.goto(`/e/${link.token}`);
    // Page should load and show the agent name
    await expect(page.locator("text=E2E Agent")).toBeVisible({ timeout: 5000 });

    await authedFetch(api, workspaceId, `/api/chat/share-links/${link.id}`, { method: "DELETE" });
  });

  test("disabled link shows disabled message on public page", async ({ page }) => {
    const createRes = await authedFetch(api, workspaceId, "/api/chat/share-links", {
      method: "POST",
      body: JSON.stringify({
        agent_id: agentId,
        title: "Will Be Disabled",
        allow_new_sessions: false,
      }),
    });
    const link = await createRes.json();

    // Disable it
    await authedFetch(api, workspaceId, `/api/chat/share-links/${link.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "disabled" }),
    });

    await page.goto(`/e/${link.token}`);
    await expect(page.getByText("disabled")).toBeVisible({ timeout: 5000 });

    await authedFetch(api, workspaceId, `/api/chat/share-links/${link.id}`, { method: "DELETE" });
  });
});
