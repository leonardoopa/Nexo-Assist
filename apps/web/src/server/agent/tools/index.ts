import { REPLY_TOOL } from "../reply-schema";
import { draftReopenTicket, draftTicket, draftTicketUpdate } from "./drafts";
import { transferToAnalyst } from "./handoff";
import { searchHelpCenter } from "./knowledge";
import { classifyPriorityTool } from "./priority";
import { replyToEmployee } from "./reply";
import { getTicket, listMyTickets } from "./tickets";

/** The agent's whole toolbox. Reading, drafting and handing over: nothing here creates or changes a ticket on its own. */
export function buildTools() {
  return {
    list_my_tickets: listMyTickets,
    get_ticket: getTicket,
    search_help_center: searchHelpCenter,
    classify_priority: classifyPriorityTool,
    draft_ticket: draftTicket,
    draft_ticket_update: draftTicketUpdate,
    draft_reopen_ticket: draftReopenTicket,
    transfer_to_analyst: transferToAnalyst,
    [REPLY_TOOL]: replyToEmployee,
  };
}
