package agent

import "context"

// ACPChatConn is a reusable ACP session for multi-turn chat. Implementations
// keep the child CLI alive across turns and expose RunPrompt for each message.
type ACPChatConn interface {
	SessionID() string
	RunPrompt(ctx context.Context, prompt, systemPrompt string) (*Session, error)
	Close() error
}
