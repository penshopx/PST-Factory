import {
  manufacturingIrFromCanonicalSource,
  pstCanonicalSourceContractVersion,
  pstCredentialConfigurationPaths,
  pstManufacturingIrVersion,
  type PstCanonicalSourceV1,
  type PstManufacturingIrV1,
  type PstManufacturingIrNodeV1,
  type PstNormalizationIssueV1,
  type PstStateReference,
} from "./pst-contract";

export const pstValidationDiagnosticCodes = [
  "INVALID_RELEASE",
  "SNAPSHOT_MISMATCH",
  "UNSUPPORTED_VERSION",
  "MISSING_DEPENDENCY",
  "INACTIVE_DEPENDENCY",
  "INVALID_WORKFLOW",
  "INVALID_DATA_CONTRACT",
  "UNSAFE_CONFIGURATION",
  "PUBLIC_FIELD_LEAK",
  "LEGACY_NORMALIZATION",
  "QUALITY_WARNING",
] as const;

export type PstValidationDiagnosticCode = (typeof pstValidationDiagnosticCodes)[number];

export type PstValidationDiagnosticV1 = {
  severity: "ERROR" | "WARNING";
  code: PstValidationDiagnosticCode;
  path: string;
  message: string;
  expected?: string;
  actual?: string;
};

export type PstValidationResultV1 =
  | {
      status: "VALIDATED";
      diagnostics: [];
      warnings: PstValidationDiagnosticV1[];
    }
  | {
      status: "BLOCKED";
      diagnostics: PstValidationDiagnosticV1[];
      warnings: PstValidationDiagnosticV1[];
    };

function diagnostic(
  code: PstValidationDiagnosticCode,
  path: string,
  message: string,
  extra: Pick<PstValidationDiagnosticV1, "expected" | "actual"> = {},
): PstValidationDiagnosticV1 {
  return { severity: "ERROR", code, path, message, ...extra };
}

function stateReference(value: unknown): value is PstStateReference {
  return typeof value === "string"
    && /^(?:context|answers|derived)\.[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value);
}

function uniqueIdDiagnostics(
  values: Array<{ id: string }>,
  path: string,
  code: PstValidationDiagnosticCode,
) {
  const diagnostics: PstValidationDiagnosticV1[] = [];
  const seen = new Map<string, number>();
  values.forEach((value, index) => {
    if (!value.id.trim()) {
      diagnostics.push(diagnostic(code, `${path}[${index}].id`, "ID must not be empty."));
      return;
    }
    const previous = seen.get(value.id);
    if (previous !== undefined) {
      diagnostics.push(diagnostic(
        code,
        `${path}[${index}].id`,
        `ID duplicates ${path}[${previous}].id.`,
      ));
    } else {
      seen.set(value.id, index);
    }
  });
  return diagnostics;
}

function normalizationDiagnostic(issue: PstNormalizationIssueV1): PstValidationDiagnosticV1 {
  const code: PstValidationDiagnosticCode =
    issue.code === "SNAPSHOT_MISMATCH"
      ? "SNAPSHOT_MISMATCH"
      : issue.code === "INVALID_STATE_REFERENCE"
        ? "INVALID_DATA_CONTRACT"
        : issue.code === "INVALID_TRANSITION" || issue.code === "AMBIGUOUS_STEP"
          ? "INVALID_WORKFLOW"
          : "INVALID_RELEASE";
  return diagnostic(code, issue.path, issue.message);
}

const executableConfigurationKeySuffix =
  /(?:java_?script|source_?code|script|sql|shell_?command|command|executable)$/;

function executableConfigurationPaths(value: unknown, path: string): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((child, index) =>
      executableConfigurationPaths(child, `${path}[${index}]`));
  }
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => {
    const normalized = key
      .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
      .replace(/[-\s]+/g, "_")
      .toLowerCase();
    return [
      ...(executableConfigurationKeySuffix.test(normalized) ? [`${path}.${key}`] : []),
      ...executableConfigurationPaths(child, `${path}.${key}`),
    ];
  });
}

function unsafeDiagnostics(values: Array<[string, unknown]>, boundary: string) {
  return values.flatMap(([path, value]) => [
    ...pstCredentialConfigurationPaths(value, path).map((unsafePath) =>
      diagnostic(
        "UNSAFE_CONFIGURATION",
        unsafePath,
        `Credential-like configuration cannot enter the ${boundary} boundary.`,
      )),
    ...executableConfigurationPaths(value, path).map((unsafePath) =>
      diagnostic(
        "UNSAFE_CONFIGURATION",
        unsafePath,
        `Executable configuration cannot enter the ${boundary} boundary.`,
      )),
  ]);
}

function unsafeConfigurationDiagnostics(source: PstCanonicalSourceV1) {
  const values: Array<[string, unknown]> = [
    ...source.workflow.map((step, index) => [
      `workflow[${index}].configuration`,
      step.configuration,
    ] as [string, unknown]),
    ...source.components.map((component, index) => [
      `components[${index}].configuration`,
      component.configuration,
    ] as [string, unknown]),
    ...source.providers.map((provider, index) => [
      `providers[${index}].configuration`,
      provider.configuration,
    ] as [string, unknown]),
    ...source.rules.flatMap((rule, index) => [
      [`rules[${index}].when`, rule.when],
      [`rules[${index}].then`, rule.then],
    ] as Array<[string, unknown]>),
  ];
  return unsafeDiagnostics(values, "Validator");
}

function unsafeIrConfigurationDiagnostics(ir: PstManufacturingIrV1) {
  const values: Array<[string, unknown]> = [
    ...ir.graph.nodes.map((node, index) => [
      `graph.nodes[${index}].config`,
      node.config,
    ] as [string, unknown]),
    ...ir.graph.nodes.map((node, index) => [
      `graph.nodes[${index}].next`,
      node.next,
    ] as [string, unknown]),
    ...ir.declarations.components.map((component, index) => [
      `declarations.components[${index}].configuration`,
      component.configuration,
    ] as [string, unknown]),
    ...ir.declarations.providers.map((provider, index) => [
      `declarations.providers[${index}].configuration`,
      provider.configuration,
    ] as [string, unknown]),
    ...ir.declarations.rules.flatMap((rule, index) => [
      [`declarations.rules[${index}].when`, rule.when],
      [`declarations.rules[${index}].then`, rule.then],
    ] as Array<[string, unknown]>),
  ];
  return unsafeDiagnostics(values, "Compiler");
}

type ResolvedDeclarations = {
  pattern?: PstCanonicalSourceV1["pattern"];
  recipe?: PstCanonicalSourceV1["recipe"];
  components: PstCanonicalSourceV1["components"];
  rules: PstCanonicalSourceV1["rules"];
  providers: PstCanonicalSourceV1["providers"];
};

function declarationReadinessDiagnostics(declarations: ResolvedDeclarations) {
  const diagnostics: PstValidationDiagnosticV1[] = [
    ...uniqueIdDiagnostics(declarations.components, "components", "INVALID_DATA_CONTRACT"),
    ...uniqueIdDiagnostics(declarations.rules, "rules", "INVALID_DATA_CONTRACT"),
    ...uniqueIdDiagnostics(declarations.providers, "providers", "INVALID_DATA_CONTRACT"),
  ];
  if (declarations.pattern
    && (!declarations.pattern.id.trim() || !declarations.pattern.version.trim())) {
    diagnostics.push(diagnostic(
      "MISSING_DEPENDENCY",
      "pattern",
      "Resolved Pattern must have an ID and version.",
    ));
  }
  if (declarations.recipe
    && (!declarations.recipe.id.trim() || !declarations.recipe.version.trim())) {
    diagnostics.push(diagnostic(
      "MISSING_DEPENDENCY",
      "recipe",
      "Resolved Recipe must have an ID and version.",
    ));
  }
  declarations.components.forEach((component, index) => {
    if (!component.version.trim() || component.status !== "READY") {
      diagnostics.push(diagnostic(
        "INACTIVE_DEPENDENCY",
        `components[${index}]`,
        "Every resolved component must have a version and READY status.",
      ));
    }
  });
  declarations.rules.forEach((rule, index) => {
    if (!rule.version.trim() || !rule.name.trim() || !rule.kind.trim()) {
      diagnostics.push(diagnostic(
        "MISSING_DEPENDENCY",
        `rules[${index}]`,
        "Resolved rule ID, version, name, and kind are required.",
      ));
    }
  });
  declarations.providers.forEach((provider, index) => {
    if (!provider.capability.trim() || !provider.mode.trim()) {
      diagnostics.push(diagnostic(
        "MISSING_DEPENDENCY",
        `providers[${index}]`,
        "Resolved provider ID, capability, and mode are required.",
      ));
    }
  });
  return diagnostics;
}

function nodeTransitionTargets(node: PstManufacturingIrNodeV1) {
  if (node.next.type === "step") return [node.next.target];
  if (node.next.type === "conditional") {
    return [
      ...node.next.branches.map(({ target }) => target),
      ...(node.next.defaultTarget ? [node.next.defaultTarget] : []),
    ];
  }
  return [];
}

function graphDiagnostics(ir: PstManufacturingIrV1) {
  const diagnostics: PstValidationDiagnosticV1[] = [];
  const { nodes } = ir.graph;
  const indexById = new Map(nodes.map((node, index) => [node.id, index]));
  diagnostics.push(...uniqueIdDiagnostics(nodes, "graph.nodes", "INVALID_WORKFLOW"));
  if (!indexById.has(ir.graph.entry)) {
    diagnostics.push(diagnostic(
      "INVALID_WORKFLOW",
      "graph.entry",
      "Graph entry must reference an existing node.",
    ));
  }

  const writes = new Map<string, string>();
  const available = new Set<string>();
  nodes.forEach((node, index) => {
    node.reads.forEach((read, readIndex) => {
      if (!stateReference(read)) {
        diagnostics.push(diagnostic(
          "INVALID_DATA_CONTRACT",
          `graph.nodes[${index}].reads[${readIndex}]`,
          "Read must use an explicit state namespace.",
        ));
      } else if (!read.startsWith("context.") && !available.has(read)) {
        diagnostics.push(diagnostic(
          "MISSING_DEPENDENCY",
          `graph.nodes[${index}].reads[${readIndex}]`,
          `Read "${read}" is not available from context or an earlier write.`,
        ));
      }
    });
    node.writes.forEach((write, writeIndex) => {
      if (!stateReference(write)) {
        diagnostics.push(diagnostic(
          "INVALID_DATA_CONTRACT",
          `graph.nodes[${index}].writes[${writeIndex}]`,
          "Write must use an explicit state namespace.",
        ));
        return;
      }
      const previousOwner = writes.get(write);
      if (previousOwner) {
        diagnostics.push(diagnostic(
          "INVALID_DATA_CONTRACT",
          `graph.nodes[${index}].writes[${writeIndex}]`,
          `Write "${write}" already belongs to node "${previousOwner}".`,
        ));
      } else {
        writes.set(write, node.id);
        available.add(write);
      }
    });
    node.dependsOn.forEach((dependency, dependencyIndex) => {
      const dependencyNodeIndex = indexById.get(dependency);
      if (dependencyNodeIndex === undefined) {
        diagnostics.push(diagnostic(
          "MISSING_DEPENDENCY",
          `graph.nodes[${index}].dependsOn[${dependencyIndex}]`,
          `Dependency "${dependency}" does not reference an existing node.`,
        ));
      } else if (dependencyNodeIndex >= index) {
        diagnostics.push(diagnostic(
          "INVALID_WORKFLOW",
          `graph.nodes[${index}].dependsOn[${dependencyIndex}]`,
          "Dependencies must point to an earlier node.",
        ));
      }
    });
    if (node.next.type === "conditional" && !node.next.defaultTarget) {
      diagnostics.push(diagnostic(
        "INVALID_WORKFLOW",
        `graph.nodes[${index}].next`,
        "Conditional transitions require an explicit safe default target.",
      ));
    }
    nodeTransitionTargets(node).forEach((target) => {
      if (!indexById.has(target)) {
        diagnostics.push(diagnostic(
          "MISSING_DEPENDENCY",
          `graph.nodes[${index}].next`,
          `Transition target "${target}" does not reference an existing node.`,
        ));
      }
    });
  });

  if (nodes.length === 0) {
    diagnostics.push(diagnostic("INVALID_WORKFLOW", "graph.nodes", "Graph must contain at least one node."));
    return diagnostics;
  }

  const reachable = new Set<string>();
  const visiting = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) {
      diagnostics.push(diagnostic(
        "INVALID_WORKFLOW",
        "graph",
        `Graph contains a cycle through node "${id}" without a loop contract.`,
      ));
      return;
    }
    if (reachable.has(id)) return;
    const node = nodes[indexById.get(id) ?? -1];
    if (!node) return;
    visiting.add(id);
    reachable.add(id);
    nodeTransitionTargets(node).forEach(visit);
    visiting.delete(id);
  };
  if (indexById.has(ir.graph.entry)) visit(ir.graph.entry);
  nodes.forEach((node, index) => {
    if (!reachable.has(node.id)) {
      diagnostics.push(diagnostic(
        "INVALID_WORKFLOW",
        `graph.nodes[${index}]`,
        `Node "${node.id}" is unreachable from graph.entry.`,
      ));
    }
  });
  if (!nodes.some((node) =>
    reachable.has(node.id)
    && node.kind === "OUTCOME"
    && node.next.type === "complete")) {
    diagnostics.push(diagnostic(
      "INVALID_WORKFLOW",
      "graph",
      "Graph must have at least one reachable OUTCOME with a complete transition.",
    ));
  }
  return diagnostics;
}

function manufacturingIrDiagnostics(
  ir: PstManufacturingIrV1,
  includeUnsafeConfiguration: boolean,
) {
  const diagnostics: PstValidationDiagnosticV1[] = [];
  if (ir.irVersion !== pstManufacturingIrVersion) {
    diagnostics.push(diagnostic(
      "UNSUPPORTED_VERSION",
      "irVersion",
      "Manufacturing IR version is not supported.",
      { expected: pstManufacturingIrVersion, actual: ir.irVersion },
    ));
  }
  if (!ir.source.releaseId.trim() || !ir.source.projectId.trim() || !ir.source.releaseVersion.trim()) {
    diagnostics.push(diagnostic(
      "INVALID_RELEASE",
      "source",
      "IR source identity must be complete.",
    ));
  }
  if (!/^[a-f0-9]{64}$/.test(ir.source.snapshotHash)) {
    diagnostics.push(diagnostic(
      "SNAPSHOT_MISMATCH",
      "source.snapshotHash",
      "IR source hash must be a canonical SHA-256 digest.",
    ));
  }
  diagnostics.push(...graphDiagnostics(ir));
  diagnostics.push(...declarationReadinessDiagnostics(ir.declarations));
  if (includeUnsafeConfiguration) {
    diagnostics.push(...unsafeIrConfigurationDiagnostics(ir));
  }
  return diagnostics;
}

export function validateManufacturingIr(
  ir: PstManufacturingIrV1,
): PstValidationResultV1 {
  const diagnostics = manufacturingIrDiagnostics(ir, true);
  const status = diagnostics.length ? "BLOCKED" : "VALIDATED";
  return status === "BLOCKED"
    ? { status, diagnostics, warnings: [] }
    : { status, diagnostics: [], warnings: [] };
}

export function validateCanonicalSource(
  source: PstCanonicalSourceV1,
): PstValidationResultV1 {
  const diagnostics: PstValidationDiagnosticV1[] = [];
  if (source.contractVersion !== pstCanonicalSourceContractVersion) {
    diagnostics.push(diagnostic(
      "UNSUPPORTED_VERSION",
      "contractVersion",
      "Canonical source contract version is not supported.",
      { expected: pstCanonicalSourceContractVersion, actual: source.contractVersion },
    ));
  }
  const { release } = source;
  if (!release.releaseId.trim() || !release.projectId.trim() || !release.slug.trim()
    || !release.version.trim()) {
    diagnostics.push(diagnostic(
      "INVALID_RELEASE",
      "release",
      "Release identity is required.",
    ));
  }
  const publishedAt = Date.parse(release.publishedAt);
  if (!Number.isFinite(publishedAt)
    || new Date(publishedAt).toISOString() !== release.publishedAt) {
    diagnostics.push(diagnostic(
      "INVALID_RELEASE",
      "release.publishedAt",
      "Release publishedAt must be a canonical ISO-8601 UTC timestamp.",
    ));
  }
  if (release.projectId !== source.blueprint.projectId) {
    diagnostics.push(diagnostic(
      "SNAPSHOT_MISMATCH",
      "blueprint.projectId",
      "Blueprint projectId must match release projectId.",
    ));
  }
  if (release.version !== source.blueprint.version) {
    diagnostics.push(diagnostic(
      "SNAPSHOT_MISMATCH",
      "blueprint.version",
      "Blueprint version must match release version.",
      { expected: release.version, actual: source.blueprint.version },
    ));
  }
  if (release.snapshotHashAlgorithm !== "sha256-canonical-json.v1"
    || release.sourceSchemaVersion !== "pst-release-snapshot.v1"
    || !/^[a-f0-9]{64}$/.test(release.snapshotHash)) {
    diagnostics.push(diagnostic(
      "SNAPSHOT_MISMATCH",
      "release",
      "Canonical source release hash and source schema metadata are invalid.",
    ));
  }
  diagnostics.push(...unsafeConfigurationDiagnostics(source));

  const normalized = manufacturingIrFromCanonicalSource(source);
  if (!normalized.ok) {
    diagnostics.push(...normalized.errors.map(normalizationDiagnostic));
    diagnostics.push(...declarationReadinessDiagnostics({
      pattern: source.pattern,
      recipe: source.recipe,
      components: source.components,
      rules: source.rules,
      providers: source.providers,
    }));
  } else {
    diagnostics.push(...manufacturingIrDiagnostics(normalized.value, false));
  }
  const status = diagnostics.length ? "BLOCKED" : "VALIDATED";
  return status === "BLOCKED"
    ? { status, diagnostics, warnings: [] }
    : { status, diagnostics: [], warnings: [] };
}