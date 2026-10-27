from __future__ import annotations

from fastapi.testclient import TestClient
from helpers import ANA, CARLA, NEW_TICKET, RAFAEL, auth


def test_another_employees_ticket_looks_like_a_missing_one(client: TestClient) -> None:
    response = client.get("/v1/tickets/INC-20150", headers=auth(ANA))
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "ticket_not_found"
    assert "SAP" not in response.text


def test_employee_lists_never_include_other_requesters(client: TestClient) -> None:
    for status in ("open", "closed", "all"):
        items = client.get("/v1/tickets", params={"status": status}, headers=auth(ANA)).json()["items"]
        assert {item["requester"]["email"] for item in items} == {ANA}


def test_search_does_not_leak_other_employees_tickets(client: TestClient) -> None:
    body = client.get("/v1/tickets", params={"q": "senha SAP", "status": "all"}, headers=auth(ANA)).json()
    assert body["items"]
    assert all(item["requester"]["email"] == ANA for item in body["items"])
    assert "INC-20150" not in {item["id"] for item in body["items"]}


def test_employee_cannot_filter_by_someone_else(client: TestClient) -> None:
    response = client.get("/v1/tickets", params={"requester": CARLA}, headers=auth(ANA))
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "forbidden_requester"


def test_employee_cannot_write_to_another_employees_ticket(client: TestClient) -> None:
    attempts = {
        "updates": {"text": "Complemento indevido."},
        "reopen": {"reason": "Tentativa indevida."},
        "transfer": {"to_group": "N2", "reason": "employee_request", "summary": "Tentativa indevida de transferir."},
    }
    for action, body in attempts.items():
        response = client.post(f"/v1/tickets/INC-20150/{action}", json=body, headers=auth(ANA))
        assert response.status_code == 404, action


def test_analyst_sees_every_ticket_and_can_filter_by_requester(client: TestClient) -> None:
    everything = client.get("/v1/tickets", params={"status": "all", "limit": 100}, headers=auth(RAFAEL)).json()
    assert everything["total"] == 10
    carla = client.get("/v1/tickets", params={"status": "all", "requester": CARLA}, headers=auth(RAFAEL)).json()
    assert [item["id"] for item in carla["items"]] == ["INC-20150"]


def test_missing_or_wrong_api_key_is_rejected(client: TestClient) -> None:
    assert client.get("/v1/tickets", headers={"X-Actor-Email": ANA}).status_code == 401
    assert client.get("/v1/tickets", headers=auth(ANA, key="wrong")).status_code == 401
    assert client.get("/v1/meta").status_code == 401


def test_actor_must_exist_in_the_directory(client: TestClient) -> None:
    assert client.get("/v1/tickets", headers=auth()).status_code == 401
    response = client.get("/v1/tickets", headers=auth("intruso@nexo.com.br"))
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "unknown_actor"


def test_idempotency_keys_are_scoped_per_actor(client: TestClient) -> None:
    key = {"Idempotency-Key": "same-key"}
    first = client.post("/v1/tickets", json=NEW_TICKET, headers={**auth(ANA), **key}).json()
    second = client.post("/v1/tickets", json=NEW_TICKET, headers={**auth(CARLA), **key}).json()
    assert first["id"] != second["id"]
    assert second["requester"]["email"] == CARLA
