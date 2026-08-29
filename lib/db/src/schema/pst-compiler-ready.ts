import {
  pstCanonicalJsonHash,
  type PstCanonicalSourceV1,
  type PstManufacturingIrNodeV1,
  type PstManufacturingIrV1,
  type PstStateReference,
} from "./pst-contract";
import {
  type PstExecutableContextFieldV1,
  type PstExecutableComponentV1,
  type PstExecutableDeclarationsV1,
  type PstExecutableNextV1,
  type PstExecutableOperationV1,
  type PstExecutableProductV1,
  type PstExecutableProviderV1,
  type PstExecutableQuestionV1,
  type PstExecutableLiteralV1,
  type PstExecutablePredicateV1,
  type PstExecutableRuleEffectV1,
  type PstExecutableRuleV1,
  type PstExecutableStateContractV1,
  type PstExecutableStepKind,
  type PstExecutableStepV1,
} from "./pst-executable";
import type { PstValidationResultV1 } from "./pst-validator";

export const pstCompilerReadyIrVersion = "pst-compiler-ready-ir.v1" as const;

export type PstCompilerReadyIrV1 = {
  readyVersion: typeof pstCompilerReadyIrVersion;
  integrity: {
    algorithm: "sha256-canonical-json.v1";
    hash: string;
  };
  sourceIr: {
    version: "pst-manufacturing-ir.v1";
    hash: string;
  };
  identity: {
    releaseId: string;
    projectId: string;
    slug: string;
    releaseVersion: string;
    publishedAt: string;
    snapshotHash: string;
    sourceSchemaVersion: "pst-release-snapshot.v1";
    irVersion: "pst-manufacturing-ir.v1";
  };
  product: PstExecutableProductV1;
  state: PstExecutableStateContractV1;
  declarations: PstExecutableDeclarationsV1;
  steps: PstExecutableStepV1[];
  entryStepId: string;
  outcomeStepIds: string[];
};

export type PstCompilerInputV1 = {
  compilerVersion: string;
  readyIr: PstCompilerReadyIrV1;
};

export type PstCompilerPreparationDiagnosticV1 = {
  code:
    | "INVALID_VALIDATION_PROOF"
    | "SOURCE_MISMATCH"
    | "MISSING_OPERATION"
    | "INVALID_OPERATION"
    | "UNRESOLVED_REFERENCE"
    | "INVALID_TRANSITION"
    | "INVALID_STATE_CONTRACT";
  path: string;
  message: string;
};

export type PstCompilerPreparationResultV1 =
  | {
      status: "READY";
      readyIr: PstCompilerReadyIrV1;
      warnings: [];
    }
  | {
      status: "BLOCKED";
      errors: PstCompilerPreparationDiagnosticV1[];
      warnings: [];
    };

type ValidatedIrResult = Extract<PstValidationResultV1, { status: "VALIDATED" }>;

type CompilerPreparationInput = {
  source: PstCanonicalSourceV1;
  ir: PstManufacturingIrV1;
  validation: ValidatedIrResult;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: string[]) {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isStateReference(value: unknown): value is PstStateReference {
  return typeof value === "string"
    && /^(?:context|answers|derived)\.[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value);
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0);
}

function stateReferenceArray(value: unknown): value is PstStateReference[] {
  return Array.isArray(value) && value.every(isStateReference);
}

function parsedOptions(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const options: Array<{ value: string; label: string }> = [];
  for (const option of value) {
    if (!isRecord(option)
      || !hasOnlyKeys(option, ["value", "label"])
      || typeof option.value !== "string"
      || typeof option.label !== "string") {
      return undefined;
    }
    options.push({ value: option.value, label: option.label });
  }
  return options;
}

function parseContextField(value: unknown): PstExecutableContextFieldV1 | undefined {
  if (!isRecord(value)
    || !hasOnlyKeys(value, ["key", "label", "type", "required", "sensitive", "options"])
    || !isStateReference(value.key)
    || !value.key.startsWith("context.")
    || typeof value.label !== "string"
    || !value.label.trim()
    || typeof value.required !== "boolean"
    || !["string", "number", "boolean", "choice", "date", "json"].includes(String(value.type))) {
    return undefined;
  }
  if (value.sensitive !== undefined && typeof value.sensitive !== "boolean") return undefined;
  const options = value.options === undefined ? undefined : parsedOptions(value.options);
  if (value.options !== undefined && !options) return undefined;
  return {
    key: value.key,
    label: value.label,
    type: value.type as PstExecutableContextFieldV1["type"],
    required: value.required,
    ...(value.sensitive === undefined ? {} : { sensitive: value.sensitive }),
    ...(options === undefined ? {} : { options }),
  };
}

function parseOperation(value: unknown): PstExecutableOperationV1 | undefined {
  if (!isRecord(value) || typeof value.type !== "string") return undefined;
  switch (value.type) {
    case "collect-context": {
      if (!hasOnlyKeys(value, ["type", "fields", "sessionPersistence"])
        || !Array.isArray(value.fields)
        || (value.sessionPersistence !== "ephemeral"
          && value.sessionPersistence !== "customer_session")) {
        return undefined;
      }
      const fields = value.fields.map(parseContextField);
      return fields.every((field) => field !== undefined)
        ? {
            type: "collect-context",
            fields: fields as PstExecutableContextFieldV1[],
            sessionPersistence: value.sessionPersistence,
          }
        : undefined;
    }
    case "collect-answers":
      return hasOnlyKeys(value, ["type", "schemaRef", "answerFields"])
        && typeof value.schemaRef === "string"
        && Boolean(value.schemaRef)
        && stateReferenceArray(value.answerFields)
        ? {
            type: "collect-answers",
            schemaRef: value.schemaRef,
            answerFields: [...value.answerFields],
          }
        : undefined;
    case "persist":
      return hasOnlyKeys(value, ["type", "target", "retention"])
        && isStateReference(value.target)
        && (value.retention === "ephemeral" || value.retention === "customer_session")
        ? { type: "persist", target: value.target, retention: value.retention }
        : undefined;
    case "evaluate-rules":
      return hasOnlyKeys(value, ["type", "ruleIds"]) && stringArray(value.ruleIds)
        ? { type: "evaluate-rules", ruleIds: [...value.ruleIds] }
        : undefined;
    case "score":
      return hasOnlyKeys(value, ["type", "scaleRef", "output"])
        && typeof value.scaleRef === "string"
        && Boolean(value.scaleRef)
        && isStateReference(value.output)
        ? { type: "score", scaleRef: value.scaleRef, output: value.output }
        : undefined;
    case "analyze":
      return hasOnlyKeys(value, ["type", "templateRef", "output", "providerId"])
        && typeof value.templateRef === "string"
        && Boolean(value.templateRef)
        && isStateReference(value.output)
        && (value.providerId === undefined
          || (typeof value.providerId === "string" && Boolean(value.providerId)))
        ? {
            type: "analyze",
            templateRef: value.templateRef,
            output: value.output,
            ...(value.providerId === undefined ? {} : { providerId: value.providerId }),
          }
        : undefined;
    case "recommend":
      return hasOnlyKeys(value, ["type", "strategyRef", "output", "providerId"])
        && typeof value.strategyRef === "string"
        && Boolean(value.strategyRef)
        && isStateReference(value.output)
        && (value.providerId === undefined
          || (typeof value.providerId === "string" && Boolean(value.providerId)))
        ? {
            type: "recommend",
            strategyRef: value.strategyRef,
            output: value.output,
            ...(value.providerId === undefined ? {} : { providerId: value.providerId }),
          }
        : undefined;
    case "action":
      return hasOnlyKeys(value, ["type", "actionRef", "output"])
        && typeof value.actionRef === "string"
        && Boolean(value.actionRef)
        && isStateReference(value.output)
        ? { type: "action", actionRef: value.actionRef, output: value.output }
        : undefined;
    case "outcome":
      return hasOnlyKeys(value, ["type", "outcomeId", "outputRefs"])
        && typeof value.outcomeId === "string"
        && Boolean(value.outcomeId)
        && stateReferenceArray(value.outputRefs)
        ? {
            type: "outcome",
            outcomeId: value.outcomeId,
            outputRefs: [...value.outputRefs],
          }
        : undefined;
    default:
      return undefined;
  }
}

function parseConditionalNext(value: unknown): PstExecutableNextV1 | undefined {
  if (!isRecord(value)
    || !hasOnlyKeys(value, ["type", "branches", "defaultStepId"])
    || value.type !== "conditional"
    || !Array.isArray(value.branches)
    || typeof value.defaultStepId !== "string"
    || !value.defaultStepId) {
    return undefined;
  }
  const branches: Array<{ whenRuleId: string; stepId: string }> = [];
  for (const branch of value.branches) {
    if (!isRecord(branch)
      || !hasOnlyKeys(branch, ["whenRuleId", "stepId"])
      || typeof branch.whenRuleId !== "string"
      || !branch.whenRuleId
      || typeof branch.stepId !== "string"
      || !branch.stepId) {
      return undefined;
    }
    branches.push({ whenRuleId: branch.whenRuleId, stepId: branch.stepId });
  }
  return {
    type: "conditional",
    branches,
    defaultStepId: value.defaultStepId,
  };
}

const operationTypeByKind: Record<PstExecutableStepKind, PstExecutableOperationV1["type"]> = {
  input: "collect-context",
  answer: "collect-answers",
  persist: "persist",
  rules: "evaluate-rules",
  scoring: "score",
  analysis: "analyze",
  recommendation: "recommend",
  action: "action",
  outcome: "outcome",
};

const executableKindByIrKind: Record<PstManufacturingIrNodeV1["kind"], PstExecutableStepKind> = {
  INPUT: "input",
  ANSWER: "answer",
  PERSIST: "persist",
  RULES: "rules",
  SCORING: "scoring",
  ANALYSIS: "analysis",
  RECOMMENDATION: "recommendation",
  ACTION: "action",
  OUTCOME: "outcome",
};

function preparationConfiguration(
  source: PstCanonicalSourceV1,
  nodeId: string,
  path: string,
) {
  const errors: PstCompilerPreparationDiagnosticV1[] = [];
  const step = source.workflow.find(({ id }) => id === nodeId);
  if (!step || !isRecord(step.configuration)) return { errors };
  const unknownConfigurationKeys = Object.keys(step.configuration)
    .filter((key) => key !== "canonical" && key !== "compilerReady");
  if (unknownConfigurationKeys.length) {
    errors.push({
      code: "INVALID_OPERATION",
      path: `${path}.configuration`,
      message: `Unsupported workflow configuration keys: ${unknownConfigurationKeys.join(", ")}.`,
    });
  }
  if (isRecord(step.configuration.canonical)) {
    const unknownCanonicalKeys = Object.keys(step.configuration.canonical)
      .filter((key) => !["kind", "bindings", "next"].includes(key));
    if (unknownCanonicalKeys.length) {
      errors.push({
        code: "INVALID_OPERATION",
        path: `${path}.configuration.canonical`,
        message: `Unsupported canonical configuration keys: ${unknownCanonicalKeys.join(", ")}.`,
      });
    }
  }
  const compilerReady = step.configuration.compilerReady;
  if (!isRecord(compilerReady)) return { errors };
  const unknownExecutableKeys = Object.keys(compilerReady)
    .filter((key) => key !== "operation" && key !== "next");
  if (unknownExecutableKeys.length) {
    errors.push({
      code: "INVALID_OPERATION",
      path: `${path}.configuration.compilerReady`,
      message: `Unsupported executable configuration keys: ${unknownExecutableKeys.join(", ")}.`,
    });
  }
  return { configuration: compilerReady, errors };
}

function sameValues(left: string[], right: string[]) {
  return left.length === right.length && left.every((value) => right.includes(value));
}

function operationDiagnostics(
  operation: PstExecutableOperationV1,
  node: PstManufacturingIrNodeV1,
  ir: PstManufacturingIrV1,
  components: PstExecutableComponentV1[],
  path: string,
) {
  const diagnostics: PstCompilerPreparationDiagnosticV1[] = [];
  const ruleIds = new Set(ir.declarations.rules.map(({ id }) => id));
  const providers = new Map(ir.declarations.providers.map((provider) => [provider.id, provider]));
  const componentRefs = new Map<string, PstExecutableComponentV1>();
  components.forEach((component) => {
    componentRefs.set(component.id, component);
    componentRefs.set(component.assetId, component);
  });
  const writes = new Set(node.writes);
  const readsOrWrites = new Set([...node.reads, ...node.writes]);
  const unresolved = (reference: string, referencePath: string, values: Set<string>) => {
    if (!values.has(reference)) {
      diagnostics.push({
        code: "UNRESOLVED_REFERENCE",
        path: referencePath,
        message: `Reference ${reference} is not present in resolved declarations.`,
      });
    }
  };
  const componentReference = (
    reference: string,
    capability: PstExecutableComponentV1["capability"],
    referencePath: string,
  ) => {
    const component = componentRefs.get(reference);
    if (!component || component.capability !== capability) {
      diagnostics.push({
        code: "UNRESOLVED_REFERENCE",
        path: referencePath,
        message: `Reference ${reference} must resolve capability ${capability}.`,
      });
    }
  };

  if (operation.type === "collect-context") {
    operation.fields.forEach((field, index) => {
      if (!writes.has(field.key)) {
        diagnostics.push({
          code: "INVALID_OPERATION",
          path: `${path}.fields[${index}].key`,
          message: "Collected context field must be declared in step writes.",
        });
      }
    });
  } else if (operation.type === "collect-answers") {
    componentReference(operation.schemaRef, "question-schema", `${path}.schemaRef`);
    operation.answerFields.forEach((field, index) => {
      if (!writes.has(field)) {
        diagnostics.push({
          code: "INVALID_OPERATION",
          path: `${path}.answerFields[${index}]`,
          message: "Collected answer field must be declared in step writes.",
        });
      }
    });
  } else if (operation.type === "persist") {
    if (!readsOrWrites.has(operation.target)) {
      diagnostics.push({
        code: "INVALID_OPERATION",
        path: `${path}.target`,
        message: "Persist target must be declared in step reads or writes.",
      });
    }
  } else if (operation.type === "evaluate-rules") {
    operation.ruleIds.forEach((ruleId, index) =>
      unresolved(ruleId, `${path}.ruleIds[${index}]`, ruleIds));
  } else if (operation.type === "score") {
    componentReference(operation.scaleRef, "scoring-scale", `${path}.scaleRef`);
    if (!writes.has(operation.output)) {
      diagnostics.push({
        code: "INVALID_OPERATION",
        path: `${path}.output`,
        message: "Score output must be declared in step writes.",
      });
    }
  } else if (operation.type === "analyze" || operation.type === "recommend") {
    const reference = operation.type === "analyze"
      ? operation.templateRef
      : operation.strategyRef;
    componentReference(
      reference,
      operation.type === "analyze" ? "analysis-template" : "recommendation-strategy",
      `${path}.${operation.type === "analyze" ? "templateRef" : "strategyRef"}`,
    );
    if (!writes.has(operation.output)) {
      diagnostics.push({
        code: "INVALID_OPERATION",
        path: `${path}.output`,
        message: "Operation output must be declared in step writes.",
      });
    }
    if (operation.providerId) {
      const provider = providers.get(operation.providerId);
      const capability = operation.type === "analyze" ? "analysis" : "recommendation";
      if (!provider || provider.capability !== capability || provider.mode !== "assistive") {
        diagnostics.push({
          code: "UNRESOLVED_REFERENCE",
          path: `${path}.providerId`,
          message: `Provider must resolve capability ${capability} in assistive mode.`,
        });
      }
    }
  } else if (operation.type === "action") {
    componentReference(operation.actionRef, "action-template", `${path}.actionRef`);
    if (!writes.has(operation.output)) {
      diagnostics.push({
        code: "INVALID_OPERATION",
        path: `${path}.output`,
        message: "Action output must be declared in step writes.",
      });
    }
  } else {
    if (operation.outcomeId !== node.id) {
      diagnostics.push({
        code: "INVALID_OPERATION",
        path: `${path}.outcomeId`,
        message: "Outcome operation identity must equal the owning step ID.",
      });
    }
    operation.outputRefs.forEach((reference, index) => {
      if (!readsOrWrites.has(reference)) {
        diagnostics.push({
          code: "INVALID_OPERATION",
          path: `${path}.outputRefs[${index}]`,
          message: "Outcome output must be declared in step reads or writes.",
        });
      }
    });
  }
  return diagnostics;
}

function transitionForNode(
  node: PstManufacturingIrNodeV1,
  operation: PstExecutableOperationV1,
  configuration: Record<string, unknown>,
  ir: PstManufacturingIrV1,
  path: string,
): { next?: PstExecutableNextV1; errors: PstCompilerPreparationDiagnosticV1[] } {
  if (node.next.type === "step") {
    return { next: { type: "step", stepId: node.next.target }, errors: [] };
  }
  if (node.next.type === "complete") {
    if (node.kind !== "OUTCOME"
      || operation.type !== "outcome"
      || operation.outcomeId !== node.id) {
      return {
        errors: [{
          code: "INVALID_TRANSITION",
          path: `${path}.next`,
          message: "Only an OUTCOME step with a matching outcome operation may complete.",
        }],
      };
    }
    return { next: { type: "complete", outcomeId: operation.outcomeId }, errors: [] };
  }
  const next = parseConditionalNext(configuration.next);
  if (!next) {
    return {
      errors: [{
        code: "INVALID_TRANSITION",
        path: `${path}.next`,
        message: "Conditional IR transition requires typed rule-ID branches and a default step.",
      }],
    };
  }
  const declaredTargets = node.next.branches.map(({ target }) => target);
  const nextTargets = next.type === "conditional"
    ? next.branches.map(({ stepId }) => stepId)
    : [];
  const ruleIds = new Set(ir.declarations.rules.map(({ id }) => id));
  const errors: PstCompilerPreparationDiagnosticV1[] = [];
  if (next.type !== "conditional"
    || next.defaultStepId !== node.next.defaultTarget
    || !sameValues(declaredTargets, nextTargets)) {
    errors.push({
      code: "INVALID_TRANSITION",
      path: `${path}.next`,
      message: "Typed conditional targets must match the validated IR transition targets.",
    });
  }
  if (next.type === "conditional") {
    next.branches.forEach(({ whenRuleId }, index) => {
      if (!ruleIds.has(whenRuleId)) {
        errors.push({
          code: "UNRESOLVED_REFERENCE",
          path: `${path}.next.branches[${index}].whenRuleId`,
          message: `Conditional rule ${whenRuleId} is not declared.`,
        });
      }
    });
  }
  return { next, errors };
}

function orderedDiagnostics(diagnostics: PstCompilerPreparationDiagnosticV1[]) {
  return diagnostics.sort((left, right) =>
    left.path.localeCompare(right.path)
    || left.code.localeCompare(right.code)
    || left.message.localeCompare(right.message));
}

function executableComponent(
  component: PstManufacturingIrV1["declarations"]["components"][number],
  path: string,
): { component?: PstExecutableComponentV1; errors: PstCompilerPreparationDiagnosticV1[] } {
  const errors: PstCompilerPreparationDiagnosticV1[] = [];
  const configuration = component.configuration;
  if (!isRecord(configuration)
    || Object.keys(configuration).some((key) => key !== "compilerReady")
    || !isRecord(configuration.compilerReady)) {
    return {
      errors: [{
        code: "INVALID_OPERATION",
        path: `${path}.configuration`,
        message: "Component configuration must contain only a typed executable declaration.",
      }],
    };
  }
  const executable = configuration.compilerReady;
  if (Object.keys(executable).some((key) => key !== "capability" && key !== "definition")
    || typeof executable.capability !== "string"
    || !isRecord(executable.definition)) {
    return {
      errors: [{
        code: "INVALID_OPERATION",
        path: `${path}.configuration.compilerReady`,
        message: "Executable component requires only capability and typed definition.",
      }],
    };
  }
  const identity = {
    id: component.id,
    assetId: component.assetId,
    name: component.name,
    version: component.version,
  };
  const definition = executable.definition;
  let projected: PstExecutableComponentV1 | undefined;
  if (executable.capability === "question-schema"
    && Object.keys(definition).every((key) => key === "questions")
    && Array.isArray(definition.questions)
    && definition.questions.every((question) =>
      isRecord(question)
      && hasOnlyKeys(question, ["id", "label", "type", "required", "options"])
      && typeof question.id === "string"
      && Boolean(question.id)
      && typeof question.label === "string"
      && Boolean(question.label)
      && ["string", "number", "boolean", "choice", "date", "json"].includes(String(question.type))
      && typeof question.required === "boolean"
      && (question.options === undefined
        || parsedOptions(question.options) !== undefined))) {
    projected = {
      ...identity,
      capability: "question-schema",
      definition: {
        questions: definition.questions.map((question) => {
          const value = question as Record<string, unknown>;
          const options = value.options === undefined ? undefined : parsedOptions(value.options);
          return {
            id: value.id as string,
            label: value.label as string,
            type: value.type as PstExecutableQuestionV1["type"],
            required: value.required as boolean,
            ...(options === undefined ? {} : { options }),
          };
        }),
      },
    };
  } else if (executable.capability === "scoring-scale"
    && Object.keys(definition).every((key) => ["minimum", "maximum", "bands"].includes(key))
    && typeof definition.minimum === "number"
    && typeof definition.maximum === "number"
    && definition.minimum < definition.maximum
    && Array.isArray(definition.bands)
    && definition.bands.every((band) =>
      isRecord(band)
      && hasOnlyKeys(band, ["minimum", "label"])
      && typeof band.minimum === "number"
      && typeof band.label === "string")) {
    projected = {
      ...identity,
      capability: "scoring-scale",
      definition: {
        minimum: definition.minimum,
        maximum: definition.maximum,
        bands: definition.bands.map((band) => ({
          minimum: (band as Record<string, unknown>).minimum as number,
          label: (band as Record<string, unknown>).label as string,
        })),
      },
    };
  } else if ((executable.capability === "analysis-template"
      || executable.capability === "recommendation-strategy")
    && Object.keys(definition).every((key) => key === "template" || key === "outputFields")
    && typeof definition.template === "string"
    && Boolean(definition.template)
    && stateReferenceArray(definition.outputFields)) {
    projected = {
      ...identity,
      capability: executable.capability,
      definition: {
        template: definition.template,
        outputFields: [...definition.outputFields],
      },
    };
  } else if (executable.capability === "action-template"
    && Object.keys(definition).every((key) => key === "items")
    && Array.isArray(definition.items)
    && definition.items.every((item) =>
      isRecord(item)
      && hasOnlyKeys(item, ["id", "title", "description"])
      && typeof item.id === "string"
      && Boolean(item.id)
      && typeof item.title === "string"
      && typeof item.description === "string")) {
    projected = {
      ...identity,
      capability: "action-template",
      definition: {
        items: definition.items.map((item) => ({
          id: (item as Record<string, unknown>).id as string,
          title: (item as Record<string, unknown>).title as string,
          description: (item as Record<string, unknown>).description as string,
        })),
      },
    };
  } else if (executable.capability === "outcome-mapping"
    && Object.keys(definition).every((key) => key === "outputFields")
    && stateReferenceArray(definition.outputFields)) {
    projected = {
      ...identity,
      capability: "outcome-mapping",
      definition: { outputFields: [...definition.outputFields] },
    };
  }
  if (!projected) {
    errors.push({
      code: "INVALID_OPERATION",
      path: `${path}.configuration.compilerReady.definition`,
      message: "Component capability and definition do not match an executable allowlist schema.",
    });
  }
  return { component: projected, errors };
}

function executableLiteral(value: unknown): value is PstExecutableLiteralV1 {
  if (value === null
    || typeof value === "string"
    || typeof value === "number"
    || typeof value === "boolean") {
    return true;
  }
  return Array.isArray(value)
    && value.every((item) =>
      typeof item === "string"
      || typeof item === "number"
      || typeof item === "boolean");
}

function executableRule(
  rule: PstManufacturingIrV1["declarations"]["rules"][number],
  path: string,
): { rule?: PstExecutableRuleV1; errors: PstCompilerPreparationDiagnosticV1[] } {
  const errors: PstCompilerPreparationDiagnosticV1[] = [];
  if (!rule.id.trim()
    || !rule.version.trim()
    || !rule.name.trim()
    || (rule.kind !== "RULE" && rule.kind !== "SCORING")
    || !isRecord(rule.when)
    || !hasOnlyKeys(rule.when, ["all", "any"])) {
    return {
      errors: [{
        code: "INVALID_OPERATION",
        path,
        message: "Rule identity, kind, and predicate groups must match the runtime allowlist.",
      }],
    };
  }
  const parsePredicates = (value: unknown, predicatePath: string) => {
    if (value === undefined) return undefined;
    if (!Array.isArray(value)) {
      errors.push({
        code: "INVALID_OPERATION",
        path: predicatePath,
        message: "Rule predicate group must be an array.",
      });
      return undefined;
    }
    const predicates: PstExecutablePredicateV1[] = [];
    value.forEach((predicate, index) => {
      if (!isRecord(predicate)
        || !hasOnlyKeys(predicate, ["field", "operator", "value"])
        || !isStateReference(predicate.field)
        || ![
          "equals",
          "not_equals",
          "contains",
          "in",
          "greater_than",
          "greater_than_or_equal",
          "less_than",
          "less_than_or_equal",
          "exists",
        ].includes(String(predicate.operator))
        || (predicate.value !== undefined && !executableLiteral(predicate.value))) {
        errors.push({
          code: "INVALID_OPERATION",
          path: `${predicatePath}[${index}]`,
          message: "Rule predicate does not match the runtime allowlist.",
        });
        return;
      }
      predicates.push({
        field: predicate.field,
        operator: predicate.operator as PstExecutablePredicateV1["operator"],
        ...(predicate.value === undefined ? {} : { value: predicate.value }),
      });
    });
    return predicates;
  };
  const all = parsePredicates(rule.when.all, `${path}.when.all`);
  const any = parsePredicates(rule.when.any, `${path}.when.any`);
  const effects: PstExecutableRuleEffectV1[] = [];
  rule.then.forEach((effect, index) => {
    const effectPath = `${path}.then[${index}]`;
    if (!isRecord(effect) || typeof effect.type !== "string") {
      errors.push({
        code: "INVALID_OPERATION",
        path: effectPath,
        message: "Rule effect must have a typed runtime operation.",
      });
      return;
    }
    if (effect.type === "set"
      && hasOnlyKeys(effect, ["type", "field", "value"])
      && isStateReference(effect.field)
      && executableLiteral(effect.value)) {
      effects.push({ type: "set", field: effect.field, value: effect.value });
    } else if (effect.type === "add-score"
      && hasOnlyKeys(effect, ["type", "scaleRef", "value"])
      && typeof effect.scaleRef === "string"
      && Boolean(effect.scaleRef)
      && typeof effect.value === "number") {
      effects.push({ type: "add-score", scaleRef: effect.scaleRef, value: effect.value });
    } else if (effect.type === "emit"
      && hasOnlyKeys(effect, ["type", "event"])
      && typeof effect.event === "string"
      && Boolean(effect.event)) {
      effects.push({ type: "emit", event: effect.event });
    } else if (effect.type === "goto"
      && hasOnlyKeys(effect, ["type", "stepId"])
      && typeof effect.stepId === "string"
      && Boolean(effect.stepId)) {
      effects.push({ type: "goto", stepId: effect.stepId });
    } else {
      errors.push({
        code: "INVALID_OPERATION",
        path: effectPath,
        message: "Rule effect does not match the runtime allowlist.",
      });
    }
  });
  if (errors.length) return { errors };
  return {
    rule: {
      id: rule.id,
      version: rule.version,
      name: rule.name,
      kind: rule.kind,
      when: {
        ...(all === undefined ? {} : { all }),
        ...(any === undefined ? {} : { any }),
      },
      then: effects,
    },
    errors: [],
  };
}

function executableDeclarations(
  ir: PstManufacturingIrV1,
): {
  declarations: PstExecutableDeclarationsV1;
  errors: PstCompilerPreparationDiagnosticV1[];
} {
  const errors: PstCompilerPreparationDiagnosticV1[] = [];
  const components = ir.declarations.components.flatMap((component, index) => {
    const result = executableComponent(component, `declarations.components[${index}]`);
    errors.push(...result.errors);
    return result.component ? [result.component] : [];
  });
  const providers: PstExecutableProviderV1[] = ir.declarations.providers.flatMap(
    (provider, index) => {
      if (Object.keys(provider.configuration).length || provider.mode !== "assistive") {
        errors.push({
          code: "INVALID_OPERATION",
          path: `declarations.providers[${index}]`,
          message: "Executable providers must be assistive and may not expose raw configuration.",
        });
        return [];
      }
      return [{
        id: provider.id,
        capability: provider.capability,
        mode: "assistive" as const,
      }];
    },
  );
  const rules = ir.declarations.rules.flatMap((rule, index) => {
    const result = executableRule(rule, `declarations.rules[${index}]`);
    errors.push(...result.errors);
    return result.rule ? [result.rule] : [];
  });
  const componentRefs = new Map<string, PstExecutableComponentV1>();
  components.forEach((component) => {
    componentRefs.set(component.id, component);
    componentRefs.set(component.assetId, component);
  });
  const stepIds = new Set(ir.graph.nodes.map(({ id }) => id));
  rules.forEach((rule, ruleIndex) => {
    rule.then.forEach((effect, effectIndex) => {
      const path = `declarations.rules[${ruleIndex}].then[${effectIndex}]`;
      if (effect.type === "add-score"
        && componentRefs.get(effect.scaleRef)?.capability !== "scoring-scale") {
        errors.push({
          code: "UNRESOLVED_REFERENCE",
          path: `${path}.scaleRef`,
          message: `Reference ${effect.scaleRef} must resolve capability scoring-scale.`,
        });
      }
      if (effect.type === "goto" && !stepIds.has(effect.stepId)) {
        errors.push({
          code: "UNRESOLVED_REFERENCE",
          path: `${path}.stepId`,
          message: `Rule target ${effect.stepId} is not present in the validated graph.`,
        });
      }
    });
  });
  return {
    declarations: {
      pattern: ir.declarations.pattern,
      recipe: ir.declarations.recipe,
      components,
      rules,
      providers,
    },
    errors,
  };
}

export function prepareCompilerReadyIr(
  input: CompilerPreparationInput,
): PstCompilerPreparationResultV1 {
  const { source, ir, validation } = input;
  const diagnostics: PstCompilerPreparationDiagnosticV1[] = [];
  const irHash = pstCanonicalJsonHash(ir);
  if (validation.subject.hash !== irHash
    || validation.subject.version !== ir.irVersion) {
    diagnostics.push({
      code: "INVALID_VALIDATION_PROOF",
      path: "validation.subject",
      message: "Validation proof does not belong to the supplied Manufacturing IR.",
    });
  }
  if (!validation.subject.source
    || validation.subject.source.version !== source.contractVersion
    || validation.subject.source.hash !== pstCanonicalJsonHash(source)) {
    diagnostics.push({
      code: "INVALID_VALIDATION_PROOF",
      path: "validation.subject.source",
      message: "Canonical Source proof is missing or does not belong to the supplied source.",
    });
  }
  if (source.release.releaseId !== ir.source.releaseId
    || source.release.projectId !== ir.source.projectId
    || source.release.version !== ir.source.releaseVersion
    || source.release.snapshotHash !== ir.source.snapshotHash) {
    diagnostics.push({
      code: "SOURCE_MISMATCH",
      path: "source.release",
      message: "Canonical Source identity does not match the validated Manufacturing IR.",
    });
  }

  const steps: PstExecutableStepV1[] = [];
  const contextFields: PstExecutableContextFieldV1[] = [];
  const persistenceModes = new Set<"ephemeral" | "customer_session">();
  const declarationResult = executableDeclarations(ir);
  diagnostics.push(...declarationResult.errors);

  ir.graph.nodes.forEach((node, index) => {
    const path = `graph.nodes[${index}]`;
    const preparation = preparationConfiguration(source, node.id, path);
    diagnostics.push(...preparation.errors);
    const configuration = preparation.configuration;
    if (!configuration) {
      diagnostics.push({
        code: "MISSING_OPERATION",
        path: `${path}.operation`,
        message: "Step has no immutable executable preparation configuration.",
      });
      return;
    }
    const operation = parseOperation(configuration.operation);
    if (!operation) {
      diagnostics.push({
        code: "INVALID_OPERATION",
        path: `${path}.operation`,
        message: "Step operation is not a supported typed operation.",
      });
      return;
    }
    const kind = executableKindByIrKind[node.kind];
    if (operationTypeByKind[kind] !== operation.type) {
      diagnostics.push({
        code: "INVALID_OPERATION",
        path: `${path}.operation.type`,
        message: `Operation ${operation.type} is incompatible with step kind ${node.kind}.`,
      });
    }
    diagnostics.push(...operationDiagnostics(
      operation,
      node,
      ir,
      declarationResult.declarations.components,
      `${path}.operation`,
    ));
    const transition = transitionForNode(node, operation, configuration, ir, path);
    diagnostics.push(...transition.errors);
    if (!transition.next) return;
    if (operation.type === "collect-context") {
      contextFields.push(...operation.fields);
      persistenceModes.add(operation.sessionPersistence);
    }
    steps.push({
      id: node.id,
      kind,
      title: node.title,
      description: node.description,
      reads: [...node.reads],
      writes: [...node.writes],
      dependsOn: [...node.dependsOn],
      operation,
      next: transition.next,
    });
  });

  const contextKeys = contextFields.map(({ key }) => key);
  if (contextKeys.length !== new Set(contextKeys).size) {
    diagnostics.push({
      code: "INVALID_STATE_CONTRACT",
      path: "state.contextFields",
      message: "Context field keys must be unique across collect-context operations.",
    });
  }
  if (persistenceModes.size !== 1) {
    diagnostics.push({
      code: "INVALID_STATE_CONTRACT",
      path: "state.sessionPersistence",
      message: "All journeys must declare exactly one consistent session persistence policy.",
    });
  }

  if (diagnostics.length) {
    return { status: "BLOCKED", errors: orderedDiagnostics(diagnostics), warnings: [] };
  }

  const readyPayload = {
    readyVersion: pstCompilerReadyIrVersion,
      sourceIr: {
        version: ir.irVersion,
        hash: irHash,
      },
      identity: {
        releaseId: source.release.releaseId,
        projectId: source.release.projectId,
        slug: source.release.slug,
        releaseVersion: source.release.version,
        publishedAt: source.release.publishedAt,
        snapshotHash: source.release.snapshotHash,
        sourceSchemaVersion: source.release.sourceSchemaVersion,
        irVersion: ir.irVersion,
      },
      product: {
        name: source.project.name,
        description: source.project.description,
        problem: ir.product.problem,
        targetUser: ir.product.targetUser,
        desiredOutcome: ir.product.desiredOutcome,
        journey: [...ir.product.journey],
        expectedOutput: [...ir.product.expectedOutput],
      },
      state: {
        contextFields,
        sessionPersistence: [...persistenceModes][0]!,
      },
      declarations: declarationResult.declarations,
      steps,
      entryStepId: ir.graph.entry,
      outcomeStepIds: steps
        .filter(({ kind, next }) => kind === "outcome" && next.type === "complete")
        .map(({ id }) => id),
  };
  return {
    status: "READY",
    readyIr: {
      ...readyPayload,
      integrity: {
        algorithm: "sha256-canonical-json.v1",
        hash: pstCanonicalJsonHash(readyPayload),
      },
    },
    warnings: [],
  };
}