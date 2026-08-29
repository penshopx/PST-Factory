import { Router, type IRouter, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { and, desc, eq, exists, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  pstAssetsTable,
  pstBlueprintsTable,
  pstFactoryEventsTable,
  pstPatternsTable,
  pstProjectPatternsTable,
  pstProjectMembersTable,
  pstProjectComponentsTable,
  pstProjectsTable,
  pstProjectRecipesTable,
  pstReleasesTable,
  pstQaRunsTable,
  pstRecipesTable,
  pstSimulationsTable,
  type WorkflowStep,
  type QaResult,
  type PstProjectRole,
  type PstReleaseSnapshot,
} from "@workspace/db";
import {
  ArchivePstProjectParams,
  ArchivePstProjectResponse,
  ApprovePstProjectParams,
  ApprovePstProjectResponse,
  BuildPstProjectBody,
  BuildPstProjectParams,
  BuildPstProjectResponse,
  CreatePstProjectBody,
  CreatePstProjectResponse,
  DuplicatePstProjectParams,
  DuplicatePstProjectResponse,
  GetDashboardActivityResponse,
  GetDashboardSummaryResponse,
  GetPstBlueprintParams,
  GetPstBlueprintResponse,
  GetPstProjectParams,
  GetPstProjectResponse,
  GetPublicPstWorkspaceResponse,
  GetPstWorkspaceParams,
  GetPstWorkspaceResponse,
  ListPstAssetsQueryParams,
  ListPstAssetsResponse,
  ListPstPatternsResponse,
  ListPstProjectsQueryParams,
  ListPstProjectsResponse,
  ListPstRecipesResponse,
  PublishPstProjectParams,
  PublishPstProjectResponse,
  GetPstReleasesParams,
  GetPstReleasesResponse,
  PstRelease,
  RemovePstProjectMemberParams,
  RestorePstReleaseParams,
  RestorePstReleaseResponse,
  RunPstArchitectBody,
  RunPstArchitectParams,
  RunPstArchitectResponse,
  RunPstQaParams,
  RunPstQaResponse,
  SimulatePstProjectBody,
  SimulatePstProjectParams,
  SimulatePstProjectResponse,
  UpdatePstBlueprintBody,
  UpdatePstBlueprintParams,
  UpdatePstBlueprintResponse,
  UpdatePstProjectBody,
  UpdatePstProjectParams,
  UpdatePstProjectResponse,
  UpsertPstProjectMemberBody,
} from "@workspace/api-zod";
import { aiProvider } from "../lib/services/ai/provider";
import { gustaftaEngine } from "../lib/services/gustafta/engine";
import {
  buildFromConfiguration,
  canApprove,
  canPublish,
  customerWorkspaceSteps,
  evaluateQa,
  isPublicCustomerWorkspace,
  publicCustomerWorkspaceSteps,
  qaStatus,
  workflowFromStructure,
} from "../lib/services/pst/manufacturing";
import {
  releaseSnapshotHash,
  releaseSnapshotHashAlgorithm,
  resolveReleaseDeclarations,
} from "../lib/services/pst/release-snapshot";
import { compileExecutableRelease } from "../lib/services/pst/executable-release";
import { randomUUID } from "node:crypto";

const router: IRouter = Router();

const defaultWorkflow: WorkflowStep[] = [
  {
    id: "profile",
    type: "INPUT",
    title: "User profile",
    description: "Capture the context needed to personalize the journey.",
    inputs: ["profile"],
    outputs: ["user_context"],
    dependencies: [],
    nextStep: "assessment",
  },
  {
    id: "assessment",
    type: "ASSESSMENT",
    title: "Assessment",
    description: "Collect structured answers about the problem.",
    inputs: ["user_context"],
    outputs: ["assessment_score", "assessment_answers"],
    dependencies: ["profile"],
    nextStep: "analysis",
  },
  {
    id: "analysis",
    type: "ANALYSIS",
    title: "Analysis",
    description: "Turn answers into a clear situation summary.",
    inputs: ["assessment_score", "assessment_answers"],
    outputs: ["analysis"],
    dependencies: ["assessment"],
    nextStep: "recommendation",
  },
  {
    id: "recommendation",
    type: "RECOMMENDATION",
    title: "Recommendation",
    description: "Suggest a prioritized next move.",
    inputs: ["analysis"],
    outputs: ["recommendation"],
    dependencies: ["analysis"],
    nextStep: "action_plan",
  },
  {
    id: "action_plan",
    type: "ACTION",
    title: "Action plan",
    description: "Convert the recommendation into an achievable next step.",
    inputs: ["recommendation"],
    outputs: ["action_plan"],
    dependencies: ["recommendation"],
    nextStep: "completion",
  },
  {
    id: "completion",
    type: "OUTPUT",
    title: "Completion",
    description: "Confirm the outcome and provide the next step.",
    inputs: ["action_plan"],
    outputs: ["outcome"],
    dependencies: ["action_plan"],
    nextStep: "",
  },
];

const defaultDna = (problem: string, user: string, outcome: string) => ({
  problem,
  user,
  journey: ["Define", "Assess", "Analyze", "Act"],
  components: ["Guide", "Assessment", "Recommendation", "Action plan"],
  intelligence: "Human-approved AI assistance",
  outcome,
});

const publicWorkspaceFixture = {
  projectId: "pst-public-fixture",
  slug: "authenticated-lifecycle-0cd705e8-274d3",
  blueprintId: "blueprint-pst-public-fixture",
  releaseId: "release-pst-public-fixture-v1-1",
  version: "v1.1",
} as const;

function compilerReadyPublicFixtureSnapshot(
  snapshot: PstReleaseSnapshot,
): PstReleaseSnapshot {
  const workflow: WorkflowStep[] = [
    {
      id: "context",
      type: "INPUT",
      title: "Konteks organisasi",
      description: "Berikan konteks singkat tentang organisasi yang menjalankan PST ini.",
      inputs: [],
      outputs: ["context.organization"],
      dependencies: [],
      nextStep: "answers",
      configuration: {
        canonical: { next: { type: "step", target: "answers" } },
        compilerReady: {
          operation: {
            type: "collect-context",
            fields: [{
              key: "context.organization",
              label: "Nama organisasi",
              type: "string",
              required: true,
            }],
            sessionPersistence: "customer_session",
          },
        },
      },
    },
    {
      id: "answers",
      type: "ANSWER",
      title: "Situasi utama",
      description: "Jelaskan situasi utama yang ingin Anda selesaikan.",
      inputs: ["context.organization"],
      outputs: ["answers.primary"],
      dependencies: ["context"],
      nextStep: "action",
      configuration: {
        canonical: { next: { type: "step", target: "action" } },
        compilerReady: {
          operation: {
            type: "collect-answers",
            schemaRef: "public-questions",
            answerFields: ["answers.primary"],
          },
        },
      },
    },
    {
      id: "action",
      type: "ACTION",
      title: "Rencana tindakan",
      description: "Susun tindakan berikutnya dari jawaban yang diberikan.",
      inputs: ["answers.primary"],
      outputs: ["derived.action"],
      dependencies: ["answers"],
      nextStep: "outcome",
      configuration: {
        canonical: { next: { type: "step", target: "outcome" } },
        compilerReady: {
          operation: {
            type: "action",
            actionRef: "public-action",
            output: "derived.action",
          },
        },
      },
    },
    {
      id: "outcome",
      type: "OUTCOME",
      title: "Hasil akhir",
      description: "Selesaikan journey dengan hasil yang eksplisit.",
      inputs: ["derived.action"],
      outputs: [],
      dependencies: ["action"],
      nextStep: "",
      configuration: {
        canonical: { next: { type: "complete" } },
        compilerReady: {
          operation: {
            type: "outcome",
            outcomeId: "outcome",
            outputRefs: ["derived.action"],
          },
        },
      },
    },
  ];
  const { snapshotHash: _snapshotHash, ...base } = snapshot;
  const payload: Omit<PstReleaseSnapshot, "snapshotHash"> = {
    ...base,
    blueprint: { ...base.blueprint, workflow },
    workflow,
    components: [{
      id: "public-questions",
      assetId: "asset-public-questions",
      name: "Pertanyaan publik",
      type: "TOOL",
      source: "Acceptance fixture",
      version: "1.0.0",
      status: "READY",
      required: true,
      configuration: {
        compilerReady: {
          capability: "question-schema",
          definition: {
            questions: [{
              id: "primary",
              label: "Situasi utama",
              type: "string",
              required: true,
            }],
          },
        },
      },
    }, {
      id: "public-action",
      assetId: "asset-public-action",
      name: "Tindakan publik",
      type: "TOOL",
      source: "Acceptance fixture",
      version: "1.0.0",
      status: "READY",
      required: true,
      configuration: {
        compilerReady: {
          capability: "action-template",
          definition: {
            items: [{
              id: "clarify-next-step",
              title: "Tetapkan tindakan berikutnya",
              description: "Pilih satu tindakan terukur berdasarkan situasi yang telah dijelaskan.",
            }],
          },
        },
      },
    }],
    rules: [],
    providers: [],
  };
  return { ...payload, snapshotHash: releaseSnapshotHash(payload) };
}

const makeBlueprint = (
  projectId: string,
  problem: string,
  user: string,
  outcome: string,
  id: string = randomUUID(),
) => ({
  id,
  projectId,
  problem,
  targetUser: user,
  desiredOutcome: outcome,
  problemType: "Assessment and action planning",
  journey: ["Profile", "Understand", "Assess", "Analyze", "Recommend", "Action plan"],
  knowledgeRequirements: ["A concise domain guide", "Clear criteria and expert rules"],
  componentRequirements: ["Guided assessment", "Scoring logic", "Recommendation", "Action plan"],
  aiRequirements: ["Explain results", "Recommend the next best action"],
  workflow: defaultWorkflow,
  expectedOutput: ["Assessment summary", "Priority recommendation", "Practical next steps"],
  actionPlan: ["Complete the assessment", "Review the recommendation", "Choose one next action"],
  nextStep: "Review and approve the proposed blueprint",
  version: "v0.1",
});

let seedPromise: Promise<void> | undefined;

function hasValidReleaseSnapshot(snapshot: unknown): snapshot is PstReleaseSnapshot {
  if (!snapshot || typeof snapshot !== "object") return false;
  const candidate = snapshot as {
    project?: { status?: unknown; publicationStatus?: unknown };
    blueprint?: { workflow?: unknown };
    workflow?: unknown;
    components?: unknown;
  };
  return candidate.project?.status === "PUBLISHED"
    && candidate.project.publicationStatus === "PUBLISHED"
    && Array.isArray(candidate.blueprint?.workflow)
    && candidate.blueprint.workflow.length > 0
    && Array.isArray(candidate.workflow)
    && candidate.workflow.length > 0
    && Array.isArray(candidate.components);
}

async function ensureSeedReferences() {
  const seedReferences = [
    {
      slug: "cashflow-health-check",
      patternId: "pattern-assessment",
      recipeId: "recipe-assessment",
      patternReferenceId: "project-pattern-cashflow-assessment",
      recipeReferenceId: "project-recipe-cashflow-assessment",
    },
    {
      slug: "decision-readiness-check-aa0f4",
      patternId: "pattern-decision",
      recipeId: "recipe-decision",
      patternReferenceId: "project-pattern-decision-readiness",
      recipeReferenceId: "project-recipe-decision-readiness",
    },
  ] as const;

  for (const reference of seedReferences) {
    const [project] = await db
      .select({ id: pstProjectsTable.id })
      .from(pstProjectsTable)
      .where(eq(pstProjectsTable.slug, reference.slug));
    if (!project) continue;
    const [pattern] = await db
      .select({ id: pstPatternsTable.id })
      .from(pstPatternsTable)
      .where(eq(pstPatternsTable.id, reference.patternId));
    const [recipe] = await db
      .select({ id: pstRecipesTable.id })
      .from(pstRecipesTable)
      .where(eq(pstRecipesTable.id, reference.recipeId));
    if (pattern) {
      await db.insert(pstProjectPatternsTable).values({
        id: reference.patternReferenceId,
        projectId: project.id,
        patternId: pattern.id,
      }).onConflictDoNothing();
    }
    if (recipe) {
      await db.insert(pstProjectRecipesTable).values({
        id: reference.recipeReferenceId,
        projectId: project.id,
        recipeId: recipe.id,
      }).onConflictDoNothing();
    }
  }
}

async function ensurePublicWorkspaceFixture() {
  let [project] = await db
    .select()
    .from(pstProjectsTable)
    .where(eq(pstProjectsTable.slug, publicWorkspaceFixture.slug));

  if (!project) {
    const fixtureBlueprint = makeBlueprint(
      publicWorkspaceFixture.projectId,
      "Teams need a reliable way to assess operational choices.",
      "Operations lead",
      "Choose one justified next action.",
      publicWorkspaceFixture.blueprintId,
    );
    await db.insert(pstProjectsTable).values({
      id: publicWorkspaceFixture.projectId,
      ownerId: "system",
      name: "Authenticated Lifecycle Fixture",
      slug: publicWorkspaceFixture.slug,
      description: "Deterministic published workspace used by PST routing checks.",
      status: "PUBLISHED",
      version: publicWorkspaceFixture.version,
      domain: "General",
      family: "Problem Solving",
      series: "Acceptance",
      problemStatement: fixtureBlueprint.problem,
      targetUser: fixtureBlueprint.targetUser,
      desiredOutcome: fixtureBlueprint.desiredOutcome,
      productDna: defaultDna(
        fixtureBlueprint.problem,
        fixtureBlueprint.targetUser,
        fixtureBlueprint.desiredOutcome,
      ),
      qaStatus: "PASS",
      publicationStatus: "PUBLISHED",
    });
    await db.insert(pstBlueprintsTable).values({
      ...fixtureBlueprint,
      version: publicWorkspaceFixture.version,
    });
    [project] = await db
      .select()
      .from(pstProjectsTable)
      .where(eq(pstProjectsTable.id, publicWorkspaceFixture.projectId));
  } else {
    const [existingBlueprint] = await db
      .select()
      .from(pstBlueprintsTable)
      .where(eq(pstBlueprintsTable.projectId, project.id));
    if (!existingBlueprint) {
      const fixtureBlueprint = makeBlueprint(
        project.id,
        project.problemStatement,
        project.targetUser,
        project.desiredOutcome,
        publicWorkspaceFixture.blueprintId,
      );
      await db.insert(pstBlueprintsTable).values({
        ...fixtureBlueprint,
        version: publicWorkspaceFixture.version,
      });
    }

    if (
      project.status !== "PUBLISHED"
      || project.version !== publicWorkspaceFixture.version
      || project.qaStatus !== "PASS"
      || project.publicationStatus !== "PUBLISHED"
    ) {
      [project] = await db
        .update(pstProjectsTable)
        .set({
          status: "PUBLISHED",
          version: publicWorkspaceFixture.version,
          qaStatus: "PASS",
          publicationStatus: "PUBLISHED",
          updatedAt: new Date(),
        })
        .where(eq(pstProjectsTable.id, project.id))
        .returning();
    }
  }

  if (!project) {
    throw new Error("Public PST fixture could not be initialized.");
  }

  const [blueprint] = await db
    .select()
    .from(pstBlueprintsTable)
    .where(eq(pstBlueprintsTable.projectId, project.id));
  if (!blueprint) {
    throw new Error("Public PST fixture blueprint could not be initialized.");
  }

  const snapshot = compilerReadyPublicFixtureSnapshot(await releaseSnapshot(
    project,
    blueprint,
    publicWorkspaceFixture.version,
  ));
  const [existingRelease] = await db
    .select()
    .from(pstReleasesTable)
    .where(
      and(
        eq(pstReleasesTable.projectId, project.id),
        eq(pstReleasesTable.version, publicWorkspaceFixture.version),
      ),
    );

  if (!existingRelease) {
    await db
      .insert(pstReleasesTable)
      .values({
        id: publicWorkspaceFixture.releaseId,
        projectId: project.id,
        version: publicWorkspaceFixture.version,
        snapshot,
      })
      .onConflictDoNothing();
  }
}

async function ensureSeedAssetCompatibility() {
  const [guidedAssessment] = await db
    .select({
      id: pstAssetsTable.id,
      tags: pstAssetsTable.tags,
    })
    .from(pstAssetsTable)
    .where(eq(pstAssetsTable.id, "asset-guided-assessment"));
  if (guidedAssessment && !guidedAssessment.tags.includes("questions")) {
    await db
      .update(pstAssetsTable)
      .set({
        tags: [...guidedAssessment.tags, "questions"],
        updatedAt: new Date(),
      })
      .where(eq(pstAssetsTable.id, guidedAssessment.id));
  }
}

async function ensureSeed(userId = "system") {
  if (!seedPromise) {
    seedPromise = (async () => {
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(pstAssetsTable);
      if (Number(count) > 0) {
        await ensureSeedReferences();
        await ensureSeedAssetCompatibility();
        await ensurePublicWorkspaceFixture();
        return;
      }

      const now = new Date();
      await db.insert(pstAssetsTable).values([
        {
          id: "asset-guided-assessment",
          name: "Guided assessment",
          type: "MINI_APP",
          description: "A structured question flow with clear answer states.",
          version: "v1.0",
          status: "ACTIVE",
          tags: ["assessment", "input", "core"],
          domain: "General",
          compatibility: ["ASSESSMENT", "Decision support"],
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "asset-scoring-framework",
          name: "Scoring framework",
          type: "TOOL",
          description: "Reusable scoring and interpretation rules.",
          version: "v1.0",
          status: "ACTIVE",
          tags: ["scoring", "analysis"],
          domain: "General",
          compatibility: ["ASSESSMENT", "Decision support"],
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "asset-outcome-guide",
          name: "Outcome guide",
          type: "KNOWLEDGE",
          description: "Plain-language guidance that keeps users moving.",
          version: "v1.0",
          status: "ACTIVE",
          tags: ["knowledge", "guide"],
          domain: "General",
          compatibility: ["*"],
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "asset-ai-recommendation",
          name: "Recommendation assistant",
          type: "AI",
          description: "Human-reviewed recommendation prompt pattern.",
          version: "v1.0",
          status: "ACTIVE",
          tags: ["ai", "recommendation"],
          domain: "General",
          compatibility: ["*"],
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "asset-action-plan",
          name: "Action plan worksheet",
          type: "TOOL",
          description: "Turns a recommendation into one concrete next move.",
          version: "v1.0",
          status: "ACTIVE",
          tags: ["worksheet", "action"],
          domain: "General",
          compatibility: ["*"],
          createdAt: now,
          updatedAt: now,
        },
      ]);
      await db.insert(pstPatternsTable).values([
        {
          id: "pattern-assessment",
          name: "Assessment pattern",
          description: "Questions to scoring to analysis to recommendation.",
          steps: ["Questions", "Scoring", "Analysis", "Recommendation"],
          usageCount: 1,
        },
        {
          id: "pattern-decision",
          name: "Decision pattern",
          description: "Compare options against criteria before acting.",
          steps: ["Options", "Criteria", "Scoring", "Recommendation", "Action"],
          usageCount: 0,
        },
        {
          id: "pattern-planning",
          name: "Planning pattern",
          description: "Map the gap between current state and goal.",
          steps: ["Goal", "Current state", "Gap", "Plan", "Action"],
          usageCount: 0,
        },
        {
          id: "pattern-document-analysis",
          name: "Document analysis pattern",
          description: "Turn an uploaded document into a useful report.",
          steps: ["Upload", "Extract", "Analyze", "Score", "Report"],
          usageCount: 0,
        },
      ]);
      await db.insert(pstRecipesTable).values([
        {
          id: "recipe-assessment",
          name: "Assessment recipe",
          description: "A reliable starting point for measurable problems.",
          components: ["Questions", "Scoring", "Analysis", "Recommendation"],
          usageCount: 1,
        },
        {
          id: "recipe-decision",
          name: "Decision recipe",
          description: "A structured decision experience with a next action.",
          components: ["Assessment", "Criteria", "Scoring", "AI recommendation", "Action plan"],
          usageCount: 0,
        },
        {
          id: "recipe-planning",
          name: "Planning recipe",
          description: "A guided path from current state to action.",
          components: ["Goal", "Current state", "Gap", "Plan", "Action"],
          usageCount: 0,
        },
      ]);

      const projectId = "pst-cashflow-check";
      const blueprint = makeBlueprint(
        projectId,
        "Business owners do not know whether their current cashflow is healthy.",
        "Small business owner",
        "Understand cashflow condition and know what to do next.",
      );
      await db.insert(pstProjectsTable).values({
        id: projectId,
        ownerId: userId,
        name: "Cashflow Health Check",
        slug: "cashflow-health-check",
        description: "A guided way to understand cashflow health and prioritize the next move.",
        status: "PREVIEW",
        version: "v0.1",
        domain: "Contractor",
        family: "Cashflow",
        series: "Cashflow Check",
        problemStatement: blueprint.problem,
        targetUser: blueprint.targetUser,
        desiredOutcome: blueprint.desiredOutcome,
        productDna: defaultDna(blueprint.problem, blueprint.targetUser, blueprint.desiredOutcome),
        qaStatus: "NOT_RUN",
        publicationStatus: "UNPUBLISHED",
      });
      await db.insert(pstBlueprintsTable).values(blueprint);
      await db.insert(pstProjectComponentsTable).values([
        {
          id: "component-cashflow-assessment",
          projectId,
          assetId: "asset-guided-assessment",
          name: "Guided assessment",
          type: "MINI_APP",
          source: "Asset Library",
          status: "READY",
          required: true,
        },
        {
          id: "component-cashflow-scoring",
          projectId,
          assetId: "asset-scoring-framework",
          name: "Scoring framework",
          type: "TOOL",
          source: "Asset Library",
          status: "READY",
          required: true,
        },
        {
          id: "component-cashflow-ai",
          projectId,
          assetId: "asset-ai-recommendation",
          name: "Recommendation assistant",
          type: "AI",
          source: "Asset Library",
          status: "READY",
          required: true,
        },
      ]);
      await db.insert(pstFactoryEventsTable).values([
        {
          id: "event-seed-project",
          type: "PST_CREATED",
          message: "Cashflow Health Check was added as a manufacturing example.",
          projectId,
        },
        {
          id: "event-seed-blueprint",
          type: "BLUEPRINT_GENERATED",
          message: "A first blueprint proposal is ready for review.",
          projectId,
        },
      ]);
      await ensureSeedReferences();
      await ensurePublicWorkspaceFixture();
    })();
  }
  await seedPromise;
  await ensureSeedReferences();
  await ensureSeedAssetCompatibility();
  await ensurePublicWorkspaceFixture();

  // Existing development databases were seeded before ownership existed.
  // Claim only the legacy seed project, never another user's project. The
  // conditional update is important: two first requests must not both add
  // themselves as members while racing to migrate the legacy owner.
  if (userId !== "system") {
    const [claimedSeedProject] = await db
      .update(pstProjectsTable)
      .set({ ownerId: userId, updatedAt: new Date() })
      .where(
        and(
          eq(pstProjectsTable.id, "pst-cashflow-check"),
          eq(pstProjectsTable.ownerId, "system"),
        ),
      )
      .returning({ id: pstProjectsTable.id });
    if (claimedSeedProject) {
      await db
        .insert(pstProjectMembersTable)
        .values({
          id: randomUUID(),
          projectId: claimedSeedProject.id,
          userId,
          role: "admin",
        })
        .onConflictDoNothing();
    }
  }
}

async function projectAggregate(projectId: string, userId: string) {
  const [project] = await db.select().from(pstProjectsTable).where(eq(pstProjectsTable.id, projectId));
  if (!project) return undefined;
  const [blueprint] = await db
    .select()
    .from(pstBlueprintsTable)
    .where(eq(pstBlueprintsTable.projectId, projectId));
  const components = await db
    .select({
      id: pstProjectComponentsTable.id,
      name: pstProjectComponentsTable.name,
      type: pstProjectComponentsTable.type,
      source: pstProjectComponentsTable.source,
      status: pstProjectComponentsTable.status,
    })
    .from(pstProjectComponentsTable)
    .where(eq(pstProjectComponentsTable.projectId, projectId));
  const { selectedPatterns, selectedRecipes } = await getProjectReferences(projectId, userId);
  return {
    ...project,
    blueprint: blueprint ?? makeBlueprint(projectId, project.problemStatement, project.targetUser, project.desiredOutcome),
    components,
    selectedPatterns,
    selectedRecipes,
  };
}

async function latestRelease(projectId: string) {
  const [release] = await db
    .select()
    .from(pstReleasesTable)
    .where(eq(pstReleasesTable.projectId, projectId))
    .orderBy(desc(pstReleasesTable.createdAt), desc(pstReleasesTable.id))
    .limit(1);
  return release;
}

function releaseNumber(version?: string) {
  const match = version?.match(/^v(\d+)/);
  return match ? Number(match[1]) : 0;
}

type PstSelectExecutor = Pick<typeof db, "select">;

async function nextReleaseVersion(projectId: string, query: PstSelectExecutor = db) {
  const [release] = await query
    .select({ version: pstReleasesTable.version })
    .from(pstReleasesTable)
    .where(eq(pstReleasesTable.projectId, projectId))
    .orderBy(desc(pstReleasesTable.createdAt), desc(pstReleasesTable.id))
    .limit(1);
  return `v${releaseNumber(release?.version) + 1}.0`;
}

class PublishConflictError extends Error {}
class PublishRequirementError extends Error {}
class PublicWorkspaceConsistencyError extends Error {}

const publishConflictMessage =
  "This PST was published by another request. Refresh the project before retrying.";

async function releaseSnapshot(
  project: typeof pstProjectsTable.$inferSelect,
  blueprint: typeof pstBlueprintsTable.$inferSelect,
  version: string,
  query: PstSelectExecutor = db,
): Promise<PstReleaseSnapshot> {
  const components = await query
    .select()
    .from(pstProjectComponentsTable)
    .where(eq(pstProjectComponentsTable.projectId, project.id));
  const assetIds = components.map((component) => component.assetId);
  const assets = assetIds.length
    ? await query
      .select()
      .from(pstAssetsTable)
      .where(inArray(pstAssetsTable.id, assetIds))
    : [];
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  const [patternReference] = await query
    .select({ patternId: pstProjectPatternsTable.patternId })
    .from(pstProjectPatternsTable)
    .where(eq(pstProjectPatternsTable.projectId, project.id))
    .limit(1);
  const [recipeReference] = await query
    .select({ recipeId: pstProjectRecipesTable.recipeId })
    .from(pstProjectRecipesTable)
    .where(eq(pstProjectRecipesTable.projectId, project.id))
    .limit(1);
  const [pattern] = patternReference
    ? await query
      .select()
      .from(pstPatternsTable)
      .where(eq(pstPatternsTable.id, patternReference.patternId))
      .limit(1)
    : [];
  const [recipe] = recipeReference
    ? await query
      .select()
      .from(pstRecipesTable)
      .where(eq(pstRecipesTable.id, recipeReference.recipeId))
      .limit(1)
    : [];
  const declarations = resolveReleaseDeclarations(blueprint.workflow);
  if (declarations.errors.length) {
    throw new PublishRequirementError(
      `Release configuration is incomplete or unsafe: ${declarations.errors.join(" ")}`,
    );
  }
  const snapshot: Omit<PstReleaseSnapshot, "snapshotHash"> = {
    sourceSchemaVersion: "pst-release-snapshot.v1" as const,
    snapshotHashAlgorithm: releaseSnapshotHashAlgorithm,
    project: {
      name: project.name,
      description: project.description,
      status: "PUBLISHED",
      version,
      domain: project.domain,
      family: project.family,
      series: project.series,
      problemStatement: project.problemStatement,
      targetUser: project.targetUser,
      desiredOutcome: project.desiredOutcome,
      productDna: project.productDna,
      qaStatus: project.qaStatus,
      publicationStatus: "PUBLISHED",
    },
    blueprint: {
      ...blueprint,
      version,
      updatedAt: blueprint.updatedAt.toISOString(),
    },
    workflow: blueprint.workflow,
    ...(pattern ? {
      pattern: {
        id: pattern.id,
        name: pattern.name,
        version: pattern.version,
        description: pattern.description,
        steps: pattern.steps,
      },
    } : {}),
    ...(recipe ? {
      recipe: {
        id: recipe.id,
        name: recipe.name,
        version: recipe.version,
        description: recipe.description,
        components: recipe.components,
      },
    } : {}),
    components: components
      .map(({ id, assetId, name, type, source, status, required }) => {
        const asset = assetsById.get(assetId);
        return {
          id,
          assetId,
          name,
          type,
          source,
          ...(asset ? {
            version: asset.version,
            configuration: {
              description: asset.description,
              tags: asset.tags,
              domain: asset.domain,
              compatibility: asset.compatibility,
            },
          } : {}),
          status,
          required,
        };
      })
      .sort((left, right) => left.id.localeCompare(right.id)),
    rules: declarations.rules,
    providers: declarations.providers,
  };
  return {
    ...snapshot,
    snapshotHash: releaseSnapshotHash(snapshot),
  };
}

async function getPatternUsage(patternId: string, userId: string) {
  const projects = await db
    .select({ id: pstProjectsTable.id, name: pstProjectsTable.name })
    .from(pstProjectPatternsTable)
    .innerJoin(pstProjectsTable, eq(pstProjectsTable.id, pstProjectPatternsTable.projectId))
    .where(
      and(
        eq(pstProjectPatternsTable.patternId, patternId),
        or(
          eq(pstProjectsTable.ownerId, userId),
          exists(
            db
              .select({ id: pstProjectMembersTable.id })
              .from(pstProjectMembersTable)
              .where(
                and(
                  eq(pstProjectMembersTable.projectId, pstProjectsTable.id),
                  eq(pstProjectMembersTable.userId, userId),
                ),
              ),
          ),
        ),
      ),
    );
  return {
    usageCount: projects.length,
    projectIds: projects.map((project) => project.id),
    projects,
  };
}

async function getRecipeUsage(recipeId: string, userId: string) {
  const projects = await db
    .select({ id: pstProjectsTable.id, name: pstProjectsTable.name })
    .from(pstProjectRecipesTable)
    .innerJoin(pstProjectsTable, eq(pstProjectsTable.id, pstProjectRecipesTable.projectId))
    .where(
      and(
        eq(pstProjectRecipesTable.recipeId, recipeId),
        or(
          eq(pstProjectsTable.ownerId, userId),
          exists(
            db
              .select({ id: pstProjectMembersTable.id })
              .from(pstProjectMembersTable)
              .where(
                and(
                  eq(pstProjectMembersTable.projectId, pstProjectsTable.id),
                  eq(pstProjectMembersTable.userId, userId),
                ),
              ),
          ),
        ),
      ),
    );
  return {
    usageCount: projects.length,
    projectIds: projects.map((project) => project.id),
    projects,
  };
}

async function getProjectReferences(projectId: string, userId: string) {
  const [patternReferences, recipeReferences] = await Promise.all([
    db.select({ patternId: pstProjectPatternsTable.patternId })
      .from(pstProjectPatternsTable)
      .where(eq(pstProjectPatternsTable.projectId, projectId)),
    db.select({ recipeId: pstProjectRecipesTable.recipeId })
      .from(pstProjectRecipesTable)
      .where(eq(pstProjectRecipesTable.projectId, projectId)),
  ]);
  const patternIds = patternReferences.map(({ patternId }) => patternId);
  const recipeIds = recipeReferences.map(({ recipeId }) => recipeId);
  const [patterns, recipes] = await Promise.all([
    patternIds.length
      ? db.select().from(pstPatternsTable).where(inArray(pstPatternsTable.id, patternIds))
      : Promise.resolve([]),
    recipeIds.length
      ? db.select().from(pstRecipesTable).where(inArray(pstRecipesTable.id, recipeIds))
      : Promise.resolve([]),
  ]);
  return {
    selectedPatterns: await Promise.all(patterns.map(async (pattern) => ({
      ...pattern,
      ...(await getPatternUsage(pattern.id, userId)),
    }))),
    selectedRecipes: await Promise.all(recipes.map(async (recipe) => ({
      ...recipe,
      ...(await getRecipeUsage(recipe.id, userId)),
    }))),
  };
}

type ReferenceSelectionInput = {
  patternId?: string | null;
  recipeId?: string | null;
};

async function applyProjectReferences(projectId: string, input: ReferenceSelectionInput) {
  const pattern = input.patternId ? (await db.select().from(pstPatternsTable).where(eq(pstPatternsTable.id, input.patternId)))[0] : undefined;
  const recipe = input.recipeId ? (await db.select().from(pstRecipesTable).where(eq(pstRecipesTable.id, input.recipeId)))[0] : undefined;
  if (input.patternId && !pattern) return { error: "Selected PST pattern was not found." };
  if (input.recipeId && !recipe) return { error: "Selected PST recipe was not found." };

  if (input.patternId !== undefined) {
    await db.delete(pstProjectPatternsTable).where(eq(pstProjectPatternsTable.projectId, projectId));
    if (pattern) {
      await db.insert(pstProjectPatternsTable).values({
        id: randomUUID(),
        projectId,
        patternId: pattern.id,
      });
    }
  }
  if (input.recipeId !== undefined) {
    await db.delete(pstProjectRecipesTable).where(eq(pstProjectRecipesTable.projectId, projectId));
    if (recipe) {
      await db.insert(pstProjectRecipesTable).values({
        id: randomUUID(),
        projectId,
        recipeId: recipe.id,
      });
    }
  }
  return { pattern, recipe };
}

async function currentProjectReferences(projectId: string, userId: string) {
  const references = await getProjectReferences(projectId, userId);
  return {
    pattern: references.selectedPatterns[0],
    recipe: references.selectedRecipes[0],
  };
}

async function addEvent(type: string, message: string, projectId?: string) {
  await db.insert(pstFactoryEventsTable).values({
    id: randomUUID(),
    type,
    message,
    projectId,
  });
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "pst";
}

function currentUserId(req: Request) {
  const auth = getAuth(req) as {
    sessionClaims?: { userId?: string };
    userId?: string;
  };
  return auth.sessionClaims?.userId || auth.userId;
}

async function accessibleProjectIds(userId: string) {
  const [owned, memberships] = await Promise.all([
    db
      .select({ id: pstProjectsTable.id })
      .from(pstProjectsTable)
      .where(eq(pstProjectsTable.ownerId, userId)),
    db
      .select({ id: pstProjectMembersTable.projectId })
      .from(pstProjectMembersTable)
      .where(eq(pstProjectMembersTable.userId, userId)),
  ]);
  return [...new Set([...owned.map(({ id }) => id), ...memberships.map(({ id }) => id)])];
}

type ProjectAccess = {
  project: typeof pstProjectsTable.$inferSelect;
  role: PstProjectRole;
  userId: string;
};

async function authorizeProject(
  req: Request,
  res: Response,
  projectId: string,
  roles?: readonly PstProjectRole[],
): Promise<ProjectAccess | undefined> {
  const userId = currentUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  await ensureSeed(userId);
  const [projectAccess] = await db
    .select({
      project: pstProjectsTable,
      memberRole: pstProjectMembersTable.role,
    })
    .from(pstProjectsTable)
    .leftJoin(
      pstProjectMembersTable,
      and(
        eq(pstProjectMembersTable.projectId, pstProjectsTable.id),
        eq(pstProjectMembersTable.userId, userId),
      ),
    )
    .where(
      and(
        eq(pstProjectsTable.id, projectId),
        or(
          eq(pstProjectsTable.ownerId, userId),
          eq(pstProjectMembersTable.userId, userId),
        ),
      ),
    );
  if (!projectAccess) {
    // Keep missing and cross-owner projects indistinguishable.
    res.status(404).json({ error: "PST project not found" });
    return;
  }

  const { project, memberRole } = projectAccess;
  const role: PstProjectRole | undefined =
    project.ownerId === userId ? "admin" : memberRole ?? undefined;
  if (!role) {
    // Keep this guard aligned with the scoped query above if role data is ever extended.
    res.status(404).json({ error: "PST project not found" });
    return;
  }
  if (roles && !roles.includes(role)) {
    res.status(403).json({
      error: `This action requires one of: ${roles.join(", ")}.`,
      role,
    });
    return;
  }
  return { project, role, userId };
}

const editorRoles: readonly PstProjectRole[] = ["admin", "editor"];
const adminRoles: readonly PstProjectRole[] = ["admin"];

async function publicWorkspace(slug: string) {
  const [project] = await db
    .select()
    .from(pstProjectsTable)
    .where(eq(pstProjectsTable.slug, slug));
  if (!project) return undefined;
  if (project.publicationStatus !== "PUBLISHED") {
    return undefined;
  }
  const release = await latestRelease(project.id);
  if (!release) {
    throw new PublicWorkspaceConsistencyError(
      "Published customer workspace is missing its active release snapshot.",
    );
  }
  if (release.version !== project.version || !hasValidReleaseSnapshot(release.snapshot)) {
    throw new PublicWorkspaceConsistencyError(
      "Published customer workspace has an invalid active release snapshot.",
    );
  }
  const snapshot = release.snapshot;
  const executable = compileExecutableRelease(release, project.slug, snapshot);
  if (executable.status === "BLOCKED") {
    const first = executable.diagnostics[0];
    throw new PublicWorkspaceConsistencyError(
      first
        ? `Published customer workspace cannot be compiled: ${first.code} at ${first.path}.`
        : "Published customer workspace cannot be compiled.",
    );
  }
  const publicWorkflow = publicCustomerWorkspaceSteps(snapshot.workflow);
  return {
    id: project.id,
    name: snapshot.project.name,
    slug: project.slug,
    description: snapshot.project.description,
    status: "PUBLISHED",
    publicationStatus: "PUBLISHED",
    version: release.version,
    domain: snapshot.project.domain,
    family: snapshot.project.family,
    series: snapshot.project.series,
    problemStatement: snapshot.project.problemStatement,
    targetUser: snapshot.project.targetUser,
    desiredOutcome: snapshot.project.desiredOutcome,
    productDna: {
      problem: snapshot.project.productDna.problem,
      user: snapshot.project.productDna.user,
      journey: snapshot.project.productDna.journey,
      outcome: snapshot.project.productDna.outcome,
    },
    blueprint: {
      id: snapshot.blueprint.id,
      projectId: snapshot.blueprint.projectId,
      problem: snapshot.blueprint.problem,
      targetUser: snapshot.blueprint.targetUser,
      desiredOutcome: snapshot.blueprint.desiredOutcome,
      problemType: snapshot.blueprint.problemType,
      journey: snapshot.blueprint.journey,
      workflow: publicWorkflow,
      expectedOutput: snapshot.blueprint.expectedOutput,
      actionPlan: snapshot.blueprint.actionPlan,
      nextStep: snapshot.blueprint.nextStep,
      version: release.version,
      updatedAt: new Date(release.createdAt),
    },
    definition: executable.definition,
  };
}

router.get("/pst/dashboard/summary", async (_req, res): Promise<void> => {
  const userId = currentUserId(_req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  await ensureSeed(userId);
  const projectIds = await accessibleProjectIds(userId);
  if (!projectIds.length) {
    res.json(GetDashboardSummaryResponse.parse({
      totalProjects: 0,
      activeProjects: 0,
      publishedProjects: 0,
      assets: 0,
      reuseRate: 0,
      qaPassRate: 0,
    }));
    return;
  }
  const [projects] = await db
    .select({
      totalProjects: sql<number>`count(*)`,
      activeProjects: sql<number>`count(*) filter (where ${pstProjectsTable.status} not in ('ARCHIVED', 'PUBLISHED'))`,
      publishedProjects: sql<number>`count(*) filter (where ${pstProjectsTable.publicationStatus} = 'PUBLISHED')`,
    })
    .from(pstProjectsTable)
    .where(inArray(pstProjectsTable.id, projectIds));
  const [assets] = await db.select({ count: sql<number>`count(*)` }).from(pstAssetsTable);
  const [reuse] = await db
    .select({ count: sql<number>`count(*)` })
    .from(pstProjectComponentsTable)
    .where(
      and(
        eq(pstProjectComponentsTable.source, "Asset Library"),
        inArray(pstProjectComponentsTable.projectId, projectIds),
      ),
    );
  const [qa] = await db
    .select({ total: sql<number>`count(*)`, passed: sql<number>`count(*) filter (where ${pstQaRunsTable.status} = 'PASS')` })
    .from(pstQaRunsTable)
    .where(inArray(pstQaRunsTable.projectId, projectIds));
  res.json(GetDashboardSummaryResponse.parse({
    totalProjects: Number(projects.totalProjects),
    activeProjects: Number(projects.activeProjects),
    publishedProjects: Number(projects.publishedProjects),
    assets: Number(assets.count),
    reuseRate: Number(reuse.count) > 0 ? Math.min(100, Number(reuse.count) * 20) : 0,
    qaPassRate: Number(qa.total) > 0 ? (Number(qa.passed) / Number(qa.total)) * 100 : 0,
  }));
});

router.get("/pst/dashboard/activity", async (req, res): Promise<void> => {
  const userId = currentUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  await ensureSeed(userId);
  const projectIds = await accessibleProjectIds(userId);
  if (!projectIds.length) {
    res.json([]);
    return;
  }
  const events = await db.select().from(pstFactoryEventsTable)
    .where(inArray(pstFactoryEventsTable.projectId, projectIds))
    .orderBy(desc(pstFactoryEventsTable.createdAt)).limit(12);
  res.json(GetDashboardActivityResponse.parse(events));
});

router.get("/pst/projects", async (req, res): Promise<void> => {
  const userId = currentUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  await ensureSeed(userId);
  const projectIds = await accessibleProjectIds(userId);
  const query = ListPstProjectsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  if (!projectIds.length) {
    res.json([]);
    return;
  }
  const filters: SQL[] = [inArray(pstProjectsTable.id, projectIds)];
  if (query.data.status) filters.push(eq(pstProjectsTable.status, query.data.status));
  if (query.data.search) {
    const term = `%${query.data.search}%`;
    const searchFilter = or(
      ilike(pstProjectsTable.name, term),
      ilike(pstProjectsTable.description, term),
    );
    if (searchFilter) filters.push(searchFilter);
  }
  const projects = await db.select().from(pstProjectsTable)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(pstProjectsTable.updatedAt));
  const aggregates = await Promise.all(projects.map((project) => projectAggregate(project.id, userId)));
  res.json(ListPstProjectsResponse.parse(aggregates.filter(Boolean)));
});

router.post("/pst/projects", async (req, res): Promise<void> => {
  const userId = currentUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const body = CreatePstProjectBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const id = randomUUID();
  const blueprint = makeBlueprint(id, body.data.problemStatement, body.data.targetUser, body.data.desiredOutcome);
  const project = {
    id,
    ownerId: userId,
    name: body.data.name,
    slug: `${slugify(body.data.name)}-${id.slice(0, 5)}`,
    description: body.data.description ?? "",
    status: "DRAFT",
    version: "v0.1",
    domain: body.data.domain ?? "General",
    family: body.data.family ?? "Problem Solving",
    series: body.data.series ?? "First Series",
    problemStatement: body.data.problemStatement,
    targetUser: body.data.targetUser,
    desiredOutcome: body.data.desiredOutcome,
    productDna: defaultDna(body.data.problemStatement, body.data.targetUser, body.data.desiredOutcome),
    qaStatus: "NOT_RUN",
    publicationStatus: "UNPUBLISHED",
  };
  await db.insert(pstProjectsTable).values(project);
  await db.insert(pstProjectMembersTable).values({
    id: randomUUID(),
    projectId: id,
    userId,
    role: "admin",
  });
  await db.insert(pstBlueprintsTable).values(blueprint);
  await addEvent("PST_CREATED", `${project.name} was created as a draft.`, id);
  const aggregate = await projectAggregate(id, userId);
  res.status(201).json(CreatePstProjectResponse.parse(aggregate));
});

router.get("/pst/projects/:projectId", async (req, res): Promise<void> => {
  const params = GetPstProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const access = await authorizeProject(req, res, params.data.projectId);
  if (!access) {
    return;
  }
  const aggregate = await projectAggregate(access.project.id, access.userId);
  res.json(GetPstProjectResponse.parse(aggregate));
});

router.patch("/pst/projects/:projectId", async (req, res): Promise<void> => {
  const params = UpdatePstProjectParams.safeParse(req.params);
  const body = UpdatePstProjectBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: !params.success ? params.error.message : body.error?.message ?? "Invalid request body" });
    return;
  }
  const access = await authorizeProject(req, res, params.data.projectId, editorRoles);
  if (!access) {
    return;
  }
  const [updated] = await db.update(pstProjectsTable).set({ ...body.data, updatedAt: new Date() }).where(eq(pstProjectsTable.id, access.project.id)).returning();
  await addEvent("BLUEPRINT_EDITED", `${updated.name} project details were edited.`, updated.id);
  res.json(UpdatePstProjectResponse.parse(await projectAggregate(updated.id, access.userId)));
});

router.post("/pst/projects/:projectId/duplicate", async (req, res): Promise<void> => {
  const params = DuplicatePstProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const access = await authorizeProject(req, res, params.data.projectId, editorRoles);
  if (!access) {
    return;
  }
  const source = await projectAggregate(access.project.id, access.userId);
  if (!source) {
    res.status(404).json({ error: "PST project not found" });
    return;
  }
  const id = randomUUID();
  const duplicate = {
    id,
    ownerId: currentUserId(req) ?? access.project.ownerId,
    name: `${source.name} — Copy`,
    slug: `${source.slug}-copy-${id.slice(0, 5)}`,
    description: source.description,
    status: "DRAFT",
    version: "v0.1",
    domain: source.domain,
    family: source.family,
    series: source.series,
    problemStatement: source.problemStatement,
    targetUser: source.targetUser,
    desiredOutcome: source.desiredOutcome,
    productDna: source.productDna,
    qaStatus: "NOT_RUN",
    publicationStatus: "UNPUBLISHED",
  };
  await db.insert(pstProjectsTable).values(duplicate);
  await db.insert(pstProjectMembersTable).values({
    id: randomUUID(),
    projectId: id,
    userId: currentUserId(req) ?? access.project.ownerId,
    role: "admin",
  });
  await db.insert(pstBlueprintsTable).values({ ...source.blueprint, id: randomUUID(), projectId: id, version: "v0.1", updatedAt: new Date() });
  for (const component of source.components) {
    const [original] = await db.select().from(pstProjectComponentsTable).where(eq(pstProjectComponentsTable.id, component.id));
    if (original) await db.insert(pstProjectComponentsTable).values({ ...original, id: randomUUID(), projectId: id });
  }
  await addEvent("PST_CREATED", `${duplicate.name} was duplicated with reusable components.`, id);
  res.status(201).json(DuplicatePstProjectResponse.parse(await projectAggregate(id, access.userId)));
});

router.post("/pst/projects/:projectId/archive", async (req, res): Promise<void> => {
  const params = ArchivePstProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const access = await authorizeProject(req, res, params.data.projectId, adminRoles);
  if (!access) {
    return;
  }
  const [updated] = await db.update(pstProjectsTable).set({ status: "ARCHIVED", publicationStatus: "ARCHIVED", updatedAt: new Date() }).where(eq(pstProjectsTable.id, access.project.id)).returning();
  await addEvent("PST_ARCHIVED", `${updated.name} was archived.`, updated.id);
  res.json(ArchivePstProjectResponse.parse(await projectAggregate(updated.id, access.userId)));
});

router.post("/pst/projects/:projectId/architect", async (req, res): Promise<void> => {
  const params = RunPstArchitectParams.safeParse(req.params);
  const body = RunPstArchitectBody.safeParse(req.body ?? {});
  if (!params.success || !body.success) {
    res.status(400).json({ error: !params.success ? params.error.message : body.error?.message ?? "Invalid request body" });
    return;
  }
  const access = await authorizeProject(req, res, params.data.projectId, editorRoles);
  if (!access) {
    return;
  }
  const project = access.project;
  const appliedReferences = await applyProjectReferences(project.id, {
    patternId: body.data.patternId,
    recipeId: body.data.recipeId,
  });
  if (appliedReferences.error) {
    res.status(400).json({ error: appliedReferences.error });
    return;
  }
  const references = await currentProjectReferences(project.id, access.userId);
  const proposal = await aiProvider.proposeBlueprint({
    problem: project.problemStatement,
    targetUser: project.targetUser,
    desiredOutcome: project.desiredOutcome,
    additionalContext: [
      body.data.additionalContext,
      references.pattern ? `Use the "${references.pattern.name}" pattern as the journey structure.` : undefined,
      references.recipe ? `Use the "${references.recipe.name}" recipe as the component structure.` : undefined,
    ].filter(Boolean).join(" "),
    pattern: references.pattern
      ? { name: references.pattern.name, steps: references.pattern.steps }
      : undefined,
    recipe: references.recipe
      ? { name: references.recipe.name, components: references.recipe.components }
      : undefined,
  });
  const workflowSource = references.pattern
    ? { type: "pattern" as const, id: references.pattern.id, name: references.pattern.name }
    : references.recipe
      ? { type: "recipe" as const, id: references.recipe.id, name: references.recipe.name }
      : undefined;
  const blueprintProposal = {
    ...proposal,
    journey: references.pattern?.steps ?? proposal.journey,
    componentRequirements: references.recipe?.components ?? proposal.componentRequirements,
    workflow: workflowSource
      ? workflowFromStructure(references.pattern?.steps ?? references.recipe?.components ?? [], workflowSource)
      : defaultWorkflow,
  };
  const [updated] = await db.update(pstBlueprintsTable).set({ ...blueprintProposal, updatedAt: new Date() }).where(eq(pstBlueprintsTable.projectId, project.id)).returning();
  await db.update(pstProjectsTable).set({ status: "ARCHITECTED", updatedAt: new Date() }).where(eq(pstProjectsTable.id, project.id));
  await addEvent("BLUEPRINT_GENERATED", `${project.name} received a blueprint proposal from MOCK AI.`, project.id);
  res.json(RunPstArchitectResponse.parse(updated));
});

router.get("/pst/projects/:projectId/blueprint", async (req, res): Promise<void> => {
  const params = GetPstBlueprintParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const access = await authorizeProject(req, res, params.data.projectId);
  if (!access) {
    return;
  }
  const [blueprint] = await db.select().from(pstBlueprintsTable).where(eq(pstBlueprintsTable.projectId, access.project.id));
  if (!blueprint) {
    res.status(404).json({ error: "PST blueprint not found" });
    return;
  }
  res.json(GetPstBlueprintResponse.parse(blueprint));
});

router.patch("/pst/projects/:projectId/blueprint", async (req, res): Promise<void> => {
  const params = UpdatePstBlueprintParams.safeParse(req.params);
  const body = UpdatePstBlueprintBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: !params.success ? params.error.message : body.error?.message ?? "Invalid request body" });
    return;
  }
  const access = await authorizeProject(req, res, params.data.projectId, editorRoles);
  if (!access) {
    return;
  }
  const [updated] = await db.update(pstBlueprintsTable).set({ ...body.data, updatedAt: new Date() }).where(eq(pstBlueprintsTable.projectId, access.project.id)).returning();
  if (!updated) {
    res.status(404).json({ error: "PST blueprint not found" });
    return;
  }
  await db.update(pstProjectsTable).set({ status: "BLUEPRINT_READY", updatedAt: new Date() }).where(eq(pstProjectsTable.id, access.project.id));
  await addEvent("BLUEPRINT_EDITED", "Blueprint changes were saved for human review.", access.project.id);
  res.json(UpdatePstBlueprintResponse.parse(updated));
});

router.get("/pst/assets", async (req, res): Promise<void> => {
  await ensureSeed();
  const query = ListPstAssetsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const filters = [];
  if (query.data.type) filters.push(eq(pstAssetsTable.type, query.data.type));
  if (query.data.search) filters.push(or(ilike(pstAssetsTable.name, `%${query.data.search}%`), ilike(pstAssetsTable.description, `%${query.data.search}%`)));
  const assets = await db.select().from(pstAssetsTable).where(filters.length ? and(...filters) : undefined).orderBy(pstAssetsTable.name);
  res.json(ListPstAssetsResponse.parse(assets));
});

router.get("/pst/patterns", async (req, res): Promise<void> => {
  const userId = currentUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  await ensureSeed(userId);
  const patterns = await db.select().from(pstPatternsTable).orderBy(pstPatternsTable.name);
  const enrichedPatterns = await Promise.all(patterns.map(async (pattern) => ({
    ...pattern,
    ...(await getPatternUsage(pattern.id, userId)),
  })));
  res.json(ListPstPatternsResponse.parse(enrichedPatterns));
});

router.get("/pst/recipes", async (req, res): Promise<void> => {
  const userId = currentUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  await ensureSeed(userId);
  const recipes = await db.select().from(pstRecipesTable).orderBy(pstRecipesTable.name);
  const enrichedRecipes = await Promise.all(recipes.map(async (recipe) => ({
    ...recipe,
    ...(await getRecipeUsage(recipe.id, userId)),
  })));
  res.json(ListPstRecipesResponse.parse(enrichedRecipes));
});

router.post("/pst/projects/:projectId/builder", async (req, res): Promise<void> => {
  const params = BuildPstProjectParams.safeParse(req.params);
  const body = BuildPstProjectBody.safeParse(req.body ?? {});
  if (!params.success || !body.success) {
    res.status(400).json({ error: !params.success ? params.error.message : body.error?.message ?? "Invalid request body" });
    return;
  }
  const access = await authorizeProject(req, res, params.data.projectId, editorRoles);
  if (!access) {
    return;
  }
  const [blueprint] = await db.select().from(pstBlueprintsTable).where(eq(pstBlueprintsTable.projectId, access.project.id));
  if (!blueprint) {
    res.status(404).json({ error: "PST blueprint not found" });
    return;
  }
  await ensureSeed();
  const appliedReferences = await applyProjectReferences(access.project.id, {
    patternId: body.data.patternId,
    recipeId: body.data.recipeId,
  });
  if (appliedReferences.error) {
    res.status(400).json({ error: appliedReferences.error });
    return;
  }
  const references = await currentProjectReferences(access.project.id, access.userId);
  const selectedAssets = body.data.assetIds?.length
    ? await db.select().from(pstAssetsTable).where(inArray(pstAssetsTable.id, body.data.assetIds))
    : await db.select().from(pstAssetsTable).where(eq(pstAssetsTable.status, "ACTIVE")).limit(5);
  const buildPlan = buildFromConfiguration({
    blueprint,
    assets: selectedAssets,
    pattern: references.pattern
      ? { type: "pattern", id: references.pattern.id, name: references.pattern.name, steps: references.pattern.steps }
      : undefined,
    recipe: references.recipe
      ? { type: "recipe", id: references.recipe.id, name: references.recipe.name, components: references.recipe.components }
      : undefined,
    idFactory: randomUUID,
  });
  if (buildPlan.source) {
    await db.update(pstBlueprintsTable).set({
      journey: buildPlan.journey,
      componentRequirements: buildPlan.componentRequirements,
      workflow: buildPlan.workflow,
      updatedAt: new Date(),
    }).where(eq(pstBlueprintsTable.projectId, access.project.id));
  }
  await db.delete(pstProjectComponentsTable).where(eq(pstProjectComponentsTable.projectId, access.project.id));
  for (const asset of buildPlan.readyAssets) {
    await db.insert(pstProjectComponentsTable).values({
      id: randomUUID(),
      projectId: access.project.id,
      assetId: asset.id,
      name: asset.name,
      type: asset.type,
      source: "Asset Library",
      status: "READY",
      required: true,
    });
  }
  await db.update(pstProjectsTable).set({ status: buildPlan.status === "BLOCKED" ? "BUILDING" : "PREVIEW", updatedAt: new Date() }).where(eq(pstProjectsTable.id, access.project.id));
  await addEvent("BUILD_COMPLETED", `Builder finished with ${buildPlan.status.toLowerCase()} status.`, access.project.id);
  res.json(BuildPstProjectResponse.parse({
    status: buildPlan.status,
    ready: buildPlan.ready,
    missing: buildPlan.missing,
    warnings: buildPlan.warnings,
    errors: buildPlan.errors,
    components: buildPlan.components,
  }));
});

router.post("/pst/projects/:projectId/simulate", async (req, res): Promise<void> => {
  const params = SimulatePstProjectParams.safeParse(req.params);
  const body = SimulatePstProjectBody.safeParse(req.body ?? {});
  if (!params.success || !body.success) {
    res.status(400).json({ error: !params.success ? params.error.message : body.error?.message ?? "Invalid request body" });
    return;
  }
  const access = await authorizeProject(req, res, params.data.projectId, editorRoles);
  if (!access) {
    return;
  }
  const project = await projectAggregate(access.project.id, access.userId);
  if (!project) {
    res.status(404).json({ error: "PST project not found" });
    return;
  }
  const checks = [
    "Start state is reachable",
    "Required inputs are labeled",
    "Workflow transitions are connected",
    `Simulation mode: ${body.data.mode ?? "MANUAL"}`,
    "Output maps to the desired outcome",
  ];
  const status = project.components.length >= 3 ? "PASS" : "WARNING";
  const [simulation] = await db.insert(pstSimulationsTable).values({ id: randomUUID(), projectId: project.id, status, checks }).returning();
  await addEvent("SIMULATION_EXECUTED", `A ${body.data.mode ?? "MANUAL"} simulation was executed.`, project.id);
  res.json(SimulatePstProjectResponse.parse(simulation));
});

router.post("/pst/projects/:projectId/qa", async (req, res): Promise<void> => {
  const params = RunPstQaParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const access = await authorizeProject(req, res, params.data.projectId, editorRoles);
  if (!access) {
    return;
  }
  const project = await projectAggregate(access.project.id, access.userId);
  if (!project) {
    res.status(404).json({ error: "PST project not found" });
    return;
  }
  const componentRows = await db
    .select({
      name: pstProjectComponentsTable.name,
      status: pstProjectComponentsTable.status,
      assetId: pstProjectComponentsTable.assetId,
    })
    .from(pstProjectComponentsTable)
    .where(eq(pstProjectComponentsTable.projectId, project.id));
  const assetIds = componentRows.map((component) => component.assetId);
  const assets = assetIds.length
    ? await db.select().from(pstAssetsTable).where(inArray(pstAssetsTable.id, assetIds))
    : [];
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  const results: QaResult[] = evaluateQa({
    ...project,
    components: componentRows.map((component) => {
      const asset = assetById.get(component.assetId);
      return {
        name: component.name,
        status: component.status,
        description: asset?.description,
        tags: asset?.tags,
        compatibility: asset?.compatibility,
      };
    }),
  }, project.blueprint);
  const status = qaStatus(results);
  const [run] = await db.insert(pstQaRunsTable).values({ id: randomUUID(), projectId: project.id, status, results }).returning();
  await db.update(pstProjectsTable).set({ qaStatus: status, status: "QA", updatedAt: new Date() }).where(eq(pstProjectsTable.id, project.id));
  await addEvent("QA_EXECUTED", `QA completed with ${status.toLowerCase()} status.`, project.id);
  res.json(RunPstQaResponse.parse(run));
});

router.post("/pst/projects/:projectId/approve", async (req, res): Promise<void> => {
  const params = ApprovePstProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const access = await authorizeProject(req, res, params.data.projectId, adminRoles);
  if (!access) {
    return;
  }
  const project = access.project;
  if (!canApprove(project)) {
    res.status(409).json({ error: "Run a passing QA before approval." });
    return;
  }
  const [updated] = await db.update(pstProjectsTable).set({ status: "APPROVED", updatedAt: new Date() }).where(eq(pstProjectsTable.id, project.id)).returning();
  await addEvent("PST_APPROVED", `${project.name} was explicitly approved by a human.`, project.id);
  res.json(ApprovePstProjectResponse.parse(await projectAggregate(updated.id, access.userId)));
});

router.post("/pst/projects/:projectId/publish", async (req, res): Promise<void> => {
  const params = PublishPstProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const access = await authorizeProject(req, res, params.data.projectId, adminRoles);
  if (!access) {
    return;
  }
  const project = access.project;
  if (!canPublish(project)) {
    if (project.status === "PUBLISHED" && project.publicationStatus === "PUBLISHED") {
      res.status(409).json({ error: publishConflictMessage, retryable: true });
      return;
    }
    res.status(409).json({ error: "Only an approved PST without blocking QA errors can be published." });
    return;
  }
  const [blueprint] = await db
    .select()
    .from(pstBlueprintsTable)
    .where(eq(pstBlueprintsTable.projectId, project.id));
  if (!blueprint) {
    res.status(409).json({ error: "A blueprint is required before publishing." });
    return;
  }
  let updated: typeof pstProjectsTable.$inferSelect;
  try {
    [updated] = await db.transaction(async (tx) => {
      const [lockedProject] = await tx
        .select()
        .from(pstProjectsTable)
        .where(eq(pstProjectsTable.id, project.id))
        .for("update");
      if (!lockedProject || !canPublish(lockedProject)) {
        throw new PublishConflictError(publishConflictMessage);
      }

      const [lockedBlueprint] = await tx
        .select()
        .from(pstBlueprintsTable)
        .where(eq(pstBlueprintsTable.projectId, lockedProject.id));
      if (!lockedBlueprint) {
        throw new PublishRequirementError("A blueprint is required before publishing.");
      }

      const version = await nextReleaseVersion(lockedProject.id, tx);
      const snapshot = await releaseSnapshot(lockedProject, lockedBlueprint, version, tx);
      await tx.insert(pstReleasesTable).values({
        id: randomUUID(),
        projectId: lockedProject.id,
        version,
        snapshot,
      });
      await tx.update(pstBlueprintsTable)
        .set({ version, updatedAt: new Date() })
        .where(eq(pstBlueprintsTable.projectId, lockedProject.id));
      return tx.update(pstProjectsTable)
        .set({ status: "PUBLISHED", publicationStatus: "PUBLISHED", version, updatedAt: new Date() })
        .where(eq(pstProjectsTable.id, lockedProject.id))
        .returning();
    });
  } catch (error) {
    const isUniqueViolation =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505";
    if (error instanceof PublishConflictError || error instanceof PublishRequirementError || isUniqueViolation) {
      res.status(409).json({
        error: error instanceof PublishConflictError || error instanceof PublishRequirementError
          ? error.message
          : publishConflictMessage,
        ...(error instanceof PublishConflictError || isUniqueViolation ? { retryable: true } : {}),
      });
      return;
    }
    throw error;
  }
  await addEvent("PST_PUBLISHED", `${project.name} is now available in the customer workspace.`, project.id);
  res.json(PublishPstProjectResponse.parse(await projectAggregate(updated.id, access.userId)));
});

router.get("/pst/projects/:projectId/releases", async (req, res): Promise<void> => {
  const params = GetPstReleasesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const access = await authorizeProject(req, res, params.data.projectId);
  if (!access) return;
  const releases = await db
    .select()
    .from(pstReleasesTable)
    .where(eq(pstReleasesTable.projectId, access.project.id))
    .orderBy(desc(pstReleasesTable.createdAt), desc(pstReleasesTable.id));
  res.json(GetPstReleasesResponse.parse(releases));
});

router.post("/pst/projects/:projectId/releases/:releaseId/restore", async (req, res): Promise<void> => {
  const params = RestorePstReleaseParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const access = await authorizeProject(req, res, params.data.projectId, adminRoles);
  if (!access) return;
  const [release] = await db
    .select()
    .from(pstReleasesTable)
    .where(
      and(
        eq(pstReleasesTable.id, params.data.releaseId),
        eq(pstReleasesTable.projectId, access.project.id),
      ),
    );
  if (!release) {
    res.status(404).json({ error: "PST release not found" });
    return;
  }
  const snapshot = release.snapshot;
  await db.transaction(async (tx) => {
    await tx.update(pstProjectsTable).set({
      name: snapshot.project.name,
      description: snapshot.project.description,
      version: release.version,
      domain: snapshot.project.domain,
      family: snapshot.project.family,
      series: snapshot.project.series,
      problemStatement: snapshot.project.problemStatement,
      targetUser: snapshot.project.targetUser,
      desiredOutcome: snapshot.project.desiredOutcome,
      productDna: snapshot.project.productDna,
      status: "BLUEPRINT_READY",
      qaStatus: "NOT_RUN",
      updatedAt: new Date(),
    }).where(eq(pstProjectsTable.id, access.project.id));
    await tx.update(pstBlueprintsTable).set({
      problem: snapshot.blueprint.problem,
      targetUser: snapshot.blueprint.targetUser,
      desiredOutcome: snapshot.blueprint.desiredOutcome,
      problemType: snapshot.blueprint.problemType,
      journey: snapshot.blueprint.journey,
      knowledgeRequirements: snapshot.blueprint.knowledgeRequirements,
      componentRequirements: snapshot.blueprint.componentRequirements,
      aiRequirements: snapshot.blueprint.aiRequirements,
      workflow: snapshot.workflow,
      expectedOutput: snapshot.blueprint.expectedOutput,
      actionPlan: snapshot.blueprint.actionPlan,
      nextStep: snapshot.blueprint.nextStep,
      version: release.version,
      updatedAt: new Date(),
    }).where(eq(pstBlueprintsTable.projectId, access.project.id));
    await tx.delete(pstProjectComponentsTable).where(eq(pstProjectComponentsTable.projectId, access.project.id));
    if (snapshot.components.length) {
        await tx.insert(pstProjectComponentsTable).values(snapshot.components.map((component) => ({
          assetId: component.assetId,
          name: component.name,
          type: component.type,
          source: component.source,
          status: component.status,
          required: component.required,
          id: randomUUID(),
          projectId: access.project.id,
        })));
    }
  });
  await addEvent("PST_RELEASE_RESTORED", `${access.project.name} release ${release.version} was restored to the draft.`, access.project.id);
  res.json(RestorePstReleaseResponse.parse(await projectAggregate(access.project.id, access.userId)));
});

router.get("/pst/projects/:projectId/workspace", async (req, res): Promise<void> => {
  const params = GetPstWorkspaceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const access = await authorizeProject(req, res, params.data.projectId);
  if (!access) {
    return;
  }
  const liveProject = await projectAggregate(access.project.id, access.userId);
  const release = await latestRelease(access.project.id);
  const project = liveProject && release
    ? {
        ...liveProject,
        ...release.snapshot.project,
        status: "PUBLISHED",
        publicationStatus: "PUBLISHED",
        version: release.version,
        blueprint: {
          ...release.snapshot.blueprint,
          workflow: release.snapshot.workflow,
          updatedAt: new Date(release.createdAt),
        },
        components: release.snapshot.components.map((component, index) => ({
          id: `${release.id}-component-${index}`,
          name: component.name,
          type: component.type,
          source: component.source,
          status: component.status,
        })),
      }
    : liveProject;
  if (!project) {
    res.status(404).json({ error: "PST workspace not found" });
    return;
  }
  const persona = await gustaftaEngine.getPersona();
  const steps = customerWorkspaceSteps(project.blueprint.workflow, persona);
  res.json(GetPstWorkspaceResponse.parse({ project, steps }));
});

router.get("/pst/projects/:projectId/members", async (req, res): Promise<void> => {
  const params = GetPstProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const access = await authorizeProject(req, res, params.data.projectId, adminRoles);
  if (!access) return;
  const members = await db
    .select({
      id: pstProjectMembersTable.id,
      projectId: pstProjectMembersTable.projectId,
      userId: pstProjectMembersTable.userId,
      role: pstProjectMembersTable.role,
      createdAt: pstProjectMembersTable.createdAt,
    })
    .from(pstProjectMembersTable)
    .where(eq(pstProjectMembersTable.projectId, access.project.id));
  res.json(members.map((member) => ({
    ...member,
    isOwner: member.userId === access.project.ownerId,
  })));
});

router.post("/pst/projects/:projectId/members", async (req, res): Promise<void> => {
  const params = GetPstProjectParams.safeParse(req.params);
  const requestBody =
    req.body && typeof req.body === "object" && !Array.isArray(req.body)
      ? {
          ...req.body,
          userId: typeof req.body.userId === "string" ? req.body.userId.trim() : req.body.userId,
        }
      : req.body;
  const body = UpsertPstProjectMemberBody.safeParse(requestBody);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error?.message ?? "Invalid request body" });
    return;
  }
  const access = await authorizeProject(req, res, params.data.projectId, adminRoles);
  if (!access) return;
  if (body.data.userId === access.project.ownerId) {
    res.status(409).json({ error: "The project owner already has protected admin access." });
    return;
  }
  const [existing] = await db
    .select({ id: pstProjectMembersTable.id })
    .from(pstProjectMembersTable)
    .where(
      and(
        eq(pstProjectMembersTable.projectId, access.project.id),
        eq(pstProjectMembersTable.userId, body.data.userId),
      ),
    );
  if (existing) {
    const [updated] = await db
      .update(pstProjectMembersTable)
      .set({ role: body.data.role })
      .where(eq(pstProjectMembersTable.id, existing.id))
      .returning();
    res.json(updated);
    return;
  }
  try {
    const [member] = await db
      .insert(pstProjectMembersTable)
      .values({
        id: randomUUID(),
        projectId: access.project.id,
        userId: body.data.userId,
        role: body.data.role,
      })
      .returning();
    res.status(201).json(member);
  } catch (error) {
    const errorCode =
      typeof error === "object" && error !== null && "code" in error
        ? error.code
        : undefined;
    if (errorCode !== "23505") throw error;
    req.log.warn({ err: error, projectId: access.project.id }, "Project member add conflicted");
    res.status(409).json({ error: "That user already has access to this project." });
  }
});

router.delete("/pst/projects/:projectId/members/:userId", async (req, res): Promise<void> => {
  const params = RemovePstProjectMemberParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const access = await authorizeProject(req, res, params.data.projectId, adminRoles);
  if (!access) return;

  const [member] = await db
    .select()
    .from(pstProjectMembersTable)
    .where(
      and(
        eq(pstProjectMembersTable.projectId, access.project.id),
        eq(pstProjectMembersTable.userId, params.data.userId),
      ),
    );
  if (!member) {
    res.status(404).json({ error: "PST project member not found" });
    return;
  }
  if (member.userId === access.project.ownerId) {
    res.status(409).json({ error: "The project owner cannot be removed." });
    return;
  }

  await db
    .delete(pstProjectMembersTable)
    .where(
      and(
        eq(pstProjectMembersTable.id, member.id),
        eq(pstProjectMembersTable.projectId, access.project.id),
      ),
    );
  res.status(204).send();
});

router.get("/pst/public/workspaces/:slug", async (req, res): Promise<void> => {
  const slug = typeof req.params.slug === "string" ? req.params.slug : req.params.slug?.[0];
  if (!slug) {
    res.status(400).json({ error: "Workspace slug is required" });
    return;
  }
  let project;
  try {
    project = await publicWorkspace(slug);
  } catch (error) {
    if (error instanceof PublicWorkspaceConsistencyError) {
      res.status(503).json({ error: error.message });
      return;
    }
    throw error;
  }
  if (!project) {
    res.status(404).json({ error: "Published customer workspace not found" });
    return;
  }
  if (!isPublicCustomerWorkspace(project, slug)) {
    res.status(404).json({ error: "Published customer workspace not found" });
    return;
  }
  res.json(GetPublicPstWorkspaceResponse.parse({
    project,
    steps: project.blueprint.workflow,
    definition: project.definition,
  }));
});

export async function initializePstData() {
  await ensureSeed();
}

export default router;