package tunnel

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

// DefaultScanPorts are used when AICORTEX_TUNNEL_SCAN_PORTS is unset.
var DefaultScanPorts = []int{5173, 3000, 8080, 4173}

// ScanPortsFromEnv returns the configured quick-add port list.
func ScanPortsFromEnv() []int {
	raw := strings.TrimSpace(os.Getenv("AICORTEX_TUNNEL_SCAN_PORTS"))
	if raw == "" {
		out := make([]int, len(DefaultScanPorts))
		copy(out, DefaultScanPorts)
		return out
	}
	ports, err := ParseScanPorts(raw)
	if err != nil || len(ports) == 0 {
		out := make([]int, len(DefaultScanPorts))
		copy(out, DefaultScanPorts)
		return out
	}
	return ports
}

// ParseScanPorts parses a comma-separated port list (e.g. "5173,3000,8080").
func ParseScanPorts(raw string) ([]int, error) {
	parts := strings.Split(raw, ",")
	ports := make([]int, 0, len(parts))
	seen := make(map[int]struct{}, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		port, err := strconv.Atoi(part)
		if err != nil {
			return nil, fmt.Errorf("invalid port %q", part)
		}
		if err := ValidatePort(port); err != nil {
			return nil, err
		}
		if _, ok := seen[port]; ok {
			continue
		}
		seen[port] = struct{}{}
		ports = append(ports, port)
	}
	if len(ports) == 0 {
		return nil, fmt.Errorf("no ports provided")
	}
	return ports, nil
}
