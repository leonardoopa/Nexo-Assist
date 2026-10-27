import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { runStep } from "../steps";
import { toolFailure, truncate, turnOf } from "./shared";

export const searchHelpCenter = createTool({
  id: "search_help_center",
  description:
    "Search the help center articles. Use it FIRST for any question or problem: if an article solves it (and applies to the employee's equipment) answer from it and do not open a ticket. " +
    "Each article has a relevance from 0 to 1; below 0.35 it probably does not apply. Quote only what the article says.",
  inputSchema: z.object({
    query: z.string().min(2).max(200).describe("The problem in the employee's words, with error codes and product names."),
  }),
  execute: async ({ query }, context) => {
    const ctx = turnOf(context);
    try {
      const found = await runStep(
        ctx,
        { tool: "search_help_center", input: { query } },
        () => ctx.deps.serviceDesk.searchArticles(query, 3),
        (result) => (result.items.length ? `${result.items.length} artigo(s), melhor: ${result.items[0]?.title}` : "Nenhum artigo relacionado"),
      );
      ctx.seen.knowledgeTopScore = found.items[0]?.score ?? 0;
      return {
        ok: true as const,
        articles: found.items.map((article) => ({
          id: article.id,
          title: article.title,
          relevance: article.score,
          content: truncate(article.body, 600),
        })),
        ...(found.items.length === 0 ? { note: "Nenhum artigo relevante." } : {}),
      };
    } catch (error) {
      return toolFailure(ctx, error);
    }
  },
});
