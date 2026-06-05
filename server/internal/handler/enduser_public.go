package handler

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"sync"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/aicortex/aicortex/server/internal/events"
	"github.com/aicortex/aicortex/server/internal/service"
	"github.com/aicortex/aicortex/server/internal/util"
	db "github.com/aicortex/aicortex/server/pkg/db/generated"
	"github.com/aicortex/aicortex/server/pkg/protocol"
)

// EndUserPublicHandler handles public (non-authenticated) enduser endpoints.
type EndUserPublicHandler struct {
	Queries  *db.Queries
	WSHub    *EndUserWSHub
	TaskSvc  *service.TaskService
	Bus      *events.Bus

	// chatSessionMap tracks enduser_session_id -> visitor_id -> chat_session_id
	chatSessionMap map[string]map[string]pgtype.UUID
	csMu           sync.RWMutex
}

// NewEndUserPublicHandler creates a new public enduser handler and subscribes to
// chat:done events so agent replies are forwarded to enduser WS visitors.
func NewEndUserPublicHandler(queries *db.Queries, wsHub *EndUserWSHub, taskSvc *service.TaskService, bus *events.Bus) *EndUserPublicHandler {
	h := &EndUserPublicHandler{
		Queries:        queries,
		WSHub:          wsHub,
		TaskSvc:        taskSvc,
		Bus:            bus,
		chatSessionMap: make(map[string]map[string]pgtype.UUID),
	}

	bus.Subscribe(protocol.EventChatDone, func(e events.Event) {
		h.handleChatDone(e)
	})
	bus.Subscribe(protocol.EventTaskMessage, func(e events.Event) {
		h.handleTaskMessage(e)
	})

	return h
}

// ---------------------------------------------------------------------------
// GET /e/:token — Public session info
// ---------------------------------------------------------------------------

// PublicEndUserSessionResponse is returned by the public GET endpoint.
type PublicEndUserSessionResponse struct {
	Title        string `json:"title"`
	GuideMessage string `json:"guide_message"`
	AgentName    string `json:"agent_name"`
	AgentAvatar  string `json:"agent_avatar_url"`
	HTMLContent  string `json:"html_content"`
	Status       string `json:"status"`
}

// HandleGetPublicEndUserSession returns session info for a valid token.
func (h *EndUserPublicHandler) HandleGetPublicEndUserSession(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")
	if token == "" {
		writeError(w, http.StatusBadRequest, "token is required")
		return
	}

	session, err := h.Queries.GetEndUserSessionByToken(r.Context(), token)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeJSON(w, http.StatusOK, map[string]any{
				"status":  "invalid",
				"message": "This session is not available. It may have expired or been disabled.",
			})
			return
		}
		slog.Warn("GetPublicEndUserSession failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load session")
		return
	}

	agent, err := h.Queries.GetAgent(r.Context(), session.AgentID)
	if err != nil {
		slog.Warn("GetPublicEndUserSession: agent lookup failed", "agent_id", uuidToString(session.AgentID), "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load agent")
		return
	}

	resp := PublicEndUserSessionResponse{
		Title:        session.Title,
		GuideMessage: session.GuideMessage,
		AgentName:    agent.Name,
		AgentAvatar:  agent.AvatarUrl.String,
		HTMLContent:  session.HtmlContent,
		Status:       "active",
	}
	writeJSON(w, http.StatusOK, resp)
}

// ---------------------------------------------------------------------------
// WS /e/:token/ws — Public WebSocket for real-time chat
// ---------------------------------------------------------------------------

// HandleEndUserWebSocket handles the public WebSocket upgrade for enduser sessions.
func (h *EndUserPublicHandler) HandleEndUserWebSocket(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")
	if token == "" {
		writeError(w, http.StatusBadRequest, "token is required")
		return
	}

	session, err := h.Queries.GetEndUserSessionByToken(r.Context(), token)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// Return a friendly WS close message before closing
			writeJSON(w, http.StatusOK, map[string]any{
				"status":  "invalid",
				"message": "This session is not available.",
			})
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to load session")
		return
	}

	h.WSHub.UpgradeHandleWebSocket(w, r, session.ID, token, func(client *enduserWSClient, msg EndUserWSIncoming) {
		h.handleVisitorMessage(client, session, msg)
	})
}

func (h *EndUserPublicHandler) handleVisitorMessage(
	client *enduserWSClient,
	session db.EnduserSession,
	msg EndUserWSIncoming,
) {
	ctx := context.Background()

	// Check message limit.
	if session.MaxMessages.Valid {
		count, err := h.Queries.CountEndUserSessionMessages(ctx, session.ID)
		if err != nil {
			slog.Warn("enduser ws: count messages failed", "error", err)
		} else if count >= int64(session.MaxMessages.Int32) {
			h.WSHub.SendToVisitor(session.ID, msg.VisitorID, EndUserWSEvent{
				Type:  "error",
				Error: "Message limit reached for this session.",
			})
			return
		}
	}

	// Persist the user message.
	_, err := h.Queries.CreateEndUserMessage(ctx, db.CreateEndUserMessageParams{
		SessionID: session.ID,
		VisitorID: msg.VisitorID,
		Role:      "user",
		Content:   msg.Message,
	})
	if err != nil {
		slog.Warn("enduser ws: create message failed", "error", err)
		h.WSHub.SendToVisitor(session.ID, msg.VisitorID, EndUserWSEvent{
			Type:  "error",
			Error: "Failed to process message.",
		})
		return
	}

	// Get or create a chat session for this visitor.
	chatSession, err := h.getOrCreateChatSession(ctx, session, msg.VisitorID)
	if err != nil {
		slog.Warn("enduser ws: get or create chat session failed", "error", err)
		h.WSHub.SendToVisitor(session.ID, msg.VisitorID, EndUserWSEvent{
			Type:  "error",
			Error: "Failed to initialize chat session.",
		})
		return
	}

	// Create the user chat message.
	_, err = h.Queries.CreateChatMessage(ctx, db.CreateChatMessageParams{
		ChatSessionID: chatSession.ID,
		Role:          "user",
		Content:       msg.Message,
	})
	if err != nil {
		slog.Warn("enduser ws: create chat message failed", "error", err)
		h.WSHub.SendToVisitor(session.ID, msg.VisitorID, EndUserWSEvent{
			Type:  "error",
			Error: "Failed to process message.",
		})
		return
	}

	// Enqueue the chat task for the agent.
	_, err = h.TaskSvc.EnqueueChatTask(ctx, chatSession)
	if err != nil {
		slog.Warn("enduser ws: enqueue chat task failed", "error", err)
		h.WSHub.SendToVisitor(session.ID, msg.VisitorID, EndUserWSEvent{
			Type:  "error",
			Error: "Agent is currently unavailable.",
		})
		return
	}
}

// getOrCreateChatSession returns an existing chat session for the visitor, or creates one.
func (h *EndUserPublicHandler) getOrCreateChatSession(
	ctx context.Context,
	session db.EnduserSession,
	visitorID string,
) (db.ChatSession, error) {
	sessionIDStr := uuidToString(session.ID)

	// Check cache first.
	h.csMu.RLock()
	visitorMap, exists := h.chatSessionMap[sessionIDStr]
	if exists {
		csID, ok := visitorMap[visitorID]
		h.csMu.RUnlock()
		if ok {
			cs, err := h.Queries.GetChatSession(ctx, csID)
			if err == nil {
				return cs, nil
			}
		}
	} else {
		h.csMu.RUnlock()
	}

	// Create a new chat session. Use the enduser session's created_by member as creator.
	cs, err := h.Queries.CreateChatSession(ctx, db.CreateChatSessionParams{
		WorkspaceID: session.WorkspaceID,
		AgentID:     session.AgentID,
		CreatorID:   session.CreatedBy,
		Title:       session.Title + " - " + visitorID,
	})
	if err != nil {
		return db.ChatSession{}, err
	}

	// Inject the goal as a system message for the agent's first turn.
	if session.Goal != "" {
		if _, err := h.Queries.CreateChatMessage(ctx, db.CreateChatMessageParams{
			ChatSessionID: cs.ID,
			Role:          "system",
			Content:       session.Goal,
		}); err != nil {
			slog.Warn("enduser ws: create system chat message failed", "error", err)
		}
	}

	// Cache the mapping.
	h.csMu.Lock()
	if h.chatSessionMap[sessionIDStr] == nil {
		h.chatSessionMap[sessionIDStr] = make(map[string]pgtype.UUID)
	}
	h.chatSessionMap[sessionIDStr][visitorID] = cs.ID
	h.csMu.Unlock()

	return cs, nil
}

// ---------------------------------------------------------------------------
// Event bus handlers
// ---------------------------------------------------------------------------

func (h *EndUserPublicHandler) handleChatDone(e events.Event) {
	chatSessionID := e.ChatSessionID
	if chatSessionID == "" {
		return
	}

	// Find the enduser session and visitor for this chat session.
	sessionID, visitorID := h.lookupEndUserSession(chatSessionID)
	if sessionID == "" {
		return
	}

	sesUUID, err := parsePublicUUID(sessionID)
	if err != nil {
		return
	}

	// Read the payload to get the assistant's message.
	payload, ok := e.Payload.(protocol.ChatDonePayload)
	if !ok {
		// Try via JSON round-trip.
		data, _ := json.Marshal(e.Payload)
		json.Unmarshal(data, &payload)
	}

	if payload.Content != "" {
		h.WSHub.SendToVisitor(sesUUID, visitorID, EndUserWSEvent{
			Type:      "chat_message",
			VisitorID: visitorID,
			Role:      "assistant",
			Content:   payload.Content,
			Message:   payload.MessageID,
		})
	}
}

func (h *EndUserPublicHandler) handleTaskMessage(e events.Event) {
	// Check for update_enduser_html tool calls.
	payload, ok := e.Payload.(protocol.TaskMessagePayload)
	if !ok {
		data, _ := json.Marshal(e.Payload)
		json.Unmarshal(data, &payload)
	}

	if payload.Tool != "update_enduser_html" {
		return
	}

	// Extract html_content from the tool input.
	htmlContent := ""
	if payload.Input != nil {
		if htmlStr, ok := payload.Input["html_content"].(string); ok {
			htmlContent = htmlStr
		}
	}
	if htmlContent == "" && payload.Output != "" {
		htmlContent = payload.Output
	}

	if htmlContent == "" {
		return
	}

	// Find which enduser session this belongs to via the chat session.
	chatSessionID := e.ChatSessionID
	if chatSessionID == "" {
		return
	}

	sessionID, _ := h.lookupEndUserSession(chatSessionID)
	if sessionID == "" {
		return
	}

	sesUUID, err := parsePublicUUID(sessionID)
	if err != nil {
		return
	}

	// Update the enduser session's html_content.
	_, err = h.Queries.UpdateEndUserSessionHTML(context.Background(), sesUUID, htmlContent)
	if err != nil {
		slog.Warn("enduser: update html content failed", "session_id", sessionID, "error", err)
		return
	}

	// Broadcast html_updated to all visitors.
	h.WSHub.BroadcastHTMLUpdated(sesUUID, htmlContent)
}

// lookupEndUserSession finds the enduser session ID and visitor ID for a chat session.
func (h *EndUserPublicHandler) lookupEndUserSession(chatSessionID string) (sessionID string, visitorID string) {
	csUUID, err := parsePublicUUID(chatSessionID)
	if err != nil {
		return "", ""
	}

	h.csMu.RLock()
	defer h.csMu.RUnlock()

	for sesID, visitorMap := range h.chatSessionMap {
		for vid, csID := range visitorMap {
			if uuidToString(csID) == uuidToString(csUUID) {
				return sesID, vid
			}
		}
	}
	return "", ""
}

func parsePublicUUID(s string) (pgtype.UUID, error) {
	return util.ParseUUID(s)
}
