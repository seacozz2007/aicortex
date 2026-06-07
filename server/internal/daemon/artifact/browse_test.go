//go:build windows

package artifact

import (
	"encoding/json"
	"os"
	"testing"

	art "github.com/aicortex/aicortex/server/internal/artifact"
	"github.com/aicortex/aicortex/server/pkg/protocol"
)

func TestBrowserReadIndexHTML(t *testing.T) {
	root := `C:\Users\Administrator\aicortex_workspaces\b5eef1a0-b478-4eca-b4ab-c1a6eab47662\74f212ff\workdir`
	var got protocol.ArtifactResponsePayload
	b := NewBrowser(nil)
	b.SetSendFunc(func(msg protocol.Message) {
		t.Logf("raw json len=%d head=%.120s", len(msg.Payload), string(msg.Payload))
		if err := json.Unmarshal(msg.Payload, &got); err != nil {
			t.Fatal(err)
		}
	})
	abs, err := art.ResolveUnderRoot(root, "index.html")
	if err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(abs)
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("abs=%s size=%d isDir=%v", abs, info.Size(), info.IsDir())

	body, ct, err := readFile(abs)
	if err != nil {
		t.Fatalf("readFile: %v", err)
	}
	t.Logf("readFile bytes=%d ct=%q", len(body), ct)

	payload := protocol.ArtifactRequestPayload{
		RequestID: "test",
		Op:        "read",
		RootPath:  root,
		RelPath:   "index.html",
	}
	t.Logf("payload op=%q", payload.Op)
	b.handle(payload)
	t.Logf("response: %+v", got)
	if got.Error != "" {
		t.Fatalf("error: %q", got.Error)
	}
	if got.Body == "" {
		t.Fatalf("empty body, content_type=%q", got.ContentType)
	}
}
