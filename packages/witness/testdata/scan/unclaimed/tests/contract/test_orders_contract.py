import requests


def test_orders_contract():
    assert requests.get("http://localhost:3000/api/orders").status_code == 200
