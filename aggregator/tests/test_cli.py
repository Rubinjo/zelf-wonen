from unittest.mock import AsyncMock, patch

import pytest

from app.config import Settings
from app.main import main


@pytest.mark.parametrize(
    ("command", "runner"),
    [("sync", "run_sync"), ("run", "_run_loop"), ("check-sources", "check_sources")],
)
def test_cli_sources_override_configuration_without_mutating_it(command, runner):
    configured = Settings(enabled_sources="KAMERNET")
    with (
        patch("app.main.get_settings", return_value=configured),
        patch(f"app.main.{runner}", AsyncMock()) as run,
    ):
        assert main([command, "--sources", " funda "]) == 0
    assert run.await_args.args[0].source_names == ["FUNDA"]
    assert configured.source_names == ["KAMERNET"]


def test_cli_preserves_environment_selection_by_default():
    with (
        patch("app.main.get_settings", return_value=Settings(enabled_sources="KAMERNET")),
        patch("app.main.run_sync", AsyncMock()) as run,
    ):
        assert main(["sync"]) == 0
    assert run.await_args.args[0].source_names == ["KAMERNET"]


def test_cli_accepts_multiple_sources_and_removes_duplicates():
    with patch("app.main.run_sync", AsyncMock()) as run:
        assert main(["sync", "--sources", "funda,kamernet,FUNDA"]) == 0
    assert run.await_args.args[0].source_names == ["FUNDA", "KAMERNET"]


def test_cli_passes_production_validation_options():
    with patch("app.main.check_sources", AsyncMock()) as check:
        assert main([
            "check-sources", "--sources", "FUNDA", "--check-images", "--reset-cooldown"
        ]) == 0
    assert check.await_args.kwargs == {"check_images": True, "reset_cooldown": True}


@pytest.mark.parametrize("sources", ["", " , ", "FUNDA,TYPO"])
def test_cli_rejects_invalid_sources_before_starting_a_run(sources):
    with patch("app.main.get_settings") as settings:
        with pytest.raises(SystemExit) as exc:
            main(["sync", "--sources", sources])
    assert exc.value.code == 2
    settings.assert_not_called()
