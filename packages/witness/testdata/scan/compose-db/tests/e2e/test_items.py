import os

import requests

BASE = os.environ.get("API_URL", "http://localhost:8000")


def test_lists_items():
    r = requests.get(f"{BASE}/items")
    assert r.status_code == 200
    assert r.json() == []
