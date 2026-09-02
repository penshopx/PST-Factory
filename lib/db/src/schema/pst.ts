import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const pstProjectsTable = pgTable("pst_projects", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull().default("system"),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description").notNull().default(""),
  status: text("status").notNull().default("DRAFT"),
  version: text("version").notNull().default("v0.1"),
  domain: text("domain").notNull().default("General"),
  family: text("family").notNull().default("Problem Solving"),
  series: text("series").notNull().default("First Series"),
  problemStatement: text("problem_statement").notNull(),
  targetUser: text("target_user").notNull(),
  desiredOutcome: text("desired_outcome").notNull(),
  productDna: jsonb("product_dna").$type<{
    problem: string;
    user: string;
    journey: string[];
    components: string[];
    intelligence: string;
    outcome: string;
  }>().notNull(),
  qaStatus: text("qa_status").notNull().default("NOT_RUN"),
  publicationStatus: text("publication_status").notNull().default("UNPUBLISHED"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const pstProjectRoleValues = ["admin", "editor", "viewer"] as const;
export type PstProjectRole = (typeof pstProjectRoleValues)[number];

export const pstProjectMembersTable = pgTable(
  "pst_project_members",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => pstProjectsTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    role: text("role").$type<PstProjectRole>().notNull().default("viewer"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    projectUserUnique: uniqueIndex("pst_project_members_project_user_idx").on(
      table.projectId,
      table.userId,
    ),
  }),
);

export const pstBlueprintsTable = pgTable("pst_blueprints", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => pstProjectsTable.id, { onDelete: "cascade" }),
  problem: text("problem").notNull(),
  targetUser: text("target_user").notNull(),
  desiredOutcome: text("desired_outcome").notNull(),
  problemType: text("problem_type").notNull(),
  journey: text("journey").array().notNull(),
  knowledgeRequirements: text("knowledge_requirements").array().notNull(),
  componentRequirements: text("component_requirements").array().notNull(),
  aiRequirements: text("ai_requirements").array().notNull(),
  workflow: jsonb("workflow").$type<WorkflowStep[]>().notNull(),
  expectedOutput: text("expected_output").array().notNull(),
  actionPlan: text("action_plan").array().notNull(),
  nextStep: text("next_step").notNull(),
  version: text("version").notNull().default("v0.1"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const pstAssetsTable = pgTable("pst_assets", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  description: text("description").notNull(),
  version: text("version").notNull().default("v1.0"),
  status: text("status").notNull().default("ACTIVE"),
  tags: text("tags").array().notNull(),
  domain: text("domain").notNull(),
  compatibility: text("compatibility").array().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const pstPatternsTable = pgTable("pst_patterns", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  version: text("version").notNull().default("v1.0"),
  description: text("description").notNull(),
  steps: text("steps").array().notNull(),
  usageCount: integer("usage_count").notNull().default(0),
});

export const pstRecipesTable = pgTable("pst_recipes", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  version: text("version").notNull().default("v1.0"),
  description: text("description").notNull(),
  components: text("components").array().notNull(),
  usageCount: integer("usage_count").notNull().default(0),
});

export const pstProjectPatternsTable = pgTable(
  "pst_project_patterns",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => pstProjectsTable.id, { onDelete: "cascade" }),
    patternId: text("pattern_id")
      .notNull()
      .references(() => pstPatternsTable.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    projectPatternUnique: uniqueIndex("pst_project_patterns_project_pattern_idx").on(
      table.projectId,
      table.patternId,
    ),
  }),
);

export const pstProjectRecipesTable = pgTable(
  "pst_project_recipes",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => pstProjectsTable.id, { onDelete: "cascade" }),
    recipeId: text("recipe_id")
      .notNull()
      .references(() => pstRecipesTable.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    projectRecipeUnique: uniqueIndex("pst_project_recipes_project_recipe_idx").on(
      table.projectId,
      table.recipeId,
    ),
  }),
);

export const pstProjectComponentsTable = pgTable("pst_project_components", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => pstProjectsTable.id, { onDelete: "cascade" }),
  assetId: text("asset_id")
    .notNull()
    .references(() => pstAssetsTable.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  type: text("type").notNull(),
  source: text("source").notNull(),
  status: text("status").notNull().default("READY"),
  required: boolean("required").notNull().default(true),
});

export const pstProjectDocumentsTable = pgTable("pst_project_documents", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => pstProjectsTable.id, { onDelete: "cascade" }),
  uploadedBy: text("uploaded_by").notNull(),
  name: text("name").notNull(),
  objectPath: text("object_path").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  status: text("status").notNull().default("READY"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type PstReleaseComponentSnapshot = {
  id: string;
  assetId: string;
  name: string;
  type: string;
  source: string;
  version?: string;
  status: string;
  required: boolean;
  configuration?: Record<string, unknown>;
};

export type PstReleasePatternSnapshot = {
  id: string;
  name: string;
  version?: string;
  description?: string;
  steps: string[];
};

export type PstReleaseRecipeSnapshot = {
  id: string;
  name: string;
  version?: string;
  description?: string;
  components: string[];
};

export type PstReleaseRuleSnapshot = {
  id: string;
  version: string;
  name: string;
  kind: string;
  when: Record<string, unknown>;
  then: Array<Record<string, unknown>>;
};

export type PstReleaseProviderSnapshot = {
  id: string;
  capability: string;
  mode: string;
  configuration?: Record<string, unknown>;
};

export type PstReleaseProjectSnapshot = {
  name: string;
  description: string;
  status: "PUBLISHED";
  version: string;
  domain: string;
  family: string;
  series: string;
  problemStatement: string;
  targetUser: string;
  desiredOutcome: string;
  productDna: {
    problem: string;
    user: string;
    journey: string[];
    components: string[];
    intelligence: string;
    outcome: string;
  };
  qaStatus: string;
  publicationStatus: "PUBLISHED";
};

export type PstReleaseSnapshot = {
  sourceSchemaVersion?: "pst-release-snapshot.v1";
  snapshotHash?: string;
  snapshotHashAlgorithm?: "sha256-canonical-json.v1";
  project: PstReleaseProjectSnapshot;
  blueprint: Omit<PstBlueprint, "updatedAt"> & { version: string; updatedAt: string };
  workflow: WorkflowStep[];
  pattern?: PstReleasePatternSnapshot;
  recipe?: PstReleaseRecipeSnapshot;
  components: PstReleaseComponentSnapshot[];
  factoryComponents?: PstReleaseComponentSnapshot[];
  rules: PstReleaseRuleSnapshot[];
  providers: PstReleaseProviderSnapshot[];
};

export const pstReleasesTable = pgTable(
  "pst_releases",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => pstProjectsTable.id, { onDelete: "cascade" }),
    version: text("version").notNull(),
    snapshot: jsonb("snapshot").$type<PstReleaseSnapshot>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    projectVersionUnique: uniqueIndex("pst_releases_project_version_idx").on(
      table.projectId,
      table.version,
    ),
  }),
);

export const pstFactoryEventsTable = pgTable("pst_factory_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  message: text("message").notNull(),
  projectId: text("project_id").references(() => pstProjectsTable.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const pstQaRunsTable = pgTable("pst_qa_runs", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => pstProjectsTable.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  results: jsonb("results").$type<QaResult[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const pstSimulationsTable = pgTable("pst_simulations", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => pstProjectsTable.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  checks: text("checks").array().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type WorkflowStep = {
  id: string;
  type: string;
  title: string;
  description: string;
  inputs: string[];
  outputs: string[];
  dependencies: string[];
  nextStep: string;
  configuration?: Record<string, unknown>;
};

export type QaResult = {
  category: string;
  label: string;
  status: "PASS" | "WARNING" | "ERROR";
  detail: string;
};

export const insertPstProjectSchema = createInsertSchema(pstProjectsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertPstProject = z.infer<typeof insertPstProjectSchema>;
export type PstProject = typeof pstProjectsTable.$inferSelect;
export type PstProjectMember = typeof pstProjectMembersTable.$inferSelect;
export type PstBlueprint = typeof pstBlueprintsTable.$inferSelect;
export type PstAsset = typeof pstAssetsTable.$inferSelect;
export type PstPattern = typeof pstPatternsTable.$inferSelect;
export type PstRecipe = typeof pstRecipesTable.$inferSelect;
export type PstProjectPattern = typeof pstProjectPatternsTable.$inferSelect;
export type PstProjectRecipe = typeof pstProjectRecipesTable.$inferSelect;
export type PstProjectComponent = typeof pstProjectComponentsTable.$inferSelect;
export type PstProjectDocument = typeof pstProjectDocumentsTable.$inferSelect;
export type PstRelease = typeof pstReleasesTable.$inferSelect;
export type PstFactoryEvent = typeof pstFactoryEventsTable.$inferSelect;
export type PstQaRun = typeof pstQaRunsTable.$inferSelect;
export type PstSimulation = typeof pstSimulationsTable.$inferSelect;