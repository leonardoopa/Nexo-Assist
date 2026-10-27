"""Business rules of the service desk: who sees what, deadlines, and writes that survive retries."""

from __future__ import annotations

import json
import sqlite3
from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from . import search, sla, store
from .db import transaction
from .errors import ServiceError
from .models import (
    AFFECTED_LABELS,
    CATEGORY_LABELS,
    CLOCK_RUNNING_STATUSES,
    OPEN_STATUSES,
    PRIORITY_LABELS,
    STATUS_LABELS,
    TYPE_LABELS,
    Actor,
    ArticleList,
    ArticleOut,
    Category,
    Device,
    EventKind,
    LabelOut,
    MetaOut,
    Person,
    Priority,
    PriorityMeta,
    SlaInfo,
    SlaPreview,
    Status,
    StatusMeta,
    TicketCreate,
    TicketDetail,
    TicketEvent,
    TicketList,
    TicketNote,
    TicketOut,
    TicketReopen,
    TicketResolve,
    TicketTransfer,
    UserOut,
)
from .timeutil import iso, parse

REOPEN_WINDOW = timedelta(days=7)
TICKET_WEIGHTS = {"title": 3.0, "subcategory": 2.0, "description": 1.0}
ARTICLE_WEIGHTS = {"title": 3.0, "tags": 2.0, "body": 1.0}

Outcome = tuple[int, str]  # (HTTP status, ticket id)


# ---- rows to API models ----------------------------------------------------------------------


def _person(row: sqlite3.Row | None) -> Person | None:
    if row is None:
        return None
    return Person(
        email=row["email"], name=row["name"], department=row["department"], support_group=row["support_group"]
    )


def _user(row: sqlite3.Row) -> UserOut:
    device = Device(model=row["device_model"], os=row["device_os"]) if row["device_model"] else None
    return UserOut(
        email=row["email"],
        name=row["name"],
        department=row["department"],
        support_group=row["support_group"],
        role=row["role"],
        device=device,
        password_changed_at=parse(row["password_changed_at"]) if row["password_changed_at"] else None,
    )


def _sla_info(row: sqlite3.Row, now: datetime) -> SlaInfo:
    due = parse(row["due_at"])
    running = Status(row["status"]) in CLOCK_RUNNING_STATUSES
    overdue = running and now > due
    return SlaInfo(
        label=sla.SLA_RULES[Priority(row["priority"])].label,
        due_at=due,
        clock_running=running,
        overdue=overdue,
        overdue_by_minutes=int((now - due).total_seconds() // 60) if overdue else 0,
    )


def _ticket(conn: sqlite3.Connection, row: sqlite3.Row, now: datetime, score: float | None = None) -> TicketOut:
    resolved_at = parse(row["resolved_at"]) if row["resolved_at"] else None
    requester = _person(store.get_user(conn, row["requester_email"]))
    assert requester is not None  # guaranteed by the foreign key
    return TicketOut(
        id=row["id"],
        type=row["type"],
        title=row["title"],
        description=row["description"],
        category=row["category"],
        subcategory=row["subcategory"],
        priority=row["priority"],
        status=row["status"],
        affected=row["affected"],
        requester=requester,
        assignee=_person(store.get_user(conn, row["assignee_email"])) if row["assignee_email"] else None,
        assigned_group=row["assigned_group"],
        created_at=parse(row["created_at"]),
        updated_at=parse(row["updated_at"]),
        last_response_at=parse(row["last_response_at"]),
        resolved_at=resolved_at,
        resolution=row["resolution"],
        sla=_sla_info(row, now),
        can_reopen=resolved_at is not None and now - resolved_at <= REOPEN_WINDOW,
        reopen_until=resolved_at + REOPEN_WINDOW if resolved_at else None,
        match_score=score,
    )


def _detail(conn: sqlite3.Connection, row: sqlite3.Row, now: datetime) -> TicketDetail:
    events = [
        TicketEvent(
            id=event["id"],
            at=parse(event["at"]),
            kind=event["kind"],
            actor=_person(store.get_user(conn, event["actor_email"])) if event["actor_email"] else None,
            text=event["text"],
            meta=json.loads(event["meta"]),
        )
        for event in store.list_events(conn, row["id"])
    ]
    return TicketDetail(**_ticket(conn, row, now).model_dump(), events=events)


# ---- guards ----------------------------------------------------------------------------------


def _visible_row(conn: sqlite3.Connection, actor: Actor, ticket_id: str) -> sqlite3.Row:
    """Employees only see their own tickets; anything else looks exactly like a missing ticket."""
    row = store.get_ticket(conn, ticket_id.strip().upper())
    if row is None or (actor.role == "employee" and row["requester_email"] != actor.email):
        raise ServiceError(404, "ticket_not_found", "Chamado não encontrado.")
    return row


def _require_role(actor: Actor, role: str) -> None:
    if actor.role != role:
        code = "analyst_only" if role == "analyst" else "employee_only"
        raise ServiceError(403, code, "Ação não permitida para o seu perfil.")


def _require_open(row: sqlite3.Row) -> None:
    if Status(row["status"]) not in OPEN_STATUSES:
        raise ServiceError(
            409, "ticket_resolved", "O chamado já foi resolvido. Reabra (até 7 dias) ou abra um novo chamado."
        )


def _once(
    conn: sqlite3.Connection,
    actor: Actor,
    scope: str,
    key: str | None,
    now: datetime,
    mutate: Callable[[], Outcome],
) -> Outcome:
    """Run `mutate` in one transaction; a retry with the same key replays the first outcome."""
    with transaction(conn):
        if key:
            saved = store.get_idempotency(conn, key, actor.email, scope)
            if saved is not None:
                return saved["status_code"], saved["ticket_id"]
        outcome = mutate()
        if key:
            store.save_idempotency(conn, key, actor.email, scope, outcome[0], outcome[1], now)
        return outcome


def _result(conn: sqlite3.Connection, outcome: Outcome, now: datetime) -> tuple[int, TicketDetail]:
    status_code, ticket_id = outcome
    row = store.get_ticket(conn, ticket_id)
    assert row is not None
    return status_code, _detail(conn, row, now)


def _answered(row: sqlite3.Row, now: datetime, tz: ZoneInfo) -> dict[str, str]:
    """Columns that restart the response clock after a service desk update."""
    due = sla.due_at(Priority(row["priority"]), now, tz)
    return {"updated_at": iso(now), "last_response_at": iso(now), "due_at": iso(due)}


# ---- tickets: reads --------------------------------------------------------------------------


def get_ticket(conn: sqlite3.Connection, actor: Actor, ticket_id: str, now: datetime) -> TicketDetail:
    return _detail(conn, _visible_row(conn, actor, ticket_id), now)


def list_tickets(
    conn: sqlite3.Connection,
    actor: Actor,
    *,
    scope: str,
    query: str | None,
    category: Category | None,
    requester: str | None,
    limit: int,
    now: datetime,
) -> TicketList:
    requester = requester.strip().lower() if requester else None
    if actor.role == "employee":
        if requester and requester != actor.email:
            raise ServiceError(403, "forbidden_requester", "Você só pode consultar os seus próprios chamados.")
        requester = actor.email
    rows = store.list_tickets(conn, requester, scope)
    scores: dict[str, float] = {}
    if query:
        ranked = search.rank(rows, query, _ticket_fields, TICKET_WEIGHTS)
        scores = {row["id"]: score for row, score in ranked}
        rows = [row for row, _ in ranked]
    if category:
        rows = [row for row in rows if row["category"] == category.value]
    return TicketList(
        items=[_ticket(conn, row, now, scores.get(row["id"])) for row in rows[:limit]], total=len(rows)
    )


def _ticket_fields(row: sqlite3.Row) -> dict[str, str]:
    return {"title": row["title"], "subcategory": row["subcategory"] or "", "description": row["description"]}


# ---- tickets: writes -------------------------------------------------------------------------


def create_ticket(
    conn: sqlite3.Connection, actor: Actor, payload: TicketCreate, key: str | None, now: datetime, tz: ZoneInfo
) -> tuple[int, TicketDetail]:
    _require_role(actor, "employee")

    def mutate() -> Outcome:
        ticket_id = f"{payload.type.value}-{store.next_ticket_number(conn, payload.type.value)}"
        store.insert_ticket(
            conn,
            {
                "id": ticket_id,
                "type": payload.type.value,
                "title": payload.title,
                "description": payload.description,
                "category": payload.category.value,
                "subcategory": payload.subcategory,
                "priority": payload.priority.value,
                "status": Status.ABERTO.value,
                "affected": payload.affected.value,
                "requester_email": actor.email,
                "assignee_email": None,
                "assigned_group": None,
                "created_at": iso(now),
                "updated_at": iso(now),
                "last_response_at": iso(now),
                "due_at": iso(sla.due_at(payload.priority, now, tz)),
                "resolved_at": None,
                "resolution": None,
            },
        )
        store.insert_event(
            conn, ticket_id, now, EventKind.CREATED, actor.email, "Chamado aberto pelo Nexo Assist após confirmação."
        )
        return 201, ticket_id

    return _result(conn, _once(conn, actor, "POST /v1/tickets", key, now, mutate), now)


def add_update(
    conn: sqlite3.Connection, actor: Actor, ticket_id: str, payload: TicketNote, key: str | None, now: datetime
) -> tuple[int, TicketDetail]:
    """Employee adds information. This does not count as a service desk response, so the deadline stands."""
    _require_role(actor, "employee")

    def mutate() -> Outcome:
        row = _visible_row(conn, actor, ticket_id)
        _require_open(row)
        store.update_ticket(conn, row["id"], {"updated_at": iso(now)})
        store.insert_event(conn, row["id"], now, EventKind.EMPLOYEE_UPDATE, actor.email, payload.text)
        return 200, row["id"]

    scope = f"POST /v1/tickets/{ticket_id.strip().upper()}/updates"
    return _result(conn, _once(conn, actor, scope, key, now, mutate), now)


def transfer(
    conn: sqlite3.Connection, actor: Actor, ticket_id: str, payload: TicketTransfer, key: str | None, now: datetime
) -> tuple[int, TicketDetail]:
    def mutate() -> Outcome:
        row = _visible_row(conn, actor, ticket_id)
        _require_open(row)
        if Status(row["status"]) in (Status.AGUARDANDO_ANALISTA, Status.EM_ATENDIMENTO):
            return 200, row["id"]  # already with an analyst: nothing to do
        store.update_ticket(
            conn,
            row["id"],
            {"status": Status.AGUARDANDO_ANALISTA.value, "assigned_group": payload.to_group, "updated_at": iso(now)},
        )
        store.insert_event(
            conn,
            row["id"],
            now,
            EventKind.TRANSFERRED,
            actor.email,
            payload.summary,
            {"reason": payload.reason.value, "to_group": payload.to_group},
        )
        return 200, row["id"]

    scope = f"POST /v1/tickets/{ticket_id.strip().upper()}/transfer"
    return _result(conn, _once(conn, actor, scope, key, now, mutate), now)


def assume(
    conn: sqlite3.Connection, actor: Actor, ticket_id: str, key: str | None, now: datetime, tz: ZoneInfo
) -> tuple[int, TicketDetail]:
    _require_role(actor, "analyst")

    def mutate() -> Outcome:
        row = _visible_row(conn, actor, ticket_id)
        _require_open(row)
        store.update_ticket(
            conn,
            row["id"],
            {
                "status": Status.EM_ATENDIMENTO.value,
                "assignee_email": actor.email,
                "assigned_group": actor.support_group,
                **_answered(row, now, tz),
            },
        )
        store.insert_event(conn, row["id"], now, EventKind.ASSUMED, actor.email, f"{actor.name} assumiu o atendimento.")
        return 200, row["id"]

    scope = f"POST /v1/tickets/{ticket_id.strip().upper()}/assume"
    return _result(conn, _once(conn, actor, scope, key, now, mutate), now)


def respond(
    conn: sqlite3.Connection,
    actor: Actor,
    ticket_id: str,
    payload: TicketNote,
    key: str | None,
    now: datetime,
    tz: ZoneInfo,
) -> tuple[int, TicketDetail]:
    _require_role(actor, "analyst")

    def mutate() -> Outcome:
        row = _visible_row(conn, actor, ticket_id)
        _require_open(row)
        changes = _answered(row, now, tz)
        if Status(row["status"]) in (Status.ABERTO, Status.AGUARDANDO_ANALISTA):
            changes["status"] = Status.EM_ANDAMENTO.value
        store.update_ticket(conn, row["id"], changes)
        store.insert_event(conn, row["id"], now, EventKind.ANALYST_RESPONSE, actor.email, payload.text)
        return 200, row["id"]

    scope = f"POST /v1/tickets/{ticket_id.strip().upper()}/respond"
    return _result(conn, _once(conn, actor, scope, key, now, mutate), now)


def resolve(
    conn: sqlite3.Connection, actor: Actor, ticket_id: str, payload: TicketResolve, key: str | None, now: datetime
) -> tuple[int, TicketDetail]:
    _require_role(actor, "analyst")

    def mutate() -> Outcome:
        row = _visible_row(conn, actor, ticket_id)
        _require_open(row)
        store.update_ticket(
            conn,
            row["id"],
            {
                "status": Status.RESOLVIDO.value,
                "resolved_at": iso(now),
                "resolution": payload.resolution,
                "updated_at": iso(now),
            },
        )
        store.insert_event(conn, row["id"], now, EventKind.RESOLVED, actor.email, payload.resolution)
        return 200, row["id"]

    scope = f"POST /v1/tickets/{ticket_id.strip().upper()}/resolve"
    return _result(conn, _once(conn, actor, scope, key, now, mutate), now)


def reopen(
    conn: sqlite3.Connection,
    actor: Actor,
    ticket_id: str,
    payload: TicketReopen,
    key: str | None,
    now: datetime,
    tz: ZoneInfo,
) -> tuple[int, TicketDetail]:
    """Resolved tickets can be reopened for up to 7 days; after that a new ticket is needed."""

    def mutate() -> Outcome:
        row = _visible_row(conn, actor, ticket_id)
        if Status(row["status"]) is not Status.RESOLVIDO:
            raise ServiceError(409, "ticket_not_resolved", "Só chamados resolvidos podem ser reabertos.")
        if now - parse(row["resolved_at"]) > REOPEN_WINDOW:
            raise ServiceError(
                409,
                "reopen_window_expired",
                "Chamados resolvidos há mais de 7 dias não podem ser reabertos. Abra um novo chamado.",
            )
        store.update_ticket(
            conn,
            row["id"],
            {
                "status": Status.ABERTO.value,
                "resolved_at": None,
                "resolution": None,
                "assignee_email": None,
                "assigned_group": None,
                **_answered(row, now, tz),
            },
        )
        store.insert_event(conn, row["id"], now, EventKind.REOPENED, actor.email, payload.reason)
        return 200, row["id"]

    scope = f"POST /v1/tickets/{ticket_id.strip().upper()}/reopen"
    return _result(conn, _once(conn, actor, scope, key, now, mutate), now)


# ---- help center, directory, reference data --------------------------------------------------


def _article(row: sqlite3.Row, score: float | None = None) -> ArticleOut:
    return ArticleOut(
        id=row["id"],
        title=row["title"],
        body=row["body"],
        category=row["category"],
        tags=json.loads(row["tags"]),
        updated_at=parse(row["updated_at"]),
        score=score,
    )


def _article_fields(row: sqlite3.Row) -> dict[str, str]:
    return {"title": row["title"], "tags": " ".join(json.loads(row["tags"])), "body": row["body"]}


def search_articles(conn: sqlite3.Connection, query: str | None, limit: int) -> ArticleList:
    rows = store.list_articles(conn)
    if not query:
        return ArticleList(items=[_article(row) for row in rows[:limit]])
    ranked = search.rank(rows, query, _article_fields, ARTICLE_WEIGHTS)[:limit]
    return ArticleList(items=[_article(row, score) for row, score in ranked])


def get_article(conn: sqlite3.Connection, article_id: str) -> ArticleOut:
    row = store.get_article(conn, article_id.strip().upper())
    if row is None:
        raise ServiceError(404, "article_not_found", "Artigo não encontrado.")
    return _article(row)


def get_user(conn: sqlite3.Connection, email: str) -> UserOut:
    row = store.get_user(conn, email)
    if row is None:
        raise ServiceError(404, "user_not_found", "Funcionário não encontrado.")
    return _user(row)


def sla_preview(priority: Priority, now: datetime, tz: ZoneInfo) -> SlaPreview:
    rule = sla.SLA_RULES[priority]
    return SlaPreview(
        priority=priority,
        label=rule.label,
        business_hours=rule.business is not None,
        due_at=sla.due_at(priority, now, tz).astimezone(timezone.utc),
        calculated_from=now,
    )


def meta() -> MetaOut:
    return MetaOut(
        types=[LabelOut(id=key.value, label=label) for key, label in TYPE_LABELS.items()],
        categories=[LabelOut(id=key.value, label=label) for key, label in CATEGORY_LABELS.items()],
        priorities=[
            PriorityMeta(
                id=key.value,
                label=label,
                sla=sla.SLA_RULES[key].label,
                business_hours=sla.SLA_RULES[key].business is not None,
            )
            for key, label in PRIORITY_LABELS.items()
        ],
        statuses=[
            StatusMeta(
                id=key.value, label=label, open=key in OPEN_STATUSES, clock_running=key in CLOCK_RUNNING_STATUSES
            )
            for key, label in STATUS_LABELS.items()
        ],
        affected=[LabelOut(id=key.value, label=label) for key, label in AFFECTED_LABELS.items()],
        support_hours="Segunda a sexta, das 8h às 18h. Chamados críticos têm plantão 24 horas.",
    )
