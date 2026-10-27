import { describe, expect, it } from "vitest";

import { classifyConfirmation } from "./confirmation";

describe("classifyConfirmation", () => {
  it.each(["sim", "Sim!", "SIM.", "ok", "pode abrir", "Pode criar, por favor", "sim, pode atualizar", "confirmo", "isso mesmo", "pode ser", "manda ver", "tudo certo", "está certo", "beleza"])(
    "reads %j as a yes",
    (text) => expect(classifyConfirmation(text)).toBe("confirm"),
  );

  it.each(["não", "Nao.", "cancelar", "cancela isso", "deixa pra lá", "não quero mais", "não, obrigado", "esquece", "melhor não"])(
    "reads %j as a no",
    (text) => expect(classifyConfirmation(text)).toBe("cancel"),
  );

  it.each([
    "sim, mas muda o título",
    "não sei",
    "pode ser a prioridade alta?",
    "quero mudar a descrição",
    "a impressora também",
    "",
    "   ",
    "sim sim sim sim sim sim sim",
    "ok, e o INC-20311?",
  ])("leaves %j to the model", (text) => expect(classifyConfirmation(text)).toBe("other"));
});
