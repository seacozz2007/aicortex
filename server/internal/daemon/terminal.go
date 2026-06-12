package daemon

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"sync"
	"time"

	"github.com/aicortex/aicortex/server/pkg/protocol"
)

const (
	terminalScrollbackSize = 50 * 1024 // 50KB ring buffer
	terminalMaxSessions    = 10
	terminalIdleTimeout    = 24 * time.Hour
)

var errTerminalMaxSessions = errors.New("max sessions reached")

// TerminalManager manages PTY sessions on the daemon.
type TerminalManager struct {
	mu       sync.Mutex
	sessions map[string]*TerminalSession
	logger   *slog.Logger
	sendMu   sync.RWMutex
	sendMsg  func(protocol.Message) // send message back to server; set when WS connects
}

// TerminalSession represents a single PTY session.
type TerminalSession struct {
	id         string
	pty        platformPTY
	scrollback *ringBuffer
	attached   bool
	done       chan struct{}
	closeOnce  sync.Once
	lastAttach time.Time
}

// ringBuffer is a simple circular byte buffer for scrollback.
type ringBuffer struct {
	mu   sync.Mutex
	buf  []byte
	size int
	pos  int
	full bool
}

func newRingBuffer(size int) *ringBuffer {
	return &ringBuffer{buf: make([]byte, size), size: size}
}

func (r *ringBuffer) Write(p []byte) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, b := range p {
		r.buf[r.pos] = b
		r.pos = (r.pos + 1) % r.size
		if r.pos == 0 {
			r.full = true
		}
	}
}

func (r *ringBuffer) Bytes() []byte {
	r.mu.Lock()
	defer r.mu.Unlock()
	if !r.full {
		return append([]byte(nil), r.buf[:r.pos]...)
	}
	out := make([]byte, r.size)
	copy(out, r.buf[r.pos:])
	copy(out[r.size-r.pos:], r.buf[:r.pos])
	return out
}

func NewTerminalManager(logger *slog.Logger) *TerminalManager {
	tm := &TerminalManager{
		sessions: make(map[string]*TerminalSession),
		logger:   logger,
	}
	go tm.idleReaper()
	return tm
}

// SetSendFunc sets the function used to send messages back to the server.
// Called when the WS connection is established.
func (tm *TerminalManager) SetSendFunc(fn func(protocol.Message)) {
	tm.sendMu.Lock()
	tm.sendMsg = fn
	tm.sendMu.Unlock()
}

func (tm *TerminalManager) send(msg protocol.Message) {
	tm.sendMu.RLock()
	fn := tm.sendMsg
	tm.sendMu.RUnlock()
	if fn != nil {
		fn(msg)
	}
}

func (tm *TerminalManager) oldestDetachedSessionLocked() *TerminalSession {
	var oldest *TerminalSession
	for _, sess := range tm.sessions {
		if sess.attached {
			continue
		}
		if oldest == nil || sess.lastAttach.Before(oldest.lastAttach) {
			oldest = sess
		}
	}
	return oldest
}

func (tm *TerminalManager) getOrOpenSession(sessionID, shell string, rows, cols int) (*TerminalSession, error) {
	tm.mu.Lock()
	if sess, ok := tm.sessions[sessionID]; ok {
		tm.mu.Unlock()
		return sess, nil
	}
	for len(tm.sessions) >= terminalMaxSessions {
		victim := tm.oldestDetachedSessionLocked()
		if victim == nil {
			tm.mu.Unlock()
			return nil, errTerminalMaxSessions
		}
		victimID := victim.id
		tm.mu.Unlock()
		tm.logger.Info("terminal evicting detached session for capacity", "session_id", victimID)
		tm.closeSession(victim)
		tm.mu.Lock()
		if sess, ok := tm.sessions[sessionID]; ok {
			tm.mu.Unlock()
			return sess, nil
		}
	}
	tm.mu.Unlock()

	if shell == "" {
		shell = defaultTerminalShell()
	}

	ptyHandle, err := openPlatformPTY(shell, rows, cols)
	if err != nil {
		return nil, err
	}

	sess := &TerminalSession{
		id:         sessionID,
		pty:        ptyHandle,
		scrollback: newRingBuffer(terminalScrollbackSize),
		attached:   true,
		done:       make(chan struct{}),
		lastAttach: time.Now(),
	}

	tm.mu.Lock()
	if existing, ok := tm.sessions[sessionID]; ok {
		tm.mu.Unlock()
		_ = ptyHandle.Close()
		return existing, nil
	}
	tm.sessions[sessionID] = sess
	tm.mu.Unlock()

	tm.logger.Info("terminal session opened", "session_id", sessionID)
	go tm.readLoop(sess)
	go tm.waitLoop(sess)
	return sess, nil
}

func (tm *TerminalManager) HandleOpen(payload protocol.TerminalOpenPayload) {
	rows, cols := payload.Rows, payload.Cols
	if rows <= 0 {
		rows = 30
	}
	if cols <= 0 {
		cols = 120
	}

	if _, err := tm.getOrOpenSession(payload.SessionID, payload.Shell, rows, cols); err != nil {
		if errors.Is(err, errTerminalMaxSessions) {
			tm.sendError(payload.SessionID, err.Error())
			return
		}
		tm.sendError(payload.SessionID, "failed to start pty: "+err.Error())
	}
}

func (tm *TerminalManager) HandleAttach(payload protocol.TerminalAttachPayload) {
	rows, cols := payload.Rows, payload.Cols
	if rows <= 0 {
		rows = 30
	}
	if cols <= 0 {
		cols = 120
	}

	sess, err := tm.getOrOpenSession(payload.SessionID, "", rows, cols)
	if err != nil {
		if errors.Is(err, errTerminalMaxSessions) {
			tm.sendError(payload.SessionID, err.Error())
			return
		}
		tm.sendError(payload.SessionID, "failed to start pty: "+err.Error())
		return
	}

	_ = sess.pty.Resize(uint16(rows), uint16(cols))

	scrollback := sess.scrollback.Bytes()
	if len(scrollback) > 0 {
		tm.sendData(payload.SessionID, scrollback)
	}

	sess.attached = true
	sess.lastAttach = time.Now()
	tm.logger.Info("terminal session attached", "session_id", payload.SessionID)
}

func (tm *TerminalManager) HandleData(payload protocol.TerminalDataPayload) {
	tm.mu.Lock()
	sess, ok := tm.sessions[payload.SessionID]
	tm.mu.Unlock()
	if !ok {
		return
	}

	data, err := base64.StdEncoding.DecodeString(payload.Data)
	if err != nil {
		return
	}
	_, _ = sess.pty.Write(data)
}

func (tm *TerminalManager) HandleResize(payload protocol.TerminalResizePayload) {
	tm.mu.Lock()
	sess, ok := tm.sessions[payload.SessionID]
	tm.mu.Unlock()
	if !ok {
		return
	}
	_ = sess.pty.Resize(uint16(payload.Rows), uint16(payload.Cols))
}

func (tm *TerminalManager) HandleDetach(sessionID string) {
	tm.mu.Lock()
	sess, ok := tm.sessions[sessionID]
	tm.mu.Unlock()
	if !ok {
		return
	}
	sess.attached = false
	sess.lastAttach = time.Now()
	tm.logger.Info("terminal session detached", "session_id", sessionID)
}

func (tm *TerminalManager) idleReaper() {
	ticker := time.NewTicker(time.Hour)
	defer ticker.Stop()
	for range ticker.C {
		now := time.Now()
		tm.mu.Lock()
		toClose := make([]*TerminalSession, 0)
		for _, sess := range tm.sessions {
			if !sess.attached && now.Sub(sess.lastAttach) >= terminalIdleTimeout {
				toClose = append(toClose, sess)
			}
		}
		tm.mu.Unlock()
		for _, sess := range toClose {
			tm.logger.Info("terminal session idle timeout", "session_id", sess.id)
			tm.closeSession(sess)
		}
	}
}

func (tm *TerminalManager) HandleClose(payload protocol.TerminalClosePayload) {
	tm.mu.Lock()
	sess, ok := tm.sessions[payload.SessionID]
	tm.mu.Unlock()
	if !ok {
		return
	}
	tm.closeSession(sess)
}

func (tm *TerminalManager) closeSession(sess *TerminalSession) {
	sess.closeOnce.Do(func() {
		close(sess.done)
		_ = sess.pty.Close()
		tm.mu.Lock()
		delete(tm.sessions, sess.id)
		tm.mu.Unlock()
		tm.logger.Info("terminal session closed", "session_id", sess.id)

		msg := protocol.Message{Type: protocol.EventTerminalClose}
		msg.Payload, _ = json.Marshal(protocol.TerminalClosePayload{SessionID: sess.id, Reason: "exited"})
		tm.send(msg)
	})
}

func (tm *TerminalManager) readLoop(sess *TerminalSession) {
	buf := make([]byte, 4096)
	for {
		n, err := sess.pty.Read(buf)
		if n > 0 {
			data := buf[:n]
			sess.scrollback.Write(data)
			if sess.attached {
				tm.sendData(sess.id, data)
			}
		}
		if err != nil {
			if err != io.EOF {
				select {
				case <-sess.done:
				default:
					tm.logger.Debug("terminal read error", "session_id", sess.id, "error", err)
				}
			}
			return
		}
	}
}

func (tm *TerminalManager) waitLoop(sess *TerminalSession) {
	_ = sess.pty.Wait()
	tm.closeSession(sess)
}

func (tm *TerminalManager) sendData(sessionID string, data []byte) {
	msg := protocol.Message{Type: protocol.EventTerminalData}
	msg.Payload, _ = json.Marshal(protocol.TerminalDataPayload{
		SessionID: sessionID,
		Data:      base64.StdEncoding.EncodeToString(data),
	})
	tm.send(msg)
}

func (tm *TerminalManager) sendError(sessionID, errMsg string) {
	msg := protocol.Message{Type: protocol.EventTerminalError}
	msg.Payload, _ = json.Marshal(protocol.TerminalErrorPayload{
		SessionID: sessionID,
		Error:     errMsg,
	})
	tm.send(msg)
}

// CloseAll terminates all active terminal sessions (called on daemon shutdown).
func (tm *TerminalManager) CloseAll() {
	tm.mu.Lock()
	sessions := make([]*TerminalSession, 0, len(tm.sessions))
	for _, s := range tm.sessions {
		sessions = append(sessions, s)
	}
	tm.mu.Unlock()
	for _, s := range sessions {
		tm.closeSession(s)
	}
}

// ActiveSessionIDs returns IDs of all active sessions.
func (tm *TerminalManager) ActiveSessionIDs() []string {
	tm.mu.Lock()
	defer tm.mu.Unlock()
	ids := make([]string, 0, len(tm.sessions))
	for id := range tm.sessions {
		ids = append(ids, id)
	}
	return ids
}
