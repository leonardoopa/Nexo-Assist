import { createTool } from "@mastra/core/tools";

import { REPLY_TOOL, replySchema } from "../reply-schema";
import { turnOf } from "./shared";

export const replyToEmployee = createTool({
  id: REPLY_TOOL,
  description:
    "The ONLY way to speak to the employee. Call it exactly once, as the last action of every turn, after the other tools. " +
    "It carries the message and an honest account of the decision (what you understood, what you did, how sure you are, and why).",
  inputSchema: replySchema,
  execute: async (reply, context) => {
    turnOf(context).reply = reply;
    return { ok: true as const };
  },
});
