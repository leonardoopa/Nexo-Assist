import "server-only";

import { getEnv } from "@/server/env";

import { ServiceDeskClient } from "./client";

let client: ServiceDeskClient | undefined;

export function getServiceDesk(): ServiceDeskClient {
  if (!client) {
    const env = getEnv();
    client = new ServiceDeskClient({ baseUrl: env.SERVICEDESK_URL, apiKey: env.SERVICEDESK_API_KEY });
  }
  return client;
}

export { ServiceDeskClient } from "./client";
export { ServiceDeskApiError, ServiceDeskContractError, ServiceDeskError, ServiceDeskUnavailableError } from "./errors";
