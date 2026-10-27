from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Header, Query, Response

from .. import service
from ..deps import ActorDep, ConnDep, NowDep, TzDep, require_api_key
from ..models import (
    Category,
    TicketCreate,
    TicketDetail,
    TicketList,
    TicketNote,
    TicketReopen,
    TicketResolve,
    TicketTransfer,
)

router = APIRouter(prefix="/v1/tickets", tags=["tickets"], dependencies=[Depends(require_api_key)])

# Writes accept an Idempotency-Key: retrying after a lost answer replays the first outcome.
IdempotencyKey = Annotated[str | None, Header(alias="Idempotency-Key", max_length=100)]


@router.get("", response_model=TicketList)
def list_tickets(
    actor: ActorDep,
    conn: ConnDep,
    now: NowDep,
    status: Literal["open", "closed", "all"] = "open",
    q: Annotated[str | None, Query(max_length=200)] = None,
    category: Category | None = None,
    requester: str | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> TicketList:
    """Employees get their own tickets; analysts get every ticket and may filter by `requester`."""
    return service.list_tickets(
        conn, actor, scope=status, query=q, category=category, requester=requester, limit=limit, now=now
    )


@router.post("", response_model=TicketDetail, status_code=201)
def create_ticket(
    payload: TicketCreate,
    response: Response,
    actor: ActorDep,
    conn: ConnDep,
    now: NowDep,
    tz: TzDep,
    idempotency_key: IdempotencyKey = None,
) -> TicketDetail:
    status_code, ticket = service.create_ticket(conn, actor, payload, idempotency_key, now, tz)
    response.status_code = status_code
    return ticket


@router.get("/{ticket_id}", response_model=TicketDetail)
def get_ticket(ticket_id: str, actor: ActorDep, conn: ConnDep, now: NowDep) -> TicketDetail:
    return service.get_ticket(conn, actor, ticket_id, now)


@router.post("/{ticket_id}/updates", response_model=TicketDetail)
def add_update(
    ticket_id: str,
    payload: TicketNote,
    actor: ActorDep,
    conn: ConnDep,
    now: NowDep,
    idempotency_key: IdempotencyKey = None,
) -> TicketDetail:
    """Employee adds information to an open ticket (it does not restart the response deadline)."""
    return service.add_update(conn, actor, ticket_id, payload, idempotency_key, now)[1]


@router.post("/{ticket_id}/transfer", response_model=TicketDetail)
def transfer(
    ticket_id: str,
    payload: TicketTransfer,
    actor: ActorDep,
    conn: ConnDep,
    now: NowDep,
    idempotency_key: IdempotencyKey = None,
) -> TicketDetail:
    return service.transfer(conn, actor, ticket_id, payload, idempotency_key, now)[1]


@router.post("/{ticket_id}/reopen", response_model=TicketDetail)
def reopen(
    ticket_id: str,
    payload: TicketReopen,
    actor: ActorDep,
    conn: ConnDep,
    now: NowDep,
    tz: TzDep,
    idempotency_key: IdempotencyKey = None,
) -> TicketDetail:
    return service.reopen(conn, actor, ticket_id, payload, idempotency_key, now, tz)[1]


@router.post("/{ticket_id}/assume", response_model=TicketDetail)
def assume(
    ticket_id: str,
    actor: ActorDep,
    conn: ConnDep,
    now: NowDep,
    tz: TzDep,
    idempotency_key: IdempotencyKey = None,
) -> TicketDetail:
    return service.assume(conn, actor, ticket_id, idempotency_key, now, tz)[1]


@router.post("/{ticket_id}/respond", response_model=TicketDetail)
def respond(
    ticket_id: str,
    payload: TicketNote,
    actor: ActorDep,
    conn: ConnDep,
    now: NowDep,
    tz: TzDep,
    idempotency_key: IdempotencyKey = None,
) -> TicketDetail:
    return service.respond(conn, actor, ticket_id, payload, idempotency_key, now, tz)[1]


@router.post("/{ticket_id}/resolve", response_model=TicketDetail)
def resolve(
    ticket_id: str,
    payload: TicketResolve,
    actor: ActorDep,
    conn: ConnDep,
    now: NowDep,
    idempotency_key: IdempotencyKey = None,
) -> TicketDetail:
    return service.resolve(conn, actor, ticket_id, payload, idempotency_key, now)[1]
