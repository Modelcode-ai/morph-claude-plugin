package kit

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"testing"
)

var unsafe = regexp.MustCompile(`[^\w.@-]+`)

// record appends what the test saw to its witness evidence timeline (a no-op outside witness).
func record(t *testing.T, kind string, data map[string]any) {
	root := os.Getenv("WITNESS_ARTIFACTS")
	if root == "" {
		return
	}
	dir := filepath.Join(root, unsafe.ReplaceAllString(t.Name(), "_"))
	_ = os.MkdirAll(dir, 0o755)
	f, err := os.OpenFile(filepath.Join(dir, "evidence.jsonl"), os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return
	}
	defer f.Close()
	line, _ := json.Marshal(map[string]any{"v": 1, "kind": kind, "data": data})
	_, _ = f.Write(append(line, '\n'))
}

func app() string {
	if u := os.Getenv("WITNESS_APP_URL"); u != "" {
		return u
	}
	return "http://127.0.0.1:8080"
}

type item struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
}

func get(t *testing.T, path string, v any) int {
	t.Helper()
	r, err := http.Get(app() + path)
	if err != nil {
		t.Fatal(err)
	}
	defer r.Body.Close()
	body, err := io.ReadAll(r.Body)
	if err != nil {
		t.Fatal(err)
	}
	record(t, "http", map[string]any{"method": "GET", "url": app() + path, "status": r.StatusCode, "response": map[string]any{"body": string(body)}})
	if err := json.Unmarshal(body, v); err != nil {
		t.Fatal(err)
	}
	return r.StatusCode
}

func TestListsItems(t *testing.T) {
	var items []item
	if s := get(t, "/api/items", &items); s != 200 {
		t.Fatalf("status %d", s)
	}
	if len(items) != 2 || items[0].Name != "apple" || items[1].Name != "pear" {
		t.Fatalf("items %v", items)
	}
}

func TestItemName(t *testing.T) {
	var it item
	get(t, "/api/items/1", &it)
	if it.Name != "banana" {
		t.Fatalf("name: expected banana, got %s", it.Name)
	}
}

func TestSkipped(t *testing.T) {
	t.Skip("kit: always skipped")
}

func TestHangs(t *testing.T) {
	if os.Getenv("WITNESS_KIT_HANG") != "1" {
		t.Skip("kit: hangs only when WITNESS_KIT_HANG=1")
	}
	var it item
	get(t, "/api/hang", &it)
}
