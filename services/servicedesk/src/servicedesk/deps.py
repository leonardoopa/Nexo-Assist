"""FastAPI dependencies: per-request connection, clock and the authenticated actor."""

from __future__ import annotations

import hmac
import sqlite3
from collections.abc import Iterator
from datetime import datetime
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import Depends, Header, Request

from . import store
from .errors import ServiceError
from .models import Actor


def get_conn(request: Request) -> Iterator[sqlite3.Connection]:
    with request.app.state.db.connect() as conn:
        yield conn


def get_now(request: Request) -> datetime:
    return request.app.state.clock()


def get_tz(request: Request) -> ZoneInfo:
    return request.app.state.tz


def require_api_key(request: Request, x_api_key: Annotated[str | None, Header()] = None) -> None:
    expected = request.app.state.settings.api_key.encode()
    if not x_api_key or not hmac.compare_digest(x_api_key.encode(), expected):
        raise ServiceError(401, "invalid_api_key", "Chave de API ausente ou inválida.")


def require_admin(request: Request) -> None:
    if not request.app.state.settings.admin_enabled:
        raise ServiceError(404, "not_found", "Recurso não encontrado.")


ConnDep = Annotated[sqlite3.Connection, Depends(get_conn)]
NowDep = Annotated[datetime, Depends(get_now)]
TzDep = Annotated[ZoneInfo, Depends(get_tz)]


def get_actor(
    conn: ConnDep,
    _authenticated: Annotated[None, Depends(require_api_key)],
    x_actor_email: Annotated[str | None, Header()] = None,
) -> Actor:
    """The caller is identified by e-mail; role and group come from the directory, never from a header."""
    if not x_actor_email:
        raise ServiceError(401, "missing_actor", "Informe o cabeçalho X-Actor-Email.")
    user = store.get_user(conn, x_actor_email)
    if user is None:
        raise ServiceError(403, "unknown_actor", "Usuário não encontrado no diretório.")
    return Actor(email=user["email"], name=user["name"], role=user["role"], support_group=user["support_group"])


ActorDep = Annotated[Actor, Depends(get_actor)]
