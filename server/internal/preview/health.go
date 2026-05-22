package preview

import (
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"time"
)

// HealthChecker performs TCP port probes and HTTP health checks.
type HealthChecker struct {
	timeout time.Duration
}

// NewHealthChecker creates a HealthChecker with the given probe timeout.
func NewHealthChecker(timeout time.Duration) *HealthChecker {
	if timeout <= 0 {
		timeout = 5 * time.Second
	}
	return &HealthChecker{
		timeout: timeout,
	}
}

// CheckTCP attempts a TCP connection to the given host:port.
func (hc *HealthChecker) CheckTCP(ctx context.Context, host string, port int) error {
	addr := fmt.Sprintf("%s:%d", host, port)
	dialer := net.Dialer{Timeout: hc.timeout}

	conn, err := dialer.DialContext(ctx, "tcp", addr)
	if err != nil {
		return fmt.Errorf("tcp probe %s: %w", addr, err)
	}
	conn.Close()
	return nil
}

// CheckHTTP performs an HTTP GET to the given URL and returns the response body.
// It considers only connection/serve errors as failures; HTTP error status codes
// (4xx, 5xx) are returned as the response without error to let the caller decide.
func (hc *HealthChecker) CheckHTTP(ctx context.Context, url string) (int, []byte, error) {
	client := &http.Client{Timeout: hc.timeout}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return 0, nil, fmt.Errorf("http probe %s: create request: %w", url, err)
	}

	resp, err := client.Do(req)
	if err != nil {
		return 0, nil, fmt.Errorf("http probe %s: %w", url, err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return resp.StatusCode, nil, fmt.Errorf("http probe %s: read body: %w", url, err)
	}

	return resp.StatusCode, body, nil
}

// HealthResult represents the outcome of a health check probe.
type HealthResult struct {
	Name   string `json:"name"`
	Passed bool   `json:"passed"`
	Status string `json:"status,omitempty"`
	Error  string `json:"error,omitempty"`
}

// CheckAll runs a complete suite of health checks against a preview environment.
func (hc *HealthChecker) CheckAll(ctx context.Context, host string, port int) []HealthResult {
	var results []HealthResult

	// TCP check
	tcpCtx, cancel := context.WithTimeout(ctx, hc.timeout)
	err := hc.CheckTCP(tcpCtx, host, port)
	cancel()

	if err != nil {
		results = append(results, HealthResult{
			Name:   "tcp",
			Passed: false,
			Error:  err.Error(),
		})
	} else {
		results = append(results, HealthResult{
			Name:   "tcp",
			Passed: true,
			Status: "reachable",
		})
	}

	// HTTP health check
	httpURL := fmt.Sprintf("http://%s:%d/api/health", host, port)
	httpCtx, cancel := context.WithTimeout(ctx, hc.timeout)
	statusCode, _, err := hc.CheckHTTP(httpCtx, httpURL)
	cancel()

	if err != nil {
		results = append(results, HealthResult{
			Name:   "http",
			Passed: false,
			Error:  err.Error(),
		})
	} else {
		results = append(results, HealthResult{
			Name:   "http",
			Passed: statusCode == http.StatusOK,
			Status: fmt.Sprintf("HTTP %d", statusCode),
		})
	}

	return results
}
