package tunnel

import "testing"

func TestValidatePort(t *testing.T) {
	if err := ValidatePort(5173); err != nil {
		t.Fatalf("expected 5173 to be valid: %v", err)
	}
	if err := ValidatePort(1023); err == nil {
		t.Fatal("expected 1023 to be rejected")
	}
	if err := ValidatePort(70000); err == nil {
		t.Fatal("expected 70000 to be rejected")
	}
}
