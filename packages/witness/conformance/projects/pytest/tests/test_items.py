import json
import os
import urllib.request

import pytest

APP = os.environ.get("WITNESS_APP_URL", "http://127.0.0.1:8080")


def get(path):
    with urllib.request.urlopen(APP + path) as r:
        return r.status, json.load(r)


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
