"""CLI entrypoint for the aggregator cron microservice.

Usage::

    python -m app.main sync      # one-shot sync, then exit
    python -m app.main run       # loop forever, syncing every interval
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys

from .config import Settings, get_settings
from .sync import run_sync


def _configure_logging(settings: Settings) -> None:
    logging.basicConfig(
        level=getattr(logging, settings.log_level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )


async def _run_loop(settings: Settings) -> None:
    while True:
        started = asyncio.get_running_loop().time()
        await run_sync(settings)
        elapsed = asyncio.get_running_loop().time() - started
        # Sleep the remaining time so the cadence stays a stable 6h regardless
        # of how long the scrape took.
        await asyncio.sleep(max(0, settings.sync_interval_seconds - elapsed))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="aggregator")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("sync", help="Run one sync and exit")
    sub.add_parser("run", help="Run continuously on the configured interval")
    args = parser.parse_args(argv)

    settings = get_settings()
    _configure_logging(settings)

    if args.command == "run":
        asyncio.run(_run_loop(settings))
    else:
        asyncio.run(run_sync(settings))
    return 0


if __name__ == "__main__":
    sys.exit(main())
