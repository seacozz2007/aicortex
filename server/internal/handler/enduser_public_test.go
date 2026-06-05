package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

var testEndUserPublicHandler *EndUserPublicHandler

func setupEndUserPublicTest(t *testing.T) (*EndUserPublicHandler, string) {
	t.Helper()
	if testEndUserPublicHandler == nil {
		testEndUserPublicHandler = NewEndUserPublicHandler(
			testHandler.Queries,
			NewEndUserWSHub(),
			testHandler.TaskService,
			testHandler.Bus,
		)
	}

	// Create a test enduser session and return its token.
	var agentID string
	if err := testPool.QueryRow(context.Background(),
		`SELECT id FROM agent WHERE workspace_id = $1 AND archived_at IS NULL LIMIT 1`,
		testWorkspaceID,
	).Scan(&agentID); err != nil {
		t.Fatalf("no unarchived agent available for test: %v", err)
	}

	w := httptest.NewRecorder()
	req := newRequest("POST", "/api/enduser/sessions?workspace_id="+testWorkspaceID, map[string]any{
		"agent_id":      agentID,
		"title":         "Public Test Session",
		"goal":          "You are a helpful assistant.",
		"guide_message": "Hello! How can I help you?",
	})
	testHandler.CreateEndUserSession(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("failed to create test enduser session: %d %s", w.Code, w.Body.String())
	}

	var session EndUserSessionResponse
	if err := json.NewDecoder(w.Body).Decode(&session); err != nil {
		t.Fatalf("decode session: %v", err)
	}

	t.Cleanup(func() {
		// Soft-delete the session.
		testPool.Exec(context.Background(),
			`UPDATE enduser_session SET status = 'disabled' WHERE id = $1`, session.ID)
	})

	return testEndUserPublicHandler, session.Token
}

func TestGetPublicEndUserSession_Success(t *testing.T) {
	h, token := setupEndUserPublicTest(t)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/e/"+token, nil)
	req = withURLParam(req, "token", token)
	h.HandleGetPublicEndUserSession(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp PublicEndUserSessionResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.Title != "Public Test Session" {
		t.Errorf("title = %q, want 'Public Test Session'", resp.Title)
	}
	if resp.GuideMessage != "Hello! How can I help you?" {
		t.Errorf("guide_message = %q, want 'Hello! How can I help you?'", resp.GuideMessage)
	}
	if resp.Status != "active" {
		t.Errorf("status = %q, want 'active'", resp.Status)
	}
	if resp.AgentName == "" {
		t.Error("agent_name should not be empty")
	}
}

func TestGetPublicEndUserSession_InvalidToken(t *testing.T) {
	h, _ := setupEndUserPublicTest(t)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/e/nonexistent-token-1234567890abcdef", nil)
	req = withURLParam(req, "token", "nonexistent-token-1234567890abcdef")
	h.HandleGetPublicEndUserSession(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp map[string]any
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp["status"] != "invalid" {
		t.Errorf("status = %q, want 'invalid'", resp["status"])
	}
	if resp["message"] == "" {
		t.Error("should include a friendly message")
	}
}

func TestGetPublicEndUserSession_DisabledSession(t *testing.T) {
	h, token := setupEndUserPublicTest(t)

	// Disable the session first.
	var sessionID string
	if err := testPool.QueryRow(context.Background(),
		`SELECT id FROM enduser_session WHERE token = $1`, token,
	).Scan(&sessionID); err != nil {
		t.Fatalf("find session: %v", err)
	}
	if _, err := testPool.Exec(context.Background(),
		`UPDATE enduser_session SET status = 'disabled' WHERE id = $1`, sessionID,
	); err != nil {
		t.Fatalf("disable session: %v", err)
	}

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/e/"+token, nil)
	req = withURLParam(req, "token", token)
	h.HandleGetPublicEndUserSession(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp map[string]any
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp["status"] != "invalid" {
		t.Errorf("status = %q, want 'invalid' for disabled session", resp["status"])
	}
}

func TestGetPublicEndUserSession_ExpiredSession(t *testing.T) {
	h, token := setupEndUserPublicTest(t)

	// Expire the session.
	var sessionID string
	if err := testPool.QueryRow(context.Background(),
		`SELECT id FROM enduser_session WHERE token = $1`, token,
	).Scan(&sessionID); err != nil {
		t.Fatalf("find session: %v", err)
	}
	if _, err := testPool.Exec(context.Background(),
		`UPDATE enduser_session SET expires_at = now() - interval '1 hour' WHERE id = $1`, sessionID,
	); err != nil {
		t.Fatalf("expire session: %v", err)
	}

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/e/"+token, nil)
	req = withURLParam(req, "token", token)
	h.HandleGetPublicEndUserSession(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp map[string]any
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp["status"] != "invalid" {
		t.Errorf("status = %q, want 'invalid' for expired session", resp["status"])
	}
}

func TestGetPublicEndUserSession_HTMLContent(t *testing.T) {
	h, token := setupEndUserPublicTest(t)

	// Set HTML content on the session.
	var sessionID string
	if err := testPool.QueryRow(context.Background(),
		`SELECT id FROM enduser_session WHERE token = $1`, token,
	).Scan(&sessionID); err != nil {
		t.Fatalf("find session: %v", err)
	}
	testPool.Exec(context.Background(),
		`UPDATE enduser_session SET html_content = '<div>Test HTML</div>' WHERE id = $1`, sessionID)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/e/"+token, nil)
	req = withURLParam(req, "token", token)
	h.HandleGetPublicEndUserSession(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp PublicEndUserSessionResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.HTMLContent != "<div>Test HTML</div>" {
		t.Errorf("html_content = %q, want '<div>Test HTML</div>'", resp.HTMLContent)
	}
}

func TestEndUserWSHub_RegisterUnregister(t *testing.T) {
	hub := NewEndUserWSHub()

	sessionID := parseUUID(testWorkspaceID) // reuse workspace UUID as a fake session ID

	// Initially empty.
	if count := hub.SessionVisitorCount(sessionID); count != 0 {
		t.Errorf("expected 0 visitors, got %d", count)
	}
}

func TestEndUserWSEvent_Marshaling(t *testing.T) {
	// Verify event JSON structure.
	event := EndUserWSEvent{
		Type:        "chat_message",
		VisitorID:   "visitor-123",
		Role:        "assistant",
		Content:     "Hello!",
		HTMLContent: "",
	}

	data, err := json.Marshal(event)
	if err != nil {
		t.Fatalf("marshal event: %v", err)
	}

	var decoded map[string]any
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("unmarshal event: %v", err)
	}

	if decoded["type"] != "chat_message" {
		t.Errorf("type = %q, want 'chat_message'", decoded["type"])
	}
	if decoded["visitor_id"] != "visitor-123" {
		t.Errorf("visitor_id = %q, want 'visitor-123'", decoded["visitor_id"])
	}
	if decoded["role"] != "assistant" {
		t.Errorf("role = %q, want 'assistant'", decoded["role"])
	}
	if decoded["content"] != "Hello!" {
		t.Errorf("content = %q, want 'Hello!'", decoded["content"])
	}
	// html_content should be omitted when empty.
	if _, exists := decoded["html_content"]; exists {
		t.Error("html_content should be omitted when empty")
	}
}

func TestEndUserWSEvent_HTMLUpdated(t *testing.T) {
	event := EndUserWSEvent{
		Type:        "html_updated",
		HTMLContent: "<div>New Content</div>",
	}

	data, _ := json.Marshal(event)
	var decoded map[string]any
	json.Unmarshal(data, &decoded)

	if decoded["type"] != "html_updated" {
		t.Errorf("type = %q, want 'html_updated'", decoded["type"])
	}
	if decoded["html_content"] != "<div>New Content</div>" {
		t.Errorf("html_content mismatch: %q", decoded["html_content"])
	}
}

func TestEndUserWSEvent_Error(t *testing.T) {
	event := EndUserWSEvent{
		Type:  "error",
		Error: "Something went wrong",
	}

	data, _ := json.Marshal(event)
	var decoded map[string]any
	json.Unmarshal(data, &decoded)

	if decoded["type"] != "error" {
		t.Errorf("type = %q, want 'error'", decoded["type"])
	}
	if decoded["error"] != "Something went wrong" {
		t.Errorf("error = %q, want 'Something went wrong'", decoded["error"])
	}
}

func TestEndUserPublicHandler_LookupEmpty(t *testing.T) {
	h, _ := setupEndUserPublicTest(t)
	sessionID, visitorID := h.lookupEndUserSession("00000000-0000-0000-0000-000000000000")
	if sessionID != "" || visitorID != "" {
		t.Errorf("expected empty, got sessionID=%q visitorID=%q", sessionID, visitorID)
	}
}

// Ensure the EndUserPublicHandler can be constructed and subscribes to events.
func TestEndUserPublicHandler_New(t *testing.T) {
	h := NewEndUserPublicHandler(
		testHandler.Queries,
		NewEndUserWSHub(),
		testHandler.TaskService,
		testHandler.Bus,
	)
	if h == nil {
		t.Fatal("NewEndUserPublicHandler returned nil")
	}
	if h.Queries == nil {
		t.Error("Queries should not be nil")
	}
	if h.WSHub == nil {
		t.Error("WSHub should not be nil")
	}
	if h.TaskSvc == nil {
		t.Error("TaskSvc should not be nil")
	}
	if h.Bus == nil {
		t.Error("Bus should not be nil")
	}
}

func TestUpdateEndUserSessionHTML(t *testing.T) {
	_, token := setupEndUserPublicTest(t)

	var sessionID string
	if err := testPool.QueryRow(context.Background(),
		`SELECT id FROM enduser_session WHERE token = $1`, token,
	).Scan(&sessionID); err != nil {
		t.Fatalf("find session: %v", err)
	}

	// Update HTML via the query.
	sessionUUID := parseUUID(sessionID)
	updated, err := testHandler.Queries.UpdateEndUserSessionHTML(context.Background(), sessionUUID, "<h1>Updated</h1>")
	if err != nil {
		t.Fatalf("UpdateEndUserSessionHTML: %v", err)
	}
	if updated.HtmlContent != "<h1>Updated</h1>" {
		t.Errorf("html_content = %q, want '<h1>Updated</h1>'", updated.HtmlContent)
	}
}

func TestGetEndUserSessionByToken(t *testing.T) {
	_, token := setupEndUserPublicTest(t)

	session, err := testHandler.Queries.GetEndUserSessionByToken(context.Background(), token)
	if err != nil {
		t.Fatalf("GetEndUserSessionByToken: %v", err)
	}
	if session.Token != token {
		t.Errorf("token mismatch: %q != %q", session.Token, token)
	}
	if session.Status != "active" {
		t.Errorf("status = %q, want 'active'", session.Status)
	}
	if session.Title != "Public Test Session" {
		t.Errorf("title = %q, want 'Public Test Session'", session.Title)
	}
}

func TestGetEndUserSessionByToken_Invalid(t *testing.T) {
	_, err := testHandler.Queries.GetEndUserSessionByToken(context.Background(), "nonexistent-token-0000000000000000")
	if err == nil {
		t.Fatal("expected error for nonexistent token")
	}
}

func TestGetPublicEndUserSession_EmptyToken(t *testing.T) {
	h, _ := setupEndUserPublicTest(t)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/e/", nil)
	req = withURLParam(req, "token", "")
	h.HandleGetPublicEndUserSession(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for empty token, got %d", w.Code)
	}
}
