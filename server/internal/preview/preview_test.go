package preview

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
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

// ── Command parsing tests ──────────────────────────────────────────────────────

func TestParseCommand_Deploy(t *testing.T) {
	cmd, ok := ParseCommand("/preview deploy")
	if !ok {
		t.Fatal("expected /preview deploy to be valid")
	}
	if cmd.Type != CmdDeploy {
		t.Fatalf("expected CmdDeploy, got %s", cmd.Type)
	}
}

func TestParseCommand_Stop(t *testing.T) {
	cmd, ok := ParseCommand("/preview stop")
	if !ok {
		t.Fatal("expected /preview stop to be valid")
	}
	if cmd.Type != CmdStop {
		t.Fatalf("expected CmdStop, got %s", cmd.Type)
	}
}

func TestParseCommand_Status(t *testing.T) {
	cmd, ok := ParseCommand("/preview status")
	if !ok {
		t.Fatal("expected /preview status to be valid")
	}
	if cmd.Type != CmdStatus {
		t.Fatalf("expected CmdStatus, got %s", cmd.Type)
	}
}

func TestParseCommand_Logs(t *testing.T) {
	cmd, ok := ParseCommand("/preview logs")
	if !ok {
		t.Fatal("expected /preview logs to be valid")
	}
	if cmd.Type != CmdLogs {
		t.Fatalf("expected CmdLogs, got %s", cmd.Type)
	}
}

func TestParseCommand_WithExtraArgs(t *testing.T) {
	cmd, ok := ParseCommand("/preview deploy my-branch")
	if !ok {
		t.Fatal("expected /preview deploy with extra args to be valid")
	}
	if cmd.Type != CmdDeploy {
		t.Fatalf("expected CmdDeploy, got %s", cmd.Type)
	}
}

func TestParseCommand_Invalid(t *testing.T) {
	tests := []string{
		"",
		"/preview",
		"/preview ",
		"/preview invalid",
		"not a command",
		"/other deploy",
		" /preview",
	}
	for _, tc := range tests {
		_, ok := ParseCommand(tc)
		if ok {
			t.Errorf("expected %q to be invalid", tc)
		}
	}
}

func TestParseCommand_CaseSensitive(t *testing.T) {
	// Commands are case-sensitive
	_, ok := ParseCommand("/preview Deploy")
	if ok {
		t.Fatal("expected /preview Deploy (capital D) to be invalid")
	}
}

// ── Status emoji tests ─────────────────────────────────────────────────────────

func TestStatusEmoji(t *testing.T) {
	tests := []struct {
		state ProvisionState
		want  string
	}{
		{StateCLONING, "🔄 cloning"},
		{StateINSTALLING, "🔄 installing"},
		{StateMIGRATING, "🔄 migrating"},
		{StateBUILDING, "🔄 building"},
		{StateSTARTING, "🔄 starting"},
		{StateREADY, "✅ ready"},
		{StateFAILED, "❌ failed"},
		{StateDELETED, "🗑️ deleted"},
	}
	for _, tc := range tests {
		got := statusEmoji(tc.state)
		if got != tc.want {
			t.Errorf("statusEmoji(%s) = %q, want %q", tc.state, got, tc.want)
		}
	}
}

func TestStatusEmoji_Unknown(t *testing.T) {
	got := statusEmoji("unknown")
	if got != "unknown" {
		t.Errorf("statusEmoji(unknown) = %q, want %q", got, "unknown")
	}
}

// ── Format env status tests ────────────────────────────────────────────────────

func TestFormatEnvStatus_Ready(t *testing.T) {
	env := db.PreviewEnvironment{
		Status: string(StateREADY),
		Port:   pgtype.Int4{Int32: 30001, Valid: true},
	}
	result := formatEnvStatus(env)
	if !contains(result, "✅ ready") {
		t.Errorf("expected status to contain '✅ ready', got:\n%s", result)
	}
	if !contains(result, "30001") {
		t.Errorf("expected port in output, got:\n%s", result)
	}
}

func TestFormatEnvStatus_Failed(t *testing.T) {
	env := db.PreviewEnvironment{
		Status:       string(StateFAILED),
		ErrorMessage: pgtype.Text{String: "build timeout", Valid: true},
	}
	result := formatEnvStatus(env)
	if !contains(result, "❌ failed") {
		t.Errorf("expected status to contain '❌ failed', got:\n%s", result)
	}
	if !contains(result, "build timeout") {
		t.Errorf("expected error message in output, got:\n%s", result)
	}
}

func TestFormatEnvStatus_NoPort(t *testing.T) {
	env := db.PreviewEnvironment{
		Status: string(StateCLONING),
	}
	result := formatEnvStatus(env)
	if !contains(result, "🔄 cloning") {
		t.Errorf("expected status to contain '🔄 cloning', got:\n%s", result)
	}
	if contains(result, "访问地址") {
		t.Errorf("expected no access URL for env without port, got:\n%s", result)
	}
}

// ── Format progress message tests ──────────────────────────────────────────────

func TestFormatProgressMessage_Ready(t *testing.T) {
	env := db.PreviewEnvironment{
		PrID:   "owner/repo#42",
		Status: string(StateREADY),
		Port:   pgtype.Int4{Int32: 30001, Valid: true},
	}
	msg := formatProgressMessage(env, StateREADY, nil)
	if !contains(msg, "已就绪") {
		t.Errorf("expected ready message, got: %s", msg)
	}
	if !contains(msg, "localhost:30001") {
		t.Errorf("expected port in message, got: %s", msg)
	}
}

func TestFormatProgressMessage_Failed(t *testing.T) {
	env := db.PreviewEnvironment{
		PrID:   "owner/repo#42",
		Status: string(StateFAILED),
	}
	msg := formatProgressMessage(env, StateFAILED, errTest("connection refused"))
	if !contains(msg, "部署失败") {
		t.Errorf("expected failure message, got: %s", msg)
	}
	if !contains(msg, "connection refused") {
		t.Errorf("expected error detail in message, got: %s", msg)
	}
}

func TestFormatProgressMessage_Deleted(t *testing.T) {
	env := db.PreviewEnvironment{
		PrID:   "owner/repo#42",
		Status: string(StateDELETED),
	}
	msg := formatProgressMessage(env, StateDELETED, nil)
	if !contains(msg, "已删除") {
		t.Errorf("expected deletion message, got: %s", msg)
	}
}

// ── Helpers ────────────────────────────────────────────────────────────────────

func contains(s, substr string) bool {
	return strings.Contains(s, substr)
}

