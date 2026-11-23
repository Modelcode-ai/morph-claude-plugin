import subprocess
import sys


def test_runs_as_module():
    r = subprocess.run([sys.executable, "-m", "itemsctl", "get", "1"], capture_output=True, text=True)
    assert r.stdout.strip() == "apple"
