import { Router, type IRouter, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { and, desc, eq, exists, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  pstAssetsTable,
  pstAnalysisArtifactsTable,
  pstBlueprintsTable,
  pstFactoryEventsTable,
  pstPatternsTable,
  pstProductBriefsTable,
  pstProjectPatternsTable,
  pstProjectMembersTable,
  pstProjectComponentsTable,
  pstProjectAssembliesTable,
  pstProjectDocumentsTable,
  pstProjectsTable,
  pstProjectRecipesTable,
  pstPublicRuntimeSessionAdvancesTable,
  pstPublicRuntimeSessionsTable,
  pstReleasesTable,
  pstQaRunsTable,
  pstRecipesTable,
  pstSecurityAuditEventsTable,
  pstSimulationsTable,
  type WorkflowStep,
  type QaResult,
  type PstProjectRole,
  type PstBlueprint,
  type PstAssemblyChecklistItem,
  type PstAssemblyRisk,
  type PstReleaseSnapshot,
  type PstRuntimeInputV1,
  pstCanonicalJsonHash,
} from "@workspace/db";
import {
  ArchivePstProjectParams,
  ArchivePstProjectResponse,
  ApprovePstProjectParams,
  ApprovePstProjectResponse,
  BuildPstProjectBody,
  BuildPstProjectParams,
  BuildPstProjectResponse,
  GetPstAssemblyParams,
  GetPstAssemblyResponse,
  CreatePstProjectBody,
  CreatePstProjectResponse,
  CreatePstProjectComponentBody,
  CreatePstProjectComponentParams,
  CreatePstProjectComponentResponse,
  CreatePstProjectDocumentBody,
  CreatePstProjectDocumentParams,
  CreatePstProjectDocumentResponse,
  DeletePstProjectDocumentParams,
  GetPstProjectDocumentOpenUrlParams,
  GetPstProjectDocumentOpenUrlResponse,
  DuplicatePstProjectParams,
  DuplicatePstProjectResponse,
  GetDashboardActivityResponse,
  GetDashboardSummaryResponse,
  GetPstBlueprintParams,
  GetPstBlueprintResponse,
  GetPstProjectParams,
  GetPstProjectResponse,
  GetPstProductBriefParams,
  GetPstProductBriefResponse,
  GetPublicPstWorkspaceResponse,
  StartPublicPstRuntimeSessionParams,
  StartPublicPstRuntimeSessionResponse,
  AdvancePublicPstRuntimeSessionBody,
  AdvancePublicPstRuntimeSessionParams,
  AdvancePublicPstRuntimeSessionResponse,
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
  UpdatePstAssemblyChecklistItemBody,
  UpdatePstAssemblyChecklistItemParams,
  UpdatePstAssemblyChecklistItemResponse,
  UpdatePstAssemblyRiskBody,
  UpdatePstAssemblyRiskParams,
  UpdatePstAssemblyRiskResponse,
  UpdatePstProjectBody,
  UpdatePstProjectParams,
  UpdatePstProjectResponse,
  UpsertPstProductBriefBody,
  UpsertPstProductBriefParams,
  UpsertPstProductBriefResponse,
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
  validatePublishCandidate,
  workflowFromStructure,
} from "../lib/services/pst/manufacturing";
import {
  releaseSnapshotHash,
  releaseSnapshotHashAlgorithm,
  materializeCompilerReadySnapshot,
  resolveReleaseDeclarations,
} from "../lib/services/pst/release-snapshot";
import {
  compileExecutableRelease,
  resolveExecutableRelease,
} from "../lib/services/pst/executable-release";
import {
  persistedRuntimeAdvance,
  publicRuntimeSessionView,
} from "../lib/services/pst/public-runtime-session";
import {
  advancePstRuntime,
  createPstRuntime,
} from "@workspace/db/schema";
import { consumeAnalysisQuota } from "../lib/services/ai/quota";
import { createHash, randomUUID } from "node:crypto";
import { deleteObject, resolvePrivateObjectPath, signObjectUrl } from "./storage";
import { extractPlanningDocument } from "../lib/services/pst/document-extraction";

const router: IRouter = Router();

function assemblyContentFromBlueprint(blueprint: PstBlueprint) {
  const actions = blueprint.actionPlan.length
    ? blueprint.actionPlan
    : blueprint.journey.map((step) => `Selesaikan tahap ${step}`);
  const lastIndex = Math.max(actions.length - 1, 1);
  const checklist: PstAssemblyChecklistItem[] = actions.map((action, index) => ({
    id: randomUUID(),
    day: Math.min(30, 1 + Math.round((index * 29) / lastIndex)),
    title: action,
    description: blueprint.expectedOutput[index % Math.max(blueprint.expectedOutput.length, 1)]
      ?? "Catat hasil dan bukti penyelesaian langkah ini.",
    completed: false,
  }));
  const riskSources = [...blueprint.knowledgeRequirements, ...blueprint.aiRequirements].slice(0, 3);
  const risks: PstAssemblyRisk[] = (riskSources.length
    ? riskSources
    : ["Kebutuhan pengguna belum tervalidasi"]).map((source, index) => ({
    id: randomUUID(),
    title: source,
    description: `Risiko hasil perakitan tidak akurat bila "${source}" belum dipenuhi atau divalidasi.`,
    priority: index === 0 ? "HIGH" : index === 1 ? "MEDIUM" : "LOW",
    mitigation: "",
    status: "OPEN",
  }));
  return { checklist, risks };
}

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

function makePublicWorkspaceFixtureBlueprint() {
  const labels = ["Questions", "Criteria", "Action", "Outcome"];
  const blueprint = makeBlueprint(
    publicWorkspaceFixture.projectId,
    "Teams need a reliable way to assess operational choices.",
    "Operations lead",
    "Choose one justified next action.",
    publicWorkspaceFixture.blueprintId,
  );
  return {
    ...blueprint,
    journey: labels,
    workflow: workflowFromStructure(labels, {
      type: "pattern",
      id: "pattern-assessment",
      name: "Assessment pattern",
    }),
  };
}

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
    const fixtureBlueprint = makePublicWorkspaceFixtureBlueprint();
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
      const fixtureBlueprint = makePublicWorkspaceFixtureBlueprint();
      await db.insert(pstBlueprintsTable).values({
        ...fixtureBlueprint,
        projectId: project.id,
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
    const authoredBlueprint = {
      ...blueprint,
      ...makePublicWorkspaceFixtureBlueprint(),
      projectId: project.id,
      version: publicWorkspaceFixture.version,
      updatedAt: blueprint.updatedAt,
    };
    const candidate = materializeCompilerReadySnapshot(await releaseSnapshot(
      project,
      authoredBlueprint,
      publicWorkspaceFixture.version,
    ));
    if (candidate.status === "BLOCKED") {
      throw new Error(`Public PST fixture is not Compiler-ready: ${candidate.errors.join(" ")}`);
    }
    const createdAt = new Date();
    const executable = compileExecutableRelease({
      id: publicWorkspaceFixture.releaseId,
      projectId: project.id,
      version: publicWorkspaceFixture.version,
      createdAt,
    }, project.slug, candidate.snapshot);
    if (executable.status === "BLOCKED") {
      throw new Error(
        `Public PST fixture is not executable: ${executable.diagnostics
          .map(({ code, path }) => `${code} at ${path}`)
          .join("; ")}`,
      );
    }
    await db
      .insert(pstReleasesTable)
      .values({
        id: publicWorkspaceFixture.releaseId,
        projectId: project.id,
        version: publicWorkspaceFixture.version,
        snapshot: candidate.snapshot,
        executableDefinition: executable.definition,
        createdAt,
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
  const documents = await db
    .select({
      id: pstProjectDocumentsTable.id,
      projectId: pstProjectDocumentsTable.projectId,
      name: pstProjectDocumentsTable.name,
      objectPath: pstProjectDocumentsTable.objectPath,
      contentType: pstProjectDocumentsTable.contentType,
      size: pstProjectDocumentsTable.size,
      status: pstProjectDocumentsTable.status,
      createdAt: pstProjectDocumentsTable.createdAt,
    })
    .from(pstProjectDocumentsTable)
    .where(eq(pstProjectDocumentsTable.projectId, projectId))
    .orderBy(desc(pstProjectDocumentsTable.createdAt));
  const { selectedPatterns, selectedRecipes } = await getProjectReferences(projectId, userId);
  return {
    ...project,
    blueprint: blueprint ?? makeBlueprint(projectId, project.problemStatement, project.targetUser, project.desiredOutcome),
    components,
    documents,
    selectedPatterns,
    selectedRecipes,
  };
}

async function latestRelease(projectId: string, query: PstSelectExecutor = db) {
  const [release] = await query
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
  const authoringSnapshot: PstReleaseSnapshot = {
    ...snapshot,
    snapshotHash: releaseSnapshotHash(snapshot),
  };
  const materialized = materializeCompilerReadySnapshot(authoringSnapshot);
  if (materialized.status === "BLOCKED") {
    throw new PublishRequirementError(
      `Release is not Compiler-ready: ${materialized.errors.join(" ")}`,
    );
  }
  return materialized.snapshot;
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
  return db.transaction(async (tx) => {
    await tx.execute(sql`select ${pstProjectsTable.id} from ${pstProjectsTable} where ${pstProjectsTable.id} = ${projectId} for update`);
    const pattern = input.patternId ? (await tx.select().from(pstPatternsTable).where(eq(pstPatternsTable.id, input.patternId)))[0] : undefined;
    const recipe = input.recipeId ? (await tx.select().from(pstRecipesTable).where(eq(pstRecipesTable.id, input.recipeId)))[0] : undefined;
    if (input.patternId && !pattern) return { error: "Selected PST pattern was not found." };
    if (input.recipeId && !recipe) return { error: "Selected PST recipe was not found." };

    if (input.patternId !== undefined) {
      await tx.delete(pstProjectPatternsTable).where(eq(pstProjectPatternsTable.projectId, projectId));
      if (pattern) {
        await tx.insert(pstProjectPatternsTable).values({
          id: randomUUID(),
          projectId,
          patternId: pattern.id,
        });
      }
    }
    if (input.recipeId !== undefined) {
      await tx.delete(pstProjectRecipesTable).where(eq(pstProjectRecipesTable.projectId, projectId));
      if (recipe) {
        await tx.insert(pstProjectRecipesTable).values({
          id: randomUUID(),
          projectId,
          recipeId: recipe.id,
        });
      }
    }
    return { pattern, recipe };
  });
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
    const [existingProject] = await db
      .select({ id: pstProjectsTable.id })
      .from(pstProjectsTable)
      .where(eq(pstProjectsTable.id, projectId));
    if (existingProject) {
      try {
        await db.insert(pstSecurityAuditEventsTable).values({
          id: randomUUID(),
          type: "PST_PROJECT_ACCESS_DENIED",
          actorUserId: userId,
          targetProjectId: existingProject.id,
          method: req.method,
          routePattern: String(req.route?.path ?? "unknown"),
        });
      } catch (error) {
        req.log.error(
          {
            err: error,
            event: "pst_project_access_denied_audit_failed",
          },
          "Failed to persist denied PST project access audit event",
        );
      }
      req.log.warn(
        {
          event: "pst_project_access_denied",
          targetProjectId: existingProject.id,
          actorUserId: userId,
          method: req.method,
          routePattern: String(req.route?.path ?? "unknown"),
        },
        "Denied cross-owner PST project access",
      );
    }
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

async function publicWorkspace(slug: string, query: PstSelectExecutor = db) {
  const [project] = await query
    .select()
    .from(pstProjectsTable)
    .where(eq(pstProjectsTable.slug, slug));
  if (!project) return undefined;
  if (project.publicationStatus !== "PUBLISHED") {
    return undefined;
  }
  const release = await latestRelease(project.id, query);
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
  const executable = resolveExecutableRelease(
    release,
    project.slug,
    snapshot,
    release.executableDefinition,
  );
  if (executable.status === "BLOCKED") {
    const first = executable.diagnostics[0];
    throw new PublicWorkspaceConsistencyError(
      first
        ? `Published customer workspace has no valid executable: ${first.code} at ${first.path}.`
        : "Published customer workspace has no valid executable.",
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
    release,
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
  const documentIds = [...new Set(body.data.documentIds ?? [])];
  const documents = documentIds.length
    ? await db
      .select()
      .from(pstProjectDocumentsTable)
      .where(and(
        eq(pstProjectDocumentsTable.projectId, project.id),
        inArray(pstProjectDocumentsTable.id, documentIds),
      ))
    : [];
  if (documents.length !== documentIds.length) {
    res.status(400).json({ error: "One or more selected planning documents are unavailable." });
    return;
  }
  if (documents.reduce((total, document) => total + document.size, 0) > 20 * 1024 * 1024) {
    res.status(400).json({ error: "Selected planning documents exceed the 20 MB analysis limit." });
    return;
  }
  const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
  if (documents.length && !privateObjectDir) {
    res.status(503).json({ error: "Document storage is not configured." });
    return;
  }
  let architectDocuments;
  try {
    let downloadedBytes = 0;
    architectDocuments = await Promise.all(documents.map(async (document) => {
      const url = await signObjectUrl(resolvePrivateObjectPath(document.objectPath), "GET");
      const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) {
        throw new Error(`download failed with status ${response.status}`);
      }
      const data = Buffer.from(await response.arrayBuffer());
      downloadedBytes += data.length;
      if (downloadedBytes > 20 * 1024 * 1024) {
        throw new Error("actual downloaded size exceeds the 20 MB analysis limit");
      }
      return {
        documentId: document.id,
        name: document.name,
        size: data.length,
        contentSha256: createHash("sha256").update(data).digest("hex"),
        text: await extractPlanningDocument(document.name, data),
      };
    }));
  } catch (error) {
    req.log.warn({ err: error }, "Planning document extraction failed");
    res.status(422).json({
      error: `Dokumen tidak dapat dianalisis: ${error instanceof Error ? error.message : "format tidak valid"}`,
    });
    return;
  }
  if (!consumeAnalysisQuota(access.userId)) {
    res.status(429).json({ error: "Batas analisis tercapai. Coba lagi dalam beberapa menit.", retryable: true });
    return;
  }
  let proposal;
  try {
    proposal = await aiProvider.proposeBlueprint({
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
      documents: architectDocuments.map(({ name, text }) => ({ name, text })),
    });
  } catch (error) {
    req.log.warn({ err: error }, "PST architect analysis failed");
    res.status(502).json({ error: "Perancang AI tidak tersedia. Coba lagi sebentar.", retryable: true });
    return;
  }
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
  const analysisArtifactId = randomUUID();
  const updated = await db.transaction(async (tx) => {
    await tx.execute(sql`select ${pstProjectsTable.id} from ${pstProjectsTable} where ${pstProjectsTable.id} = ${project.id} for update`);
    await tx.execute(sql`select ${pstBlueprintsTable.id} from ${pstBlueprintsTable} where ${pstBlueprintsTable.projectId} = ${project.id} for update`);
    await tx.insert(pstAnalysisArtifactsTable).values({
      id: analysisArtifactId,
      projectId: project.id,
      createdBy: access.userId,
      contractVersion: "pst-architect.v1",
      documents: architectDocuments.map(({ documentId, name, size, contentSha256 }) => ({
        documentId,
        name,
        size,
        contentSha256,
      })),
      result: blueprintProposal,
    });
    const [result] = await tx.update(pstBlueprintsTable).set({
      ...blueprintProposal,
      analysisArtifactId,
      updatedAt: new Date(),
    }).where(eq(pstBlueprintsTable.projectId, project.id)).returning();
    await tx.delete(pstProjectAssembliesTable).where(eq(pstProjectAssembliesTable.projectId, project.id));
    await tx.update(pstProjectsTable).set({ status: "ARCHITECTED", updatedAt: new Date() }).where(eq(pstProjectsTable.id, project.id));
    return result;
  });
  await addEvent("BLUEPRINT_GENERATED", `${project.name} received an AI blueprint proposal.`, project.id);
  res.json(RunPstArchitectResponse.parse(updated));
});

router.get("/pst/projects/:projectId/product-brief", async (req, res): Promise<void> => {
  const params = GetPstProductBriefParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const access = await authorizeProject(req, res, params.data.projectId);
  if (!access) return;
  const [brief] = await db.select().from(pstProductBriefsTable)
    .where(eq(pstProductBriefsTable.projectId, access.project.id));
  if (!brief) {
    res.status(404).json({ error: "Product brief not found" });
    return;
  }
  res.json(GetPstProductBriefResponse.parse(brief));
});

router.put("/pst/projects/:projectId/product-brief", async (req, res): Promise<void> => {
  const params = UpsertPstProductBriefParams.safeParse(req.params);
  const body = UpsertPstProductBriefBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: !params.success ? params.error.message : body.error?.message ?? "Invalid request body" });
    return;
  }
  const access = await authorizeProject(req, res, params.data.projectId, editorRoles);
  if (!access) return;
  const validSolutionIds = new Set(body.data.frameworkAnalysis.recommended_solutions.map((solution) => solution.id));
  if (body.data.selectedSolutionIds.some((id) => !validSolutionIds.has(id))) {
    res.status(400).json({ error: "Selected solutions must belong to the submitted framework analysis." });
    return;
  }
  const validProductIds = new Set(body.data.frameworkAnalysis.digital_product_recommendations.map((product) => product.id));
  if (body.data.selectedProductId && !validProductIds.has(body.data.selectedProductId)) {
    res.status(400).json({ error: "Selected product must belong to the submitted framework analysis." });
    return;
  }
  const [blueprint] = await db.select().from(pstBlueprintsTable)
    .where(eq(pstBlueprintsTable.projectId, access.project.id));
  if (!blueprint) {
    res.status(409).json({ error: "Create a Blueprint before saving a product brief." });
    return;
  }
  const now = new Date();
  const [brief] = await db.insert(pstProductBriefsTable).values({
    id: randomUUID(),
    projectId: access.project.id,
    createdBy: access.userId,
    sourceAnalysisArtifactId: blueprint.analysisArtifactId,
    blueprintUpdatedAt: blueprint.updatedAt,
    frameworkAnalysis: body.data.frameworkAnalysis,
    selectedProductId: body.data.selectedProductId,
    selectedSolutionIds: body.data.selectedSolutionIds,
    actionPlan: body.data.actionPlan,
    createdAt: now,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: pstProductBriefsTable.projectId,
    set: {
      sourceAnalysisArtifactId: blueprint.analysisArtifactId,
      blueprintUpdatedAt: blueprint.updatedAt,
      frameworkAnalysis: body.data.frameworkAnalysis,
      selectedProductId: body.data.selectedProductId,
      selectedSolutionIds: body.data.selectedSolutionIds,
      actionPlan: body.data.actionPlan,
      updatedAt: now,
    },
  }).returning();
  await addEvent("PRODUCT_BRIEF_SAVED", `${access.project.name} saved its active product brief.`, access.project.id);
  res.json(UpsertPstProductBriefResponse.parse(brief));
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
  const updated = await db.transaction(async (tx) => {
    await tx.execute(sql`select ${pstProjectsTable.id} from ${pstProjectsTable} where ${pstProjectsTable.id} = ${access.project.id} for update`);
    await tx.execute(sql`select ${pstBlueprintsTable.id} from ${pstBlueprintsTable} where ${pstBlueprintsTable.projectId} = ${access.project.id} for update`);
    const [result] = await tx.update(pstBlueprintsTable).set({
      ...body.data,
      analysisArtifactId: null,
      updatedAt: new Date(),
    }).where(eq(pstBlueprintsTable.projectId, access.project.id)).returning();
    if (result) {
      await tx.delete(pstProjectAssembliesTable).where(eq(pstProjectAssembliesTable.projectId, access.project.id));
      await tx.update(pstProjectsTable).set({ status: "BLUEPRINT_READY", updatedAt: new Date() }).where(eq(pstProjectsTable.id, access.project.id));
    }
    return result;
  });
  if (!updated) {
    res.status(404).json({ error: "PST blueprint not found" });
    return;
  }
  await addEvent("BLUEPRINT_EDITED", "Blueprint changes were saved for human review.", access.project.id);
  res.json(UpdatePstBlueprintResponse.parse(updated));
});

router.post("/pst/projects/:projectId/components", async (req, res): Promise<void> => {
  const params = CreatePstProjectComponentParams.safeParse(req.params);
  const body = CreatePstProjectComponentBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: !params.success ? params.error.message : body.error?.message ?? "Invalid request body" });
    return;
  }
  const access = await authorizeProject(req, res, params.data.projectId, editorRoles);
  if (!access) {
    return;
  }
  const assetId = randomUUID();
  const componentId = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(pstAssetsTable).values({
      id: assetId,
      name: body.data.name,
      type: body.data.type,
      description: body.data.description,
      version: "v1.0",
      status: "ACTIVE",
      tags: body.data.tags ?? [],
      domain: access.project.domain,
      compatibility: [access.project.family],
    });
    await tx.insert(pstProjectComponentsTable).values({
      id: componentId,
      projectId: access.project.id,
      assetId,
      name: body.data.name,
      type: body.data.type,
      source: "Input manual",
      status: "READY",
      required: true,
    });
  });
  await addEvent("COMPONENT_ADDED", `${body.data.name} was added manually.`, access.project.id);
  res.status(201).json(CreatePstProjectComponentResponse.parse({
    id: componentId,
    name: body.data.name,
    type: body.data.type,
    source: "Input manual",
    status: "READY",
  }));
});

router.post("/pst/projects/:projectId/documents", async (req, res): Promise<void> => {
  const params = CreatePstProjectDocumentParams.safeParse(req.params);
  const body = CreatePstProjectDocumentBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: !params.success ? params.error.message : body.error?.message ?? "Invalid request body" });
    return;
  }
  const access = await authorizeProject(req, res, params.data.projectId, editorRoles);
  if (!access) {
    return;
  }
  let verifiedData: Buffer;
  try {
    const url = await signObjectUrl(resolvePrivateObjectPath(body.data.objectPath), "GET");
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`uploaded object returned status ${response.status}`);
    verifiedData = Buffer.from(await response.arrayBuffer());
    if (verifiedData.length !== body.data.size) {
      throw new Error("uploaded object size does not match the declared size");
    }
    await extractPlanningDocument(body.data.name, verifiedData);
  } catch (error) {
    req.log.warn({ err: error }, "Project document verification failed");
    res.status(422).json({
      error: `Dokumen tidak dapat dilampirkan: ${error instanceof Error ? error.message : "objek tidak valid"}`,
    });
    return;
  }
  const [document] = await db.insert(pstProjectDocumentsTable).values({
    id: randomUUID(),
    projectId: access.project.id,
    uploadedBy: access.userId,
    name: body.data.name,
    objectPath: body.data.objectPath,
    contentType: body.data.contentType,
    size: body.data.size,
    status: "READY",
  }).returning();
  await addEvent("DOCUMENT_UPLOADED", `${body.data.name} was attached to the project.`, access.project.id);
  res.status(201).json(CreatePstProjectDocumentResponse.parse(document));
});

router.get("/pst/projects/:projectId/documents/:documentId/open-url", async (req, res): Promise<void> => {
  const params = GetPstProjectDocumentOpenUrlParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const access = await authorizeProject(req, res, params.data.projectId);
  if (!access) {
    return;
  }
  const [document] = await db
    .select()
    .from(pstProjectDocumentsTable)
    .where(and(
      eq(pstProjectDocumentsTable.id, params.data.documentId),
      eq(pstProjectDocumentsTable.projectId, access.project.id),
    ));
  if (!document) {
    res.status(404).json({ error: "Project document not found" });
    return;
  }
  const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateObjectDir) {
    res.status(503).json({ error: "Document storage is not configured" });
    return;
  }
  try {
    const url = await signObjectUrl(resolvePrivateObjectPath(document.objectPath), "GET");
    res.json(GetPstProjectDocumentOpenUrlResponse.parse({ url }));
  } catch (error) {
    req.log.error({ err: error, documentId: document.id }, "Failed to create document read URL");
    res.status(500).json({ error: "Failed to open project document" });
  }
});

router.delete("/pst/projects/:projectId/documents/:documentId", async (req, res): Promise<void> => {
  const params = DeletePstProjectDocumentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const access = await authorizeProject(req, res, params.data.projectId, editorRoles);
  if (!access) {
    return;
  }
  const [document] = await db
    .select()
    .from(pstProjectDocumentsTable)
    .where(and(
      eq(pstProjectDocumentsTable.id, params.data.documentId),
      eq(pstProjectDocumentsTable.projectId, access.project.id),
    ));
  if (!document) {
    res.status(404).json({ error: "Project document not found" });
    return;
  }
  const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateObjectDir) {
    res.status(503).json({ error: "Document storage is not configured" });
    return;
  }
  try {
    await deleteObject(resolvePrivateObjectPath(document.objectPath));
    await db.delete(pstProjectDocumentsTable).where(eq(pstProjectDocumentsTable.id, document.id));
    await addEvent("DOCUMENT_DELETED", `${document.name} was removed from the project.`, access.project.id);
    res.status(204).send();
  } catch (error) {
    req.log.error({ err: error, documentId: document.id }, "Failed to delete project document");
    res.status(500).json({ error: "Failed to delete project document" });
  }
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
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select ${pstProjectsTable.id} from ${pstProjectsTable} where ${pstProjectsTable.id} = ${access.project.id} for update`);
    let pattern: typeof pstPatternsTable.$inferSelect | undefined;
    let recipe: typeof pstRecipesTable.$inferSelect | undefined;
    if (body.data.patternId !== undefined) {
      pattern = body.data.patternId
        ? (await tx.select().from(pstPatternsTable).where(eq(pstPatternsTable.id, body.data.patternId)))[0]
        : undefined;
      if (body.data.patternId && !pattern) return { error: "Selected PST pattern was not found." as const };
      await tx.delete(pstProjectPatternsTable).where(eq(pstProjectPatternsTable.projectId, access.project.id));
      if (pattern) {
        await tx.insert(pstProjectPatternsTable).values({ id: randomUUID(), projectId: access.project.id, patternId: pattern.id });
      }
    } else {
      const [reference] = await tx.select({ patternId: pstProjectPatternsTable.patternId }).from(pstProjectPatternsTable)
        .where(eq(pstProjectPatternsTable.projectId, access.project.id));
      pattern = reference
        ? (await tx.select().from(pstPatternsTable).where(eq(pstPatternsTable.id, reference.patternId)))[0]
        : undefined;
    }
    if (body.data.recipeId !== undefined) {
      recipe = body.data.recipeId
        ? (await tx.select().from(pstRecipesTable).where(eq(pstRecipesTable.id, body.data.recipeId)))[0]
        : undefined;
      if (body.data.recipeId && !recipe) return { error: "Selected PST recipe was not found." as const };
      await tx.delete(pstProjectRecipesTable).where(eq(pstProjectRecipesTable.projectId, access.project.id));
      if (recipe) {
        await tx.insert(pstProjectRecipesTable).values({ id: randomUUID(), projectId: access.project.id, recipeId: recipe.id });
      }
    } else {
      const [reference] = await tx.select({ recipeId: pstProjectRecipesTable.recipeId }).from(pstProjectRecipesTable)
        .where(eq(pstProjectRecipesTable.projectId, access.project.id));
      recipe = reference
        ? (await tx.select().from(pstRecipesTable).where(eq(pstRecipesTable.id, reference.recipeId)))[0]
        : undefined;
    }
    const selectedAssets = body.data.assetIds?.length
      ? await tx.select().from(pstAssetsTable).where(inArray(pstAssetsTable.id, body.data.assetIds))
      : await tx.select().from(pstAssetsTable).where(eq(pstAssetsTable.status, "ACTIVE")).limit(5);
    await tx.execute(sql`select ${pstBlueprintsTable.id} from ${pstBlueprintsTable} where ${pstBlueprintsTable.projectId} = ${access.project.id} for update`);
    const [lockedBlueprint] = await tx
      .select()
      .from(pstBlueprintsTable)
      .where(eq(pstBlueprintsTable.projectId, access.project.id));
    if (!lockedBlueprint) {
      throw new Error("PST blueprint disappeared during assembly");
    }
    const lockedBuildPlan = buildFromConfiguration({
      blueprint: lockedBlueprint,
      assets: selectedAssets,
      pattern: pattern
        ? { type: "pattern", id: pattern.id, name: pattern.name, steps: pattern.steps }
        : undefined,
      recipe: recipe
        ? { type: "recipe", id: recipe.id, name: recipe.name, components: recipe.components }
        : undefined,
      idFactory: randomUUID,
    });
    const blueprintChanged = Boolean(lockedBuildPlan.source) && (
      JSON.stringify(lockedBlueprint.journey) !== JSON.stringify(lockedBuildPlan.journey)
      || JSON.stringify(lockedBlueprint.componentRequirements) !== JSON.stringify(lockedBuildPlan.componentRequirements)
      || JSON.stringify(lockedBlueprint.workflow) !== JSON.stringify(lockedBuildPlan.workflow)
    );
    const blueprintUpdatedAt = blueprintChanged ? new Date() : lockedBlueprint.updatedAt;
    if (blueprintChanged) {
      await tx.update(pstBlueprintsTable).set({
        journey: lockedBuildPlan.journey,
        componentRequirements: lockedBuildPlan.componentRequirements,
        workflow: lockedBuildPlan.workflow,
        updatedAt: blueprintUpdatedAt,
      }).where(eq(pstBlueprintsTable.id, lockedBlueprint.id));
    }
    await tx.delete(pstProjectComponentsTable).where(eq(pstProjectComponentsTable.projectId, access.project.id));
    if (lockedBuildPlan.readyAssets.length) {
      await tx.insert(pstProjectComponentsTable).values(lockedBuildPlan.readyAssets.map((asset) => ({
        id: randomUUID(),
        projectId: access.project.id,
        assetId: asset.id,
        name: asset.name,
        type: asset.type,
        source: "Asset Library",
        status: "READY",
        required: true,
      })));
    }
    await tx.execute(sql`select ${pstProjectAssembliesTable.id} from ${pstProjectAssembliesTable} where ${pstProjectAssembliesTable.projectId} = ${access.project.id} for update`);
    const [existingAssembly] = await tx
      .select()
      .from(pstProjectAssembliesTable)
      .where(eq(pstProjectAssembliesTable.projectId, access.project.id));
    const sourceMatches = existingAssembly
      && existingAssembly.sourceBlueprintVersion === lockedBlueprint.version
      && existingAssembly.sourceBlueprintUpdatedAt.getTime() === blueprintUpdatedAt.getTime();
    const assemblyContent = assemblyContentFromBlueprint({
      ...lockedBlueprint,
      journey: lockedBuildPlan.journey,
      componentRequirements: lockedBuildPlan.componentRequirements,
      workflow: lockedBuildPlan.workflow,
      updatedAt: blueprintUpdatedAt,
    });
    const lockedAssembly = sourceMatches
      ? existingAssembly
      : (await tx.insert(pstProjectAssembliesTable).values({
        id: existingAssembly?.id ?? randomUUID(),
        projectId: access.project.id,
        sourceBlueprintVersion: lockedBlueprint.version,
        sourceBlueprintUpdatedAt: blueprintUpdatedAt,
        status: lockedBuildPlan.status,
        ...assemblyContent,
      }).onConflictDoUpdate({
        target: pstProjectAssembliesTable.projectId,
        set: {
          sourceBlueprintVersion: lockedBlueprint.version,
          sourceBlueprintUpdatedAt: blueprintUpdatedAt,
          status: lockedBuildPlan.status,
          ...assemblyContent,
          updatedAt: new Date(),
        },
      }).returning())[0];
    await tx.update(pstProjectsTable).set({
      status: lockedBuildPlan.status === "BLOCKED" ? "BUILDING" : "PREVIEW",
      updatedAt: new Date(),
    }).where(eq(pstProjectsTable.id, access.project.id));
    return { buildPlan: lockedBuildPlan, assembly: lockedAssembly, error: undefined };
  });
  if (result.error) {
    res.status(400).json({ error: result.error });
    return;
  }
  const { buildPlan, assembly } = result;
  await addEvent("BUILD_COMPLETED", `Builder finished with ${buildPlan.status.toLowerCase()} status.`, access.project.id);
  res.json(BuildPstProjectResponse.parse({
    status: buildPlan.status,
    ready: buildPlan.ready,
    missing: buildPlan.missing,
    warnings: buildPlan.warnings,
    errors: buildPlan.errors,
    components: buildPlan.components,
    assembly,
  }));
});

router.get("/pst/projects/:projectId/assembly", async (req, res): Promise<void> => {
  const params = GetPstAssemblyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const access = await authorizeProject(req, res, params.data.projectId);
  if (!access) return;
  const [assembly] = await db
    .select()
    .from(pstProjectAssembliesTable)
    .where(eq(pstProjectAssembliesTable.projectId, access.project.id));
  if (!assembly) {
    res.status(404).json({ error: "PST assembly not found" });
    return;
  }
  res.json(GetPstAssemblyResponse.parse(assembly));
});

router.patch("/pst/projects/:projectId/assembly/checklist/:itemId", async (req, res): Promise<void> => {
  const params = UpdatePstAssemblyChecklistItemParams.safeParse(req.params);
  const body = UpdatePstAssemblyChecklistItemBody.safeParse(req.body ?? {});
  if (!params.success || !body.success) {
    res.status(400).json({ error: !params.success ? params.error.message : body.error?.message ?? "Invalid request body" });
    return;
  }
  const access = await authorizeProject(req, res, params.data.projectId, editorRoles);
  if (!access) return;
  const updated = await db.transaction(async (tx) => {
    await tx.execute(sql`select ${pstProjectsTable.id} from ${pstProjectsTable} where ${pstProjectsTable.id} = ${access.project.id} for update`);
    await tx.execute(sql`select ${pstProjectAssembliesTable.id} from ${pstProjectAssembliesTable} where ${pstProjectAssembliesTable.projectId} = ${access.project.id} for update`);
    const [assembly] = await tx.select().from(pstProjectAssembliesTable)
      .where(eq(pstProjectAssembliesTable.projectId, access.project.id));
    if (!assembly || !assembly.checklist.some((item) => item.id === params.data.itemId)) return null;
    const [result] = await tx.update(pstProjectAssembliesTable).set({
      checklist: assembly.checklist.map((item) =>
        item.id === params.data.itemId ? { ...item, completed: body.data.completed } : item),
      updatedAt: new Date(),
    }).where(eq(pstProjectAssembliesTable.id, assembly.id)).returning();
    return result;
  });
  if (!updated) {
    res.status(404).json({ error: "Assembly checklist item not found" });
    return;
  }
  res.json(UpdatePstAssemblyChecklistItemResponse.parse(updated));
});

router.patch("/pst/projects/:projectId/assembly/risks/:riskId", async (req, res): Promise<void> => {
  const params = UpdatePstAssemblyRiskParams.safeParse(req.params);
  const body = UpdatePstAssemblyRiskBody.safeParse(req.body ?? {});
  if (!params.success || !body.success) {
    res.status(400).json({ error: !params.success ? params.error.message : body.error?.message ?? "Invalid request body" });
    return;
  }
  const access = await authorizeProject(req, res, params.data.projectId, editorRoles);
  if (!access) return;
  const mitigation = body.data.mitigation.trim();
  const updated = await db.transaction(async (tx) => {
    await tx.execute(sql`select ${pstProjectsTable.id} from ${pstProjectsTable} where ${pstProjectsTable.id} = ${access.project.id} for update`);
    await tx.execute(sql`select ${pstProjectAssembliesTable.id} from ${pstProjectAssembliesTable} where ${pstProjectAssembliesTable.projectId} = ${access.project.id} for update`);
    const [assembly] = await tx.select().from(pstProjectAssembliesTable)
      .where(eq(pstProjectAssembliesTable.projectId, access.project.id));
    if (!assembly || !assembly.risks.some((risk) => risk.id === params.data.riskId)) return null;
    const [result] = await tx.update(pstProjectAssembliesTable).set({
      risks: assembly.risks.map((risk) =>
        risk.id === params.data.riskId
          ? { ...risk, mitigation, status: mitigation ? "MITIGATED" as const : "OPEN" as const }
          : risk),
      updatedAt: new Date(),
    }).where(eq(pstProjectAssembliesTable.id, assembly.id)).returning();
    return result;
  });
  if (!updated) {
    res.status(404).json({ error: "Assembly risk not found" });
    return;
  }
  res.json(UpdatePstAssemblyRiskResponse.parse(updated));
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
  const run = await db.transaction(async (tx) => {
    const [project] = await tx
      .select()
      .from(pstProjectsTable)
      .where(eq(pstProjectsTable.id, access.project.id))
      .for("update");
    const [blueprint] = await tx
      .select()
      .from(pstBlueprintsTable)
      .where(eq(pstBlueprintsTable.projectId, access.project.id))
      .for("update");
    if (!project || !blueprint) {
      throw new PublishRequirementError("A blueprint is required before running QA.");
    }
    const componentRows = await tx
      .select({
        name: pstProjectComponentsTable.name,
        status: pstProjectComponentsTable.status,
        assetId: pstProjectComponentsTable.assetId,
      })
      .from(pstProjectComponentsTable)
      .where(eq(pstProjectComponentsTable.projectId, project.id));
    const assetIds = componentRows.map((component) => component.assetId);
    const assets = assetIds.length
      ? await tx.select().from(pstAssetsTable).where(inArray(pstAssetsTable.id, assetIds))
      : [];
    const assetById = new Map(assets.map((asset) => [asset.id, asset]));
    let results: QaResult[] = evaluateQa({
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
    }, blueprint);
    const preliminaryStatus = qaStatus(results);
    const candidateProject = { ...project, qaStatus: preliminaryStatus };
    let candidateHash: string | null = null;
    try {
      const candidate = materializeCompilerReadySnapshot(
        await releaseSnapshot(candidateProject, blueprint, await nextReleaseVersion(project.id, tx), tx),
      );
      if (candidate.status === "READY") {
        candidateHash = candidate.snapshot.snapshotHash ?? null;
      } else {
        results = [...results, {
          category: "TECHNICAL",
          label: "Kandidat rilis siap diterbitkan",
          status: "ERROR",
          detail: "Perakitan belum menghasilkan konfigurasi runtime yang lengkap. Jalankan Perakitan ulang dengan pola atau resep yang sesuai, lalu ulangi QA.",
        }];
      }
    } catch (error) {
      if (!(error instanceof PublishRequirementError)) throw error;
      results = [...results, {
        category: "TECHNICAL",
        label: "Kandidat rilis siap diterbitkan",
        status: "ERROR",
        detail: error.message,
      }];
    }
    const status = qaStatus(results);
    const [created] = await tx.insert(pstQaRunsTable).values({
      id: randomUUID(),
      projectId: project.id,
      status,
      candidateHash,
      results,
    }).returning();
    await tx.update(pstProjectsTable)
      .set({ qaStatus: status, status: "QA", approvedCandidateHash: null, updatedAt: new Date() })
      .where(eq(pstProjectsTable.id, project.id));
    return created;
  });
  await addEvent("QA_EXECUTED", `QA completed with ${run.status.toLowerCase()} status.`, access.project.id);
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
  let updated: typeof pstProjectsTable.$inferSelect;
  try {
    [updated] = await db.transaction(async (tx) => {
      const [project] = await tx.select().from(pstProjectsTable)
        .where(eq(pstProjectsTable.id, access.project.id)).for("update");
      const [blueprint] = await tx.select().from(pstBlueprintsTable)
        .where(eq(pstBlueprintsTable.projectId, access.project.id)).for("update");
      const [latestQa] = await tx.select().from(pstQaRunsTable)
        .where(eq(pstQaRunsTable.projectId, access.project.id))
        .orderBy(desc(pstQaRunsTable.createdAt), desc(pstQaRunsTable.id)).limit(1);
      if (
        !project
        || !blueprint
        || !latestQa
        || !canApprove(project)
        || !canApprove({ qaStatus: latestQa.status })
      ) {
        throw new PublishRequirementError("Run a passing QA before approval.");
      }
      if (!latestQa.candidateHash) {
        throw new PublishRequirementError(
          "Kandidat rilis belum lengkap. Jalankan Perakitan ulang dengan pola atau resep yang sesuai, lalu ulangi QA.",
        );
      }
      const candidate = materializeCompilerReadySnapshot(
        await releaseSnapshot(project, blueprint, await nextReleaseVersion(project.id, tx), tx),
      );
      const candidateValidation = validatePublishCandidate({
        candidateHash: candidate.status === "READY" ? candidate.snapshot.snapshotHash : null,
        qaStatus: latestQa.status,
        qaCandidateHash: latestQa.candidateHash,
        requireApproval: false,
      });
      if (!candidateValidation.accepted) {
        throw new PublishRequirementError("Run QA again for the current candidate before approval.");
      }
      if (candidate.status === "BLOCKED" || !candidate.snapshot.snapshotHash) {
        throw new PublishRequirementError("Run QA again for the current candidate before approval.");
      }
      return tx.update(pstProjectsTable)
        .set({ status: "APPROVED", approvedCandidateHash: candidate.snapshot.snapshotHash, updatedAt: new Date() })
        .where(eq(pstProjectsTable.id, project.id))
        .returning();
    });
  } catch (error) {
    if (error instanceof PublishRequirementError) {
      res.status(409).json({ error: error.message });
      return;
    }
    throw error;
  }
  await addEvent("PST_APPROVED", `${updated.name} was explicitly approved by a human.`, updated.id);
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
      if (!lockedProject) {
        throw new PublishConflictError(publishConflictMessage);
      }
      if (!canPublish(lockedProject)) {
        if (lockedProject.status === "PUBLISHED" && lockedProject.publicationStatus === "PUBLISHED") {
          throw new PublishConflictError(publishConflictMessage);
        }
        throw new PublishRequirementError(
          "Only an approved PST without blocking QA errors can be published.",
        );
      }

      const [lockedBlueprint] = await tx
        .select()
        .from(pstBlueprintsTable)
        .where(eq(pstBlueprintsTable.projectId, lockedProject.id))
        .for("update");
      if (!lockedBlueprint) {
        throw new PublishRequirementError("A blueprint is required before publishing.");
      }

      const version = await nextReleaseVersion(lockedProject.id, tx);
      const releaseId = randomUUID();
      const createdAt = new Date();
      const candidate = materializeCompilerReadySnapshot(
        await releaseSnapshot(lockedProject, lockedBlueprint, version, tx),
      );
      if (candidate.status === "BLOCKED") {
        throw new PublishRequirementError(
          `Release is not Compiler-ready: ${candidate.errors.join(" ")}`,
        );
      }
      const [latestQa] = await tx
        .select()
        .from(pstQaRunsTable)
        .where(eq(pstQaRunsTable.projectId, lockedProject.id))
        .orderBy(desc(pstQaRunsTable.createdAt), desc(pstQaRunsTable.id))
        .limit(1);
      const candidateValidation = validatePublishCandidate({
        candidateHash: candidate.snapshot.snapshotHash,
        qaStatus: latestQa?.status,
        qaCandidateHash: latestQa?.candidateHash,
        approvedCandidateHash: lockedProject.approvedCandidateHash,
      });
      // This check runs before compiler work and every publication mutation.
      if (!candidateValidation.accepted) {
        throw new PublishRequirementError(
          "Only an approved PST without blocking QA errors can be published.",
        );
      }
      const executable = compileExecutableRelease({
        id: releaseId,
        projectId: lockedProject.id,
        version,
        createdAt,
      }, lockedProject.slug, candidate.snapshot);
      if (executable.status === "BLOCKED") {
        throw new PublishRequirementError(
          `Release is not executable: ${executable.diagnostics
            .map(({ code, path }) => `${code} at ${path}`)
            .join("; ")}`,
        );
      }
      await tx.insert(pstReleasesTable).values({
        id: releaseId,
        projectId: lockedProject.id,
        version,
        snapshot: candidate.snapshot,
        executableDefinition: executable.definition,
        createdAt,
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
  const restoredWorkflow = snapshot.workflow.map((step, index) => ({
    ...step,
    configuration: {
      ...(step.configuration ?? {}),
      ...(index === 0 && snapshot.components.length
        ? { authoredComponents: snapshot.components }
        : {}),
    },
  }));
  const factoryComponents = snapshot.factoryComponents ?? snapshot.components;
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
      workflow: restoredWorkflow,
      expectedOutput: snapshot.blueprint.expectedOutput,
      actionPlan: snapshot.blueprint.actionPlan,
      nextStep: snapshot.blueprint.nextStep,
      version: release.version,
      updatedAt: new Date(),
    }).where(eq(pstBlueprintsTable.projectId, access.project.id));
    await tx.delete(pstProjectComponentsTable).where(eq(pstProjectComponentsTable.projectId, access.project.id));
    if (factoryComponents.length) {
      const assetIds = factoryComponents.map(({ assetId }) => assetId);
      const existingAssets = await tx
        .select({ id: pstAssetsTable.id })
        .from(pstAssetsTable)
        .where(inArray(pstAssetsTable.id, assetIds));
      const existingAssetIds = new Set(existingAssets.map(({ id }) => id));
      const restorableComponents = factoryComponents.filter(({ assetId }) =>
        existingAssetIds.has(assetId));
      if (restorableComponents.length) {
        await tx.insert(pstProjectComponentsTable).values(restorableComponents.map((component) => ({
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
  }));
});

router.post("/pst/public/workspaces/:slug/sessions", async (req, res): Promise<void> => {
  const params = StartPublicPstRuntimeSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  let workspace;
  try {
    workspace = await publicWorkspace(params.data.slug);
  } catch (error) {
    if (error instanceof PublicWorkspaceConsistencyError) {
      res.status(503).json({ error: error.message });
      return;
    }
    throw error;
  }
  if (!workspace) {
    res.status(404).json({ error: "Published customer workspace not found" });
    return;
  }

  const started = createPstRuntime(workspace.definition);
  if (started.status === "BLOCKED") {
    res.status(503).json({ error: "Published customer workspace cannot start a runtime session." });
    return;
  }
  const result = advancePstRuntime(started.session);
  const persisted = persistedRuntimeAdvance(result);
  if (!persisted) {
    res.status(503).json({ error: "Published customer workspace cannot start a runtime session." });
    return;
  }

  const sessionId = randomUUID();
  const revision = 0;
  await db.insert(pstPublicRuntimeSessionsTable).values({
    id: sessionId,
    projectId: workspace.id,
    releaseId: workspace.release.id,
    releaseVersion: workspace.release.version,
    runtimeSession: persisted.runtimeSession,
    status: persisted.status,
    outcomeId: persisted.outcomeId,
    output: persisted.output,
    errors: persisted.errors,
    revision,
  });
  res.status(201).json(StartPublicPstRuntimeSessionResponse.parse(
    publicRuntimeSessionView(sessionId, revision, result),
  ));
});

router.post("/pst/public/workspaces/:slug/sessions/:sessionId/advance", async (req, res): Promise<void> => {
  const params = AdvancePublicPstRuntimeSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = AdvancePublicPstRuntimeSessionBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  type AdvanceTransactionResult =
    | { kind: "NOT_FOUND" }
    | { kind: "STALE"; revision: number }
    | { kind: "IDEMPOTENCY_CONFLICT" }
    | { kind: "RELEASE_CHANGED" }
    | { kind: "UNAVAILABLE"; error: string }
    | { kind: "SUCCESS"; response: ReturnType<typeof publicRuntimeSessionView> };
  const outcome = await db.transaction(async (tx): Promise<AdvanceTransactionResult> => {
    const [session] = await tx
      .select()
      .from(pstPublicRuntimeSessionsTable)
      .where(eq(pstPublicRuntimeSessionsTable.id, params.data.sessionId))
      .for("update");
    if (!session) return { kind: "NOT_FOUND" };
    const requestHash = pstCanonicalJsonHash({
      revision: body.data.revision,
      input: body.data.input,
    });
    const [existingAdvance] = await tx
      .select()
      .from(pstPublicRuntimeSessionAdvancesTable)
      .where(and(
        eq(pstPublicRuntimeSessionAdvancesTable.sessionId, session.id),
        eq(pstPublicRuntimeSessionAdvancesTable.requestId, body.data.requestId),
      ))
      .limit(1);
    if (existingAdvance) {
      return existingAdvance.requestHash === requestHash
        ? {
            kind: "SUCCESS",
            response: existingAdvance.response as ReturnType<typeof publicRuntimeSessionView>,
          }
        : { kind: "IDEMPOTENCY_CONFLICT" };
    }

    let workspace;
    try {
      workspace = await publicWorkspace(params.data.slug, tx);
    } catch (error) {
      if (error instanceof PublicWorkspaceConsistencyError) {
        return { kind: "UNAVAILABLE", error: error.message };
      }
      throw error;
    }
    if (!workspace || session.projectId !== workspace.id) return { kind: "NOT_FOUND" };
    if (
      session.releaseId !== workspace.release.id
      || session.releaseVersion !== workspace.release.version
    ) {
      return { kind: "RELEASE_CHANGED" };
    }
    if (session.revision !== body.data.revision) {
      return { kind: "STALE", revision: session.revision };
    }
    if (session.status === "COMPLETED") {
      return {
        kind: "SUCCESS",
        response: {
          sessionId: session.id,
          revision: session.revision,
          status: "COMPLETED",
          outcomeId: session.outcomeId ?? undefined,
          output: session.output ?? undefined,
        },
      };
    }

    const result = advancePstRuntime(session.runtimeSession, body.data.input as PstRuntimeInputV1);
    const persisted = persistedRuntimeAdvance(result);
    if (!persisted) {
      return { kind: "UNAVAILABLE", error: "Public runtime session could not be advanced." };
    }
    const revision = session.revision + 1;
    await tx
      .update(pstPublicRuntimeSessionsTable)
      .set({
        runtimeSession: persisted.runtimeSession,
        status: persisted.status,
        outcomeId: persisted.outcomeId ?? null,
        output: persisted.output ?? null,
        errors: persisted.errors ?? null,
        revision,
        updatedAt: new Date(),
      })
      .where(eq(pstPublicRuntimeSessionsTable.id, session.id));
    const response = publicRuntimeSessionView(session.id, revision, result);
    await tx.insert(pstPublicRuntimeSessionAdvancesTable).values({
      id: randomUUID(),
      sessionId: session.id,
      requestId: body.data.requestId,
      requestHash,
      response,
    });
    return { kind: "SUCCESS", response };
  });

  if (outcome.kind === "NOT_FOUND") {
    res.status(404).json({ error: "Public runtime session not found" });
    return;
  }
  if (outcome.kind === "UNAVAILABLE") {
    res.status(503).json({ error: outcome.error });
    return;
  }
  if (outcome.kind === "STALE") {
    res.status(409).json({ error: "Public runtime session revision is stale", revision: outcome.revision });
    return;
  }
  if (outcome.kind === "IDEMPOTENCY_CONFLICT") {
    res.status(409).json({ error: "Idempotency request ID was reused with different input" });
    return;
  }
  if (outcome.kind === "RELEASE_CHANGED") {
    res.status(409).json({ error: "Public runtime session release is no longer active" });
    return;
  }
  res.json(AdvancePublicPstRuntimeSessionResponse.parse(outcome.response));
});

export async function initializePstData() {
  await ensureSeed();
}

export default router;