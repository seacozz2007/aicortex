package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/jackc/pgx/v5/pgtype"
)

const (
	enduserWSWriteWait  = 10 * time.Second
	enduserWSPongWait   = 60 * time.Second
	enduserWSPingPeriod = (enduserWSPongWait * 9) / 10
)

// EndUserWSHub manages visitor WebSocket connections per enduser session.
type EndUserWSHub struct {
	upgrader websocket.Upgrader

	mu      sync.RWMutex
	clients map[*enduserWSClient]bool
	// bySession maps session_id -> client set for broadcasting
	bySession map[pgtype.UUID]map[*enduserWSClient]bool
}

// NewEndUserWSHub creates a new EndUser WebSocket hub.
func NewEndUserWSHub() *EndUserWSHub {
	return &EndUserWSHub{
		upgrader: websocket.Upgrader{
			// EndUser WS is public — any origin allowed (embedded in third-party sites).
			CheckOrigin: func(r *http.Request) bool { return true },
		},
		clients:   make(map[*enduserWSClient]bool),
		bySession: make(map[pgtype.UUID]map[*enduserWSClient]bool),
	}
}

// EndUserWSEvent is a message sent to enduser WS clients.
type EndUserWSEvent struct {
	Type        string `json:"type"`
	Message     string `json:"message,omitempty"`
	HTMLContent string `json:"html_content,omitempty"`
	VisitorID   string `json:"visitor_id,omitempty"`
	Role        string `json:"role,omitempty"`
	Content     string `json:"content,omitempty"`
	Error       string `json:"error,omitempty"`
}

// EndUserWSIncoming is a message received from enduser WS clients.
type EndUserWSIncoming struct {
	VisitorID string `json:"visitor_id"`
	Message   string `json:"message"`
}

type enduserWSClient struct {
	hub       *EndUserWSHub
	conn      *websocket.Conn
	send      chan []byte
	sessionID pgtype.UUID
	visitorID string
	token     string
}

// UpgradeHandleWebSocket upgrades an HTTP connection to WebSocket for enduser.
// onMessage is called for each incoming message from the visitor.
func (h *EndUserWSHub) UpgradeHandleWebSocket(
	w http.ResponseWriter,
	r *http.Request,
	sessionID pgtype.UUID,
	token string,
	onMessage func(client *enduserWSClient, msg EndUserWSIncoming),
) {
	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		slog.Warn("enduser ws upgrade failed", "error", err, "token", token)
		return
	}

	c := &enduserWSClient{
		hub:       h,
		conn:      conn,
		send:      make(chan []byte, 32),
		sessionID: sessionID,
		token:     token,
	}
	h.register(c)

	go c.writePump()
	go c.readPump(onMessage)
}

func (h *EndUserWSHub) register(c *enduserWSClient) {
	h.mu.Lock()
	h.clients[c] = true
	conns := h.bySession[c.sessionID]
	if conns == nil {
		conns = make(map[*enduserWSClient]bool)
		h.bySession[c.sessionID] = conns
	}
	conns[c] = true
	h.mu.Unlock()
}

func (h *EndUserWSHub) unregister(c *enduserWSClient) {
	h.mu.Lock()
	if !h.clients[c] {
		h.mu.Unlock()
		return
	}
	delete(h.clients, c)
	if conns := h.bySession[c.sessionID]; conns != nil {
		delete(conns, c)
		if len(conns) == 0 {
			delete(h.bySession, c.sessionID)
		}
	}
	close(c.send)
	h.mu.Unlock()
}

// SendToVisitor sends a JSON-encoded event to a specific visitor within a session.
func (h *EndUserWSHub) SendToVisitor(sessionID pgtype.UUID, visitorID string, event EndUserWSEvent) {
	if h == nil {
		return
	}
	data, err := json.Marshal(event)
	if err != nil {
		return
	}
	h.mu.RLock()
	conns := h.bySession[sessionID]
	h.mu.RUnlock()

	for c := range conns {
		if c.visitorID == visitorID || visitorID == "" {
			select {
			case c.send <- data:
			default:
				go h.unregister(c)
			}
		}
	}
}

// SendToSession broadcasts a JSON-encoded event to all visitors in a session.
func (h *EndUserWSHub) SendToSession(sessionID pgtype.UUID, event EndUserWSEvent) {
	h.SendToVisitor(sessionID, "", event)
}

// BroadcastHTMLUpdated sends an html_updated event to all visitors in a session.
func (h *EndUserWSHub) BroadcastHTMLUpdated(sessionID pgtype.UUID, htmlContent string) {
	h.SendToSession(sessionID, EndUserWSEvent{
		Type:        "html_updated",
		HTMLContent: htmlContent,
	})
}

// BroadcastSessionExpired sends a session_expired event to all visitors in a session.
func (h *EndUserWSHub) BroadcastSessionExpired(sessionID pgtype.UUID) {
	h.SendToSession(sessionID, EndUserWSEvent{
		Type: "session_expired",
	})
}

// SessionVisitorCount returns the number of connected visitors for a session.
func (h *EndUserWSHub) SessionVisitorCount(sessionID pgtype.UUID) int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.bySession[sessionID])
}

func (c *enduserWSClient) readPump(onMessage func(client *enduserWSClient, msg EndUserWSIncoming)) {
	defer func() {
		c.hub.unregister(c)
		c.conn.Close()
	}()

	c.conn.SetReadLimit(65536) // 64KB max message size
	c.conn.SetReadDeadline(time.Now().Add(enduserWSPongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(enduserWSPongWait))
		return nil
	})

	for {
		_, raw, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
				slog.Debug("enduser ws read error", "error", err)
			}
			return
		}

		var msg EndUserWSIncoming
		if err := json.Unmarshal(raw, &msg); err != nil {
			sendWSError(c, "invalid message format")
			continue
		}
		if msg.VisitorID == "" {
			sendWSError(c, "visitor_id is required")
			continue
		}
		if msg.Message == "" {
			sendWSError(c, "message is required")
			continue
		}

		c.visitorID = msg.VisitorID
		onMessage(c, msg)
	}
}

func (c *enduserWSClient) writePump() {
	ticker := time.NewTicker(enduserWSPingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(enduserWSWriteWait))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}
		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(enduserWSWriteWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func sendWSError(c *enduserWSClient, errMsg string) {
	evt := EndUserWSEvent{Type: "error", Error: errMsg}
	data, _ := json.Marshal(evt)
	select {
	case c.send <- data:
	default:
	}
}
