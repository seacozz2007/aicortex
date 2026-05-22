package preview

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/aicortex/aicortex/server/internal/util"
	db "github.com/aicortex/aicortex/server/pkg/db/generated"
)

// Querier defines the database operations needed by the preview package.
// Methods use string IDs for simplicity; the concrete adapter converts to pgtype.
type Querier interface {
	ListPreviewEnvironmentsByWorkspace(ctx context.Context, workspaceID string) ([]db.PreviewEnvironment, error)
	GetPreviewEnvironment(ctx context.Context, id string) (db.PreviewEnvironment, error)
	GetPreviewEnvironmentByPR(ctx context.Context, workspaceID, prID string) (db.PreviewEnvironment, error)
	CreatePreviewEnvironment(ctx context.Context, workspaceID, prID, repoOwner, repoName string, prNumber int32, branch string) (db.PreviewEnvironment, error)
	UpdatePreviewEnvironmentStatus(ctx context.Context, id, status string) (db.PreviewEnvironment, error)
	UpdatePreviewEnvironmentPort(ctx context.Context, id string, port int32) (db.PreviewEnvironment, error)
	UpdatePreviewEnvironmentError(ctx context.Context, id, status, errorMessage string) (db.PreviewEnvironment, error)
	UpdatePreviewEnvironmentCommit(ctx context.Context, id, commitSHA string) (db.PreviewEnvironment, error)
	UpdatePreviewEnvironmentDbName(ctx context.Context, id string, dbName string) (db.PreviewEnvironment, error)
	TouchPreviewEnvironment(ctx context.Context, id string) error
	DeletePreviewEnvironment(ctx context.Context, id string) error
	CountActivePreviewEnvironments(ctx context.Context) (int64, error)
	ListStalePreviewEnvironments(ctx context.Context, before time.Time) ([]db.PreviewEnvironment, error)
	AllocatePort(ctx context.Context, envID string) (db.PreviewPortPool, error)
	ReleasePort(ctx context.Context, envID string) error
	ReleasePortByPort(ctx context.Context, port int32) error
}

// querierAdapter wraps db.Queries and converts between string and pgtype types.
type querierAdapter struct {
	inner *db.Queries
}

// NewQuerierAdapter creates a Querier from a db.Queries instance.
func NewQuerierAdapter(q *db.Queries) Querier {
	return &querierAdapter{inner: q}
}

func parseUUID(s string) pgtype.UUID {
	return util.MustParseUUID(s)
}

func toPgtypeText(s string) pgtype.Text {
	return pgtype.Text{String: s, Valid: s != ""}
}

func toPgtypeInt4(n int32) pgtype.Int4 {
	return pgtype.Int4{Int32: n, Valid: true}
}

func toPgtypeTimestamptz(t time.Time) pgtype.Timestamptz {
	return pgtype.Timestamptz{Time: t, Valid: true, InfinityModifier: pgtype.Finite}
}

func (a *querierAdapter) ListPreviewEnvironmentsByWorkspace(ctx context.Context, workspaceID string) ([]db.PreviewEnvironment, error) {
	return a.inner.ListPreviewEnvironmentsByWorkspace(ctx, parseUUID(workspaceID))
}

func (a *querierAdapter) GetPreviewEnvironment(ctx context.Context, id string) (db.PreviewEnvironment, error) {
	return a.inner.GetPreviewEnvironment(ctx, parseUUID(id))
}

func (a *querierAdapter) GetPreviewEnvironmentByPR(ctx context.Context, workspaceID, prID string) (db.PreviewEnvironment, error) {
	return a.inner.GetPreviewEnvironmentByPR(ctx, db.GetPreviewEnvironmentByPRParams{
		WorkspaceID: parseUUID(workspaceID),
		PrID:        prID,
	})
}

func (a *querierAdapter) CreatePreviewEnvironment(ctx context.Context, workspaceID, prID, repoOwner, repoName string, prNumber int32, branch string) (db.PreviewEnvironment, error) {
	return a.inner.CreatePreviewEnvironment(ctx, db.CreatePreviewEnvironmentParams{
		WorkspaceID: parseUUID(workspaceID),
		PrID:        prID,
		RepoOwner:   repoOwner,
		RepoName:    repoName,
		PrNumber:    prNumber,
		Branch:      branch,
	})
}

func (a *querierAdapter) UpdatePreviewEnvironmentStatus(ctx context.Context, id, status string) (db.PreviewEnvironment, error) {
	return a.inner.UpdatePreviewEnvironmentStatus(ctx, db.UpdatePreviewEnvironmentStatusParams{
		ID:     parseUUID(id),
		Status: status,
	})
}

func (a *querierAdapter) UpdatePreviewEnvironmentPort(ctx context.Context, id string, port int32) (db.PreviewEnvironment, error) {
	return a.inner.UpdatePreviewEnvironmentPort(ctx, db.UpdatePreviewEnvironmentPortParams{
		ID:   parseUUID(id),
		Port: toPgtypeInt4(port),
	})
}

func (a *querierAdapter) UpdatePreviewEnvironmentError(ctx context.Context, id, status, errorMessage string) (db.PreviewEnvironment, error) {
	return a.inner.UpdatePreviewEnvironmentError(ctx, db.UpdatePreviewEnvironmentErrorParams{
		ID:           parseUUID(id),
		Status:       status,
		ErrorMessage: toPgtypeText(errorMessage),
	})
}

func (a *querierAdapter) UpdatePreviewEnvironmentCommit(ctx context.Context, id, commitSHA string) (db.PreviewEnvironment, error) {
	return a.inner.UpdatePreviewEnvironmentCommit(ctx, db.UpdatePreviewEnvironmentCommitParams{
		ID:        parseUUID(id),
		CommitSha: commitSHA,
	})
}

func (a *querierAdapter) UpdatePreviewEnvironmentDbName(ctx context.Context, id, dbName string) (db.PreviewEnvironment, error) {
	return a.inner.UpdatePreviewEnvironmentDbName(ctx, db.UpdatePreviewEnvironmentDbNameParams{
		ID:     parseUUID(id),
		DbName: toPgtypeText(dbName),
	})
}

func (a *querierAdapter) TouchPreviewEnvironment(ctx context.Context, id string) error {
	return a.inner.TouchPreviewEnvironment(ctx, parseUUID(id))
}

func (a *querierAdapter) DeletePreviewEnvironment(ctx context.Context, id string) error {
	return a.inner.DeletePreviewEnvironment(ctx, parseUUID(id))
}

func (a *querierAdapter) CountActivePreviewEnvironments(ctx context.Context) (int64, error) {
	return a.inner.CountActivePreviewEnvironments(ctx)
}

func (a *querierAdapter) ListStalePreviewEnvironments(ctx context.Context, before time.Time) ([]db.PreviewEnvironment, error) {
	return a.inner.ListStalePreviewEnvironments(ctx, toPgtypeTimestamptz(before))
}

func (a *querierAdapter) AllocatePort(ctx context.Context, envID string) (db.PreviewPortPool, error) {
	return a.inner.AllocatePort(ctx, parseUUID(envID))
}

func (a *querierAdapter) ReleasePort(ctx context.Context, envID string) error {
	return a.inner.ReleasePort(ctx, parseUUID(envID))
}

func (a *querierAdapter) ReleasePortByPort(ctx context.Context, port int32) error {
	return a.inner.ReleasePortByPort(ctx, port)
}
