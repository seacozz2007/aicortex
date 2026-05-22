package preview

import (
	"context"
	"fmt"
	"strings"

	"github.com/aicortex/aicortex/server/internal/util"
	db "github.com/aicortex/aicortex/server/pkg/db/generated"
)

// CommandType represents a /preview subcommand.
type CommandType string

const (
	CmdDeploy CommandType = "deploy"
	CmdStop   CommandType = "stop"
	CmdStatus CommandType = "status"
	CmdLogs   CommandType = "logs"
)

// PreviewCommand represents a parsed /preview command.
type PreviewCommand struct {
	Type CommandType
}

// ParseCommand parses comment content for /preview commands.
// Returns the parsed command and true if a valid command was found.
func ParseCommand(content string) (PreviewCommand, bool) {
	trimmed := strings.TrimSpace(content)
	if !strings.HasPrefix(trimmed, "/preview") {
		return PreviewCommand{}, false
	}
	rest := strings.TrimSpace(strings.TrimPrefix(trimmed, "/preview"))
	if rest == "" {
		return PreviewCommand{}, false
	}
	parts := strings.Fields(rest)
	if len(parts) == 0 {
		return PreviewCommand{}, false
	}
	switch parts[0] {
	case "deploy":
		return PreviewCommand{Type: CmdDeploy}, true
	case "stop":
		return PreviewCommand{Type: CmdStop}, true
	case "status":
		return PreviewCommand{Type: CmdStatus}, true
	case "logs":
		return PreviewCommand{Type: CmdLogs}, true
	default:
		return PreviewCommand{}, false
	}
}

// prInfo holds relevant PR data for preview commands.
type prInfo struct {
	repoOwner string
	repoName  string
	prNumber  int32
	branch    string
	prID      string
}

// CommandHandler handles /preview commands from issue comments.
type CommandHandler struct {
	manager *Manager
	queries *db.Queries
	// previewAPI provides preview-specific DB methods via the Querier interface.
	previewAPI Querier
}

// NewCommandHandler creates a new CommandHandler.
func NewCommandHandler(manager *Manager, queries *db.Queries, previewAPI Querier) *CommandHandler {
	return &CommandHandler{
		manager:    manager,
		queries:    queries,
		previewAPI: previewAPI,
	}
}

// Handle processes a /preview command and returns the response text.
// issueID is the UUID of the issue the command was posted on.
// workspaceID is the UUID of the workspace.
// authorType is "member" or "agent".
// authorID is the UUID of the comment author.
func (h *CommandHandler) Handle(ctx context.Context, cmd PreviewCommand, issueID, workspaceID, authorType, authorID string) (string, error) {
	pr, err := h.linkedPR(ctx, issueID)
	if err != nil {
		return "", fmt.Errorf("当前 issue 没有关联的 Pull Request，请先关联 PR 再使用 /preview 命令")
	}

	if authorType == "member" {
		allowed, err := h.isAdminOrOwner(ctx, authorID, workspaceID)
		if err != nil {
			return "", fmt.Errorf("权限检查失败: %w", err)
		}
		if !allowed {
			return "", fmt.Errorf("权限不足：仅 PR 作者、管理员或 Owner 可以执行 /preview 命令")
		}
	}

	switch cmd.Type {
	case CmdDeploy:
		return h.handleDeploy(ctx, pr, workspaceID)
	case CmdStop:
		return h.handleStop(ctx, pr)
	case CmdStatus:
		return h.handleStatus(ctx, pr)
	case CmdLogs:
		return h.handleLogs(ctx, pr)
	default:
		return "", fmt.Errorf("未知命令: %s", cmd.Type)
	}
}

// linkedPR returns the first linked PR for an issue, or an error if none exists.
func (h *CommandHandler) linkedPR(ctx context.Context, issueID string) (prInfo, error) {
	issueUUID, err := util.ParseUUID(issueID)
	if err != nil {
		return prInfo{}, fmt.Errorf("invalid issue ID: %w", err)
	}

	prs, err := h.queries.ListPullRequestsByIssue(ctx, issueUUID)
	if err != nil {
		return prInfo{}, fmt.Errorf("查询 PR 失败: %w", err)
	}
	if len(prs) == 0 {
		return prInfo{}, fmt.Errorf("未找到关联的 PR")
	}

	pr := prs[0]
	prID := fmt.Sprintf("%s/%s#%d", pr.RepoOwner, pr.RepoName, pr.PrNumber)
	return prInfo{
		repoOwner: pr.RepoOwner,
		repoName:  pr.RepoName,
		prNumber:  pr.PrNumber,
		branch:    pr.Branch.String,
		prID:      prID,
	}, nil
}

// isAdminOrOwner checks if a member has admin or owner role in the workspace.
func (h *CommandHandler) isAdminOrOwner(ctx context.Context, memberID, workspaceID string) (bool, error) {
	memberUUID, err := util.ParseUUID(memberID)
	if err != nil {
		return false, err
	}
	wsUUID, err := util.ParseUUID(workspaceID)
	if err != nil {
		return false, err
	}

	member, err := h.queries.GetMemberByUserAndWorkspace(ctx, db.GetMemberByUserAndWorkspaceParams{
		UserID:      memberUUID,
		WorkspaceID: wsUUID,
	})
	if err != nil {
		return false, err
	}

	return member.Role == "owner" || member.Role == "admin", nil
}

func (h *CommandHandler) handleDeploy(ctx context.Context, pr prInfo, workspaceID string) (string, error) {
	// Check if a preview env already exists for this PR
	existing, err := h.previewAPI.GetPreviewEnvironmentByPR(ctx, workspaceID, pr.prID)
	if err == nil {
		// Already exists — trigger re-deploy
		if err := h.manager.ReDeploy(ctx, existing); err != nil {
			return "", fmt.Errorf("重新部署失败: %w", err)
		}
		return "🔄 **重新部署已触发**\n\n" + formatEnvStatus(existing), nil
	}

	env, err := h.manager.Create(ctx, workspaceID, pr.prID, pr.repoOwner, pr.repoName, pr.prNumber, pr.branch)
	if err != nil {
		return "", fmt.Errorf("部署失败: %w", err)
	}

	return "🚀 **部署已启动**\n\n" + formatEnvStatus(env), nil
}

func (h *CommandHandler) handleStop(ctx context.Context, pr prInfo) (string, error) {
	env, err := h.previewAPI.GetPreviewEnvironmentByPR(ctx, "", pr.prID)
	if err != nil {
		return "", fmt.Errorf("未找到预览环境（PR: %s）", pr.prID)
	}

	if err := h.manager.Destroy(ctx, env); err != nil {
		return "", fmt.Errorf("停止预览环境失败: %w", err)
	}

	return fmt.Sprintf("✅ 预览环境已停止并回收（PR: %s）", pr.prID), nil
}

func (h *CommandHandler) handleStatus(ctx context.Context, pr prInfo) (string, error) {
	env, err := h.previewAPI.GetPreviewEnvironmentByPR(ctx, "", pr.prID)
	if err != nil {
		return "", fmt.Errorf("未找到预览环境（PR: %s）", pr.prID)
	}

	return formatEnvStatus(env), nil
}

func (h *CommandHandler) handleLogs(ctx context.Context, pr prInfo) (string, error) {
	env, err := h.previewAPI.GetPreviewEnvironmentByPR(ctx, "", pr.prID)
	if err != nil {
		return "", fmt.Errorf("未找到预览环境（PR: %s）", pr.prID)
	}

	errMsg := ""
	if env.ErrorMessage.Valid {
		errMsg = env.ErrorMessage.String
	}
	if errMsg == "" {
		return fmt.Sprintf("预览环境当前状态：**%s**，无错误日志。", env.Status), nil
	}

	return fmt.Sprintf("预览环境错误日志（PR: %s）：\n\n```\n%s\n```", pr.prID, errMsg), nil
}

// formatEnvStatus formats a preview environment status table for an issue comment.
func formatEnvStatus(env db.PreviewEnvironment) string {
	var b strings.Builder

	b.WriteString("**预览环境状态**\n\n")
	b.WriteString("| 字段 | 值 |\n")
	b.WriteString("|------|-----|\n")
	b.WriteString(fmt.Sprintf("| 状态 | **%s** |\n", statusEmoji(ProvisionState(env.Status))))

	if env.Port.Valid && env.Port.Int32 > 0 {
		b.WriteString(fmt.Sprintf("| 端口 | `%d` |\n", env.Port.Int32))
		b.WriteString(fmt.Sprintf("| 访问地址 | http://localhost:%d |\n", env.Port.Int32))
	}

	if env.DbName.Valid && env.DbName.String != "" {
		b.WriteString(fmt.Sprintf("| 数据库 | `%s` |\n", env.DbName.String))
	}

	if env.CreatedAt.Valid {
		b.WriteString(fmt.Sprintf("| 创建时间 | %s |\n", env.CreatedAt.Time.Format("2006-01-02 15:04:05")))
	}
	if env.LastActivityAt.Valid {
		b.WriteString(fmt.Sprintf("| 最后活跃 | %s |\n", env.LastActivityAt.Time.Format("2006-01-02 15:04:05")))
	}

	if ProvisionState(env.Status) == StateFAILED && env.ErrorMessage.Valid && env.ErrorMessage.String != "" {
		b.WriteString(fmt.Sprintf("\n**错误信息**:\n```\n%s\n```\n", env.ErrorMessage.String))
	}

	return b.String()
}

// statusEmoji returns an emoji-indicator for the provision state.
func statusEmoji(s ProvisionState) string {
	switch s {
	case StateCLONING:
		return "🔄 cloning"
	case StateINSTALLING:
		return "🔄 installing"
	case StateMIGRATING:
		return "🔄 migrating"
	case StateBUILDING:
		return "🔄 building"
	case StateSTARTING:
		return "🔄 starting"
	case StateREADY:
		return "✅ ready"
	case StateFAILED:
		return "❌ failed"
	case StateDELETED:
		return "🗑️ deleted"
	default:
		return string(s)
	}
}
