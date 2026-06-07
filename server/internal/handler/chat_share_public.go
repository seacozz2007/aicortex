package handler

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"path"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/aicortex/aicortex/server/internal/events"
	"github.com/aicortex/aicortex/server/internal/service"
	"github.com/aicortex/aicortex/server/internal/storage"
	"github.com/aicortex/aicortex/server/internal/util"
	db "github.com/aicortex/aicortex/server/pkg/db/generated"
	"github.com/aicortex/aicortex/server/pkg/protocol"
)

// ---------------------------------------------------------------------------
// Public handler struct
// ---------------------------------------------------------------------------

// ChatSharePublicHandler handles public (unauthenticated) chat share endpoints.
type ChatSharePublicHandler struct {
	Queries  *db.Queries
	WSHub    *ChatShareWSHub
	TaskSvc  *service.TaskService
	Bus      *events.Bus
	Storage  storage.Storage

	// sessionMap caches share_link_token -> visitor_id -> chat_session_id
	sessionMap map[string]map[string]pgtype.UUID
	smMu       sync.RWMutex

	// reverseMap caches chat_session_id -> (token, visitor_id) for event routing
	reverseMap map[string]chatShareSessionKey
	rmMu       sync.RWMutex
}

type chatShareSessionKey struct {
	Token     string
	VisitorID string
}

func NewChatSharePublicHandler(queries *db.Queries, taskSvc *service.TaskService, bus *events.Bus, store storage.Storage) *ChatSharePublicHandler {
	h := &ChatSharePublicHandler{
		Queries:    queries,
		WSHub:      NewChatShareWSHub(),
		TaskSvc:    taskSvc,
		Bus:        bus,
		Storage:    store,
		sessionMap: make(map[string]map[string]pgtype.UUID),
		reverseMap: make(map[string]chatShareSessionKey),
	}

	// Subscribe to chat events and forward to public visitors.
	bus.Subscribe(protocol.EventChatDone, func(e events.Event) {
		h.forwardChatDone(e)
	})
	bus.Subscribe(protocol.EventTaskMessage, func(e events.Event) {
		h.forwardTaskMessage(e)
	})

	return h
}

// ---------------------------------------------------------------------------
// GET /e/{token} — Public session info
// ---------------------------------------------------------------------------

type ChatSharePublicInfoResponse struct {
	Title            string `json:"title"`
	GuideMessage     string `json:"guide_message"`
	AgentName        string `json:"agent_name"`
	AgentAvatarURL   string `json:"agent_avatar_url"`
	Status           string `json:"status"`
	AllowNewSessions bool   `json:"allow_new_sessions"`
}

func (h *ChatSharePublicHandler) HandleGetInfo(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")

	link, err := h.Queries.GetChatShareLinkByToken(r.Context(), token)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{
			"status":  "invalid",
			"message": "This share link is not available.",
		})
		return
	}

	status := resolveShareLinkStatus(link)
	if status != "active" {
		writeJSON(w, http.StatusOK, map[string]any{
			"status":  status,
			"message": statusMessage(status),
		})
		return
	}

	agent, err := h.Queries.GetAgent(r.Context(), link.AgentID)
	if err != nil {
		slog.Warn("chat share: agent lookup failed", "agent_id", uuidToString(link.AgentID), "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load agent")
		return
	}

	writeJSON(w, http.StatusOK, ChatSharePublicInfoResponse{
		Title:            link.Title,
		GuideMessage:     link.GuideMessage,
		AgentName:        agent.Name,
		AgentAvatarURL:   agent.AvatarUrl.String,
		Status:           "active",
		AllowNewSessions: link.AllowNewSessions,
	})
}

// ---------------------------------------------------------------------------
// GET /e/{token}/sessions — List visitor sessions
// ---------------------------------------------------------------------------

func (h *ChatSharePublicHandler) HandleListSessions(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")
	visitorID := r.URL.Query().Get("visitor_id")
	if visitorID == "" {
		writeError(w, http.StatusBadRequest, "visitor_id is required")
		return
	}

	link, err := h.Queries.GetChatShareLinkByToken(r.Context(), token)
	if err != nil {
		writeError(w, http.StatusForbidden, "invalid token")
		return
	}

	status := resolveShareLinkStatus(link)
	if status != "active" {
		writeJSON(w, http.StatusOK, map[string]any{"sessions": []any{}, "status": status})
		return
	}

	// Get all chat sessions for this visitor.
	visitorSessions := h.getVisitorSessions(token, visitorID)
	type sessionInfo struct {
		ID        string `json:"id"`
		Title     string `json:"title"`
		UpdatedAt string `json:"updated_at"`
	}
	result := make([]sessionInfo, 0, len(visitorSessions))
	for _, csID := range visitorSessions {
		cs, err := h.Queries.GetChatSession(r.Context(), csID)
		if err != nil {
			continue
		}
		result = append(result, sessionInfo{
			ID:        uuidToString(cs.ID),
			Title:     cs.Title,
			UpdatedAt: timestampToString(cs.UpdatedAt),
		})
	}

	writeJSON(w, http.StatusOK, map[string]any{"sessions": result, "status": "active"})
}

// ---------------------------------------------------------------------------
// POST /e/{token}/sessions — Create a new visitor session
// ---------------------------------------------------------------------------

func (h *ChatSharePublicHandler) HandleCreateSession(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")

	var req struct {
		VisitorID string `json:"visitor_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.VisitorID == "" {
		writeError(w, http.StatusBadRequest, "visitor_id is required")
		return
	}

	link, err := h.Queries.GetChatShareLinkByToken(r.Context(), token)
	if err != nil {
		writeError(w, http.StatusForbidden, "invalid token")
		return
	}

	status := resolveShareLinkStatus(link)
	if status != "active" {
		writeError(w, http.StatusForbidden, statusMessage(status))
		return
	}

	if !link.AllowNewSessions {
		// If new sessions aren't allowed, return the existing one (or create the first).
		existing := h.getVisitorSessions(token, req.VisitorID)
		if len(existing) > 0 {
			cs, err := h.Queries.GetChatSession(r.Context(), existing[0])
			if err == nil {
				writeJSON(w, http.StatusOK, map[string]string{"id": uuidToString(cs.ID)})
				return
			}
		}
	}

	cs, err := h.getOrCreateChatSession(r.Context(), link, req.VisitorID)
	if err != nil {
		slog.Error("chat share: create session failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to create session")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]string{"id": uuidToString(cs.ID)})
}

// ---------------------------------------------------------------------------
// GET /e/{token}/sessions/{id}/messages — Message history
// ---------------------------------------------------------------------------

func (h *ChatSharePublicHandler) HandleGetMessages(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")
	sessionID := chi.URLParam(r, "id")

	_, err := h.Queries.GetChatShareLinkByToken(r.Context(), token)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"messages": []any{}, "status": "invalid"})
		return
	}

	csUUID, err := parsePublicUUID(sessionID)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"messages": []any{}, "status": "invalid"})
		return
	}

	messages, err := h.Queries.ListChatMessages(r.Context(), csUUID)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"messages": []any{}, "status": "error"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"messages": messages, "status": "active"})
}

// ---------------------------------------------------------------------------
// POST /e/{token}/upload — File upload
// ---------------------------------------------------------------------------

func (h *ChatSharePublicHandler) HandleUpload(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")

	link, err := h.Queries.GetChatShareLinkByToken(r.Context(), token)
	if err != nil {
		writeError(w, http.StatusForbidden, "invalid token")
		return
	}

	visitorID := r.FormValue("visitor_id")
	if visitorID == "" {
		writeError(w, http.StatusBadRequest, "visitor_id is required")
		return
	}

	cs, err := h.getOrCreateChatSession(r.Context(), link, visitorID)
	if err != nil {
		slog.Error("chat share: upload get/create session failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to create session")
		return
	}

	const maxUploadSize = 32 << 20
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadSize)
	if err := r.ParseMultipartForm(maxUploadSize); err != nil {
		writeError(w, http.StatusBadRequest, "file too large or invalid form")
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "missing file")
		return
	}
	defer file.Close()

	data, err := io.ReadAll(file)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to read file")
		return
	}

	contentType := header.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	workspaceID := uuidToString(link.WorkspaceID)
	filename := uuid.New().String() + path.Ext(header.Filename)
	key := "workspaces/" + workspaceID + "/" + filename

	linkURL, err := h.Storage.Upload(r.Context(), key, data, contentType, header.Filename)
	if err != nil {
		slog.Error("chat share: upload failed", "error", err)
		writeError(w, http.StatusInternalServerError, "upload failed")
		return
	}

	// Create a real attachment record.
	id, err := uuid.NewV7()
	if err != nil {
		slog.Error("chat share: uuid generation failed", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	attUUID := pgtype.UUID{Bytes: id, Valid: true}

	// Resolve the member who created the share link for uploader identity.
	member, err := h.Queries.GetMember(r.Context(), link.CreatedBy)
	if err != nil {
		slog.Error("chat share: get member for upload failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to resolve uploader")
		return
	}

	att, err := h.Queries.CreateAttachment(r.Context(), db.CreateAttachmentParams{
		ID:           attUUID,
		WorkspaceID:  link.WorkspaceID,
		UploaderType: "member",
		UploaderID:   member.ID,
		ChatSessionID: cs.ID,
		Filename:     header.Filename,
		ContentType:  contentType,
		SizeBytes:    int64(len(data)),
		Url:          linkURL,
	})
	if err != nil {
		slog.Error("chat share: create attachment record failed", "error", err)
		// File uploaded to S3 but DB record failed — still return the link.
		writeJSON(w, http.StatusOK, map[string]string{
			"id":   uuidToString(attUUID),
			"link": linkURL,
		})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"id":   uuidToString(att.ID),
		"link": linkURL,
	})
}

// ---------------------------------------------------------------------------
// WS /e/{token}/ws — WebSocket
// ---------------------------------------------------------------------------

var publicUpgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin:     func(r *http.Request) bool { return true },
}

// ChatShareWSIncoming is the message format from the public client.
type ChatShareWSIncoming struct {
	VisitorID     string   `json:"visitor_id"`
	SessionID     string   `json:"session_id,omitempty"`
	Message       string   `json:"message"`
	AttachmentIDs []string `json:"attachment_ids"`
}

// ChatShareWSOutgoing is the message format to the public client.
type ChatShareWSOutgoing struct {
	Type        string `json:"type"`
	VisitorID   string `json:"visitor_id,omitempty"`
	Role        string `json:"role,omitempty"`
	Content     string `json:"content,omitempty"`
	MessageType string `json:"message_type,omitempty"`
	TaskID      string `json:"task_id,omitempty"`
	ToolName    string `json:"tool_name,omitempty"`
	ToolInput   string `json:"tool_input,omitempty"`
	ToolOutput  string `json:"tool_output,omitempty"`
	ElapsedMs   *int64 `json:"elapsed_ms,omitempty"`
	Error       string `json:"error,omitempty"`
}

func (h *ChatSharePublicHandler) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")

	link, err := h.Queries.GetChatShareLinkByToken(r.Context(), token)
	if err != nil {
		writeError(w, http.StatusForbidden, "invalid token")
		return
	}

	status := resolveShareLinkStatus(link)
	if status != "active" {
		writeError(w, http.StatusForbidden, statusMessage(status))
		return
	}

	conn, err := publicUpgrader.Upgrade(w, r, nil)
	if err != nil {
		slog.Warn("chat share: ws upgrade failed", "error", err)
		return
	}

	h.WSHub.Register(token, conn)
	defer h.WSHub.Unregister(token, conn)

	// Read loop — handle incoming messages.
	for {
		_, raw, err := conn.ReadMessage()
		if err != nil {
			break
		}
		var msg ChatShareWSIncoming
		if err := json.Unmarshal(raw, &msg); err != nil || msg.VisitorID == "" || msg.Message == "" {
			conn.WriteJSON(ChatShareWSOutgoing{Type: "error", Error: "invalid message"})
			continue
		}
		h.handleVisitorMessage(token, link, &msg)
	}
}

func (h *ChatSharePublicHandler) handleVisitorMessage(
	token string,
	link db.ChatShareLink,
	msg *ChatShareWSIncoming,
) {
	ctx := context.Background()

	// Check max_uses before creating a new session.
	if link.MaxUses.Valid && link.UseCount >= link.MaxUses.Int32 {
		h.WSHub.SendToToken(token, ChatShareWSOutgoing{
			Type:  "error",
			Error: "Usage limit reached for this share link.",
		})
		return
	}

	var cs db.ChatSession
	// When the client sends a session_id, try to reuse it first.
	// This preserves sessions across server restarts where the
	// in-memory cache is cleared.
	if msg.SessionID != "" {
		csUUID, parseErr := parsePublicUUID(msg.SessionID)
		if parseErr == nil {
			existing, getErr := h.Queries.GetChatSession(ctx, csUUID)
			// Verify session belongs to the same workspace and agent as the link.
			if getErr == nil &&
				uuidToString(existing.WorkspaceID) == uuidToString(link.WorkspaceID) &&
				uuidToString(existing.AgentID) == uuidToString(link.AgentID) {
				cs = existing
			}
		}
	}
	if cs.ID == (pgtype.UUID{}) {
		cs2, createErr := h.getOrCreateChatSession(ctx, link, msg.VisitorID)
		if createErr != nil {
			slog.Error("chat share: ws get/create session failed", "error", createErr)
			h.WSHub.SendToToken(token, ChatShareWSOutgoing{
				Type:  "error",
				Error: "Failed to initialize chat session.",
			})
			return
		}
		cs = cs2
		// Restore the cached mapping so forwardTaskMessage can route events.
		h.smMu.Lock()
		if h.sessionMap[token] == nil {
			h.sessionMap[token] = make(map[string]pgtype.UUID)
		}
		h.sessionMap[token][msg.VisitorID] = cs.ID
		h.smMu.Unlock()
		h.rmMu.Lock()
		h.reverseMap[uuidToString(cs.ID)] = chatShareSessionKey{Token: token, VisitorID: msg.VisitorID}
		h.rmMu.Unlock()
	}

	// Persist user message.
	_, err := h.Queries.CreateChatMessage(ctx, db.CreateChatMessageParams{
		ChatSessionID: cs.ID,
		Role:          "user",
		Content:       msg.Message,
	})
	if err != nil {
		slog.Error("chat share: create message failed", "error", err)
		h.WSHub.SendToToken(token, ChatShareWSOutgoing{
			Type:  "error",
			Error: "Failed to process message.",
		})
		return
	}

	// Link attachments to the message.
	if len(msg.AttachmentIDs) > 0 {
		attIDs := make([]pgtype.UUID, 0, len(msg.AttachmentIDs))
		for _, raw := range msg.AttachmentIDs {
			u, err := parsePublicUUID(raw)
			if err != nil {
				continue
			}
			attIDs = append(attIDs, u)
		}
		if len(attIDs) > 0 {
			// We need the message ID — let's query the most recent user message.
			messages, err := h.Queries.ListChatMessages(ctx, cs.ID)
			if err == nil && len(messages) > 0 {
				lastMsg := messages[len(messages)-1]
				if err := h.Queries.LinkAttachmentsToChatMessage(ctx, db.LinkAttachmentsToChatMessageParams{
					ChatMessageID: lastMsg.ID,
					ChatSessionID: cs.ID,
					Column3:       attIDs,
				}); err != nil {
					slog.Warn("chat share: link attachments failed", "error", err)
				}
			}
		}
	}

	// Enqueue the chat task.
	_, err = h.TaskSvc.EnqueueChatTask(ctx, cs)
	if err != nil {
		slog.Error("chat share: enqueue task failed", "error", err)
		h.WSHub.SendToToken(token, ChatShareWSOutgoing{
			Type:  "error",
			Error: "Agent is currently unavailable.",
		})
		return
	}

	// Touch the session.
	if err := h.Queries.TouchChatSession(ctx, cs.ID); err != nil {
		slog.Warn("chat share: touch session failed", "error", err)
	}
}

// ---------------------------------------------------------------------------
// getOrCreateChatSession
// ---------------------------------------------------------------------------

func (h *ChatSharePublicHandler) getOrCreateChatSession(
	ctx context.Context,
	link db.ChatShareLink,
	visitorID string,
) (db.ChatSession, error) {
	// Fast path: check read cache first.
	h.smMu.RLock()
	if vm, ok := h.sessionMap[link.Token]; ok {
		if csID, ok2 := vm[visitorID]; ok2 {
			h.smMu.RUnlock()
			cs, err := h.Queries.GetChatSession(ctx, csID)
			if err == nil {
				return cs, nil
			}
			// Stale cache entry — fall through to create.
		} else {
			h.smMu.RUnlock()
		}
	} else {
		h.smMu.RUnlock()
	}

	// Slow path: create under write lock.
	h.smMu.Lock()
	defer h.smMu.Unlock()

	// Double-check after acquiring write lock.
	if h.sessionMap[link.Token] != nil {
		if csID, ok := h.sessionMap[link.Token][visitorID]; ok {
			cs, err := h.Queries.GetChatSession(ctx, csID)
			if err == nil {
				return cs, nil
			}
		}
	}

	// Resolve creator user ID from the member who created the share link.
	member, err := h.Queries.GetMember(ctx, link.CreatedBy)
	if err != nil {
		return db.ChatSession{}, err
	}

	cs, err := h.Queries.CreateChatSession(ctx, db.CreateChatSessionParams{
		WorkspaceID: link.WorkspaceID,
		AgentID:     link.AgentID,
		CreatorID:   member.UserID,
		Title:       link.Title + " - " + visitorID,
	})
	if err != nil {
		return db.ChatSession{}, err
	}

	// Inject agent instructions as system prompt.
	agent, err := h.Queries.GetAgent(ctx, link.AgentID)
	if err != nil {
		slog.Warn("chat share: get agent for instructions failed", "error", err)
	} else if agent.Instructions != "" {
		if _, err := h.Queries.CreateChatMessage(ctx, db.CreateChatMessageParams{
			ChatSessionID: cs.ID,
			Role:          "system",
			Content:       agent.Instructions,
		}); err != nil {
			slog.Warn("chat share: create system message failed", "error", err)
		}
	}

	// Cache the mapping.
	if h.sessionMap[link.Token] == nil {
		h.sessionMap[link.Token] = make(map[string]pgtype.UUID)
	}
	h.sessionMap[link.Token][visitorID] = cs.ID

	// Reverse map for event routing.
	csIDStr := uuidToString(cs.ID)
	h.rmMu.Lock()
	h.reverseMap[csIDStr] = chatShareSessionKey{Token: link.Token, VisitorID: visitorID}
	h.rmMu.Unlock()

	// Increment use count for the share link.
	_ = h.Queries.IncrementChatShareLinkUseCount(ctx, link.ID)

	return cs, nil
}

func (h *ChatSharePublicHandler) getVisitorSessions(token, visitorID string) []pgtype.UUID {
	h.smMu.RLock()
	defer h.smMu.RUnlock()

	var ids []pgtype.UUID
	if vm, ok := h.sessionMap[token]; ok {
		for vid, csID := range vm {
			if vid == visitorID {
				ids = append(ids, csID)
			}
		}
	}
	return ids
}

// ---------------------------------------------------------------------------
// Event forwarding
// ---------------------------------------------------------------------------

func (h *ChatSharePublicHandler) forwardChatDone(e events.Event) {
	chatSessionID := e.ChatSessionID
	if chatSessionID == "" {
		return
	}

	key := h.lookupReverse(chatSessionID)
	if key.Token == "" {
		return
	}

	payload, ok := e.Payload.(protocol.ChatDonePayload)
	if !ok {
		data, _ := json.Marshal(e.Payload)
		json.Unmarshal(data, &payload)
	}

	if payload.Content != "" {
		var elapsedMs *int64
		if payload.ElapsedMs > 0 {
			elapsedMs = &payload.ElapsedMs
		}
		h.WSHub.SendToToken(key.Token, ChatShareWSOutgoing{
			Type:      "message",
			VisitorID: key.VisitorID,
			Role:      "assistant",
			Content:   payload.Content,
			TaskID:    payload.TaskID,
			ElapsedMs: elapsedMs,
		})
	}
}

func (h *ChatSharePublicHandler) forwardTaskMessage(e events.Event) {
	payload, ok := e.Payload.(protocol.TaskMessagePayload)
	if !ok {
		data, _ := json.Marshal(e.Payload)
		json.Unmarshal(data, &payload)
	}

	chatSessionID := e.ChatSessionID
	if chatSessionID == "" {
		return
	}

	key := h.lookupReverse(chatSessionID)
	if key.Token == "" {
		return
	}

	out := ChatShareWSOutgoing{
		Type:        "task_message",
		VisitorID:   key.VisitorID,
		Role:        "assistant",
		Content:     payload.Content,
		TaskID:      payload.TaskID,
		MessageType: payload.Type,
	}
	if payload.Tool != "" {
		out.ToolName = payload.Tool
		if payload.Input != nil {
			if inputJSON, err := json.Marshal(payload.Input); err == nil {
				out.ToolInput = string(inputJSON)
			}
		}
		out.ToolOutput = payload.Output
	}

	h.WSHub.SendToToken(key.Token, out)
}

func (h *ChatSharePublicHandler) lookupReverse(chatSessionID string) chatShareSessionKey {
	h.rmMu.RLock()
	defer h.rmMu.RUnlock()
	return h.reverseMap[chatSessionID]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func resolveShareLinkStatus(link db.ChatShareLink) string {
	if link.Status == "disabled" {
		return "disabled"
	}
	if link.ExpiresAt.Valid && link.ExpiresAt.Time.Before(timeNow()) {
		return "expired"
	}
	if link.MaxUses.Valid && link.UseCount >= link.MaxUses.Int32 {
		return "max_reached"
	}
	return "active"
}

func statusMessage(status string) string {
	switch status {
	case "expired":
		return "This share link has expired."
	case "disabled":
		return "This share link has been disabled."
	case "max_reached":
		return "This share link has reached its usage limit."
	default:
		return "This share link is not available."
	}
}

// timeNow is a shim so tests can override it.
var timeNow = func() time.Time { return time.Now() }

func parsePublicUUID(s string) (pgtype.UUID, error) {
	return util.ParseUUID(s)
}
