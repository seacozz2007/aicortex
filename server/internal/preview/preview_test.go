package preview

import (
	"context"
	"testing"
	"time"

	db "github.com/aicortex/aicortex/server/pkg/db/generated"
)

// mockQuerier implements Querier for testing.
type mockQuerier struct {
	countActiveEnvs  int64
	createEnvResult  db.PreviewEnvironment
	getEnvResult     db.PreviewEnvironment
	getEnvByPRResult db.PreviewEnvironment
	listEnvsResult   []db.PreviewEnvironment
	listStaleResult  []db.PreviewEnvironment
	allocatePortResult db.PreviewPortPool
	updateStatusResult db.PreviewEnvironment
	updateErrorResult  db.PreviewEnvironment
	deleteErr        error
}

func (m *mockQuerier) ListPreviewEnvironmentsByWorkspace(ctx context.Context, workspaceID string) ([]db.PreviewEnvironment, error) {
	return m.listEnvsResult, nil
}

func (m *mockQuerier) GetPreviewEnvironment(ctx context.Context, id string) (db.PreviewEnvironment, error) {
	return m.getEnvResult, nil
}

func (m *mockQuerier) GetPreviewEnvironmentByPR(ctx context.Context, workspaceID, prID string) (db.PreviewEnvironment, error) {
	return m.getEnvByPRResult, nil
}

func (m *mockQuerier) CreatePreviewEnvironment(ctx context.Context, workspaceID, prID, repoOwner, repoName string, prNumber int32, branch string) (db.PreviewEnvironment, error) {
	return m.createEnvResult, nil
}

func (m *mockQuerier) UpdatePreviewEnvironmentStatus(ctx context.Context, id, status string) (db.PreviewEnvironment, error) {
	m.updateStatusResult.Status = status
	return m.updateStatusResult, nil
}

func (m *mockQuerier) UpdatePreviewEnvironmentPort(ctx context.Context, id string, port int32) (db.PreviewEnvironment, error) {
	return m.updateStatusResult, nil
}

func (m *mockQuerier) UpdatePreviewEnvironmentError(ctx context.Context, id, status, errorMessage string) (db.PreviewEnvironment, error) {
	return m.updateErrorResult, nil
}

func (m *mockQuerier) UpdatePreviewEnvironmentCommit(ctx context.Context, id, commitSHA string) (db.PreviewEnvironment, error) {
	return m.updateStatusResult, nil
}

func (m *mockQuerier) UpdatePreviewEnvironmentDbName(ctx context.Context, id, dbName string) (db.PreviewEnvironment, error) {
	return m.updateStatusResult, nil
}

func (m *mockQuerier) TouchPreviewEnvironment(ctx context.Context, id string) error {
	return nil
}

func (m *mockQuerier) DeletePreviewEnvironment(ctx context.Context, id string) error {
	return m.deleteErr
}

func (m *mockQuerier) CountActivePreviewEnvironments(ctx context.Context) (int64, error) {
	return m.countActiveEnvs, nil
}

func (m *mockQuerier) ListStalePreviewEnvironments(ctx context.Context, before time.Time) ([]db.PreviewEnvironment, error) {
	return m.listStaleResult, nil
}

func (m *mockQuerier) AllocatePort(ctx context.Context, envID string) (db.PreviewPortPool, error) {
	return m.allocatePortResult, nil
}

func (m *mockQuerier) ReleasePort(ctx context.Context, envID string) error {
	return nil
}

func (m *mockQuerier) ReleasePortByPort(ctx context.Context, port int32) error {
	return nil
}

func (m *mockQuerier) UpsertGitHubPullRequest(ctx context.Context, workspaceID string, installationID int64, repoOwner, repoName string, prNumber int32, title, htmlURL, branch, state string) (string, error) {
	return "mock-pr-id", nil
}

func (m *mockQuerier) GetIssueByNumber(ctx context.Context, workspaceID string, number int32) (string, error) {
	return "", nil
}

func (m *mockQuerier) LinkIssueToPullRequest(ctx context.Context, issueID, pullRequestID string) error {
	return nil
}

// noopEventBus implements EventBus for testing.
type noopEventBus struct{}

func (n *noopEventBus) Publish(eventType string, env db.PreviewEnvironment, state ProvisionState, err error) {}

func TestPortPool_Allocate(t *testing.T) {
	q := &mockQuerier{
		allocatePortResult: db.PreviewPortPool{Port: 30001},
	}
	pool := NewPortPool(q)

	port, err := pool.Allocate(context.Background(), "env-123")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if port != 30001 {
		t.Fatalf("expected port 30001, got %d", port)
	}
}

func TestPortPool_Release(t *testing.T) {
	q := &mockQuerier{}
	pool := NewPortPool(q)

	err := pool.Release(context.Background(), "env-123")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestPortPool_ReleaseByPort(t *testing.T) {
	q := &mockQuerier{}
	pool := NewPortPool(q)

	err := pool.ReleaseByPort(context.Background(), 30005)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestProvisioner_ValidTransition(t *testing.T) {
	tests := []struct {
		current ProvisionState
		next    ProvisionState
		valid   bool
	}{
		{StateCLONING, StateINSTALLING, true},
		{StateCLONING, StateFAILED, true},
		{StateCLONING, StateREADY, false},
		{StateINSTALLING, StateMIGRATING, true},
		{StateMIGRATING, StateBUILDING, true},
		{StateBUILDING, StateSTARTING, true},
		{StateSTARTING, StateREADY, true},
		{StateREADY, StateDELETED, true},
		{StateFAILED, StateDELETED, true},
		{StateREADY, StateFAILED, false},
		{StateDELETED, StateREADY, false},
		{StateFAILED, StateREADY, false},
	}

	for _, tc := range tests {
		got := isValidTransition(tc.current, tc.next)
		if got != tc.valid {
			t.Errorf("isValidTransition(%s → %s) = %v, want %v",
				tc.current, tc.next, got, tc.valid)
		}
	}
}

func TestProvisioner_TransitionTo(t *testing.T) {
	q := &mockQuerier{
		updateStatusResult: db.PreviewEnvironment{
			Status: string(StateINSTALLING),
		},
	}
	prov := NewProvisioner(q, 2, &noopEventBus{})

	env := db.PreviewEnvironment{
		Status: string(StateCLONING),
	}

	updated, err := prov.TransitionTo(context.Background(), env, StateINSTALLING)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if updated.Status != string(StateINSTALLING) {
		t.Fatalf("expected status %s, got %s", StateINSTALLING, updated.Status)
	}
}

func TestProvisioner_InvalidTransition(t *testing.T) {
	q := &mockQuerier{}
	prov := NewProvisioner(q, 2, &noopEventBus{})

	env := db.PreviewEnvironment{
		Status: string(StateCLONING),
	}

	_, err := prov.TransitionTo(context.Background(), env, StateREADY)
	if err == nil {
		t.Fatal("expected error for invalid transition CLONING → READY")
	}
}

func TestProvisioner_TransitionToError(t *testing.T) {
	q := &mockQuerier{
		updateErrorResult: db.PreviewEnvironment{
			Status: string(StateFAILED),
		},
	}
	prov := NewProvisioner(q, 2, &noopEventBus{})

	env := db.PreviewEnvironment{
		Status: string(StateCLONING),
	}

	updated, err := prov.TransitionToError(context.Background(), env, errTest("clone failed"))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if updated.Status != string(StateFAILED) {
		t.Fatalf("expected status %s, got %s", StateFAILED, updated.Status)
	}
}

func TestNewManager(t *testing.T) {
	q := &mockQuerier{}
	pool := NewPortPool(q)
	prov := NewProvisioner(q, 2, &noopEventBus{})

	mgr := NewManager(q, pool, nil, prov,
		WithConcurrencyLimits(5, 2),
		WithIdleTimeout(12*time.Hour, 24*time.Hour),
	)

	if mgr.maxEnvs != 5 {
		t.Fatalf("expected maxEnvs=5, got %d", mgr.maxEnvs)
	}
	if mgr.maxBuildJobs != 2 {
		t.Fatalf("expected maxBuildJobs=2, got %d", mgr.maxBuildJobs)
	}
}

func TestManager_ConcurrencyLimit(t *testing.T) {
	q := &mockQuerier{
		countActiveEnvs: 5, // Already at limit
	}
	pool := NewPortPool(q)
	prov := NewProvisioner(q, 2, &noopEventBus{})

	mgr := NewManager(q, pool, nil, prov,
		WithConcurrencyLimits(5, 2),
	)

	_, err := mgr.Create(context.Background(), "ws-1", "pr-1", "owner", "repo", 1, "main")
	if err == nil {
		t.Fatal("expected error when at concurrency limit")
	}
}

func TestManager_Destroy(t *testing.T) {
	q := &mockQuerier{
		updateStatusResult: db.PreviewEnvironment{},
		updateErrorResult:  db.PreviewEnvironment{},
	}
	pool := NewPortPool(q)
	prov := NewProvisioner(q, 2, &noopEventBus{})

	mgr := NewManager(q, pool, nil, prov)

	env := db.PreviewEnvironment{
		Status: string(StateREADY),
	}
	err := mgr.Destroy(context.Background(), env)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

// errTest is a test error type.
type errTest string

func (e errTest) Error() string { return string(e) }
