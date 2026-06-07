package tunnel

import (
	"os"
	"strings"
)

// FeatureRuntimeTunnel reports whether runtime preview tunnel APIs are enabled.
// Default false so existing deployments behave identically until operators opt in.
func FeatureRuntimeTunnel() bool {
	v := strings.TrimSpace(os.Getenv("AICORTEX_FEATURE_RUNTIME_TUNNEL"))
	return v == "1" || strings.EqualFold(v, "true")
}
