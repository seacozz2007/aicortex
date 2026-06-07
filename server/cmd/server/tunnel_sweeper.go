package main

import (
	"context"
	"log/slog"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/aicortex/aicortex/server/internal/tunnel"
)

func sweepInactiveRuntimeTunnels(ctx context.Context, pool *pgxpool.Pool) {
	if pool == nil || !tunnel.FeatureRuntimeTunnel() {
		return
	}
	tag, err := pool.Exec(ctx,
		`UPDATE runtime_tunnel
		 SET status = 'disabled', updated_at = now()
		 WHERE status = 'active'
		   AND updated_at < now() - make_interval(hours => $1)`,
		tunnel.InactiveTTLHours,
	)
	if err != nil {
		slog.Warn("tunnel sweeper: failed to disable inactive tunnels", "error", err)
		return
	}
	if n := tag.RowsAffected(); n > 0 {
		slog.Info("tunnel sweeper: disabled inactive tunnels", "count", n)
	}
}
