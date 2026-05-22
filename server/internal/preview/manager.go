package preview

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/aicortex/aicortex/server/internal/util"
	db "github.com/aicortex/aicortex/server/pkg/db/generated"
)

// Manager orchestrates preview environment lifecycle: creation, querying,
// stopping, deletion, idle timeout reclamation, and concurrency limits.
type Manager struct {
	queries     Querier
	portPool    *PortPool
	provisioner *Provisioner
	dbPool      *DBPool

	mu sync.Mutex

	maxEnvs      int
	maxBuildJobs int

	// idleWarn after this duration a warning is issued
	idleWarn time.Duration
	// idleForce after this duration the env is forcibly reclaimed
	idleForce time.Duration

	buildStepFns BuildStepFuncs
}

// BuildStepFuncs holds the optional step implementations for the provisioner.
type BuildStepFuncs struct {
	CloneFn    func(ctx context.Context, env db.PreviewEnvironment) error
	InstallFn  func(ctx context.Context, env db.PreviewEnvironment) error
	MigrateFn  func(ctx context.Context, env db.PreviewEnvironment) error
	BuildFn    func(ctx context.Context, env db.PreviewEnvironment) error
	StartFn    func(ctx context.Context, env db.PreviewEnvironment) error
}

// ManagerOption configures the Manager.
type ManagerOption func(*Manager)

// WithIdleTimeout sets the idle warning and force-reclaim durations.
func WithIdleTimeout(warn, force time.Duration) ManagerOption {
	return func(m *Manager) {
		m.idleWarn = warn
		m.idleForce = force
	}
}

// WithConcurrencyLimits sets max environments and max concurrent build jobs.
func WithConcurrencyLimits(maxEnvs, maxBuildJobs int) ManagerOption {
	return func(m *Manager) {
		m.maxEnvs = maxEnvs
		m.maxBuildJobs = maxBuildJobs
	}
}

// WithBuildSteps sets the provisioner build step functions.
func WithBuildSteps(fns BuildStepFuncs) ManagerOption {
	return func(m *Manager) {
		m.buildStepFns = fns
	}
}

// NewManager creates a new Manager with the given dependencies and options.
func NewManager(queries Querier, portPool *PortPool, dbPool *DBPool, provisioner *Provisioner, opts ...ManagerOption) *Manager {
	m := &Manager{
		queries:     queries,
		portPool:    portPool,
		provisioner: provisioner,
		dbPool:      dbPool,
		maxEnvs:     5,
		maxBuildJobs: 2,
		idleWarn:     12 * time.Hour,
		idleForce:    24 * time.Hour,
	}

	for _, opt := range opts {
		opt(m)
	}

	return m
}

// Create initiates a new preview environment.
func (m *Manager) Create(ctx context.Context, workspaceID, prID, repoOwner, repoName string, prNumber int32, branch string) (db.PreviewEnvironment, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Check concurrent env limit
	count, err := m.queries.CountActivePreviewEnvironments(ctx)
	if err != nil {
		return db.PreviewEnvironment{}, fmt.Errorf("manager: count active: %w", err)
	}
	if int(count) >= m.maxEnvs {
		return db.PreviewEnvironment{}, fmt.Errorf("manager: max active environments reached (%d)", m.maxEnvs)
	}

	// Create env record first to get the DB-generated UUID
	env, err := m.queries.CreatePreviewEnvironment(ctx, workspaceID, prID, repoOwner, repoName, prNumber, branch)
	if err != nil {
		return db.PreviewEnvironment{}, fmt.Errorf("manager: create env: %w", err)
	}

	envID := util.UUIDToString(env.ID)

	// Allocate a port using the DB UUID
	port, err := m.portPool.Allocate(ctx, envID)
	if err != nil {
		m.queries.DeletePreviewEnvironment(ctx, envID)
		return db.PreviewEnvironment{}, fmt.Errorf("manager: allocate port: %w", err)
	}

	// Update env record with the allocated port
	env, err = m.queries.UpdatePreviewEnvironmentPort(ctx, envID, int32(port))
	if err != nil {
		m.queries.DeletePreviewEnvironment(ctx, envID)
		m.portPool.ReleaseByPort(ctx, port)
		return db.PreviewEnvironment{}, fmt.Errorf("manager: update port: %w", err)
	}

	// Create the database
	if m.dbPool != nil {
		dbName, dbErr := m.dbPool.CreateFromTemplate(ctx, envID)
		if dbErr != nil {
			m.queries.DeletePreviewEnvironment(ctx, envID)
			m.portPool.ReleaseByPort(ctx, port)
			return db.PreviewEnvironment{}, fmt.Errorf("manager: create db: %w", dbErr)
		}

		env, err = m.queries.UpdatePreviewEnvironmentDbName(ctx, envID, dbName)
		if err != nil {
			m.queries.DeletePreviewEnvironment(ctx, envID)
			m.portPool.ReleaseByPort(ctx, port)
			m.dbPool.DropDatabase(ctx, envID, dbName)
			return db.PreviewEnvironment{}, fmt.Errorf("manager: update db name: %w", err)
		}
	}

	// Start provisioning asynchronously
	steps := m.buildSteps()
	m.provisioner.StartProvision(ctx, env, steps)

	slog.Info("manager: preview env created",
		"env_id", envID,
		"pr", prID,
		"port", port,
	)

	return env, nil
}

// Get returns a preview environment by ID.
func (m *Manager) Get(ctx context.Context, envID string) (db.PreviewEnvironment, error) {
	return m.queries.GetPreviewEnvironment(ctx, envID)
}

// List returns all preview environments for a workspace.
func (m *Manager) List(ctx context.Context, workspaceID string) ([]db.PreviewEnvironment, error) {
	return m.queries.ListPreviewEnvironmentsByWorkspace(ctx, workspaceID)
}

// Destroy tears down a preview environment: releases the port, drops the
// database, and marks the env as deleted.
func (m *Manager) Destroy(ctx context.Context, env db.PreviewEnvironment) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	envID := util.UUIDToString(env.ID)

	// Release port
	if err := m.portPool.Release(ctx, envID); err != nil {
		slog.Warn("manager: port release failed during destroy",
			"env_id", envID,
			"error", err,
		)
	}

	// Drop database
	if m.dbPool != nil {
		m.dbPool.CleanupEnv(ctx, envID)
	}

	// Mark as deleted
	if _, err := m.provisioner.TransitionTo(ctx, env, StateDELETED); err != nil {
		return fmt.Errorf("manager: mark deleted: %w", err)
	}

	slog.Info("manager: preview env destroyed", "env_id", envID)
	return nil
}

// ReDeploy triggers a re-deployment for an existing preview environment.
func (m *Manager) ReDeploy(ctx context.Context, env db.PreviewEnvironment) error {
	if ProvisionState(env.Status) == StateDELETED {
		return fmt.Errorf("manager: cannot re-deploy deleted env %s", util.UUIDToString(env.ID))
	}

	// Re-run the build pipeline
	steps := m.buildSteps()
	m.provisioner.StartProvision(ctx, env, steps)

	slog.Info("manager: preview env re-deploy triggered", "env_id", util.UUIDToString(env.ID))
	return nil
}

// ReclaimStale finds and reclaims environments that have exceeded idle limits.
// Envs idle for idleWarn duration get a warning; envs idle for idleForce are destroyed.
func (m *Manager) ReclaimStale(ctx context.Context) (reclaimed []db.PreviewEnvironment) {
	warnCutoff := time.Now().Add(-m.idleWarn)
	stale, err := m.queries.ListStalePreviewEnvironments(ctx, warnCutoff)
	if err != nil {
		slog.Error("manager: list stale environments", "error", err)
		return
	}

	forceCutoff := time.Now().Add(-m.idleForce)
	for _, env := range stale {
		if env.LastActivityAt.Time.Before(forceCutoff) {
			// Past idleForce — destroy immediately
			if err := m.Destroy(ctx, env); err != nil {
				slog.Error("manager: reclaim failed",
					"env_id", util.UUIDToString(env.ID),
					"error", err,
				)
				continue
			}
			reclaimed = append(reclaimed, env)
			slog.Info("manager: reclaimed stale env",
				"env_id", util.UUIDToString(env.ID),
				"idle_since", env.LastActivityAt.Time,
			)
		} else {
			// Past idleWarn but before idleForce — issue warning
			slog.Warn("manager: env idle too long, will be reclaimed soon",
				"env_id", util.UUIDToString(env.ID),
				"idle_since", env.LastActivityAt.Time,
				"warn_threshold", m.idleWarn.String(),
				"force_threshold", m.idleForce.String(),
			)
		}
	}

	return
}

// buildSteps assembles the provisioning pipeline from configured step functions.
func (m *Manager) buildSteps() []ProvisionStep {
	return []ProvisionStep{
		&CloningStep{RunFunc: m.buildStepFns.CloneFn},
		&InstallingStep{RunFunc: m.buildStepFns.InstallFn},
		&MigratingStep{RunFunc: m.buildStepFns.MigrateFn},
		&BuildingStep{RunFunc: m.buildStepFns.BuildFn},
		&StartingStep{RunFunc: m.buildStepFns.StartFn},
	}
}

