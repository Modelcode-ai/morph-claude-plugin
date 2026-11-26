from unittest.mock import Mock

from shop.calc import add


def test_add():
    assert add(1, 2, clock=Mock()) == 3
