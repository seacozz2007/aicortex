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
