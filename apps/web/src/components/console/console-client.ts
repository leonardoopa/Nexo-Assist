import type { ConsoleActionResult, ConsoleDetail, ConsoleList } from "@/server/console/view";
import type { ConsoleTab } from "@/server/conversations/types";

export type ConsoleActionBody = { type: "assume" | "return" | "close" | "read" } | { type: "message"; content: string };

export type Loaded<T> = { ok: true; data: T } | { ok: false; status: number; message: string };

async function request<T>(url: string, init?: RequestInit): Promise<Loaded<T>> {
  try {
    const response = await fetch(url, { cache: "no-store", ...init });
    if (response.ok) return { ok: true, data: (await response.json()) as T };
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    return { ok: false, status: response.status, message: payload?.error?.message ?? "Algo deu errado. Tente de novo." };
  } catch {
    return { ok: false, status: 0, message: "Sem conexão com o servidor. Confira sua rede e tente de novo." };
  }
}

export function fetchConsoleList(tab: ConsoleTab, search: string): Promise<Loaded<ConsoleList>> {
  const query = new URLSearchParams({ tab });
  if (search.trim()) query.set("q", search.trim());
  return request<ConsoleList>(`/api/console/conversations?${query}`);
}

export const fetchConsoleDetail = (id: string): Promise<Loaded<ConsoleDetail>> =>
  request<ConsoleDetail>(`/api/console/conversations/${encodeURIComponent(id)}`);

export const postConsoleAction = (id: string, body: ConsoleActionBody): Promise<Loaded<ConsoleActionResult>> =>
  request<ConsoleActionResult>(`/api/console/conversations/${encodeURIComponent(id)}/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
