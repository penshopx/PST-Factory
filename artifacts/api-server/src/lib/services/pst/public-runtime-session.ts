import type {
  PstRuntimeAdvanceResultV1,
  PstRuntimeDiagnosticV1,
  PstRuntimeSessionV1,
  PstRuntimeStepViewV1,
} from "@workspace/db/schema";

export type PublicRuntimeSessionView = {
  sessionId: string;
  revision: number;
  status: "WAITING_INPUT" | "RUNNING" | "COMPLETED" | "BLOCKED";
  step?: PstRuntimeStepViewV1;
  outcomeId?: string;
  output?: Record<string, unknown>;
  errors?: PstRuntimeDiagnosticV1[];
};

export type PersistedRuntimeAdvance = {
  runtimeSession: PstRuntimeSessionV1;
  status: PublicRuntimeSessionView["status"];
  outcomeId?: string;
  output?: Record<string, unknown>;
  errors?: PstRuntimeDiagnosticV1[];
};

export function publicRuntimeSessionView(
  sessionId: string,
  revision: number,
  result: PstRuntimeAdvanceResultV1,
): PublicRuntimeSessionView {
  if (result.status === "COMPLETED") {
    return { sessionId, revision, status: result.status, outcomeId: result.outcomeId, output: result.output };
  }
  if (result.status === "BLOCKED") {
    return { sessionId, revision, status: result.status, errors: result.errors };
  }
  return { sessionId, revision, status: result.status, step: result.step };
}

export function persistedRuntimeAdvance(
  result: PstRuntimeAdvanceResultV1,
): PersistedRuntimeAdvance | undefined {
  if (!result.session) return undefined;
  if (result.status === "COMPLETED") {
    return {
      runtimeSession: result.session,
      status: result.status,
      outcomeId: result.outcomeId,
      output: result.output,
    };
  }
  if (result.status === "BLOCKED") {
    return { runtimeSession: result.session, status: result.status, errors: result.errors };
  }
  return { runtimeSession: result.session, status: result.status };
}