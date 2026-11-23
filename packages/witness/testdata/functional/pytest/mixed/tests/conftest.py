import pytest
from fastapi.testclient import TestClient

from shop.app import app


@pytest.fixture
def client():
    return TestClient(app)
