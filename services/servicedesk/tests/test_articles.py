from __future__ import annotations

from fastapi.testclient import TestClient
from helpers import auth


def search(client: TestClient, query: str) -> list[dict]:
    return client.get("/v1/articles", params={"q": query}, headers=auth()).json()["items"]


def test_vpn_question_finds_the_809_article(client: TestClient) -> None:
    items = search(client, "meu notebook não conecta na VPN, erro 809")
    assert items[0]["id"] == "KB-001"
    assert items[0]["score"] > 0.5
    assert "Windows 10" in items[0]["body"]


def test_service_hours_question(client: TestClient) -> None:
    assert search(client, "qual o horário do service desk?")[0]["id"] == "KB-002"


def test_sap_password_question(client: TestClient) -> None:
    assert search(client, "senha do SAP bloqueada")[0]["id"] == "KB-004"


def test_plural_and_accents_do_not_matter(client: TestClient) -> None:
    assert search(client, "IMPRESSORAS nao imprimem")[0]["id"] == "KB-010"


def test_unrelated_question_finds_nothing(client: TestClient) -> None:
    assert search(client, "receita de bolo de cenoura") == []


def test_listing_without_a_question_respects_the_limit(client: TestClient) -> None:
    body = client.get("/v1/articles", params={"limit": 3}, headers=auth()).json()
    assert [item["id"] for item in body["items"]] == ["KB-001", "KB-002", "KB-003"]


def test_article_by_id(client: TestClient) -> None:
    assert client.get("/v1/articles/KB-005", headers=auth()).json()["title"].startswith("Wi-Fi")
    assert client.get("/v1/articles/KB-999", headers=auth()).status_code == 404
