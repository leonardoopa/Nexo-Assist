from __future__ import annotations

from datetime import datetime, timedelta, timezone

API_KEY = "test-key"

ANA = "ana.souza@nexo.com.br"
CARLA = "carla.mendes@nexo.com.br"
RAFAEL = "rafael.lima@nexo.com.br"
MARINA = "marina.alves@nexo.com.br"

# Wednesday 28 October 2026, 10:00 in Sao Paulo (UTC-3), inside business hours.
NOW = datetime(2026, 10, 28, 13, 0, tzinfo=timezone.utc)

NEW_TICKET = {
    "title": "VPN não conecta no notebook, erro 809",
    "description": "Desde ontem o notebook (Windows 11) não conecta na VPN e mostra o erro 809.",
    "type": "INC",
    "category": "rede_vpn",
    "priority": "alta",
    "affected": "me",
}


class FakeClock:
    def __init__(self, now: datetime) -> None:
        self.now = now

    def __call__(self) -> datetime:
        return self.now

    def advance(self, **delta: float) -> None:
        self.now += timedelta(**delta)


def auth(email: str | None = None, key: str = API_KEY) -> dict[str, str]:
    headers = {"X-API-Key": key}
    if email:
        headers["X-Actor-Email"] = email
    return headers


def moment(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))
