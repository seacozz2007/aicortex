package handler

import (
	"testing"

	db "github.com/aicortex/aicortex/server/pkg/db/generated"
	"github.com/jackc/pgx/v5/pgtype"
)

func TestComputeTaskKind(t *testing.T) {
	designMode := pgtype.Text{String: "prototype", Valid: true}
	chatSession := pgtype.UUID{Bytes: [16]byte{1}, Valid: true}

	if got := computeTaskKind(db.AgentTaskQueue{
		DesignMode:    designMode,
		ChatSessionID: chatSession,
	}); got != "design" {
		t.Fatalf("expected design, got %q", got)
	}

	if got := computeTaskKind(db.AgentTaskQueue{
		ChatSessionID: chatSession,
	}); got != "chat" {
		t.Fatalf("expected chat, got %q", got)
	}
}
