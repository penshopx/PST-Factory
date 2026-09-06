import { and, inArray, lt } from "drizzle-orm";
import { db, pstPublicRuntimeSessionsTable } from "@workspace/db";
import { logger } from "../../logger";

export const publicRuntimeSessionRetentionDays = 30;
const cleanupIntervalMs = 24 * 60 * 60 * 1000;
const terminalStatuses = ["COMPLETED", "BLOCKED"];

export function publicRuntimeSessionRetentionCutoff(now = new Date()) {
  return new Date(
    now.getTime() - publicRuntimeSessionRetentionDays * 24 * 60 * 60 * 1000,
  );
}

export async function cleanupExpiredPublicRuntimeSessions(now = new Date()) {
  const deleted = await db
    .delete(pstPublicRuntimeSessionsTable)
    .where(and(
      inArray(pstPublicRuntimeSessionsTable.status, terminalStatuses),
      lt(pstPublicRuntimeSessionsTable.updatedAt, publicRuntimeSessionRetentionCutoff(now)),
    ))
    .returning({ id: pstPublicRuntimeSessionsTable.id });
  return deleted.length;
}

export async function startPublicRuntimeSessionRetention() {
  const initialDeleted = await cleanupExpiredPublicRuntimeSessions();
  if (initialDeleted > 0) {
    logger.info({ deleted: initialDeleted }, "Expired public runtime sessions removed");
  }

  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    void cleanupExpiredPublicRuntimeSessions()
      .then((deleted) => {
        if (deleted > 0) {
          logger.info({ deleted }, "Expired public runtime sessions removed");
        }
      })
      .catch((err) => {
        logger.error({ err }, "Public runtime session retention failed");
      })
      .finally(() => {
        running = false;
      });
  }, cleanupIntervalMs);
  timer.unref();
}