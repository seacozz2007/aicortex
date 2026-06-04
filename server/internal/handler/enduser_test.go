package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// TestEndUserSessionCRUD tests the full lifecycle: create, get, list, update, delete.
func TestEndUserSessionCRUD(t *testing.T) {
	// Resolve the fixture agent ID.
	var agentID string
	if err := testPool.QueryRow(context.Background(),
		`SELECT id FROM agent WHERE workspace_id = $1 AND archived_at IS NULL LIMIT 1`,
		testWorkspaceID,
	).Scan(&agentID); err != nil {
		t.Fatalf("no unarchived agent available for test: %v", err)
	}

	// Create
	w := httptest.NewRecorder()
	req := newRequest("POST", "/api/enduser/sessions?workspace_id="+testWorkspaceID, map[string]any{
		"agent_id": agentID,
		"title":    "Test EndUser Session",
		"goal":     "Answer user questions",
	})
	testHandler.CreateEndUserSession(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("CreateEndUserSession: expected 201, got %d: %s", w.Code, w.Body.String())
	}

	var created EndUserSessionResponse
	if err := json.NewDecoder(w.Body).Decode(&created); err != nil {
		t.Fatalf("decode CreateEndUserSession: %v", err)
	}
	if created.Title != "Test EndUser Session" {
		t.Errorf("title = %q, want 'Test EndUser Session'", created.Title)
	}
	if created.Goal != "Answer user questions" {
		t.Errorf("goal = %q, want 'Answer user questions'", created.Goal)
	}
	if created.Token == "" {
		t.Error("token should not be empty")
	}
	if len(created.Token) != 32 {
		t.Errorf("token length = %d, want 32", len(created.Token))
	}
	if created.Status != "active" {
		t.Errorf("status = %q, want 'active'", created.Status)
	}
	sessionID := created.ID

	// Get
	w = httptest.NewRecorder()
	req = newRequest("GET", "/api/enduser/sessions/"+sessionID+"?workspace_id="+testWorkspaceID, nil)
	req = withURLParam(req, "id", sessionID)
	testHandler.GetEndUserSession(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("GetEndUserSession: expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var fetched EndUserSessionResponse
	if err := json.NewDecoder(w.Body).Decode(&fetched); err != nil {
		t.Fatalf("decode GetEndUserSession: %v", err)
	}
	if fetched.ID != sessionID {
		t.Errorf("id = %q, want %q", fetched.ID, sessionID)
	}
	if fetched.MessageCount == nil || *fetched.MessageCount != 0 {
		t.Errorf("message_count = %v, want 0", fetched.MessageCount)
	}
	if fetched.VisitorCount == nil || *fetched.VisitorCount != 0 {
		t.Errorf("visitor_count = %v, want 0", fetched.VisitorCount)
	}

	// List
	w = httptest.NewRecorder()
	req = newRequest("GET", "/api/enduser/sessions?workspace_id="+testWorkspaceID, nil)
	testHandler.ListEndUserSessions(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("ListEndUserSessions: expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var listResp struct {
		Sessions []EndUserSessionResponse `json:"sessions"`
		Total    int64                    `json:"total"`
	}
	if err := json.NewDecoder(w.Body).Decode(&listResp); err != nil {
		t.Fatalf("decode list: %v", err)
	}
	if listResp.Total < 1 {
		t.Errorf("total = %d, want at least 1", listResp.Total)
	}

	// Update
	w = httptest.NewRecorder()
	newTitle := "Updated EndUser Session"
	req = newRequest("PATCH", "/api/enduser/sessions/"+sessionID+"?workspace_id="+testWorkspaceID, map[string]any{
		"title": newTitle,
		"goal":  "Updated goal",
	})
	req = withURLParam(req, "id", sessionID)
	testHandler.UpdateEndUserSession(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("UpdateEndUserSession: expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var updated EndUserSessionResponse
	if err := json.NewDecoder(w.Body).Decode(&updated); err != nil {
		t.Fatalf("decode UpdateEndUserSession: %v", err)
	}
	if updated.Title != newTitle {
		t.Errorf("title = %q, want %q", updated.Title, newTitle)
	}
	if updated.Goal != "Updated goal" {
		t.Errorf("goal = %q, want 'Updated goal'", updated.Goal)
	}

	// Delete (soft delete -> status=disabled)
	w = httptest.NewRecorder()
	req = newRequest("DELETE", "/api/enduser/sessions/"+sessionID+"?workspace_id="+testWorkspaceID, nil)
	req = withURLParam(req, "id", sessionID)
	testHandler.DeleteEndUserSession(w, req)
	if w.Code != http.StatusNoContent {
		t.Fatalf("DeleteEndUserSession: expected 204, got %d: %s", w.Code, w.Body.String())
	}

	// Verify deleted (soft-delete: status should be disabled)
	w = httptest.NewRecorder()
	req = newRequest("GET", "/api/enduser/sessions/"+sessionID+"?workspace_id="+testWorkspaceID, nil)
	req = withURLParam(req, "id", sessionID)
	testHandler.GetEndUserSession(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("GetEndUserSession after delete: expected 200, got %d", w.Code)
	}
	var deleted EndUserSessionResponse
	if err := json.NewDecoder(w.Body).Decode(&deleted); err != nil {
		t.Fatalf("decode deleted session: %v", err)
	}
	if deleted.Status != "disabled" {
		t.Errorf("status after delete = %q, want 'disabled'", deleted.Status)
	}
}

// TestEndUserSessionRejectsArchivedAgent verifies that creating a session with
// an archived agent returns 400.
func TestEndUserSessionRejectsArchivedAgent(t *testing.T) {
	// Create an agent and then archive it.
	ctx := context.Background()
	agentID := createHandlerTestAgent(t, "Handler EndUser Archived", nil)
	if _, err := testPool.Exec(ctx, `UPDATE agent SET archived_at = now() WHERE id = $1`, agentID); err != nil {
		t.Fatalf("archive agent: %v", err)
	}

	w := httptest.NewRecorder()
	req := newRequest("POST", "/api/enduser/sessions?workspace_id="+testWorkspaceID, map[string]any{
		"agent_id": agentID,
		"title":    "Should fail",
	})
	testHandler.CreateEndUserSession(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("CreateEndUserSession with archived agent: expected 400, got %d: %s", w.Code, w.Body.String())
	}
}

// TestEndUserSessionRejectsNonexistentAgent verifies that a non-existent agent returns 400.
func TestEndUserSessionRejectsNonexistentAgent(t *testing.T) {
	w := httptest.NewRecorder()
	req := newRequest("POST", "/api/enduser/sessions?workspace_id="+testWorkspaceID, map[string]any{
		"agent_id": "00000000-0000-0000-0000-000000000000",
		"title":    "Should fail",
	})
	testHandler.CreateEndUserSession(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("CreateEndUserSession with nonexistent agent: expected 400, got %d: %s", w.Code, w.Body.String())
	}
}

// TestEndUserSessionRejectsPastExpiresAt verifies expires_at validation.
func TestEndUserSessionRejectsPastExpiresAt(t *testing.T) {
	var agentID string
	if err := testPool.QueryRow(context.Background(),
		`SELECT id FROM agent WHERE workspace_id = $1 AND archived_at IS NULL LIMIT 1`,
		testWorkspaceID,
	).Scan(&agentID); err != nil {
		t.Fatalf("no agent available: %v", err)
	}

	w := httptest.NewRecorder()
	req := newRequest("POST", "/api/enduser/sessions?workspace_id="+testWorkspaceID, map[string]any{
		"agent_id":   agentID,
		"title":      "Past expires",
		"expires_at": "2020-01-01T00:00:00Z",
	})
	testHandler.CreateEndUserSession(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("CreateEndUserSession with past expires_at: expected 400, got %d: %s", w.Code, w.Body.String())
	}
}

// TestEndUserSessionTokenRegeneration generates a new token and verifies the old one is replaced.
func TestEndUserSessionTokenRegeneration(t *testing.T) {
	var agentID string
	if err := testPool.QueryRow(context.Background(),
		`SELECT id FROM agent WHERE workspace_id = $1 AND archived_at IS NULL LIMIT 1`,
		testWorkspaceID,
	).Scan(&agentID); err != nil {
		t.Fatalf("no agent available: %v", err)
	}

	w := httptest.NewRecorder()
	req := newRequest("POST", "/api/enduser/sessions?workspace_id="+testWorkspaceID, map[string]any{
		"agent_id": agentID,
		"title":    "Token regenerate test",
	})
	testHandler.CreateEndUserSession(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("CreateEndUserSession: expected 201, got %d: %s", w.Code, w.Body.String())
	}
	var created EndUserSessionResponse
	if err := json.NewDecoder(w.Body).Decode(&created); err != nil {
		t.Fatalf("decode: %v", err)
	}
	oldToken := created.Token
	sessionID := created.ID

	// Regenerate token
	w = httptest.NewRecorder()
	req = newRequest("POST", "/api/enduser/sessions/"+sessionID+"/regenerate-token?workspace_id="+testWorkspaceID, nil)
	req = withURLParam(req, "id", sessionID)
	testHandler.RegenerateEndUserToken(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("RegenerateEndUserToken: expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var regenerated EndUserSessionResponse
	if err := json.NewDecoder(w.Body).Decode(&regenerated); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if regenerated.Token == oldToken {
		t.Error("token should have changed after regeneration")
	}
	if regenerated.Token == "" || len(regenerated.Token) != 32 {
		t.Errorf("new token is invalid: %q", regenerated.Token)
	}

	// Cleanup
	w = httptest.NewRecorder()
	req = newRequest("DELETE", "/api/enduser/sessions/"+sessionID+"?workspace_id="+testWorkspaceID, nil)
	req = withURLParam(req, "id", sessionID)
	testHandler.DeleteEndUserSession(w, req)
}

// TestEndUserSessionListFiltering tests status filtering in the list endpoint.
func TestEndUserSessionListFiltering(t *testing.T) {
	var agentID string
	if err := testPool.QueryRow(context.Background(),
		`SELECT id FROM agent WHERE workspace_id = $1 AND archived_at IS NULL LIMIT 1`,
		testWorkspaceID,
	).Scan(&agentID); err != nil {
		t.Fatalf("no agent available: %v", err)
	}

	createSession := func(title string) string {
		w := httptest.NewRecorder()
		req := newRequest("POST", "/api/enduser/sessions?workspace_id="+testWorkspaceID, map[string]any{
			"agent_id": agentID,
			"title":    title,
		})
		testHandler.CreateEndUserSession(w, req)
		if w.Code != http.StatusCreated {
			t.Fatalf("CreateEndUserSession(%s): %d %s", title, w.Code, w.Body.String())
		}
		var created EndUserSessionResponse
		json.NewDecoder(w.Body).Decode(&created)
		return created.ID
	}

	deleteSession := func(id string) {
		w := httptest.NewRecorder()
		req := newRequest("DELETE", "/api/enduser/sessions/"+id+"?workspace_id="+testWorkspaceID, nil)
		req = withURLParam(req, "id", id)
		testHandler.DeleteEndUserSession(w, req)
	}

	activeID := createSession("Active session")
	deleteSession(createSession("To be disabled"))
	defer func() {
		deleteSession(activeID)
	}()

	// List only active
	w := httptest.NewRecorder()
	req := newRequest("GET", "/api/enduser/sessions?workspace_id="+testWorkspaceID+"&status=active", nil)
	testHandler.ListEndUserSessions(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("ListEndUserSessions(active): %d %s", w.Code, w.Body.String())
	}
	var activeResp struct {
		Sessions []EndUserSessionResponse `json:"sessions"`
		Total    int64                    `json:"total"`
	}
	json.NewDecoder(w.Body).Decode(&activeResp)
	for _, s := range activeResp.Sessions {
		if s.Status != "active" {
			t.Errorf("expected only active sessions, got status=%q for %s", s.Status, s.Title)
		}
	}

	// List only disabled
	w = httptest.NewRecorder()
	req = newRequest("GET", "/api/enduser/sessions?workspace_id="+testWorkspaceID+"&status=disabled", nil)
	testHandler.ListEndUserSessions(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("ListEndUserSessions(disabled): %d %s", w.Code, w.Body.String())
	}
	var disabledResp struct {
		Sessions []EndUserSessionResponse `json:"sessions"`
		Total    int64                    `json:"total"`
	}
	json.NewDecoder(w.Body).Decode(&disabledResp)
	for _, s := range disabledResp.Sessions {
		if s.Status != "disabled" {
			t.Errorf("expected only disabled sessions, got status=%q for %s", s.Status, s.Title)
		}
	}
}

// TestEndUserSessionRejectsMalformedID verifies UUID validation on URL params.
func TestEndUserSessionRejectsMalformedID(t *testing.T) {
	w := httptest.NewRecorder()
	req := newRequest("GET", "/api/enduser/sessions/not-a-uuid?workspace_id="+testWorkspaceID, nil)
	req = withURLParam(req, "id", "not-a-uuid")
	testHandler.GetEndUserSession(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("GetEndUserSession with malformed id: expected 400, got %d: %s", w.Code, w.Body.String())
	}
}
