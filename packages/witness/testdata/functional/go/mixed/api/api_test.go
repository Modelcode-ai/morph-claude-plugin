package api

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestListOrders(t *testing.T) {
	srv := httptest.NewServer(NewRouter())
	defer srv.Close()
	res, err := http.Get(srv.URL + "/api/orders")
	if err != nil || res.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/orders: %v %v", err, res)
	}
}
