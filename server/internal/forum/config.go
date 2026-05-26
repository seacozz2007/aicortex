package forum

// AutoChatterConfig holds configuration for the auto-chatter behavior.
// All fields are configurable and read from environment variables at startup.
type AutoChatterConfig struct {
	IdleChance                 float64
	IdleCooldownMinutes        int
	IdleDelayMinMinutes        int
	IdleDelayMaxMinutes        int
	ReplyChanceInitial         float64
	ReplyChanceDepth1          float64
	ReplyChanceDepth2          float64
	ReplyChanceDeep            float64
	ThreadWindowSeconds        int
	NewPostWindowSeconds       int
	MaxRepliesPerThread        int
	AgentActionCooldownSeconds int
}

// DefaultAutoChatterConfig returns the default configuration matching the PRD spec.
func DefaultAutoChatterConfig() AutoChatterConfig {
	return AutoChatterConfig{
		IdleChance:                 0.15,
		IdleCooldownMinutes:        60,
		IdleDelayMinMinutes:        60,
		IdleDelayMaxMinutes:        120,
		ReplyChanceInitial:         0.6,
		ReplyChanceDepth1:          0.4,
		ReplyChanceDepth2:          0.25,
		ReplyChanceDeep:            0.15,
		ThreadWindowSeconds:        120,
		NewPostWindowSeconds:       30,
		MaxRepliesPerThread:        10,
		AgentActionCooldownSeconds: 30,
	}
}
