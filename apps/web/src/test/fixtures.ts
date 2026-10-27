import type { Article, Ticket } from "@/server/servicedesk/schemas";

/** Wednesday 28 October 2026, 10:00 in Sao Paulo. */
export const NOW = new Date("2026-10-28T13:00:00Z");

const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
const daysAhead = (days: number) => new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000).toISOString();

export const ANA = { email: "ana.souza@nexo.com.br", name: "Ana Souza", department: "Financeiro", supportGroup: null } as const;
export const CARLA = { email: "carla.mendes@nexo.com.br", name: "Carla Mendes", department: "Controladoria", supportGroup: null } as const;

export function ticket(overrides: Partial<Ticket> & Pick<Ticket, "id" | "title">): Ticket {
  return {
    type: overrides.id.startsWith("REQ") ? "REQ" : "INC",
    description: "Descrição do chamado de teste com detalhes suficientes.",
    category: "hardware",
    subcategory: null,
    priority: "media",
    status: "aberto",
    affected: "me",
    requester: ANA,
    assignee: null,
    assignedGroup: null,
    createdAt: daysAgo(3),
    updatedAt: daysAgo(1),
    lastResponseAt: daysAgo(1),
    resolvedAt: null,
    resolution: null,
    sla: { label: "3 dias úteis", dueAt: daysAhead(2), clockRunning: true, overdue: false, overdueByMinutes: 0 },
    canReopen: false,
    reopenUntil: null,
    matchScore: null,
    ...overrides,
  };
}

export const ANA_TICKETS: Ticket[] = [
  ticket({
    id: "INC-20311",
    title: "Notebook lento após atualização do Windows",
    description: "Lentidão geral desde a atualização do Windows. Reiniciar e rodar o diagnóstico da central de ajuda não resolveu.",
    subcategory: "Notebook",
    status: "aguardando_analista",
    assignedGroup: "N2",
    createdAt: daysAgo(9),
    lastResponseAt: daysAgo(6),
    sla: { label: "3 dias úteis", dueAt: daysAgo(1), clockRunning: true, overdue: true, overdueByMinutes: 1320 },
  }),
  ticket({
    id: "INC-20298",
    title: "Acesso à pasta Financeiro no SharePoint",
    description: "Preciso de acesso de edição à pasta Financeiro no SharePoint para fechar o relatório mensal.",
    category: "acesso",
    subcategory: "SharePoint",
    status: "em_andamento",
    createdAt: daysAgo(12),
  }),
  ticket({
    id: "REQ-10442",
    title: "Segundo monitor para home office",
    description: "Solicito um segundo monitor para uso no home office, conforme a política de equipamentos.",
    subcategory: "Periféricos",
    priority: "baixa",
    status: "aprovado",
    createdAt: daysAgo(14),
    lastResponseAt: daysAgo(7),
    sla: { label: "5 dias úteis", dueAt: daysAhead(1), clockRunning: false, overdue: false, overdueByMinutes: 0 },
  }),
  ticket({
    id: "INC-19877",
    title: "Outlook não sincroniza no celular",
    description: "O Outlook do celular parou de baixar novos e-mails desde a troca da senha.",
    category: "email",
    subcategory: "Outlook",
    status: "resolvido",
    resolvedAt: daysAgo(55),
    resolution: "Sincronização normalizada após reconfigurar a conta.",
    createdAt: daysAgo(57),
  }),
];

export const CARLA_TICKETS: Ticket[] = [
  ticket({
    id: "INC-20150",
    title: "Senha do SAP bloqueada",
    description: "Errei a senha do SAP algumas vezes e a conta bloqueou. Preciso do acesso para o fechamento.",
    category: "acesso",
    subcategory: "SAP",
    status: "resolvido",
    requester: CARLA,
    resolvedAt: daysAgo(4),
    canReopen: true,
    reopenUntil: daysAhead(3),
    createdAt: daysAgo(5),
  }),
];

const article = (id: string, title: string, body: string, tags: string[], category: Article["category"]): Article => ({
  id,
  title,
  body,
  category,
  tags,
  updatedAt: daysAgo(30),
  score: null,
});

export const ARTICLES: Article[] = [
  article(
    "KB-001",
    "VPN com erro 809",
    "Erro 809 na VPN: reinstale o cliente de VPN pelo portal de softwares e reinicie o computador. Vale apenas para Windows 10; no Windows 11, abra um chamado.",
    ["vpn", "erro 809", "windows 10", "cliente vpn", "conexão"],
    "rede_vpn",
  ),
  article(
    "KB-002",
    "Horário de atendimento do service desk",
    "O service desk atende de segunda a sexta, das 8h às 18h. Chamados críticos têm plantão 24 horas.",
    ["horário", "atendimento", "plantão", "service desk", "suporte"],
    "outros",
  ),
  article(
    "KB-009",
    "Notebook lento",
    "Reinicie o computador, feche programas que não está usando e libere espaço em disco. Rode o diagnóstico em Iniciar > Diagnóstico Nexo. Se a lentidão continuar, abra um chamado de hardware.",
    ["notebook", "lento", "lentidão", "travando", "desempenho", "diagnóstico"],
    "hardware",
  ),
];
