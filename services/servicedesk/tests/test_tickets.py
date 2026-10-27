from __future__ import annotations

from datetime import datetime, timezone

from fastapi.testclient import TestClient
from helpers import ANA, CARLA, MARINA, NEW_TICKET, RAFAEL, auth, moment


def open_ids(client: TestClient, email: str) -> set[str]:
    return {item["id"] for item in client.get("/v1/tickets", headers=auth(email)).json()["items"]}


def test_employee_lists_open_tickets_by_default(client: TestClient) -> None:
    assert open_ids(client, ANA) == {"INC-20311", "INC-20298", "REQ-10442"}


def test_closed_filter_returns_resolved_tickets(client: TestClient) -> None:
    body = client.get("/v1/tickets", params={"status": "closed"}, headers=auth(ANA)).json()
    assert {item["id"] for item in body["items"]} == {"INC-19877", "INC-19410"}


def test_overdue_follows_the_response_deadline(client: TestClient) -> None:
    items = {item["id"]: item for item in client.get("/v1/tickets", headers=auth(ANA)).json()["items"]}
    assert items["INC-20311"]["sla"]["overdue"] is True
    assert items["INC-20311"]["sla"]["overdue_by_minutes"] > 0
    assert items["INC-20298"]["sla"]["overdue"] is False
    # approved requests wait on procurement: the service desk owes no update meanwhile
    assert items["REQ-10442"]["sla"]["clock_running"] is False
    assert items["REQ-10442"]["sla"]["overdue"] is False


def test_text_search_ranks_the_matching_ticket_first(client: TestClient) -> None:
    items = client.get("/v1/tickets", params={"q": "notebook lento"}, headers=auth(ANA)).json()["items"]
    assert items[0]["id"] == "INC-20311"
    assert items[0]["match_score"] > 0.5


def test_create_ticket_sets_id_and_business_hours_deadline(client: TestClient) -> None:
    response = client.post("/v1/tickets", json=NEW_TICKET, headers=auth(ANA))
    assert response.status_code == 201
    ticket = response.json()
    assert ticket["id"] == "INC-20520"
    assert ticket["status"] == "aberto"
    assert ticket["requester"]["email"] == ANA
    # Wednesday 10:00 in Sao Paulo plus 4 business hours is 14:00 local, 17:00 UTC.
    assert moment(ticket["sla"]["due_at"]) == datetime(2026, 10, 28, 17, 0, tzinfo=timezone.utc)
    assert [event["kind"] for event in ticket["events"]] == ["created"]


def test_requests_and_incidents_have_their_own_numbering(client: TestClient) -> None:
    body = {**NEW_TICKET, "type": "REQ", "category": "hardware", "priority": "baixa"}
    assert client.post("/v1/tickets", json=body, headers=auth(ANA)).json()["id"] == "REQ-10443"


def test_create_requires_every_field_of_the_rules(client: TestClient) -> None:
    body = {key: value for key, value in NEW_TICKET.items() if key != "affected"}
    response = client.post("/v1/tickets", json=body, headers=auth(ANA))
    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "validation_error"
    assert any(field["field"] == "affected" for field in error["fields"])


def test_same_idempotency_key_creates_one_ticket(client: TestClient) -> None:
    headers = {**auth(ANA), "Idempotency-Key": "draft-381"}
    first = client.post("/v1/tickets", json=NEW_TICKET, headers=headers)
    second = client.post("/v1/tickets", json=NEW_TICKET, headers=headers)
    assert first.json()["id"] == second.json()["id"]
    assert len(open_ids(client, ANA)) == 4


def test_employee_update_does_not_restart_the_deadline(client: TestClient, clock) -> None:
    before = client.get("/v1/tickets/INC-20311", headers=auth(ANA)).json()
    clock.advance(hours=1)
    response = client.post(
        "/v1/tickets/INC-20311/updates",
        json={"text": "Continua lento mesmo depois de reiniciar."},
        headers=auth(ANA),
    )
    after = response.json()
    assert after["last_response_at"] == before["last_response_at"]
    assert after["sla"]["due_at"] == before["sla"]["due_at"]
    assert after["updated_at"] != before["updated_at"]
    assert after["events"][-1]["kind"] == "employee_update"


def test_resolved_ticket_does_not_accept_updates(client: TestClient) -> None:
    response = client.post(
        "/v1/tickets/INC-20150/updates", json={"text": "Mais uma informação."}, headers=auth(CARLA)
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "ticket_resolved"


def test_transfer_hands_the_ticket_to_analysts_with_a_summary(client: TestClient) -> None:
    payload = {
        "to_group": "N2",
        "reason": "employee_request",
        "summary": "Funcionária pediu para falar com um analista sobre o acesso.",
    }
    ticket = client.post("/v1/tickets/INC-20298/transfer", json=payload, headers=auth(ANA)).json()
    assert ticket["status"] == "aguardando_analista"
    assert ticket["assigned_group"] == "N2"
    assert ticket["events"][-1]["kind"] == "transferred"
    assert ticket["events"][-1]["meta"] == {"reason": "employee_request", "to_group": "N2"}


def test_transfer_of_a_ticket_already_with_analysts_is_a_no_op(client: TestClient) -> None:
    payload = {"to_group": "N2", "reason": "overdue", "summary": "Chamado vencido há dias, sem resposta."}
    ticket = client.post("/v1/tickets/INC-20311/transfer", json=payload, headers=auth(ANA)).json()
    assert [event["kind"] for event in ticket["events"]].count("transferred") == 1


def test_resolved_ticket_reports_the_reopen_window(client: TestClient) -> None:
    assert client.get("/v1/tickets/INC-20150", headers=auth(CARLA)).json()["can_reopen"] is True
    assert client.get("/v1/tickets/INC-19877", headers=auth(ANA)).json()["can_reopen"] is False


def test_reopen_within_seven_days(client: TestClient) -> None:
    response = client.post(
        "/v1/tickets/INC-20150/reopen", json={"reason": "O SAP bloqueou de novo."}, headers=auth(CARLA)
    )
    assert response.status_code == 200
    ticket = response.json()
    assert ticket["status"] == "aberto"
    assert ticket["resolved_at"] is None
    assert ticket["events"][-1]["kind"] == "reopened"
    assert ticket["sla"]["overdue"] is False


def test_reopen_after_seven_days_is_refused(client: TestClient) -> None:
    response = client.post(
        "/v1/tickets/INC-19877/reopen", json={"reason": "Voltou a acontecer."}, headers=auth(ANA)
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "reopen_window_expired"


def test_only_resolved_tickets_can_be_reopened(client: TestClient) -> None:
    response = client.post("/v1/tickets/INC-20311/reopen", json={"reason": "Ainda aberto."}, headers=auth(ANA))
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "ticket_not_resolved"


def test_analyst_takes_over_answers_and_resolves(client: TestClient) -> None:
    taken = client.post("/v1/tickets/INC-20311/assume", headers=auth(RAFAEL)).json()
    assert taken["status"] == "em_atendimento"
    assert taken["assignee"]["email"] == RAFAEL
    assert taken["sla"]["overdue"] is False  # taking over is a service desk response

    answered = client.post(
        "/v1/tickets/INC-20311/respond",
        json={"text": "Vou verificar o driver de vídeo remotamente."},
        headers=auth(RAFAEL),
    ).json()
    assert answered["events"][-1]["kind"] == "analyst_response"
    assert answered["status"] == "em_atendimento"

    resolved = client.post(
        "/v1/tickets/INC-20311/resolve", json={"resolution": "Driver de vídeo atualizado."}, headers=auth(RAFAEL)
    ).json()
    assert resolved["status"] == "resolvido"
    assert resolved["resolution"] == "Driver de vídeo atualizado."
    assert open_ids(client, ANA) == {"INC-20298", "REQ-10442"}


def test_first_analyst_response_moves_a_new_ticket_to_in_progress(client: TestClient) -> None:
    ticket = client.post(
        "/v1/tickets/INC-20519/respond", json={"text": "Verificando a fila da impressora."}, headers=auth(MARINA)
    ).json()
    assert ticket["status"] == "em_andamento"


def test_employees_cannot_use_analyst_actions(client: TestClient) -> None:
    bodies = {"assume": None, "respond": {"text": "Resposta indevida."}, "resolve": {"resolution": "Indevido."}}
    for action, body in bodies.items():
        response = client.post(f"/v1/tickets/INC-20311/{action}", json=body, headers=auth(ANA))
        assert response.status_code == 403, action
        assert response.json()["error"]["code"] == "analyst_only"


def test_analysts_do_not_open_tickets(client: TestClient) -> None:
    response = client.post("/v1/tickets", json=NEW_TICKET, headers=auth(RAFAEL))
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "employee_only"


def test_reference_data_describes_priorities_and_deadlines(client: TestClient) -> None:
    meta = client.get("/v1/meta", headers=auth()).json()
    priorities = {item["id"]: item for item in meta["priorities"]}
    assert priorities["critica"]["sla"] == "1 hora"
    assert priorities["alta"]["sla"] == "4 horas úteis"
    assert priorities["media"]["sla"] == "3 dias úteis"
    assert priorities["baixa"]["sla"] == "5 dias úteis"
    assert len(meta["categories"]) == 6


def test_sla_preview_matches_the_deadline_of_a_new_ticket(client: TestClient) -> None:
    preview = client.get("/v1/sla/alta", headers=auth()).json()
    created = client.post("/v1/tickets", json=NEW_TICKET, headers=auth(ANA)).json()
    assert preview["business_hours"] is True
    assert preview["due_at"] == created["sla"]["due_at"]


def test_directory_exposes_the_employee_device(client: TestClient) -> None:
    profile = client.get(f"/v1/directory/{ANA}", headers=auth()).json()
    assert profile["name"] == "Ana Souza"
    assert profile["device"]["os"] == "Windows 11"
    assert client.get("/v1/directory/ninguem@nexo.com.br", headers=auth()).status_code == 404
