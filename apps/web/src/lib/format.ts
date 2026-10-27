const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days between an ISO timestamp and now (never negative). */
export function daysSince(iso: string, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / DAY_MS));
}

export function formatDaysAgo(days: number): string {
  if (days === 0) return "hoje";
  return days === 1 ? "há 1 dia" : `há ${days} dias`;
}

/** "Ana Souza" becomes "AS"; one name gives one letter. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? "";
  const last = words.length > 1 ? (words.at(-1)?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

// Times are shown in the company's timezone, whatever the browser or the server uses.
const TIMEZONE = "America/Sao_Paulo";
const clock = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: TIMEZONE });
const dayOfMonth = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", timeZone: TIMEZONE });
const calendarDay = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: TIMEZONE });

/** "13:43" */
export const formatClock = (iso: string): string => clock.format(new Date(iso));

/** "16 out" */
export function formatShortDate(iso: string): string {
  const parts = dayOfMonth.formatToParts(new Date(iso));
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  const month = (parts.find((part) => part.type === "month")?.value ?? "").replace(".", "");
  return `${day} ${month}`;
}

/** "16 out, 14:20" */
export const formatDateTime = (iso: string): string => `${formatShortDate(iso)}, ${formatClock(iso)}`;

/** "até 13:43" for a time today, "até 30 out, 10:00" for another day. */
export function formatUntil(iso: string, now: Date = new Date()): string {
  const sameDay = calendarDay.format(new Date(iso)) === calendarDay.format(now);
  return sameDay ? `até ${formatClock(iso)}` : `até ${formatDateTime(iso)}`;
}

/** How a draft is named on screen: D-381. */
export const formatDraftId = (id: number): string => `D-${String(id).padStart(3, "0")}`;
