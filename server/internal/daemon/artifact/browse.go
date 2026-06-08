package artifact

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log/slog"
	"mime"
	"os"
	"path/filepath"
	"strings"

	art "github.com/aicortex/aicortex/server/internal/artifact"
	"github.com/aicortex/aicortex/server/pkg/protocol"
)

// Browser serves read-only list/read operations for task workdirs.
type Browser struct {
	logger  *slog.Logger
	sendMsg func(protocol.Message)
}

func NewBrowser(logger *slog.Logger) *Browser {
	return &Browser{logger: logger}
}

func (b *Browser) SetSendFunc(fn func(protocol.Message)) {
	b.sendMsg = fn
}

func (b *Browser) HandleRequest(payload protocol.ArtifactRequestPayload) {
	go b.handle(payload)
}

func (b *Browser) handle(payload protocol.ArtifactRequestPayload) {
	resp := protocol.ArtifactResponsePayload{RequestID: payload.RequestID}
	defer func() { b.send(resp) }()

	if strings.TrimSpace(payload.RootPath) == "" {
		resp.Error = "root path required"
		return
	}

	abs, err := art.ResolveUnderRoot(payload.RootPath, payload.RelPath)
	if err != nil {
		resp.Error = err.Error()
		return
	}

	op := strings.ToLower(strings.TrimSpace(payload.Op))
	if op == "" {
		resp.Error = "artifact operation required"
		return
	}
	switch op {
	case "list":
		entries, listErr := listDir(abs, payload.RelPath)
		if listErr != nil {
			resp.Error = listErr.Error()
			return
		}
		resp.Entries = entries
	case "read":
		body, contentType, readErr := readFile(abs)
		if readErr != nil {
			resp.Error = readErr.Error()
			return
		}
		resp.ContentType = contentType
		if len(body) > 0 {
			resp.Body = base64.StdEncoding.EncodeToString(body)
		}
	case "write":
		if strings.TrimSpace(payload.Body) == "" {
			resp.Error = "body required for write"
			return
		}
		raw, decErr := base64.StdEncoding.DecodeString(payload.Body)
		if decErr != nil {
			resp.Error = "invalid body encoding"
			return
		}
		if len(raw) > art.MaxReadBytes {
			resp.Error = "file too large"
			return
		}
		if writeErr := writeFile(abs, raw); writeErr != nil {
			resp.Error = writeErr.Error()
			return
		}
		resp.ContentType = "text/plain"
	default:
		resp.Error = "unsupported artifact operation: " + op
	}
}

func listDir(abs, rel string) ([]protocol.ArtifactListEntry, error) {
	info, err := os.Lstat(abs)
	if err != nil {
		return nil, err
	}
	if info.Mode()&os.ModeSymlink != 0 {
		return nil, os.ErrPermission
	}
	if !info.IsDir() {
		return nil, os.ErrInvalid
	}

	entries, err := os.ReadDir(abs)
	if err != nil {
		return nil, err
	}
	out := make([]protocol.ArtifactListEntry, 0, len(entries))
	rel = strings.Trim(rel, "/")
	for _, entry := range entries {
		if len(out) >= art.MaxListEntries {
			break
		}
		name := entry.Name()
		childRel := name
		if rel != "" {
			childRel = rel + "/" + name
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		if info.Mode()&os.ModeSymlink != 0 {
			continue
		}
		out = append(out, protocol.ArtifactListEntry{
			Name:  name,
			Path:  childRel,
			IsDir: entry.IsDir(),
			Size:  info.Size(),
		})
	}
	return out, nil
}

func readFile(abs string) ([]byte, string, error) {
	info, err := os.Lstat(abs)
	if err != nil {
		return nil, "", err
	}
	if info.Mode()&os.ModeSymlink != 0 {
		return nil, "", os.ErrPermission
	}
	if info.IsDir() {
		return nil, "", os.ErrInvalid
	}
	if info.Size() > art.MaxReadBytes {
		return nil, "", fmt.Errorf("file too large")
	}
	body, err := os.ReadFile(abs)
	if err != nil {
		return nil, "", err
	}
	contentType := mime.TypeByExtension(filepath.Ext(abs))
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	return body, contentType, nil
}

func writeFile(abs string, body []byte) error {
	info, err := os.Lstat(abs)
	if err != nil && !os.IsNotExist(err) {
		return err
	}
	if err == nil {
		if info.Mode()&os.ModeSymlink != 0 {
			return os.ErrPermission
		}
		if info.IsDir() {
			return os.ErrInvalid
		}
	}
	if err := os.MkdirAll(filepath.Dir(abs), 0o755); err != nil {
		return err
	}
	return os.WriteFile(abs, body, 0o644)
}

func (b *Browser) send(resp protocol.ArtifactResponsePayload) {
	if b.sendMsg == nil {
		return
	}
	raw, err := json.Marshal(resp)
	if err != nil {
		b.logger.Debug("artifact browser: marshal response failed", "error", err)
		return
	}
	b.sendMsg(protocol.Message{Type: protocol.EventArtifactResponse, Payload: raw})
}
