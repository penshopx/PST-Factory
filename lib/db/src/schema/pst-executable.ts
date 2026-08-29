import type {
  PstCanonicalPatternV1,
  PstCanonicalRecipeV1,
  PstStateReference,
} from "./pst-contract";

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
      fields: PstExecutableContextFieldV1[];
      sessionPersistence: "ephemeral" | "customer_session";
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

type PstExecutableComponentIdentityV1 = {
  id: string;
  assetId: string;
  name: string;
  version: string;
};

export type PstExecutableQuestionV1 = {
  id: string;
  label: string;
  type: PstExecutableValueType;
  required: boolean;
  options?: Array<{ value: string; label: string }>;
};

export type PstExecutableComponentV1 =
  | PstExecutableComponentIdentityV1 & {
      capability: "question-schema";
      definition: { questions: PstExecutableQuestionV1[] };
    }
  | PstExecutableComponentIdentityV1 & {
      capability: "scoring-scale";
      definition: {
        minimum: number;
        maximum: number;
        bands: Array<{ minimum: number; label: string }>;
      };
    }
  | PstExecutableComponentIdentityV1 & {
      capability: "analysis-template";
      definition: {
        template: string;
        outputFields: PstStateReference[];
      };
    }
  | PstExecutableComponentIdentityV1 & {
      capability: "recommendation-strategy";
      definition: {
        template: string;
        outputFields: PstStateReference[];
      };
    }
  | PstExecutableComponentIdentityV1 & {
      capability: "action-template";
      definition: {
        items: Array<{ id: string; title: string; description: string }>;
      };
    }
  | PstExecutableComponentIdentityV1 & {
      capability: "outcome-mapping";
      definition: { outputFields: PstStateReference[] };
    };

export type PstExecutableProviderV1 = {
  id: string;
  capability: string;
  mode: "assistive";
};

export type PstExecutableLiteralV1 =
  | string
  | number
  | boolean
  | null
  | string[]
  | number[]
  | boolean[];

export type PstExecutablePredicateV1 = {
  field: PstStateReference;
  operator:
    | "equals"
    | "not_equals"
    | "contains"
    | "in"
    | "greater_than"
    | "greater_than_or_equal"
    | "less_than"
    | "less_than_or_equal"
    | "exists";
  value?: PstExecutableLiteralV1;
};

export type PstExecutableRuleEffectV1 =
  | { type: "set"; field: PstStateReference; value: PstExecutableLiteralV1 }
  | { type: "add-score"; scaleRef: string; value: number }
  | { type: "emit"; event: string }
  | { type: "goto"; stepId: string };

export type PstExecutableRuleV1 = {
  id: string;
  version: string;
  name: string;
  kind: "RULE" | "SCORING";
  when: {
    all?: PstExecutablePredicateV1[];
    any?: PstExecutablePredicateV1[];
  };
  then: PstExecutableRuleEffectV1[];
};

export type PstExecutableDeclarationsV1 = {
  pattern?: PstCanonicalPatternV1;
  recipe?: PstCanonicalRecipeV1;
  components: PstExecutableComponentV1[];
  rules: PstExecutableRuleV1[];
  providers: PstExecutableProviderV1[];
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