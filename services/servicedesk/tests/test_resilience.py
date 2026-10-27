from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

from fastapi.testclient import TestClient
from helpers import ANA, API_KEY, NEW_TICKET, FakeClock, auth

from servicedesk.config import Settings
from servicedesk.main import create_app


class ScriptedRng:
    """Replays chosen random() values so a test decides which request fails, and how."""

    def __init__(self, *values: float) -> None:
        self.values = list(values)

    def random(self) -> float:
        return self.values.pop(0)

    def uniform(self, low: float, _high: float) -> float:
        return low


def test_failed_requests_answer_503_with_retry_after(make_client: Callable[..., TestClient]) -> None:
    client = make_client(flaky_rate=1.0)
    response = client.get("/v1/tickets", headers=auth(ANA))
    assert response.status_code == 503
    assert response.headers["Retry-After"] == "2"
    assert response.json()["error"]["code"] == "legacy_unavailable"
    assert client.get("/healthz").status_code == 200


def test_lost_answer_after_a_write_is_safe_to_retry_with_the_same_key(
    make_client: Callable[..., TestClient],
) -> None:
    client = make_client(flaky_rate=0.5)
    # Request 1 fails (0.1 < 0.5) after the write was applied (0.9 >= 0.5); the next two pass (0.99).
    client.app.state.rng = ScriptedRng(0.1, 0.9, 0.99, 0.99)  # type: ignore[attr-defined]
    headers = {**auth(ANA), "Idempotency-Key": "draft-381"}

    lost = client.post("/v1/tickets", json=NEW_TICKET, headers=headers)
    assert lost.status_code == 503

    retried = client.post("/v1/tickets", json=NEW_TICKET, headers=headers)
    assert retried.status_code == 201
    listing = client.get("/v1/tickets", headers=auth(ANA)).json()
    assert [item["id"] for item in listing["items"]].count(retried.json()["id"]) == 1
    assert listing["total"] == 4  # 3 sample tickets plus the one created exactly once


def test_forced_outage_lasts_until_the_clock_passes(client: TestClient, clock: FakeClock) -> None:
    assert client.post("/admin/outage", params={"seconds": 30}, headers=auth()).status_code == 200
    down = client.get("/v1/tickets", headers=auth(ANA))
    assert down.status_code == 503
    assert int(down.headers["Retry-After"]) >= 30
    clock.advance(seconds=31)
    assert client.get("/v1/tickets", headers=auth(ANA)).status_code == 200


def test_reset_reloads_the_sample_data(client: TestClient) -> None:
    client.post("/v1/tickets", json=NEW_TICKET, headers=auth(ANA))
    assert client.post("/admin/reset", headers=auth()).status_code == 200
    items = client.get("/v1/tickets", headers=auth(ANA)).json()["items"]
    assert {item["id"] for item in items} == {"INC-20311", "INC-20298", "REQ-10442"}


def test_admin_and_docs_are_hidden_unless_enabled(tmp_path: Path, clock: FakeClock) -> None:
    settings = Settings(db_path=str(tmp_path / "sd.db"), api_key=API_KEY, admin_enabled=False)
    with TestClient(create_app(settings, clock)) as client:
        assert client.post("/admin/reset", headers=auth()).status_code == 404
        assert client.get("/docs").status_code == 404


def test_data_survives_a_restart(tmp_path: Path, clock: FakeClock) -> None:
    settings = Settings(db_path=str(tmp_path / "sd.db"), api_key=API_KEY)
    with TestClient(create_app(settings, clock)) as first:
        created = first.post("/v1/tickets", json=NEW_TICKET, headers=auth(ANA)).json()["id"]
    with TestClient(create_app(settings, clock)) as second:
        listing = second.get("/v1/tickets", headers=auth(ANA)).json()
        assert created in {item["id"] for item in listing["items"]}
        assert listing["total"] == 4  # the sample data was not loaded a second time
