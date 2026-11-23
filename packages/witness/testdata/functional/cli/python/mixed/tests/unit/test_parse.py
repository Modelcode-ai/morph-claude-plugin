import subprocess

from itemsctl.cli import main, parse_args


def test_parses_list():
    assert parse_args(["list"]).cmd == "list"


def test_main_returns_zero(capsys):
    assert main(["list"]) == 0
    assert "apple" in capsys.readouterr().out


def test_git_is_there():
    assert subprocess.run(["git", "--version"], capture_output=True).returncode == 0
