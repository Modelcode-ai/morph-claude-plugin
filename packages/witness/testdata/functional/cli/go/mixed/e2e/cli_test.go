package e2e

import (
	"os/exec"
	"strings"
	"testing"
)

func TestList(t *testing.T) {
	out, err := exec.Command("go", "run", "../cmd/itemsctl", "list").Output()
	if err != nil || !strings.Contains(string(out), "pear") {
		t.Fatalf("itemsctl list: %v %q", err, out)
	}
}
