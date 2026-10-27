"""Sample data: employees, analysts, help center articles and tickets in varied situations.

Every timestamp is relative to the moment of seeding, so "overdue", "resolved 4 days ago" and
"resolved too long ago to reopen" keep their meaning whenever the database is created.
"""

from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from . import sla, store
from .db import Database, transaction
from .models import Priority
from .timeutil import iso

ANA = "ana.souza@nexo.com.br"
CARLA = "carla.mendes@nexo.com.br"
BRUNO = "bruno.tavares@nexo.com.br"
DIEGO = "diego.ramos@nexo.com.br"
ELISA = "elisa.prado@nexo.com.br"
FABIO = "fabio.nunes@nexo.com.br"
GABRIELA = "gabriela.rocha@nexo.com.br"
RAFAEL = "rafael.lima@nexo.com.br"
MARINA = "marina.alves@nexo.com.br"


def _employee(email: str, name: str, department: str, model: str, os: str, password_age_days: int) -> dict[str, Any]:
    return {
        "email": email,
        "name": name,
        "department": department,
        "role": "employee",
        "support_group": None,
        "device_model": model,
        "device_os": os,
        "password_age": timedelta(days=password_age_days),
    }


def _analyst(email: str, name: str, group: str) -> dict[str, Any]:
    return {
        "email": email,
        "name": name,
        "department": "TI",
        "role": "analyst",
        "support_group": group,
        "device_model": None,
        "device_os": None,
        "password_age": None,
    }


USERS = [
    _employee(ANA, "Ana Souza", "Financeiro", "Dell Latitude 5440", "Windows 11", 42),
    _employee(CARLA, "Carla Mendes", "Controladoria", "Lenovo ThinkPad T14", "Windows 11", 15),
    _employee(BRUNO, "Bruno Tavares", "Operações", "HP EliteBook 840", "Windows 10", 77),
    _employee(DIEGO, "Diego Ramos", "Marketing", "MacBook Pro 14", "macOS 15", 30),
    _employee(ELISA, "Elisa Prado", "Jurídico", "Dell Latitude 5440", "Windows 11", 8),
    _employee(FABIO, "Fábio Nunes", "Logística", "Lenovo ThinkPad E14", "Windows 10", 51),
    _employee(GABRIELA, "Gabriela Rocha", "Recursos Humanos", "HP ProBook 450", "Windows 11", 3),
    _analyst(RAFAEL, "Rafael Lima", "N2"),
    _analyst(MARINA, "Marina Alves", "N1"),
]

ARTICLES = [
    {
        "id": "KB-001",
        "title": "VPN com erro 809",
        "category": "rede_vpn",
        "tags": ["vpn", "erro 809", "windows 10", "cliente vpn", "conexão"],
        "body": (
            "Erro 809 na VPN: reinstale o cliente de VPN pelo portal de softwares e reinicie o computador. "
            "Vale apenas para Windows 10; no Windows 11, abra um chamado."
        ),
    },
    {
        "id": "KB-002",
        "title": "Horário de atendimento do service desk",
        "category": "outros",
        "tags": ["horário", "atendimento", "plantão", "service desk", "suporte"],
        "body": (
            "O service desk atende de segunda a sexta, das 8h às 18h. "
            "Chamados críticos têm plantão 24 horas."
        ),
    },
    {
        "id": "KB-003",
        "title": "Redefinir a senha da rede",
        "category": "acesso",
        "tags": ["senha", "rede", "redefinir", "expirou", "bloqueio", "login"],
        "body": (
            "Abra o portal de senhas na intranet, informe o e-mail corporativo e confirme o código enviado ao "
            "celular cadastrado. A senha expira a cada 90 dias. Depois de 5 tentativas erradas a conta fica "
            "bloqueada por 15 minutos; se continuar bloqueada, abra um chamado de acesso."
        ),
    },
    {
        "id": "KB-004",
        "title": "Senha do SAP bloqueada",
        "category": "acesso",
        "tags": ["sap", "senha", "bloqueada", "desbloqueio", "usuário"],
        "body": (
            "O SAP não tem desbloqueio por autoatendimento. Abra um chamado do tipo incidente, categoria Acesso, "
            "informando o seu usuário SAP. O desbloqueio costuma levar poucas horas úteis."
        ),
    },
    {
        "id": "KB-005",
        "title": "Wi-Fi corporativo e Wi-Fi de visitantes",
        "category": "rede_vpn",
        "tags": ["wifi", "wi-fi", "rede sem fio", "visitantes", "internet"],
        "body": (
            "A rede Nexo-Corp usa o e-mail corporativo e a senha da rede. Visitantes usam a rede Nexo-Visitas, "
            "cuja senha muda toda segunda-feira e fica com a recepção. Não compartilhe a senha da Nexo-Corp."
        ),
    },
    {
        "id": "KB-006",
        "title": "Outlook não sincroniza no celular",
        "category": "email",
        "tags": ["outlook", "e-mail", "email", "celular", "sincronização", "aplicativo"],
        "body": (
            "No aplicativo Outlook, abra Configurações, remova a conta e adicione de novo com o e-mail "
            "corporativo, confirmando o segundo fator quando pedido. Se o erro continuar, abra um chamado de e-mail."
        ),
    },
    {
        "id": "KB-007",
        "title": "Como solicitar um software",
        "category": "software",
        "tags": ["software", "instalar", "licença", "programa", "portal de softwares"],
        "body": (
            "Softwares homologados (Office, Teams, Zoom, Adobe Reader) são instalados pelo portal de softwares, "
            "sem chamado. Qualquer outro software exige uma requisição (REQ), categoria Software, com aprovação "
            "do gestor. O prazo médio é de 5 dias úteis."
        ),
    },
    {
        "id": "KB-008",
        "title": "Como solicitar equipamento",
        "category": "hardware",
        "tags": ["equipamento", "monitor", "teclado", "mouse", "headset", "home office"],
        "body": (
            "Monitor, teclado, mouse e headset são pedidos por requisição (REQ), categoria Hardware, com "
            "aprovação do gestor. Para home office, a empresa libera um segundo monitor por pessoa."
        ),
    },
    {
        "id": "KB-009",
        "title": "Notebook lento",
        "category": "hardware",
        "tags": ["notebook", "lento", "lentidão", "travando", "desempenho", "diagnóstico"],
        "body": (
            "Reinicie o computador, feche programas que não está usando e libere espaço em disco (mantenha ao "
            "menos 15% livre). Rode o diagnóstico em Iniciar > Diagnóstico Nexo. Se a lentidão continuar, abra um "
            "chamado de hardware com o resultado do diagnóstico."
        ),
    },
    {
        "id": "KB-010",
        "title": "Adicionar impressora de rede",
        "category": "hardware",
        "tags": ["impressora", "imprimir", "fila de impressão", "spooler", "rede"],
        "body": (
            "Abra Configurações > Impressoras, escolha Adicionar impressora e selecione a do seu andar na lista "
            "da rede Nexo. Se o trabalho ficar preso na fila, reinicie o serviço de impressão pelo portal de "
            "softwares ou abra um chamado."
        ),
    },
]

_FORM = "Chamado aberto pelo formulário do service desk."

# Each event is (age, kind, actor, text, meta); `created`, `responded` and `resolved` are ages too.
TICKETS: list[dict[str, Any]] = [
    {
        "id": "INC-20311",
        "requester": ANA,
        "title": "Notebook lento após atualização do Windows",
        "description": (
            "Lentidão geral desde a atualização do Windows. Reiniciar e rodar o diagnóstico da central de "
            "ajuda não resolveu."
        ),
        "category": "hardware",
        "subcategory": "Notebook",
        "priority": "media",
        "status": "aguardando_analista",
        "affected": "me",
        "assignee": None,
        "group": "N2",
        "created": timedelta(days=9),
        "responded": timedelta(days=6),
        "events": [
            (timedelta(days=9), "created", ANA, _FORM, {}),
            (timedelta(days=6), "analyst_response", MARINA, "Diagnóstico remoto sem sucesso.", {}),
            (
                timedelta(days=6),
                "transferred",
                MARINA,
                "Encaminhado ao Suporte N2 após o diagnóstico remoto sem sucesso.",
                {"reason": "low_confidence", "to_group": "N2"},
            ),
        ],
    },
    {
        "id": "INC-20298",
        "requester": ANA,
        "title": "Acesso à pasta Financeiro no SharePoint",
        "description": "Preciso de acesso de edição à pasta Financeiro no SharePoint para fechar o relatório mensal.",
        "category": "acesso",
        "subcategory": "SharePoint",
        "priority": "media",
        "status": "em_andamento",
        "affected": "me",
        "assignee": MARINA,
        "group": "N1",
        "created": timedelta(days=12),
        "responded": timedelta(days=1),
        "events": [
            (timedelta(days=12), "created", ANA, _FORM, {}),
            (timedelta(days=1), "analyst_response", MARINA, "Acesso solicitado ao dono da pasta. Aguardando aprovação.", {}),
        ],
    },
    {
        "id": "REQ-10442",
        "requester": ANA,
        "title": "Segundo monitor para home office",
        "description": "Solicito um segundo monitor para uso no home office, conforme a política de equipamentos.",
        "category": "hardware",
        "subcategory": "Periféricos",
        "priority": "baixa",
        "status": "aprovado",
        "affected": "me",
        "assignee": None,
        "group": None,
        "created": timedelta(days=14),
        "responded": timedelta(days=7),
        "events": [
            (timedelta(days=14), "created", ANA, _FORM, {}),
            (timedelta(days=7), "analyst_response", MARINA, "Pedido aprovado pelo gestor. Compra do monitor em andamento.", {}),
        ],
    },
    {
        "id": "INC-19877",
        "requester": ANA,
        "title": "Outlook não sincroniza no celular",
        "description": "O Outlook do celular parou de baixar novos e-mails desde a troca da senha.",
        "category": "email",
        "subcategory": "Outlook",
        "priority": "media",
        "status": "resolvido",
        "affected": "me",
        "assignee": MARINA,
        "group": "N1",
        "created": timedelta(days=57),
        "responded": timedelta(days=55),
        "events": [
            (timedelta(days=57), "created", ANA, _FORM, {}),
            (timedelta(days=56), "analyst_response", MARINA, "Conta removida e adicionada novamente no aplicativo.", {}),
            (timedelta(days=55), "resolved", MARINA, "Sincronização normalizada após reconfigurar a conta.", {}),
        ],
    },
    {
        "id": "INC-19410",
        "requester": ANA,
        "title": "Troca de senha da rede",
        "description": "Preciso trocar a senha da rede porque ela vai expirar esta semana.",
        "category": "acesso",
        "subcategory": None,
        "priority": "baixa",
        "status": "resolvido",
        "affected": "me",
        "assignee": MARINA,
        "group": "N1",
        "created": timedelta(days=109),
        "responded": timedelta(days=108),
        "events": [
            (timedelta(days=109), "created", ANA, _FORM, {}),
            (timedelta(days=108), "resolved", MARINA, "Senha redefinida e enviada por SMS ao celular cadastrado.", {}),
        ],
    },
    {
        "id": "INC-20150",
        "requester": CARLA,
        "title": "Senha do SAP bloqueada",
        "description": "Errei a senha do SAP algumas vezes e a conta bloqueou. Preciso do acesso para o fechamento.",
        "category": "acesso",
        "subcategory": "SAP",
        "priority": "media",
        "status": "resolvido",
        "affected": "me",
        "assignee": MARINA,
        "group": "N1",
        "created": timedelta(days=5),
        "responded": timedelta(days=4),
        "events": [
            (timedelta(days=5), "created", CARLA, _FORM, {}),
            (timedelta(days=4), "resolved", MARINA, "Usuário SAP desbloqueado e senha provisória enviada.", {}),
        ],
    },
    {
        "id": "INC-20402",
        "requester": BRUNO,
        "title": "Wi-Fi do prédio B cai toda hora",
        "description": "A conexão Wi-Fi do prédio B cai várias vezes por hora e atrapalha a equipe de operações.",
        "category": "rede_vpn",
        "subcategory": "Wi-Fi",
        "priority": "alta",
        "status": "em_andamento",
        "affected": "team",
        "assignee": MARINA,
        "group": "N1",
        "created": timedelta(days=1),
        "responded": timedelta(hours=3),
        "events": [
            (timedelta(days=1), "created", BRUNO, _FORM, {}),
            (timedelta(hours=3), "analyst_response", MARINA, "Equipe de redes verificando os access points do prédio B.", {}),
        ],
    },
    {
        "id": "REQ-10430",
        "requester": DIEGO,
        "title": "Licença do Adobe Creative Cloud",
        "description": "Preciso da licença do Adobe Creative Cloud para editar as peças da campanha de novembro.",
        "category": "software",
        "subcategory": "Licença",
        "priority": "baixa",
        "status": "aberto",
        "affected": "me",
        "assignee": None,
        "group": None,
        "created": timedelta(days=2),
        "responded": timedelta(days=2),
        "events": [(timedelta(days=2), "created", DIEGO, _FORM, {})],
    },
    {
        "id": "INC-20519",
        "requester": ELISA,
        "title": "Impressora do 3º andar não imprime",
        "description": "A impressora do 3º andar não imprime desde cedo e os trabalhos ficam presos na fila.",
        "category": "hardware",
        "subcategory": "Impressora",
        "priority": "media",
        "status": "aberto",
        "affected": "team",
        "assignee": None,
        "group": None,
        "created": timedelta(minutes=20),
        "responded": timedelta(minutes=20),
        "events": [(timedelta(minutes=20), "created", ELISA, "Chamado aberto pelo Nexo Assist após confirmação.", {})],
    },
    {
        "id": "INC-20480",
        "requester": FABIO,
        "title": "Teclado com teclas falhando",
        "description": "Várias teclas do teclado do notebook não respondem ou repetem letras.",
        "category": "hardware",
        "subcategory": "Periféricos",
        "priority": "baixa",
        "status": "resolvido",
        "affected": "me",
        "assignee": MARINA,
        "group": "N1",
        "created": timedelta(days=3),
        "responded": timedelta(days=1),
        "events": [
            (timedelta(days=3), "created", FABIO, _FORM, {}),
            (timedelta(days=2), "analyst_response", MARINA, "Teclado de reposição separado na recepção da TI.", {}),
            (timedelta(days=1), "resolved", MARINA, "Teclado trocado e testado com o usuário.", {}),
        ],
    },
]


def _insert_ticket(conn: sqlite3.Connection, spec: dict[str, Any], now: datetime, tz: ZoneInfo) -> None:
    events = spec["events"]
    responded_at = now - spec["responded"]
    resolution = next((text for _, kind, _, text, _ in events if kind == "resolved"), None)
    resolved_at = responded_at if resolution else None
    store.insert_ticket(
        conn,
        {
            "id": spec["id"],
            "type": spec["id"][:3],
            "title": spec["title"],
            "description": spec["description"],
            "category": spec["category"],
            "subcategory": spec["subcategory"],
            "priority": spec["priority"],
            "status": spec["status"],
            "affected": spec["affected"],
            "requester_email": spec["requester"],
            "assignee_email": spec["assignee"],
            "assigned_group": spec["group"],
            "created_at": iso(now - spec["created"]),
            "updated_at": iso(now - min(age for age, *_ in events)),
            "last_response_at": iso(responded_at),
            "due_at": iso(sla.due_at(Priority(spec["priority"]), responded_at, tz)),
            "resolved_at": iso(resolved_at) if resolved_at else None,
            "resolution": resolution,
        },
    )
    for age, kind, actor, text, meta in events:
        store.insert_event(conn, spec["id"], now - age, kind, actor, text, meta)


def seed_database(db: Database, now: datetime, tz: ZoneInfo) -> None:
    with db.connect() as conn, transaction(conn):
        for user in USERS:
            age = user["password_age"]
            store.insert_user(
                conn, {**user, "password_changed_at": iso(now - age) if age is not None else None}
            )
        for article in ARTICLES:
            store.insert_article(conn, {**article, "updated_at": iso(now - timedelta(days=30))})
        for spec in TICKETS:
            _insert_ticket(conn, spec, now, tz)
