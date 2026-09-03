import { jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { pstProjectsTable } from "./pst";

export type PstAssemblyChecklistItem = {
  id: string;
  day: number;
  title: string;
  description: string;
  completed: boolean;
};

export type PstAssemblyRisk = {
  id: string;
  title: string;
  description: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  mitigation: string;
  status: "OPEN" | "MITIGATED";
};

export const pstProjectAssembliesTable = pgTable(
  "pst_project_assemblies",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => pstProjectsTable.id, { onDelete: "cascade" }),
    sourceBlueprintVersion: text("source_blueprint_version").notNull(),
    sourceBlueprintUpdatedAt: timestamp("source_blueprint_updated_at", { withTimezone: true }).notNull(),
    status: text("status").$type<"READY" | "BLOCKED">().notNull(),
    checklist: jsonb("checklist").$type<PstAssemblyChecklistItem[]>().notNull(),
    risks: jsonb("risks").$type<PstAssemblyRisk[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    projectUnique: uniqueIndex("pst_project_assemblies_project_idx").on(table.projectId),
  }),
);

export const insertPstProjectAssemblySchema = createInsertSchema(pstProjectAssembliesTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertPstProjectAssembly = z.infer<typeof insertPstProjectAssemblySchema>;
export type PstProjectAssembly = typeof pstProjectAssembliesTable.$inferSelect;