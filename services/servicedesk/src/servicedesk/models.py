"""Domain vocabulary and API schemas of the simulated legacy service desk."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

SupportGroup = Literal["N1", "N2"]


class TicketType(StrEnum):
    INC = "INC"  # incident: something stopped working
    REQ = "REQ"  # request: access, equipment or software


class Category(StrEnum):
    ACESSO = "acesso"
    REDE_VPN = "rede_vpn"
    HARDWARE = "hardware"
    SOFTWARE = "software"
    EMAIL = "email"
    OUTROS = "outros"


class Priority(StrEnum):
    CRITICA = "critica"
    ALTA = "alta"
    MEDIA = "media"
    BAIXA = "baixa"


class Status(StrEnum):
    ABERTO = "aberto"
    EM_ANDAMENTO = "em_andamento"
    AGUARDANDO_ANALISTA = "aguardando_analista"
    EM_ATENDIMENTO = "em_atendimento"
    APROVADO = "aprovado"
    RESOLVIDO = "resolvido"


class Affected(StrEnum):
    ME = "me"
    TEAM = "team"
    COMPANY = "company"
    UNKNOWN = "unknown"


class EventKind(StrEnum):
    CREATED = "created"
    EMPLOYEE_UPDATE = "employee_update"
    ANALYST_RESPONSE = "analyst_response"
    TRANSFERRED = "transferred"
    ASSUMED = "assumed"
    RESOLVED = "resolved"
    REOPENED = "reopened"


class TransferReason(StrEnum):
    EMPLOYEE_REQUEST = "employee_request"
    CRITICAL = "critical"
    OVERDUE = "overdue"
    LOW_CONFIDENCE = "low_confidence"


OPEN_STATUSES = frozenset(status for status in Status if status is not Status.RESOLVIDO)
# "aprovado" waits on procurement or fulfilment, so the service desk owes no update meanwhile.
CLOCK_RUNNING_STATUSES = OPEN_STATUSES - {Status.APROVADO}

TYPE_LABELS = {TicketType.INC: "Incidente", TicketType.REQ: "Requisição"}
CATEGORY_LABELS = {
    Category.ACESSO: "Acesso",
    Category.REDE_VPN: "Rede e VPN",
    Category.HARDWARE: "Hardware",
    Category.SOFTWARE: "Software",
    Category.EMAIL: "E-mail",
    Category.OUTROS: "Outros",
}
PRIORITY_LABELS = {
    Priority.CRITICA: "Crítica",
    Priority.ALTA: "Alta",
    Priority.MEDIA: "Média",
    Priority.BAIXA: "Baixa",
}
STATUS_LABELS = {
    Status.ABERTO: "Aberto",
    Status.EM_ANDAMENTO: "Em andamento",
    Status.AGUARDANDO_ANALISTA: "Aguardando analista",
    Status.EM_ATENDIMENTO: "Em atendimento",
    Status.APROVADO: "Aprovado",
    Status.RESOLVIDO: "Resolvido",
}
AFFECTED_LABELS = {
    Affected.ME: "Somente você",
    Affected.TEAM: "Minha equipe",
    Affected.COMPANY: "Toda a empresa",
    Affected.UNKNOWN: "Não sei",
}


@dataclass(frozen=True)
class Actor:
    """Who is calling, resolved from the directory (never trusted from a header)."""

    email: str
    name: str
    role: Literal["employee", "analyst"]
    support_group: SupportGroup | None = None


# ---- responses -------------------------------------------------------------------------------


class Person(BaseModel):
    email: str
    name: str
    department: str | None = None
    support_group: SupportGroup | None = None


class Device(BaseModel):
    model: str
    os: str


class UserOut(Person):
    role: Literal["employee", "analyst"]
    device: Device | None = None
    password_changed_at: datetime | None = None


class SlaInfo(BaseModel):
    label: str
    due_at: datetime
    clock_running: bool
    overdue: bool
    overdue_by_minutes: int = 0


class SlaPreview(BaseModel):
    priority: Priority
    label: str
    business_hours: bool
    due_at: datetime
    calculated_from: datetime


class TicketEvent(BaseModel):
    id: int
    at: datetime
    kind: EventKind
    actor: Person | None
    text: str
    meta: dict[str, str] = Field(default_factory=dict)


class TicketOut(BaseModel):
    id: str
    type: TicketType
    title: str
    description: str
    category: Category
    subcategory: str | None
    priority: Priority
    status: Status
    affected: Affected
    requester: Person
    assignee: Person | None
    assigned_group: SupportGroup | None
    created_at: datetime
    updated_at: datetime
    last_response_at: datetime
    resolved_at: datetime | None
    resolution: str | None
    sla: SlaInfo
    can_reopen: bool
    reopen_until: datetime | None
    match_score: float | None = None


class TicketDetail(TicketOut):
    events: list[TicketEvent]


class TicketList(BaseModel):
    items: list[TicketOut]
    total: int


class ArticleOut(BaseModel):
    id: str
    title: str
    body: str
    category: Category
    tags: list[str]
    updated_at: datetime
    score: float | None = None


class ArticleList(BaseModel):
    items: list[ArticleOut]


class LabelOut(BaseModel):
    id: str
    label: str


class PriorityMeta(LabelOut):
    sla: str
    business_hours: bool


class StatusMeta(LabelOut):
    open: bool
    clock_running: bool


class MetaOut(BaseModel):
    types: list[LabelOut]
    categories: list[LabelOut]
    priorities: list[PriorityMeta]
    statuses: list[StatusMeta]
    affected: list[LabelOut]
    support_hours: str


# ---- requests --------------------------------------------------------------------------------


class Payload(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)


class TicketCreate(Payload):
    title: str = Field(min_length=5, max_length=120)
    description: str = Field(min_length=15, max_length=2000)
    type: TicketType
    category: Category
    subcategory: str | None = Field(default=None, max_length=60)
    priority: Priority
    affected: Affected


class TicketNote(Payload):
    text: str = Field(min_length=3, max_length=2000)


class TicketTransfer(Payload):
    to_group: SupportGroup = "N2"
    reason: TransferReason
    summary: str = Field(min_length=10, max_length=2000)


class TicketReopen(Payload):
    reason: str = Field(min_length=3, max_length=500)


class TicketResolve(Payload):
    resolution: str = Field(min_length=3, max_length=2000)
