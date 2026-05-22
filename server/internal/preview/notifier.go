package preview

import (
	"context"
	"fmt"
	"log/slog"
	"strings"

	"github.com/aicortex/aicortex/server/internal/util"
	db "github.com/aicortex/aicortex/server/pkg/db/generated"
)

// BridgeEventBus implements the EventBus interface and bridges preview events
// to issue comments for progress tracking.
type BridgeEventBus struct {
	queries *db.Queries
}

// NewBridgeEventBus creates a new BridgeEventBus.
func NewBridgeEventBus(queries *db.Queries) *BridgeEventBus {
	return &BridgeEventBus{queries: queries}
}

// Publish implements the EventBus interface. On state_changed events it
// posts a progress comment on the associated issue.
func (b *BridgeEventBus) Publish(eventType string, env db.PreviewEnvironment, state ProvisionState, err error) {
	if eventType != "preview:state_changed" {
		return
	}

	envID := util.UUIDToString(env.ID)
	ctx := context.Background()

	issueID, err := b.findIssueID(ctx, env)
	if err != nil {
		slog.Warn("bridge: could not find issue for preview env",
			"env_id", envID,
			"pr_id", env.PrID,
			"error", err,
		)
		return
	}

	content := formatProgressMessage(env, state, err)
	if content == "" {
		return
	}

	if err := b.postComment(ctx, env, issueID, content); err != nil {
		slog.Warn("bridge: failed to post progress comment",
			"env_id", envID,
			"issue_id", issueID,
			"error", err,
		)
	}
}

// findIssueID looks up the issue ID associated with a preview environment's PR.
func (b *BridgeEventBus) findIssueID(ctx context.Context, env db.PreviewEnvironment) (string, error) {
	pr, err := b.queries.GetGitHubPullRequest(ctx, db.GetGitHubPullRequestParams{
		WorkspaceID: env.WorkspaceID,
		RepoOwner:   env.RepoOwner,
		RepoName:    env.RepoName,
		PrNumber:    env.PrNumber,
	})
	if err != nil {
		return "", fmt.Errorf("find pull request: %w", err)
	}

	issueIDs, err := b.queries.ListIssueIDsForPullRequest(ctx, pr.ID)
	if err != nil || len(issueIDs) == 0 {
		return "", fmt.Errorf("find linked issues: %w", err)
	}

	return util.UUIDToString(issueIDs[0]), nil
}

// postComment creates a progress_update comment on the issue.
func (b *BridgeEventBus) postComment(ctx context.Context, env db.PreviewEnvironment, issueID, content string) error {
	issueUUID, err := util.ParseUUID(issueID)
	if err != nil {
		return err
	}

	_, err = b.queries.CreateComment(ctx, db.CreateCommentParams{
		IssueID:     issueUUID,
		WorkspaceID: env.WorkspaceID,
		AuthorType:  "agent",
		AuthorID:    env.WorkspaceID, // use workspace ID as agent placeholder
		Content:     content,
		Type:        "progress_update",
	})
	return err
}

// formatProgressMessage creates a human-readable progress message for a state transition.
func formatProgressMessage(env db.PreviewEnvironment, state ProvisionState, err error) string {
	var b strings.Builder

	switch state {
	case StateCLONING:
		b.WriteString(fmt.Sprintf("🔄 预览环境 **%s** 开始克隆代码...", env.PrID))
	case StateINSTALLING:
		b.WriteString(fmt.Sprintf("📦 预览环境 **%s** 安装依赖...", env.PrID))
	case StateMIGRATING:
		b.WriteString(fmt.Sprintf("🗄️ 预览环境 **%s** 执行数据库迁移...", env.PrID))
	case StateBUILDING:
		b.WriteString(fmt.Sprintf("🔨 预览环境 **%s** 构建中...", env.PrID))
	case StateSTARTING:
		b.WriteString(fmt.Sprintf("🚀 预览环境 **%s** 启动中...", env.PrID))
	case StateREADY:
		b.WriteString(fmt.Sprintf("✅ 预览环境 **%s** 已就绪！", env.PrID))
		if env.Port.Valid && env.Port.Int32 > 0 {
			b.WriteString(fmt.Sprintf("\n\n访问地址: http://localhost:%d", env.Port.Int32))
		}
	case StateFAILED:
		b.WriteString(fmt.Sprintf("❌ 预览环境 **%s** 部署失败", env.PrID))
		if err != nil {
			b.WriteString(fmt.Sprintf("\n\n错误: %s", err.Error()))
		}
	case StateDELETED:
		b.WriteString(fmt.Sprintf("🗑️ 预览环境 **%s** 已删除", env.PrID))
	}

	return b.String()
}
