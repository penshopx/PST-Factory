import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { pstProjectsTable, pstReleasesTable } from "./pst";
import type {
  PstRuntimeDiagnosticV1,
  PstRuntimeSessionV1,
} from "./pst-runtime";

export const pstPublicRuntimeSessionsTable = pgTable("pst_public_runtime_sessions", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => pstProjectsTable.id, { onDelete: "cascade" }),
  releaseId: text("release_id")
    .notNull()
    .references(() => pstReleasesTable.id, { onDelete: "cascade" }),
  releaseVersion: text("release_version").notNull(),
  runtimeSession: jsonb("runtime_session").$type<PstRuntimeSessionV1>().notNull(),
  status: text("status").notNull(),
  revision: integer("revision").notNull().default(0),
  outcomeId: text("outcome_id"),
  output: jsonb("output").$type<Record<string, unknown>>(),
  errors: jsonb("errors").$type<PstRuntimeDiagnosticV1[]>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertPstPublicRuntimeSessionSchema = createInsertSchema(
  pstPublicRuntimeSessionsTable,
).omit({ createdAt: true, updatedAt: true });
export type InsertPstPublicRuntimeSession = z.infer<typeof insertPstPublicRuntimeSessionSchema>;
export type PstPublicRuntimeSession = typeof pstPublicRuntimeSessionsTable.$inferSelect;