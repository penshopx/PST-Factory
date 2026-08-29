import {
  pstExecutableRuntimeVersion,
  type ExecutablePstDefinitionV1,
  type PstExecutableComponentV1,
  type PstExecutableLiteralV1,
  type PstExecutableNextV1,
  type PstExecutableOperationV1,
  type PstExecutablePredicateV1,
  type PstExecutableRuleV1,
  type PstExecutableRuleEffectV1,
  type PstExecutableStateContractV1,
  type PstExecutableStepV1,
} from "./pst-executable";
import type { PstStateReference } from "./pst-contract";

export type { PstExecutableStepV1 } from "./pst-executable";

export type PstRuntimeDiagnosticV1 = {
  code: string;
  path: string;
  message: string;
};

export type PstRuntimeStateV1 = {
  context: Record<string, unknown>;
  answers: Record<string, unknown>;
  derived: Record<string, unknown>;
};

export type PstRuntimeSessionV1 = {
  definition: ExecutablePstDefinitionV1;
  state: PstRuntimeStateV1;
  currentStepId: string;
  events: string[];
  scores: Record<string, number>;
  evaluatedRules: Record<string, boolean>;
  visitedStepIds: string[];
  outcomeId?: string;
};

export type PstRuntimeInputV1 = Partial<Record<PstStateReference, unknown>>;

export type PstRuntimeStepViewV1 = {
  id: string;
  kind: PstExecutableStepV1["kind"];
  title: string;
  description: string;
  operation: PstExecutableOperationV1;
  requiredInputs: Array<{
    key: PstStateReference;
    label: string;
    type: string;
    required: boolean;
    options?: Array<{ value: string; label: string }>;
  }>;
};

export type PstRuntimeAdvanceResultV1 =
  | {
      status: "WAITING_INPUT";
      session: PstRuntimeSessionV1;
      step: PstRuntimeStepViewV1;
    }
  | {
      status: "RUNNING";
      session: PstRuntimeSessionV1;
      step: PstRuntimeStepViewV1;
    }
  | {
      status: "COMPLETED";
      session: PstRuntimeSessionV1;
      outcomeId: string;
      output: Record<string, unknown>;
    }
  | {
      status: "BLOCKED";
      session?: PstRuntimeSessionV1;
      errors: PstRuntimeDiagnosticV1[];
    };

export type PstRuntimeStartResultV1 =
  | {
      status: "READY";
      session: PstRuntimeSessionV1;
    }
  | {
      status: "BLOCKED";
      errors: PstRuntimeDiagnosticV1[];
    };

const stateReferencePattern = /^(context|answers|derived)\.[A-Za-z0-9][A-Za-z0-9._-]*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(value: object, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function diagnostic(code: string, path: string, message: string): PstRuntimeDiagnosticV1 {
  return { code, path, message };
}

function orderedDiagnostics(errors: PstRuntimeDiagnosticV1[]) {
  return [...errors].sort((left, right) =>
    left.path.localeCompare(right.path)
    || left.code.localeCompare(right.code)
    || left.message.localeCompare(right.message));
}

function isStateReference(value: unknown): value is PstStateReference {
  return typeof value === "string" && stateReferencePattern.test(value);
}

function stateNamespace(reference: PstStateReference): keyof PstRuntimeStateV1 {
  return reference.slice(0, reference.indexOf(".")) as keyof PstRuntimeStateV1;
}

function stateKey(reference: PstStateReference) {
  return reference.slice(reference.indexOf(".") + 1);
}

function getState(state: PstRuntimeStateV1, reference: PstStateReference) {
  return state[stateNamespace(reference)][stateKey(reference)];
}

function setState(state: PstRuntimeStateV1, reference: PstStateReference, value: unknown) {
  state[stateNamespace(reference)][stateKey(reference)] = clone(value);
}

function componentMap(definition: ExecutablePstDefinitionV1) {
  return new Map(definition.declarations.components.map((component) => [component.id, component]));
}

function ruleMap(definition: ExecutablePstDefinitionV1) {
  return new Map(definition.declarations.rules.map((rule) => [rule.id, rule]));
}

function stepMap(definition: ExecutablePstDefinitionV1) {
  return new Map(definition.steps.map((step) => [step.id, step]));
}

function componentWithCapability<C extends PstExecutableComponentV1["capability"]>(
  components: Map<string, PstExecutableComponentV1>,
  id: string,
  capability: C,
): Extract<PstExecutableComponentV1, { capability: C }> | undefined {
  const component = components.get(id);
  return component?.capability === capability
    ? component as Extract<PstExecutableComponentV1, { capability: C }>
    : undefined;
}

function allStateReferences(step: PstExecutableStepV1) {
  const references: Array<[string, PstStateReference]> = [];
  step.reads.forEach((reference, index) => references.push([`reads[${index}]`, reference]));
  step.writes.forEach((reference, index) => references.push([`writes[${index}]`, reference]));
  const operation = step.operation;
  if (operation.type === "collect-context") {
    operation.fields.forEach((field, index) => references.push([
      `operation.fields[${index}].key`,
      field.key,
    ]));
  }
  if (operation.type === "collect-answers") {
    operation.answerFields.forEach((reference, index) => references.push([
      `operation.answerFields[${index}]`,
      reference,
    ]));
  }
  if (operation.type === "score" || operation.type === "analyze"
    || operation.type === "recommend" || operation.type === "action") {
    references.push(["operation.output", operation.output]);
  }
  if (operation.type === "outcome") {
    operation.outputRefs.forEach((reference, index) => references.push([
      `operation.outputRefs[${index}]`,
      reference,
    ]));
  }
  return references;
}

function validatePredicate(
  predicate: PstExecutablePredicateV1,
  path: string,
  writable: Set<PstStateReference>,
  errors: PstRuntimeDiagnosticV1[],
) {
  if (!isStateReference(predicate.field)) {
    errors.push(diagnostic("INVALID_STATE_REFERENCE", `${path}.field`, "Predicate field must be namespaced state."));
  } else if (!writable.has(predicate.field)) {
    errors.push(diagnostic("UNDECLARED_READ", `${path}.field`, `Predicate field ${predicate.field} is not declared.`));
  }
  if (predicate.operator === "exists") return;
  if (!hasOwn(predicate, "value")) {
    errors.push(diagnostic("INVALID_PREDICATE", `${path}.value`, "Predicate value is required for this operator."));
  }
}

function validateRule(
  rule: PstExecutableRuleV1,
  index: number,
  definition: ExecutablePstDefinitionV1,
  writable: Set<PstStateReference>,
  errors: PstRuntimeDiagnosticV1[],
) {
  const path = `declarations.rules[${index}]`;
  (rule.when.all ?? []).forEach((predicate, predicateIndex) =>
    validatePredicate(predicate, `${path}.when.all[${predicateIndex}]`, writable, errors));
  (rule.when.any ?? []).forEach((predicate, predicateIndex) =>
    validatePredicate(predicate, `${path}.when.any[${predicateIndex}]`, writable, errors));
  const steps = stepMap(definition);
  rule.then.forEach((effect, effectIndex) => {
    const effectPath = `${path}.then[${effectIndex}]`;
    if (effect.type === "set") {
      if (!writable.has(effect.field)) {
        errors.push(diagnostic("UNDECLARED_WRITE", `${effectPath}.field`, `Rule target ${effect.field} is not declared.`));
      }
    } else if (effect.type === "add-score") {
      const component = componentWithCapability(
        componentMap(definition),
        effect.scaleRef,
        "scoring-scale",
      );
      if (!component) {
        errors.push(diagnostic("UNRESOLVED_REFERENCE", `${effectPath}.scaleRef`, `Scoring scale ${effect.scaleRef} is not declared.`));
      }
    } else if (effect.type === "goto" && !steps.has(effect.stepId)) {
      errors.push(diagnostic("UNRESOLVED_REFERENCE", `${effectPath}.stepId`, `Step ${effect.stepId} is not declared.`));
    }
  });
}

function validateNext(
  next: PstExecutableNextV1,
  path: string,
  definition: ExecutablePstDefinitionV1,
  errors: PstRuntimeDiagnosticV1[],
) {
  const steps = stepMap(definition);
  const rules = ruleMap(definition);
  if (next.type === "step" && !steps.has(next.stepId)) {
    errors.push(diagnostic("UNRESOLVED_REFERENCE", `${path}.stepId`, `Step ${next.stepId} is not declared.`));
  }
  if (next.type === "conditional") {
    next.branches.forEach((branch, index) => {
      if (!rules.has(branch.whenRuleId)) {
        errors.push(diagnostic("UNRESOLVED_REFERENCE", `${path}.branches[${index}].whenRuleId`, `Rule ${branch.whenRuleId} is not declared.`));
      }
      if (!steps.has(branch.stepId)) {
        errors.push(diagnostic("UNRESOLVED_REFERENCE", `${path}.branches[${index}].stepId`, `Step ${branch.stepId} is not declared.`));
      }
    });
    if (!steps.has(next.defaultStepId)) {
      errors.push(diagnostic("UNRESOLVED_REFERENCE", `${path}.defaultStepId`, `Step ${next.defaultStepId} is not declared.`));
    }
  }
  if (next.type === "complete") {
    if (!definition.outcomeStepIds.includes(next.outcomeId)) {
      errors.push(diagnostic("INVALID_OUTCOME", `${path}.outcomeId`, `Outcome step ${next.outcomeId} is not declared.`));
    }
  }
}

function validateOperation(
  step: PstExecutableStepV1,
  index: number,
  definition: ExecutablePstDefinitionV1,
  writable: Set<PstStateReference>,
  errors: PstRuntimeDiagnosticV1[],
) {
  const path = `steps[${index}].operation`;
  const components = componentMap(definition);
  const operation = step.operation;
  if (operation.type === "collect-context") {
    operation.fields.forEach((field, fieldIndex) => {
      if (!writable.has(field.key)) {
        errors.push(diagnostic("UNDECLARED_WRITE", `${path}.fields[${fieldIndex}].key`, `Context field ${field.key} is not declared.`));
      }
      if (stateNamespace(field.key) !== "context") {
        errors.push(diagnostic("INVALID_STATE_REFERENCE", `${path}.fields[${fieldIndex}].key`, "Context collection may only write context state."));
      }
    });
  } else if (operation.type === "collect-answers") {
    const component = componentWithCapability(components, operation.schemaRef, "question-schema");
    if (!component) {
      errors.push(diagnostic("UNRESOLVED_REFERENCE", `${path}.schemaRef`, `Question schema ${operation.schemaRef} is not declared.`));
    }
    operation.answerFields.forEach((field, fieldIndex) => {
      if (!writable.has(field)) {
        errors.push(diagnostic("UNDECLARED_WRITE", `${path}.answerFields[${fieldIndex}]`, `Answer field ${field} is not declared.`));
      }
      if (stateNamespace(field) !== "answers") {
        errors.push(diagnostic("INVALID_STATE_REFERENCE", `${path}.answerFields[${fieldIndex}]`, "Answer collection may only write answers state."));
      }
    });
  } else if (operation.type === "persist") {
    if (!writable.has(operation.target)) {
      errors.push(diagnostic("UNDECLARED_WRITE", `${path}.target`, `Persistence target ${operation.target} is not declared.`));
    }
  } else if (operation.type === "evaluate-rules") {
    operation.ruleIds.forEach((ruleId, ruleIndex) => {
      if (!ruleMap(definition).has(ruleId)) {
        errors.push(diagnostic("UNRESOLVED_REFERENCE", `${path}.ruleIds[${ruleIndex}]`, `Rule ${ruleId} is not declared.`));
      }
    });
  } else if (operation.type === "score") {
    if (!componentWithCapability(components, operation.scaleRef, "scoring-scale")) {
      errors.push(diagnostic("UNRESOLVED_REFERENCE", `${path}.scaleRef`, `Scoring scale ${operation.scaleRef} is not declared.`));
    }
    if (!writable.has(operation.output)) {
      errors.push(diagnostic("UNDECLARED_WRITE", `${path}.output`, `Score output ${operation.output} is not declared.`));
    }
  } else if (operation.type === "analyze") {
    if (!componentWithCapability(components, operation.templateRef, "analysis-template")) {
      errors.push(diagnostic("UNRESOLVED_REFERENCE", `${path}.templateRef`, `Analysis template ${operation.templateRef} is not declared.`));
    }
    if (!writable.has(operation.output)) {
      errors.push(diagnostic("UNDECLARED_WRITE", `${path}.output`, `Analysis output ${operation.output} is not declared.`));
    }
  } else if (operation.type === "recommend") {
    if (!componentWithCapability(components, operation.strategyRef, "recommendation-strategy")) {
      errors.push(diagnostic("UNRESOLVED_REFERENCE", `${path}.strategyRef`, `Recommendation strategy ${operation.strategyRef} is not declared.`));
    }
    if (!writable.has(operation.output)) {
      errors.push(diagnostic("UNDECLARED_WRITE", `${path}.output`, `Recommendation output ${operation.output} is not declared.`));
    }
  } else if (operation.type === "action") {
    if (!componentWithCapability(components, operation.actionRef, "action-template")) {
      errors.push(diagnostic("UNRESOLVED_REFERENCE", `${path}.actionRef`, `Action template ${operation.actionRef} is not declared.`));
    }
    if (!writable.has(operation.output)) {
      errors.push(diagnostic("UNDECLARED_WRITE", `${path}.output`, `Action output ${operation.output} is not declared.`));
    }
  } else if (operation.type === "outcome") {
    const outcomeStep = definition.steps.find(({ id }) => id === step.id);
    if (!outcomeStep || !definition.outcomeStepIds.includes(step.id)) {
      errors.push(diagnostic("INVALID_OUTCOME", `${path}.outcomeId`, "Outcome operation must belong to an outcome step."));
    }
    operation.outputRefs.forEach((reference, referenceIndex) => {
      if (!writable.has(reference)) {
        errors.push(diagnostic("UNDECLARED_READ", `${path}.outputRefs[${referenceIndex}]`, `Outcome output ${reference} is not declared.`));
      }
    });
  }
}

export function validateExecutablePstDefinitionV1(
  definition: unknown,
): { status: "VALID"; errors: []; definition: ExecutablePstDefinitionV1 } | {
  status: "BLOCKED";
  errors: PstRuntimeDiagnosticV1[];
} {
  const errors: PstRuntimeDiagnosticV1[] = [];
  if (!isRecord(definition)) {
    return { status: "BLOCKED", errors: [diagnostic("INVALID_DEFINITION", "definition", "Executable definition must be an object.")] };
  }
  if (definition.runtimeVersion !== pstExecutableRuntimeVersion) {
    errors.push(diagnostic("UNSUPPORTED_VERSION", "runtimeVersion", `Runtime ${String(definition.runtimeVersion)} is not supported.`));
  }
  if (!isRecord(definition.state) || !Array.isArray(definition.steps)
    || !isRecord(definition.declarations) || typeof definition.entryStepId !== "string"
    || !Array.isArray(definition.outcomeStepIds)
    || !Array.isArray(definition.declarations.components)
    || !Array.isArray(definition.declarations.rules)
    || !Array.isArray(definition.declarations.providers)
    || !definition.steps.every((step) => isRecord(step)
      && typeof step.id === "string"
      && Array.isArray(step.reads)
      && Array.isArray(step.writes)
      && Array.isArray(step.dependsOn)
      && isRecord(step.operation)
      && isRecord(step.next))
    || !definition.outcomeStepIds.every((id) => typeof id === "string")) {
    return {
      status: "BLOCKED",
      errors: [diagnostic("INVALID_DEFINITION", "definition", "Executable definition envelope is incomplete.")],
    };
  }
  const typed = definition as unknown as ExecutablePstDefinitionV1;
  const steps = stepMap(typed);
  if (steps.size !== typed.steps.length) {
    errors.push(diagnostic("DUPLICATE_ID", "steps", "Executable step IDs must be unique."));
  }
  if (!steps.has(typed.entryStepId)) {
    errors.push(diagnostic("INVALID_ENTRY", "entryStepId", `Entry step ${typed.entryStepId} is not declared.`));
  }
  const outcomeIds = new Set(typed.outcomeStepIds);
  if (outcomeIds.size !== typed.outcomeStepIds.length) {
    errors.push(diagnostic("DUPLICATE_ID", "outcomeStepIds", "Outcome step IDs must be unique."));
  }
  const writable = new Set<PstStateReference>();
  const state = typed.state as PstExecutableStateContractV1;
  if (!Array.isArray(state.contextFields)) {
    errors.push(diagnostic("INVALID_STATE_CONTRACT", "state.contextFields", "Context fields must be an array."));
  } else {
    state.contextFields.forEach((field, index) => {
      if (!isStateReference(field.key)) {
        errors.push(diagnostic("INVALID_STATE_REFERENCE", `state.contextFields[${index}].key`, "Context field key must be namespaced."));
      } else {
        writable.add(field.key);
      }
    });
  }
  typed.steps.forEach((step, index) => {
    step.writes.forEach((reference) => {
      if (isStateReference(reference)) writable.add(reference);
    });
    allStateReferences(step).forEach(([path, reference]) => {
      if (!isStateReference(reference)) {
        errors.push(diagnostic("INVALID_STATE_REFERENCE", `steps[${index}].${path}`, "State reference must use a supported namespace."));
      }
    });
    validateOperation(step, index, typed, writable, errors);
    validateNext(step.next, `steps[${index}].next`, typed, errors);
    if (step.kind === "outcome" && !outcomeIds.has(step.id)) {
      errors.push(diagnostic("INVALID_OUTCOME", `steps[${index}]`, "Every outcome step must be listed in outcomeStepIds."));
    }
  });
  typed.declarations.rules.forEach((rule, index) => validateRule(rule, index, typed, writable, errors));
  return errors.length
    ? { status: "BLOCKED", errors: orderedDiagnostics(errors) }
    : { status: "VALID", errors: [], definition: typed };
}

function emptyState(): PstRuntimeStateV1 {
  return { context: {}, answers: {}, derived: {} };
}

function runtimeStepView(
  session: PstRuntimeSessionV1,
  step: PstExecutableStepV1,
): PstRuntimeStepViewV1 {
  const components = componentMap(session.definition);
  let requiredInputs: PstRuntimeStepViewV1["requiredInputs"] = [];
  if (step.operation.type === "collect-context") {
    requiredInputs = step.operation.fields.map((field) => field);
  } else if (step.operation.type === "collect-answers") {
    const component = componentWithCapability(components, step.operation.schemaRef, "question-schema");
    requiredInputs = step.operation.answerFields.map((key, index) => {
      const question = component?.definition.questions[index];
      return {
        key,
        label: question?.label ?? key,
        type: question?.type ?? "string",
        required: question?.required ?? true,
        options: question?.options,
      };
    });
  }
  return {
    id: step.id,
    kind: step.kind,
    title: step.title,
    description: step.description,
    operation: step.operation,
    requiredInputs,
  };
}

function literalEquals(left: unknown, right: PstExecutableLiteralV1 | undefined) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function predicateMatches(state: PstRuntimeStateV1, predicate: PstExecutablePredicateV1) {
  const actual = getState(state, predicate.field);
  switch (predicate.operator) {
    case "exists":
      return actual !== undefined && actual !== null && actual !== "";
    case "equals":
      return literalEquals(actual, predicate.value);
    case "not_equals":
      return !literalEquals(actual, predicate.value);
    case "contains":
      return Array.isArray(actual)
        ? actual.some((value) => literalEquals(value, predicate.value))
        : typeof actual === "string" && typeof predicate.value === "string"
          ? actual.includes(predicate.value)
          : false;
    case "in":
      return Array.isArray(predicate.value) && predicate.value.some((value) => literalEquals(actual, value));
    case "greater_than":
      return typeof actual === "number" && typeof predicate.value === "number" && actual > predicate.value;
    case "greater_than_or_equal":
      return typeof actual === "number" && typeof predicate.value === "number" && actual >= predicate.value;
    case "less_than":
      return typeof actual === "number" && typeof predicate.value === "number" && actual < predicate.value;
    case "less_than_or_equal":
      return typeof actual === "number" && typeof predicate.value === "number" && actual <= predicate.value;
  }
}

function ruleMatches(state: PstRuntimeStateV1, rule: PstExecutableRuleV1) {
  const all = rule.when.all ?? [];
  const any = rule.when.any ?? [];
  return (!all.length || all.every((predicate) => predicateMatches(state, predicate)))
    && (!any.length || any.some((predicate) => predicateMatches(state, predicate)));
}

function applyEffect(
  session: PstRuntimeSessionV1,
  effect: PstExecutableRuleEffectV1,
  goto: { stepId?: string },
) {
  if (effect.type === "set") {
    setState(session.state, effect.field, effect.value);
  } else if (effect.type === "add-score") {
    session.scores[effect.scaleRef] = (session.scores[effect.scaleRef] ?? 0) + effect.value;
  } else if (effect.type === "emit") {
    session.events.push(effect.event);
  } else if (effect.type === "goto") {
    goto.stepId = effect.stepId;
  }
}

function executeRules(session: PstRuntimeSessionV1, ruleIds: string[]) {
  const rules = ruleMap(session.definition);
  const goto: { stepId?: string } = {};
  for (const ruleId of ruleIds) {
    const rule = rules.get(ruleId);
    if (!rule) continue;
    const matched = ruleMatches(session.state, rule);
    session.evaluatedRules[rule.id] = matched;
    if (matched) {
      rule.then.forEach((effect) => applyEffect(session, effect, goto));
    }
  }
  return goto.stepId;
}

function numericInput(values: unknown[]) {
  return values.reduce<number>((total, value) => {
    if (typeof value === "number" && Number.isFinite(value)) return total + value;
    if (typeof value === "boolean") return total + (value ? 1 : 0);
    if (typeof value === "string") return total + value.length;
    return total;
  }, 0);
}

function executeOperation(
  session: PstRuntimeSessionV1,
  step: PstExecutableStepV1,
): { gotoStepId?: string } {
  const operation = step.operation;
  const components = componentMap(session.definition);
  const goto: { stepId?: string } = {};
  if (operation.type === "persist") {
    const value = getState(session.state, operation.target);
    if (value !== undefined) setState(session.state, operation.target, value);
  } else if (operation.type === "evaluate-rules") {
    goto.stepId = executeRules(session, operation.ruleIds);
  } else if (operation.type === "score") {
    const scale = componentWithCapability(components, operation.scaleRef, "scoring-scale");
    if (scale) {
      const raw = numericInput(step.reads.map((reference) => getState(session.state, reference)));
      const range = scale.definition.maximum - scale.definition.minimum;
      const value = scale.definition.minimum + (range > 0 ? raw % (range + 1) : 0);
      setState(session.state, operation.output, value);
      session.scores[operation.scaleRef] = value;
    }
  } else if (operation.type === "analyze") {
    const template = componentWithCapability(components, operation.templateRef, "analysis-template");
    setState(session.state, operation.output, {
      template: template?.definition.template ?? operation.templateRef,
      inputs: step.reads.map((reference) => getState(session.state, reference)),
    });
  } else if (operation.type === "recommend") {
    const strategy = componentWithCapability(components, operation.strategyRef, "recommendation-strategy");
    setState(session.state, operation.output, {
      template: strategy?.definition.template ?? operation.strategyRef,
      inputs: step.reads.map((reference) => getState(session.state, reference)),
    });
  } else if (operation.type === "action") {
    const action = componentWithCapability(components, operation.actionRef, "action-template");
    setState(session.state, operation.output, {
      items: action?.definition.items ?? [],
      basedOn: step.reads.map((reference) => getState(session.state, reference)),
    });
  } else if (operation.type === "outcome") {
    session.outcomeId = operation.outcomeId;
    session.events.push(`outcome:${operation.outcomeId}`);
  }
  return { gotoStepId: goto.stepId };
}

function nextStepId(
  session: PstRuntimeSessionV1,
  next: PstExecutableNextV1,
) {
  if (next.type === "step") return next.stepId;
  if (next.type === "complete") return undefined;
  for (const branch of next.branches) {
    if (session.evaluatedRules[branch.whenRuleId]) return branch.stepId;
  }
  return next.defaultStepId;
}

function missingInputs(
  session: PstRuntimeSessionV1,
  step: PstExecutableStepV1,
  input: PstRuntimeInputV1,
) {
  const required = runtimeStepView(session, step).requiredInputs;
  return required.filter((field) => field.required && !hasOwn(input, field.key)
    && getState(session.state, field.key) === undefined);
}

export function createPstRuntime(
  definition: unknown,
  initialState: Partial<PstRuntimeStateV1> = {},
): PstRuntimeStartResultV1 {
  const validation = validateExecutablePstDefinitionV1(definition);
  if (validation.status === "BLOCKED") return validation;
  const state = emptyState();
  for (const namespace of ["context", "answers", "derived"] as const) {
    const values = initialState[namespace];
    if (values) Object.assign(state[namespace], clone(values));
  }
  const session: PstRuntimeSessionV1 = {
    definition: validation.definition,
    state,
    currentStepId: validation.definition.entryStepId,
    events: [],
    scores: {},
    evaluatedRules: {},
    visitedStepIds: [],
  };
  return { status: "READY", session };
}

function outputForOutcome(session: PstRuntimeSessionV1, step: PstExecutableStepV1) {
  const operation = step.operation;
  if (operation.type !== "outcome") return {};
  return Object.fromEntries(operation.outputRefs.map((reference) => [reference, getState(session.state, reference)]));
}

export function advancePstRuntime(
  inputSession: PstRuntimeSessionV1,
  input: PstRuntimeInputV1 = {},
): PstRuntimeAdvanceResultV1 {
  const session = clone(inputSession);
  const steps = stepMap(session.definition);
  const maxIterations = Math.max(session.definition.steps.length * 3, 3);
  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const step = steps.get(session.currentStepId);
    if (!step) {
      return {
        status: "BLOCKED",
        session,
        errors: [diagnostic("INVALID_TRANSITION", "currentStepId", `Step ${session.currentStepId} is not declared.`)],
      };
    }
    if (!session.visitedStepIds.includes(step.id)) session.visitedStepIds.push(step.id);
    const required = missingInputs(session, step, input);
    if (required.length) {
      return { status: "WAITING_INPUT", session, step: runtimeStepView(session, step) };
    }
    if (step.operation.type === "collect-context" || step.operation.type === "collect-answers") {
      runtimeStepView(session, step).requiredInputs.forEach(({ key }) => {
        if (hasOwn(input, key)) setState(session.state, key, input[key]);
      });
    }
    const operationResult = executeOperation(session, step);
    if (operationResult.gotoStepId) {
      session.currentStepId = operationResult.gotoStepId;
    } else if (step.next.type === "complete") {
      session.outcomeId = step.next.outcomeId;
      return {
        status: "COMPLETED",
        session,
        outcomeId: step.next.outcomeId,
        output: outputForOutcome(session, step),
      };
    } else {
      const next = nextStepId(session, step.next);
      if (!next) {
        return {
          status: "BLOCKED",
          session,
          errors: [diagnostic("INVALID_TRANSITION", `steps.${step.id}.next`, "Transition did not resolve to a step.")],
        };
      }
      session.currentStepId = next;
    }
    if (step.operation.type === "outcome" && session.outcomeId) {
      return {
        status: "COMPLETED",
        session,
        outcomeId: session.outcomeId,
        output: outputForOutcome(session, step),
      };
    }
  }
  return {
    status: "BLOCKED",
    session,
    errors: [diagnostic("RUNTIME_LOOP", "steps", "Runtime exceeded the safe transition limit.")],
  };
}

export function runPstRuntime(
  definition: unknown,
  inputs: PstRuntimeInputV1[] = [],
): PstRuntimeAdvanceResultV1 {
  const started = createPstRuntime(definition);
  if (started.status === "BLOCKED") return started;
  let result: PstRuntimeAdvanceResultV1 = advancePstRuntime(started.session);
  let inputIndex = 0;
  while (result.status === "WAITING_INPUT" && inputIndex < inputs.length) {
    result = advancePstRuntime(result.session, inputs[inputIndex] ?? {});
    inputIndex += 1;
  }
  return result;
}