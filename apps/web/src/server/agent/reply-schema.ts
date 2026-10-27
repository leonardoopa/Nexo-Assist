import { z } from "zod";

import { intentSchema, ruleIdSchema } from "./decision";

export const REPLY_TOOL = "reply_to_employee";

/**
 * The only way the agent speaks. Every turn ends with this call, so each answer carries its own
 * explanation (what was understood, what was done, how sure, why) in a validated shape.
 * `message` comes first on purpose: it is streamed to the screen while the rest is still being written.
 */
export const replySchema = z.object({
  message: z.string().min(1).max(1500).describe("What the employee reads, in Brazilian Portuguese, 1 to 4 short sentences."),
  decision: z.object({
    intent: intentSchema.describe("The main thing this turn was about."),
    understanding: z.string().min(3).max(300).describe("What the employee wants, in one sentence."),
    action: z.string().min(3).max(240).describe("What you did in this turn, in one sentence."),
    confidence: z.number().min(0).max(1).describe("How sure you are that this action is right, from 0 to 1."),
    rationale: z.string().min(3).max(600).describe("Why, citing the sources used (article title, ticket number, rule)."),
    rules: z.array(ruleIdSchema).max(8).describe("Service desk rules that shaped this answer."),
  }),
  ui: z
    .object({
      quickReplies: z.array(z.string().min(1).max(40)).max(4).optional().describe("Short answers the employee can tap, e.g. who is affected."),
      showTicketCards: z.array(z.string()).max(3).optional().describe("Ids of tickets fetched in this turn to show as cards."),
      showTicketPicker: z.boolean().optional().describe("Show the tickets listed in this turn as a list to choose from."),
    })
    .optional(),
});

export type ReplyInput = z.infer<typeof replySchema>;
