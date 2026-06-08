package artifact

import (
	"os"
	"strings"
)

// FeatureArtifactBrowse reports whether read-only task artifact browsing is enabled.
// Default on; set AICORTEX_FEATURE_ARTIFACT_BROWSE=false to disable.
func FeatureArtifactBrowse() bool {
	v := strings.TrimSpace(os.Getenv("AICORTEX_FEATURE_ARTIFACT_BROWSE"))
	if v == "" {
		return true
	}
	if v == "0" || strings.EqualFold(v, "false") {
		return false
	}
	return v == "1" || strings.EqualFold(v, "true")
}

// FeatureIssuePreview reports whether issue-level artifact preview is enabled.
func FeatureIssuePreview() bool {
	v := strings.TrimSpace(os.Getenv("AICORTEX_FEATURE_ISSUE_PREVIEW"))
	return v == "1" || strings.EqualFold(v, "true")
}

// FeatureArtifactServing reports whether task artifact raw/list relay is allowed.
func FeatureArtifactServing() bool {
	return FeatureArtifactBrowse() || FeatureIssuePreview()
}
