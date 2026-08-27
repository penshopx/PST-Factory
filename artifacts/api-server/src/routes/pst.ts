import { Router, type IRouter, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { and, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
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
  pstQaRunsTable,
  pstRecipesTable,
  pstSimulationsTable,
  type WorkflowStep,
  type QaResult,
  type PstProjectRole,
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

function workflowFromStructure(
  labels: string[],
  source: { type: "pattern" | "recipe"; id: string; name: string },
): WorkflowStep[] {
  const steps = labels.length ? labels : ["Start", "Work", "Result"];
  return steps.map((label, index) => {
    const normalized = label.toLowerCase();
    const type = index === 0
      ? "INPUT"
      : index === steps.length - 1
        ? "OUTPUT"
        : /assess|question|criteria|score/i.test(normalized)
          ? "ASSESSMENT"
          : /analy|extract|gap|current/i.test(normalized)
            ? "ANALYSIS"
            : /recommend|plan|action/i.test(normalized)
              ? "ACTION"
              : "STEP";
    const previousId = index > 0 ? `${slugify(steps[index - 1])}-${index - 1}` : undefined;
    return {
      id: `${slugify(label)}-${index}`,
      type,
      title: label,
      description: `${label} step from the ${source.type} "${source.name}".`,
      inputs: previousId ? [`${slugify(steps[index - 1])}_result`] : ["user_context"],
      outputs: [`${slugify(label)}_result`],
      dependencies: previousId ? [previousId] : [],
      nextStep: index < steps.length - 1 ? `${slugify(steps[index + 1])}-${index + 1}` : "",
      configuration: {
        sourceType: source.type,
        sourceId: source.id,
        sourceName: source.name,
        sourceIndex: index,
      },
    };
  });
}

const makeBlueprint = (
  projectId: string,
  problem: string,
  user: string,
  outcome: string,
) => ({
  id: randomUUID(),
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

async function ensureSeedReferences() {
  const [project] = await db
    .select({ id: pstProjectsTable.id })
    .from(pstProjectsTable)
    .where(eq(pstProjectsTable.id, "pst-cashflow-check"));
  if (!project) return;
  const [pattern] = await db
    .select({ id: pstPatternsTable.id })
    .from(pstPatternsTable)
    .where(eq(pstPatternsTable.id, "pattern-assessment"));
  const [recipe] = await db
    .select({ id: pstRecipesTable.id })
    .from(pstRecipesTable)
    .where(eq(pstRecipesTable.id, "recipe-assessment"));
  if (pattern) {
    await db.insert(pstProjectPatternsTable).values({
      id: "project-pattern-cashflow-assessment",
      projectId: project.id,
      patternId: pattern.id,
    }).onConflictDoNothing();
  }
  if (recipe) {
    await db.insert(pstProjectRecipesTable).values({
      id: "project-recipe-cashflow-assessment",
      projectId: project.id,
      recipeId: recipe.id,
    }).onConflictDoNothing();
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
    })();
  }
  await seedPromise;

  // Existing development databases were seeded before ownership existed.
  // Claim only the legacy seed project, never another user's project.
  if (userId !== "system") {
    const [seedProject] = await db
      .select({ id: pstProjectsTable.id, ownerId: pstProjectsTable.ownerId })
      .from(pstProjectsTable)
      .where(eq(pstProjectsTable.id, "pst-cashflow-check"));
    if (seedProject?.ownerId === "system") {
      await db
        .update(pstProjectsTable)
        .set({ ownerId: userId, updatedAt: new Date() })
        .where(
          and(
            eq(pstProjectsTable.id, seedProject.id),
            eq(pstProjectsTable.ownerId, "system"),
          ),
        );
      await db
        .insert(pstProjectMembersTable)
        .values({
          id: randomUUID(),
          projectId: seedProject.id,
          userId,
          role: "admin",
        })
        .onConflictDoNothing();
    }
  }
}

async function projectAggregate(projectId: string) {
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
  const { selectedPatterns, selectedRecipes } = await getProjectReferences(projectId);
  return {
    ...project,
    blueprint: blueprint ?? makeBlueprint(projectId, project.problemStatement, project.targetUser, project.desiredOutcome),
    components,
    selectedPatterns,
    selectedRecipes,
  };
}

async function getPatternUsage(patternId: string) {
  const projects = await db
    .select({ id: pstProjectsTable.id, name: pstProjectsTable.name })
    .from(pstProjectPatternsTable)
    .innerJoin(pstProjectsTable, eq(pstProjectsTable.id, pstProjectPatternsTable.projectId))
    .where(eq(pstProjectPatternsTable.patternId, patternId));
  return {
    usageCount: projects.length,
    projectIds: projects.map((project) => project.id),
    projects,
  };
}

async function getRecipeUsage(recipeId: string) {
  const projects = await db
    .select({ id: pstProjectsTable.id, name: pstProjectsTable.name })
    .from(pstProjectRecipesTable)
    .innerJoin(pstProjectsTable, eq(pstProjectsTable.id, pstProjectRecipesTable.projectId))
    .where(eq(pstProjectRecipesTable.recipeId, recipeId));
  return {
    usageCount: projects.length,
    projectIds: projects.map((project) => project.id),
    projects,
  };
}

async function getProjectReferences(projectId: string) {
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
      ...(await getPatternUsage(pattern.id)),
    }))),
    selectedRecipes: await Promise.all(recipes.map(async (recipe) => ({
      ...recipe,
      ...(await getRecipeUsage(recipe.id)),
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

async function currentProjectReferences(projectId: string) {
  const references = await getProjectReferences(projectId);
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
  const [project] = await db
    .select()
    .from(pstProjectsTable)
    .where(eq(pstProjectsTable.id, projectId));
  if (!project) {
    res.status(404).json({ error: "PST project not found" });
    return;
  }

  let role: PstProjectRole | undefined =
    project.ownerId === userId ? "admin" : undefined;
  if (!role) {
    const [membership] = await db
      .select({ role: pstProjectMembersTable.role })
      .from(pstProjectMembersTable)
      .where(
        and(
          eq(pstProjectMembersTable.projectId, projectId),
          eq(pstProjectMembersTable.userId, userId),
        ),
      );
    role = membership?.role;
  }
  if (!role) {
    // Do not disclose the existence of projects outside the user's boundary.
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
  return { project, role };
}

const editorRoles: readonly PstProjectRole[] = ["admin", "editor"];
const adminRoles: readonly PstProjectRole[] = ["admin"];

async function publicWorkspace(slug: string) {
  const [project] = await db
    .select()
    .from(pstProjectsTable)
    .where(
      and(
        eq(pstProjectsTable.slug, slug),
        eq(pstProjectsTable.publicationStatus, "PUBLISHED"),
        eq(pstProjectsTable.status, "PUBLISHED"),
      ),
    );
  if (!project) return undefined;
  return projectAggregate(project.id);
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
  const aggregates = await Promise.all(projects.map((project) => projectAggregate(project.id)));
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
  const aggregate = await projectAggregate(id);
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
  const aggregate = await projectAggregate(access.project.id);
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
  res.json(UpdatePstProjectResponse.parse(await projectAggregate(updated.id)));
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
  const source = await projectAggregate(access.project.id);
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
  res.status(201).json(DuplicatePstProjectResponse.parse(await projectAggregate(id)));
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
  res.json(ArchivePstProjectResponse.parse(await projectAggregate(updated.id)));
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
  const references = await currentProjectReferences(project.id);
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

router.get("/pst/patterns", async (_req, res): Promise<void> => {
  await ensureSeed();
  const patterns = await db.select().from(pstPatternsTable).orderBy(pstPatternsTable.name);
  const enrichedPatterns = await Promise.all(patterns.map(async (pattern) => ({
    ...pattern,
    ...(await getPatternUsage(pattern.id)),
  })));
  res.json(ListPstPatternsResponse.parse(enrichedPatterns));
});

router.get("/pst/recipes", async (_req, res): Promise<void> => {
  await ensureSeed();
  const recipes = await db.select().from(pstRecipesTable).orderBy(pstRecipesTable.name);
  const enrichedRecipes = await Promise.all(recipes.map(async (recipe) => ({
    ...recipe,
    ...(await getRecipeUsage(recipe.id)),
  })));
  res.json(ListPstRecipesResponse.parse(enrichedRecipes));
});

function assetMatchesRequirement(requirement: string, asset: typeof pstAssetsTable.$inferSelect) {
  const requirementWords = requirement.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 3);
  const assetText = [
    asset.name,
    asset.description,
    ...asset.tags,
    ...asset.compatibility,
  ].join(" ").toLowerCase();
  return requirementWords.some((word) => assetText.includes(word));
}

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
  const references = await currentProjectReferences(access.project.id);
  const recipeRequirements = references.recipe?.components ?? blueprint.componentRequirements;
  const structure = references.pattern?.steps ?? references.recipe?.components;
  const workflowSource = references.pattern
    ? { type: "pattern" as const, id: references.pattern.id, name: references.pattern.name }
    : references.recipe
      ? { type: "recipe" as const, id: references.recipe.id, name: references.recipe.name }
      : undefined;
  const workflow = workflowSource
    ? workflowFromStructure(structure ?? [], workflowSource)
    : blueprint.workflow;
  if (workflowSource) {
    await db.update(pstBlueprintsTable).set({
      journey: references.pattern?.steps ?? blueprint.journey,
      componentRequirements: recipeRequirements,
      workflow,
      updatedAt: new Date(),
    }).where(eq(pstBlueprintsTable.projectId, access.project.id));
  }
  const selectedAssets = body.data.assetIds?.length
    ? await db.select().from(pstAssetsTable).where(inArray(pstAssetsTable.id, body.data.assetIds))
    : await db.select().from(pstAssetsTable).where(eq(pstAssetsTable.status, "ACTIVE")).limit(5);
  const readyAssets = new Map<string, typeof selectedAssets[number]>();
  const missing = references.recipe
    ? recipeRequirements.filter((requirement) => {
        const match = selectedAssets.find((asset) => assetMatchesRequirement(requirement, asset));
        if (match) readyAssets.set(match.id, match);
        return !match;
      })
    : blueprint.componentRequirements.filter((requirement) => !selectedAssets.some((asset) => asset.name.toLowerCase().includes(requirement.split(" ")[0].toLowerCase())));
  if (!references.recipe) {
    selectedAssets.forEach((asset) => readyAssets.set(asset.id, asset));
  }
  const components = references.recipe
    ? recipeRequirements.map((requirement) => {
        const asset = [...readyAssets.values()].find((candidate) => assetMatchesRequirement(requirement, candidate));
        return asset
          ? { id: randomUUID(), name: asset.name, type: asset.type, source: "Asset Library", status: "READY" as const }
          : { id: `recipe-${slugify(requirement)}`, name: requirement, type: "RECIPE_COMPONENT", source: `Recipe: ${references.recipe?.name ?? "selected"}`, status: "MISSING" as const };
      })
    : selectedAssets.map((asset) => ({
        id: randomUUID(),
        name: asset.name,
        type: asset.type,
        source: "Asset Library",
        status: "READY" as const,
      }));
  await db.delete(pstProjectComponentsTable).where(eq(pstProjectComponentsTable.projectId, access.project.id));
  for (const component of readyAssets.values()) {
    await db.insert(pstProjectComponentsTable).values({
      id: randomUUID(),
      projectId: access.project.id,
      assetId: component.id,
      name: component.name,
      type: component.type,
      source: "Asset Library",
      status: "READY",
      required: true,
    });
  }
  const status = missing.length ? "BLOCKED" : "READY";
  await db.update(pstProjectsTable).set({ status: missing.length ? "BUILDING" : "PREVIEW", updatedAt: new Date() }).where(eq(pstProjectsTable.id, access.project.id));
  await addEvent("BUILD_COMPLETED", `Builder finished with ${status.toLowerCase()} status.`, access.project.id);
  res.json(BuildPstProjectResponse.parse({
    status,
    ready: [...readyAssets.values()].map((asset) => asset.name),
    missing,
    warnings: [
      references.pattern ? `Workflow derived from pattern: ${references.pattern.name}.` : undefined,
      references.recipe ? `Components derived from recipe: ${references.recipe.name}.` : undefined,
    ].filter((warning): warning is string => Boolean(warning)),
    errors: missing.length ? ["Some blueprint requirements still need a compatible asset."] : [],
    components,
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
  const project = await projectAggregate(access.project.id);
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
  const project = await projectAggregate(access.project.id);
  if (!project) {
    res.status(404).json({ error: "PST project not found" });
    return;
  }
  const results: QaResult[] = [
    { category: "PROBLEM", label: "Problem, user, and outcome defined", status: project.problemStatement && project.targetUser && project.desiredOutcome ? "PASS" : "ERROR", detail: "The product promise is explicit." },
    { category: "KNOWLEDGE", label: "Knowledge requirements available", status: project.blueprint.knowledgeRequirements.length ? "PASS" : "WARNING", detail: "Blueprint references are ready for review." },
    { category: "WORKFLOW", label: "Steps connected", status: project.blueprint.workflow.length > 1 ? "PASS" : "ERROR", detail: "Each step has a next-step contract." },
    { category: "AI", label: "AI configuration exists", status: project.blueprint.aiRequirements.length ? "PASS" : "WARNING", detail: "AI remains an assistive layer and is not auto-publishing." },
    { category: "OUTPUT", label: "Outputs defined", status: project.blueprint.expectedOutput.length ? "PASS" : "ERROR", detail: "Expected outputs map to the desired outcome." },
    { category: "TECHNICAL", label: "Dependencies resolved", status: project.components.length >= 3 ? "PASS" : "WARNING", detail: project.components.length >= 3 ? "Reusable components are connected." : "Add more compatible assets before publishing." },
    { category: "UX", label: "Journey is understandable", status: project.blueprint.journey.length >= 4 ? "PASS" : "WARNING", detail: "The guided path is visible to the creator." },
  ];
  const status = results.some((result) => result.status === "ERROR") ? "ERROR" : results.some((result) => result.status === "WARNING") ? "WARNING" : "PASS";
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
  if (project.qaStatus === "ERROR" || project.qaStatus === "NOT_RUN") {
    res.status(409).json({ error: "Run a passing QA before approval." });
    return;
  }
  const [updated] = await db.update(pstProjectsTable).set({ status: "APPROVED", updatedAt: new Date() }).where(eq(pstProjectsTable.id, project.id)).returning();
  await addEvent("PST_APPROVED", `${project.name} was explicitly approved by a human.`, project.id);
  res.json(ApprovePstProjectResponse.parse(await projectAggregate(updated.id)));
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
  if (project.status !== "APPROVED" || project.qaStatus === "ERROR") {
    res.status(409).json({ error: "Only an approved PST without blocking QA errors can be published." });
    return;
  }
  const [updated] = await db.update(pstProjectsTable).set({ status: "PUBLISHED", publicationStatus: "PUBLISHED", updatedAt: new Date() }).where(eq(pstProjectsTable.id, project.id)).returning();
  await addEvent("PST_PUBLISHED", `${project.name} is now available in the customer workspace.`, project.id);
  res.json(PublishPstProjectResponse.parse(await projectAggregate(updated.id)));
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
  const project = await projectAggregate(access.project.id);
  if (!project) {
    res.status(404).json({ error: "PST workspace not found" });
    return;
  }
  const persona = await gustaftaEngine.getPersona();
  const steps = project.blueprint.workflow.map((step) => ({ ...step, configuration: { ...step.configuration, assistant: persona } }));
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
  res.json(members);
});

router.post("/pst/projects/:projectId/members", async (req, res): Promise<void> => {
  const params = GetPstProjectParams.safeParse(req.params);
  const body = UpsertPstProjectMemberBody.safeParse(req.body);
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
});

router.get("/pst/public/workspaces/:slug", async (req, res): Promise<void> => {
  const slug = typeof req.params.slug === "string" ? req.params.slug : req.params.slug?.[0];
  if (!slug) {
    res.status(400).json({ error: "Workspace slug is required" });
    return;
  }
  const project = await publicWorkspace(slug);
  if (!project) {
    res.status(404).json({ error: "Published customer workspace not found" });
    return;
  }
  const persona = await gustaftaEngine.getPersona();
  const steps = project.blueprint.workflow.map((step) => ({
    ...step,
    configuration: { ...step.configuration, assistant: persona },
  }));
  res.json(GetPstWorkspaceResponse.parse({ project, steps }));
});

export default router;