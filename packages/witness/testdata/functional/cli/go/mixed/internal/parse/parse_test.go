package parse

import "testing"

func TestCmd(t *testing.T) {
	if Cmd(nil) != "list" {
		t.Fatal("default command")
	}
}
