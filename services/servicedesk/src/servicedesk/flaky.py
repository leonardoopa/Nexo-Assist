"""Makes the service behave like the legacy system it stands for: slow, and sometimes down for seconds."""

from __future__ import annotations

import asyncio

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

EXEMPT_PREFIXES = ("/healthz", "/admin", "/docs", "/redoc", "/openapi.json")


def _unavailable(retry_after: int) -> JSONResponse:
    return JSONResponse(
        {
            "error": {
                "code": "legacy_unavailable",
                "message": "Sistema de chamados indisponível no momento. Tente novamente em instantes.",
            }
        },
        status_code=503,
        headers={"Retry-After": str(retry_after)},
    )


async def _discard(_message: Message) -> None:
    return None


class FlakyMiddleware:
    """Adds latency, honours forced outages and randomly fails a share of the requests.

    Writes may fail *after* being applied (the answer is lost), which is the case clients must
    survive with idempotency keys instead of creating duplicates on retry.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["path"].startswith(EXEMPT_PREFIXES):
            await self.app(scope, receive, send)
            return

        state = scope["app"].state
        settings = state.settings
        low, high = settings.latency_ms
        if high > 0:
            await asyncio.sleep(state.rng.uniform(low, high) / 1000)

        now = state.clock()
        if state.outage_until is not None and now < state.outage_until:
            retry_after = int((state.outage_until - now).total_seconds()) + 1
            await _unavailable(retry_after)(scope, receive, send)
            return

        if settings.flaky_rate <= 0 or state.rng.random() >= settings.flaky_rate:
            await self.app(scope, receive, send)
            return

        if scope["method"] == "GET" or state.rng.random() < 0.5:
            await _unavailable(2)(scope, receive, send)  # failed before touching any data
            return
        await self.app(scope, receive, _discard)  # applied, but the client never hears about it
        await _unavailable(2)(scope, receive, send)
