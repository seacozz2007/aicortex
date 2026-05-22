package preview

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/aicortex/aicortex/server/internal/util"
	db "github.com/aicortex/aicortex/server/pkg/db/generated"
)

// ProvisionState represents a step in the preview environment provisioning pipeline.
type ProvisionState string

const (
	StateCLONING    ProvisionState = "cloning"
	StateINSTALLING ProvisionState = "installing"
	StateMIGRATING  ProvisionState = "migrating"
	StateBUILDING   ProvisionState = "building"
	StateSTARTING   ProvisionState = "starting"
	StateREADY      ProvisionState = "ready"
	StateFAILED     ProvisionState = "failed"
	StateDELETED    ProvisionState = "deleted"
)

// stateTransitions defines valid state transitions.
var stateTransitions = map[ProvisionState][]ProvisionState{
	StateCLONING:    {StateINSTALLING, StateFAILED},
	StateINSTALLING: {StateMIGRATING, StateFAILED},
	StateMIGRATING:  {StateBUILDING, StateFAILED},
	StateBUILDING:   {StateSTARTING, StateFAILED},
	StateSTARTING:   {StateREADY, StateFAILED},
	StateREADY:      {StateDELETED},
	StateFAILED:     {StateDELETED},
	StateDELETED:    {},
}

// Provisioner manages the provisioning state machine for preview environments.
// It uses a job queue to limit concurrent builds to the configured capacity.
type Provisioner struct {
	queries  Querier
	jobQueue chan struct{}
	events   EventBus
}

// EventBus is the interface for publishing provisioning events.
type EventBus interface {
	Publish(eventType string, env db.PreviewEnvironment, state ProvisionState, err error)
}

// NewProvisioner creates a Provisioner with the given concurrency limit.
func NewProvisioner(queries Querier, maxConcurrent int, events EventBus) *Provisioner {
	if maxConcurrent < 1 {
		maxConcurrent = 2
	}
	return &Provisioner{
		queries:  queries,
		jobQueue: make(chan struct{}, maxConcurrent),
		events:   events,
	}
}

// isValidTransition checks whether moving from current to next is valid.
func isValidTransition(current, next ProvisionState) bool {
	allowed, ok := stateTransitions[current]
	if !ok {
		return false
	}
	for _, s := range allowed {
		if s == next {
			return true
		}
	}
	return false
}

// TransitionTo attempts to move the environment to the given state.
// Returns an error if the transition is invalid or the DB update fails.
func (p *Provisioner) TransitionTo(ctx context.Context, env db.PreviewEnvironment, next ProvisionState) (db.PreviewEnvironment, error) {
	current := ProvisionState(env.Status)
	envID := p.envID(env)

	if !isValidTransition(current, next) {
		return env, fmt.Errorf("provisioner: invalid transition %s → %s", current, next)
	}

	updated, err := p.queries.UpdatePreviewEnvironmentStatus(ctx, envID, string(next))
	if err != nil {
		return env, fmt.Errorf("provisioner: update status %s: %w", next, err)
	}

	slog.Info("provisioner: state transition",
		"env_id", envID,
		"from", current,
		"to", next,
	)

	if p.events != nil {
		p.events.Publish("preview:state_changed", updated, next, nil)
	}

	return updated, nil
}

// TransitionToError transitions the environment to FAILED with an error message.
func (p *Provisioner) TransitionToError(ctx context.Context, env db.PreviewEnvironment, err error) (db.PreviewEnvironment, error) {
	current := ProvisionState(env.Status)
	next := StateFAILED

	errMsg := err.Error()
	envID := p.envID(env)

	updated, dbErr := p.queries.UpdatePreviewEnvironmentError(ctx, envID, string(next), errMsg)
	if dbErr != nil {
		return env, fmt.Errorf("provisioner: mark failed: %w", dbErr)
	}

	slog.Warn("provisioner: state transition to FAILED",
		"env_id", envID,
		"from", current,
		"error", errMsg,
	)

	if p.events != nil {
		p.events.Publish("preview:state_changed", updated, next, err)
	}

	return updated, nil
}

// StartProvision kicks off an async provisioning job. It acquires a semaphore
// slot and runs the pipeline in a goroutine. The pipeline steps are mocked
// here; real implementations would clone the repo, install deps, etc.
func (p *Provisioner) StartProvision(ctx context.Context, env db.PreviewEnvironment, steps []ProvisionStep) {
	// Acquire semaphore
	select {
	case p.jobQueue <- struct{}{}:
	case <-ctx.Done():
		return
	}

	go func() {
		defer func() { <-p.jobQueue }()

		current := env
		for _, step := range steps {
			next := step.State()

			updated, err := p.TransitionTo(ctx, current, next)
			if err != nil {
				p.TransitionToError(ctx, current, err)
				return
			}
			current = updated

			// Execute the step work
			if err := step.Run(ctx, current); err != nil {
				p.TransitionToError(ctx, current, err)
				return
			}
		}

		// Final transition to READY
		p.TransitionTo(ctx, current, StateREADY)
	}()
}

// envID returns the string representation of the environment's UUID.
func (p *Provisioner) envID(env db.PreviewEnvironment) string {
	return util.UUIDToString(env.ID)
}

// ProvisionStep is a single step in the provisioning pipeline.
type ProvisionStep interface {
	State() ProvisionState
	Run(ctx context.Context, env db.PreviewEnvironment) error
}

// CloningStep implements the clone step.
type CloningStep struct {
	// RunFunc is the actual clone implementation. Nil for test/placeholder.
	RunFunc func(ctx context.Context, env db.PreviewEnvironment) error
}

func (s *CloningStep) State() ProvisionState { return StateINSTALLING }
func (s *CloningStep) Run(ctx context.Context, env db.PreviewEnvironment) error {
	if s.RunFunc == nil {
		return nil
	}
	return s.RunFunc(ctx, env)
}

// InstallingStep implements the dependency install step.
type InstallingStep struct {
	RunFunc func(ctx context.Context, env db.PreviewEnvironment) error
}

func (s *InstallingStep) State() ProvisionState { return StateMIGRATING }
func (s *InstallingStep) Run(ctx context.Context, env db.PreviewEnvironment) error {
	if s.RunFunc == nil {
		return nil
	}
	return s.RunFunc(ctx, env)
}

// MigratingStep implements the database migration step.
type MigratingStep struct {
	RunFunc func(ctx context.Context, env db.PreviewEnvironment) error
}

func (s *MigratingStep) State() ProvisionState { return StateBUILDING }
func (s *MigratingStep) Run(ctx context.Context, env db.PreviewEnvironment) error {
	if s.RunFunc == nil {
		return nil
	}
	return s.RunFunc(ctx, env)
}

// BuildingStep implements the build step.
type BuildingStep struct {
	RunFunc func(ctx context.Context, env db.PreviewEnvironment) error
}

func (s *BuildingStep) State() ProvisionState { return StateSTARTING }
func (s *BuildingStep) Run(ctx context.Context, env db.PreviewEnvironment) error {
	if s.RunFunc == nil {
		return nil
	}
	return s.RunFunc(ctx, env)
}

// StartingStep implements the service start step.
type StartingStep struct {
	RunFunc func(ctx context.Context, env db.PreviewEnvironment) error
}

func (s *StartingStep) State() ProvisionState { return StateREADY }
func (s *StartingStep) Run(ctx context.Context, env db.PreviewEnvironment) error {
	if s.RunFunc == nil {
		return nil
	}
	return s.RunFunc(ctx, env)
}

// DefaultBuildSteps returns the standard provisioning pipeline.
func DefaultBuildSteps(cloneFn, installFn, migrateFn, buildFn, startFn func(ctx context.Context, env db.PreviewEnvironment) error) []ProvisionStep {
	// Set a reasonable timeout for the build steps to prevent stuck builds
	buildCtx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()
	_ = buildCtx

	return []ProvisionStep{
		&CloningStep{RunFunc: cloneFn},
		&InstallingStep{RunFunc: installFn},
		&MigratingStep{RunFunc: migrateFn},
		&BuildingStep{RunFunc: buildFn},
		&StartingStep{RunFunc: startFn},
	}
}
