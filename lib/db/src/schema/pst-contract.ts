import { createHash } from "node:crypto";
import type {
  PstReleaseComponentSnapshot,
  PstReleasePatternSnapshot,
  PstReleaseProviderSnapshot,
  PstReleaseRecipeSnapshot,
  PstReleaseRuleSnapshot,
  PstReleaseSnapshot,
  WorkflowStep,
} from "./pst";

export const pstCanonicalSourceContractVersion = "pst-canonical-source.v1" as const;
export const pstManufacturingIrVersion = "pst-manufacturing-ir.v1" as const;

export const pstCanonicalStepKinds = [
  "INPUT",
  "ANSWER",
  "PERSIST",
  "RULES",
  "SCORING",
  "ANALYSIS",
  "RECOMMENDATION",
  "ACTION",
  "OUTCOME",
] as const;

export type PstCanonicalStepKind = (typeof pstCanonicalStepKinds)[number];
export type PstStateNamespace = "context" | "answers" | "derived";
export type PstStateReference = `${PstStateNamespace}.${string}`;

export type PstCanonicalStepBindingsV1 = {
  inputs?: Record<string, PstStateReference>;
  outputs?: Record<string, PstStateReference>;
};

export type PstIrNextV1 =
  | { type: "step"; target: string }
  | {
      type: "conditional";
      branches: Array<{ when: Record<string, unknown>; target: string }>;
      defaultTarget?: string;
    }
  | { type: "complete" };

export type PstCanonicalStepDeclarationV1 = {
  kind?: PstCanonicalStepKind;
  bindings?: PstCanonicalStepBindingsV1;
  next?: PstIrNextV1;
};

export type PstCanonicalWorkflowStepV1 = Omit<WorkflowStep, "configuration"> & {
  configuration: Record<string, unknown> & {
    canonical?: PstCanonicalStepDeclarationV1;
  };
};

export type PstCanonicalReleaseMetadataV1 = {
  releaseId: string;
  projectId: string;
  slug: string;
  version: string;
  publishedAt: string;
  snapshotHash: string;
  snapshotHashAlgorithm: "sha256-canonical-json.v1";
  sourceSchemaVersion: "pst-release-snapshot.v1";
};

export type PstCanonicalProjectV1 = {
  name: string;
  description: string;
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
};

export type PstCanonicalBlueprintV1 = {
  id: string;
  projectId: string;
  version: string;
  problem: string;
  targetUser: string;
  desiredOutcome: string;
  problemType: string;
  journey: string[];
  knowledgeRequirements: string[];
  componentRequirements: string[];
  aiRequirements: string[];
  expectedOutput: string[];
  actionPlan: string[];
  nextStep: string;
};

export type PstCanonicalComponentV1 = Omit<
  PstReleaseComponentSnapshot,
  "version" | "configuration"
> & {
  version: string;
  configuration: Record<string, unknown>;
};

export type PstCanonicalPatternV1 = Omit<PstReleasePatternSnapshot, "version"> & {
  version: string;
};

export type PstCanonicalRecipeV1 = Omit<PstReleaseRecipeSnapshot, "version"> & {
  version: string;
};

export type PstCanonicalProviderV1 = Omit<PstReleaseProviderSnapshot, "configuration"> & {
  configuration: Record<string, unknown>;
};

export type PstCanonicalSourceV1 = {
  contractVersion: typeof pstCanonicalSourceContractVersion;
  release: PstCanonicalReleaseMetadataV1;
  project: PstCanonicalProjectV1;
  blueprint: PstCanonicalBlueprintV1;
  workflow: PstCanonicalWorkflowStepV1[];
  pattern?: PstCanonicalPatternV1;
  recipe?: PstCanonicalRecipeV1;
  components: PstCanonicalComponentV1[];
  rules: PstReleaseRuleSnapshot[];
  providers: PstCanonicalProviderV1[];
};

export type PstManufacturingIrNodeV1 = {
  id: string;
  kind: PstCanonicalStepKind;
  title: string;
  description: string;
  reads: PstStateReference[];
  writes: PstStateReference[];
  dependsOn: string[];
  next: PstIrNextV1;
  config: Record<string, unknown>;
};

export type PstManufacturingIrV1 = {
  irVersion: typeof pstManufacturingIrVersion;
  source: {
    releaseId: string;
    projectId: string;
    releaseVersion: string;
    snapshotHash: string;
    sourceSchemaVersion: "pst-release-snapshot.v1";
  };
  product: {
    problem: string;
    targetUser: string;
    desiredOutcome: string;
    problemType: string;
    journey: string[];
    expectedOutput: string[];
    actionPlan: string[];
  };
  declarations: {
    pattern?: PstCanonicalPatternV1;
    recipe?: PstCanonicalRecipeV1;
    components: PstCanonicalComponentV1[];
    rules: PstReleaseRuleSnapshot[];
    providers: PstCanonicalProviderV1[];
  };
  graph: {
    entry: string;
    nodes: PstManufacturingIrNodeV1[];
  };
};

export type PstNormalizationIssueV1 = {
  code:
    | "INVALID_SOURCE"
    | "SNAPSHOT_MISMATCH"
    | "AMBIGUOUS_STEP"
    | "INVALID_STATE_REFERENCE"
    | "INVALID_TRANSITION";
  path: string;
  message: string;
};

export type PstNormalizationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: PstNormalizationIssueV1[] };

export type PstReleaseEnvelopeV1 = {
  releaseId: string;
  projectId: string;
  slug: string;
  version: string;
  publishedAt: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)]),
  );
}

export function pstCanonicalJsonHash(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

function structurallyEqual(left: unknown, right: unknown) {
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
}

function canonicalWorkflow(
  workflow: WorkflowStep[],
  errors: PstNormalizationIssueV1[],
) {
  return workflow.map((step, index): PstCanonicalWorkflowStepV1 => {
    if (step.configuration !== undefined && !isRecord(step.configuration)) {
      errors.push({
        code: "INVALID_SOURCE",
        path: `workflow[${index}].configuration`,
        message: "Workflow configuration must be a data object.",
      });
    }
    return {
      ...step,
      configuration: isRecord(step.configuration) ? step.configuration : {},
    };
  });
}

export function canonicalSourceFromRelease(
  release: PstReleaseEnvelopeV1,
  snapshot: PstReleaseSnapshot,
): PstNormalizationResult<PstCanonicalSourceV1> {
  const errors: PstNormalizationIssueV1[] = [];
  const releaseFields = [
    ["releaseId", release.releaseId],
    ["projectId", release.projectId],
    ["slug", release.slug],
    ["version", release.version],
  ] as const;
  releaseFields.forEach(([field, value]) => {
    if (!value.trim()) {
      errors.push({
        code: "INVALID_SOURCE",
        path: `release.${field}`,
        message: `Release ${field} is required.`,
      });
    }
  });
  const publishedAt = Date.parse(release.publishedAt);
  if (
    !Number.isFinite(publishedAt)
    || new Date(publishedAt).toISOString() !== release.publishedAt
  ) {
    errors.push({
      code: "INVALID_SOURCE",
      path: "release.publishedAt",
      message: "Release publishedAt must be a canonical ISO-8601 UTC timestamp.",
    });
  }
  if (
    snapshot.sourceSchemaVersion !== "pst-release-snapshot.v1"
    || snapshot.snapshotHashAlgorithm !== "sha256-canonical-json.v1"
    || typeof snapshot.snapshotHash !== "string"
    || !/^[a-f0-9]{64}$/.test(snapshot.snapshotHash)
  ) {
    errors.push({
      code: "INVALID_SOURCE",
      path: "snapshot",
      message: "Canonical source requires a versioned, hash-addressed release snapshot.",
    });
  } else {
    const { snapshotHash, ...payload } = snapshot;
    if (pstCanonicalJsonHash(payload) !== snapshotHash) {
      errors.push({
        code: "SNAPSHOT_MISMATCH",
        path: "snapshot.snapshotHash",
        message: "Snapshot hash does not match the supplied immutable snapshot payload.",
      });
    }
  }
  if (
    release.projectId !== snapshot.blueprint.projectId
    || release.version !== snapshot.project.version
  ) {
    errors.push({
      code: "SNAPSHOT_MISMATCH",
      path: "release",
      message: "Release identity must match the Blueprint project and snapshot version.",
    });
  }
  if (!structurallyEqual(snapshot.workflow, snapshot.blueprint.workflow)) {
    errors.push({
      code: "SNAPSHOT_MISMATCH",
      path: "workflow",
      message: "Snapshot workflow must equal the Blueprint workflow mirror.",
    });
  }
  if (snapshot.pattern && !snapshot.pattern.version) {
    errors.push({
      code: "INVALID_SOURCE",
      path: "pattern.version",
      message: "Resolved Pattern version is required.",
    });
  }
  if (snapshot.recipe && !snapshot.recipe.version) {
    errors.push({
      code: "INVALID_SOURCE",
      path: "recipe.version",
      message: "Resolved Recipe version is required.",
    });
  }
  snapshot.components.forEach((component, index) => {
    if (!component.version) {
      errors.push({
        code: "INVALID_SOURCE",
        path: `components[${index}].version`,
        message: "Resolved component version is required.",
      });
    }
  });
  const workflow = canonicalWorkflow(snapshot.workflow, errors);
  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    value: {
      contractVersion: pstCanonicalSourceContractVersion,
      release: {
        ...release,
        snapshotHash: snapshot.snapshotHash!,
        snapshotHashAlgorithm: snapshot.snapshotHashAlgorithm!,
        sourceSchemaVersion: snapshot.sourceSchemaVersion!,
      },
      project: {
        name: snapshot.project.name,
        description: snapshot.project.description,
        domain: snapshot.project.domain,
        family: snapshot.project.family,
        series: snapshot.project.series,
        problemStatement: snapshot.project.problemStatement,
        targetUser: snapshot.project.targetUser,
        desiredOutcome: snapshot.project.desiredOutcome,
        productDna: snapshot.project.productDna,
      },
      blueprint: {
        id: snapshot.blueprint.id,
        projectId: snapshot.blueprint.projectId,
        version: snapshot.blueprint.version,
        problem: snapshot.blueprint.problem,
        targetUser: snapshot.blueprint.targetUser,
        desiredOutcome: snapshot.blueprint.desiredOutcome,
        problemType: snapshot.blueprint.problemType,
        journey: snapshot.blueprint.journey,
        knowledgeRequirements: snapshot.blueprint.knowledgeRequirements,
        componentRequirements: snapshot.blueprint.componentRequirements,
        aiRequirements: snapshot.blueprint.aiRequirements,
        expectedOutput: snapshot.blueprint.expectedOutput,
        actionPlan: snapshot.blueprint.actionPlan,
        nextStep: snapshot.blueprint.nextStep,
      },
      workflow,
      pattern: snapshot.pattern
        ? { ...snapshot.pattern, version: snapshot.pattern.version! }
        : undefined,
      recipe: snapshot.recipe
        ? { ...snapshot.recipe, version: snapshot.recipe.version! }
        : undefined,
      components: snapshot.components.map((component) => ({
        ...component,
        version: component.version!,
        configuration: component.configuration ?? {},
      })),
      rules: snapshot.rules,
      providers: snapshot.providers.map((provider) => ({
        ...provider,
        configuration: provider.configuration ?? {},
      })),
    },
  };
}

function isCanonicalKind(value: unknown): value is PstCanonicalStepKind {
  return typeof value === "string"
    && (pstCanonicalStepKinds as readonly string[]).includes(value);
}

function canonicalStepKind(
  step: PstCanonicalWorkflowStepV1,
  path: string,
  errors: PstNormalizationIssueV1[],
) {
  if (isCanonicalKind(step.type)) return step.type;
  if (step.type === "OUTPUT") return "OUTCOME";
  if (step.type !== "ASSESSMENT" && step.type !== "STEP") {
    errors.push({
      code: "AMBIGUOUS_STEP",
      path: `${path}.type`,
      message: `Unsupported workflow type "${step.type}" has no registered semantics.`,
    });
    return;
  }
  const declaration = step.configuration.canonical;
  if (!isRecord(declaration) || !isCanonicalKind(declaration.kind)) {
    errors.push({
      code: "AMBIGUOUS_STEP",
      path: `${path}.configuration.canonical.kind`,
      message: `${step.type} requires an explicit canonical step kind.`,
    });
    return;
  }
  return declaration.kind;
}

function isStateReference(value: unknown): value is PstStateReference {
  return typeof value === "string"
    && /^(?:context|answers|derived)\.[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value);
}

function stateReferences(
  values: string[],
  direction: "inputs" | "outputs",
  step: PstCanonicalWorkflowStepV1,
  path: string,
  errors: PstNormalizationIssueV1[],
) {
  const declaration = isRecord(step.configuration.canonical)
    ? step.configuration.canonical
    : undefined;
  const bindings = declaration && isRecord(declaration.bindings)
    ? declaration.bindings
    : undefined;
  const bindingMap = bindings && isRecord(bindings[direction])
    ? bindings[direction]
    : {};

  return values.flatMap((value, index) => {
    const resolved = isStateReference(value) ? value : bindingMap[value];
    if (!isStateReference(resolved)) {
      errors.push({
        code: "INVALID_STATE_REFERENCE",
        path: `${path}.${direction}[${index}]`,
        message: `"${value}" requires an explicit context, answers, or derived binding.`,
      });
      return [];
    }
    return [resolved];
  });
}

function isIrNext(value: unknown): value is PstIrNextV1 {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  if (value.type === "complete") return true;
  if (value.type === "step") return typeof value.target === "string" && value.target.length > 0;
  if (value.type !== "conditional" || !Array.isArray(value.branches)) return false;
  return value.branches.length > 0
    && value.branches.every((branch) =>
      isRecord(branch) && isRecord(branch.when)
      && typeof branch.target === "string" && branch.target.length > 0)
    && (value.defaultTarget === undefined
      || (typeof value.defaultTarget === "string" && value.defaultTarget.length > 0));
}

function canonicalNext(
  step: PstCanonicalWorkflowStepV1,
  kind: PstCanonicalStepKind,
  path: string,
  errors: PstNormalizationIssueV1[],
): PstIrNextV1 | undefined {
  const declaration = isRecord(step.configuration.canonical)
    ? step.configuration.canonical
    : undefined;
  if (declaration?.next !== undefined) {
    if (isIrNext(declaration.next)) return declaration.next;
    errors.push({
      code: "INVALID_TRANSITION",
      path: `${path}.configuration.canonical.next`,
      message: "Explicit canonical transition is invalid.",
    });
    return;
  }
  if (step.nextStep) return { type: "step", target: step.nextStep };
  if (kind === "OUTCOME") return { type: "complete" };
  errors.push({
    code: "INVALID_TRANSITION",
    path: `${path}.nextStep`,
    message: "Only an OUTCOME step may terminate through an empty nextStep.",
  });
  return undefined;
}

export function manufacturingIrFromCanonicalSource(
  source: PstCanonicalSourceV1,
): PstNormalizationResult<PstManufacturingIrV1> {
  const errors: PstNormalizationIssueV1[] = [];
  const nodes = source.workflow.flatMap((step, index) => {
    const path = `workflow[${index}]`;
    const kind = canonicalStepKind(step, path, errors);
    if (!kind) return [];
    const reads = stateReferences(step.inputs, "inputs", step, path, errors);
    const writes = stateReferences(step.outputs, "outputs", step, path, errors);
    const next = canonicalNext(step, kind, path, errors);
    if (!next) return [];
    const { canonical: _canonical, ...config } = step.configuration;
    return [{
      id: step.id,
      kind,
      title: step.title,
      description: step.description,
      reads,
      writes,
      dependsOn: [...step.dependencies],
      next,
      config,
    }];
  });
  if (errors.length) return { ok: false, errors };

  const byId = <T extends { id: string }>(values: T[]) =>
    [...values].sort((left, right) => left.id.localeCompare(right.id));

  return {
    ok: true,
    value: {
      irVersion: pstManufacturingIrVersion,
      source: {
        releaseId: source.release.releaseId,
        projectId: source.release.projectId,
        releaseVersion: source.release.version,
        snapshotHash: source.release.snapshotHash,
        sourceSchemaVersion: source.release.sourceSchemaVersion,
      },
      product: {
        problem: source.blueprint.problem,
        targetUser: source.blueprint.targetUser,
        desiredOutcome: source.blueprint.desiredOutcome,
        problemType: source.blueprint.problemType,
        journey: [...source.blueprint.journey],
        expectedOutput: [...source.blueprint.expectedOutput],
        actionPlan: [...source.blueprint.actionPlan],
      },
      declarations: {
        pattern: source.pattern,
        recipe: source.recipe,
        components: byId(source.components),
        rules: byId(source.rules),
        providers: byId(source.providers),
      },
      graph: {
        entry: nodes[0]?.id ?? "",
        nodes,
      },
    },
  };
}