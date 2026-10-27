import { describe, expect, it } from "vitest";

import { ANA_TICKETS } from "@/test/fixtures";

import { findDuplicateCandidates } from "./duplicates";

const open = ANA_TICKETS.filter((ticket) => ticket.status !== "resolvido");

describe("findDuplicateCandidates", () => {
  it("blocks a new report about the same problem in the same category", () => {
    const found = findDuplicateCandidates(
      {
        title: "Notebook travando e lento",
        description: "Meu notebook está muito lento depois da última atualização do Windows.",
        category: "hardware",
      },
      open,
    );
    expect(found[0]).toMatchObject({ ticketId: "INC-20311", blocking: true, sameCategory: true });
  });

  it("recognizes a second request for the same equipment", () => {
    const found = findDuplicateCandidates(
      { title: "Monitor extra para home office", description: "Quero um monitor extra para trabalhar em casa no home office.", category: "hardware" },
      open,
    );
    expect(found[0]).toMatchObject({ ticketId: "REQ-10442", blocking: true });
  });

  it("does not flag an unrelated problem", () => {
    const found = findDuplicateCandidates(
      {
        title: "VPN não conecta no notebook, erro 809",
        description: "Desde ontem o notebook não conecta na VPN e mostra o erro 809.",
        category: "rede_vpn",
      },
      open,
    );
    expect(found).toEqual([]);
  });

  it("only suspects, without blocking, when the category differs", () => {
    const found = findDuplicateCandidates(
      { title: "Notebook lento", description: "O notebook está lento e travando o dia todo.", category: "software" },
      open,
    );
    expect(found[0]).toMatchObject({ ticketId: "INC-20311", sameCategory: false, blocking: false });
  });

  it("ignores a single shared word", () => {
    const found = findDuplicateCandidates(
      { title: "Notebook com tela quebrada", description: "A tela do meu equipamento quebrou ao cair no chão.", category: "hardware" },
      open,
    );
    expect(found).toEqual([]);
  });
});
