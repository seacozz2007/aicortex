package artifact

import (
	"context"
	"log/slog"

	art "github.com/aicortex/aicortex/server/internal/artifact"
)

// ReportIssueArtifacts scans workDir for HTML previews and reports them to the server.
// Best-effort: errors are logged and never propagated to the caller.
func ReportIssueArtifacts(
	ctx context.Context,
	workDir string,
	report func(ctx context.Context, artifacts []map[string]string) error,
	log *slog.Logger,
) {
	candidates := art.ScanHTMLArtifacts(workDir)
	if len(candidates) == 0 {
		return
	}
	items := make([]map[string]string, 0, len(candidates))
	for _, c := range candidates {
		items = append(items, map[string]string{
			"rel_path": c.RelPath,
			"kind":     c.Kind,
			"title":    c.Title,
		})
	}
	if err := report(ctx, items); err != nil {
		if log != nil {
			log.Warn("report issue artifacts failed (non-fatal)", "error", err)
		}
	}
}
