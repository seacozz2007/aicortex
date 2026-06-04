package main

import (
	"context"
	"log/slog"
	"time"

	"github.com/aicortex/aicortex/server/internal/service"
	db "github.com/aicortex/aicortex/server/pkg/db/generated"
)

// runPollingScanner periodically scans for eligible agent-assigned issues and
// triggers execution runs for those that meet all conditions. The interval is
// configurable via POLLING_INTERVAL_MINUTES (default 15); the scanner can be
// disabled entirely via POLLING_ENABLED=false.
func runPollingScanner(ctx context.Context, queries *db.Queries, taskSvc *service.TaskService) {
	cfg := service.PollingConfigFromEnv()
	svc := service.NewPollingService(queries, taskSvc, cfg)

	if !svc.Enabled {
		slog.Info("polling scanner: disabled (POLLING_ENABLED=false)")
		return
	}

	slog.Info("polling scanner: started", "interval", svc.Interval.String())

	ticker := time.NewTicker(svc.Interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			slog.Info("polling scanner: stopped")
			return
		case <-ticker.C:
			scanned, triggered := svc.ScanAndTrigger(ctx)
			if triggered > 0 {
				slog.Info("polling scanner: cycle complete",
					"scanned", scanned,
					"triggered", triggered,
				)
			} else if scanned > 0 {
				slog.Debug("polling scanner: cycle complete, no triggers",
					"scanned", scanned,
				)
			}
		}
	}
}
