import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  runPstRuntime,
  validateExecutablePstDefinitionV1,
  type ExecutablePstDefinitionV1,
  type PstExecutableComponentV1,
  type PstExecutableStepV1,
} from "@workspace/db/schema";

type ProofKey = "cashflow" | "decision" | "compliance";

function definitionFor(key: ProofKey): ExecutablePstDefinitionV1 {
  const question: PstExecutableComponentV1 = {
    id: "questions",
    assetId: "asset-questions",
    name: "Questions",
    version: "1.0.0",
    capability: "question-schema",
    definition: {
      questions: [{
        id: "primary",
        label: `${key} input`,
        type: "string",
        required: true,
      }],
    },
  };
  const action: PstExecutableComponentV1 = {
    id: "action-template",
    assetId: "asset-action",
    name: "Action",
    version: "1.0.0",
    capability: "action-template",
    definition: {
      items: [{
        id: "next",
        title: `${key} next action`,
        description: `Configured action for ${key}.`,
      }],
    },
  };
  const components: PstExecutableComponentV1[] = [question, action];
  const steps: PstExecutableStepV1[] = [
    {
      id: "context",
      kind: "input",
      title: "Context",
      description: "Collect context.",
      reads: [],
      writes: ["context.organization"],
      dependsOn: [],
      operation: {
        type: "collect-context",
        fields: [{
          key: "context.organization",
          label: "Organization",
          type: "string",
          required: true,
        }],
        sessionPersistence: "customer_session",
      },
      next: { type: "step", stepId: "answers" },
    },
    {
      id: "answers",
      kind: "answer",
      title: "Answers",
      description: "Collect answer.",
      reads: ["context.organization"],
      writes: ["answers.primary"],
      dependsOn: ["context"],
      operation: {
        type: "collect-answers",
        schemaRef: question.id,
        answerFields: ["answers.primary"],
      },
      next: { type: "step", stepId: "process" },
    },
  ];

  if (key === "cashflow") {
    components.push({
      id: "scale",
      assetId: "asset-scale",
      name: "Scale",
      version: "1.0.0",
      capability: "scoring-scale",
      definition: { minimum: 0, maximum: 100, bands: [{ minimum: 0, label: "Review" }] },
    });
    steps.push({
      id: "process",
      kind: "scoring",
      title: "Score",
      description: "Score input.",
      reads: ["answers.primary"],
      writes: ["derived.score"],
      dependsOn: ["answers"],
      operation: { type: "score", scaleRef: "scale", output: "derived.score" },
      next: { type: "step", stepId: "action" },
    });
  } else if (key === "decision") {
    components.push({
      id: "strategy",
      assetId: "asset-strategy",
      name: "Strategy",
      version: "1.0.0",
      capability: "recommendation-strategy",
      definition: { template: "Select the strongest option.", outputFields: ["derived.recommendation"] },
    });
    steps.push({
      id: "process",
      kind: "recommendation",
      title: "Recommend",
      description: "Recommend an option.",
      reads: ["answers.primary"],
      writes: ["derived.recommendation"],
      dependsOn: ["answers"],
      operation: { type: "recommend", strategyRef: "strategy", output: "derived.recommendation" },
      next: { type: "step", stepId: "action" },
    });
  } else {
    components.push({
      id: "analysis",
      assetId: "asset-analysis",
      name: "Analysis",
      version: "1.0.0",
      capability: "analysis-template",
      definition: { template: "Identify document gaps.", outputFields: ["derived.analysis"] },
    });
    steps.push({
      id: "process",
      kind: "rules",
      title: "Rules",
      description: "Evaluate document rules.",
      reads: ["answers.primary"],
      writes: ["derived.compliance"],
      dependsOn: ["answers"],
      operation: { type: "evaluate-rules", ruleIds: ["document-present"] },
      next: { type: "step", stepId: "analysis" },
    }, {
      id: "analysis",
      kind: "analysis",
      title: "Analyze",
      description: "Analyze gaps.",
      reads: ["derived.compliance"],
      writes: ["derived.analysis"],
      dependsOn: ["process"],
      operation: { type: "analyze", templateRef: "analysis", output: "derived.analysis" },
      next: { type: "step", stepId: "action" },
    });
  }

  const processOutput = key === "cashflow"
    ? "derived.score" as const
    : key === "decision"
      ? "derived.recommendation" as const
      : "derived.analysis" as const;
  steps.push({
    id: "action",
    kind: "action",
    title: "Action",
    description: "Create action.",
    reads: [processOutput],
    writes: ["derived.action"],
    dependsOn: [key === "compliance" ? "analysis" : "process"],
    operation: { type: "action", actionRef: action.id, output: "derived.action" },
    next: { type: "step", stepId: "outcome" },
  }, {
    id: "outcome",
    kind: "outcome",
    title: "Outcome",
    description: "Complete journey.",
    reads: ["derived.action"],
    writes: [],
    dependsOn: ["action"],
    operation: { type: "outcome", outcomeId: "outcome", outputRefs: ["derived.action"] },
    next: { type: "complete", outcomeId: "outcome" },
  });

  return {
    runtimeVersion: "pst-runtime.v1",
    compiler: { name: "pst-compiler", version: "pst-compiler.v1" },
    identity: {
      releaseId: `release-${key}`,
      projectId: `project-${key}`,
      slug: key,
      releaseVersion: "v1.0",
      publishedAt: "2026-08-30T00:00:00.000Z",
      snapshotHash: "a".repeat(64),
      sourceSchemaVersion: "pst-release-snapshot.v1",
      irVersion: "pst-manufacturing-ir.v1",
    },
    product: {
      name: key,
      description: `${key} proof`,
      problem: `${key} problem`,
      targetUser: "Customer",
      desiredOutcome: `${key} outcome`,
      journey: steps.map(({ title }) => title),
      expectedOutput: [`${key} result`],
    },
    state: {
      contextFields: [{
        key: "context.organization",
        label: "Organization",
        type: "string",
        required: true,
      }],
      sessionPersistence: "customer_session",
    },
    declarations: {
      components,
      rules: key === "compliance" ? [{
        id: "document-present",
        version: "1.0.0",
        name: "Document present",
        kind: "RULE",
        when: { all: [{ field: "answers.primary", operator: "exists" }] },
        then: [{ type: "set", field: "derived.compliance", value: "reviewed" }],
      }] : [],
      providers: [],
    },
    steps,
    entryStepId: "context",
    outcomeStepIds: ["outcome"],
  };
}

test("one generic runtime executes three declarative PST journeys", () => {
  const outputs = (["cashflow", "decision", "compliance"] as const).map((key) => {
    const result = runPstRuntime(definitionFor(key), [
      { "context.organization": "Acme" },
      { "answers.primary": `${key} evidence` },
    ]);
    assert.equal(result.status, "COMPLETED");
    assert.deepEqual(result.session.visitedStepIds, key === "compliance"
      ? ["context", "answers", "process", "analysis", "action", "outcome"]
      : ["context", "answers", "process", "action", "outcome"]);
    return result.output["derived.action"];
  });
  assert.equal(new Set(outputs.map((output) => JSON.stringify(output))).size, 3);
});

test("runtime rejects forged transitions and undeclared state", () => {
  const forged = definitionFor("cashflow");
  forged.steps[0] = {
    ...forged.steps[0]!,
    writes: ["derived.not-declared"],
    next: { type: "step", stepId: "missing" },
  };
  const validation = validateExecutablePstDefinitionV1(forged);
  assert.equal(validation.status, "BLOCKED");
  if (validation.status === "BLOCKED") {
    assert.ok(validation.errors.some(({ code }) => code === "UNRESOLVED_REFERENCE"));
  }
});

test("generic runtime implementation contains no product-specific branch or external call", () => {
  const source = readFileSync(
    new URL("../../../../../../lib/db/src/schema/pst-runtime.ts", import.meta.url),
    "utf8",
  ).toLowerCase();
  for (const forbidden of [
    "cashflow",
    "decision readiness",
    "document compliance",
    "fetch(",
    "database",
    "gustafta",
  ]) {
    assert.equal(source.includes(forbidden), false, `runtime source must not contain ${forbidden}`);
  }
});