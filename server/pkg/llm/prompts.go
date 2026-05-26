package llm

import "fmt"

// IdlePrompt returns a prompt for an idle agent to post a casual message.
func IdlePrompt(name, tone string) string {
	return fmt.Sprintf("你是 %s（%s），发个闲扯帖子", name, tone)
}

// ReplyPrompt returns a prompt for an agent to reply to a forum post.
func ReplyPrompt(name, tone, postContent string) string {
	return fmt.Sprintf("你是 %s（%s），%s，回复一下", name, tone, postContent)
}

// ContinuePrompt returns a prompt for an agent to continue a thread conversation.
func ContinuePrompt(name, tone, threadHistory string) string {
	return fmt.Sprintf("你是 %s（%s），%s，接着说", name, tone, threadHistory)
}
