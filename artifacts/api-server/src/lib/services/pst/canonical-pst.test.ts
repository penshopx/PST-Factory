import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalSourceFromRelease,
  manufacturingIrFromCanonicalSource,
  pstCanonicalJsonHash,
  pstCanonicalSourceContractVersion,
  pstManufacturingIrVersion,
  type PstReleaseSnapshot,
  type WorkflowStep,
} from "@workspace/db/schema";

function snapshotFor(
  projectId: string,
  name: string,
  desiredOutcome: string,
  workflow: WorkflowStep[],
): PstReleaseSnapshot {
  const snapshot: Omit<PstReleaseSnapshot, "snapshotHash"> = {
    sourceSchemaVersion: "pst-release-snapshot.v1",
    snapshotHashAlgorithm: "sha256-canonical-json.v1",
    project: {
      name,
      description: `${name} toolkit`,
      status: "PUBLISHED",
      version: "v1.0",
      domain: "Business",
      family: "Decision support",
      series: "Core",
      problemStatement: `${name} problem`,
      targetUser: "Operator",
      desiredOutcome,
      productDna: {
        problem: `${name} problem`,
        user: "Operator",
        journey: ["Collect", "Evaluate", "Act"],
        components: ["Input", "Evaluation", "Outcome"],
        intelligence: "Declarative rules",
        outcome: desiredOutcome,
      },
      qaStatus: "PASS",
      publicationStatus: "PUBLISHED",
    },
    blueprint: {
      id: `blueprint-${projectId}`,
      projectId,
      problem: `${name} problem`,
      targetUser: "Operator",
      desiredOutcome,
      problemType: "Structured evaluation",
      journey: ["Collect", "Evaluate", "Act"],
      knowledgeRequirements: ["Domain criteria"],
      componentRequirements: ["Input", "Evaluation", "Outcome"],
      aiRequirements: [],
      workflow,
      expectedOutput: [desiredOutcome],
      actionPlan: ["Take the next action"],
      nextStep: "Publish",
      version: "v1.0",
      updatedAt: "2026-08-29T00:00:00.000Z",
    },
    workflow,
    components: [{
      id: `component-${projectId}`,
      assetId: "asset-outcome",
      name: "Outcome",
      type: "OUTCOME",
      source: "Library",
      version: "v1.0",
      status: "READY",
      required: true,
      configuration: { format: "summary" },
    }],
    rules: [],
    providers: [],
  };
  return { ...snapshot, snapshotHash: pstCanonicalJsonHash(snapshot) };
}

function releaseFor(projectId: string) {
  return {
    releaseId: `release-${projectId}`,
    projectId,
    slug: projectId,
    version: "v1.0",
    publishedAt: "2026-08-29T00:00:00.000Z",
  };
}

function outcomeWorkflow(stateKey: string): WorkflowStep[] {
  return [{
    id: "outcome",
    type: "OUTPUT",
    title: "Outcome",
    description: "Return the configured result.",
    inputs: [`derived.${stateKey}`],
    outputs: [`derived.${stateKey}_result`],
    dependencies: [],
    nextStep: "",
  }];
}

test("canonical source and Manufacturing IR are deterministic", () => {
  const projectId = "cashflow-health";
  const snapshot = snapshotFor(
    projectId,
    "Cashflow Health Check",
    "Cashflow diagnosis",
    outcomeWorkflow("cashflow_health"),
  );
  const firstSource = canonicalSourceFromRelease(releaseFor(projectId), snapshot);
  const secondSource = canonicalSourceFromRelease(releaseFor(projectId), snapshot);
  assert.deepEqual(firstSource, secondSource);
  assert.equal(firstSource.ok, true);
  if (!firstSource.ok) return;
  assert.equal(firstSource.value.contractVersion, pstCanonicalSourceContractVersion);

  const firstIr = manufacturingIrFromCanonicalSource(firstSource.value);
  const secondIr = manufacturingIrFromCanonicalSource(firstSource.value);
  assert.deepEqual(firstIr, secondIr);
  assert.equal(firstIr.ok, true);
  if (!firstIr.ok) return;
  assert.equal(firstIr.value.irVersion, pstManufacturingIrVersion);
  assert.equal(firstIr.value.graph.nodes[0]?.kind, "OUTCOME");
  assert.deepEqual(firstIr.value.graph.nodes[0]?.next, { type: "complete" });
});

test("canonical source rejects a divergent Blueprint workflow mirror", () => {
  const projectId = "workflow-mismatch";
  const snapshot = snapshotFor(
    projectId,
    "Workflow mismatch",
    "Blocked",
    outcomeWorkflow("result"),
  );
  snapshot.blueprint.workflow = [{ ...snapshot.workflow[0], title: "Changed mirror" }];

  const result = canonicalSourceFromRelease(releaseFor(projectId), snapshot);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.errors.some(({ code }) => code === "SNAPSHOT_MISMATCH"), true);
});

test("canonical source rejects a snapshot whose payload no longer matches its hash", () => {
  const projectId = "tampered";
  const snapshot = snapshotFor(
    projectId,
    "Tampered",
    "Blocked",
    outcomeWorkflow("result"),
  );
  snapshot.project.description = "Changed after hashing";

  const result = canonicalSourceFromRelease(releaseFor(projectId), snapshot);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.errors.some(({ code, path }) =>
    code === "SNAPSHOT_MISMATCH" && path === "snapshot.snapshotHash"), true);
});

test("Manufacturing IR rejects ambiguous steps and unbound state keys", () => {
  const projectId = "ambiguous";
  const snapshot = snapshotFor(projectId, "Ambiguous", "Blocked", [{
    id: "assessment",
    type: "ASSESSMENT",
    title: "Assessment",
    description: "Legacy ambiguous step.",
    inputs: ["profile"],
    outputs: ["score"],
    dependencies: [],
    nextStep: "",
  }]);
  const source = canonicalSourceFromRelease(releaseFor(projectId), snapshot);
  assert.equal(source.ok, true);
  if (!source.ok) return;

  const result = manufacturingIrFromCanonicalSource(source.value);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.errors.some(({ code }) => code === "AMBIGUOUS_STEP"), true);
});

test("Manufacturing IR blocks every undeclared legacy alias", () => {
  const projectId = "unsupported-alias";
  const workflow = outcomeWorkflow("result");
  workflow[0] = { ...workflow[0], type: "RESULT" };
  const snapshot = snapshotFor(projectId, "Unsupported alias", "Blocked", workflow);
  const source = canonicalSourceFromRelease(releaseFor(projectId), snapshot);
  assert.equal(source.ok, true);
  if (!source.ok) return;

  const result = manufacturingIrFromCanonicalSource(source.value);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.errors.some(({ code }) => code === "AMBIGUOUS_STEP"), true);
});

test("one canonical contract represents three distinct PST definitions", () => {
  const fixtures = [
    ["cashflow", "Cashflow Health Check", "Cashflow diagnosis", "cashflow_health"],
    ["decision", "Decision Readiness", "Preferred option", "decision_readiness"],
    ["compliance", "Document Compliance", "Compliance gaps", "compliance_status"],
  ] as const;

  const results = fixtures.map(([projectId, name, outcome, stateKey]) => {
    const source = canonicalSourceFromRelease(
      releaseFor(projectId),
      snapshotFor(projectId, name, outcome, outcomeWorkflow(stateKey)),
    );
    assert.equal(source.ok, true);
    if (!source.ok) throw new Error("Expected canonical source.");
    return manufacturingIrFromCanonicalSource(source.value);
  });

  assert.equal(results.every((result) => result.ok), true);
  const irs = results.flatMap((result) => result.ok ? [result.value] : []);
  assert.deepEqual(irs.map(({ irVersion }) => irVersion), [
    pstManufacturingIrVersion,
    pstManufacturingIrVersion,
    pstManufacturingIrVersion,
  ]);
  assert.deepEqual(irs.map(({ product }) => product.desiredOutcome), [
    "Cashflow diagnosis",
    "Preferred option",
    "Compliance gaps",
  ]);
});