package design

import (
	"strings"
	"testing"

	"github.com/aicortex/aicortex/server/internal/service"
)

func TestEnsureQuestionFormSkill_appendsWhenMissing(t *testing.T) {
	out := EnsureQuestionFormSkill(nil)
	if len(out) != 1 {
		t.Fatalf("expected 1 skill, got %d", len(out))
	}
	if out[0].Name != "Interactive Forms" {
		t.Fatalf("skill name = %q", out[0].Name)
	}
	if !strings.Contains(out[0].Content, "<question-form>") {
		t.Fatal("expected question-form guidance in skill content")
	}
}

func TestEnsureQuestionFormSkill_skipsWhenPresent(t *testing.T) {
	in := []service.AgentSkillData{{Name: "Interactive Forms", Content: "use forms"}}
	out := EnsureQuestionFormSkill(in)
	if len(out) != 1 {
		t.Fatalf("expected unchanged slice, got %d skills", len(out))
	}
}
