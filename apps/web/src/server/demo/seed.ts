import { randomUUID } from "node:crypto";

import type { SupportGroup } from "@/lib/domain";
import { SLA_LABEL } from "@/lib/labels";
import { buildDecision, type DecisionRecord, type Guardrail, type Intent, type RuleFacts } from "@/server/agent/decision";
import { DecisionStore } from "@/server/agent/decision-store";
import type { ConfidenceEvidence } from "@/server/agent/policy/confidence";
import { stepLabels } from "@/server/agent/steps";
import { ConversationStore } from "@/server/conversations/store";
import type { AnalystRef, EmployeeRef, HandoffReason, MessagePart, TicketSnapshot } from "@/server/conversations/types";
import type { Db } from "@/server/db/types";
import type { Priority } from "@/server/servicedesk/schemas";

/*
 * Demo conversations for the analyst console. They are written through the same stores the app
 * uses (so every rule of the conversation state machine holds) and talk about tickets that exist
 * in the service desk's own sample data. Ana Souza is left without a conversation on purpose, so
 * the employee chat can be tried live from a clean start.
 */

const MINUTE = 60_000;

const BRUNO: EmployeeRef = { email: "bruno.tavares@nexo.com.br", name: "Bruno Tavares", department: "Operações" };
const CARLA: EmployeeRef = { email: "carla.mendes@nexo.com.br", name: "Carla Mendes", department: "Controladoria" };
const DIEGO: EmployeeRef = { email: "diego.ramos@nexo.com.br", name: "Diego Ramos", department: "Marketing" };
const ELISA: EmployeeRef = { email: "elisa.prado@nexo.com.br", name: "Elisa Prado", department: "Jurídico" };
const FABIO: EmployeeRef = { email: "fabio.nunes@nexo.com.br", name: "Fábio Nunes", department: "Logística" };
const GABRIELA: EmployeeRef = { email: "gabriela.rocha@nexo.com.br", name: "Gabriela Rocha", department: "Recursos Humanos" };
const RAFAEL: AnalystRef = { email: "rafael.lima@nexo.com.br", name: "Rafael Lima" };

/** Writes the story as if it had happened in the minutes before `base`, one dated call at a time. */
class Stage {
  readonly store: ConversationStore;
  readonly decisions: DecisionStore;
  #current: Date;

  constructor(
    db: Db,
    readonly base: Date,
    messageLimit: number,
  ) {
    this.#current = base;
    this.store = new ConversationStore(db, { messageLimit, now: () => this.#current });
    this.decisions = new DecisionStore(db, () => this.#current);
  }

  at<T>(minutesAgo: number, work: () => T): T {
    this.#current = new Date(this.base.getTime() - minutesAgo * MINUTE);
    return work();
  }

  /** An instant relative to the seed, e.g. the deadline of a response. */
  iso(minutesFromNow: number): string {
    return new Date(this.base.getTime() + minutesFromNow * MINUTE).toISOString();
  }

  start(employee: EmployeeRef, minutesAgo: number): string {
    return this.at(minutesAgo, () => this.store.start(employee)).id;
  }

  employeeSays(conversationId: string, minutesAgo: number, content: string): void {
    this.at(minutesAgo, () => this.store.appendMessage(conversationId, { role: "user", content }));
  }

  agentSays(conversationId: string, minutesAgo: number, content: string, decision: DecisionRecord, parts: MessagePart[] = []): void {
    this.at(minutesAgo, () => {
      const { message } = this.store.appendMessage(conversationId, { role: "assistant", content, parts });
      this.decisions.save({ id: randomUUID(), conversationId, messageId: message.id, decision });
    });
  }

  analystSays(conversationId: string, minutesAgo: number, analyst: AnalystRef, content: string): void {
    this.at(minutesAgo, () => {
      this.store.appendMessage(conversationId, { role: "analyst", content, author: analyst });
      this.store.markReadByAnalyst(conversationId);
    });
  }

  ticketCard(spec: {
    id: string;
    title: string;
    category: TicketSnapshot["category"];
    subcategory: string | null;
    priority: Priority;
    status: TicketSnapshot["status"];
    createdMinutesAgo: number;
    respondedMinutesAgo: number;
    dueInMinutes: number;
    clockRunning: boolean;
  }): MessagePart {
    return {
      type: "ticket_card",
      ticket: {
        id: spec.id,
        type: spec.id.startsWith("REQ") ? "REQ" : "INC",
        title: spec.title,
        category: spec.category,
        subcategory: spec.subcategory,
        priority: spec.priority,
        status: spec.status,
        createdAt: this.iso(-spec.createdMinutesAgo),
        lastResponseAt: this.iso(-spec.respondedMinutesAgo),
        dueAt: this.iso(spec.dueInMinutes),
        slaLabel: SLA_LABEL[spec.priority],
        overdue: spec.dueInMinutes < 0 && spec.clockRunning,
        clockRunning: spec.clockRunning,
      },
    };
  }
}

interface Reasoning {
  intent: Intent;
  understanding: string;
  action: string;
  rationale: string;
  /** What the model said about its own certainty; the evidence may lower it. */
  score: number;
  steps?: Array<{ tool: string; subject?: string; summary: string }>;
  facts?: Partial<RuleFacts>;
  evidence?: Partial<ConfidenceEvidence>;
  guardrails?: Guardrail[];
  handoff?: { reason: HandoffReason; group: SupportGroup; ticketId: string | null; respondBy?: string; auto?: boolean };
}

/** The record the console explains an answer with, built by the function the real agent uses. */
function decide(reasoning: Reasoning): DecisionRecord {
  const steps = (reasoning.steps ?? []).map((step, index) => ({
    id: `${step.tool}-${index + 1}`,
    tool: step.tool,
    label: stepLabels(step.tool, step.subject).done,
    status: "ok" as const,
    durationMs: 140 + index * 85,
    input: step.subject ? { ticketId: step.subject } : {},
    summary: step.summary,
  }));
  const { handoff } = reasoning;

  return buildDecision({
    intent: reasoning.intent,
    understanding: reasoning.understanding,
    action: reasoning.action,
    rationale: reasoning.rationale,
    modelConfidence: reasoning.score,
    claimedRules: [],
    ruleFacts: {
      priorityClassified: false,
      draftKinds: [],
      duplicateBlocked: false,
      handoffReason: handoff?.reason ?? null,
      ticketLookups: steps.some((step) => step.tool === "list_my_tickets" || step.tool === "get_ticket"),
      ...reasoning.facts,
    },
    evidence: { knowledgeTopScore: null, toolErrors: 0, explicitConfirmation: false, guardrailTriggered: false, ...reasoning.evidence },
    steps,
    guardrails: reasoning.guardrails ?? [],
    handoff: handoff ? { reason: handoff.reason, group: handoff.group, respondBy: handoff.respondBy ?? null, ticketId: handoff.ticketId, auto: handoff.auto ?? false } : null,
    // Nothing here came from a model, and the record must not claim it did.
    usage: null,
  }).decision;
}

/** Bruno asked for a person about a ticket that is already being worked on: waiting for any analyst. */
function brunoWaitingForAnalyst(stage: Stage): void {
  const id = stage.start(BRUNO, 62);
  stage.employeeSays(id, 62, "O Wi-Fi do prédio B continua caindo e a equipe de operações está parada. Vocês têm alguma previsão?");
  stage.agentSays(
    id,
    61,
    "Encontrei o seu chamado INC-20402 (Wi-Fi do prédio B cai toda hora). Ele está em andamento com o Suporte N1 e o último retorno foi há 3 horas: a equipe de redes está verificando os access points do prédio B.",
    decide({
      intent: "check_ticket",
      understanding: "Quer saber se há previsão para o problema de Wi-Fi do prédio B.",
      action: "Consultou o chamado INC-20402 e resumiu o último retorno.",
      rationale: "O chamado é do próprio Bruno e está aberto; o último retorno do analista responde à pergunta sobre o andamento.",
      score: 0.9,
      steps: [
        { tool: "list_my_tickets", summary: "1 chamado aberto encontrado" },
        { tool: "get_ticket", subject: "INC-20402", summary: "INC-20402 · Em andamento · Prioridade alta" },
      ],
    }),
    [
      stage.ticketCard({
        id: "INC-20402",
        title: "Wi-Fi do prédio B cai toda hora",
        category: "rede_vpn",
        subcategory: "Wi-Fi",
        priority: "alta",
        status: "em_andamento",
        createdMinutesAgo: 24 * 60,
        respondedMinutesAgo: 180,
        dueInMinutes: 120,
        clockRunning: true,
      }),
      { type: "quick_replies", options: ["Quero falar com um analista", "Atualizar o chamado"] },
    ],
  );
  stage.at(61, () => stage.store.linkTicket(id, "INC-20402", "consulted"));

  stage.employeeSays(id, 55, "Isso não resolve, a operação está parada. Preciso falar com um analista agora.");
  stage.agentSays(
    id,
    54,
    "Entendi, estou chamando um analista do Suporte N1 com o resumo do caso para você não precisar repetir nada. Assim que alguém assumir, a conversa continua aqui.",
    decide({
      intent: "handoff",
      understanding: "Pediu atendimento humano porque a operação está parada.",
      action: "Transferiu a conversa para o Suporte N1 com um resumo do caso.",
      rationale: "O funcionário pediu um analista; o pedido é atendido sem questionar.",
      score: 0.96,
      steps: [{ tool: "transfer_to_analyst", summary: "Transferido para o Suporte N1" }],
      handoff: { reason: "employee_request", group: "N1", ticketId: "INC-20402", respondBy: stage.iso(120) },
    }),
  );
  stage.at(54, () => {
    stage.store.handoff(id, {
      reason: "employee_request",
      group: "N1",
      summary:
        "Wi-Fi do prédio B cai várias vezes por hora e a equipe de operações está parada. O chamado INC-20402 (alta) está em andamento com o N1, com a última resposta há 3 horas. O funcionário pediu um analista.",
      respondBy: stage.iso(120),
    });
    stage.store.linkTicket(id, "INC-20402", "transferred");
  });
  stage.employeeSays(id, 41, "Alguém consegue me responder? A equipe inteira está sem rede.");
}

/** Carla described something the agent could not place: it handed over because it was unsure. */
function carlaHandedOverUnsure(stage: Stage): void {
  const id = stage.start(CARLA, 33);
  stage.employeeSays(id, 33, "Meu SAP bloqueou de novo, mas agora aparece uma mensagem de licença expirada que eu nunca tinha visto.");
  stage.agentSays(
    id,
    32,
    "Vi que o seu chamado INC-20150, de senha do SAP bloqueada, foi resolvido há 4 dias. Esse erro de licença é diferente e eu não tenho segurança de que seja o mesmo problema, então prefiro passar para um analista do Suporte N2 olhar com o histórico à mão. Você não precisa repetir nada.",
    decide({
      intent: "handoff",
      understanding: "O SAP bloqueou outra vez, agora com um erro de licença expirada.",
      action: "Transferiu a conversa para o Suporte N2 por não ter segurança sobre a causa.",
      rationale:
        "O chamado anterior (INC-20150) tratou de senha bloqueada, não de licença. A central de ajuda não traz orientação para esse erro, então responder seria chutar.",
      score: 0.45,
      steps: [
        { tool: "list_my_tickets", summary: "1 chamado encontrado: INC-20150, resolvido há 4 dias" },
        { tool: "search_help_center", summary: "Melhor artigo: KB-004 · 20% de relação" },
        { tool: "transfer_to_analyst", summary: "Transferido para o Suporte N2" },
      ],
      evidence: { knowledgeTopScore: 0.2 },
      guardrails: [{ id: "low_confidence_handoff", detail: "Confiança abaixo do mínimo: a conversa foi passada a um analista." }],
      handoff: { reason: "low_confidence", group: "N2", ticketId: null, respondBy: stage.iso(26 * 60), auto: true },
    }),
    [
      stage.ticketCard({
        id: "INC-20150",
        title: "Senha do SAP bloqueada",
        category: "acesso",
        subcategory: "SAP",
        priority: "media",
        status: "resolvido",
        createdMinutesAgo: 5 * 24 * 60,
        respondedMinutesAgo: 4 * 24 * 60,
        dueInMinutes: -3 * 24 * 60,
        clockRunning: false,
      }),
    ],
  );
  stage.at(32, () => {
    stage.store.linkTicket(id, "INC-20150", "consulted");
    stage.store.handoff(id, {
      reason: "low_confidence",
      group: "N2",
      summary:
        "O SAP bloqueou de novo, agora com erro de licença expirada: diferente do bloqueio de senha do INC-20150, resolvido há 4 dias. A central de ajuda não cobre esse erro e o agent transferiu por falta de segurança.",
      respondBy: stage.iso(26 * 60),
    });
  });
  stage.employeeSays(id, 30, "Ok, obrigada. Fico no aguardo.");
}

/** Fábio is already being attended by Rafael, who has answered twice. */
function fabioWithAnalyst(stage: Stage): void {
  const id = stage.start(FABIO, 135);
  stage.employeeSays(id, 135, "O teclado que trocaram ontem já está falhando de novo. As teclas repetem letras.");
  stage.agentSays(
    id,
    134,
    "Encontrei o seu chamado INC-20480 (Teclado com teclas falhando), resolvido ontem. Como foi resolvido há menos de 7 dias, posso reabri-lo com a nova falha. Quer que eu reabra?",
    decide({
      intent: "check_ticket",
      understanding: "O teclado de reposição voltou a falhar.",
      action: "Encontrou o chamado resolvido ontem e ofereceu reabri-lo.",
      rationale: "O chamado INC-20480 foi resolvido há 1 dia, dentro da janela de 7 dias para reabertura.",
      score: 0.88,
      steps: [
        { tool: "list_my_tickets", summary: "1 chamado encontrado: INC-20480, resolvido há 1 dia" },
        { tool: "get_ticket", subject: "INC-20480", summary: "INC-20480 · Resolvido · pode ser reaberto" },
      ],
    }),
    [
      stage.ticketCard({
        id: "INC-20480",
        title: "Teclado com teclas falhando",
        category: "hardware",
        subcategory: "Periféricos",
        priority: "baixa",
        status: "resolvido",
        createdMinutesAgo: 3 * 24 * 60,
        respondedMinutesAgo: 24 * 60,
        dueInMinutes: -24 * 60,
        clockRunning: false,
      }),
      { type: "quick_replies", options: ["Sim, reabrir", "Prefiro falar com um analista"] },
    ],
  );
  stage.at(134, () => stage.store.linkTicket(id, "INC-20480", "consulted"));

  stage.employeeSays(id, 131, "Prefiro falar com um analista, é a segunda vez que o teclado dá problema.");
  stage.agentSays(
    id,
    130,
    "Certo, estou chamando um analista do Suporte N1 e já passo o histórico do INC-20480 para você não precisar repetir.",
    decide({
      intent: "handoff",
      understanding: "Prefere atendimento humano porque é a segunda falha do teclado.",
      action: "Transferiu a conversa para o Suporte N1.",
      rationale: "O funcionário pediu um analista.",
      score: 0.95,
      steps: [{ tool: "transfer_to_analyst", summary: "Transferido para o Suporte N1" }],
      handoff: { reason: "employee_request", group: "N1", ticketId: null },
    }),
  );
  stage.at(130, () =>
    stage.store.handoff(id, {
      reason: "employee_request",
      group: "N1",
      summary:
        "O teclado de reposição do INC-20480 (resolvido ontem) voltou a repetir letras. O funcionário prefere atendimento humano por ser a segunda falha.",
    }),
  );
  stage.at(95, () => stage.store.assume(id, RAFAEL));
  stage.analystSays(
    id,
    94,
    RAFAEL,
    "Oi, Fábio! Aqui é o Rafael, do suporte. Vou separar outro teclado e deixar identificado com o seu nome na recepção da TI. Consegue passar aí hoje?",
  );
  stage.employeeSays(id, 88, "Consigo sim, passo depois das 15h.");
  stage.analystSays(id, 86, RAFAEL, "Combinado, deixo tudo pronto. Aviso por aqui se algo mudar.");
}

/** Diego asked about a request and the agent answered: nothing for a person to do. */
function diegoWithAgent(stage: Stage): void {
  const id = stage.start(DIEGO, 190);
  stage.employeeSays(id, 190, "Qual é o status do pedido da licença do Adobe?");
  stage.agentSays(
    id,
    189,
    "O seu pedido REQ-10430 (Licença do Adobe Creative Cloud) está aberto desde anteontem e aguarda a aprovação do seu gestor. Para software fora da lista homologada, o prazo médio é de 5 dias úteis.",
    decide({
      intent: "check_ticket",
      understanding: "Quer saber o andamento do pedido de licença do Adobe.",
      action: "Consultou o REQ-10430 e informou a etapa e o prazo médio.",
      rationale: "O pedido é do próprio Diego; o prazo vem da central de ajuda (KB-007).",
      score: 0.93,
      steps: [
        { tool: "list_my_tickets", summary: "1 chamado aberto encontrado" },
        { tool: "get_ticket", subject: "REQ-10430", summary: "REQ-10430 · Aberto · Prioridade baixa" },
      ],
    }),
    [
      stage.ticketCard({
        id: "REQ-10430",
        title: "Licença do Adobe Creative Cloud",
        category: "software",
        subcategory: "Licença",
        priority: "baixa",
        status: "aberto",
        createdMinutesAgo: 2 * 24 * 60,
        respondedMinutesAgo: 2 * 24 * 60,
        dueInMinutes: 3 * 24 * 60,
        clockRunning: true,
      }),
    ],
  );
  stage.at(189, () => stage.store.linkTicket(id, "REQ-10430", "consulted"));
  stage.employeeSays(id, 186, "Beleza, obrigado!");
  stage.agentSays(
    id,
    185,
    "Por nada! Se precisar de mais alguma coisa de TI, é só chamar.",
    decide({
      intent: "small_talk",
      understanding: "Agradeceu pela resposta.",
      action: "Respondeu o agradecimento e deixou o canal aberto.",
      rationale: "Mensagem social, sem pedido novo.",
      score: 0.97,
    }),
  );
}

/** Elisa had a ticket opened by the agent twenty minutes ago and is still in the conversation. */
function elisaTicketOpened(stage: Stage): void {
  const id = stage.start(ELISA, 24);
  stage.employeeSays(id, 24, "A impressora do 3º andar não imprime desde cedo e os trabalhos ficam presos na fila. Afeta o andar inteiro.");
  stage.agentSays(
    id,
    23,
    "Isso costuma ser a fila de impressão travada. Reinicie o serviço de impressão pelo portal de softwares (artigo KB-010). Se continuar sem imprimir, eu abro um chamado para você.",
    decide({
      intent: "answer_question",
      understanding: "A impressora do 3º andar não imprime e a fila fica travada.",
      action: "Passou o passo a passo da central de ajuda antes de abrir um chamado.",
      rationale: "O artigo KB-010 trata de trabalhos presos na fila de impressão; vale tentar antes de abrir um chamado.",
      score: 0.82,
      steps: [{ tool: "search_help_center", summary: "Melhor artigo: KB-010 · 74% de relação" }],
      evidence: { knowledgeTopScore: 0.74 },
    }),
    [{ type: "quick_replies", options: ["Já tentei, abra um chamado"] }],
  );
  stage.employeeSays(id, 21, "Já tentei isso, abra um chamado por favor.");
  stage.agentSays(
    id,
    20,
    "Chamado INC-20519 aberto: Impressora do 3º andar não imprime. A prioridade é média, porque afeta a equipe sem parar a operação, e o primeiro retorno vem em até 3 dias úteis.",
    decide({
      intent: "open_ticket",
      understanding: "Quer abrir um chamado para a impressora do 3º andar.",
      action: "Abriu o chamado INC-20519 depois da confirmação do funcionário.",
      rationale: "A impressora afeta a equipe, mas há outras formas de imprimir: impacto médio e urgência média dão prioridade média.",
      score: 0.9,
      steps: [
        { tool: "classify_priority", summary: "Prioridade média (impacto: equipe · urgência: média)" },
        { tool: "check_duplicates", summary: "Nenhum chamado parecido aberto" },
        { tool: "create_ticket", subject: "INC-20519", summary: "INC-20519 criado" },
      ],
      facts: { priorityClassified: true, draftKinds: ["ticket_create"] },
      evidence: { explicitConfirmation: true },
    }),
    [
      stage.ticketCard({
        id: "INC-20519",
        title: "Impressora do 3º andar não imprime",
        category: "hardware",
        subcategory: "Impressora",
        priority: "media",
        status: "aberto",
        createdMinutesAgo: 20,
        respondedMinutesAgo: 20,
        dueInMinutes: 3 * 24 * 60,
        clockRunning: true,
      }),
    ],
  );
  stage.at(20, () => stage.store.linkTicket(id, "INC-20519", "created"));
}

/** Gabriela's question was answered from the help center and the agent closed the conversation. */
function gabrielaClosedByAgent(stage: Stage): void {
  const id = stage.start(GABRIELA, 300);
  stage.employeeSays(id, 300, "Esqueci a senha da rede, como eu redefino?");
  stage.agentSays(
    id,
    299,
    "Abra o portal de senhas na intranet, informe o e-mail corporativo e confirme o código enviado ao celular cadastrado. A senha expira a cada 90 dias e, depois de 5 tentativas erradas, a conta fica bloqueada por 15 minutos. (Fonte: KB-003)",
    decide({
      intent: "answer_question",
      understanding: "Quer redefinir a senha da rede.",
      action: "Passou o procedimento do artigo KB-003.",
      rationale: "O artigo KB-003 descreve exatamente a redefinição da senha da rede.",
      score: 0.92,
      steps: [{ tool: "search_help_center", summary: "Melhor artigo: KB-003 · 88% de relação" }],
      evidence: { knowledgeTopScore: 0.88 },
    }),
  );
  stage.employeeSays(id, 296, "Consegui, obrigada!");
  stage.agentSays(
    id,
    295,
    "Que bom! Vou encerrar por aqui. Se precisar de algo, é só voltar.",
    decide({
      intent: "small_talk",
      understanding: "Confirmou que resolveu sozinha.",
      action: "Encerrou a conversa.",
      rationale: "O problema foi resolvido e não há pedido pendente.",
      score: 0.97,
    }),
  );
  stage.at(295, () => stage.store.close(id, "agent"));
}

/**
 * Fills an empty database with six conversations: two waiting for an analyst, one with Rafael,
 * two with the agent and one already closed. Returns false, touching nothing, when there are
 * conversations already, so restarting the app never duplicates or overwrites real use.
 */
export function seedDemoConversations(db: Db, options: { now: Date; messageLimit: number }): boolean {
  const existing = db.prepare("SELECT COUNT(*) FROM conversations").pluck().get() as number;
  if (existing > 0) return false;

  const stage = new Stage(db, options.now, options.messageLimit);
  db.transaction(() => {
    gabrielaClosedByAgent(stage);
    diegoWithAgent(stage);
    fabioWithAnalyst(stage);
    carlaHandedOverUnsure(stage);
    elisaTicketOpened(stage);
    brunoWaitingForAnalyst(stage);
  })();
  return true;
}
