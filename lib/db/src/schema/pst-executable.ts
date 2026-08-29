import type {
  PstCanonicalComponentV1,
  PstCanonicalPatternV1,
  PstCanonicalProviderV1,
  PstCanonicalRecipeV1,
  PstManufacturingIrV1,
  PstStateReference,
} from "./pst-contract";
import type { PstReleaseRuleSnapshot } from "./pst";
import type { PstValidationResultV1 } from "./pst-validator";

export const pstExecutableRuntimeVersion = "pst-runtime.v1" as const;
export const pstCompilerName = "pst-compiler" as const;

export type PstExecutableStepKind =
  | "input"
  | "answer"
  | "persist"
  | "rules"
  | "scoring"
  | "analysis"
  | "recommendation"
  | "action"
  | "outcome";

export type PstExecutableValueType =
  | "string"
  | "number"
  | "boolean"
  | "choice"
  | "date"
  | "json";

export type PstExecutableContextFieldV1 = {
  key: PstStateReference;
  label: string;
  type: PstExecutableValueType;
  required: boolean;
  sensitive?: boolean;
  options?: Array<{ value: string; label: string }>;
};

export type PstExecutableStateContractV1 = {
  contextFields: PstExecutableContextFieldV1[];
  sessionPersistence: "ephemeral" | "customer_session";
};

export type PstExecutableOperationV1 =
  | {
      type: "collect-context";
      fields: PstStateReference[];
    }
  | {
      type: "collect-answers";
      schemaRef: string;
      answerFields: PstStateReference[];
    }
  | {
      type: "persist";
      target: PstStateReference;
      retention: "ephemeral" | "customer_session";
    }
  | {
      type: "evaluate-rules";
      ruleIds: string[];
    }
  | {
      type: "score";
      scaleRef: string;
      output: PstStateReference;
    }
  | {
      type: "analyze";
      templateRef: string;
      output: PstStateReference;
      providerId?: string;
    }
  | {
      type: "recommend";
      strategyRef: string;
      output: PstStateReference;
      providerId?: string;
    }
  | {
      type: "action";
      actionRef: string;
      output: PstStateReference;
    }
  | {
      type: "outcome";
      outcomeId: string;
      outputRefs: PstStateReference[];
    };

export type PstExecutableNextV1 =
  | { type: "step"; stepId: string }
  | {
      type: "conditional";
      branches: Array<{ whenRuleId: string; stepId: string }>;
      defaultStepId: string;
    }
  | { type: "complete"; outcomeId: string };

export type PstExecutableStepV1 = {
  id: string;
  kind: PstExecutableStepKind;
  title: string;
  description: string;
  reads: PstStateReference[];
  writes: PstStateReference[];
  dependsOn: string[];
  operation: PstExecutableOperationV1;
  next: PstExecutableNextV1;
};

export type PstExecutableIdentityV1 = {
  releaseId: string;
  projectId: string;
  slug: string;
  releaseVersion: string;
  publishedAt: string;
  snapshotHash: string;
  sourceSchemaVersion: "pst-release-snapshot.v1";
  irVersion: "pst-manufacturing-ir.v1";
};

export type PstExecutableProductV1 = {
  name: string;
  description: string;
  problem: string;
  targetUser: string;
  desiredOutcome: string;
  journey: string[];
  expectedOutput: string[];
};

export type PstExecutableDeclarationsV1 = {
  pattern?: PstCanonicalPatternV1;
  recipe?: PstCanonicalRecipeV1;
  components: PstCanonicalComponentV1[];
  rules: PstReleaseRuleSnapshot[];
  providers: PstCanonicalProviderV1[];
};

export type ExecutablePstDefinitionV1 = {
  runtimeVersion: typeof pstExecutableRuntimeVersion;
  compiler: {
    name: typeof pstCompilerName;
    version: string;
  };
  identity: PstExecutableIdentityV1;
  product: PstExecutableProductV1;
  state: PstExecutableStateContractV1;
  declarations: PstExecutableDeclarationsV1;
  steps: PstExecutableStepV1[];
  entryStepId: string;
  outcomeStepIds: string[];
};

export type PstCompilerInputV1 = {
  compilerVersion: string;
  ir: PstManufacturingIrV1;
  validation: Extract<PstValidationResultV1, { status: "VALIDATED" }>;
};

export type PstCompileDiagnosticV1 = {
  severity: "ERROR" | "WARNING";
  code: string;
  path: string;
  message: string;
  dependency?: string;
  expected?: string;
  actual?: string;
};

export type PstCompileResultV1 =
  | {
      status: "COMPILED";
      definition: ExecutablePstDefinitionV1;
      warnings: PstCompileDiagnosticV1[];
    }
  | {
      status: "BLOCKED";
      errors: PstCompileDiagnosticV1[];
      warnings: PstCompileDiagnosticV1[];
    };