package design

import (
	"context"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/aicortex/aicortex/server/internal/daemon/defaultskills"
	"github.com/aicortex/aicortex/server/internal/service"
	db "github.com/aicortex/aicortex/server/pkg/db/generated"
)

func skillTeachesQuestionForm(name, content string) bool {
	if strings.Contains(strings.ToLower(name), "interactive form") {
		return true
	}
	return strings.Contains(strings.ToLower(content), "<question-form>")
}

// EnsureQuestionFormSkill appends the platform Interactive Forms skill when a
// design task's agent does not already have question-form guidance.
func EnsureQuestionFormSkill(skills []service.AgentSkillData) []service.AgentSkillData {
	for _, s := range skills {
		if skillTeachesQuestionForm(s.Name, s.Content) {
			return skills
		}
	}
	qf := defaultskills.QuestionForm()
	out := append([]service.AgentSkillData(nil), skills...)
	out = append(out, service.AgentSkillData{
		Name:    qf.Name,
		Content: qf.Content,
	})
	return out
}

// EnsureAgentQuestionFormSkill links the workspace Interactive Forms skill to
// the design agent when it is not already assigned. Idempotent.
func EnsureAgentQuestionFormSkill(
	ctx context.Context,
	q *db.Queries,
	workspaceID, agentID pgtype.UUID,
) error {
	linked, err := q.ListAgentSkills(ctx, agentID)
	if err != nil {
		return err
	}
	for _, sk := range linked {
		if skillTeachesQuestionForm(sk.Name, sk.Content) {
			return nil
		}
	}

	agent, err := q.GetAgent(ctx, agentID)
	if err != nil {
		return err
	}
	createdBy := agent.OwnerID
	if !createdBy.Valid {
		createdBy = agentID
	}

	skillID, err := findOrCreateQuestionFormSkill(ctx, q, workspaceID, createdBy)
	if err != nil {
		return err
	}
	return q.AddAgentSkill(ctx, db.AddAgentSkillParams{
		AgentID: agentID,
		SkillID: skillID,
	})
}

func findOrCreateQuestionFormSkill(
	ctx context.Context,
	q *db.Queries,
	workspaceID, createdBy pgtype.UUID,
) (pgtype.UUID, error) {
	qf := defaultskills.QuestionForm()
	existing, err := q.GetSkillByWorkspaceAndName(ctx, db.GetSkillByWorkspaceAndNameParams{
		WorkspaceID: workspaceID,
		Name:        qf.Name,
	})
	if err == nil {
		return existing.ID, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return pgtype.UUID{}, err
	}

	created, err := q.CreateSkill(ctx, db.CreateSkillParams{
		WorkspaceID: workspaceID,
		Name:        qf.Name,
		Description: qf.Description,
		Content:     qf.Content,
		Config:      []byte("{}"),
		CreatedBy:   createdBy,
	})
	if err != nil {
		return pgtype.UUID{}, err
	}
	return created.ID, nil
}
