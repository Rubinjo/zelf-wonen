"""CLI entrypoint for the aggregator cron microservice.

Usage::

    python -m app.main sync      # one-shot sync, then exit
    python -m app.main run       # loop forever, syncing every interval
    python -m app.main sync --sources FUNDA  # only the Funda adapter
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys

from .config import Settings, get_settings
from .diagnostics import check_sources
from .http_client import ScrapeError
from .models import ListingSource
from .sync import run_sync


def _configure_logging(settings: Settings) -> None:
    logging.basicConfig(
        level=getattr(logging, settings.log_level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )


async def _run_loop(settings: Settings) -> None:
    while True:
        started = asyncio.get_running_loop().time()
        try:
            await run_sync(settings)
        except Exception:
            logging.getLogger(__name__).exception("sync failed; next interval will retry")
        elapsed = asyncio.get_running_loop().time() - started
        # Sleep the remaining time so the cadence stays a stable 6h regardless
        # of how long the scrape took.
        await asyncio.sleep(max(0, settings.sync_interval_seconds - elapsed))


def _parse_sources(value: str) -> str:
    names = list(dict.fromkeys(name.strip().upper() for name in value.split(",") if name.strip()))
    supported = {source.value for source in ListingSource}
    if not names or set(names) - supported:
        raise argparse.ArgumentTypeError(
            f"choose one or more comma-separated sources: {', '.join(sorted(supported))}"
        )
    return ",".join(names)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="aggregator")
    sub = parser.add_subparsers(dest="command", required=True)
    for command, help_text in (
        ("sync", "Run one sync and exit"),
        ("run", "Run continuously on the configured interval"),
        ("check-sources", "Check discovery and one detail per source without DB writes"),
    ):
        command_parser = sub.add_parser(command, help=help_text)
        command_parser.add_argument(
            "--sources",
            type=_parse_sources,
            metavar="FUNDA,KAMERNET",
            help="Comma-separated adapters; overrides AGGREGATOR_ENABLED_SOURCES for this process",
        )
        if command == "check-sources":
            command_parser.add_argument(
                "--check-images", action="store_true", help="Also validate one image if available"
            )
            command_parser.add_argument(
                "--reset-cooldown",
                action="store_true",
                help="Clear each source's saved cooldown only after its check succeeds",
            )
    args = parser.parse_args(argv)

    settings = get_settings()
    if args.sources is not None:
        settings = settings.model_copy(update={"enabled_sources": args.sources})
    _configure_logging(settings)

    try:
        if args.command == "run":
            asyncio.run(_run_loop(settings))
        elif args.command == "check-sources":
            asyncio.run(
                check_sources(
                    settings, check_images=args.check_images, reset_cooldown=args.reset_cooldown
                )
            )
        else:
            asyncio.run(run_sync(settings))
    except ScrapeError as exc:
        logging.getLogger(__name__).error("%s", exc)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
