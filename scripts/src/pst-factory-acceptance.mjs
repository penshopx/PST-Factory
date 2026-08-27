import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  buildFromConfiguration,
  canApprove,
  canPublish,
  customerWorkspaceSteps,
  evaluateQa,
  isPublicCustomerWorkspace,
  qaStatus,
  publicCustomerWorkspaceSteps,
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

// Public customer payloads must not carry factory library or QA internals.
const publicSteps = publicCustomerWorkspaceSteps(assessment.workflow);
assert.equal("configuration" in publicSteps[0], false);
assert.deepEqual(publicSteps.map((step) => step.title), assessment.workflow.map((step) => step.title));

const apiBaseUrl = (process.env.PST_API_URL ?? `http://127.0.0.1:${process.env.PORT ?? "8080"}/api`).replace(/\/$/, "");
const directApiBaseUrl = apiBaseUrl.endsWith("/api") ? apiBaseUrl.slice(0, -4) : undefined;

async function clerkRequest(path, init = {}) {
  if (!process.env.CLERK_SECRET_KEY) {
    throw new Error("CLERK_SECRET_KEY is required for the authenticated PST route acceptance.");
  }
  const response = await fetch(`https://api.clerk.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(`Clerk API ${init.method ?? "GET"} ${path} returned ${response.status}.`);
  }
  return response.json();
}

async function createClerkTestSession(label) {
  const email = `pst-factory-acceptance-${label}-${randomUUID().replaceAll("-", "")}@example.com`;
  const user = await clerkRequest("/users", {
    method: "POST",
    body: JSON.stringify({
      email_address: [email],
      password: `PstAcceptance-${randomUUID()}-aB9!`,
      skip_password_checks: true,
    }),
  });
  try {
    const session = await clerkRequest("/sessions", {
      method: "POST",
      body: JSON.stringify({ user_id: user.id }),
    });
    const tokenResponse = await clerkRequest(`/sessions/${session.id}/tokens`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    const token = tokenResponse.jwt ?? tokenResponse.token;
    if (!token) {
      throw new Error(`Clerk session token was not returned for ${label}.`);
    }
    return { userId: user.id, token };
  } catch (error) {
    await clerkRequest(`/users/${user.id}`, { method: "DELETE" }).catch(() => {});
    throw error;
  }
}

async function deleteClerkTestUser(userId) {
  if (!userId) return;
  await clerkRequest(`/users/${userId}`, { method: "DELETE" }).catch(() => {});
}

async function apiRequest(token, path, init = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => undefined);
  return { response, body };
}

async function directApiRequest(token, path, init = {}) {
  if (!directApiBaseUrl) return undefined;
  const response = await fetch(`${directApiBaseUrl}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  return { response, body: await response.text() };
}

function assertStatus(result, expected, label) {
  assert.equal(result.response.status, expected, `${label}: expected ${expected}, got ${result.response.status}`);
}

async function assertPrivateRouteAuthentication() {
  const projectId = "private-route-auth-check";
  const releaseId = "private-release-auth-check";
  const requests = [
    ["GET", "/pst/dashboard/summary"],
    ["GET", "/pst/dashboard/activity"],
    ["GET", "/pst/projects"],
    ["POST", "/pst/projects", {
      name: "Unauthenticated PST",
      problemStatement: "Should be rejected",
      targetUser: "Test user",
      desiredOutcome: "No project",
    }],
    ["GET", `/pst/projects/${projectId}`],
    ["PATCH", `/pst/projects/${projectId}`, { description: "Should be rejected" }],
    ["POST", `/pst/projects/${projectId}/duplicate`, {}],
    ["POST", `/pst/projects/${projectId}/archive`, {}],
    ["POST", `/pst/projects/${projectId}/architect`, { patternId: "pattern-assessment", recipeId: "recipe-assessment" }],
    ["GET", `/pst/projects/${projectId}/blueprint`],
    ["PATCH", `/pst/projects/${projectId}/blueprint`, { nextStep: "Should be rejected" }],
    ["GET", "/pst/assets"],
    ["GET", "/pst/patterns"],
    ["GET", "/pst/recipes"],
    ["POST", `/pst/projects/${projectId}/builder`, { assetIds: ["asset-guided-assessment"] }],
    ["POST", `/pst/projects/${projectId}/simulate`, { mode: "MANUAL" }],
    ["POST", `/pst/projects/${projectId}/qa`, {}],
    ["POST", `/pst/projects/${projectId}/approve`, {}],
    ["POST", `/pst/projects/${projectId}/publish`, {}],
    ["GET", `/pst/projects/${projectId}/releases`],
    ["POST", `/pst/projects/${projectId}/releases/${releaseId}/restore`, {}],
    ["GET", `/pst/projects/${projectId}/workspace`],
    ["GET", `/pst/projects/${projectId}/members`],
    ["POST", `/pst/projects/${projectId}/members`, { userId: "unauthenticated-user", role: "viewer" }],
    ["DELETE", `/pst/projects/${projectId}/members/unauthenticated-user`],
  ];

  for (const [method, path, body] of requests) {
    const result = await apiRequest(undefined, path, {
      method,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    assertStatus(result, 401, `unauthenticated ${method} ${path}`);
  }

  const directRoute = await directApiRequest(undefined, `/pst/projects/${projectId}`);
  if (directRoute) {
    assertStatus(directRoute, 404, "router is not exposed outside /api");
  }
}

async function assertCrossOwnerIsolation(outsider, projectId, releaseId) {
  const requests = [
    ["GET", `/pst/projects/${projectId}`],
    ["PATCH", `/pst/projects/${projectId}`, { description: "Cross-owner mutation must be rejected." }],
    ["POST", `/pst/projects/${projectId}/duplicate`, {}],
    ["POST", `/pst/projects/${projectId}/archive`, {}],
    ["POST", `/pst/projects/${projectId}/architect`, { patternId: "pattern-assessment", recipeId: "recipe-assessment" }],
    ["GET", `/pst/projects/${projectId}/blueprint`],
    ["PATCH", `/pst/projects/${projectId}/blueprint`, { nextStep: "Cross-owner blueprint mutation must be rejected." }],
    ["POST", `/pst/projects/${projectId}/builder`, { patternId: "pattern-assessment", recipeId: "recipe-assessment" }],
    ["POST", `/pst/projects/${projectId}/simulate`, { mode: "MANUAL" }],
    ["POST", `/pst/projects/${projectId}/qa`, {}],
    ["POST", `/pst/projects/${projectId}/approve`, {}],
    ["POST", `/pst/projects/${projectId}/publish`, {}],
    ["GET", `/pst/projects/${projectId}/releases`],
    ["POST", `/pst/projects/${projectId}/releases/${releaseId}/restore`, {}],
    ["GET", `/pst/projects/${projectId}/workspace`],
    ["GET", `/pst/projects/${projectId}/members`],
    ["POST", `/pst/projects/${projectId}/members`, { userId: outsider.userId, role: "viewer" }],
    ["DELETE", `/pst/projects/${projectId}/members/${outsider.userId}`],
  ];

  for (const [method, path, body] of requests) {
    const result = await apiRequest(outsider.token, path, {
      method,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    assertStatus(result, 404, `cross-owner ${method} ${path}`);
    assert.deepEqual(result.body, { error: "PST project not found" });
  }
}

async function runAuthenticatedRouteAcceptance() {
  const owner = await createClerkTestSession("owner");
  let viewer;
  let outsider;
  try {
    viewer = await createClerkTestSession("viewer");
    outsider = await createClerkTestSession("outsider");

    await assertPrivateRouteAuthentication();

    const projectName = `Authenticated lifecycle ${randomUUID().slice(0, 8)}`;
    const created = await apiRequest(owner.token, "/pst/projects", {
      method: "POST",
      body: JSON.stringify({
        name: projectName,
        description: "Route-level lifecycle acceptance project",
        domain: "General",
        family: "Problem Solving",
        series: "Acceptance",
        problemStatement: "Teams need a reliable way to assess operational choices.",
        targetUser: "Operations lead",
        desiredOutcome: "Choose one justified next action.",
      }),
    });
    assertStatus(created, 201, "authenticated create");
    assert.equal(created.body.status, "DRAFT");
    assert.equal(created.body.publicationStatus, "UNPUBLISHED");
    assert.deepEqual(created.body.selectedPatterns, []);
    assert.deepEqual(created.body.selectedRecipes, []);
    const projectId = created.body.id;
    const slug = created.body.slug;

    const outsiderRead = await apiRequest(outsider.token, `/pst/projects/${projectId}`);
    assertStatus(outsiderRead, 404, "cross-owner read");
    assert.deepEqual(outsiderRead.body, { error: "PST project not found" });

    const outsiderMutation = await apiRequest(outsider.token, `/pst/projects/${projectId}`, {
      method: "PATCH",
      body: JSON.stringify({ description: "Cross-owner mutation must not reveal this project." }),
    });
    assertStatus(outsiderMutation, 404, "cross-owner mutation");
    assert.deepEqual(outsiderMutation.body, outsiderRead.body);

    const beforePublish = await apiRequest(undefined, `/pst/public/workspaces/${slug}`);
    assertStatus(beforePublish, 404, "public workspace before publish");

    const architected = await apiRequest(owner.token, `/pst/projects/${projectId}/architect`, {
      method: "POST",
      body: JSON.stringify({
        additionalContext: "Use the reusable assessment library configuration.",
        patternId: "pattern-assessment",
        recipeId: "recipe-assessment",
      }),
    });
    assertStatus(architected, 200, "architect with pattern and recipe");
    assert.deepEqual(architected.body.journey, ["Questions", "Scoring", "Analysis", "Recommendation"]);
    assert.ok(architected.body.workflow.every((step) => step.configuration?.sourceType === "pattern"));

    const referencesPersisted = await apiRequest(owner.token, `/pst/projects/${projectId}`);
    assertStatus(referencesPersisted, 200, "project after architect");
    assert.equal(referencesPersisted.body.description, "Route-level lifecycle acceptance project");
    assert.deepEqual(referencesPersisted.body.selectedPatterns.map((pattern) => pattern.id), ["pattern-assessment"]);
    assert.deepEqual(referencesPersisted.body.selectedRecipes.map((recipe) => recipe.id), ["recipe-assessment"]);
    assert.equal(referencesPersisted.body.status, "ARCHITECTED");

    const outsiderProjects = await apiRequest(outsider.token, "/pst/projects");
    assertStatus(outsiderProjects, 200, "cross-owner project list");
    assert.equal(outsiderProjects.body.some((project) => project.id === projectId), false);
    const outsiderActivity = await apiRequest(outsider.token, "/pst/dashboard/activity");
    assertStatus(outsiderActivity, 200, "cross-owner activity");
    assert.equal(outsiderActivity.body.some((event) => event.projectId === projectId), false);
    const outsiderPatterns = await apiRequest(outsider.token, "/pst/patterns");
    assertStatus(outsiderPatterns, 200, "cross-owner pattern usage");
    const outsiderAssessmentPattern = outsiderPatterns.body.find((pattern) => pattern.id === "pattern-assessment");
    assert.equal(outsiderAssessmentPattern.projectIds.includes(projectId), false);
    assert.equal(outsiderAssessmentPattern.projects.some((project) => project.id === projectId), false);
    const outsiderRecipes = await apiRequest(outsider.token, "/pst/recipes");
    assertStatus(outsiderRecipes, 200, "cross-owner recipe usage");
    const outsiderAssessmentRecipe = outsiderRecipes.body.find((recipe) => recipe.id === "recipe-assessment");
    assert.equal(outsiderAssessmentRecipe.projectIds.includes(projectId), false);
    assert.equal(outsiderAssessmentRecipe.projects.some((project) => project.id === projectId), false);

    const built = await apiRequest(owner.token, `/pst/projects/${projectId}/builder`, {
      method: "POST",
      body: JSON.stringify({
        assetIds: [
          "asset-guided-assessment",
          "asset-scoring-framework",
          "asset-outcome-guide",
          "asset-ai-recommendation",
          "asset-action-plan",
        ],
        patternId: "pattern-assessment",
        recipeId: "recipe-assessment",
      }),
    });
    assertStatus(built, 200, "builder");
    assert.equal(built.body.status, "READY");
    assert.deepEqual(built.body.missing, []);

    const qa = await apiRequest(owner.token, `/pst/projects/${projectId}/qa`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    assertStatus(qa, 200, "QA");
    assert.equal(qa.body.status, "PASS");

    const approved = await apiRequest(owner.token, `/pst/projects/${projectId}/approve`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    assertStatus(approved, 200, "approval");
    assert.equal(approved.body.status, "APPROVED");

    const concurrentPublishes = await Promise.all(
      [1, 2].map(() => apiRequest(owner.token, `/pst/projects/${projectId}/publish`, {
        method: "POST",
        body: JSON.stringify({}),
      })),
    );
    const successfulPublishes = concurrentPublishes.filter(({ response }) => response.status === 200);
    const rejectedPublishes = concurrentPublishes.filter(({ response }) => response.status === 409);
    assert.equal(successfulPublishes.length, 1, "concurrent publish has one winner");
    assert.equal(rejectedPublishes.length, 1, "concurrent publish has one retry-safe loser");
    assert.equal(successfulPublishes[0].body.status, "PUBLISHED");
    assert.equal(successfulPublishes[0].body.publicationStatus, "PUBLISHED");
    assert.equal(rejectedPublishes[0].body.retryable, true);
    assert.match(rejectedPublishes[0].body.error, /published by another request/i);
    const published = successfulPublishes[0];

    await assertCrossOwnerIsolation(outsider, projectId, (await apiRequest(owner.token, `/pst/projects/${projectId}/releases`)).body[0].id);

    const membership = await apiRequest(owner.token, `/pst/projects/${projectId}/members`, {
      method: "POST",
      body: JSON.stringify({ userId: viewer.userId, role: "viewer" }),
    });
    assertStatus(membership, 201, "add viewer membership");

    const otherMembership = await apiRequest(owner.token, `/pst/projects/${projectId}/members`, {
      method: "POST",
      body: JSON.stringify({ userId: outsider.userId, role: "admin" }),
    });
    assertStatus(otherMembership, 201, "add second admin membership");

    const viewerCanRead = await apiRequest(viewer.token, `/pst/projects/${projectId}`);
    assertStatus(viewerCanRead, 200, "viewer read");
    const viewerMutation = await apiRequest(viewer.token, `/pst/projects/${projectId}`, {
      method: "PATCH",
      body: JSON.stringify({ description: "Viewer must not mutate this project." }),
    });
    assertStatus(viewerMutation, 403, "viewer mutation");

    const ownerRevokeProtection = await apiRequest(owner.token, `/pst/projects/${projectId}/members/${owner.userId}`, {
      method: "DELETE",
    });
    assertStatus(ownerRevokeProtection, 409, "protect project owner membership");

    const revokedByAdmin = await apiRequest(outsider.token, `/pst/projects/${projectId}/members/${viewer.userId}`, {
      method: "DELETE",
    });
    assertStatus(revokedByAdmin, 204, "admin revoke viewer membership");

    const revokedViewerRead = await apiRequest(viewer.token, `/pst/projects/${projectId}`);
    assertStatus(revokedViewerRead, 404, "revoked viewer read");
    assert.deepEqual(revokedViewerRead.body, { error: "PST project not found" });
    const revokedViewerMutation = await apiRequest(viewer.token, `/pst/projects/${projectId}`, {
      method: "PATCH",
      body: JSON.stringify({ description: "Revoked viewer must not mutate this project." }),
    });
    assertStatus(revokedViewerMutation, 404, "revoked viewer mutation");
    assert.deepEqual(revokedViewerMutation.body, { error: "PST project not found" });

    const restoredMembership = await apiRequest(owner.token, `/pst/projects/${projectId}/members`, {
      method: "POST",
      body: JSON.stringify({ userId: viewer.userId, role: "viewer" }),
    });
    assertStatus(restoredMembership, 201, "restore viewer membership for owner revoke");
    const revokedByOwner = await apiRequest(owner.token, `/pst/projects/${projectId}/members/${viewer.userId}`, {
      method: "DELETE",
    });
    assertStatus(revokedByOwner, 204, "owner revoke viewer membership");

    const ownerCanStillRead = await apiRequest(owner.token, `/pst/projects/${projectId}`);
    assertStatus(ownerCanStillRead, 200, "owner read after revoke");
    assert.equal(ownerCanStillRead.body.id, projectId);
    const otherMemberCanStillRead = await apiRequest(outsider.token, `/pst/projects/${projectId}`);
    assertStatus(otherMemberCanStillRead, 200, "other member read after revoke");

    const afterPublish = await apiRequest(undefined, `/pst/public/workspaces/${slug}`);
    assertStatus(afterPublish, 200, "public workspace after publish");
    assert.equal(afterPublish.body.project.slug, slug);
    assert.equal(afterPublish.body.project.status, "PUBLISHED");
    assert.ok(afterPublish.body.steps.length > 0);
    for (const privateProjectField of ["ownerId", "qaStatus", "createdAt", "updatedAt", "selectedPatterns", "selectedRecipes", "components"]) {
      assert.equal(privateProjectField in afterPublish.body.project, false, `public project must omit ${privateProjectField}`);
    }
    for (const privateDnaField of ["components", "intelligence"]) {
      assert.equal(privateDnaField in afterPublish.body.project.productDna, false, `public product DNA must omit ${privateDnaField}`);
    }
    for (const privateBlueprintField of ["knowledgeRequirements", "componentRequirements", "aiRequirements"]) {
      assert.equal(privateBlueprintField in afterPublish.body.project.blueprint, false, `public blueprint must omit ${privateBlueprintField}`);
    }
    assert.equal("selectedPatterns" in afterPublish.body.project, false);
    assert.equal("qaStatus" in afterPublish.body.project, false);
    assert.equal("configuration" in afterPublish.body.steps[0], false);

    const releases = await apiRequest(owner.token, `/pst/projects/${projectId}/releases`);
    assertStatus(releases, 200, "release history");
    assert.equal(releases.body.length, 1);
    assert.equal(releases.body[0].version, afterPublish.body.project.version);
    assert.deepEqual(releases.body.map((release) => release.version), ["v1.0"]);
    assert.equal(releases.body[0].snapshot.workflow[0].title, afterPublish.body.steps[0].title);
    assert.equal(releases.body[0].snapshot.components.length, published.body.components.length);

    const editedAfterPublish = await apiRequest(owner.token, `/pst/projects/${projectId}`, {
      method: "PATCH",
      body: JSON.stringify({ description: "Draft edit must not change the live release." }),
    });
    assertStatus(editedAfterPublish, 200, "edit after publish");
    const editedBlueprintAfterPublish = await apiRequest(owner.token, `/pst/projects/${projectId}/blueprint`, {
      method: "PATCH",
      body: JSON.stringify({ nextStep: "Draft-only next step." }),
    });
    assertStatus(editedBlueprintAfterPublish, 200, "blueprint edit after publish");

    const afterDraftEdit = await apiRequest(undefined, `/pst/public/workspaces/${slug}`);
    assertStatus(afterDraftEdit, 200, "public workspace after draft edit");
    assert.deepEqual(afterDraftEdit.body, afterPublish.body);

    const restored = await apiRequest(owner.token, `/pst/projects/${projectId}/releases/${releases.body[0].id}/restore`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    assertStatus(restored, 200, "restore release");
    assert.equal(restored.body.status, "BLUEPRINT_READY");
    assert.equal(restored.body.blueprint.nextStep, afterPublish.body.project.blueprint.nextStep);
    const afterRestore = await apiRequest(undefined, `/pst/public/workspaces/${slug}`);
    assertStatus(afterRestore, 200, "public workspace after restore");
    assert.deepEqual(afterRestore.body, afterPublish.body);

    const ownerMembers = await apiRequest(owner.token, `/pst/projects/${projectId}/members`);
    assertStatus(ownerMembers, 200, "owner member list after outsider attempts");
    assert.equal(ownerMembers.body.some((member) => member.userId === owner.userId), true);
    assert.equal(ownerMembers.body.some((member) => member.userId === outsider.userId), true);
    assert.equal(ownerMembers.body.some((member) => member.userId === viewer.userId), false);

    return {
      projectId,
      slug,
      patternId: referencesPersisted.body.selectedPatterns[0].id,
      recipeId: referencesPersisted.body.selectedRecipes[0].id,
      qaStatus: qa.body.status,
      publicStatus: afterPublish.body.project.status,
      releaseVersion: releases.body[0].version,
    };
  } finally {
    await deleteClerkTestUser(outsider?.userId);
    await deleteClerkTestUser(viewer?.userId);
    await deleteClerkTestUser(owner.userId);
  }
}

const authenticatedRouteResult = await runAuthenticatedRouteAcceptance();

console.log("PST Factory v1.1 acceptance: PASS");
console.log(JSON.stringify({
  blueprints: 2,
  assessmentSteps: assessment.workflow.map((step) => step.title),
  decisionSteps: decision.workflow.map((step) => step.title),
  checks: ["configuration-driven build", "different customer journeys/outcomes", "QA failure", "missing dependency", "duplicate isolation", "publish gate", "customer access boundary", "public metadata allowlist", "private route authentication sweep", "router isolation outside /api", "cross-owner route isolation", "cross-owner access boundary", "scoped library usage", "authenticated create-to-publish route lifecycle", "safe project membership revocation", "concurrent publish version guard"],
  authenticatedRoute: authenticatedRouteResult,
}, null, 2));