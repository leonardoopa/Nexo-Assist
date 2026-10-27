from __future__ import annotations

import os
from dataclasses import dataclass


def _flag(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    return default if raw is None else raw.strip().lower() in {"1", "true", "yes", "on"}


def _latency(raw: str | None) -> tuple[int, int]:
    """Parse "min-max" milliseconds (e.g. "40-250"). Empty means no artificial latency."""
    if not raw:
        return (0, 0)
    low, _, high = raw.partition("-")
    return (int(low), int(high) if high else int(low))


@dataclass(frozen=True)
class Settings:
    db_path: str = "servicedesk.db"
    api_key: str = "dev-servicedesk-key"
    timezone: str = "America/Sao_Paulo"
    # Chance (0 to 1) that a request fails with 503, to mimic the unstable legacy system.
    flaky_rate: float = 0.0
    latency_ms: tuple[int, int] = (0, 0)
    # Enables /admin (force an outage, reload sample data) and the OpenAPI docs.
    admin_enabled: bool = False
    seed_on_start: bool = True

    @classmethod
    def from_env(cls) -> Settings:
        env = os.environ
        return cls(
            db_path=env.get("SERVICEDESK_DB_PATH", cls.db_path),
            api_key=env.get("SERVICEDESK_API_KEY", cls.api_key),
            timezone=env.get("SERVICEDESK_TIMEZONE", cls.timezone),
            flaky_rate=float(env.get("SERVICEDESK_FLAKY_RATE", cls.flaky_rate)),
            latency_ms=_latency(env.get("SERVICEDESK_LATENCY_MS")),
            admin_enabled=_flag("SERVICEDESK_ADMIN", cls.admin_enabled),
            seed_on_start=_flag("SERVICEDESK_SEED", cls.seed_on_start),
        )
