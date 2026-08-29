import {
  pstCanonicalJsonHash,
  pstCredentialConfigurationPaths,
} from "@workspace/db/schema";
import type {
  PstReleaseProviderSnapshot,
  PstReleaseRuleSnapshot,
  PstReleaseSnapshot,
  WorkflowStep,
} from "@workspace/db";

export const releaseSnapshotHashAlgorithm = "sha256-canonical-json.v1" as const;

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
    && typeof value.version === "string"
    && typeof value.name === "string"
    && typeof value.kind === "string"
    && isRecord(value.when)
    && Array.isArray(value.then)
    && value.then.every(isRecord);
}

function isReleaseProvider(value: unknown): value is PstReleaseProviderSnapshot {
  if (!isRecord(value)) return false;
  return typeof value.id === "string"
    && typeof value.capability === "string"
    && typeof value.mode === "string"
    && (value.configuration === undefined || isRecord(value.configuration));
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