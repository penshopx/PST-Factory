import {
  canonicalSourceFromRelease,
  compilePstV1,
  manufacturingIrFromCanonicalSource,
  prepareCompilerReadyIr,
  pstCompilerVersion,
  validateCanonicalSource,
  validateExecutablePstDefinitionV1,
  type ExecutablePstDefinitionV1,
  type PstReleaseSnapshot,
} from "@workspace/db/schema";
import { compileLegacyExecutableRelease } from "./legacy-executable-release";

type PublishedRelease = {
  id: string;
  projectId: string;
  version: string;
  createdAt: Date;
};

export type ExecutableReleaseResult =
  | {
      status: "COMPILED";
      definition: ExecutablePstDefinitionV1;
    }
  | {
      status: "BLOCKED";
      diagnostics: Array<{ code: string; path: string; message: string }>;
    };

export type ResolvedExecutableReleaseResult =
  | {
      status: "COMPILED";
      definition: ExecutablePstDefinitionV1;
      source: "PERSISTED" | "LEGACY_RECOMPILED";
    }
  | {
      status: "BLOCKED";
      diagnostics: Array<{ code: string; path: string; message: string }>;
    };

export function compileExecutableRelease(
  release: PublishedRelease,
  slug: string,
  snapshot: PstReleaseSnapshot,
): ExecutableReleaseResult {
  const legacy = compileLegacyExecutableRelease(release, slug, snapshot);
  if (legacy.status === "COMPILED") return legacy;
  if (legacy.status === "BLOCKED") return legacy;

  const canonical = canonicalSourceFromRelease({
    releaseId: release.id,
    projectId: release.projectId,
    slug,
    version: release.version,
    publishedAt: release.createdAt.toISOString(),
  }, snapshot);
  if (!canonical.ok) {
    return { status: "BLOCKED", diagnostics: canonical.errors };
  }

  const validation = validateCanonicalSource(canonical.value);
  if (validation.status === "BLOCKED") {
    return { status: "BLOCKED", diagnostics: validation.diagnostics };
  }

  const normalized = manufacturingIrFromCanonicalSource(canonical.value);
  if (!normalized.ok) {
    return { status: "BLOCKED", diagnostics: normalized.errors };
  }

  const ready = prepareCompilerReadyIr({
    source: canonical.value,
    ir: normalized.value,
    validation,
  });
  if (ready.status === "BLOCKED") {
    return { status: "BLOCKED", diagnostics: ready.errors };
  }

  const compiled = compilePstV1({
    compilerVersion: pstCompilerVersion,
    readyIr: ready.readyIr,
  });
  return compiled.status === "COMPILED"
    ? { status: "COMPILED", definition: compiled.definition }
    : { status: "BLOCKED", diagnostics: compiled.errors };
}

export function resolveExecutableRelease(
  release: PublishedRelease,
  slug: string,
  snapshot: PstReleaseSnapshot,
  persistedDefinition: unknown,
): ResolvedExecutableReleaseResult {
  if (persistedDefinition == null) {
    const legacy = compileExecutableRelease(release, slug, snapshot);
    return legacy.status === "COMPILED"
      ? { ...legacy, source: "LEGACY_RECOMPILED" }
      : legacy;
  }

  const validation = validateExecutablePstDefinitionV1(persistedDefinition);
  if (validation.status === "BLOCKED") {
    return { status: "BLOCKED", diagnostics: validation.errors };
  }
  const identity = validation.definition.identity;
  if (
    identity.releaseId !== release.id
    || identity.projectId !== release.projectId
    || identity.slug !== slug
    || identity.releaseVersion !== release.version
    || identity.snapshotHash !== snapshot.snapshotHash
  ) {
    return {
      status: "BLOCKED",
      diagnostics: [{
        code: "EXECUTABLE_IDENTITY_MISMATCH",
        path: "definition.identity",
        message: "Persisted executable identity does not match its release snapshot.",
      }],
    };
  }
  return {
    status: "COMPILED",
    definition: validation.definition,
    source: "PERSISTED",
  };
}