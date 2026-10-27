import type { Affected, Category, Priority, TicketStatus } from "@/server/servicedesk/schemas";

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
