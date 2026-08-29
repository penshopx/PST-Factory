import assert from "node:assert/strict";
import test from "node:test";
import type { PstReleaseSnapshot, WorkflowStep } from "@workspace/db";
import {
  releaseSnapshotHash,
  releaseSnapshotHashAlgorithm,
  releaseSnapshotHashMatches,
  resolveReleaseDeclarations,
} from "./release-snapshot";

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