package design

import (
	"os"
	"strings"
)

// envDefaultTrue enables the feature when unset; set "false" or "0" to disable.
func envDefaultTrue(key string) bool {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return true
	}
	if v == "0" || strings.EqualFold(v, "false") {
		return false
	}
	return v == "1" || strings.EqualFold(v, "true")
}

// FeatureDesignStudio gates Design Studio routes and UI.
func FeatureDesignStudio() bool {
	return envDefaultTrue("AICORTEX_FEATURE_DESIGN_STUDIO")
}

// FeatureDesignExport gates PDF/PPTX/ZIP export.
func FeatureDesignExport() bool {
	return envDefaultTrue("AICORTEX_FEATURE_DESIGN_EXPORT")
}

// FeatureDesignJury gates Design Jury orchestrator + Theater UI.
func FeatureDesignJury() bool {
	return envDefaultTrue("AICORTEX_FEATURE_DESIGN_JURY")
}
