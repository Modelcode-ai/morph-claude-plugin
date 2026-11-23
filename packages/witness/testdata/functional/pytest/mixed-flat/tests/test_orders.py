def test_list_orders(client):
    r = client.get("/api/orders")
    assert r.status_code == 200
    assert r.json() == []
