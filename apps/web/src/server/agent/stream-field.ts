const ESCAPES: Record<string, string> = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };

/**
 * Reads one top-level string field out of a JSON object that arrives in pieces (the arguments of
 * a tool call being streamed) and returns the new decoded text each time a piece is pushed, so
 * the reply can appear on screen while the model is still writing the rest of the call.
 */
export function createStringFieldExtractor(field: string) {
  const opening = new RegExp(`"${field}"\\s*:\\s*"`);
  let buffer = "";
  let cursor = -1; // index in `buffer` where undecoded value text starts; -1 until the field is found
  let finished = false;

  return {
    get done() {
      return finished;
    },
    push(piece: string): string {
      if (finished) return "";
      buffer += piece;
      if (cursor < 0) {
        const match = opening.exec(buffer);
        if (!match) return "";
        cursor = match.index + match[0].length;
      }

      let out = "";
      while (cursor < buffer.length) {
        const char = buffer.charAt(cursor);
        if (char === '"') {
          finished = true;
          cursor += 1;
          break;
        }
        if (char !== "\\") {
          out += char;
          cursor += 1;
          continue;
        }
        const next = buffer.charAt(cursor + 1);
        if (next === "") break; // the escape is cut in half: wait for the next piece
        if (next === "u") {
          const hex = buffer.slice(cursor + 2, cursor + 6);
          if (hex.length < 4) break;
          out += String.fromCharCode(Number.parseInt(hex, 16));
          cursor += 6;
        } else {
          out += ESCAPES[next] ?? next;
          cursor += 2;
        }
      }
      return out;
    },
  };
}
