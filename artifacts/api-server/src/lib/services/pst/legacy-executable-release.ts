import {
  pstCanonicalJsonHash,
  pstLegacyCompatibilityCompilerName,
  validateExecutablePstDefinitionV1,
  type ExecutablePstDefinitionV1,
  type PstExecutableComponentV1,
  type PstExecutableContextFieldV1,
  type PstExecutableStepV1,
  type PstReleaseSnapshot,
  type PstStateReference,
} from "@workspace/db/schema";

type PublishedRelease = {
  id: string;
  projectId: string;
  version: string;
  createdAt: Date;
};

type LegacyDiagnostic = {
  code: "LEGACY_COMPAT_UNSUPPORTED";
  path: string;
  message: string;
};

export type LegacyExecutableReleaseResult =
  | { status: "NOT_LEGACY" }
  | { status: "COMPILED"; definition: ExecutablePstDefinitionV1 }
  | { status: "BLOCKED"; diagnostics: LegacyDiagnostic[] };

const legacyStepKinds = new Set([
  "INPUT",
  "ASSESSMENT",
  "ANALYSIS",
  "RECOMMENDATION",
  "ACTION",
  "OUTPUT",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isLegacyWorkflowStep(value: unknown): value is PstReleaseSnapshot["workflow"][number] {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.type === "string"
    && typeof value.title === "string"
    && typeof value.description === "string"
    && isStringArray(value.inputs)
    && isStringArray(value.outputs)
    && isStringArray(value.dependencies)
    && typeof value.nextStep === "string";
}

function isLegacyPattern(value: unknown) {
  return value === undefined || (
    isRecord(value)
    && typeof value.id === "string"
    && typeof value.name === "string"
    && (value.version === undefined || typeof value.version === "string")
    && (value.description === undefined || typeof value.description === "string")
    && isStringArray(value.steps)
  );
}

function isLegacyRecipe(value: unknown) {
  return value === undefined || (
    isRecord(value)
    && typeof value.id === "string"
    && typeof value.name === "string"
    && (value.version === undefined || typeof value.version === "string")
    && (value.description === undefined || typeof value.description === "string")
    && isStringArray(value.components)
  );
}

function isLegacyEnvelope(value: unknown): value is PstReleaseSnapshot {
  if (!isRecord(value) || !isRecord(value.project) || !isRecord(value.blueprint)) return false;
  const productDna = value.project.productDna;
  return isRecord(productDna)
    && typeof value.project.name === "string"
    && typeof value.project.description === "string"
    && typeof value.project.problemStatement === "string"
    && typeof value.project.targetUser === "string"
    && typeof value.project.desiredOutcome === "string"
    && isStringArray(productDna.journey)
    && isStringArray(value.blueprint.journey)
    && isStringArray(value.blueprint.expectedOutput)
    && Array.isArray(value.blueprint.workflow)
    && value.blueprint.workflow.every(isLegacyWorkflowStep)
    && Array.isArray(value.workflow)
    && value.workflow.every(isLegacyWorkflowStep)
    && Array.isArray(value.components)
    && Array.isArray(value.rules)
    && Array.isArray(value.providers)
    && isLegacyPattern(value.pattern)
    && isLegacyRecipe(value.recipe);
}

function diagnostic(path: string, message: string): LegacyDiagnostic {
  return { code: "LEGACY_COMPAT_UNSUPPORTED", path, message };
}

function hasOwn(value: object, key: PropertyKey) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function stateKey(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "_")
    .replace(/^[_\-.]+|[_\-.]+$/g, "");
  return normalized || undefined;
}

function compatibilityMarkerPresent(snapshot: unknown) {
  return isRecord(snapshot) && (
    snapshot.sourceSchemaVersion !== undefined
    || snapshot.snapshotHash !== undefined
    || snapshot.snapshotHashAlgorithm !== undefined
  );
}

export function compileLegacyExecutableRelease(
  release: PublishedRelease,
  slug: string,
  candidate: PstReleaseSnapshot,
): LegacyExecutableReleaseResult {
  if (compatibilityMarkerPresent(candidate)) return { status: "NOT_LEGACY" };
  if (!isLegacyEnvelope(candidate)) {
    return {
      status: "BLOCKED",
      diagnostics: [diagnostic("snapshot", "Legacy release snapshot envelope is malformed.")],
    };
  }
  const snapshot = candidate;

  const errors: LegacyDiagnostic[] = [];
  if (pstCanonicalJsonHash(snapshot.workflow) !== pstCanonicalJsonHash(snapshot.blueprint.workflow)) {
    errors.push(diagnostic("snapshot.workflow", "Legacy workflow must match the immutable Blueprint workflow."));
  }
  if (!snapshot.workflow.length) {
    errors.push(diagnostic("snapshot.workflow", "Legacy workflow must contain at least one step."));
  }
  if (snapshot.components.length || snapshot.rules.length || snapshot.providers.length) {
    errors.push(diagnostic(
      "snapshot",
      "Legacy compatibility cannot silently reinterpret component, rule, or provider declarations.",
    ));
  }

  const outputReferences = new Map<string, {
    reference: PstStateReference;
    producerIndex: number;
  }>();
  const normalizedReferences = new Map<PstStateReference, string>();
  const stepIds = new Set<string>();
  const outcomeStepIds: string[] = [];
  const contextFields: PstExecutableContextFieldV1[] = [];
  const components: PstExecutableComponentV1[] = [];

  snapshot.workflow.forEach((step, index) => {
    const path = `snapshot.workflow[${index}]`;
    if (!step.id || stepIds.has(step.id)) {
      errors.push(diagnostic(`${path}.id`, "Legacy step IDs must be non-empty and unique."));
    }
    stepIds.add(step.id);
    if (!legacyStepKinds.has(step.type)) {
      errors.push(diagnostic(`${path}.type`, `Legacy step type ${step.type} is not supported.`));
    }
    if (hasOwn(step, "configuration")) {
      errors.push(diagnostic(`${path}.configuration`, "Configured workflows must use the strict v1 compiler path."));
    }
    if (!Array.isArray(step.inputs) || !Array.isArray(step.outputs)
      || !Array.isArray(step.dependencies)
      || step.outputs.some((output) => typeof output !== "string" || !output.trim())) {
      errors.push(diagnostic(path, "Legacy step data contract is incomplete."));
      return;
    }
    const expectedPrevious = index === 0 ? [] : [snapshot.workflow[index - 1]!.id];
    if (pstCanonicalJsonHash(step.dependencies) !== pstCanonicalJsonHash(expectedPrevious)) {
      errors.push(diagnostic(`${path}.dependencies`, "Legacy compatibility accepts only a linear dependency graph."));
    }
    const expectedNext = snapshot.workflow[index + 1]?.id ?? "";
    if (step.nextStep !== expectedNext) {
      errors.push(diagnostic(`${path}.nextStep`, "Legacy compatibility accepts only a linear transition graph."));
    }
    if (index === 0 && step.type !== "INPUT") {
      errors.push(diagnostic(`${path}.type`, "Legacy workflow must begin with an INPUT step."));
    }
    if (index === snapshot.workflow.length - 1 && step.type !== "OUTPUT") {
      errors.push(diagnostic(`${path}.type`, "Legacy workflow must end with an OUTPUT step."));
    }
    if (step.type === "OUTPUT") outcomeStepIds.push(step.id);

    const namespace = step.type === "INPUT"
      ? "context"
      : step.type === "ASSESSMENT"
        ? "answers"
        : "derived";
    for (const output of step.outputs) {
      const key = stateKey(output);
      if (!key) {
        errors.push(diagnostic(`${path}.outputs`, "Legacy output names must produce a valid state key."));
        continue;
      }
      if (outputReferences.has(output)) {
        errors.push(diagnostic(`${path}.outputs`, `Legacy output ${output} is produced more than once.`));
        continue;
      }
      const reference = `${namespace}.${key}` as PstStateReference;
      const collidingOutput = normalizedReferences.get(reference);
      if (collidingOutput) {
        errors.push(diagnostic(
          `${path}.outputs`,
          `Legacy outputs ${collidingOutput} and ${output} normalize to the same state reference.`,
        ));
        continue;
      }
      normalizedReferences.set(reference, output);
      outputReferences.set(output, { reference, producerIndex: index });
    }
  });

  if (outcomeStepIds.length !== 1) {
    errors.push(diagnostic("snapshot.workflow", "Legacy workflow must contain exactly one terminal OUTPUT step."));
  }
  if (errors.length) return { status: "BLOCKED", diagnostics: errors };

  const executableSteps: PstExecutableStepV1[] = snapshot.workflow.map((step, index) => {
    const reads = step.type === "INPUT"
      ? []
      : step.inputs.map((input) => outputReferences.get(input)?.reference).filter(
        (reference): reference is PstStateReference => Boolean(reference),
      );
    if (step.type !== "INPUT" && reads.length !== step.inputs.length) {
      errors.push(diagnostic(
        `snapshot.workflow[${index}].inputs`,
        "Every legacy input must reference an output from an earlier step.",
      ));
    }
    if (step.type !== "INPUT") {
      step.inputs.forEach((input, inputIndex) => {
        const producer = outputReferences.get(input);
        if (producer && producer.producerIndex >= index) {
          errors.push(diagnostic(
            `snapshot.workflow[${index}].inputs[${inputIndex}]`,
            `Legacy input ${input} must be produced by an earlier step.`,
          ));
        }
      });
    }
    const writes = step.outputs.map((output) => outputReferences.get(output)?.reference)
      .filter((reference): reference is PstStateReference => Boolean(reference));
    const next = step.type === "OUTPUT"
      ? { type: "complete" as const, outcomeId: step.id }
      : { type: "step" as const, stepId: step.nextStep };

    if (step.type === "INPUT") {
      const fields = writes.map((key, fieldIndex) => ({
        key,
        label: step.outputs[fieldIndex]!.replace(/[_-]+/g, " "),
        type: "string" as const,
        required: true,
      }));
      contextFields.push(...fields);
      return {
        id: step.id,
        kind: "input",
        title: step.title,
        description: step.description,
        reads,
        writes,
        dependsOn: step.dependencies,
        operation: { type: "collect-context", fields, sessionPersistence: "customer_session" },
        next,
      };
    }

    if (step.type === "ASSESSMENT") {
      const componentId = `legacy-${step.id}-questions`;
      components.push({
        id: componentId,
        assetId: componentId,
        name: `${step.title} questions`,
        version: "legacy-v0",
        capability: "question-schema",
        definition: {
          questions: writes.map((_, questionIndex) => ({
            id: stateKey(step.outputs[questionIndex]!)!,
            label: step.outputs[questionIndex]!.replace(/[_-]+/g, " "),
            type: "string",
            required: true,
          })),
        },
      });
      return {
        id: step.id,
        kind: "answer",
        title: step.title,
        description: step.description,
        reads,
        writes,
        dependsOn: step.dependencies,
        operation: { type: "collect-answers", schemaRef: componentId, answerFields: writes },
        next,
      };
    }

    if (step.type === "OUTPUT") {
      return {
        id: step.id,
        kind: "outcome",
        title: step.title,
        description: step.description,
        reads,
        writes: [],
        dependsOn: step.dependencies,
        operation: { type: "outcome", outcomeId: step.id, outputRefs: reads },
        next,
      };
    }

    if (writes.length !== 1) {
      errors.push(diagnostic(
        `snapshot.workflow[${index}].outputs`,
        `${step.type} compatibility steps must declare exactly one output.`,
      ));
    }
    const output = writes[0]!;
    const componentId = `legacy-${step.id}-template`;
    if (step.type === "ANALYSIS") {
      components.push({
        id: componentId,
        assetId: componentId,
        name: step.title,
        version: "legacy-v0",
        capability: "analysis-template",
        definition: { template: step.description, outputFields: [output] },
      });
      return {
        id: step.id, kind: "analysis", title: step.title, description: step.description,
        reads, writes, dependsOn: step.dependencies,
        operation: { type: "analyze", templateRef: componentId, output }, next,
      };
    }
    if (step.type === "RECOMMENDATION") {
      components.push({
        id: componentId,
        assetId: componentId,
        name: step.title,
        version: "legacy-v0",
        capability: "recommendation-strategy",
        definition: { template: step.description, outputFields: [output] },
      });
      return {
        id: step.id, kind: "recommendation", title: step.title, description: step.description,
        reads, writes, dependsOn: step.dependencies,
        operation: { type: "recommend", strategyRef: componentId, output }, next,
      };
    }
    components.push({
      id: componentId,
      assetId: componentId,
      name: step.title,
      version: "legacy-v0",
      capability: "action-template",
      definition: {
        items: [{ id: "next-action", title: step.title, description: step.description }],
      },
    });
    return {
      id: step.id, kind: "action", title: step.title, description: step.description,
      reads, writes, dependsOn: step.dependencies,
      operation: { type: "action", actionRef: componentId, output }, next,
    };
  });

  if (errors.length) return { status: "BLOCKED", diagnostics: errors };

  const definition: ExecutablePstDefinitionV1 = {
    runtimeVersion: "pst-runtime.v1",
    compiler: { name: pstLegacyCompatibilityCompilerName, version: "pst-legacy-compat.v1" },
    identity: {
      releaseId: release.id,
      projectId: release.projectId,
      slug,
      releaseVersion: release.version,
      publishedAt: release.createdAt.toISOString(),
      snapshotHash: pstCanonicalJsonHash(snapshot),
      sourceSchemaVersion: "pst-release-snapshot.legacy-v0",
      irVersion: "pst-manufacturing-ir.v1",
    },
    product: {
      name: snapshot.project.name,
      description: snapshot.project.description,
      problem: snapshot.project.problemStatement,
      targetUser: snapshot.project.targetUser,
      desiredOutcome: snapshot.project.desiredOutcome,
      journey: snapshot.blueprint.journey,
      expectedOutput: snapshot.blueprint.expectedOutput,
    },
    state: { contextFields, sessionPersistence: "customer_session" },
    declarations: {
      ...(snapshot.pattern ? {
        pattern: { ...snapshot.pattern, version: snapshot.pattern.version ?? "legacy-v0" },
      } : {}),
      ...(snapshot.recipe ? {
        recipe: { ...snapshot.recipe, version: snapshot.recipe.version ?? "legacy-v0" },
      } : {}),
      components,
      rules: [],
      providers: [],
    },
    steps: executableSteps,
    entryStepId: executableSteps[0]!.id,
    outcomeStepIds,
  };
  const validation = validateExecutablePstDefinitionV1(definition);
  return validation.status === "VALID"
    ? { status: "COMPILED", definition }
    : {
        status: "BLOCKED",
        diagnostics: validation.errors.map(({ path, message }) =>
          diagnostic(path, `Generated legacy definition is invalid: ${message}`)),
      };
}