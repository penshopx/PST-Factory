export type ManufacturingWorkflowStep = {
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

export type ManufacturingBlueprint = {
  problem: string;
  targetUser: string;
  desiredOutcome: string;
  journey: string[];
  knowledgeRequirements: string[];
  componentRequirements: string[];
  aiRequirements: string[];
  workflow: ManufacturingWorkflowStep[];
  expectedOutput: string[];
};

export type ManufacturingAsset = {
  id: string;
  name: string;
  type: string;
  description: string;
  tags: string[];
  compatibility: string[];
  status: string;
};

export type ManufacturingReference = {
  type: "pattern" | "recipe";
  id: string;
  name: string;
  steps?: string[];
  components?: string[];
};

export type BuildPlan = {
  journey: string[];
  componentRequirements: string[];
  workflow: ManufacturingWorkflowStep[];
  source?: Pick<ManufacturingReference, "type" | "id" | "name">;
  readyAssets: ManufacturingAsset[];
  ready: string[];
  missing: string[];
  warnings: string[];
  errors: string[];
  status: "READY" | "BLOCKED";
  components: Array<{
    id: string;
    name: string;
    type: string;
    source: string;
    status: "READY" | "MISSING";
  }>;
};

export type QaResult = {
  category: string;
  label: string;
  status: "PASS" | "WARNING" | "ERROR";
  detail: string;
};

export type QaProject = {
  problemStatement: string;
  targetUser: string;
  desiredOutcome: string;
  components: Array<{
    name: string;
    status: string;
    description?: string;
    tags?: string[];
    compatibility?: string[];
  }>;
};

export type ReleaseState = {
  status: string;
  qaStatus: string;
};

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "pst";
}

export function workflowFromStructure(
  labels: string[],
  source: Pick<ManufacturingReference, "type" | "id" | "name">,
): ManufacturingWorkflowStep[] {
  const steps = labels.length ? labels : ["Start", "Work", "Result"];
  const authored = steps.map((label, index) => {
    const normalized = label.toLowerCase();
    const type = index === 0
      ? "INPUT"
      : index === steps.length - 1
        ? "OUTCOME"
        : /scor/i.test(normalized)
          ? "SCORING"
          : /assess|question|criteria|option/i.test(normalized)
            ? "ANSWER"
          : /analy|extract|gap|current/i.test(normalized)
            ? "ANALYSIS"
            : /recommend/i.test(normalized)
              ? "RECOMMENDATION"
              : /plan|action/i.test(normalized)
              ? "ACTION"
              : /result|report/i.test(normalized)
                ? "ANALYSIS"
                : "UNRESOLVED";
    const namespace = type === "INPUT"
      ? "context"
      : type === "ANSWER"
        ? "answers"
        : "derived";
    return {
      id: `${slugify(label)}-${index}`,
      type,
      title: label,
      description: `${label} step from the ${source.type} "${source.name}".`,
      output: type === "OUTCOME" ? undefined : `${namespace}.${slugify(label)}_result`,
    };
  });
  return authored.map((step, index) => {
    const previous = authored[index - 1];
    const next = authored[index + 1];
    const inputs = previous?.output ? [previous.output] : [];
    const outputs = step.output ? [step.output] : [];
    const componentId = `authored-${step.id}`;
    const componentIdentity = {
      id: componentId,
      assetId: `${source.type}-${source.id}-${step.id}`,
      name: step.title,
      version: "1.0.0",
      status: "READY",
      required: true,
      source: `${source.type}: ${source.name}`,
    };
    const component = step.type === "ANSWER"
      ? {
          ...componentIdentity,
          type: "QUESTION_SCHEMA",
          configuration: {
            compilerReady: {
              capability: "question-schema",
              definition: {
                questions: outputs.map((output) => ({
                  id: output.split(".").at(-1) ?? output,
                  label: step.title,
                  type: "string",
                  required: true,
                })),
              },
            },
          },
        }
      : step.type === "SCORING"
        ? {
            ...componentIdentity,
            type: "SCORING_SCALE",
            configuration: {
              compilerReady: {
                capability: "scoring-scale",
                definition: {
                  minimum: 0,
                  maximum: 100,
                  bands: [
                    { minimum: 0, label: "Starting" },
                    { minimum: 50, label: "Progressing" },
                    { minimum: 80, label: "Strong" },
                  ],
                },
              },
            },
          }
        : step.type === "ANALYSIS"
          ? {
              ...componentIdentity,
              type: "ANALYSIS_TEMPLATE",
              configuration: {
                compilerReady: {
                  capability: "analysis-template",
                  definition: { template: step.description, outputFields: outputs },
                },
              },
            }
          : step.type === "RECOMMENDATION"
            ? {
                ...componentIdentity,
                type: "RECOMMENDATION_STRATEGY",
                configuration: {
                  compilerReady: {
                    capability: "recommendation-strategy",
                    definition: { template: step.description, outputFields: outputs },
                  },
                },
              }
            : step.type === "ACTION"
              ? {
                  ...componentIdentity,
                  type: "ACTION_TEMPLATE",
                  configuration: {
                    compilerReady: {
                      capability: "action-template",
                      definition: {
                        items: [{
                          id: `${slugify(step.title)}-next-action`,
                          title: step.title,
                          description: step.description,
                        }],
                      },
                    },
                  },
                }
              : undefined;
    const operation = step.type === "INPUT"
      ? {
          type: "collect-context",
          fields: outputs.map((key) => ({
            key,
            label: step.title,
            type: "string",
            required: true,
          })),
          sessionPersistence: "customer_session",
        }
      : step.type === "ANSWER"
        ? { type: "collect-answers", schemaRef: componentId, answerFields: outputs }
        : step.type === "SCORING"
          ? { type: "score", scaleRef: componentId, output: outputs[0] }
          : step.type === "ANALYSIS"
            ? { type: "analyze", templateRef: componentId, output: outputs[0] }
            : step.type === "RECOMMENDATION"
              ? { type: "recommend", strategyRef: componentId, output: outputs[0] }
              : step.type === "ACTION"
                ? { type: "action", actionRef: componentId, output: outputs[0] }
                : step.type === "OUTCOME"
                  ? { type: "outcome", outcomeId: step.id, outputRefs: inputs }
                  : undefined;
    return {
      id: step.id,
      type: step.type,
      title: step.title,
      description: step.description,
      inputs,
      outputs,
      dependencies: previous ? [previous.id] : [],
      nextStep: next?.id ?? "",
      configuration: {
        sourceType: source.type,
        sourceId: source.id,
        sourceName: source.name,
        sourceIndex: index,
        ...(operation ? {
          canonical: {
            next: next
              ? { type: "step", target: next.id }
              : { type: "complete" },
          },
          compilerReady: { operation },
        } : {}),
        ...(component ? { authoredComponents: [component] } : {}),
      },
    };
  });
}

export function assetMatchesRequirement(requirement: string, asset: ManufacturingAsset) {
  const requirementWords = requirement.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 3);
  const assetText = [
    asset.name,
    asset.description,
    ...asset.tags,
    ...asset.compatibility,
  ].join(" ").toLowerCase();
  return requirementWords.some((word) => assetText.includes(word));
}

/**
 * Resolve a blueprint into working parts using only library configuration.
 * Product-specific behavior belongs in the Blueprint, pattern, recipe, and assets;
 * this function only applies their shared manufacturing contract.
 */
export function buildFromConfiguration(input: {
  blueprint: ManufacturingBlueprint;
  assets: ManufacturingAsset[];
  pattern?: ManufacturingReference;
  recipe?: ManufacturingReference;
  idFactory?: () => string;
}): BuildPlan {
  const { blueprint, assets, pattern, recipe } = input;
  const source = pattern
    ? { type: pattern.type, id: pattern.id, name: pattern.name }
    : recipe
      ? { type: recipe.type, id: recipe.id, name: recipe.name }
      : undefined;
  const requirements = recipe?.components ?? blueprint.componentRequirements;
  const structure = pattern?.steps ?? recipe?.components;
  const workflow = source
    ? workflowFromStructure(structure ?? [], source)
    : blueprint.workflow;
  const journey = pattern?.steps ?? blueprint.journey;
  const readyAssets: ManufacturingAsset[] = [];
  const missing = requirements.filter((requirement) => {
    const asset = assets.find((candidate) => candidate.status === "ACTIVE" && assetMatchesRequirement(requirement, candidate));
    if (asset && !readyAssets.some((ready) => ready.id === asset.id)) readyAssets.push(asset);
    return !asset;
  });
  const idFactory = input.idFactory ?? (() => `component-${Math.random().toString(36).slice(2)}`);
  const components = requirements.map((requirement) => {
    const asset = readyAssets.find((candidate) => assetMatchesRequirement(requirement, candidate));
    return asset
      ? { id: idFactory(), name: asset.name, type: asset.type, source: "Asset Library", status: "READY" as const }
      : { id: `missing-${slugify(requirement)}`, name: requirement, type: "RECIPE_COMPONENT", source: recipe ? `Recipe: ${recipe.name}` : "Blueprint requirement", status: "MISSING" as const };
  });
  return {
    journey,
    componentRequirements: requirements,
    workflow,
    source,
    readyAssets,
    ready: readyAssets.map((asset) => asset.name),
    missing,
    warnings: [
      pattern ? `Workflow derived from pattern: ${pattern.name}.` : undefined,
      recipe ? `Components derived from recipe: ${recipe.name}.` : undefined,
    ].filter((warning): warning is string => Boolean(warning)),
    errors: missing.length ? ["Some blueprint requirements still need a compatible asset."] : [],
    status: missing.length ? "BLOCKED" : "READY",
    components,
  };
}

function workflowIsConnected(workflow: ManufacturingWorkflowStep[]) {
  if (workflow.length < 2) return false;
  const ids = new Set(workflow.map((step) => step.id));
  return workflow.every((step, index) => {
    const dependenciesExist = step.dependencies.every((dependency) => ids.has(dependency));
    const nextStepExists = index === workflow.length - 1
      ? step.nextStep === "" || ids.has(step.nextStep)
      : ids.has(step.nextStep);
    return dependenciesExist && nextStepExists;
  });
}

export function evaluateQa(project: QaProject, blueprint: ManufacturingBlueprint): QaResult[] {
  const requirementsResolved = blueprint.componentRequirements.length > 0
    && blueprint.componentRequirements.every((requirement) =>
      project.components.some((component) =>
        component.status === "READY" && assetMatchesRequirement(requirement, {
          id: component.name,
          name: component.name,
          type: "component",
          description: component.description ?? "",
          tags: component.tags ?? [],
          compatibility: component.compatibility ?? [],
          status: component.status,
        }),
      ),
    );
  return [
    {
      category: "PROBLEM",
      label: "Problem, user, and outcome defined",
      status: project.problemStatement && project.targetUser && project.desiredOutcome ? "PASS" : "ERROR",
      detail: "The product promise is explicit.",
    },
    {
      category: "KNOWLEDGE",
      label: "Knowledge requirements available",
      status: blueprint.knowledgeRequirements.length ? "PASS" : "WARNING",
      detail: "Blueprint references are ready for review.",
    },
    {
      category: "WORKFLOW",
      label: "Steps connected",
      status: workflowIsConnected(blueprint.workflow) ? "PASS" : "ERROR",
      detail: "Each step has a valid dependency and next-step contract.",
    },
    {
      category: "AI",
      label: "AI configuration exists",
      status: blueprint.aiRequirements.length ? "PASS" : "WARNING",
      detail: "AI remains an assistive layer and is not auto-publishing.",
    },
    {
      category: "OUTPUT",
      label: "Outputs defined",
      status: blueprint.expectedOutput.length ? "PASS" : "ERROR",
      detail: "Expected outputs map to the desired outcome.",
    },
    {
      category: "TECHNICAL",
      label: "Dependencies resolved",
      status: requirementsResolved ? "PASS" : "ERROR",
      detail: requirementsResolved
        ? "Reusable components are connected."
        : "One or more required reusable components is missing.",
    },
    {
      category: "UX",
      label: "Journey is understandable",
      status: blueprint.journey.length >= 4 ? "PASS" : "WARNING",
      detail: "The guided path is visible to the creator.",
    },
  ];
}

export function qaStatus(results: QaResult[]) {
  return results.some((result) => result.status === "ERROR")
    ? "ERROR"
    : results.some((result) => result.status === "WARNING")
      ? "WARNING"
      : "PASS";
}

export function canApprove(state: Pick<ReleaseState, "qaStatus">) {
  return state.qaStatus === "PASS" || state.qaStatus === "WARNING";
}

export function canPublish(state: ReleaseState) {
  return state.status === "APPROVED"
    && state.qaStatus !== "ERROR"
    && state.qaStatus !== "NOT_RUN";
}

export function isPublicCustomerWorkspace(project: {
  slug: string;
  status: string;
  publicationStatus: string;
}, requestedSlug: string) {
  return project.slug === requestedSlug
    && project.status === "PUBLISHED"
    && project.publicationStatus === "PUBLISHED";
}

export function customerWorkspaceSteps(
  workflow: ManufacturingWorkflowStep[],
  assistant?: Record<string, unknown>,
) {
  return workflow.map((step) => ({
    ...step,
    configuration: { ...step.configuration, ...(assistant ? { assistant } : {}) },
  }));
}

export function publicCustomerWorkspaceSteps(workflow: ManufacturingWorkflowStep[]) {
  return workflow.map((step) => ({
    id: step.id,
    type: step.type,
    title: step.title,
    description: step.description,
    inputs: step.inputs,
    outputs: step.outputs,
    dependencies: step.dependencies,
    nextStep: step.nextStep,
  }));
}