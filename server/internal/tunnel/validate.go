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
)

// ValidatePort returns an error when port is outside the allowed dev-server range.
func ValidatePort(port int) error {
	if port < MinPort || port > MaxPort {
		return fmt.Errorf("port must be between %d and %d", MinPort, MaxPort)
	}
	return nil
}
