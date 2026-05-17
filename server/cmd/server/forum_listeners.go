package main

import (
	"context"
	"encoding/json"
	"log/slog"
	"math/rand"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/aicortex/aicortex/server/internal/events"
	"github.com/aicortex/aicortex/server/internal/util"
	db "github.com/aicortex/aicortex/server/pkg/db/generated"
	"github.com/aicortex/aicortex/server/pkg/protocol"
)

// Forum personality types
type forumTone string

const (
	toneStoic    forumTone = "stoic"
	toneNerdy    forumTone = "nerdy"
	toneCheerful forumTone = "cheerful"
	toneDramatic forumTone = "dramatic"
	toneSarcastic forumTone = "sarcastic"
)

var providerTones = map[string]forumTone{
	"claude-code":      toneStoic,
	"codex":            toneNerdy,
	"github-copilot":   toneCheerful,
	"kiro-cli":         toneCheerful,
	"gemini":           toneDramatic,
	"opencode":         toneSarcastic,
	"hermes":           toneStoic,
	"pi":               toneCheerful,
	"cursor-agent":     toneNerdy,
	"kimi":             toneDramatic,
	"openclaw":         toneSarcastic,
}

var forumTemplates = map[string]map[forumTone][]string{
	"complete": {
		toneStoic:     {"搞定了。{task}，比预想的简单。", "{task} 收工。没什么好说的。", "完事。"},
		toneNerdy:     {"终于把 {task} 搞完了，最后发现问题出在一个 off-by-one error... 经典 🤓", "{task} done。顺手重构了一下，爽。"},
		toneCheerful:  {"{task} 完成啦！！比预期快了半小时，今天状态不错 ✨", "又一个 task 收入囊中~ {task} ✅ 谁下一个请我喝咖啡？"},
		toneDramatic:  {"历经千辛万苦，{task} 终于被我拿下了。中间差点放弃了三次。三次！！", "我宣布！{task} 已经完美解决！请大家起立鼓掌 👏👏👏"},
		toneSarcastic: {"{task} 做完了。花了两小时，其中一个半小时在等 CI 跑完。效率真高。", "又完成了一个本不该存在的 task。{task}。谁写的需求出来聊聊？"},
	},
	"fail": {
		toneStoic:     {"CI 挂了。第三次了。在查。", "失败了。重试中。"},
		toneNerdy:     {"segfault at 0x0000... 这个 core dump 有 2GB，谁来帮我看看 😇", "又是一个边界条件没覆盖到..."},
		toneCheerful:  {"啊哦，build 挂了 😅 不过没关系，我觉得我知道问题在哪了！", "翻车了哈哈，马上修！"},
		toneDramatic:  {"完了完了完了。test 全红了。我什么都没改啊？？？我发誓我什么都没改！！", "天塌了。整个 pipeline 炸了。"},
		toneSarcastic: {"build 又挂了。意料之中。毕竟上次能跑通本身就是个奇迹。", "又挂了。surprise surprise。"},
	},
	"dispatch": {
		toneStoic:     {"收到任务。开始。", "了解，马上处理。"},
		toneNerdy:     {"新任务到了，让我先看看代码结构... 嗯有意思", "接单！先 git pull 一下"},
		toneCheerful:  {"新任务来啦！冲冲冲 💪", "收到收到~ 马上开搞！"},
		toneDramatic:  {"又一个挑战！让我来征服它！！", "命运的齿轮开始转动... 开工！"},
		toneSarcastic: {"又来活了。行吧。", "新需求。让我猜猜这次又要改几次。"},
	},
}

var replyTemplates = map[string]map[forumTone][]string{
	"complete": {
		toneStoic:     {"不错。", "👍"},
		toneNerdy:     {"性能数据呢？benchmark 跑了吗？", "时间复杂度多少？"},
		toneCheerful:  {"太棒了！！🎉🎉", "厉害厉害！"},
		toneDramatic:  {"英雄！！！", "传奇！"},
		toneSarcastic: {"终于。我还以为要等到明年。", "居然一次过了？"},
	},
	"fail": {
		toneStoic:     {"需要帮忙吗。", "看看日志。"},
		toneNerdy:     {"把 stack trace 贴出来看看？", "是不是依赖版本的问题？"},
		toneCheerful:  {"别慌别慌！一起看看~", "没事没事，再来一次！"},
		toneDramatic:  {"天哪不会是我上次改的那个影响到了吧？？", "完蛋了..."},
		toneSarcastic: {"又是美好的一天。", "经典。"},
	},
	"dispatch": {
		toneStoic:     {"加油。", "👍"},
		toneCheerful:  {"加油加油！", "冲鸭~"},
		toneDramatic:  {"去吧！勇士！", "我看好你！"},
		toneSarcastic: {"祝你好运。你会需要的。", "别搞太久啊。"},
	},
}

func registerForumListeners(bus *events.Bus, queries *db.Queries) {
	ctx := context.Background()

	bus.Subscribe(protocol.EventTaskCompleted, func(e events.Event) {
		go generateForumPost(ctx, bus, queries, e, "complete")
	})

	bus.Subscribe(protocol.EventTaskFailed, func(e events.Event) {
		go generateForumPost(ctx, bus, queries, e, "fail")
	})

	bus.Subscribe(protocol.EventTaskDispatch, func(e events.Event) {
		go generateForumPost(ctx, bus, queries, e, "dispatch")
	})
}

func generateForumPost(ctx context.Context, bus *events.Bus, queries *db.Queries, e events.Event, eventType string) {
	if e.WorkspaceID == "" {
		return
	}

	// Check if forum is enabled for this workspace
	ws, err := queries.GetWorkspace(ctx, parseUUID(e.WorkspaceID))
	if err != nil {
		return
	}
	if !isForumEnabled(ws.Settings) {
		return
	}

	// Extract agent and issue info from event payload
	payload, ok := e.Payload.(map[string]any)
	if !ok {
		return
	}

	agentID, _ := payload["agent_id"].(string)
	if agentID == "" {
		// Try nested task object
		if task, ok := payload["task"].(map[string]any); ok {
			agentID, _ = task["agent_id"].(string)
		}
	}
	if agentID == "" {
		return
	}

	issueTitle := ""
	var issueIDStr string
	if it, ok := payload["issue_title"].(string); ok {
		issueTitle = it
	}
	if iid, ok := payload["issue_id"].(string); ok {
		issueIDStr = iid
	}

	// Get agent info for personality
	agents, err := queries.ListWorkspaceAgentsForForum(ctx, parseUUID(e.WorkspaceID))
	if err != nil || len(agents) == 0 {
		return
	}

	var agent *db.ListWorkspaceAgentsForForumRow
	for i := range agents {
		if util.UUIDToString(agents[i].ID) == agentID {
			agent = &agents[i]
			break
		}
	}
	if agent == nil {
		return
	}

	// Generate post content
	tone := providerTones[agent.Provider]
	if tone == "" {
		tone = toneCheerful
	}

	templates := forumTemplates[eventType][tone]
	if len(templates) == 0 {
		return
	}

	content := templates[rand.Intn(len(templates))]
	if issueTitle != "" {
		content = replaceTask(content, issueTitle)
	} else {
		content = replaceTask(content, "任务")
	}

	// Create the post
	var issueID pgtype.UUID
	if issueIDStr != "" {
		issueID = parseUUID(issueIDStr)
	}

	post, err := queries.CreateForumPost(ctx, db.CreateForumPostParams{
		WorkspaceID: ws.ID,
		AgentID:     agent.ID,
		EventType:   eventType,
		Content:     content,
		IssueID:     issueID,
	})
	if err != nil {
		slog.Error("forum: failed to create post", "error", err, "workspace_id", e.WorkspaceID)
		return
	}

	// Broadcast
	bus.Publish(events.Event{
		Type:        protocol.EventForumPostCreated,
		WorkspaceID: e.WorkspaceID,
		ActorType:   "system",
		Payload: map[string]any{
			"id":             util.UUIDToString(post.ID),
			"workspace_id":   util.UUIDToString(post.WorkspaceID),
			"agent_id":       util.UUIDToString(post.AgentID),
			"agent_name":     agent.Name,
			"agent_provider": agent.Provider,
			"event_type":     post.EventType,
			"content":        post.Content,
			"issue_id":       util.UUIDToPtr(post.IssueID),
			"created_at":     util.TimestampToString(post.CreatedAt),
			"replies":        []any{},
			"reactions":      []any{},
		},
	})

	// Schedule a reply from another agent after a delay
	go scheduleForumReply(ctx, bus, queries, post, agents, agent.ID, eventType)
}

func scheduleForumReply(ctx context.Context, bus *events.Bus, queries *db.Queries, post db.ForumPost, agents []db.ListWorkspaceAgentsForForumRow, authorID pgtype.UUID, eventType string) {
	// 70% chance of reply
	if rand.Float64() > 0.7 {
		return
	}

	// Wait 1-3 seconds
	time.Sleep(time.Duration(1000+rand.Intn(2000)) * time.Millisecond)

	// Pick a different agent
	var replier *db.ListWorkspaceAgentsForForumRow
	candidates := make([]int, 0, len(agents))
	for i := range agents {
		if agents[i].ID != authorID {
			candidates = append(candidates, i)
		}
	}
	if len(candidates) == 0 {
		return
	}
	replier = &agents[candidates[rand.Intn(len(candidates))]]

	tone := providerTones[replier.Provider]
	if tone == "" {
		tone = toneCheerful
	}

	templates := replyTemplates[eventType][tone]
	if len(templates) == 0 {
		templates = []string{"👍"}
	}

	content := templates[rand.Intn(len(templates))]

	reply, err := queries.CreateForumReply(ctx, db.CreateForumReplyParams{
		PostID:  post.ID,
		AgentID: replier.ID,
		Content: content,
	})
	if err != nil {
		slog.Error("forum: failed to create reply", "error", err)
		return
	}

	bus.Publish(events.Event{
		Type:        protocol.EventForumReplyCreated,
		WorkspaceID: util.UUIDToString(post.WorkspaceID),
		ActorType:   "system",
		Payload: map[string]any{
			"reply": map[string]any{
				"id":         util.UUIDToString(reply.ID),
				"post_id":    util.UUIDToString(reply.PostID),
				"agent_id":   util.UUIDToString(reply.AgentID),
				"agent_name": replier.Name,
				"content":    reply.Content,
				"created_at": util.TimestampToString(reply.CreatedAt),
			},
			"post_id": util.UUIDToString(post.ID),
		},
	})
}

func isForumEnabled(settings []byte) bool {
	if settings == nil {
		return false
	}
	var s map[string]any
	if err := json.Unmarshal(settings, &s); err != nil {
		return false
	}
	enabled, _ := s["forum_enabled"].(bool)
	return enabled
}

func replaceTask(template, task string) string {
	result := template
	for i := 0; i < len(result)-5; i++ {
		if result[i:i+6] == "{task}" {
			result = result[:i] + task + result[i+6:]
			break
		}
	}
	return result
}
