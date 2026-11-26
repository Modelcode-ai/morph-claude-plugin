import json
import os
import re
import urllib.request

import pytest

APP = os.environ.get("WITNESS_APP_URL", "http://127.0.0.1:8080")


def record(kind, data):
    """Witness evidence: append what this test saw to its timeline (a no-op outside witness)."""
    root, test = os.environ.get("WITNESS_ARTIFACTS"), os.environ.get("PYTEST_CURRENT_TEST", "").rsplit(" (", 1)[0]
    if not root or not test:
        return
    folder = os.path.join(root, re.sub(r"[^\w.@-]+", "_", test))
    os.makedirs(folder, exist_ok=True)
    with open(os.path.join(folder, "evidence.jsonl"), "a") as f:
        f.write(json.dumps({"v": 1, "kind": kind, "data": data}) + "\n")


def get(path):
    with urllib.request.urlopen(APP + path) as r:
        body = r.read().decode()
        record("http", {"method": "GET", "url": APP + path, "status": r.status, "response": {"body": body}})
        return r.status, json.loads(body)


def test_lists_items():
    status, body = get("/api/items")
    assert status == 200
    assert [i["name"] for i in body] == ["apple", "pear"]


def test_item_name():
    _, body = get("/api/items/1")
    assert body["name"] == "banana"


@pytest.mark.skip(reason="kit: always skipped")
def test_skipped():
    get("/api/items")


@pytest.mark.skipif(os.environ.get("WITNESS_KIT_HANG") != "1", reason="kit: hangs only when WITNESS_KIT_HANG=1")
def test_hangs():
    get("/api/hang")
