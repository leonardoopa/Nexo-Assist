import { describe, expect, it } from "vitest";

import { ticketIdsIn, unknownTicketIds } from "./reply-guard";

describe("reply guard", () => {
  it("finds ticket numbers case-insensitively and once", () => {
    expect(ticketIdsIn("Veja o inc-20311 e o REQ-10442. O INC-20311 está vencido.")).toEqual(["INC-20311", "REQ-10442"]);
    expect(ticketIdsIn("Nenhum chamado aqui. INC-1 não conta.")).toEqual([]);
  });

  it("flags numbers the agent was never given", () => {
    const allowed = new Set(["INC-20311"]);
    expect(unknownTicketIds("O INC-20311 está vencido; já o INC-20150 foi resolvido.", allowed)).toEqual(["INC-20150"]);
    expect(unknownTicketIds("Só o INC-20311.", allowed)).toEqual([]);
  });
});
