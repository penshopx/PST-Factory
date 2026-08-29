import assert from "node:assert/strict";
import test from "node:test";
import {
  compilePstV1,
  manufacturingIrFromCanonicalSource,
  prepareCompilerReadyIr,
  pstCanonicalJsonHash,
  pstCompilerVersion,
  validateCanonicalSource,
  type PstCanonicalSourceV1,
  type PstCompilerReadyIrV1,
} from "@workspace/db/schema";

const snapshotHash = "a".repeat(64);

function validSource(): PstCanonicalSourceV1 {
  return {
    contractVersion: "pst-canonical-source.v1",
    release: {
      releaseId: "release-1",
      projectId: "project-1",
      slug: "example-pst",
      version: "1.0.0",
      publishedAt: "2026-08-29T00:00:00.000Z",
      sourceSchemaVersion: "pst-release-snapshot.v1",
      snapshotHashAlgorithm: "sha256-canonical-json.v1",
      snapshotHash,
    },
    project: {
      name: "Example PST",
      description: "Example",
      domain: "operations",
      family: "assessment",
      series: "readiness",
      problemStatement: "Problem",
      targetUser: "Target",
      desiredOutcome: "Outcome",
      productDna: {
        problem: "Problem",
        user: "Target",
        journey: ["Context", "Outcome"],
        components: [],
        intelligence: "Rules",
        outcome: "Outcome",
      },
    },
    blueprint: {
      id: "blueprint-1",
      projectId: "project-1",
      version: "1.0.0",
      problem: "Problem",
      targetUser: "Target",
      desiredOutcome: "Outcome",
      problemType: "assessment",
      journey: ["Context", "Outcome"],
      knowledgeRequirements: [],
      componentRequirements: [],
      aiRequirements: [],
      expectedOutput: ["Summary"],
      actionPlan: ["Act"],
      nextStep: "outcome",
    },
    workflow: [
      {
        id: "context",
        type: "INPUT",
        title: "Context",
        description: "Collect context",
        inputs: [],
        outputs: ["context.company"],
        dependencies: [],
        nextStep: "outcome",
        configuration: {
          compilerReady: {
            operation: {
              type: "collect-context",
              fields: [{
                key: "context.company",
                label: "Company",
                type: "string",
                required: true,
              }],
              sessionPersistence: "customer_session",
            },
          },
        },
      },
      {
        id: "outcome",
        type: "OUTCOME",
        title: "Outcome",
        description: "Show outcome",
        inputs: ["context.company"],
        outputs: [],
        dependencies: ["context"],
        nextStep: "",
        configuration: {
          canonical: {
            next: { type: "complete" },
          },
          compilerReady: {
            operation: {
              type: "outcome",
              outcomeId: "outcome",
              outputRefs: ["context.company"],
            },
          },
        },
      },
    ],
    components: [],
    rules: [],
    providers: [],
  };
}

function validatedSource(source: PstCanonicalSourceV1) {
  const normalized = manufacturingIrFromCanonicalSource(source);
  assert.equal(normalized.ok, true);
  if (!normalized.ok) throw new Error("Fixture must normalize.");
  const validation = validateCanonicalSource(source);
  assert.equal(
    validation.status,
    "VALIDATED",
    validation.status === "BLOCKED"
      ? JSON.stringify(validation.diagnostics, null, 2)
      : undefined,
  );
  if (validation.status !== "VALIDATED") throw new Error("Fixture must validate.");
  return { source, ir: normalized.value, validation };
}

function validatedFixture() {
  return validatedSource(validSource());
}

function refreshReadyIntegrity(readyIr: PstCompilerReadyIrV1) {
  const { integrity, ...payload } = readyIr;
  integrity.hash = pstCanonicalJsonHash(payload);
}

test("Compiler-Ready IR binds typed operations to the exact validated IR", () => {
  const result = prepareCompilerReadyIr(validatedFixture());
  assert.equal(result.status, "READY");
  if (result.status !== "READY") return;
  assert.equal(result.readyIr.identity.slug, "example-pst");
  assert.equal(result.readyIr.product.name, "Example PST");
  assert.equal(result.readyIr.state.sessionPersistence, "customer_session");
  assert.deepEqual(
    result.readyIr.steps.map(({ operation }) => operation.type),
    ["collect-context", "outcome"],
  );
  assert.deepEqual(result.readyIr.outcomeStepIds, ["outcome"]);
});

test("Compiler-Ready IR rejects a validation proof for a changed IR", () => {
  const { source, ir, validation } = validatedFixture();
  ir.product.problem = "Changed after validation";

  const result = prepareCompilerReadyIr({ source, ir, validation });
  assert.equal(result.status, "BLOCKED");
  if (result.status !== "BLOCKED") return;
  assert.equal(
    result.errors.some(({ code }) => code === "INVALID_VALIDATION_PROOF"),
    true,
  );
});

test("Compiler-Ready IR rejects opaque workflow configuration", () => {
  const { source, ir, validation } = validatedFixture();
  source.workflow[0]!.configuration = { arbitrary: "value" };

  const result = prepareCompilerReadyIr({ source, ir, validation });
  assert.equal(result.status, "BLOCKED");
  if (result.status !== "BLOCKED") return;
  assert.equal(result.errors.some(({ code }) => code === "MISSING_OPERATION"), true);
});

test("Compiler-Ready IR rejects Canonical Source changed after validation", () => {
  const { source, ir, validation } = validatedFixture();
  source.project.name = "Changed after validation";

  const result = prepareCompilerReadyIr({ source, ir, validation });
  assert.equal(result.status, "BLOCKED");
  if (result.status !== "BLOCKED") return;
  assert.equal(
    result.errors.some(({ code, path }) =>
      code === "INVALID_VALIDATION_PROOF" && path === "validation.subject.source"),
    true,
  );
});

test("Compiler-Ready IR requires operation-specific component capability", () => {
  const source = validSource();
  source.workflow[0]!.type = "ANSWER";
  source.workflow[0]!.outputs = ["answers.response"];
  source.workflow[0]!.configuration = {
    compilerReady: {
      operation: {
        type: "collect-answers",
        schemaRef: "component-1",
        answerFields: ["answers.response"],
      },
    },
  };
  source.workflow[1]!.inputs = ["answers.response"];
  source.workflow[1]!.configuration = {
    canonical: { next: { type: "complete" } },
    compilerReady: {
      operation: {
        type: "outcome",
        outcomeId: "outcome",
        outputRefs: ["answers.response"],
      },
    },
  };
  source.components = [{
    id: "component-1",
    assetId: "asset-1",
    name: "Wrong capability",
    type: "ACTION",
    source: "Library",
    version: "1.0.0",
    status: "READY",
    required: true,
    configuration: {
      compilerReady: {
        capability: "action-template",
        definition: { items: [] },
      },
    },
  }];
  const fixture = validatedSource(source);

  const result = prepareCompilerReadyIr(fixture);
  assert.equal(result.status, "BLOCKED");
  if (result.status !== "BLOCKED") return;
  assert.equal(
    result.errors.some(({ code, message }) =>
      code === "UNRESOLVED_REFERENCE" && message.includes("question-schema")),
    true,
  );
});

test("Compiler-Ready IR rejects complete transition outside OUTCOME", () => {
  const source = validSource();
  source.workflow = [
    {
      id: "context",
      type: "INPUT",
      title: "Context",
      description: "Collect context",
      inputs: [],
      outputs: ["context.company"],
      dependencies: [],
      nextStep: "action",
      configuration: {
        canonical: {
          next: {
            type: "conditional",
            branches: [{ when: { ruleId: "rule-1" }, target: "action" }],
            defaultTarget: "outcome",
          },
        },
        compilerReady: {
          operation: {
            type: "collect-context",
            fields: [{
              key: "context.company",
              label: "Company",
              type: "string",
              required: true,
            }],
            sessionPersistence: "customer_session",
          },
          next: {
            type: "conditional",
            branches: [{ whenRuleId: "rule-1", stepId: "action" }],
            defaultStepId: "outcome",
          },
        },
      },
    },
    {
      id: "action",
      type: "ACTION",
      title: "Action",
      description: "Prepare action",
      inputs: ["context.company"],
      outputs: ["derived.action"],
      dependencies: ["context"],
      nextStep: "",
      configuration: {
        canonical: { next: { type: "complete" } },
        compilerReady: {
          operation: {
            type: "action",
            actionRef: "component-action",
            output: "derived.action",
          },
        },
      },
    },
    {
      id: "outcome",
      type: "OUTCOME",
      title: "Outcome",
      description: "Show outcome",
      inputs: ["context.company"],
      outputs: [],
      dependencies: ["context"],
      nextStep: "",
      configuration: {
        canonical: { next: { type: "complete" } },
        compilerReady: {
          operation: {
            type: "outcome",
            outcomeId: "outcome",
            outputRefs: ["context.company"],
          },
        },
      },
    },
  ];
  source.components = [{
    id: "component-action",
    assetId: "asset-action",
    name: "Action template",
    type: "ACTION",
    source: "Library",
    version: "1.0.0",
    status: "READY",
    required: true,
    configuration: {
      compilerReady: {
        capability: "action-template",
        definition: { items: [] },
      },
    },
  }];
  source.rules = [{
    id: "rule-1",
    version: "1.0.0",
    name: "Action route",
    kind: "RULE",
    when: {},
    then: [],
  }];
  const fixture = validatedSource(source);

  const result = prepareCompilerReadyIr(fixture);
  assert.equal(result.status, "BLOCKED");
  if (result.status !== "BLOCKED") return;
  assert.equal(
    result.errors.some(({ code, path }) =>
      code === "INVALID_TRANSITION" && path === "graph.nodes[1].next"),
    true,
  );
});

test("Compiler-Ready IR rejects unknown nested operation fields", () => {
  const source = validSource();
  const compilerReady = source.workflow[0]!.configuration.compilerReady as Record<string, unknown>;
  const operation = compilerReady.operation as Record<string, unknown>;
  operation.privatePayload = "must-not-pass";
  const fixture = validatedSource(source);

  const result = prepareCompilerReadyIr(fixture);
  assert.equal(result.status, "BLOCKED");
  if (result.status !== "BLOCKED") return;
  assert.equal(
    result.errors.some(({ code, path }) =>
      code === "INVALID_OPERATION" && path === "graph.nodes[0].operation"),
    true,
  );
});

test("Compiler-Ready IR rejects unknown nested component fields", () => {
  const source = validSource();
  source.workflow[0]!.type = "ANSWER";
  source.workflow[0]!.outputs = ["answers.response"];
  source.workflow[0]!.configuration = {
    compilerReady: {
      operation: {
        type: "collect-answers",
        schemaRef: "component-question",
        answerFields: ["answers.response"],
      },
    },
  };
  source.workflow[1]!.inputs = ["answers.response"];
  source.workflow[1]!.configuration = {
    canonical: { next: { type: "complete" } },
    compilerReady: {
      operation: {
        type: "outcome",
        outcomeId: "outcome",
        outputRefs: ["answers.response"],
      },
    },
  };
  source.components = [{
    id: "component-question",
    assetId: "asset-question",
    name: "Question schema",
    type: "INPUT",
    source: "Library",
    version: "1.0.0",
    status: "READY",
    required: true,
    configuration: {
      compilerReady: {
        capability: "question-schema",
        definition: {
          questions: [{
            id: "question-1",
            label: "Question",
            type: "string",
            required: true,
            privatePayload: "must-not-pass",
          }],
        },
      },
    },
  }];
  const fixture = validatedSource(source);

  const result = prepareCompilerReadyIr(fixture);
  assert.equal(result.status, "BLOCKED");
  if (result.status !== "BLOCKED") return;
  assert.equal(
    result.errors.some(({ code, path }) =>
      code === "INVALID_OPERATION"
      && path === "declarations.components[0].configuration.compilerReady.definition"),
    true,
  );
});

test("Compiler-Ready IR rejects unknown nested transition fields", () => {
  const source = validSource();
  source.workflow[0]!.configuration = {
    canonical: {
      next: {
        type: "conditional",
        branches: [{ when: { ruleId: "rule-1" }, target: "outcome" }],
        defaultTarget: "outcome",
      },
    },
    compilerReady: {
      operation: {
        type: "collect-context",
        fields: [{
          key: "context.company",
          label: "Company",
          type: "string",
          required: true,
        }],
        sessionPersistence: "customer_session",
      },
      next: {
        type: "conditional",
        branches: [{
          whenRuleId: "rule-1",
          stepId: "outcome",
          privatePayload: "must-not-pass",
        }],
        defaultStepId: "outcome",
      },
    },
  };
  source.rules = [{
    id: "rule-1",
    version: "1.0.0",
    name: "Outcome route",
    kind: "RULE",
    when: {},
    then: [],
  }];
  const fixture = validatedSource(source);

  const result = prepareCompilerReadyIr(fixture);
  assert.equal(result.status, "BLOCKED");
  if (result.status !== "BLOCKED") return;
  assert.equal(
    result.errors.some(({ code, path }) =>
      code === "INVALID_TRANSITION" && path === "graph.nodes[0].next"),
    true,
  );
});

test("Compiler v1 deterministically projects Compiler-Ready IR", () => {
  const prepared = prepareCompilerReadyIr(validatedFixture());
  assert.equal(prepared.status, "READY");
  if (prepared.status !== "READY") return;
  const input = {
    compilerVersion: pstCompilerVersion,
    readyIr: prepared.readyIr,
  };
  const first = compilePstV1(input);
  const second = compilePstV1(input);
  assert.equal(first.status, "COMPILED");
  assert.deepEqual(first, second);
  if (first.status !== "COMPILED") return;
  assert.equal(first.definition.runtimeVersion, "pst-runtime.v1");
  assert.equal(first.definition.compiler.version, "pst-compiler.v1");
  assert.deepEqual(
    first.definition.steps.map(({ operation }) => operation.type),
    ["collect-context", "outcome"],
  );
});

test("Compiler v1 blocks unsupported versions and invalid references", () => {
  const prepared = prepareCompilerReadyIr(validatedFixture());
  assert.equal(prepared.status, "READY");
  if (prepared.status !== "READY") return;
  prepared.readyIr.entryStepId = "missing";
  refreshReadyIntegrity(prepared.readyIr);

  const result = compilePstV1({
    compilerVersion: "pst-compiler.future",
    readyIr: prepared.readyIr,
  });
  assert.equal(result.status, "BLOCKED");
  if (result.status !== "BLOCKED") return;
  assert.equal(result.errors.some(({ code }) => code === "UNSUPPORTED_VERSION"), true);
  assert.equal(result.errors.some(({ code }) => code === "INVALID_REFERENCE"), true);
});

test("Compiler v1 output is detached from mutable input objects", () => {
  const prepared = prepareCompilerReadyIr(validatedFixture());
  assert.equal(prepared.status, "READY");
  if (prepared.status !== "READY") return;
  const result = compilePstV1({
    compilerVersion: pstCompilerVersion,
    readyIr: prepared.readyIr,
  });
  assert.equal(result.status, "COMPILED");
  if (result.status !== "COMPILED") return;
  prepared.readyIr.product.name = "Mutated";
  assert.equal(result.definition.product.name, "Example PST");
});

test("Compiler v1 blocks a forged nested operation after preparation", () => {
  const prepared = prepareCompilerReadyIr(validatedFixture());
  assert.equal(prepared.status, "READY");
  if (prepared.status !== "READY") return;
  const operation = prepared.readyIr.steps[0]!.operation as unknown as Record<string, unknown>;
  operation.privatePayload = "must-not-pass";
  refreshReadyIntegrity(prepared.readyIr);

  const result = compilePstV1({
    compilerVersion: pstCompilerVersion,
    readyIr: prepared.readyIr,
  });
  assert.equal(result.status, "BLOCKED");
  if (result.status !== "BLOCKED") return;
  assert.equal(
    result.errors.some(({ code }) => code === "INVALID_COMPILER_INPUT"),
    true,
  );
});

test("Compiler v1 blocks forged declarations and incomplete outcome IDs", () => {
  const prepared = prepareCompilerReadyIr(validatedFixture());
  assert.equal(prepared.status, "READY");
  if (prepared.status !== "READY") return;
  prepared.readyIr.declarations.components.push({
    id: "forged",
    assetId: "forged",
    name: "Forged",
    version: "1",
    capability: "action-template",
    definition: {
      items: [{
        id: "item",
        title: "Item",
        description: "Item",
        privatePayload: "must-not-pass",
      }],
    },
  } as never);
  prepared.readyIr.outcomeStepIds = [];
  refreshReadyIntegrity(prepared.readyIr);

  const result = compilePstV1({
    compilerVersion: pstCompilerVersion,
    readyIr: prepared.readyIr,
  });
  assert.equal(result.status, "BLOCKED");
  if (result.status !== "BLOCKED") return;
  assert.equal(
    result.errors.some(({ code }) => code === "INVALID_COMPILER_INPUT"),
    true,
  );
});

test("Compiler v1 blocks stale Compiler-Ready integrity", () => {
  const prepared = prepareCompilerReadyIr(validatedFixture());
  assert.equal(prepared.status, "READY");
  if (prepared.status !== "READY") return;
  prepared.readyIr.product.name = "Changed after preparation";

  const result = compilePstV1({
    compilerVersion: pstCompilerVersion,
    readyIr: prepared.readyIr,
  });
  assert.equal(result.status, "BLOCKED");
  if (result.status !== "BLOCKED") return;
  assert.equal(
    result.errors.some(({ code }) => code === "INVALID_READY_INTEGRITY"),
    true,
  );
});

test("Compiler v1 blocks malformed runtime input without throwing", () => {
  const result = compilePstV1({
    compilerVersion: pstCompilerVersion,
    readyIr: null,
  } as never);
  assert.equal(result.status, "BLOCKED");
  if (result.status !== "BLOCKED") return;
  assert.equal(
    result.errors.some(({ code }) => code === "INVALID_COMPILER_INPUT"),
    true,
  );
});

test("Compiler v1 blocks forged and malformed executable rules", () => {
  const prepared = prepareCompilerReadyIr(validatedFixture());
  assert.equal(prepared.status, "READY");
  if (prepared.status !== "READY") return;
  prepared.readyIr.declarations.rules.push({
    id: "forged-rule",
    version: "1.0.0",
    name: "Forged",
    kind: "RULE",
    when: {},
    then: [],
    privatePayload: "must-not-pass",
  } as never);
  prepared.readyIr.declarations.rules.push({
    id: "",
    version: "",
    name: "",
    kind: "RULE",
    when: { all: "not-an-array" },
    then: [],
  } as never);
  refreshReadyIntegrity(prepared.readyIr);

  const result = compilePstV1({
    compilerVersion: pstCompilerVersion,
    readyIr: prepared.readyIr,
  });
  assert.equal(result.status, "BLOCKED");
  if (result.status !== "BLOCKED") return;
  assert.equal(
    result.errors.some(({ code, path }) =>
      code === "INVALID_COMPILER_INPUT" && path === "readyIr.declarations"),
    true,
  );
});

test("Compiler v1 blocks incomplete or extended identity and product envelopes", () => {
  const prepared = prepareCompilerReadyIr(validatedFixture());
  assert.equal(prepared.status, "READY");
  if (prepared.status !== "READY") return;
  prepared.readyIr.identity.releaseId = "";
  (prepared.readyIr.identity as unknown as Record<string, unknown>).privatePayload =
    "must-not-pass";
  prepared.readyIr.product.name = "";
  (prepared.readyIr.product as unknown as Record<string, unknown>).privatePayload =
    "must-not-pass";
  refreshReadyIntegrity(prepared.readyIr);

  const result = compilePstV1({
    compilerVersion: pstCompilerVersion,
    readyIr: prepared.readyIr,
  });
  assert.equal(result.status, "BLOCKED");
  if (result.status !== "BLOCKED") return;
  assert.equal(result.errors.some(({ path }) => path === "readyIr.identity"), true);
  assert.equal(result.errors.some(({ path }) => path === "readyIr.product"), true);
});

test("Compiler v1 blocks forged rule effect references", () => {
  const prepared = prepareCompilerReadyIr(validatedFixture());
  assert.equal(prepared.status, "READY");
  if (prepared.status !== "READY") return;
  prepared.readyIr.declarations.rules.push({
    id: "forged-effects",
    version: "1.0.0",
    name: "Forged effects",
    kind: "RULE",
    when: {},
    then: [
      { type: "add-score", scaleRef: "missing-scale", value: 1 },
      { type: "goto", stepId: "missing-step" },
      { type: "set", field: "derived.undeclared", value: true },
    ],
  });
  refreshReadyIntegrity(prepared.readyIr);

  const result = compilePstV1({
    compilerVersion: pstCompilerVersion,
    readyIr: prepared.readyIr,
  });
  assert.equal(result.status, "BLOCKED");
  if (result.status !== "BLOCKED") return;
  assert.equal(
    result.errors.filter(({ code }) => code === "INVALID_REFERENCE").length,
    3,
  );
});

test("Compiler v1 blocks ambiguous declaration identities", () => {
  const prepared = prepareCompilerReadyIr(validatedFixture());
  assert.equal(prepared.status, "READY");
  if (prepared.status !== "READY") return;
  const component = {
    id: "duplicate-component",
    assetId: "duplicate-asset",
    name: "Duplicate",
    version: "1.0.0",
    capability: "action-template" as const,
    definition: { items: [] },
  };
  prepared.readyIr.declarations.components.push(
    component,
    { ...component, assetId: "duplicate-asset-2" },
  );
  const rule = {
    id: "duplicate-rule",
    version: "1.0.0",
    name: "Duplicate",
    kind: "RULE" as const,
    when: {},
    then: [],
  };
  prepared.readyIr.declarations.rules.push(rule, { ...rule });
  const provider = {
    id: "duplicate-provider",
    capability: "analysis",
    mode: "assistive" as const,
  };
  prepared.readyIr.declarations.providers.push(provider, { ...provider });
  refreshReadyIntegrity(prepared.readyIr);

  const result = compilePstV1({
    compilerVersion: pstCompilerVersion,
    readyIr: prepared.readyIr,
  });
  assert.equal(result.status, "BLOCKED");
  if (result.status !== "BLOCKED") return;
  assert.equal(
    result.errors.some(({ path }) => path.includes("components[1]")),
    true,
  );
  assert.equal(result.errors.some(({ path }) => path.includes("rules[1]")), true);
  assert.equal(result.errors.some(({ path }) => path.includes("providers[1]")), true);
});