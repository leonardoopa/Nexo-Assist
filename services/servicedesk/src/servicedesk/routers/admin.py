from __future__ import annotations

from datetime import datetime, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Request

from .. import store
from ..db import transaction
from ..deps import ConnDep, NowDep, TzDep, require_admin, require_api_key
from ..seed import seed_database

router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    dependencies=[Depends(require_api_key), Depends(require_admin)],
)


@router.post("/outage")
def start_outage(
    request: Request, now: NowDep, seconds: Annotated[int, Query(ge=0, le=600)] = 10
) -> dict[str, datetime | None]:
    """Force the service to answer 503 for a while (0 clears it): handy to demo the retry path."""
    until = now + timedelta(seconds=seconds) if seconds else None
    request.app.state.outage_until = until
    return {"outage_until": until}


@router.post("/reset")
def reset(request: Request, now: NowDep, tz: TzDep) -> dict[str, str]:
    """Wipe everything and load the sample data again, relative to the current time."""
    db = request.app.state.db
    with db.connect() as conn, transaction(conn):
        store.clear_all(conn)
    seed_database(db, now, tz)
    request.app.state.outage_until = None
    return {"status": "reseeded"}


@router.get("/state")
def state(request: Request, conn: ConnDep, now: NowDep) -> dict[str, Any]:
    tables = ("users", "tickets", "ticket_events", "articles", "idempotency")
    counts = {table: conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0] for table in tables}
    settings = request.app.state.settings
    return {
        "now": now,
        "outage_until": request.app.state.outage_until,
        "flaky_rate": settings.flaky_rate,
        "latency_ms": list(settings.latency_ms),
        "counts": counts,
    }
