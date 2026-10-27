from __future__ import annotations

from fastapi import APIRouter, Depends

from .. import service
from ..deps import ConnDep, NowDep, TzDep, require_api_key
from ..models import MetaOut, Priority, SlaPreview, UserOut

router = APIRouter(prefix="/v1", tags=["directory"], dependencies=[Depends(require_api_key)])


@router.get("/directory/{email}", response_model=UserOut)
def get_user(email: str, conn: ConnDep) -> UserOut:
    """Employee or analyst profile, used to sign in and to know the employee's equipment."""
    return service.get_user(conn, email)


@router.get("/meta", response_model=MetaOut)
def get_meta() -> MetaOut:
    """Types, categories, priorities (with deadlines), statuses and their labels."""
    return service.meta()


@router.get("/sla/{priority}", response_model=SlaPreview)
def get_sla(priority: Priority, now: NowDep, tz: TzDep) -> SlaPreview:
    """First-response deadline a ticket of this priority would get if opened right now."""
    return service.sla_preview(priority, now, tz)
