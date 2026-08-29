import assert from "node:assert/strict";
import test from "node:test";
import {
  runPstRuntime,
  type PstReleaseSnapshot,
  type WorkflowStep,
} from "@workspace/db/schema";
import { compileExecutableRelease } from "./executable-release";

const legacyWorkflow: WorkflowStep[] = [
  {
    id: "profile",
    type: "INPUT",
    title: "User profile",
    description: "Capture customer context.",
    inputs: ["profile"],
    outputs: ["user_context"],
    dependencies: [],
    nextStep: "assessment",
  },
  {
    id: "assessment",
    type: "ASSESSMENT",
    title: "Assessment",
    description: "Collect structured answers.",
    inputs: ["user_context"],
    outputs: ["assessment_score", "assessment_answers"],
    dependencies: ["profile"],
    nextStep: "analysis",
  },
  {
    id: "analysis",
    type: "ANALYSIS",
    title: "Analysis",
    description: "Summarize the situation.",
    inputs: ["assessment_score", "assessment_answers"],
    outputs: ["analysis"],
    dependencies: ["assessment"],
    nextStep: "recommendation",
  },
  {
    id: "recommendation",
    type: "RECOMMENDATION",
    title: "Recommendation",
    description: "Recommend the next move.",
    inputs: ["analysis"],
    outputs: ["recommendation"],
    dependencies: ["analysis"],
    nextStep: "action",
  },
  {
    id: "action",
    type: "ACTION",
    title: "Action",
    description: "Create a practical action.",
    inputs: ["recommendation"],
    outputs: ["action_plan"],
    dependencies: ["recommendation"],
    nextStep: "completion",
  },
  {
    id: "completion",
    type: "OUTPUT",
    title: "Completion",
    description: "Return the outcome.",
    inputs: ["action_plan"],
    outputs: ["outcome"],
    dependencies: ["action"],
    nextStep: "",
  },
];

function legacySnapshot(): PstReleaseSnapshot {
  return {
    project: {
      name: "Legacy PST",
      description: "Published before Compiler v1.",
      status: "PUBLISHED",
      version: "v1.0",
      domain: "General",
      family: "Problem Solving",
      series: "Legacy",
      problemStatement: "A legacy customer problem",
      targetUser: "Customer",
      desiredOutcome: "A practical next step",
      productDna: {
        problem: "A legacy customer problem",
        user: "Customer",
        journey: ["Profile", "Assess", "Analyze", "Act"],
        components: [],
        intelligence: "Human-approved assistance",
        outcome: "A practical next step",
      },
      qaStatus: "PASS",
      publicationStatus: "PUBLISHED",
    },
    blueprint: {
      id: "blueprint-legacy",
      projectId: "project-legacy",
      problem: "A legacy customer problem",
      targetUser: "Customer",
      desiredOutcome: "A practical next step",
      problemType: "Assessment and action planning",
      journey: ["Profile", "Assess", "Analyze", "Act"],
      knowledgeRequirements: [],
      componentRequirements: [],
      aiRequirements: [],
      workflow: legacyWorkflow,
      expectedOutput: ["A practical next step"],
      actionPlan: ["Complete the assessment"],
      nextStep: "Run",
      version: "v1.0",
      updatedAt: "2026-08-29T00:00:00.000Z",
    },
    workflow: legacyWorkflow,
    components: [],
    rules: [],
    providers: [],
  };
}

const release = {
  id: "release-legacy",
  projectId: "project-legacy",
  version: "v1.0",
  createdAt: new Date("2026-08-29T00:00:00.000Z"),
};

test("legacy published snapshot runs without mutation through the compatibility compiler", () => {
  const snapshot = legacySnapshot();
  const original = structuredClone(snapshot);
  const first = compileExecutableRelease(release, "legacy-pst", snapshot);
  const second = compileExecutableRelease(release, "legacy-pst", snapshot);

  assert.deepEqual(snapshot, original);
  assert.deepEqual(first, second);
  assert.equal(first.status, "COMPILED");
  if (first.status !== "COMPILED") return;
  assert.equal(first.definition.compiler.name, "pst-legacy-compat");
  assert.equal(first.definition.compiler.version, "pst-legacy-compat.v1");
  assert.equal(first.definition.identity.sourceSchemaVersion, "pst-release-snapshot.legacy-v0");

  const runtime = runPstRuntime(first.definition, [
    { "context.user_context": "Established business" },
    {
      "answers.assessment_score": "70",
      "answers.assessment_answers": "Needs a clear priority",
    },
  ]);
  assert.equal(runtime.status, "COMPLETED");
  if (runtime.status === "COMPLETED") {
    assert.ok(runtime.output["derived.action_plan"]);
  }
});

test("legacy compatibility rejects malformed graphs and configured legacy steps", () => {
  const malformed = legacySnapshot();
  malformed.workflow[1] = {
    ...malformed.workflow[1]!,
    nextStep: "missing",
    configuration: {},
  };
  malformed.blueprint.workflow = malformed.workflow;
  const result = compileExecutableRelease(release, "legacy-pst", malformed);
  assert.equal(result.status, "BLOCKED");
  if (result.status === "BLOCKED") {
    assert.ok(result.diagnostics.every(({ code }) => code === "LEGACY_COMPAT_UNSUPPORTED"));
  }
});

test("legacy compatibility never drops rule or provider behavior", () => {
  const configured = legacySnapshot();
  configured.rules.push({
    id: "legacy-rule",
    version: "v0",
    name: "Legacy rule",
    kind: "RULE",
    when: {},
    then: [],
  });
  const result = compileExecutableRelease(release, "legacy-pst", configured);
  assert.equal(result.status, "BLOCKED");
  if (result.status === "BLOCKED") {
    assert.ok(result.diagnostics.some(({ path }) => path === "snapshot"));
  }
});

test("legacy compatibility rejects components it cannot translate losslessly", () => {
  const configured = legacySnapshot();
  configured.components.push({
    id: "legacy-component",
    assetId: "legacy-asset",
    name: "Legacy component",
    type: "TOOL",
    source: "Library",
    version: "v0",
    status: "READY",
    required: true,
    configuration: { behavior: "unknown" },
  });
  const result = compileExecutableRelease(release, "legacy-pst", configured);
  assert.equal(result.status, "BLOCKED");
});

test("legacy compatibility rejects forward references and normalized state collisions", () => {
  const forward = legacySnapshot();
  forward.workflow[1] = { ...forward.workflow[1]!, inputs: ["action_plan"] };
  forward.blueprint.workflow = forward.workflow;
  const forwardResult = compileExecutableRelease(release, "legacy-pst", forward);
  assert.equal(forwardResult.status, "BLOCKED");

  const collision = legacySnapshot();
  collision.workflow[1] = {
    ...collision.workflow[1]!,
    outputs: ["same value", "same_value"],
  };
  collision.blueprint.workflow = collision.workflow;
  const collisionResult = compileExecutableRelease(release, "legacy-pst", collision);
  assert.equal(collisionResult.status, "BLOCKED");
});

test("malformed persisted legacy JSON blocks without throwing", () => {
  const malformed = {
    ...legacySnapshot(),
    rules: undefined,
    workflow: [null],
  } as unknown as PstReleaseSnapshot;
  assert.doesNotThrow(() => compileExecutableRelease(release, "legacy-pst", malformed));
  const result = compileExecutableRelease(release, "legacy-pst", malformed);
  assert.equal(result.status, "BLOCKED");
});

test("snapshots with any modern provenance marker never fall back to legacy compatibility", () => {
  const modernButIncomplete = legacySnapshot();
  modernButIncomplete.sourceSchemaVersion = "pst-release-snapshot.v1";
  const result = compileExecutableRelease(release, "legacy-pst", modernButIncomplete);
  assert.equal(result.status, "BLOCKED");
  if (result.status === "BLOCKED") {
    assert.equal(
      result.diagnostics.some(({ code }) => code === "LEGACY_COMPAT_UNSUPPORTED"),
      false,
    );
  }
});