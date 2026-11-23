from click.testing import CliRunner

from itemsctl.cli import main


def test_click_entry_point():
    result = CliRunner().invoke(main, ["list"])
    assert result.exit_code == 0
