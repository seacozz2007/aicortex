package daemon

import (
	"encoding/base64"
	"encoding/json"
	"io"
	"log/slog"
	"os"
	"os/exec"
	"sync"
	"syscall"
	"time"

	"github.com/creack/pty"
	"github.com/aicortex/aicortex/server/pkg/protocol"
)

const (
	terminalScrollbackSize = 50 * 1024 // 50KB ring buffer
	terminalMaxSessions    = 5
	terminalIdleTimeout    = 24 * time.Hour
)

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
	ptmx       *os.File
	cmd        *exec.Cmd
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
	return &TerminalManager{
		sessions: make(map[string]*TerminalSession),
		logger:   logger,
	}
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

func (tm *TerminalManager) HandleOpen(payload protocol.TerminalOpenPayload) {
	tm.mu.Lock()
	if len(tm.sessions) >= terminalMaxSessions {
		tm.mu.Unlock()
		tm.sendError(payload.SessionID, "max sessions reached")
		return
	}
	tm.mu.Unlock()

	shell := payload.Shell
	if shell == "" {
		shell = os.Getenv("SHELL")
		if shell == "" {
			shell = "/bin/sh"
		}
	}

	cmd := exec.Command(shell)
	cmd.Env = append(os.Environ(), "TERM=xterm-256color", "LANG=C.UTF-8")
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}

	ptmx, err := pty.StartWithSize(cmd, &pty.Winsize{
		Rows: uint16(payload.Rows),
		Cols: uint16(payload.Cols),
	})
	if err != nil {
		tm.sendError(payload.SessionID, "failed to start pty: "+err.Error())
		return
	}

	sess := &TerminalSession{
		id:         payload.SessionID,
		ptmx:       ptmx,
		cmd:        cmd,
		scrollback: newRingBuffer(terminalScrollbackSize),
		attached:   true,
		done:       make(chan struct{}),
		lastAttach: time.Now(),
	}

	tm.mu.Lock()
	tm.sessions[payload.SessionID] = sess
	tm.mu.Unlock()

	tm.logger.Info("terminal session opened", "session_id", payload.SessionID)

	// Read PTY output
	go tm.readLoop(sess)

	// Wait for process exit
	go tm.waitLoop(sess)
}

func (tm *TerminalManager) HandleAttach(payload protocol.TerminalAttachPayload) {
	tm.mu.Lock()
	sess, ok := tm.sessions[payload.SessionID]
	tm.mu.Unlock()
	if !ok {
		tm.sendError(payload.SessionID, "session not found")
		return
	}

	// Resize
	_ = pty.Setsize(sess.ptmx, &pty.Winsize{
		Rows: uint16(payload.Rows),
		Cols: uint16(payload.Cols),
	})

	// Send scrollback
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
	_, _ = sess.ptmx.Write(data)
}

func (tm *TerminalManager) HandleResize(payload protocol.TerminalResizePayload) {
	tm.mu.Lock()
	sess, ok := tm.sessions[payload.SessionID]
	tm.mu.Unlock()
	if !ok {
		return
	}
	_ = pty.Setsize(sess.ptmx, &pty.Winsize{
		Rows: uint16(payload.Rows),
		Cols: uint16(payload.Cols),
	})
}

func (tm *TerminalManager) HandleDetach(sessionID string) {
	tm.mu.Lock()
	sess, ok := tm.sessions[sessionID]
	tm.mu.Unlock()
	if !ok {
		return
	}
	sess.attached = false
	tm.logger.Info("terminal session detached", "session_id", sessionID)
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
		_ = sess.ptmx.Close()
		if sess.cmd.Process != nil {
			_ = syscall.Kill(-sess.cmd.Process.Pid, syscall.SIGKILL)
		}
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
		n, err := sess.ptmx.Read(buf)
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
	_ = sess.cmd.Wait()
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
