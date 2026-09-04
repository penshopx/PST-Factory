import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const pstSecurityAuditEventsTable = pgTable(
  "pst_security_audit_events",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    actorUserId: text("actor_user_id").notNull(),
    targetProjectId: text("target_project_id").notNull(),
    method: text("method").notNull(),
    routePattern: text("route_pattern").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    targetCreatedAtIndex: index("pst_security_audit_target_created_at_idx").on(
      table.targetProjectId,
      table.createdAt,
    ),
    actorCreatedAtIndex: index("pst_security_audit_actor_created_at_idx").on(
      table.actorUserId,
      table.createdAt,
    ),
  }),
);

export const insertPstSecurityAuditEventSchema = createInsertSchema(
  pstSecurityAuditEventsTable,
).omit({ createdAt: true });

export type InsertPstSecurityAuditEvent = z.infer<
  typeof insertPstSecurityAuditEventSchema
>;
export type PstSecurityAuditEvent =
  typeof pstSecurityAuditEventsTable.$inferSelect;