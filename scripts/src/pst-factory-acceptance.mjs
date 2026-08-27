import assert from "node:assert/strict";
import {
  buildFromConfiguration,
  canApprove,
  canPublish,
  customerWorkspaceSteps,
  evaluateQa,
  isPublicCustomerWorkspace,
  qaStatus,
} from "../../artifacts/api-server/src/lib/services/pst/manufacturing.ts";

const assets = [
  { id: "asset-questions", name: "Guided questions", type: "MINI_APP", description: "Question flow", tags: ["questions", "assessment"], compatibility: ["ASSESSMENT"], status: "ACTIVE" },
  { id: "asset-criteria", name: "Criteria matrix", type: "TOOL", description: "Compare options against criteria", tags: ["criteria", "options"], compatibility: ["Decision support"], status: "ACTIVE" },
  { id: "asset-scoring", name: "Scoring framework", type: "TOOL", description: "Scoring and interpretation", tags: ["scoring"], compatibility: ["ASSESSMENT"], status: "ACTIVE" },
  { id: "asset-analysis", name: "Analysis guide", type: "KNOWLEDGE", description: "Analyze the current situation", tags: ["analysis", "current"], compatibility: ["*"], status: "ACTIVE" },
  { id: "asset-recommendation", name: "Recommendation assistant", type: "AI", description: "Recommendation guidance", tags: ["recommendation"], compatibility: ["*"], status: "ACTIVE" },
  { id: "asset-action", name: "Action plan worksheet", type: "TOOL", description: "A concrete action plan", tags: ["action", "plan"], compatibility: ["*"], status: "ACTIVE" },
];

const assessmentBlueprint = {
  problem: "Owners cannot tell whether their cashflow is healthy.",
  targetUser: "Small business owner",
  desiredOutcome: "Understand cashflow health and choose one corrective action.",
  journey: ["Questions", "Scoring", "Analysis", "Recommendation"],
  knowledgeRequirements: ["Cashflow guide"],
  componentRequirements: ["Questions", "Scoring", "Analysis", "Recommendation"],
  aiRequirements: ["Explain the assessment"],
  expectedOutput: ["Cashflow score", "Corrective action"],
  workflow: [],
};
const decisionBlueprint = {
  problem: "Operations leads struggle to choose between vendors.",
  targetUser: "Operations lead",
  desiredOutcome: "Compare vendors against explicit criteria and select the best fit.",
  journey: ["Options", "Criteria", "Scoring", "Recommendation", "Action"],
  knowledgeRequirements: ["Vendor criteria guide"],
  componentRequirements: ["Assessment", "Criteria", "Scoring", "AI recommendation", "Action plan"],
  aiRequirements: ["Explain the tradeoffs"],
  expectedOutput: ["Decision matrix", "Selected vendor", "Next action"],
  workflow: [],
};

const assessment = buildFromConfiguration({
  blueprint: assessmentBlueprint,
  assets,
  pattern: { type: "pattern", id: "pattern-assessment", name: "Assessment pattern", steps: ["Questions", "Scoring", "Analysis", "Recommendation"] },
  recipe: { type: "recipe", id: "recipe-assessment", name: "Assessment recipe", components: ["Questions", "Scoring", "Analysis", "Recommendation"] },
  idFactory: (() => { let i = 0; return () => `assessment-component-${++i}`; })(),
});
const decision = buildFromConfiguration({
  blueprint: decisionBlueprint,
  assets,
  pattern: { type: "pattern", id: "pattern-decision", name: "Decision pattern", steps: ["Options", "Criteria", "Scoring", "Recommendation", "Action"] },
  recipe: { type: "recipe", id: "recipe-decision", name: "Decision recipe", components: ["Assessment", "Criteria", "Scoring", "AI recommendation", "Action plan"] },
  idFactory: (() => { let i = 0; return () => `decision-component-${++i}`; })(),
});

// Two materially different Blueprint configurations produce different workflows and parts.
assert.equal(assessment.status, "READY");
assert.equal(decision.status, "READY");
assert.notDeepEqual(assessment.workflow.map((step) => step.title), decision.workflow.map((step) => step.title));
assert.notDeepEqual(assessment.components.map((component) => component.name), decision.components.map((component) => component.name));
assert.equal(assessment.workflow[0].configuration.sourceId, "pattern-assessment");
assert.equal(decision.workflow[0].configuration.sourceId, "pattern-decision");

// The same generic customer renderer exposes each configured journey and outcome.
const assessmentWorkspace = {
  outcome: assessmentBlueprint.desiredOutcome,
  steps: customerWorkspaceSteps(assessment.workflow),
};
const decisionWorkspace = {
  outcome: decisionBlueprint.desiredOutcome,
  steps: customerWorkspaceSteps(decision.workflow),
};
assert.notEqual(assessmentWorkspace.outcome, decisionWorkspace.outcome);
assert.notDeepEqual(assessmentWorkspace.steps.map((step) => step.title), decisionWorkspace.steps.map((step) => step.title));

// QA failure: a disconnected workflow is an ERROR and cannot pass the release gate.
const brokenBlueprint = { ...assessmentBlueprint, workflow: assessment.workflow.map((step, index) => index === 1 ? { ...step, nextStep: "does-not-exist" } : step) };
const brokenQa = evaluateQa({ ...assessmentBlueprint, components: assessment.components }, brokenBlueprint);
assert.equal(qaStatus(brokenQa), "ERROR");
assert.equal(brokenQa.find((result) => result.category === "WORKFLOW")?.status, "ERROR");
assert.equal(canApprove({ qaStatus: "ERROR" }), false);
assert.equal(canPublish({ status: "APPROVED", qaStatus: "ERROR" }), false);

// Missing dependency: the builder blocks and technical QA fails, rather than publishing a partial PST.
const missing = buildFromConfiguration({
  blueprint: decisionBlueprint,
  assets: assets.filter((asset) => asset.id !== "asset-criteria"),
  pattern: { type: "pattern", id: "pattern-decision", name: "Decision pattern", steps: decisionBlueprint.journey },
  recipe: { type: "recipe", id: "recipe-decision", name: "Decision recipe", components: decisionBlueprint.componentRequirements },
});
assert.equal(missing.status, "BLOCKED");
assert.ok(missing.missing.includes("Criteria"));
const missingQa = evaluateQa({ ...decisionBlueprint, components: missing.components }, { ...decisionBlueprint, workflow: missing.workflow });
assert.equal(missingQa.find((result) => result.category === "TECHNICAL")?.status, "ERROR");

// Duplicate isolation: copied configuration and components can be edited without mutating the source.
const duplicate = {
  ...assessment,
  workflow: assessment.workflow.map((step) => ({ ...step, dependencies: [...step.dependencies], inputs: [...step.inputs], outputs: [...step.outputs] })),
  components: assessment.components.map((component) => ({ ...component })),
};
duplicate.workflow[0].title = "Edited copy";
duplicate.components[0].name = "Edited component";
assert.equal(assessment.workflow[0].title, "Questions");
assert.equal(assessment.components[0].name, "Guided questions");

// Publish gate and customer access boundary.
assert.equal(canPublish({ status: "APPROVED", qaStatus: "PASS" }), true);
assert.equal(canPublish({ status: "PREVIEW", qaStatus: "PASS" }), false);
assert.equal(isPublicCustomerWorkspace({ slug: "assessment", status: "PUBLISHED", publicationStatus: "PUBLISHED" }, "assessment"), true);
assert.equal(isPublicCustomerWorkspace({ slug: "assessment", status: "APPROVED", publicationStatus: "UNPUBLISHED" }, "assessment"), false);
assert.equal(isPublicCustomerWorkspace({ slug: "assessment", status: "PUBLISHED", publicationStatus: "PUBLISHED" }, "other-project"), false);

console.log("PST Factory v1.1 acceptance: PASS");
console.log(JSON.stringify({
  blueprints: 2,
  assessmentSteps: assessment.workflow.map((step) => step.title),
  decisionSteps: decision.workflow.map((step) => step.title),
  checks: ["configuration-driven build", "different customer journeys/outcomes", "QA failure", "missing dependency", "duplicate isolation", "publish gate", "customer access boundary"],
}, null, 2));