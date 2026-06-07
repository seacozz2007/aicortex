package tunnel

import (
	"fmt"
)

const (
	MinPort         = 1024
	MaxPort         = 65535
	MaxTunnelsPerRT = 3
	MaxBodyBytes    = 10 << 20 // 10 MiB
	ProxyTimeout    = 30       // seconds
	ProbeTimeout    = 5        // seconds — health check on tunnel create
	ProxyRateLimit  = 120      // max proxy requests per tunnel per minute
	InactiveTTLHours = 24      // auto-disable tunnels with no proxy traffic
)

// ValidatePort returns an error when port is outside the allowed dev-server range.
func ValidatePort(port int) error {
	if port < MinPort || port > MaxPort {
		return fmt.Errorf("port must be between %d and %d", MinPort, MaxPort)
	}
	return nil
}
