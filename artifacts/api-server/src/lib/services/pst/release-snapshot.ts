import {
  pstCanonicalJsonHash,
  pstCredentialConfigurationPaths,
} from "@workspace/db/schema";
import type {
  PstReleaseComponentSnapshot,
  PstReleaseProviderSnapshot,
  PstReleaseRuleSnapshot,
  PstReleaseSnapshot,
  WorkflowStep,
} from "@workspace/db";

export const releaseSnapshotHashAlgorithm = "sha256-canonical-json.v1" as const;

export type CompilerReadySnapshotResult =
  | { status: "READY"; snapshot: PstReleaseSnapshot }
  | { status: "BLOCKED"; errors: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function releaseSnapshotHash(snapshot: Omit<PstReleaseSnapshot, "snapshotHash">) {
  return pstCanonicalJsonHash(snapshot);
}

export function releaseSnapshotHashMatches(snapshot: PstReleaseSnapshot) {
  if (snapshot.snapshotHashAlgorithm !== releaseSnapshotHashAlgorithm) return false;
  const { snapshotHash, ...payload } = snapshot;
  return typeof snapshotHash === "string"
    && snapshotHash === releaseSnapshotHash(payload);
}

function isReleaseRule(value: unknown): value is PstReleaseRuleSnapshot {
  if (!isRecord(value)) return false;
  return typeof value.id === "string"
    && Boolean(value.id.trim())
    && typeof value.version === "string"
    && Boolean(value.version.trim())
    && typeof value.name === "string"
    && Boolean(value.name.trim())
    && typeof value.kind === "string"
    && Boolean(value.kind.trim())
    && isRecord(value.when)
    && (Array.isArray(value.when.all) || Array.isArray(value.when.any))
    && Array.isArray(value.then)
    && value.then.length > 0
    && value.then.every(isRecord);
}

function isReleaseProvider(value: unknown): value is PstReleaseProviderSnapshot {
  if (!isRecord(value)) return false;
  return typeof value.id === "string"
    && Boolean(value.id.trim())
    && typeof value.capability === "string"
    && Boolean(value.capability.trim())
    && typeof value.mode === "string"
    && Boolean(value.mode.trim())
    && isRecord(value.configuration);
}

type ConfiguredValue = {
  path: string;
  value: unknown;
};

function configuredValues(
  workflow: WorkflowStep[],
  singularKey: "rule" | "provider",
  pluralKey: "rules" | "providers",
) {
  const values: ConfiguredValue[] = [];
  const errors: string[] = [];
  for (const [stepIndex, step] of workflow.entries()) {
    const configuration = step.configuration;
    if (!isRecord(configuration)) continue;
    const singular = configuration[singularKey];
    const plural = configuration[pluralKey];
    const basePath = `workflow[${stepIndex}].configuration`;
    if (singular !== undefined) {
      values.push({ path: `${basePath}.${singularKey}`, value: singular });
    }
    if (plural !== undefined) {
      if (!Array.isArray(plural)) {
        errors.push(`${basePath}.${pluralKey} must be an array.`);
      } else {
        plural.forEach((value, index) => {
          values.push({ path: `${basePath}.${pluralKey}[${index}]`, value });
        });
      }
    }
  }
  return { values, errors };
}

function resolvedReleaseRules(workflow: WorkflowStep[]) {
  const configured = configuredValues(workflow, "rule", "rules");
  const byId = new Map<string, PstReleaseRuleSnapshot>();
  const errors = [...configured.errors];
  for (const entry of configured.values) {
    if (isReleaseRule(entry.value)) {
      byId.set(entry.value.id, entry.value);
    } else {
      errors.push(`${entry.path} is not a complete release rule.`);
    }
  }
  return {
    values: [...byId.values()].sort((left, right) => left.id.localeCompare(right.id)),
    errors,
  };
}

function resolvedReleaseProviders(workflow: WorkflowStep[]) {
  const configured = configuredValues(workflow, "provider", "providers");
  const byId = new Map<string, PstReleaseProviderSnapshot>();
  const errors = [...configured.errors];
  for (const entry of configured.values) {
    if (isReleaseProvider(entry.value)) {
      byId.set(entry.value.id, entry.value);
    } else {
      errors.push(`${entry.path} is not a complete release provider.`);
    }
  }
  return {
    values: [...byId.values()].sort((left, right) => left.id.localeCompare(right.id)),
    errors,
  };
}

export function resolveReleaseDeclarations(workflow: WorkflowStep[]) {
  const rules = resolvedReleaseRules(workflow);
  const providers = resolvedReleaseProviders(workflow);
  const credentialErrors = workflow.flatMap((step, index) =>
    pstCredentialConfigurationPaths(step.configuration, `workflow[${index}].configuration`)
      .map((path) => `${path} contains credential-like data.`),
  );
  return {
    rules: rules.values,
    providers: providers.values,
    errors: [...rules.errors, ...providers.errors, ...credentialErrors],
  };
}

function releaseComponent(value: unknown): value is PstReleaseComponentSnapshot {
  if (!isRecord(value)) return false;
  return typeof value.id === "string"
    && typeof value.assetId === "string"
    && typeof value.name === "string"
    && typeof value.type === "string"
    && typeof value.source === "string"
    && typeof value.version === "string"
    && value.status === "READY"
    && typeof value.required === "boolean"
    && isRecord(value.configuration)
    && Object.keys(value.configuration).length === 1
    && isRecord(value.configuration.compilerReady);
}

export function materializeCompilerReadySnapshot(
  snapshot: PstReleaseSnapshot,
): CompilerReadySnapshotResult {
  const errors: string[] = [];
  const components = new Map<string, PstReleaseComponentSnapshot>();
  let hasAuthoredComponents = false;
  const workflow = snapshot.workflow.map((step, index): WorkflowStep => {
    const path = `workflow[${index}].configuration`;
    if (!isRecord(step.configuration)
      || !isRecord(step.configuration.canonical)
      || !isRecord(step.configuration.compilerReady)) {
      errors.push(`${path} must contain canonical and compilerReady declarations.`);
      return step;
    }
    const authoredComponents = step.configuration.authoredComponents;
    if (authoredComponents !== undefined) {
      hasAuthoredComponents = true;
      if (!Array.isArray(authoredComponents)) {
        errors.push(`${path}.authoredComponents must be an array.`);
      } else {
        authoredComponents.forEach((component, componentIndex) => {
          if (!releaseComponent(component)) {
            errors.push(`${path}.authoredComponents[${componentIndex}] is not a complete typed component.`);
            return;
          }
          const existing = components.get(component.id);
          if (existing && pstCanonicalJsonHash(existing) !== pstCanonicalJsonHash(component)) {
            errors.push(`${path}.authoredComponents[${componentIndex}] conflicts with component ${component.id}.`);
            return;
          }
          components.set(component.id, component);
        });
      }
    }
    return {
      ...step,
      configuration: {
        canonical: step.configuration.canonical,
        compilerReady: step.configuration.compilerReady,
      },
    };
  });
  if (!hasAuthoredComponents) {
    snapshot.components.forEach((component, index) => {
      if (!releaseComponent(component)) {
        errors.push(`components[${index}] is not a complete typed component.`);
        return;
      }
      const existing = components.get(component.id);
      if (existing && pstCanonicalJsonHash(existing) !== pstCanonicalJsonHash(component)) {
        errors.push(`components[${index}] conflicts with component ${component.id}.`);
        return;
      }
      components.set(component.id, component);
    });
  }
  if (errors.length) return { status: "BLOCKED", errors };
  const { snapshotHash: _snapshotHash, ...base } = snapshot;
  const payload: Omit<PstReleaseSnapshot, "snapshotHash"> = {
    ...base,
    blueprint: { ...base.blueprint, workflow },
    workflow,
    factoryComponents: base.factoryComponents ?? base.components,
    components: [...components.values()].sort((left, right) => left.id.localeCompare(right.id)),
  };
  return {
    status: "READY",
    snapshot: { ...payload, snapshotHash: releaseSnapshotHash(payload) },
  };
}