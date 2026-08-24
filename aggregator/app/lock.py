"""Cron lock: PostgreSQL advisory lock.

A scrape may run longer than the 6-hour interval. The advisory lock is keyed on a
single stable bigint, so exactly one aggregator process across all replicas holds
it at a time. Overlapping runs are skipped instead of queued.
"""

from __future__ import annotations

import contextlib
import logging
from collections.abc import AsyncIterator

import asyncpg

from .config import Settings

logger = logging.getLogger(__name__)


@contextlib.asynccontextmanager
async def advisory_lock(pool: asyncpg.Pool, settings: Settings) -> AsyncIterator[bool]:
    """Yield ``True`` if the lock was acquired, ``False`` if another run is active."""
    acquired = False
    connection: asyncpg.Connection | None = None
    try:
        connection = await pool.acquire()
        acquired = await connection.fetchval(
            "SELECT pg_try_advisory_lock($1)", settings.advisory_lock_key
        )
        yield acquired
    finally:
        if acquired and connection is not None:
            try:
                await connection.fetchval(
                    "SELECT pg_advisory_unlock($1)", settings.advisory_lock_key
                )
            finally:
                await pool.release(connection)
        elif connection is not None:
            await pool.release(connection)
