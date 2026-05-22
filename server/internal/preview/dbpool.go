package preview

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/jackc/pgx/v5/pgxpool"
)

// DBPool manages dynamic PostgreSQL database creation and destruction
// for preview environments using template databases.
type DBPool struct {
	adminPool *pgxpool.Pool
	dbPrefix  string
}

// NewDBPool creates a DBPool that uses the admin pool for management operations.
// dbPrefix is prefixed to preview database names (e.g. "preview_").
func NewDBPool(adminPool *pgxpool.Pool, dbPrefix string) *DBPool {
	if dbPrefix == "" {
		dbPrefix = "preview_"
	}
	return &DBPool{
		adminPool: adminPool,
		dbPrefix:  dbPrefix,
	}
}

// dbNameForEnv generates a deterministic database name for a preview environment.
// envIDs are UUIDs, so the name is unique and safe for PostgreSQL.
func (p *DBPool) dbNameForEnv(envID string) string {
	// Use first 8 chars of UUID for brevity
	shortID := envID
	if len(envID) > 8 {
		shortID = envID[:8]
	}
	return p.dbPrefix + shortID
}

// CreateFromTemplate creates a new database from the template_preview template.
// The template database "template_preview" must exist before calling this.
func (p *DBPool) CreateFromTemplate(ctx context.Context, envID string) (string, error) {
	dbName := p.dbNameForEnv(envID)

	// Terminate any stale connections first
	_, _ = p.adminPool.Exec(ctx,
		`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
		dbName,
	)

	// Drop if exists (from a previous failed env)
	_, _ = p.adminPool.Exec(ctx, fmt.Sprintf("DROP DATABASE IF EXISTS %s", pqQuoteIdent(dbName)))

	sql := fmt.Sprintf("CREATE DATABASE %s TEMPLATE template_preview", pqQuoteIdent(dbName))
	_, err := p.adminPool.Exec(ctx, sql)
	if err != nil {
		return "", fmt.Errorf("dbpool: create from template: %w", err)
	}

	slog.Info("dbpool: created database from template",
		"db_name", dbName,
		"env_id", envID,
	)

	return dbName, nil
}

// RunMigrations applies pending migrations to the preview database.
// It connects directly to the new database and runs the migration SQL.
func (p *DBPool) RunMigrations(ctx context.Context, envID, dbName string, migrationSQL []string) error {
	// Connect to the new database directly
	connStr := p.adminPool.Config().ConnConfig.ConnString() + " dbname=" + dbName
	pool, err := pgxpool.New(ctx, connStr)
	if err != nil {
		return fmt.Errorf("dbpool: connect to %s: %w", dbName, err)
	}
	defer pool.Close()

	// Run each migration statement in a transaction
	for i, stmt := range migrationSQL {
		if stmt == "" {
			continue
		}
		_, err := pool.Exec(ctx, stmt)
		if err != nil {
			return fmt.Errorf("dbpool: migration %d on %s: %w", i+1, dbName, err)
		}
	}

	slog.Info("dbpool: migrations applied",
		"db_name", dbName,
		"env_id", envID,
		"count", len(migrationSQL),
	)

	return nil
}

// DropDatabase drops the preview database, terminating all connections first.
func (p *DBPool) DropDatabase(ctx context.Context, envID, dbName string) error {
	// Terminate connections
	_, _ = p.adminPool.Exec(ctx,
		`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
		dbName,
	)

	sql := fmt.Sprintf("DROP DATABASE IF EXISTS %s", pqQuoteIdent(dbName))
	_, err := p.adminPool.Exec(ctx, sql)
	if err != nil {
		return fmt.Errorf("dbpool: drop database %s: %w", dbName, err)
	}

	slog.Info("dbpool: dropped database",
		"db_name", dbName,
		"env_id", envID,
	)

	return nil
}

// CleanupEnv drops the database for a preview environment.
func (p *DBPool) CleanupEnv(ctx context.Context, envID string) {
	dbName := p.dbNameForEnv(envID)
	if err := p.DropDatabase(ctx, envID, dbName); err != nil {
		slog.Error("dbpool: cleanup failed",
			"env_id", envID,
			"db_name", dbName,
			"error", err,
		)
	}
}

// pqQuoteIdent quotes a PostgreSQL identifier safely.
func pqQuoteIdent(name string) string {
	// Simple quoting: double every quote and wrap in double quotes
	quoted := make([]byte, 0, len(name)+2)
	quoted = append(quoted, '"')
	for _, c := range []byte(name) {
		if c == '"' {
			quoted = append(quoted, '"', '"')
		} else {
			quoted = append(quoted, c)
		}
	}
	quoted = append(quoted, '"')
	return string(quoted)
}
