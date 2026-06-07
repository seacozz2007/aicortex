package artifact

import (
	"os"
	"strings"
)

// FeatureArtifactBrowse reports whether read-only task artifact browsing is enabled.
func FeatureArtifactBrowse() bool {
	v := strings.TrimSpace(os.Getenv("AICORTEX_FEATURE_ARTIFACT_BROWSE"))
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
