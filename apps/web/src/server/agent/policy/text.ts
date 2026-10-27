const STOPWORDS = new Set(
  (
    "a o as os um uma uns umas de da do das dos e em no na nos nas para por com sem que se ao aos " +
    "meu minha meus minhas seu sua seus suas esse essa isso este esta isto foi estou ser tem tenho " +
    "nao mais muito ja ainda quando como qual quais pra pro desde"
  ).split(" "),
);

export function stripAccents(text: string): string {
  return text.normalize("NFKD").replace(/\p{M}/gu, "");
}

/** Drops the common Portuguese plural endings so "senhas" and "senha" meet. */
function stem(token: string): string {
  if (token.length > 4 && token.endsWith("oes")) return `${token.slice(0, -3)}ao`;
  if (token.length > 4 && token.endsWith("ns")) return `${token.slice(0, -2)}m`;
  if (token.length > 3 && token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
  return token;
}

/** Lowercase, accent-free, stop-word-free, plural-tolerant words of a text. */
export function wordSet(text: string): Set<string> {
  const plain = stripAccents(text.toLowerCase());
  const words = (plain.match(/[a-z0-9]+/g) ?? []).filter((word) => word.length > 1 && !STOPWORDS.has(word));
  return new Set(words.map(stem));
}
