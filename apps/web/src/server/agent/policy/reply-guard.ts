const TICKET_ID = /\b(?:INC|REQ)-\d{3,6}\b/gi;

export function ticketIdsIn(text: string): string[] {
  return [...new Set((text.match(TICKET_ID) ?? []).map((id) => id.toUpperCase()))];
}

/**
 * Ticket numbers in a reply that the agent has no right to mention: not returned by a tool for
 * this employee, and not written by the employee themselves. A made-up or foreign number never
 * reaches the screen.
 */
export function unknownTicketIds(reply: string, allowed: ReadonlySet<string>): string[] {
  return ticketIdsIn(reply).filter((id) => !allowed.has(id));
}
