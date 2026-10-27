from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    email TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    department TEXT,
    role TEXT NOT NULL CHECK (role IN ('employee', 'analyst')),
    support_group TEXT CHECK (support_group IN ('N1', 'N2')),
    device_model TEXT,
    device_os TEXT,
    password_changed_at TEXT
);

CREATE TABLE IF NOT EXISTS tickets (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    subcategory TEXT,
    priority TEXT NOT NULL,
    status TEXT NOT NULL,
    affected TEXT NOT NULL,
    requester_email TEXT NOT NULL REFERENCES users(email),
    assignee_email TEXT REFERENCES users(email),
    assigned_group TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_response_at TEXT NOT NULL,
    due_at TEXT NOT NULL,
    resolved_at TEXT,
    resolution TEXT
);
CREATE INDEX IF NOT EXISTS idx_tickets_requester ON tickets(requester_email, status);

CREATE TABLE IF NOT EXISTS ticket_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id TEXT NOT NULL REFERENCES tickets(id),
    at TEXT NOT NULL,
    kind TEXT NOT NULL,
    actor_email TEXT REFERENCES users(email),
    text TEXT NOT NULL,
    meta TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_events_ticket ON ticket_events(ticket_id, id);

CREATE TABLE IF NOT EXISTS articles (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    category TEXT NOT NULL,
    tags TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS idempotency (
    key TEXT NOT NULL,
    actor_email TEXT NOT NULL,
    scope TEXT NOT NULL,
    status_code INTEGER NOT NULL,
    ticket_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (key, actor_email, scope)
);
"""


class Database:
    """SQLite file shared by every request; each request opens its own short-lived connection."""

    def __init__(self, path: str) -> None:
        self.path = path

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        # Autocommit mode: writes opt into transactions explicitly (see `transaction`).
        # FastAPI may run a request's dependencies and handler on different threads.
        conn = sqlite3.connect(self.path, isolation_level=None, timeout=5.0, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        try:
            yield conn
        finally:
            conn.close()

    def init_schema(self) -> None:
        Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as conn:
            conn.execute("PRAGMA journal_mode = WAL")
            conn.executescript(SCHEMA)

    def is_empty(self) -> bool:
        with self.connect() as conn:
            return conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0


@contextmanager
def transaction(conn: sqlite3.Connection) -> Iterator[None]:
    conn.execute("BEGIN IMMEDIATE")
    try:
        yield
    except BaseException:
        conn.execute("ROLLBACK")
        raise
    conn.execute("COMMIT")
