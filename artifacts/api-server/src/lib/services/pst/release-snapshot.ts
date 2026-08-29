import { createHash } from "node:crypto";
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

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)]),
  );
}

export function releaseSnapshotHash(snapshot: Omit<PstReleaseSnapshot, "snapshotHash">) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(snapshot)))
    .digest("hex");
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

const credentialKeySuffix =
  /(?:api_?key|access_?token|refresh_?token|bearer_?token|auth_?token|client_?secret|private_?key|secret_?key|connection_?(?:string|url|uri)|database_?(?:url|uri)|db_?(?:url|uri)|authorization|credentials?|password|secret|token)$/;

function isCredentialKey(key: string) {
  const normalized = key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[-\s]+/g, "_")
    .toLowerCase();
  return credentialKeySuffix.test(normalized);
}

function credentialPaths(value: unknown, path: string): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((child, index) => credentialPaths(child, `${path}[${index}]`));
  }
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, child]) => [
    ...(isCredentialKey(key) ? [`${path}.${key}`] : []),
    ...credentialPaths(child, `${path}.${key}`),
  ]);
}

export function resolveReleaseDeclarations(workflow: WorkflowStep[]) {
  const rules = resolvedReleaseRules(workflow);
  const providers = resolvedReleaseProviders(workflow);
  const credentialErrors = workflow.flatMap((step, index) =>
    credentialPaths(step.configuration, `workflow[${index}].configuration`)
      .map((path) => `${path} contains credential-like data.`),
  );
  return {
    rules: rules.values,
    providers: providers.values,
    errors: [...rules.errors, ...providers.errors, ...credentialErrors],
  };
}