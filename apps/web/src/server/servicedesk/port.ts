import type { ServiceDeskClient } from "./client";

/** What the agent needs from the service desk; tests plug an in-memory fake into this shape. */
export type ServiceDeskPort = Pick<
  ServiceDeskClient,
  | "getUser"
  | "listTickets"
  | "getTicket"
  | "getSla"
  | "searchArticles"
  | "createTicket"
  | "addUpdate"
  | "transferTicket"
  | "reopenTicket"
  | "assumeTicket"
>;
