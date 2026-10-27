from __future__ import annotations

import random
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from .config import Settings
from .db import Database
from .errors import ServiceError
from .flaky import FlakyMiddleware
from .routers import admin, articles, directory, health, tickets
from .seed import seed_database
from .timeutil import utc_now

Clock = Callable[[], datetime]


async def _service_error(_: Request, exc: ServiceError) -> JSONResponse:
    return JSONResponse(status_code=exc.status, content={"error": {"code": exc.code, "message": exc.message}})


async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
    fields = [
        {"field": ".".join(str(part) for part in error["loc"] if part != "body"), "message": error["msg"]}
        for error in exc.errors()
    ]
    return JSONResponse(
        status_code=422,
        content={"error": {"code": "validation_error", "message": "Dados inválidos.", "fields": fields}},
    )


def create_app(settings: Settings | None = None, clock: Clock = utc_now) -> FastAPI:
    settings = settings or Settings.from_env()
    db = Database(settings.db_path)
    tz = ZoneInfo(settings.timezone)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        db.init_schema()
        if settings.seed_on_start and db.is_empty():
            seed_database(db, clock(), tz)
        yield

    docs = settings.admin_enabled
    app = FastAPI(
        title="Nexo Service Desk (legado simulado)",
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/docs" if docs else None,
        openapi_url="/openapi.json" if docs else None,
        redoc_url=None,
    )
    app.state.settings = settings
    app.state.db = db
    app.state.tz = tz
    app.state.clock = clock
    app.state.rng = random.Random()
    app.state.outage_until = None

    app.add_middleware(FlakyMiddleware)
    app.add_exception_handler(ServiceError, _service_error)  # type: ignore[arg-type]
    app.add_exception_handler(RequestValidationError, _validation_error)  # type: ignore[arg-type]
    for module in (health, directory, tickets, articles, admin):
        app.include_router(module.router)
    return app
