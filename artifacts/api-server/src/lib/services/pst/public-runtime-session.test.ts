import assert from "node:assert/strict";
import test from "node:test";
import { createPstRuntime, advancePstRuntime } from "@workspace/db/schema";
import { publicRuntimeSessionView } from "./public-runtime-session";

const definition = {
  runtimeVersion: "pst-runtime.v1",
  compiler: { name: "pst-compiler", version: "pst-compiler.v1" },
  identity: {
    releaseId: "release-1", projectId: "project-1", slug: "public", releaseVersion: "v1",
    publishedAt: "2026-01-01T00:00:00.000Z", snapshotHash: "a".repeat(64),
    sourceSchemaVersion: "pst-release-snapshot.v1", irVersion: "pst-manufacturing-ir.v1",
  },
  product: { name: "Public", description: "", problem: "", targetUser: "", desiredOutcome: "", journey: [], expectedOutput: [] },
  state: { contextFields: [], sessionPersistence: "customer_session" },
  declarations: { components: [], rules: [], providers: [] },
  steps: [{
    id: "done", kind: "outcome", title: "Done", description: "", reads: [], writes: [],
    dependsOn: [], operation: { type: "outcome", outcomeId: "done", outputRefs: [] },
    next: { type: "complete", outcomeId: "done" },
  }],
  entryStepId: "done",
  outcomeStepIds: ["done"],
} as const;

test("public runtime session mapper excludes executable session internals", () => {
  const started = createPstRuntime(definition);
  assert.equal(started.status, "READY");
  if (started.status !== "READY") return;
  const result = advancePstRuntime(started.session);
  const view = publicRuntimeSessionView("opaque-session", 1, result);
  assert.deepEqual(view, {
    sessionId: "opaque-session",
    revision: 1,
    status: "COMPLETED",
    outcomeId: "done",
    output: {},
  });
  assert.equal("session" in view, false);
  assert.equal("definition" in view, false);
});