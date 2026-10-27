"""SQL access. Business rules live in `service`; nothing here decides who may see what."""

from __future__ import annotations

import json
import sqlite3
from collections.abc import Mapping
from datetime import datetime
from typing import Any

from .models import Status
from .timeutil import iso

TICKET_COLUMNS = frozenset(
    {
        "id", "type", "title", "description", "category", "subcategory", "priority", "status",
        "affected", "requester_email", "assignee_email", "assigned_group", "created_at",
        "updated_at", "last_response_at", "due_at", "resolved_at", "resolution",
    }
)  # fmt: skip


def _checked(values: Mapping[str, Any]) -> Mapping[str, Any]:
    unknown = set(values) - TICKET_COLUMNS
    if unknown:
        raise ValueError(f"unknown ticket columns: {sorted(unknown)}")
    return values


# ---- users -----------------------------------------------------------------------------------


def get_user(conn: sqlite3.Connection, email: str) -> sqlite3.Row | None:
    return conn.execute("SELECT * FROM users WHERE email = ?", (email.strip().lower(),)).fetchone()


def insert_user(conn: sqlite3.Connection, user: Mapping[str, Any]) -> None:
    conn.execute(
        "INSERT INTO users (email, name, department, role, support_group, device_model, device_os, "
        "password_changed_at) VALUES (:email, :name, :department, :role, :support_group, :device_model, "
        ":device_os, :password_changed_at)",
        user,
    )


# ---- tickets ---------------------------------------------------------------------------------


def get_ticket(conn: sqlite3.Connection, ticket_id: str) -> sqlite3.Row | None:
    return conn.execute("SELECT * FROM tickets WHERE id = ?", (ticket_id,)).fetchone()


def list_tickets(conn: sqlite3.Connection, requester_email: str | None, scope: str) -> list[sqlite3.Row]:
    clauses: list[str] = []
    params: list[str] = []
    if requester_email:
        clauses.append("requester_email = ?")
        params.append(requester_email)
    if scope == "open":
        clauses.append("status != ?")
        params.append(Status.RESOLVIDO.value)
    elif scope == "closed":
        clauses.append("status = ?")
        params.append(Status.RESOLVIDO.value)
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    return conn.execute(f"SELECT * FROM tickets {where} ORDER BY updated_at DESC, id DESC", params).fetchall()


def next_ticket_number(conn: sqlite3.Connection, ticket_type: str) -> int:
    row = conn.execute(
        "SELECT MAX(CAST(SUBSTR(id, 5) AS INTEGER)) FROM tickets WHERE type = ?", (ticket_type,)
    ).fetchone()
    return (row[0] or (20000 if ticket_type == "INC" else 10000)) + 1


def insert_ticket(conn: sqlite3.Connection, ticket: Mapping[str, Any]) -> None:
    _checked(ticket)
    columns = ", ".join(ticket)
    placeholders = ", ".join(f":{column}" for column in ticket)
    conn.execute(f"INSERT INTO tickets ({columns}) VALUES ({placeholders})", ticket)


def update_ticket(conn: sqlite3.Connection, ticket_id: str, changes: Mapping[str, Any]) -> None:
    _checked(changes)
    assignments = ", ".join(f"{column} = :{column}" for column in changes)
    conn.execute(f"UPDATE tickets SET {assignments} WHERE id = :ticket_id", {**changes, "ticket_id": ticket_id})


# ---- ticket events ---------------------------------------------------------------------------


def insert_event(
    conn: sqlite3.Connection,
    ticket_id: str,
    at: datetime,
    kind: str,
    actor_email: str | None,
    text: str,
    meta: Mapping[str, str] | None = None,
) -> None:
    conn.execute(
        "INSERT INTO ticket_events (ticket_id, at, kind, actor_email, text, meta) VALUES (?, ?, ?, ?, ?, ?)",
        (ticket_id, iso(at), str(kind), actor_email, text, json.dumps(dict(meta or {}))),
    )


def list_events(conn: sqlite3.Connection, ticket_id: str) -> list[sqlite3.Row]:
    return conn.execute("SELECT * FROM ticket_events WHERE ticket_id = ? ORDER BY id", (ticket_id,)).fetchall()


# ---- help center -----------------------------------------------------------------------------


def list_articles(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    return conn.execute("SELECT * FROM articles ORDER BY id").fetchall()


def get_article(conn: sqlite3.Connection, article_id: str) -> sqlite3.Row | None:
    return conn.execute("SELECT * FROM articles WHERE id = ?", (article_id,)).fetchone()


def insert_article(conn: sqlite3.Connection, article: Mapping[str, Any]) -> None:
    conn.execute(
        "INSERT INTO articles (id, title, body, category, tags, updated_at) "
        "VALUES (:id, :title, :body, :category, :tags, :updated_at)",
        {**article, "tags": json.dumps(article["tags"], ensure_ascii=False)},
    )


# ---- idempotency -----------------------------------------------------------------------------


def get_idempotency(conn: sqlite3.Connection, key: str, actor_email: str, scope: str) -> sqlite3.Row | None:
    return conn.execute(
        "SELECT status_code, ticket_id FROM idempotency WHERE key = ? AND actor_email = ? AND scope = ?",
        (key, actor_email, scope),
    ).fetchone()


def save_idempotency(
    conn: sqlite3.Connection,
    key: str,
    actor_email: str,
    scope: str,
    status_code: int,
    ticket_id: str,
    at: datetime,
) -> None:
    conn.execute(
        "INSERT INTO idempotency (key, actor_email, scope, status_code, ticket_id, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (key, actor_email, scope, status_code, ticket_id, iso(at)),
    )


def clear_all(conn: sqlite3.Connection) -> None:
    for table in ("idempotency", "ticket_events", "tickets", "articles", "users"):
        conn.execute(f"DELETE FROM {table}")
