import { z } from "zod";

export const roleSchema = z.enum(["employee", "analyst"]);
export type Role = z.infer<typeof roleSchema>;

export const supportGroupSchema = z.enum(["N1", "N2"]);
export type SupportGroup = z.infer<typeof supportGroupSchema>;
