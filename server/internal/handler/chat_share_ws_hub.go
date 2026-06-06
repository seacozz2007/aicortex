package handler

import (
	"sync"

	"github.com/gorilla/websocket"
)

// ChatShareWSHub is a lightweight WebSocket hub for public chat share connections.
// One hub per server instance, organized by share link token.
type ChatShareWSHub struct {
	// conns: token -> set of connections
	conns map[string]map[*websocket.Conn]struct{}
	mu    sync.RWMutex
}

func NewChatShareWSHub() *ChatShareWSHub {
	return &ChatShareWSHub{
		conns: make(map[string]map[*websocket.Conn]struct{}),
	}
}

func (h *ChatShareWSHub) Register(token string, conn *websocket.Conn) *websocket.Conn {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.conns[token] == nil {
		h.conns[token] = make(map[*websocket.Conn]struct{})
	}
	h.conns[token][conn] = struct{}{}
	return conn
}

func (h *ChatShareWSHub) Unregister(token string, conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if conns, ok := h.conns[token]; ok {
		delete(conns, conn)
		if len(conns) == 0 {
			delete(h.conns, token)
		}
	}
	conn.Close()
}

// SendToToken broadcasts a message to all connections for a given token.
func (h *ChatShareWSHub) SendToToken(token string, msg ChatShareWSOutgoing) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for conn := range h.conns[token] {
		_ = conn.WriteJSON(msg)
	}
}
