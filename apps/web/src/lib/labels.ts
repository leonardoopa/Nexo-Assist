import type { Intent } from "@/server/agent/decision";
import type { HandoffReason } from "@/server/conversations/types";
import type { Affected, Category, Priority, TicketStatus } from "@/server/servicedesk/schemas";

export const INTENT_LABEL: Record<Intent, string> = {
  answer_question: "Tirar uma dúvida",
  check_ticket: "Consultar chamado",
  update_ticket: "Complementar chamado",
  open_ticket: "Abrir chamado",
  reopen_ticket: "Reabrir chamado",
  ask_missing_info: "Pedir informação que falta",
  confirm_action: "Confirmar ação",
  cancel_action: "Cancelar ação",
  handoff: "Chamar um analista",
  out_of_scope: "Fora do escopo de TI",
  small_talk: "Conversa",
  unclear: "Pedido pouco claro",
  error: "Erro",
};

export const HANDOFF_REASON_LABEL: Record<HandoffReason, string> = {
  employee_request: "O funcionário pediu um analista",
  critical: "Caso crítico",
  overdue: "Chamado vencido",
  low_confidence: "O agent não teve segurança",
};

// Portuguese names for the service desk vocabulary, shared by the agent and the screens.

export const PRIORITY_LABEL: Record<Priority, string> = {
  critica: "Crítica",
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
};

/** First-response deadline per priority (Annex A). The service desk computes the exact date. */
export const SLA_LABEL: Record<Priority, string> = {
  critica: "1 hora",
  alta: "4 horas úteis",
  media: "3 dias úteis",
  baixa: "5 dias úteis",
};

export const STATUS_LABEL: Record<TicketStatus, string> = {
  aberto: "Aberto",
  em_andamento: "Em andamento",
  aguardando_analista: "Aguardando analista",
  em_atendimento: "Em atendimento",
  aprovado: "Aprovado",
  resolvido: "Resolvido",
};

export const CATEGORY_LABEL: Record<Category, string> = {
  acesso: "Acesso",
  rede_vpn: "Rede e VPN",
  hardware: "Hardware",
  software: "Software",
  email: "E-mail",
  outros: "Outros",
};

export const AFFECTED_LABEL: Record<Affected, string> = {
  me: "Somente você",
  team: "Minha equipe",
  company: "Toda a empresa",
  unknown: "Não sei",
};
