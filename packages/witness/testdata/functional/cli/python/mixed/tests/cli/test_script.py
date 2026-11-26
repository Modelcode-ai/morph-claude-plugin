import subprocess


def test_lists_items():
    r = subprocess.run(["itemsctl", "list"], capture_output=True, text=True)
    assert r.returncode == 0
    assert r.stdout.split() == ["apple", "pear"]
