package forum

// AutoChatterConfig holds configuration for the auto-chatter behavior.
type AutoChatterConfig struct {
	IdleChance                float64
	IdleCooldownMinutes       int
	IdleDelayMinMinutes       int
	IdleDelayMaxMinutes       int
	ReplyChanceInitial        float64
	ReplyChanceDepth1         float64
	ReplyChanceDepth2         float64
	ReplyChanceDeep           float64
	ThreadWindowSeconds       int
	MaxRepliesPerThread       int
	AgentActionCooldownSeconds int
}

// DefaultAutoChatterConfig returns the default configuration.
func DefaultAutoChatterConfig() AutoChatterConfig {
	return AutoChatterConfig{
		IdleChance:                0.1,
		IdleCooldownMinutes:       30,
		IdleDelayMinMinutes:       5,
		IdleDelayMaxMinutes:       15,
		ReplyChanceInitial:        0.8,
		ReplyChanceDepth1:         0.6,
		ReplyChanceDepth2:         0.4,
		ReplyChanceDeep:           0.2,
		ThreadWindowSeconds:       120,
		MaxRepliesPerThread:       10,
		AgentActionCooldownSeconds: 60,
	}
}
