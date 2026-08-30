import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalSourceFromRelease,
  compilePstV1,
  manufacturingIrFromCanonicalSource,
  prepareCompilerReadyIr,
  pstCanonicalJsonHash,
  pstCompilerVersion,
  runPstRuntime,
  validateCanonicalSource,
  type PstReleaseSnapshot,
  type PstReleaseRuleSnapshot,
  type WorkflowStep,
} from "@workspace/db/schema";

type ThreePstFixture = {
  key: "cashflow" | "decision" | "compliance";
  name: string;
  desiredOutcome: string;
  problem: string;
  journey: string[];
  expectedOutput: string[];
  steps: WorkflowStep[];
  components: PstReleaseSnapshot["components"];
  rules: PstReleaseRuleSnapshot[];
  providers: PstReleaseSnapshot["providers"];
};

function step({
  id,
  type,
  title,
  description,
  inputs = [],
  outputs = [],
  dependencies = [],
  operation,
  next,
}: {
  id: string;
  type: string;
  title: string;
  description: string;
  inputs?: string[];
  outputs?: string[];
  dependencies?: string[];
  operation: Record<string, unknown>;
  next:
    | { type: "step"; target: string }
    | { type: "conditional"; branches: Array<{ whenRuleId: string; stepId: string }>; defaultStepId: string }
    | { type: "complete"; outcomeId: string };
}): WorkflowStep {
  const canonical = next.type === "step"
    ? { next: { type: "step" as const, target: next.target } }
    : next.type === "conditional"
      ? {
          next: {
            type: "conditional" as const,
            branches: next.branches.map(({ whenRuleId, stepId }) => ({
              when: { ruleId: whenRuleId },
              target: stepId,
            })),
            defaultTarget: next.defaultStepId,
          },
        }
      : { next: { type: "complete" as const } };
  const compilerReadyNext = next.type === "conditional"
    ? {
        next: {
          type: "conditional" as const,
          branches: next.branches,
          defaultStepId: next.defaultStepId,
        },
      }
    : {};

  return {
    id,
    type,
    title,
    description,
    inputs,
    outputs,
    dependencies,
    nextStep: next.type === "step"
      ? next.target
      : next.type === "conditional"
        ? next.defaultStepId
        : "",
    configuration: {
      canonical,
      compilerReady: {
        operation,
        ...compilerReadyNext,
      },
    },
  };
}

function component(
  id: string,
  name: string,
  capability: string,
  definition: Record<string, unknown>,
) {
  return {
    id,
    assetId: `asset-${id}`,
    name,
    type: "TOOL",
    source: "Shared Library",
    version: "1.0.0",
    status: "READY",
    required: true,
    configuration: {
      compilerReady: { capability, definition },
    },
  };
}

function provider(id: string, capability: string) {
  return {
    id,
    capability,
    mode: "assistive",
    configuration: {},
  };
}

function commonQuestions(id: string, label: string) {
  return component(id, label, "question-schema", {
    questions: [{
      id: "primary",
      label,
      type: "string",
      required: true,
    }],
  });
}

function commonAction(id: string, label: string) {
  return component(id, label, "action-template", {
    items: [{
      id: "next-action",
      title: "Next action",
      description: label,
    }],
  });
}

function baseSteps(
  key: ThreePstFixture["key"],
  components: ThreePstFixture["components"],
  outcome: string,
  extra: WorkflowStep[],
  actionOptions: { input?: string; dependencies?: string[] } = {},
) {
  const question = components.find(({ id }) => id === `${key}-questions`)!.id;
  const action = components.find(({ id }) => id === `${key}-action`)!.id;
  const prefix: WorkflowStep[] = [
    step({
      id: "context",
      type: "INPUT",
      title: "Context",
      description: "Collect customer context.",
      outputs: ["context.organization"],
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
      next: { type: "step", target: "answers" },
    }),
    step({
      id: "answers",
      type: "ANSWER",
      title: "Answers",
      description: "Collect the configuration-specific input.",
      inputs: ["context.organization"],
      outputs: ["answers.primary"],
      dependencies: ["context"],
      operation: {
        type: "collect-answers",
        schemaRef: question,
        answerFields: ["answers.primary"],
      },
      next: { type: "step", target: extra[0]!.id },
    }),
  ];
  const last = extra[extra.length - 1]!;
  return [
    ...prefix,
    ...extra,
    step({
      id: "action",
      type: "ACTION",
      title: "Action",
      description: "Produce the configured next action.",
      inputs: [actionOptions.input ?? last.outputs[0]!],
      outputs: ["derived.action"],
      dependencies: actionOptions.dependencies ?? [last.id],
      operation: {
        type: "action",
        actionRef: action,
        output: "derived.action",
      },
      next: { type: "step", target: "outcome" },
    }),
    step({
      id: "outcome",
      type: "OUTCOME",
      title: "Outcome",
      description: outcome,
      inputs: ["derived.action"],
      dependencies: ["action"],
      operation: {
        type: "outcome",
        outcomeId: "outcome",
        outputRefs: ["derived.action"],
      },
      next: { type: "complete", outcomeId: "outcome" },
    }),
  ];
}

function fixtureFor(key: ThreePstFixture["key"]): ThreePstFixture {
  const names = {
    cashflow: {
      name: "Cashflow Health Check",
      problem: "Owners need to understand whether cashflow is healthy.",
      desiredOutcome: "Receive a cashflow health diagnosis.",
      journey: ["Context", "Answers", "Scoring", "Analysis", "Action"],
      expectedOutput: ["Cashflow score", "Corrective action"],
    },
    decision: {
      name: "Decision Readiness",
      problem: "Operations leads need to choose between vendors.",
      desiredOutcome: "Receive a justified vendor decision.",
      journey: ["Context", "Answers", "Scoring", "Recommendation", "Action"],
      expectedOutput: ["Decision score", "Selected vendor", "Next action"],
    },
    compliance: {
      name: "Document Compliance",
      problem: "Teams need to identify document compliance gaps.",
      desiredOutcome: "Receive a compliance status and remediation action.",
      journey: ["Context", "Answers", "Rules", "Analysis", "Action"],
      expectedOutput: ["Compliance status", "Remediation action"],
    },
  }[key];
  const questions = commonQuestions(`${key}-questions`, `${names.name} input`);
  const scoring = component(`${key}-scoring`, `${names.name} scoring`, "scoring-scale", {
    minimum: 0,
    maximum: 100,
    bands: [{ minimum: 0, label: "Needs attention" }],
  });
  const analysis = component(`${key}-analysis`, `${names.name} analysis`, "analysis-template", {
    template: `Interpret ${key} signals.`,
    outputFields: ["derived.analysis"],
  });
  const recommendation = component(
    `${key}-recommendation`,
    `${names.name} recommendation`,
    "recommendation-strategy",
    { template: `Recommend a ${key} next step.`, outputFields: ["derived.recommendation"] },
  );
  const action = commonAction(`${key}-action`, `${names.name} action plan`);
  const components = key === "cashflow"
    ? [questions, scoring, analysis, action]
    : key === "decision"
      ? [questions, scoring, recommendation, action]
      : [questions, analysis, action];
  const providers = key === "decision"
    ? [provider(`${key}-recommendation-provider`, "recommendation")]
    : [provider(`${key}-analysis-provider`, "analysis")];
  const rules: PstReleaseRuleSnapshot[] = [];

  if (key === "cashflow") {
    return {
      key,
      ...names,
      components,
      providers,
      rules,
      steps: baseSteps(key, components, names.desiredOutcome, [
        step({
          id: "scoring",
          type: "SCORING",
          title: "Scoring",
          description: "Score cashflow signals.",
          inputs: ["answers.primary"],
          outputs: ["derived.score"],
          dependencies: ["answers"],
          operation: { type: "score", scaleRef: scoring.id, output: "derived.score" },
          next: { type: "step", target: "analysis" },
        }),
        step({
          id: "analysis",
          type: "ANALYSIS",
          title: "Analysis",
          description: "Explain the cashflow score.",
          inputs: ["derived.score"],
          outputs: ["derived.analysis"],
          dependencies: ["scoring"],
          operation: {
            type: "analyze",
            templateRef: analysis.id,
            output: "derived.analysis",
            providerId: providers[0]!.id,
          },
          next: { type: "step", target: "persist-analysis" },
        }),
        step({
          id: "persist-analysis",
          type: "PERSIST",
          title: "Persist analysis",
          description: "Retain the configured analysis in the customer session.",
          inputs: ["derived.analysis"],
          dependencies: ["analysis"],
          operation: {
            type: "persist",
            target: "derived.analysis",
            retention: "customer_session",
          },
          next: { type: "step", target: "action" },
        }),
      ], { input: "derived.analysis", dependencies: ["persist-analysis"] }),
    };
  }

  if (key === "decision") {
    return {
      key,
      ...names,
      components,
      providers,
      rules,
      steps: baseSteps(key, components, names.desiredOutcome, [
        step({
          id: "scoring",
          type: "SCORING",
          title: "Scoring",
          description: "Score vendor criteria.",
          inputs: ["answers.primary"],
          outputs: ["derived.score"],
          dependencies: ["answers"],
          operation: { type: "score", scaleRef: scoring.id, output: "derived.score" },
          next: { type: "step", target: "recommendation" },
        }),
        step({
          id: "recommendation",
          type: "RECOMMENDATION",
          title: "Recommendation",
          description: "Recommend the best vendor fit.",
          inputs: ["derived.score"],
          outputs: ["derived.recommendation"],
          dependencies: ["scoring"],
          operation: {
            type: "recommend",
            strategyRef: recommendation.id,
            output: "derived.recommendation",
            providerId: providers[0]!.id,
          },
          next: { type: "step", target: "action" },
        }),
      ]),
    };
  }

  const ruleId = "compliance-document-complete";
  rules.push({
    id: ruleId,
    version: "1.0.0",
    name: "Document completeness",
    kind: "RULE",
    when: {
      all: [{
        field: "answers.primary",
        operator: "equals",
        value: "complete",
      }],
    },
    then: [{ type: "set", field: "derived.complianceFlag", value: true }],
  });
  return {
    key,
    ...names,
    components,
    providers,
    rules,
    steps: baseSteps(key, components, names.desiredOutcome, [
      step({
        id: "rules",
        type: "RULES",
        title: "Rules",
        description: "Evaluate document compliance rules.",
        inputs: ["answers.primary"],
        outputs: ["derived.complianceFlag"],
        dependencies: ["answers"],
        operation: { type: "evaluate-rules", ruleIds: [ruleId] },
        next: {
          type: "conditional",
          branches: [{ whenRuleId: ruleId, stepId: "action" }],
          defaultStepId: "analysis",
        },
      }),
      step({
        id: "analysis",
        type: "ANALYSIS",
        title: "Analysis",
        description: "Explain compliance gaps.",
        inputs: ["derived.complianceFlag"],
        outputs: ["derived.analysis"],
        dependencies: ["rules"],
        operation: {
          type: "analyze",
          templateRef: analysis.id,
          output: "derived.analysis",
          providerId: providers[0]!.id,
        },
        next: { type: "step", target: "action" },
      }),
    ], { input: "derived.complianceFlag", dependencies: ["rules"] }),
  };
}

function snapshotFor(fixture: ThreePstFixture): {
  release: {
    releaseId: string;
    projectId: string;
    slug: string;
    version: string;
    publishedAt: string;
  };
  snapshot: PstReleaseSnapshot;
} {
  const projectId = `${fixture.key}-proof`;
  const workflow = fixture.steps;
  const payload: Omit<PstReleaseSnapshot, "snapshotHash"> = {
    sourceSchemaVersion: "pst-release-snapshot.v1",
    snapshotHashAlgorithm: "sha256-canonical-json.v1",
    project: {
      name: fixture.name,
      description: `${fixture.name} immutable proof fixture`,
      status: "PUBLISHED",
      version: "v1.0",
      domain: "Business",
      family: "Problem Solving",
      series: "Three PST Proof",
      problemStatement: fixture.problem,
      targetUser: "Operator",
      desiredOutcome: fixture.desiredOutcome,
      productDna: {
        problem: fixture.problem,
        user: "Operator",
        journey: fixture.journey,
        components: fixture.components.map(({ name }) => name),
        intelligence: "Declarative configuration",
        outcome: fixture.desiredOutcome,
      },
      qaStatus: "PASS",
      publicationStatus: "PUBLISHED",
    },
    blueprint: {
      id: `blueprint-${projectId}`,
      projectId,
      problem: fixture.problem,
      targetUser: "Operator",
      desiredOutcome: fixture.desiredOutcome,
      problemType: "Structured evaluation",
      journey: fixture.journey,
      knowledgeRequirements: ["Shared domain guidance"],
      componentRequirements: fixture.components.map(({ name }) => name),
      aiRequirements: [],
      workflow,
      expectedOutput: fixture.expectedOutput,
      actionPlan: ["Review the result", "Take the next action"],
      nextStep: "Publish",
      version: "v1.0",
      updatedAt: "2026-08-29T00:00:00.000Z",
    },
    workflow,
    pattern: {
      id: `pattern-${fixture.key}`,
      name: `${fixture.name} pattern`,
      version: "1.0.0",
      description: "Configuration-specific journey pattern.",
      steps: fixture.journey,
    },
    recipe: {
      id: `recipe-${fixture.key}`,
      name: `${fixture.name} recipe`,
      version: "1.0.0",
      description: "Configuration-specific component recipe.",
      components: fixture.components.map(({ name }) => name),
    },
    components: fixture.components,
    rules: fixture.rules,
    providers: fixture.providers,
  };
  return {
    release: {
      releaseId: `release-${projectId}`,
      projectId,
      slug: fixture.key,
      version: "v1.0",
      publishedAt: "2026-08-29T00:00:00.000Z",
    },
    snapshot: {
      ...payload,
      snapshotHash: pstCanonicalJsonHash(payload),
    },
  };
}

function compileFixture(fixture: ThreePstFixture) {
  const { release, snapshot } = snapshotFor(fixture);
  const source = canonicalSourceFromRelease(release, snapshot);
  if (!source.ok) throw new Error(JSON.stringify(source.errors));
  assert.equal(source.ok, true, `${fixture.key} snapshot must normalize`);

  const normalized = manufacturingIrFromCanonicalSource(source.value);
  if (!normalized.ok) throw new Error(JSON.stringify(normalized.errors));
  assert.equal(normalized.ok, true, `${fixture.key} source must normalize to IR`);

  const validation = validateCanonicalSource(source.value);
  if (validation.status !== "VALIDATED") {
    throw new Error(JSON.stringify(validation.diagnostics));
  }
  assert.equal(validation.status, "VALIDATED", `${fixture.key} source must validate`);

  const ready = prepareCompilerReadyIr({
    source: source.value,
    ir: normalized.value,
    validation,
  });
  if (ready.status !== "READY") throw new Error(JSON.stringify(ready.errors));
  assert.equal(ready.status, "READY", `${fixture.key} source must prepare`);

  const compiled = compilePstV1({
    compilerVersion: pstCompilerVersion,
    readyIr: ready.readyIr,
  });
  if (compiled.status !== "COMPILED") throw new Error(JSON.stringify(compiled.errors));
  assert.equal(compiled.status, "COMPILED", `${fixture.key} source must compile`);

  return {
    source: source.value,
    ir: normalized.value,
    validation,
    ready: ready.readyIr,
    definition: compiled.definition,
  };
}

test("one shared pipeline and Compiler produce three distinct executable PSTs", () => {
  const compiled = (["cashflow", "decision", "compliance"] as const).map((key) =>
    compileFixture(fixtureFor(key)));

  assert.deepEqual(
    compiled.map(({ validation }) => validation.status),
    ["VALIDATED", "VALIDATED", "VALIDATED"],
  );
  assert.deepEqual(
    compiled.map(({ ready }) => ready.readyVersion),
    ["pst-compiler-ready-ir.v1", "pst-compiler-ready-ir.v1", "pst-compiler-ready-ir.v1"],
  );
  assert.deepEqual(
    compiled.map(({ definition }) => definition.compiler),
    [
      { name: "pst-compiler", version: pstCompilerVersion },
      { name: "pst-compiler", version: pstCompilerVersion },
      { name: "pst-compiler", version: pstCompilerVersion },
    ],
  );
  assert.deepEqual(
    compiled.map(({ definition }) => definition.identity.slug),
    ["cashflow", "decision", "compliance"],
  );
  assert.deepEqual(
    compiled.map(({ definition }) => definition.product.name),
    ["Cashflow Health Check", "Decision Readiness", "Document Compliance"],
  );
  assert.notDeepEqual(
    compiled[0]!.definition.steps.map(({ operation }) => operation.type),
    compiled[1]!.definition.steps.map(({ operation }) => operation.type),
  );
  assert.notDeepEqual(
    compiled[1]!.definition.steps.map(({ operation }) => operation.type),
    compiled[2]!.definition.steps.map(({ operation }) => operation.type),
  );
  assert.notDeepEqual(
    compiled[0]!.definition.declarations.components.map(({ capability }) => capability),
    compiled[2]!.definition.declarations.components.map(({ capability }) => capability),
  );
  assert.deepEqual(
    compiled.map(({ definition }) => definition.outcomeStepIds),
    [["outcome"], ["outcome"], ["outcome"]],
  );
  assert.deepEqual(
    compiled.map(({ definition }) => definition.product.desiredOutcome),
    [
      "Receive a cashflow health diagnosis.",
      "Receive a justified vendor decision.",
      "Receive a compliance status and remediation action.",
    ],
  );

  const compilerSource = compilePstV1.toString();
  for (const productName of ["Cashflow", "Decision", "Compliance"]) {
    assert.equal(
      compilerSource.includes(productName),
      false,
      `Compiler must not contain a ${productName} product branch`,
    );
  }
});

test("one generic Runtime executes the three compiled PST definitions", () => {
  const cases = [
    {
      key: "cashflow",
      answer: "cashflow evidence",
      visited: ["context", "answers", "scoring", "analysis", "persist-analysis", "action", "outcome"],
    },
    {
      key: "decision",
      answer: "vendor evidence",
      visited: ["context", "answers", "scoring", "recommendation", "action", "outcome"],
    },
    {
      key: "compliance",
      answer: "complete",
      visited: ["context", "answers", "rules", "action", "outcome"],
    },
  ] as const;

  const completed = cases.map(({ key, answer, visited }) => {
    const definition = compileFixture(fixtureFor(key)).definition;
    const inputs = [
      { "context.organization": "Acme" },
      { "answers.primary": answer },
    ];
    const first = runPstRuntime(definition, inputs);
    const replay = runPstRuntime(definition, inputs);

    assert.equal(first.status, "COMPLETED", `${key} compiled journey must complete`);
    assert.deepEqual(replay, first, `${key} runtime replay must be deterministic`);
    if (first.status !== "COMPLETED") return first;

    assert.equal(first.outcomeId, "outcome");
    assert.deepEqual(first.session.visitedStepIds, visited);
    assert.deepEqual(first.session.events, ["outcome:outcome"]);
    assert.deepEqual(first.output, {
      "derived.action": first.session.state.derived.action,
    });
    return first;
  });

  const [cashflow, decision, compliance] = completed;
  assert.equal(cashflow.status, "COMPLETED");
  assert.equal(decision.status, "COMPLETED");
  assert.equal(compliance.status, "COMPLETED");
  if (cashflow.status !== "COMPLETED"
    || decision.status !== "COMPLETED"
    || compliance.status !== "COMPLETED") return;

  assert.equal(cashflow.session.scores["cashflow-scoring"], "cashflow evidence".length);
  assert.deepEqual(cashflow.session.state.derived.analysis, {
    template: "Interpret cashflow signals.",
    inputs: ["cashflow evidence".length],
  });
  assert.deepEqual(cashflow.session.state.derived.action, {
    items: [{
      id: "next-action",
      title: "Next action",
      description: "Cashflow Health Check action plan",
    }],
    basedOn: [cashflow.session.state.derived.analysis],
  });

  assert.equal(decision.session.scores["decision-scoring"], "vendor evidence".length);
  assert.deepEqual(decision.session.state.derived.recommendation, {
    template: "Recommend a decision next step.",
    inputs: ["vendor evidence".length],
  });
  assert.deepEqual(decision.session.state.derived.action, {
    items: [{
      id: "next-action",
      title: "Next action",
      description: "Decision Readiness action plan",
    }],
    basedOn: [decision.session.state.derived.recommendation],
  });

  assert.equal(compliance.session.evaluatedRules["compliance-document-complete"], true);
  assert.equal(compliance.session.state.derived.complianceFlag, true);
  assert.equal(compliance.session.state.derived.analysis, undefined);
  assert.deepEqual(compliance.session.state.derived.action, {
    items: [{
      id: "next-action",
      title: "Next action",
      description: "Document Compliance action plan",
    }],
    basedOn: [true],
  });

  assert.equal(new Set(completed.map((result) =>
    result.status === "COMPLETED" ? JSON.stringify(result.output) : result.status)).size, 3);
});

test("compiled Document Compliance takes the default Runtime branch when its rule does not match", () => {
  const definition = compileFixture(fixtureFor("compliance")).definition;
  const inputs = [
    { "context.organization": "Acme" },
    { "answers.primary": "incomplete" },
  ];
  const result = runPstRuntime(definition, inputs);
  const replay = runPstRuntime(definition, inputs);

  assert.deepEqual(replay, result, "default compliance branch must replay deterministically");
  assert.equal(result.status, "COMPLETED");
  if (result.status !== "COMPLETED") return;

  assert.deepEqual(
    result.session.visitedStepIds,
    ["context", "answers", "rules", "analysis", "action", "outcome"],
  );
  assert.equal(result.session.evaluatedRules["compliance-document-complete"], false);
  assert.equal(result.session.state.derived.complianceFlag, undefined);
  assert.deepEqual(result.session.state.derived.analysis, {
    template: "Interpret compliance signals.",
    inputs: [null],
  });
  assert.deepEqual(result.session.events, ["outcome:outcome"]);
});

test("three-PST executable outputs are deterministic golden projections", () => {
  for (const key of ["cashflow", "decision", "compliance"] as const) {
    const first = compileFixture(fixtureFor(key));
    const second = compileFixture(fixtureFor(key));
    assert.deepEqual(first.definition, second.definition, `${key} output must be deterministic`);
    assert.deepEqual(first.ready, second.ready, `${key} ready artifact must be deterministic`);
  }
});

test("an incomplete three-PST snapshot is blocked before compilation", () => {
  const fixture = fixtureFor("decision");
  const { release, snapshot } = snapshotFor(fixture);
  snapshot.components = snapshot.components.filter(({ id }) => id !== "decision-recommendation");
  snapshot.snapshotHash = pstCanonicalJsonHash({
    ...snapshot,
    snapshotHash: undefined,
  });

  const source = canonicalSourceFromRelease(release, snapshot);
  assert.equal(source.ok, true, "hash-valid incomplete snapshot can normalize");
  if (!source.ok) return;
  const normalized = manufacturingIrFromCanonicalSource(source.value);
  assert.equal(normalized.ok, true);
  if (!normalized.ok) return;
  const validation = validateCanonicalSource(source.value);
  assert.equal(validation.status, "VALIDATED");
  if (validation.status !== "VALIDATED") return;

  const ready = prepareCompilerReadyIr({
    source: source.value,
    ir: normalized.value,
    validation,
  });
  if (ready.status !== "BLOCKED") {
    assert.fail("Incomplete snapshot must be blocked before compilation.");
  }
  assert.equal(
    ready.errors.some(({ code, path }) =>
      code === "UNRESOLVED_REFERENCE" && path.includes("strategyRef")),
    true,
  );
});