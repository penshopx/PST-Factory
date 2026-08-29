import assert from "node:assert/strict";
import test from "node:test";
import {
  type PstManufacturingIrV1,
  type PstCanonicalSourceV1,
  pstManufacturingIrVersion,
  pstCanonicalSourceContractVersion,
  validateCanonicalSource,
  validateManufacturingIr,
} from "@workspace/db/schema";

function validIr(): PstManufacturingIrV1 {
  return {
    irVersion: pstManufacturingIrVersion,
    source: {
      releaseId: "release-1",
      projectId: "project-1",
      releaseVersion: "v1.0",
      snapshotHash: "a".repeat(64),
      sourceSchemaVersion: "pst-release-snapshot.v1",
    },
    product: {
      problem: "A defined problem",
      targetUser: "An operator",
      desiredOutcome: "A useful outcome",
      problemType: "Assessment",
      journey: ["Collect", "Act"],
      expectedOutput: ["Result"],
      actionPlan: ["Take action"],
    },
    declarations: {
      components: [],
      rules: [],
      providers: [],
    },
    graph: {
      entry: "profile",
      nodes: [
        {
          id: "profile",
          kind: "INPUT",
          title: "Profile",
          description: "Collect context.",
          reads: ["context.profile"],
          writes: ["answers.profile"],
          dependsOn: [],
          next: { type: "step", target: "outcome" },
          config: {},
        },
        {
          id: "outcome",
          kind: "OUTCOME",
          title: "Outcome",
          description: "Return a result.",
          reads: ["answers.profile"],
          writes: ["derived.result"],
          dependsOn: ["profile"],
          next: { type: "complete" },
          config: {},
        },
      ],
    },
  };
}

function validCanonicalSource(): PstCanonicalSourceV1 {
  return {
    contractVersion: pstCanonicalSourceContractVersion,
    release: {
      releaseId: "release-source",
      projectId: "project-source",
      slug: "source",
      version: "v1.0",
      publishedAt: "2026-08-29T00:00:00.000Z",
      snapshotHash: "b".repeat(64),
      snapshotHashAlgorithm: "sha256-canonical-json.v1",
      sourceSchemaVersion: "pst-release-snapshot.v1",
    },
    project: {
      name: "Source",
      description: "Canonical source test.",
      domain: "Test",
      family: "Test",
      series: "Test",
      problemStatement: "Test",
      targetUser: "Tester",
      desiredOutcome: "Safe output",
      productDna: {
        problem: "Test",
        user: "Tester",
        journey: [],
        components: [],
        intelligence: "Declarative",
        outcome: "Safe output",
      },
    },
    blueprint: {
      id: "blueprint-source",
      projectId: "project-source",
      version: "v1.0",
      problem: "Test",
      targetUser: "Tester",
      desiredOutcome: "Safe output",
      problemType: "Test",
      journey: [],
      knowledgeRequirements: [],
      componentRequirements: [],
      aiRequirements: [],
      expectedOutput: [],
      actionPlan: [],
      nextStep: "",
    },
    workflow: [{
      id: "outcome",
      type: "OUTCOME",
      title: "Outcome",
      description: "Outcome.",
      inputs: ["context.input"],
      outputs: ["derived.output"],
      dependencies: [],
      nextStep: "",
      configuration: {},
    }],
    components: [],
    rules: [],
    providers: [],
  };
}

test("Validator accepts a complete generic Manufacturing IR", () => {
  assert.deepEqual(validateManufacturingIr(validIr()), {
    status: "VALIDATED",
    diagnostics: [],
  });
});

test("Validator blocks graph integrity and data contract failures", () => {
  const ir = validIr();
  ir.graph.nodes[0] = {
    ...ir.graph.nodes[0],
    next: { type: "step", target: "missing" },
    writes: ["answers.profile", "derived.duplicate"],
  };
  ir.graph.nodes.push({
    id: "outcome",
    kind: "OUTCOME",
    title: "Duplicate outcome",
    description: "Unreachable duplicate.",
    reads: ["answers.profile"],
    writes: ["derived.duplicate"],
    dependsOn: ["missing-dependency"],
    next: { type: "complete" },
    config: {},
  });

  const result = validateManufacturingIr(ir);
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.diagnostics.some(({ code }) => code === "MISSING_DEPENDENCY"), true);
  assert.equal(result.diagnostics.some(({ code }) => code === "INVALID_DATA_CONTRACT"), true);
  assert.equal(result.diagnostics.some(({ code }) => code === "INVALID_WORKFLOW"), true);
});

test("Validator blocks unsafe canonical configuration before compilation", () => {
  const source = validCanonicalSource();
  source.workflow[0].configuration = {
    provider: { accessToken: "never persist this" },
  };

  const result = validateCanonicalSource(source);
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.diagnostics.some(({ code }) => code === "UNSAFE_CONFIGURATION"), true);
});

test("Validator requires an OUTCOME terminal instead of any completed node", () => {
  const ir = validIr();
  ir.graph.nodes[1].kind = "ACTION";

  const result = validateManufacturingIr(ir);
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.diagnostics.some(({ code, message }) =>
    code === "INVALID_WORKFLOW" && message.includes("reachable OUTCOME")), true);
});

test("Validator rejects malformed direct canonical release metadata", () => {
  const source = validCanonicalSource();
  source.release.publishedAt = "2026-08-29";
  source.blueprint.version = "v2.0";

  const result = validateCanonicalSource(source);
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.diagnostics.some(({ code, path }) =>
    code === "INVALID_RELEASE" && path === "release.publishedAt"), true);
  assert.equal(result.diagnostics.some(({ code, path }) =>
    code === "SNAPSHOT_MISMATCH" && path === "blueprint.version"), true);
});

test("Validator requires complete rule and provider semantics", () => {
  const source = validCanonicalSource();
  source.rules = [{
    id: "rule-incomplete",
    version: "",
    name: "",
    kind: "",
    when: {},
    then: [],
  }];
  source.providers = [{
    id: "provider-incomplete",
    capability: "",
    mode: "",
    configuration: {},
  }];

  const result = validateCanonicalSource(source);
  assert.equal(result.status, "BLOCKED");
  assert.equal(
    result.diagnostics.filter(({ code }) => code === "MISSING_DEPENDENCY").length,
    2,
  );
});

test("Validator blocks unsafe configuration when Manufacturing IR is supplied directly", () => {
  const ir = validIr();
  ir.graph.nodes[0].config = {
    provider: {
      openaiApiKey: "never enter compilation",
    },
    transform: {
      script: "return dangerousInput",
    },
  };

  const result = validateManufacturingIr(ir);
  assert.equal(result.status, "BLOCKED");
  assert.equal(
    result.diagnostics.filter(({ code }) => code === "UNSAFE_CONFIGURATION").length,
    2,
  );
});

test("Validator checks declaration readiness when Manufacturing IR is supplied directly", () => {
  const ir = validIr();
  ir.declarations.components = [{
    id: "component-inactive",
    assetId: "asset-inactive",
    name: "Inactive",
    type: "RULES",
    source: "Library",
    version: "",
    status: "DRAFT",
    required: true,
    configuration: {},
  }];
  ir.declarations.rules = [{
    id: "rule-incomplete",
    version: "",
    name: "",
    kind: "",
    when: {},
    then: [],
  }];
  ir.declarations.providers = [{
    id: "provider-incomplete",
    capability: "",
    mode: "",
    configuration: {},
  }];

  const result = validateManufacturingIr(ir);
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.diagnostics.some(({ code }) => code === "INACTIVE_DEPENDENCY"), true);
  assert.equal(
    result.diagnostics.filter(({ code }) => code === "MISSING_DEPENDENCY").length,
    2,
  );
});