import {
  pstCanonicalJsonHash,
} from "./pst-contract";
import {
  pstCompilerReadyIrVersion,
  type PstCompilerInputV1,
  type PstCompilerReadyIrV1,
} from "./pst-compiler-ready";
import {
  pstCompilerName,
  pstExecutableRuntimeVersion,
  type ExecutablePstDefinitionV1,
  type PstCompileDiagnosticV1,
  type PstCompileResultV1,
  type PstExecutableOperationV1,
  type PstExecutableStepKind,
} from "./pst-executable";

export const pstCompilerVersion = "pst-compiler.v1" as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: string[]) {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function stringArray(value: unknown) {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function optionShape(value: unknown) {
  return isRecord(value)
    && hasOnlyKeys(value, ["value", "label"])
    && typeof value.value === "string"
    && typeof value.label === "string";
}

function contextFieldShape(value: unknown) {
  return isRecord(value)
    && hasOnlyKeys(value, ["key", "label", "type", "required", "sensitive", "options"])
    && typeof value.key === "string"
    && value.key.startsWith("context.")
    && typeof value.label === "string"
    && ["string", "number", "boolean", "choice", "date", "json"].includes(String(value.type))
    && typeof value.required === "boolean"
    && (value.sensitive === undefined || typeof value.sensitive === "boolean")
    && (value.options === undefined
      || (Array.isArray(value.options) && value.options.every(optionShape)));
}

function operationShape(value: unknown) {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  switch (value.type) {
    case "collect-context":
      return hasOnlyKeys(value, ["type", "fields", "sessionPersistence"])
        && Array.isArray(value.fields)
        && value.fields.every(contextFieldShape)
        && (value.sessionPersistence === "ephemeral"
          || value.sessionPersistence === "customer_session");
    case "collect-answers":
      return hasOnlyKeys(value, ["type", "schemaRef", "answerFields"])
        && typeof value.schemaRef === "string"
        && stringArray(value.answerFields);
    case "persist":
      return hasOnlyKeys(value, ["type", "target", "retention"])
        && typeof value.target === "string"
        && (value.retention === "ephemeral" || value.retention === "customer_session");
    case "evaluate-rules":
      return hasOnlyKeys(value, ["type", "ruleIds"]) && stringArray(value.ruleIds);
    case "score":
      return hasOnlyKeys(value, ["type", "scaleRef", "output"])
        && typeof value.scaleRef === "string"
        && typeof value.output === "string";
    case "analyze":
      return hasOnlyKeys(value, ["type", "templateRef", "output", "providerId"])
        && typeof value.templateRef === "string"
        && typeof value.output === "string"
        && (value.providerId === undefined || typeof value.providerId === "string");
    case "recommend":
      return hasOnlyKeys(value, ["type", "strategyRef", "output", "providerId"])
        && typeof value.strategyRef === "string"
        && typeof value.output === "string"
        && (value.providerId === undefined || typeof value.providerId === "string");
    case "action":
      return hasOnlyKeys(value, ["type", "actionRef", "output"])
        && typeof value.actionRef === "string"
        && typeof value.output === "string";
    case "outcome":
      return hasOnlyKeys(value, ["type", "outcomeId", "outputRefs"])
        && typeof value.outcomeId === "string"
        && stringArray(value.outputRefs);
    default:
      return false;
  }
}

function transitionShape(value: unknown) {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  if (value.type === "step") {
    return hasOnlyKeys(value, ["type", "stepId"]) && typeof value.stepId === "string";
  }
  if (value.type === "complete") {
    return hasOnlyKeys(value, ["type", "outcomeId"]) && typeof value.outcomeId === "string";
  }
  return value.type === "conditional"
    && hasOnlyKeys(value, ["type", "branches", "defaultStepId"])
    && typeof value.defaultStepId === "string"
    && Array.isArray(value.branches)
    && value.branches.every((branch) =>
      isRecord(branch)
      && hasOnlyKeys(branch, ["whenRuleId", "stepId"])
      && typeof branch.whenRuleId === "string"
      && typeof branch.stepId === "string");
}

function componentShape(value: unknown) {
  if (!isRecord(value)
    || !hasOnlyKeys(value, ["id", "assetId", "name", "version", "capability", "definition"])
    || typeof value.id !== "string"
    || typeof value.assetId !== "string"
    || typeof value.name !== "string"
    || typeof value.version !== "string"
    || !isRecord(value.definition)) {
    return false;
  }
  const definition = value.definition;
  if (value.capability === "question-schema") {
    return hasOnlyKeys(definition, ["questions"])
      && Array.isArray(definition.questions)
      && definition.questions.every((question) =>
        isRecord(question)
        && hasOnlyKeys(question, ["id", "label", "type", "required", "options"])
        && typeof question.id === "string"
        && typeof question.label === "string"
        && typeof question.required === "boolean"
        && (question.options === undefined
          || (Array.isArray(question.options) && question.options.every(optionShape))));
  }
  if (value.capability === "scoring-scale") {
    return hasOnlyKeys(definition, ["minimum", "maximum", "bands"])
      && typeof definition.minimum === "number"
      && typeof definition.maximum === "number"
      && Array.isArray(definition.bands)
      && definition.bands.every((band) =>
        isRecord(band)
        && hasOnlyKeys(band, ["minimum", "label"])
        && typeof band.minimum === "number"
        && typeof band.label === "string");
  }
  if (value.capability === "analysis-template"
    || value.capability === "recommendation-strategy") {
    return hasOnlyKeys(definition, ["template", "outputFields"])
      && typeof definition.template === "string"
      && stringArray(definition.outputFields);
  }
  if (value.capability === "action-template") {
    return hasOnlyKeys(definition, ["items"])
      && Array.isArray(definition.items)
      && definition.items.every((item) =>
        isRecord(item)
        && hasOnlyKeys(item, ["id", "title", "description"])
        && typeof item.id === "string"
        && typeof item.title === "string"
        && typeof item.description === "string");
  }
  return value.capability === "outcome-mapping"
    && hasOnlyKeys(definition, ["outputFields"])
    && stringArray(definition.outputFields);
}

function stateReference(value: unknown) {
  return typeof value === "string"
    && /^(?:context|answers|derived)\.[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value);
}

function literalShape(value: unknown) {
  return value === null
    || typeof value === "string"
    || typeof value === "number"
    || typeof value === "boolean"
    || (Array.isArray(value) && value.every((item) =>
      typeof item === "string"
      || typeof item === "number"
      || typeof item === "boolean"));
}

function predicateShape(value: unknown) {
  return isRecord(value)
    && hasOnlyKeys(value, ["field", "operator", "value"])
    && stateReference(value.field)
    && [
      "equals",
      "not_equals",
      "contains",
      "in",
      "greater_than",
      "greater_than_or_equal",
      "less_than",
      "less_than_or_equal",
      "exists",
    ].includes(String(value.operator))
    && (value.value === undefined || literalShape(value.value));
}

function ruleEffectShape(value: unknown) {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  if (value.type === "set") {
    return hasOnlyKeys(value, ["type", "field", "value"])
      && stateReference(value.field)
      && literalShape(value.value);
  }
  if (value.type === "add-score") {
    return hasOnlyKeys(value, ["type", "scaleRef", "value"])
      && typeof value.scaleRef === "string"
      && Boolean(value.scaleRef)
      && typeof value.value === "number";
  }
  if (value.type === "emit") {
    return hasOnlyKeys(value, ["type", "event"])
      && typeof value.event === "string"
      && Boolean(value.event);
  }
  return value.type === "goto"
    && hasOnlyKeys(value, ["type", "stepId"])
    && typeof value.stepId === "string"
    && Boolean(value.stepId);
}

function ruleShape(value: unknown) {
  if (!isRecord(value)
    || !hasOnlyKeys(value, ["id", "version", "name", "kind", "when", "then"])
    || typeof value.id !== "string"
    || !value.id
    || typeof value.version !== "string"
    || !value.version
    || typeof value.name !== "string"
    || !value.name
    || (value.kind !== "RULE" && value.kind !== "SCORING")
    || !isRecord(value.when)
    || !hasOnlyKeys(value.when, ["all", "any"])
    || !Array.isArray(value.then)
    || !value.then.every(ruleEffectShape)) {
    return false;
  }
  return (value.when.all === undefined
      || (Array.isArray(value.when.all) && value.when.all.every(predicateShape)))
    && (value.when.any === undefined
      || (Array.isArray(value.when.any) && value.when.any.every(predicateShape)));
}

function patternShape(value: unknown) {
  return isRecord(value)
    && hasOnlyKeys(value, ["id", "name", "version", "description", "steps"])
    && typeof value.id === "string"
    && Boolean(value.id)
    && typeof value.name === "string"
    && Boolean(value.name)
    && typeof value.version === "string"
    && Boolean(value.version)
    && (value.description === undefined || typeof value.description === "string")
    && stringArray(value.steps);
}

function recipeShape(value: unknown) {
  return isRecord(value)
    && hasOnlyKeys(value, ["id", "name", "version", "description", "components"])
    && typeof value.id === "string"
    && Boolean(value.id)
    && typeof value.name === "string"
    && Boolean(value.name)
    && typeof value.version === "string"
    && Boolean(value.version)
    && (value.description === undefined || typeof value.description === "string")
    && stringArray(value.components);
}

function integrityMatches(readyIr: PstCompilerReadyIrV1) {
  if (!isRecord(readyIr.integrity)
    || readyIr.integrity.algorithm !== "sha256-canonical-json.v1"
    || !/^[a-f0-9]{64}$/.test(readyIr.integrity.hash)) {
    return false;
  }
  const { integrity, ...payload } = readyIr;
  return pstCanonicalJsonHash(payload) === integrity.hash;
}

function diagnostic(
  code: string,
  path: string,
  message: string,
): PstCompileDiagnosticV1 {
  return { severity: "ERROR", code, path, message };
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

function compilerInputDiagnostics(
  compilerVersion: string,
  readyIr: PstCompilerReadyIrV1,
) {
  const diagnostics: PstCompileDiagnosticV1[] = [];
  if (compilerVersion !== pstCompilerVersion) {
    diagnostics.push(diagnostic(
      "UNSUPPORTED_VERSION",
      "compilerVersion",
      `Compiler version must be ${pstCompilerVersion}.`,
    ));
  }
  if (!integrityMatches(readyIr)) {
    diagnostics.push(diagnostic(
      "INVALID_READY_INTEGRITY",
      "readyIr.integrity",
      "Compiler-Ready IR integrity proof is missing or does not match its payload.",
    ));
    return diagnostics;
  }
  const sourceIrValid = isRecord(readyIr.sourceIr)
    && hasOnlyKeys(readyIr.sourceIr, ["version", "hash"])
    && readyIr.sourceIr.version === "pst-manufacturing-ir.v1"
    && typeof readyIr.sourceIr.hash === "string"
    && /^[a-f0-9]{64}$/.test(readyIr.sourceIr.hash);
  if (!sourceIrValid) {
    diagnostics.push(diagnostic(
      "INVALID_COMPILER_INPUT",
      "readyIr.sourceIr",
      "Source IR identity must match the versioned hash allowlist.",
    ));
  }
  const identityValid = isRecord(readyIr.identity)
    && hasOnlyKeys(readyIr.identity, [
      "releaseId",
      "projectId",
      "slug",
      "releaseVersion",
      "publishedAt",
      "snapshotHash",
      "sourceSchemaVersion",
      "irVersion",
    ])
    && [
      readyIr.identity.releaseId,
      readyIr.identity.projectId,
      readyIr.identity.slug,
      readyIr.identity.releaseVersion,
    ].every((value) => typeof value === "string" && Boolean(value))
    && typeof readyIr.identity.publishedAt === "string"
    && Number.isFinite(Date.parse(readyIr.identity.publishedAt))
    && new Date(Date.parse(readyIr.identity.publishedAt)).toISOString()
      === readyIr.identity.publishedAt
    && typeof readyIr.identity.snapshotHash === "string"
    && /^[a-f0-9]{64}$/.test(readyIr.identity.snapshotHash)
    && readyIr.identity.sourceSchemaVersion === "pst-release-snapshot.v1"
    && readyIr.identity.irVersion === "pst-manufacturing-ir.v1";
  if (!identityValid) {
    diagnostics.push(diagnostic(
      "INVALID_COMPILER_INPUT",
      "readyIr.identity",
      "Executable identity is incomplete or outside the versioned allowlist.",
    ));
  }
  const productValid = isRecord(readyIr.product)
    && hasOnlyKeys(readyIr.product, [
      "name",
      "description",
      "problem",
      "targetUser",
      "desiredOutcome",
      "journey",
      "expectedOutput",
    ])
    && [
      readyIr.product.name,
      readyIr.product.description,
      readyIr.product.problem,
      readyIr.product.targetUser,
      readyIr.product.desiredOutcome,
    ].every((value) => typeof value === "string" && Boolean(value))
    && stringArray(readyIr.product.journey)
    && stringArray(readyIr.product.expectedOutput);
  if (!productValid) {
    diagnostics.push(diagnostic(
      "INVALID_COMPILER_INPUT",
      "readyIr.product",
      "Executable product metadata is incomplete or outside the public allowlist.",
    ));
  }
  const stateValid = isRecord(readyIr.state)
    && hasOnlyKeys(readyIr.state, ["contextFields", "sessionPersistence"])
    && Array.isArray(readyIr.state.contextFields)
    && readyIr.state.contextFields.every(contextFieldShape)
    && (readyIr.state.sessionPersistence === "ephemeral"
      || readyIr.state.sessionPersistence === "customer_session");
  if (!stateValid) {
    diagnostics.push(diagnostic(
      "INVALID_COMPILER_INPUT",
      "readyIr.state",
      "Executable state contract is incomplete or outside the public allowlist.",
    ));
  }
  const declarationsValid = isRecord(readyIr.declarations)
    && hasOnlyKeys(readyIr.declarations, [
      "pattern",
      "recipe",
      "components",
      "rules",
      "providers",
    ])
    && (readyIr.declarations.pattern === undefined
      || patternShape(readyIr.declarations.pattern))
    && (readyIr.declarations.recipe === undefined
      || recipeShape(readyIr.declarations.recipe))
    && Array.isArray(readyIr.declarations.components)
    && readyIr.declarations.components.every(componentShape)
    && Array.isArray(readyIr.declarations.rules)
    && readyIr.declarations.rules.every(ruleShape)
    && Array.isArray(readyIr.declarations.providers)
    && readyIr.declarations.providers.every((provider) =>
      isRecord(provider)
      && hasOnlyKeys(provider, ["id", "capability", "mode"])
      && typeof provider.id === "string"
      && Boolean(provider.id)
      && typeof provider.capability === "string"
      && Boolean(provider.capability)
      && provider.mode === "assistive");
  if (!declarationsValid) {
    diagnostics.push(diagnostic(
      "INVALID_COMPILER_INPUT",
      "readyIr.declarations",
      "Executable declarations do not match the public allowlist.",
    ));
  }
  if (!sourceIrValid
    || !identityValid
    || !productValid
    || !stateValid
    || !declarationsValid
    || !Array.isArray(readyIr.steps)
    || !Array.isArray(readyIr.outcomeStepIds)) {
    return diagnostics.sort((left, right) =>
      left.path.localeCompare(right.path)
      || left.code.localeCompare(right.code)
      || left.message.localeCompare(right.message));
  }
  if (readyIr.readyVersion !== pstCompilerReadyIrVersion
    || readyIr.sourceIr.version !== "pst-manufacturing-ir.v1"
    || readyIr.identity.irVersion !== "pst-manufacturing-ir.v1"
    || readyIr.identity.sourceSchemaVersion !== "pst-release-snapshot.v1") {
    diagnostics.push(diagnostic(
      "UNSUPPORTED_VERSION",
      "readyIr",
      "Compiler-Ready IR contains an unsupported contract version.",
    ));
  }
  if (!hasOnlyKeys(readyIr, [
    "readyVersion",
    "integrity",
    "sourceIr",
    "identity",
    "product",
    "state",
    "declarations",
    "steps",
    "entryStepId",
    "outcomeStepIds",
  ])) {
    diagnostics.push(diagnostic(
      "INVALID_COMPILER_INPUT",
      "readyIr",
      "Compiler-Ready IR contains unsupported top-level fields.",
    ));
  }
  const stepIds = new Set<string>();
  readyIr.steps.forEach((step, index) => {
    const path = `readyIr.steps[${index}]`;
    if (!step.id || stepIds.has(step.id)) {
      diagnostics.push(diagnostic(
        "INVALID_COMPILER_INPUT",
        `${path}.id`,
        "Executable step IDs must be nonempty and unique.",
      ));
    }
    stepIds.add(step.id);
    if (!hasOnlyKeys(step, [
      "id",
      "kind",
      "title",
      "description",
      "reads",
      "writes",
      "dependsOn",
      "operation",
      "next",
    ])
      || !operationShape(step.operation)
      || !transitionShape(step.next)) {
      diagnostics.push(diagnostic(
        "INVALID_COMPILER_INPUT",
        path,
        "Executable step contains fields outside the public allowlist.",
      ));
    }
    if (operationTypeByKind[step.kind] !== step.operation.type) {
      diagnostics.push(diagnostic(
        "INVALID_COMPILER_INPUT",
        `${path}.operation.type`,
        "Step kind and operation type do not match.",
      ));
    }
    if (step.next.type === "complete"
      && (step.kind !== "outcome"
        || step.operation.type !== "outcome"
        || step.operation.outcomeId !== step.next.outcomeId)) {
      diagnostics.push(diagnostic(
        "INVALID_COMPILER_INPUT",
        `${path}.next`,
        "Only a matching outcome operation may complete.",
      ));
    }
  });

  if (!stepIds.has(readyIr.entryStepId)) {
    diagnostics.push(diagnostic(
      "INVALID_REFERENCE",
      "readyIr.entryStepId",
      "Entry step must reference an executable step.",
    ));
  }
  readyIr.steps.forEach((step, index) => {
    const targets = step.next.type === "step"
      ? [step.next.stepId]
      : step.next.type === "conditional"
        ? [...step.next.branches.map(({ stepId }) => stepId), step.next.defaultStepId]
        : [];
    targets.forEach((target, targetIndex) => {
      if (!stepIds.has(target)) {
        diagnostics.push(diagnostic(
          "INVALID_REFERENCE",
          `readyIr.steps[${index}].next.targets[${targetIndex}]`,
          `Transition target ${target} is not an executable step.`,
        ));
      }
    });
  });

  const outcomeIds = new Set(readyIr.outcomeStepIds);
  const computedOutcomeIds = readyIr.steps
    .filter((step) => step.kind === "outcome" && step.next.type === "complete")
    .map(({ id }) => id);
  if (!readyIr.outcomeStepIds.length
    || outcomeIds.size !== readyIr.outcomeStepIds.length
    || outcomeIds.size !== computedOutcomeIds.length
    || computedOutcomeIds.some((id) => !outcomeIds.has(id))) {
    diagnostics.push(diagnostic(
      "INVALID_COMPILER_INPUT",
      "readyIr.outcomeStepIds",
      "At least one unique terminal outcome step is required.",
    ));
  }
  readyIr.outcomeStepIds.forEach((outcomeId, index) => {
    const step = readyIr.steps.find(({ id }) => id === outcomeId);
    if (!step || step.kind !== "outcome" || step.next.type !== "complete") {
      diagnostics.push(diagnostic(
        "INVALID_REFERENCE",
        `readyIr.outcomeStepIds[${index}]`,
        "Outcome ID must reference a terminal outcome step.",
      ));
    }
  });

  const contextKeys = readyIr.state.contextFields.map(({ key }) => key);
  if (new Set(contextKeys).size !== contextKeys.length) {
    diagnostics.push(diagnostic(
      "INVALID_COMPILER_INPUT",
      "readyIr.state.contextFields",
      "Context field keys must be unique.",
    ));
  }

  const components = new Map<string, PstCompilerReadyIrV1["declarations"]["components"][number]>();
  const componentIds = new Set<string>();
  const componentReferenceKeys = new Set<string>();
  readyIr.declarations.components.forEach((component, index) => {
    if (componentIds.has(component.id)) {
      diagnostics.push(diagnostic(
        "INVALID_COMPILER_INPUT",
        `readyIr.declarations.components[${index}].id`,
        `Component ID ${component.id} is duplicated.`,
      ));
    }
    componentIds.add(component.id);
    [component.id, component.assetId].forEach((key) => {
      if (componentReferenceKeys.has(key)) {
        diagnostics.push(diagnostic(
          "INVALID_COMPILER_INPUT",
          `readyIr.declarations.components[${index}]`,
          `Component reference key ${key} is ambiguous.`,
        ));
      }
      componentReferenceKeys.add(key);
    });
    components.set(component.id, component);
    components.set(component.assetId, component);
  });
  const ruleIds = new Set<string>();
  readyIr.declarations.rules.forEach((rule, index) => {
    if (ruleIds.has(rule.id)) {
      diagnostics.push(diagnostic(
        "INVALID_COMPILER_INPUT",
        `readyIr.declarations.rules[${index}].id`,
        `Rule ID ${rule.id} is duplicated.`,
      ));
    }
    ruleIds.add(rule.id);
  });
  const providers = new Map<string, PstCompilerReadyIrV1["declarations"]["providers"][number]>();
  readyIr.declarations.providers.forEach((provider, index) => {
    if (providers.has(provider.id)) {
      diagnostics.push(diagnostic(
        "INVALID_COMPILER_INPUT",
        `readyIr.declarations.providers[${index}].id`,
        `Provider ID ${provider.id} is duplicated.`,
      ));
    }
    providers.set(provider.id, provider);
  });
  const requireComponent = (
    reference: string,
    capability: PstCompilerReadyIrV1["declarations"]["components"][number]["capability"],
    path: string,
  ) => {
    if (components.get(reference)?.capability !== capability) {
      diagnostics.push(diagnostic(
        "INVALID_REFERENCE",
        path,
        `Reference ${reference} must resolve capability ${capability}.`,
      ));
    }
  };
  readyIr.steps.forEach((step, index) => {
    const operation = step.operation;
    const path = `readyIr.steps[${index}].operation`;
    if (operation.type === "collect-answers") {
      requireComponent(operation.schemaRef, "question-schema", `${path}.schemaRef`);
    } else if (operation.type === "score") {
      requireComponent(operation.scaleRef, "scoring-scale", `${path}.scaleRef`);
    } else if (operation.type === "analyze" || operation.type === "recommend") {
      requireComponent(
        operation.type === "analyze" ? operation.templateRef : operation.strategyRef,
        operation.type === "analyze" ? "analysis-template" : "recommendation-strategy",
        `${path}.${operation.type === "analyze" ? "templateRef" : "strategyRef"}`,
      );
      if (operation.providerId) {
        const provider = providers.get(operation.providerId);
        const capability = operation.type === "analyze" ? "analysis" : "recommendation";
        if (!provider || provider.capability !== capability || provider.mode !== "assistive") {
          diagnostics.push(diagnostic(
            "INVALID_REFERENCE",
            `${path}.providerId`,
            `Provider must resolve capability ${capability} in assistive mode.`,
          ));
        }
      }
    } else if (operation.type === "action") {
      requireComponent(operation.actionRef, "action-template", `${path}.actionRef`);
    } else if (operation.type === "evaluate-rules") {
      operation.ruleIds.forEach((ruleId, ruleIndex) => {
        if (!ruleIds.has(ruleId)) {
          diagnostics.push(diagnostic(
            "INVALID_REFERENCE",
            `${path}.ruleIds[${ruleIndex}]`,
            `Rule ${ruleId} is not declared.`,
          ));
        }
      });
    }
    if (step.next.type === "conditional") {
      step.next.branches.forEach(({ whenRuleId }, branchIndex) => {
        if (!ruleIds.has(whenRuleId)) {
          diagnostics.push(diagnostic(
            "INVALID_REFERENCE",
            `readyIr.steps[${index}].next.branches[${branchIndex}].whenRuleId`,
            `Rule ${whenRuleId} is not declared.`,
          ));
        }
      });
    }
  });
  const writableState = new Set([
    ...readyIr.state.contextFields.map(({ key }) => key),
    ...readyIr.steps.flatMap(({ writes }) => writes),
  ]);
  readyIr.declarations.rules.forEach((rule, ruleIndex) => {
    rule.then.forEach((effect, effectIndex) => {
      const path = `readyIr.declarations.rules[${ruleIndex}].then[${effectIndex}]`;
      if (effect.type === "add-score"
        && components.get(effect.scaleRef)?.capability !== "scoring-scale") {
        diagnostics.push(diagnostic(
          "INVALID_REFERENCE",
          `${path}.scaleRef`,
          `Reference ${effect.scaleRef} must resolve capability scoring-scale.`,
        ));
      } else if (effect.type === "goto" && !stepIds.has(effect.stepId)) {
        diagnostics.push(diagnostic(
          "INVALID_REFERENCE",
          `${path}.stepId`,
          `Rule target ${effect.stepId} is not an executable step.`,
        ));
      } else if (effect.type === "set" && !writableState.has(effect.field)) {
        diagnostics.push(diagnostic(
          "INVALID_REFERENCE",
          `${path}.field`,
          `Rule set target ${effect.field} is not declared in the state write contract.`,
        ));
      }
    });
  });
  return diagnostics.sort((left, right) =>
    left.path.localeCompare(right.path)
    || left.code.localeCompare(right.code)
    || left.message.localeCompare(right.message));
}

function dataClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function compilePstV1(input: PstCompilerInputV1): PstCompileResultV1 {
  if (!isRecord(input)
    || typeof input.compilerVersion !== "string"
    || !isRecord(input.readyIr)) {
    return {
      status: "BLOCKED",
      errors: [diagnostic(
        "INVALID_COMPILER_INPUT",
        "input",
        "Compiler input must contain a version and Compiler-Ready IR.",
      )],
      warnings: [],
    };
  }
  let errors: PstCompileDiagnosticV1[];
  try {
    errors = compilerInputDiagnostics(
      input.compilerVersion,
      input.readyIr as PstCompilerReadyIrV1,
    );
  } catch {
    errors = [diagnostic(
      "INVALID_COMPILER_INPUT",
      "readyIr",
      "Compiler-Ready IR is malformed or cannot be canonicalized.",
    )];
  }
  if (errors.length) return { status: "BLOCKED", errors, warnings: [] };

  const readyIr = dataClone(input.readyIr as PstCompilerReadyIrV1);
  const definition: ExecutablePstDefinitionV1 = {
    runtimeVersion: pstExecutableRuntimeVersion,
    compiler: {
      name: pstCompilerName,
      version: pstCompilerVersion,
    },
    identity: readyIr.identity,
    product: readyIr.product,
    state: readyIr.state,
    declarations: readyIr.declarations,
    steps: readyIr.steps,
    entryStepId: readyIr.entryStepId,
    outcomeStepIds: readyIr.outcomeStepIds,
  };
  return { status: "COMPILED", definition, warnings: [] };
}