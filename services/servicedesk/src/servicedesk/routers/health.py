from __future__ import annotations

from fastapi import APIRouter

router = APIRouter()


@router.get("/healthz", include_in_schema=False)
def healthz() -> dict[str, str]:
    """Liveness probe. It is exempt from the simulated instability on purpose."""
    return {"status": "ok"}
