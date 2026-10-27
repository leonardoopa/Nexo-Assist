import { z } from "zod";

import { roleSchema, supportGroupSchema } from "@/lib/domain";

// Shapes of the legacy service after its snake_case keys are camelized (see `lib/case`).

export const ticketTypeSchema = z.enum(["INC", "REQ"]);
export const categorySchema = z.enum(["acesso", "rede_vpn", "hardware", "software", "email", "outros"]);
export const prioritySchema = z.enum(["critica", "alta", "media", "baixa"]);
export const ticketStatusSchema = z.enum([
  "aberto",
  "em_andamento",
  "aguardando_analista",
  "em_atendimento",
  "aprovado",
  "resolvido",
]);
export const affectedSchema = z.enum(["me", "team", "company", "unknown"]);
export const transferReasonSchema = z.enum(["employee_request", "critical", "overdue", "low_confidence"]);
export const ticketEventKindSchema = z.enum([
  "created",
  "employee_update",
  "analyst_response",
  "transferred",
  "assumed",
  "resolved",
  "reopened",
]);

const timestamp = z.iso.datetime({ offset: true });

export const personSchema = z.object({
  email: z.string(),
  name: z.string(),
  department: z.string().nullable(),
  supportGroup: supportGroupSchema.nullable(),
});

export const userSchema = personSchema.extend({
  role: roleSchema,
  device: z.object({ model: z.string(), os: z.string() }).nullable(),
  passwordChangedAt: timestamp.nullable(),
});

export const slaInfoSchema = z.object({
  label: z.string(),
  dueAt: timestamp,
  clockRunning: z.boolean(),
  overdue: z.boolean(),
  overdueByMinutes: z.number().int(),
});

export const ticketSchema = z.object({
  id: z.string(),
  type: ticketTypeSchema,
  title: z.string(),
  description: z.string(),
  category: categorySchema,
  subcategory: z.string().nullable(),
  priority: prioritySchema,
  status: ticketStatusSchema,
  affected: affectedSchema,
  requester: personSchema,
  assignee: personSchema.nullable(),
  assignedGroup: supportGroupSchema.nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
  lastResponseAt: timestamp,
  resolvedAt: timestamp.nullable(),
  resolution: z.string().nullable(),
  sla: slaInfoSchema,
  canReopen: z.boolean(),
  reopenUntil: timestamp.nullable(),
  matchScore: z.number().nullable(),
});

export const ticketEventSchema = z.object({
  id: z.number().int(),
  at: timestamp,
  kind: ticketEventKindSchema,
  actor: personSchema.nullable(),
  text: z.string(),
  meta: z.record(z.string(), z.string()),
});

export const ticketDetailSchema = ticketSchema.extend({ events: z.array(ticketEventSchema) });
export const ticketListSchema = z.object({ items: z.array(ticketSchema), total: z.number().int() });

export const articleSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  category: categorySchema,
  tags: z.array(z.string()),
  updatedAt: timestamp,
  score: z.number().nullable(),
});
export const articleListSchema = z.object({ items: z.array(articleSchema) });

export const slaPreviewSchema = z.object({
  priority: prioritySchema,
  label: z.string(),
  businessHours: z.boolean(),
  dueAt: timestamp,
  calculatedFrom: timestamp,
});

const labelSchema = z.object({ id: z.string(), label: z.string() });
export const metaSchema = z.object({
  types: z.array(labelSchema),
  categories: z.array(labelSchema),
  priorities: z.array(labelSchema.extend({ sla: z.string(), businessHours: z.boolean() })),
  statuses: z.array(labelSchema.extend({ open: z.boolean(), clockRunning: z.boolean() })),
  affected: z.array(labelSchema),
  supportHours: z.string(),
});

export const errorEnvelopeSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});

export type TicketType = z.infer<typeof ticketTypeSchema>;
export type Category = z.infer<typeof categorySchema>;
export type Priority = z.infer<typeof prioritySchema>;
export type TicketStatus = z.infer<typeof ticketStatusSchema>;
export type Affected = z.infer<typeof affectedSchema>;
export type TransferReason = z.infer<typeof transferReasonSchema>;
export type ServiceDeskUser = z.infer<typeof userSchema>;
export type Ticket = z.infer<typeof ticketSchema>;
export type TicketDetail = z.infer<typeof ticketDetailSchema>;
export type TicketList = z.infer<typeof ticketListSchema>;
export type Article = z.infer<typeof articleSchema>;
export type ArticleList = z.infer<typeof articleListSchema>;
export type SlaPreview = z.infer<typeof slaPreviewSchema>;
export type ServiceDeskMeta = z.infer<typeof metaSchema>;
