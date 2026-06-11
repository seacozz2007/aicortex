package tunnel

import "testing"

func TestParseScanPorts(t *testing.T) {
	ports, err := ParseScanPorts("5173, 3000,8080,4173")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(ports) != 4 || ports[0] != 5173 || ports[3] != 4173 {
		t.Fatalf("unexpected ports: %v", ports)
	}

	if _, err := ParseScanPorts("80"); err == nil {
		t.Fatal("expected invalid port below 1024 to fail")
	}
}

func TestScanPortsFromEnvDefault(t *testing.T) {
	t.Setenv("AICORTEX_TUNNEL_SCAN_PORTS", "")
	ports := ScanPortsFromEnv()
	if len(ports) != len(DefaultScanPorts) {
		t.Fatalf("expected default ports, got %v", ports)
	}
}
