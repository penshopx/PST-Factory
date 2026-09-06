import assert from "node:assert/strict";
import test from "node:test";
import type { PstReleaseSnapshot, WorkflowStep } from "@workspace/db";
import { workflowFromStructure } from "./manufacturing";
import {
  compileExecutableRelease,
  resolveExecutableRelease,
} from "./executable-release";
import {
  materializeCompilerReadySnapshot,
  releaseSnapshotHash,
  releaseSnapshotHashAlgorithm,
  releaseSnapshotHashMatches,
  resolveReleaseDeclarations,
} from "./release-snapshot";

function modernSnapshot(workflow: WorkflowStep[]): PstReleaseSnapshot {
  const payload: Omit<PstReleaseSnapshot, "snapshotHash"> = {
    sourceSchemaVersion: "pst-release-snapshot.v1",
    snapshotHashAlgorithm: releaseSnapshotHashAlgorithm,
    project: {
      name: "Modern PST",
      description: "Compiler-ready release proof.",
      status: "PUBLISHED",
      version: "v1.0",
      domain: "General",
      family: "Assessment",
      series: "Core",
      problemStatement: "A measurable problem",
      targetUser: "Operator",
      desiredOutcome: "A practical action",
      productDna: {
        problem: "A measurable problem",
        user: "Operator",
        journey: ["Question", "Assess", "Act"],
        components: [],
        intelligence: "Declarative",
        outcome: "A practical action",
      },
      qaStatus: "PASS",
      publicationStatus: "PUBLISHED",
    },
    blueprint: {
      id: "blueprint-modern",
      projectId: "project-modern",
      problem: "A measurable problem",
      targetUser: "Operator",
      desiredOutcome: "A practical action",
      problemType: "Assessment",
      journey: ["Question", "Assess", "Act"],
      knowledgeRequirements: [],
      componentRequirements: [],
      aiRequirements: [],
      workflow,
      expectedOutput: ["A practical action"],
      actionPlan: ["Complete the journey"],
      nextStep: "Publish",
      version: "v1.0",
      updatedAt: "2026-08-29T00:00:00.000Z",
    },
    workflow,
    pattern: {
      id: "pattern-assessment",
      name: "Assessment pattern",
      version: "v1.0",
      steps: workflow.map(({ title }) => title),
    },
    components: [{
      id: "factory-component",
      assetId: "asset-factory-component",
      name: "Factory component",
      type: "TOOL",
      source: "Asset Library",
      version: "v1.0",
      status: "READY",
      required: true,
      configuration: { description: "Authoring-only metadata" },
    }],
    rules: [],
    providers: [],
  };
  return { ...payload, snapshotHash: releaseSnapshotHash(payload) };
}

test("release snapshot hash is stable across object key ordering", () => {
  const left = {
    snapshotHashAlgorithm: releaseSnapshotHashAlgorithm,
    project: { name: "Stable", productDna: { problem: "A", user: "B" } },
    components: [{ id: "component-1", configuration: { beta: 2, alpha: 1 } }],
  } as unknown as Omit<PstReleaseSnapshot, "snapshotHash">;
  const right = {
    components: [{ configuration: { alpha: 1, beta: 2 }, id: "component-1" }],
    project: { productDna: { user: "B", problem: "A" }, name: "Stable" },
    snapshotHashAlgorithm: releaseSnapshotHashAlgorithm,
  } as unknown as Omit<PstReleaseSnapshot, "snapshotHash">;

  assert.equal(releaseSnapshotHash(left), releaseSnapshotHash(right));
});

test("release snapshot hash detects source changes", () => {
  const payload = {
    snapshotHashAlgorithm: releaseSnapshotHashAlgorithm,
    project: { name: "Stable" },
    components: [],
  } as unknown as Omit<PstReleaseSnapshot, "snapshotHash">;
  const snapshot = {
    ...payload,
    snapshotHash: releaseSnapshotHash(payload),
  } as PstReleaseSnapshot;

  assert.equal(releaseSnapshotHashMatches(snapshot), true);
  assert.equal(releaseSnapshotHashMatches({
    ...snapshot,
    project: { ...snapshot.project, name: "Changed" },
  }), false);
});

test("release snapshot resolves complete declarative rules and providers", () => {
  const workflow = [{
    id: "analyze",
    type: "ANALYSIS",
    title: "Analyze",
    description: "Analyze configured inputs.",
    inputs: ["answer"],
    outputs: ["analysis"],
    dependencies: [],
    nextStep: "",
    configuration: {
      rules: [{
        id: "rule-risk",
        version: "v1.0",
        name: "Risk rule",
        kind: "RULE",
        when: { all: [] },
        then: [{ emit: "risk-reviewed" }],
      }],
      provider: {
        id: "provider-analysis",
        capability: "analysis",
        mode: "assistive",
        configuration: { strategy: "configured" },
      },
    },
  }] satisfies WorkflowStep[];

  const declarations = resolveReleaseDeclarations(workflow);
  assert.deepEqual(declarations.rules.map(({ id }) => id), ["rule-risk"]);
  assert.deepEqual(declarations.providers.map(({ id }) => id), ["provider-analysis"]);
  assert.deepEqual(declarations.errors, []);
});

test("release snapshot rejects incomplete declarations and credential-like configuration", () => {
  const workflow = [{
    id: "analyze",
    type: "ANALYSIS",
    title: "Analyze",
    description: "Analyze configured inputs.",
    inputs: ["answer"],
    outputs: ["analysis"],
    dependencies: [],
    nextStep: "",
    configuration: {
      rules: [{ id: "incomplete-rule" }],
      provider: {
        id: "provider-analysis",
        capability: "analysis",
        mode: "assistive",
        configuration: {
          nested: {
            accessToken: "must-not-be-snapshotted",
            openaiApiKey: "must-not-be-snapshotted",
            connectionString: "must-not-be-snapshotted",
          },
          tokenLimit: 1200,
        },
      },
    },
  }] satisfies WorkflowStep[];

  const declarations = resolveReleaseDeclarations(workflow);
  assert.equal(declarations.errors.some((error) => error.includes("incomplete-rule")), false);
  assert.equal(declarations.errors.some((error) => error.includes("not a complete release rule")), true);
  assert.equal(declarations.errors.filter((error) => error.includes("credential-like data")).length, 3);
  assert.equal(declarations.errors.some((error) => error.includes("tokenLimit")), false);
});

test("release snapshot rejects provider and rule declarations without executable essentials", () => {
  const workflow = [{
    id: "rules",
    type: "RULES",
    title: "Rules",
    description: "Apply configured rules.",
    inputs: [],
    outputs: [],
    dependencies: [],
    nextStep: "",
    configuration: {
      rules: [{
        id: "rule-without-condition-or-action",
        version: "v1.0",
        name: "Incomplete rule",
        kind: "RULE",
        when: {},
        then: [],
      }],
      provider: {
        id: "provider-without-configuration",
        capability: "analysis",
        mode: "assistive",
      },
    },
  }] satisfies WorkflowStep[];

  const declarations = resolveReleaseDeclarations(workflow);
  assert.equal(declarations.rules.length, 0);
  assert.equal(declarations.providers.length, 0);
  assert.equal(
    declarations.errors.some((error) => error.includes("not a complete release rule")),
    true,
  );
  assert.equal(
    declarations.errors.some((error) => error.includes("not a complete release provider")),
    true,
  );
});

test("modern release materialization is deterministic and compiler-complete", () => {
  const workflow = workflowFromStructure(
    ["Questions", "Scoring", "Analysis", "Recommendation"],
    { type: "pattern", id: "pattern-assessment", name: "Assessment pattern" },
  );
  const source = modernSnapshot(workflow);
  const first = materializeCompilerReadySnapshot(source);
  const second = materializeCompilerReadySnapshot(source);
  assert.deepEqual(first, second);
  assert.equal(first.status, "READY");
  if (first.status !== "READY") return;

  assert.equal(first.snapshot.factoryComponents?.[0]?.id, "factory-component");
  assert.ok(first.snapshot.components.length > 0);
  assert.deepEqual(
    Object.keys(first.snapshot.workflow[0]!.configuration!).sort(),
    ["canonical", "compilerReady"],
  );
  assert.equal(
    first.snapshot.components.every((component) =>
      Object.keys(component.configuration ?? {}).join(",") === "compilerReady"),
    true,
  );
  const compiled = compileExecutableRelease({
    id: "release-modern",
    projectId: "project-modern",
    version: "v1.0",
    createdAt: new Date("2026-08-29T00:00:00.000Z"),
  }, "modern-pst", first.snapshot);
  assert.equal(compiled.status, "COMPILED");
});

test("compiler-ready release materialization is idempotent", () => {
  const workflow = workflowFromStructure(
    ["Questions", "Scoring", "Analysis", "Recommendation"],
    { type: "pattern", id: "pattern-assessment", name: "Assessment pattern" },
  );
  const first = materializeCompilerReadySnapshot(modernSnapshot(workflow));
  assert.equal(first.status, "READY");
  if (first.status !== "READY") return;

  const second = materializeCompilerReadySnapshot(first.snapshot);
  assert.equal(second.status, "READY");
  if (second.status !== "READY") return;

  assert.deepEqual(second.snapshot, first.snapshot);
  assert.equal(releaseSnapshotHashMatches(second.snapshot), true);
});

test("published journey resolves its persisted executable without recompilation", () => {
  const workflow = workflowFromStructure(
    ["Questions", "Scoring", "Analysis", "Recommendation"],
    { type: "pattern", id: "pattern-assessment", name: "Assessment pattern" },
  );
  const materialized = materializeCompilerReadySnapshot(modernSnapshot(workflow));
  assert.equal(materialized.status, "READY");
  if (materialized.status !== "READY") return;
  const release = {
    id: "release-modern",
    projectId: "project-modern",
    version: "v1.0",
    createdAt: new Date("2026-08-29T00:00:00.000Z"),
  };
  const compiled = compileExecutableRelease(release, "modern-pst", materialized.snapshot);
  assert.equal(compiled.status, "COMPILED");
  if (compiled.status !== "COMPILED") return;

  const resolved = resolveExecutableRelease(
    release,
    "modern-pst",
    materialized.snapshot,
    compiled.definition,
  );
  assert.equal(resolved.status, "COMPILED");
  if (resolved.status !== "COMPILED") return;
  assert.equal(resolved.source, "PERSISTED");
  assert.deepEqual(resolved.definition, compiled.definition);
});

test("published journey rejects an executable from another release", () => {
  const workflow = workflowFromStructure(
    ["Questions", "Scoring", "Analysis", "Recommendation"],
    { type: "pattern", id: "pattern-assessment", name: "Assessment pattern" },
  );
  const materialized = materializeCompilerReadySnapshot(modernSnapshot(workflow));
  assert.equal(materialized.status, "READY");
  if (materialized.status !== "READY") return;
  const release = {
    id: "release-modern",
    projectId: "project-modern",
    version: "v1.0",
    createdAt: new Date("2026-08-29T00:00:00.000Z"),
  };
  const compiled = compileExecutableRelease(release, "modern-pst", materialized.snapshot);
  assert.equal(compiled.status, "COMPILED");
  if (compiled.status !== "COMPILED") return;

  const resolved = resolveExecutableRelease(
    { ...release, id: "another-release" },
    "modern-pst",
    materialized.snapshot,
    compiled.definition,
  );
  assert.equal(resolved.status, "BLOCKED");
  if (resolved.status === "BLOCKED") {
    assert.equal(resolved.diagnostics[0]?.code, "EXECUTABLE_IDENTITY_MISMATCH");
  }
});

test("modern release materialization rejects incomplete authoring configuration", () => {
  const source = modernSnapshot([{
    id: "ambiguous",
    type: "UNRESOLVED",
    title: "Ambiguous",
    description: "No executable declaration.",
    inputs: [],
    outputs: [],
    dependencies: [],
    nextStep: "",
    configuration: { sourceId: "pattern-ambiguous" },
  }]);
  const result = materializeCompilerReadySnapshot(source);
  assert.equal(result.status, "BLOCKED");
  if (result.status === "BLOCKED") {
    assert.match(result.errors[0]!, /canonical and compilerReady/);
  }
});