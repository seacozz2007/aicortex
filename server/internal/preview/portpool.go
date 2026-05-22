package preview

import (
	"context"
	"fmt"
	"log/slog"
	"net"
	"sync"
	"time"
)

// PortPool manages allocation and release of ports for preview environments.
// Ports are allocated from the range 30000-30100 and tracked in the database
// via the preview_port_pool table.
type PortPool struct {
	queries Querier
	mu      sync.Mutex

	minPort int
	maxPort int
}

// NewPortPool creates a PortPool that allocates from minPort..maxPort.
func NewPortPool(queries Querier) *PortPool {
	return &PortPool{
		queries: queries,
		minPort: 30000,
		maxPort: 30100,
	}
}

// Allocate reserves a free port from the pool and assigns it to the given envID.
// Returns the allocated port number. Returns an error if no ports are available.
func (p *PortPool) Allocate(ctx context.Context, envID string) (int, error) {
	p.mu.Lock()
	defer p.mu.Unlock()

	row, err := p.queries.AllocatePort(ctx, envID)
	if err != nil {
		return 0, fmt.Errorf("portpool: allocate: %w", err)
	}

	slog.Info("portpool: allocated port",
		"port", row.Port,
		"env_id", envID,
	)

	return int(row.Port), nil
}

// Release frees the port associated with the given envID back to the pool.
func (p *PortPool) Release(ctx context.Context, envID string) error {
	p.mu.Lock()
	defer p.mu.Unlock()

	err := p.queries.ReleasePort(ctx, envID)
	if err != nil {
		return fmt.Errorf("portpool: release for env %s: %w", envID, err)
	}

	slog.Info("portpool: released port for env", "env_id", envID)
	return nil
}

// ReleaseByPort frees a specific port back to the pool.
func (p *PortPool) ReleaseByPort(ctx context.Context, port int) error {
	err := p.queries.ReleasePortByPort(ctx, int32(port))
	if err != nil {
		return fmt.Errorf("portpool: release port %d: %w", port, err)
	}
	slog.Info("portpool: released port", "port", port)
	return nil
}

// StartCheck verifies all ports in the range are actually free at the OS level
// (not occupied by another process on this VM). Logs warnings for in-use ports.
func (p *PortPool) StartCheck(ctx context.Context) error {
	p.mu.Lock()
	defer p.mu.Unlock()

	var warns int
	for port := p.minPort; port <= p.maxPort; port++ {
		addr := fmt.Sprintf(":%d", port)
		conn, err := net.DialTimeout("tcp", addr, 200*time.Millisecond)
		if err == nil {
			conn.Close()
			slog.Warn("portpool: port already in use at startup",
				"port", port,
			)
			warns++
		}
	}

	if warns > 0 {
		slog.Warn("portpool: startup check complete",
			"ports_in_use", warns,
			"range", fmt.Sprintf("%d-%d", p.minPort, p.maxPort),
		)
	} else {
		slog.Info("portpool: startup check passed",
			"range", fmt.Sprintf("%d-%d", p.minPort, p.maxPort),
		)
	}
	return nil
}
