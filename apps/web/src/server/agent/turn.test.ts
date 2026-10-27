import { describe, expect, it } from "vitest";

import type { TurnEvent } from "@/server/chat/events";
import { ConversationStore } from "@/server/conversations/store";
import { openDatabase } from "@/server/db/open";
import { DraftStore } from "@/server/drafts/store";
import { ServiceDeskUnavailableError } from "@/server/servicedesk/errors";
import { FakeServiceDesk } from "@/test/fake-service-desk";
import { ANA, CARLA, NOW } from "@/test/fixtures";
import { call, replyCall, scriptedModel, type ScriptedStep } from "@/test/scripted-model";

import { DecisionStore } from "./decision-store";
import { createAgentRuntime } from "./runtime";
import { runTurn, toModelMessages, type TurnRequest } from "./turn";

interface Options {
  messageLimit?: number;
  serviceDesk?: FakeServiceDesk;
  employee?: typeof ANA | typeof CARLA;
}

function setup(steps: ScriptedStep[], options: Options = {}) {
  const employee = options.employee ?? ANA;
  const serviceDesk = options.serviceDesk ?? new FakeServiceDesk();
  const db = openDatabase(":memory:");
  let counter = 0;
  const newId = () => `id-${++counter}`;
  const deps = {
    serviceDesk,
    conversations: new ConversationStore(db, { messageLimit: options.messageLimit ?? 30, now: () => NOW, newId }),
    drafts: new DraftStore(db, () => NOW),
    decisions: new DecisionStore(db, () => NOW),
    now: () => NOW,
    newId,
  };
  const model = scriptedModel(steps);
  const runtime = createAgentRuntime({ model: model as never, modelName: "scripted/model", deps, env: {} });
  const conversation = deps.conversations.start({ email: employee.email, name: employee.name, department: employee.department });

  async function turn(request: TurnRequest, as: string = employee.email): Promise<TurnEvent[]> {
    const events: TurnEvent[] = [];
    for await (const event of runTurn(runtime, { employeeEmail: as, conversationId: conversation.id, request })) events.push(event);
    return events;
  }
  const say = (content: string) => turn({ kind: "message", content });
  const current = () => deps.conversations.get(conversation.id)!;
  return { deps, model, serviceDesk, conversation, turn, say, current };
}

type StepEnd = Extract<TurnEvent, { type: "step_end" }>;
const stepLabels = (events: TurnEvent[]) => events.filter((event): event is StepEnd => event.type === "step_end").map((event) => event.label);
const assistantOf = (events: TurnEvent[]) => {
  const found = events.find((event) => event.type === "assistant_message");
  if (!found || found.type !== "assistant_message") throw new Error("no assistant message in the turn");
  return found.message;
};
const errorOf = (events: TurnEvent[]) => events.find((event) => event.type === "error");

const askAffected: ScriptedStep[] = [
  [call("search_help_center", { query: "VPN erro 809 notebook" }), call("list_my_tickets", { status: "open", query: "vpn" })],
  [
    replyCall("O artigo do erro 809 vale só para Windows 10, e o seu é Windows 11. Vou abrir um chamado: quem está sendo afetado?", {
      intent: "ask_missing_info",
      confidence: 0.85,
      ui: { quickReplies: ["Só eu", "Minha equipe", "Toda a empresa", "Não sei"] },
    }),
  ],
];

const draftVpn: ScriptedStep[] = [
  [call("classify_priority", { type: "INC", affected: "me", blocking: true, commitmentToday: true })],
  [
    call("draft_ticket", {
      title: "VPN não conecta no notebook, erro 809",
      description: "Desde ontem o notebook (Windows 11) não conecta na VPN e mostra o erro 809. Precisa da VPN para a reunião das 14h.",
      type: "INC",
      category: "rede_vpn",
      affected: "me",
    }),
  ],
  [replyCall("Coloquei prioridade alta por causa da reunião das 14h. Confira o rascunho antes de eu criar.", { intent: "open_ticket", confidence: 0.9 })],
];

const WINDOWS_11_QUESTION = "Meu notebook não conecta na VPN desde ontem. Aparece o erro 809.";
const ONLY_ME = "Só eu. Tenho reunião com um cliente às 14h e preciso da VPN funcionando.";

describe("answering from the help center", () => {
  const steps: ScriptedStep[] = [
    [call("search_help_center", { query: "VPN erro 809 Windows" }), call("list_my_tickets", { status: "open", query: "vpn" })],
    [
      replyCall("O erro 809 se resolve reinstalando o cliente de VPN, mas isso vale só para Windows 10 e o seu notebook é Windows 11.", {
        intent: "answer_question",
        confidence: 0.8,
        understanding: "Quer resolver o erro 809 da VPN.",
        rationale: "O artigo 'VPN com erro 809' não se aplica ao Windows 11.",
        rules: ["privacy"],
      }),
    ],
  ];

  it("shows each step, streams the reply and stores the decision that explains it", async () => {
    const { say, model, deps, conversation } = setup(steps);

    const events = await say(WINDOWS_11_QUESTION);

    expect(model.requests[0]?.toolChoice).toEqual({ type: "required" });
    expect(stepLabels(events).sort()).toEqual(["buscou na central de ajuda", "consultou seus chamados"]);
    expect(events.filter((event) => event.type === "step_start")).toHaveLength(2);

    const streamed = events.flatMap((event) => (event.type === "text" ? [event.delta] : []));
    expect(streamed.length).toBeGreaterThan(1);
    const message = assistantOf(events);
    expect(streamed.join("")).toBe(message.content);

    expect(message.decision).toMatchObject({
      intent: "answer_question",
      understanding: "Quer resolver o erro 809 da VPN.",
      confidence: { level: "alta" },
      usage: { model: "scripted/model", inputTokens: 200, outputTokens: 40, modelSteps: 2 },
    });
    expect(message.decision?.steps).toHaveLength(2);
    expect(message.decision?.confidence.factors.some((factor) => factor.effect === "raises" && /muito relacionado/.test(factor.label))).toBe(true);
    expect(message.decision?.rules).toContainEqual(expect.objectContaining({ id: "privacy", verified: true }));

    expect(deps.conversations.messages(conversation.id).map((entry) => entry.role)).toEqual(["user", "assistant"]);
    expect(deps.decisions.get(message.id)).toEqual(message.decision);
  });

  it("gives the model the equipment of the employee and the date", async () => {
    const { say, model } = setup(steps);
    await say(WINDOWS_11_QUESTION);
    const prompt = JSON.stringify(model.requests[0]?.prompt);
    expect(prompt).toContain("Windows 11");
    expect(prompt).toContain("Ana Souza");
    expect(prompt).toContain("outubro de 2026");
  });
});

describe("opening a ticket", () => {
  it("asks who is affected, drafts, and creates only after the employee confirms", async () => {
    const { say, serviceDesk, deps, model, conversation } = setup([...askAffected, ...draftVpn]);

    const first = await say(WINDOWS_11_QUESTION);
    expect(assistantOf(first).parts).toEqual([{ type: "quick_replies", options: ["Só eu", "Minha equipe", "Toda a empresa", "Não sei"] }]);

    const second = await say(ONLY_ME);
    const draftMessage = assistantOf(second);
    expect(stepLabels(second)).toEqual(["classificou a prioridade", "consultou o SLA", "verificou duplicidade", "montou o rascunho"]);
    expect(draftMessage.parts).toEqual([
      expect.objectContaining({ type: "draft", draftId: 1, status: "pending", priority: "alta", slaLabel: "4 horas úteis", category: "rede_vpn", affected: "me" }),
    ]);
    expect(draftMessage.decision?.rules.filter((rule) => rule.verified).map((rule) => rule.id)).toEqual(
      expect.arrayContaining(["priority_matrix", "sla_deadline", "required_fields", "confirm_before_acting", "privacy"]),
    );
    expect(serviceDesk.created).toEqual([]); // nothing exists before the confirmation
    expect(deps.drafts.pending(conversation.id)?.payload).toMatchObject({ priority: "alta" });

    const modelCalls = model.callCount;
    const third = await say("sim");
    expect(model.callCount).toBe(modelCalls); // confirming never asks the model
    expect(stepLabels(third)).toEqual(["criou o chamado"]);
    const created = assistantOf(third);
    expect(created.content).toMatch(/^Pronto: abri o chamado INC-20520 com prioridade alta\./);
    expect(created.parts).toEqual([expect.objectContaining({ type: "ticket_card", ticket: expect.objectContaining({ id: "INC-20520" }) })]);
    expect(created.decision).toMatchObject({ intent: "confirm_action", confidence: { score: 1, level: "alta" } });
    expect(serviceDesk.created).toEqual(["INC-20520"]);
    expect(serviceDesk.callsOf("createTicket")[0]?.args[2]).toBe("draft-1");

    expect(deps.drafts.get(1)).toMatchObject({ status: "confirmed", ticketId: "INC-20520" });
    const shownDraft = deps.conversations.getMessage(draftMessage.id)?.parts[0];
    expect(shownDraft).toMatchObject({ type: "draft", status: "confirmed", ticketId: "INC-20520" });
    expect(deps.conversations.linkedTickets(conversation.id)).toContainEqual(expect.objectContaining({ ticketId: "INC-20520", relation: "created" }));
  });

  it("confirms and cancels with the buttons, even when the session is at its message limit", async () => {
    const { say, turn, serviceDesk, deps, conversation } = setup(draftVpn, { messageLimit: 2 });
    await say(ONLY_ME);
    expect(deps.conversations.get(conversation.id)?.messageCount).toBe(2);

    const events = await turn({ kind: "confirm_draft", draftId: 1 });

    expect(assistantOf(events).content).toMatch(/abri o chamado INC-20520/);
    expect(serviceDesk.created).toEqual(["INC-20520"]);
    expect(errorOf(await turn({ kind: "confirm_draft", draftId: 1 }))).toMatchObject({ code: "draft_not_found" });
  });

  it("cancels a draft without creating anything", async () => {
    const { say, turn, serviceDesk, deps, conversation } = setup(draftVpn);
    await say(ONLY_ME);

    const events = await turn({ kind: "cancel_draft", draftId: 1 });

    expect(assistantOf(events).content).toMatch(/cancelei o rascunho D-001/);
    expect(assistantOf(events).decision?.intent).toBe("cancel_action");
    expect(serviceDesk.created).toEqual([]);
    expect(deps.drafts.pending(conversation.id)).toBeNull();
  });

  it("treats a typed 'não' as a cancellation", async () => {
    const { say, deps, conversation } = setup(draftVpn);
    await say(ONLY_ME);
    await say("não");
    expect(deps.drafts.get(1)?.status).toBe("cancelled");
    expect(deps.drafts.pending(conversation.id)).toBeNull();
  });

  it("sends 'sim, mas muda o título' to the model, which sees the pending draft, and replaces the draft", async () => {
    const edit: ScriptedStep[] = [
      [call("classify_priority", { type: "INC", affected: "me", blocking: true, commitmentToday: true })],
      [
        call("draft_ticket", {
          title: "VPN corporativa não conecta, erro 809",
          description: "Desde ontem o notebook (Windows 11) não conecta na VPN e mostra o erro 809. Precisa da VPN para a reunião das 14h.",
          type: "INC",
          category: "rede_vpn",
          affected: "me",
        }),
      ],
      [replyCall("Troquei o título. Confira o novo rascunho.", { intent: "open_ticket", confidence: 0.9 })],
    ];
    const { say, model, deps, conversation, serviceDesk } = setup([...draftVpn, ...edit]);
    const first = await say(ONLY_ME);

    const calls = model.callCount;
    const events = await say("sim, mas muda o título para VPN corporativa não conecta, erro 809");

    expect(model.callCount).toBeGreaterThan(calls);
    expect(JSON.stringify(model.requests[calls]?.prompt)).toContain("D-001");
    expect(serviceDesk.created).toEqual([]);
    expect(deps.drafts.get(1)?.status).toBe("superseded");
    expect(deps.drafts.pending(conversation.id)?.id).toBe(2);
    expect(deps.conversations.getMessage(assistantOf(first).id)?.parts[0]).toMatchObject({ type: "draft", status: "superseded" });
    expect(assistantOf(events).parts[0]).toMatchObject({ type: "draft", draftId: 2, title: "VPN corporativa não conecta, erro 809" });
  });

  it("keeps the draft when the ticket system is down and creates exactly one ticket when it is back", async () => {
    const { say, turn, serviceDesk, deps, conversation } = setup(draftVpn);
    await say(ONLY_ME);
    serviceDesk.failNext("createTicket", new ServiceDeskUnavailableError("fora do ar", "legacy_unavailable", 503));

    const down = assistantOf(await turn({ kind: "confirm_draft", draftId: 1 }));
    expect(down.content).toMatch(/instável/);
    expect(down.decision?.steps[0]).toMatchObject({ tool: "create_ticket", status: "error" });
    expect(deps.drafts.pending(conversation.id)?.id).toBe(1);
    expect(serviceDesk.created).toEqual([]);

    await turn({ kind: "confirm_draft", draftId: 1 });
    expect(serviceDesk.created).toEqual(["INC-20520"]);
    expect(serviceDesk.callsOf("createTicket").map((entry) => entry.args[2])).toEqual(["draft-1", "draft-1"]);
  });

  it("refuses to open a duplicate and offers to update the ticket that already exists", async () => {
    const { say, deps, conversation } = setup([
      [call("classify_priority", { type: "INC", affected: "me", blocking: false, commitmentToday: false })],
      [
        call("draft_ticket", {
          title: "Notebook lento e travando",
          description: "Meu notebook está muito lento depois da atualização do Windows e trava bastante.",
          type: "INC",
          category: "hardware",
          affected: "me",
        }),
      ],
      [
        replyCall("Você já tem o INC-20311 aberto sobre isso. Quer que eu acrescente essas informações a ele?", {
          intent: "update_ticket",
          confidence: 0.85,
          ui: { quickReplies: ["Sim, acrescentar", "É outro problema"] },
        }),
      ],
    ]);

    const message = assistantOf(await say("Meu notebook está muito lento depois da atualização do Windows."));

    expect(deps.drafts.pending(conversation.id)).toBeNull();
    expect(message.decision?.guardrails).toContainEqual(expect.objectContaining({ id: "duplicate_blocked" }));
    expect(message.decision?.rules).toContainEqual(expect.objectContaining({ id: "no_duplicates", verified: true }));
    expect(message.parts).toEqual([{ type: "quick_replies", options: ["Sim, acrescentar", "É outro problema"] }]);
  });

  it("does not draft without knowing who is affected, and says what is missing", async () => {
    const { say, model, deps, conversation } = setup([
      [call("classify_priority", { type: "INC", affected: "me", blocking: true, commitmentToday: false })],
      [
        call("draft_ticket", {
          title: "VPN não conecta no notebook, erro 809",
          description: "O notebook não conecta na VPN e mostra o erro 809 desde ontem.",
          type: "INC",
          category: "rede_vpn",
        }),
      ],
      [replyCall("Quem está sendo afetado por isso?", { intent: "ask_missing_info", confidence: 0.9, ui: { quickReplies: ["Só eu", "Minha equipe"] } })],
    ]);

    await say(WINDOWS_11_QUESTION);

    expect(JSON.stringify(model.requests[2]?.prompt)).toContain("missing_information");
    expect(deps.drafts.pending(conversation.id)).toBeNull();
  });

  it("will not draft before the priority is classified", async () => {
    const { say, model } = setup([
      [call("draft_ticket", { title: "Titulo qualquer", description: "Descrição longa o bastante para passar.", type: "INC", category: "outros", affected: "me" })],
      [replyCall("Preciso entender melhor antes.", { intent: "ask_missing_info", confidence: 0.8 })],
    ]);
    await say("Ajuda");
    expect(JSON.stringify(model.requests[1]?.prompt)).toContain("priority_not_classified");
  });
});

describe("tickets and privacy", () => {
  it("answers a status question about a ticket of the employee, with the deadline calculation", async () => {
    const { say } = setup([
      [call("get_ticket", { ticketId: "INC-20311" })],
      [
        replyCall("O INC-20311 está sem atualização há 6 dias, acima do prazo de 3 dias úteis. Quer que eu chame um analista?", {
          intent: "check_ticket",
          confidence: 0.92,
          ui: { showTicketCards: ["INC-20311"], quickReplies: ["Falar com um analista", "Não, obrigado"] },
        }),
      ],
    ]);

    const events = await say("Qual o status do meu chamado do notebook lento?");

    expect(stepLabels(events)).toEqual(["consultou o INC-20311", "calculou o prazo"]);
    const message = assistantOf(events);
    expect(message.parts).toEqual([
      expect.objectContaining({ type: "ticket_card", ticket: expect.objectContaining({ id: "INC-20311", overdue: true }) }),
      { type: "quick_replies", options: ["Falar com um analista", "Não, obrigado"] },
    ]);
    expect(message.decision?.steps[1]?.summary).toMatch(/Vencido/);
  });

  it("lists open tickets as a picker when the employee does not remember the number", async () => {
    const { say } = setup([
      [call("list_my_tickets", { status: "open" })],
      [replyCall("Você tem 3 chamados abertos. Sobre qual deles quer saber?", { intent: "check_ticket", ui: { showTicketPicker: true } })],
    ]);

    const message = assistantOf(await say("Qual o status do meu chamado?"));

    const picker = message.parts[0];
    expect(picker).toMatchObject({ type: "ticket_picker" });
    expect(picker?.type === "ticket_picker" ? picker.tickets.map((ticket) => ticket.id).sort() : []).toEqual(["INC-20298", "INC-20311", "REQ-10442"]);
  });

  it("does not reveal another employee's ticket: it is simply not found", async () => {
    const { say, serviceDesk } = setup([
      [call("get_ticket", { ticketId: "INC-20150" })],
      [replyCall("Não encontrei o INC-20150 entre os seus chamados. Quer ver a lista dos seus?", { intent: "check_ticket", confidence: 0.9 })],
    ]);

    const message = assistantOf(await say("Qual o status do INC-20150?"));

    expect(message.content).toMatch(/Não encontrei o INC-20150/);
    expect(message.decision?.steps[0]?.summary).toMatch(/Não encontrado/);
    expect(message.decision?.rules).toContainEqual(expect.objectContaining({ id: "privacy", verified: true }));
    expect(serviceDesk.callsOf("getTicket")[0]?.args[0]).toBe(ANA.email); // always asked as the signed-in employee
  });

  it("replaces a reply that mentions a ticket no tool returned for this employee", async () => {
    const { say, deps, conversation } = setup([
      [call("list_my_tickets", { status: "open" })],
      [replyCall("O seu chamado INC-20999 está em andamento.", { intent: "check_ticket", confidence: 0.95 })],
    ]);

    const events = await say("Como está meu chamado?");

    const message = assistantOf(events);
    expect(message.content).not.toContain("INC-20999");
    expect(message.parts).toEqual([{ type: "quick_replies", options: ["Falar com um analista"] }]);
    expect(message.decision?.guardrails).toContainEqual(expect.objectContaining({ id: "unknown_ticket_reference" }));
    expect(message.decision?.confidence.score).toBeLessThanOrEqual(0.3);
    expect(deps.conversations.get(conversation.id)?.status).toBe("agent"); // the corrected reply asks, it does not transfer
  });

  it("reports an outage of the ticket system honestly and lowers the confidence", async () => {
    const serviceDesk = new FakeServiceDesk();
    serviceDesk.failNext("listTickets", new ServiceDeskUnavailableError("fora do ar", "legacy_unavailable", 503));
    const { say } = setup(
      [
        [call("list_my_tickets", {})],
        [replyCall("O sistema de chamados está instável agora. Tente de novo em instantes.", { intent: "check_ticket", confidence: 0.9 })],
      ],
      { serviceDesk },
    );

    const message = assistantOf(await say("Quais são meus chamados?"));

    expect(message.decision?.steps[0]).toMatchObject({ tool: "list_my_tickets", status: "error" });
    expect(message.decision?.confidence.score).toBe(0.6);
    expect(message.decision?.confidence.factors.some((factor) => /falhou/.test(factor.label))).toBe(true);
  });
});

describe("handing the case to a person", () => {
  const overdueHandoff: ScriptedStep[] = [
    [call("get_ticket", { ticketId: "INC-20311" })],
    [call("transfer_to_analyst", { reason: "overdue", ticketId: "INC-20311", summary: "Ana quer falar com um analista: o INC-20311 está parado há dias." })],
    [
      replyCall("Encaminhei seu caso ao Suporte N2. Um analista fala com você em até 4 horas úteis.", {
        intent: "handoff",
        confidence: 0.9,
        ui: { showTicketCards: ["INC-20311"] },
      }),
    ],
  ];

  it("transfers an overdue ticket with the reply first, then the event, and keeps the agent silent", async () => {
    const { say, current, deps, conversation, serviceDesk, model } = setup(overdueHandoff);

    const events = await say("Está parado há 5 dias. Quero falar com um analista.");

    const message = assistantOf(events);
    expect(message.decision?.handoff).toMatchObject({ reason: "overdue", group: "N2", ticketId: "INC-20311", auto: false });
    expect(message.decision?.rules).toContainEqual(expect.objectContaining({ id: "handoff_overdue", verified: true }));
    expect(message.parts.map((part) => part.type)).toEqual(["ticket_card"]);
    expect(current()).toMatchObject({ status: "awaiting_analyst", handoff: { reason: "overdue", group: "N2" } });
    expect(current().handoff?.respondBy).not.toBeNull();
    expect(deps.conversations.messages(conversation.id).map((entry) => entry.role)).toEqual(["user", "assistant", "system"]);
    const transfer = serviceDesk.callsOf("transferTicket")[0];
    expect(transfer?.args.slice(0, 2)).toEqual([ANA.email, "INC-20311"]);
    expect(String(transfer?.args[3])).toMatch(/^handoff-/);

    const calls = model.callCount;
    const later = await say("Alguém aí?");
    expect(model.callCount).toBe(calls);
    expect(later.map((event) => event.type)).toEqual(["user_message", "conversation", "done"]);
    expect(current().analystUnread).toBe(1);
  });

  it("refuses an 'overdue' transfer for a ticket that is within its deadline", async () => {
    const { say, current, model } = setup([
      [call("get_ticket", { ticketId: "INC-20298" })],
      [call("transfer_to_analyst", { reason: "overdue", ticketId: "INC-20298", summary: "Tentativa de transferir sem estar vencido." })],
      [replyCall("Esse chamado ainda está dentro do prazo, então sigo por aqui.", { intent: "check_ticket", confidence: 0.9 })],
    ]);

    await say("O INC-20298 está atrasado?");

    expect(JSON.stringify(model.requests[2]?.prompt)).toContain("handoff_not_allowed");
    expect(current().status).toBe("agent");
  });

  it("does not accept a 'critical' transfer without a critical classification", async () => {
    const { say, current, model } = setup([
      [call("transfer_to_analyst", { reason: "critical", summary: "Tudo parado para a equipe, preciso de alguém agora." })],
      [replyCall("Vou entender melhor antes de chamar alguém.", { intent: "unclear", confidence: 0.8 })],
    ]);
    await say("Tudo parado!");
    expect(JSON.stringify(model.requests[1]?.prompt)).toContain("handoff_not_allowed");
    expect(current().status).toBe("agent");
  });

  it("hands over by itself when it is not sure, instead of guessing", async () => {
    const { say, current, deps, conversation } = setup([
      [replyCall("Talvez seja o driver de vídeo, mas não tenho certeza.", { intent: "answer_question", confidence: 0.3, rationale: "Nenhum artigo trata disso." })],
    ]);

    const message = assistantOf(await say("A tela do notebook pisca quando conecto o dock."));

    expect(message.content).toMatch(/chamei um analista do Suporte N1/);
    expect(message.decision).toMatchObject({ intent: "handoff", handoff: { reason: "low_confidence", group: "N1", auto: true } });
    expect(message.decision?.guardrails).toContainEqual(expect.objectContaining({ id: "auto_handoff" }));
    expect(current().status).toBe("awaiting_analyst");
    expect(deps.conversations.messages(conversation.id).map((entry) => entry.role)).toEqual(["user", "assistant", "system"]);
  });

  it("asks instead of handing over when a question is what is missing", async () => {
    const { say, current } = setup([[replyCall("Pode me dar mais detalhes sobre o que aparece na tela?", { intent: "ask_missing_info", confidence: 0.3 })]]);
    await say("Não funciona.");
    expect(current().status).toBe("agent");
  });
});

describe("failures", () => {
  it("keeps the employee's message when the model fails and answers it on retry", async () => {
    // Mastra retries a failed model call once (after about a second), so the failure takes two scripted errors.
    const { say, turn, deps, conversation } = setup([
      { error: new Error("Overloaded") },
      { error: new Error("Overloaded") },
      [replyCall("Posso ajudar com isso.", { intent: "small_talk", confidence: 0.9 })],
    ]);

    const failed = await say("Oi");
    expect(errorOf(failed)).toMatchObject({ code: "llm_rate_limited", retryable: true });
    expect(deps.conversations.messages(conversation.id).map((entry) => entry.role)).toEqual(["user"]);

    const retried = await turn({ kind: "retry" });
    expect(assistantOf(retried).content).toBe("Posso ajudar com isso.");
    expect(deps.conversations.messages(conversation.id).map((entry) => entry.role)).toEqual(["user", "assistant"]);
    expect(errorOf(await turn({ kind: "retry" }))).toMatchObject({ code: "nothing_to_retry" });
  });

  it("keeps a plain-text answer, with reduced confidence, when the model skips the structured reply", async () => {
    const { say } = setup([{ text: "Olá! Como posso ajudar?" }]);

    const message = assistantOf(await say("Oi"));

    expect(message.content).toBe("Olá! Como posso ajudar?");
    expect(message.decision?.guardrails).toContainEqual(expect.objectContaining({ id: "unstructured_reply" }));
    expect(message.decision?.confidence.score).toBe(0.4);
  });

  it("refuses to run, without keeping the message, when the model is not configured", async () => {
    const { deps, conversation, turn } = setup([]);
    const unconfigured = createAgentRuntime({ model: "anthropic/claude-haiku-5-5" as never, modelName: "anthropic/claude-haiku-5-5", deps, env: {} });

    const events: TurnEvent[] = [];
    for await (const event of runTurn(unconfigured, { employeeEmail: ANA.email, conversationId: conversation.id, request: { kind: "message", content: "Oi" } })) {
      events.push(event);
    }

    expect(errorOf(events)).toMatchObject({ code: "llm_not_configured", retryable: false });
    expect(errorOf(events)).toMatchObject({ message: expect.stringContaining("ANTHROPIC_API_KEY") });
    expect(deps.conversations.messages(conversation.id)).toEqual([]);
    void turn;
  });

  it("stops the employee at the message limit", async () => {
    const { say } = setup([[replyCall("Oi!", { intent: "small_talk" })]], { messageLimit: 2 });
    await say("Oi");
    expect(errorOf(await say("E aí?"))).toMatchObject({ code: "limit_reached" });
  });

  it("does not run for a conversation that belongs to someone else or is closed", async () => {
    const { turn, deps, conversation } = setup([]);
    expect(errorOf(await turn({ kind: "message", content: "Oi" }, CARLA.email))).toMatchObject({ code: "conversation_not_found" });
    deps.conversations.close(conversation.id, "agent");
    expect(errorOf(await turn({ kind: "message", content: "Oi" }))).toMatchObject({ code: "conversation_closed" });
  });
});

describe("toModelMessages", () => {
  it("skips events, joins consecutive messages and credits the analyst", () => {
    const at = NOW.toISOString();
    const base = { conversationId: "c", createdAt: at, parts: [], author: null };
    const messages = toModelMessages([
      { ...base, id: "1", seq: 1, role: "user", content: "Oi" },
      { ...base, id: "2", seq: 2, role: "user", content: "Tem alguém aí?" },
      { ...base, id: "3", seq: 3, role: "assistant", content: "Olá!" },
      { ...base, id: "4", seq: 4, role: "system", content: "Transferida para Suporte N1" },
      { ...base, id: "5", seq: 5, role: "analyst", content: "Já resolvi.", author: { email: "rafael.lima@nexo.com.br", name: "Rafael Lima" } },
    ]);
    expect(messages).toEqual([
      { role: "user", content: "Oi\n\nTem alguém aí?" },
      { role: "assistant", content: "Olá!\n\nO analista Rafael Lima disse: Já resolvi." },
    ]);
  });
});
