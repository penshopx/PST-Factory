# PST Compiler Contract v1

Status: **specification only**. This document defines the boundary for a future
Compiler; it does not implement a compiler, a runtime engine, or a new product
branch.

## 1. Purpose and non-goals

The PST Compiler translates one approved, immutable PST release into a
configuration-only executable contract. The customer workspace consumes that
contract to render a guided journey and execute its configured transitions,
answers, persistence, rules, analysis, recommendations, actions, and outcome.

The Compiler MUST:

- produce the same output for the same input snapshot and compiler version;
- use Blueprint and library configuration as data, not product-specific code
  branches;
- preserve release identity and the source references needed for inspection;
- reject an incomplete or unsafe release before a customer workspace can run it;
- keep private factory metadata out of the public runtime payload.

The v1 contract explicitly does **not** include marketplace behavior, billing,
Gustafta integration, Factory Learning, autonomous publishing, or arbitrary
code execution. AI may be represented as an assistive provider requirement, but
the Compiler does not call a provider or silently publish a release.

## 2. Terms and boundary

| Term | Meaning | Mutability |
| --- | --- | --- |
| Factory draft | The editable project, Blueprint, library selections, QA runs, and working configuration in Factory. | Mutable |
| Release snapshot | An atomic copy of the approved project, Blueprint, resolved workflow, and component references created at publish time. | Immutable |
| Compiler | A deterministic translation step from one release snapshot and its resolved library definitions into an executable contract. | Stateless |
| Customer runtime | The authenticated or public workspace that executes the compiled contract for a customer session. | Session state is mutable; release contract is not |

The Compiler MUST consume a release snapshot, never live draft rows. A draft
edit, library edit, restore, or later QA run MUST NOT change an already compiled
customer journey. A new published release produces a new compilation identity.

The release snapshot is the Compiler's complete source boundary. If the current
persistence shape does not yet carry a selected Pattern, Recipe, rule, provider
requirement, or the full component configuration, the release assembler must
version and embed that resolved data before compilation. The Compiler MUST NOT
fill that gap by querying mutable Factory tables at runtime.

The public customer response is an allowlisted projection of the executable
contract. It MUST NOT expose factory ownership, membership, QA internals,
library usage, source identifiers that are not needed by the runtime, provider
credentials, or arbitrary step configuration.

## 3. Compiler input

The conceptual input is the following versioned envelope. Field names are
normative for the contract even if the persistence layer stores some values in
JSONB or relational columns.

```ts
type PstCompilerInput = {
  contractVersion: "pst-compiler.v1";
  compilerVersion: string;
  release: PstReleaseMetadata;
  project: PstProjectDefinition;
  blueprint: PstBlueprintDefinition;
  workflow: PstWorkflowStep[];
  pattern?: PstPatternDefinition;
  recipe?: PstRecipeDefinition;
  components: PstComponentDefinition[];
  rules: PstRuleDefinition[];
  providers?: PstProviderRequirement[];
};
```

### 3.1 Release metadata

```ts
type PstReleaseMetadata = {
  releaseId: string;
  projectId: string;
  slug: string;
  version: string;
  publishedAt: string; // ISO-8601 UTC
  snapshotHash: string;
  sourceSchemaVersion: string;
};
```

`releaseId`, `projectId`, `slug`, and `version` identify the customer-facing
release. `snapshotHash` identifies the exact source payload used by the
Compiler. `compilerVersion` identifies the translation implementation and
MUST be included in compiler diagnostics and runtime metadata. The release
version and compiler version are independent: a new compiler can recompile an
unchanged release, while a new release can use the same compiler.

### 3.2 Project and Blueprint

The project definition contains the customer-safe product promise:

```ts
type PstProjectDefinition = {
  name: string;
  description: string;
  domain: string;
  family: string;
  series: string;
  problemStatement: string;
  targetUser: string;
  desiredOutcome: string;
  productDna: {
    problem: string;
    user: string;
    journey: string[];
    components: string[];
    intelligence: string;
    outcome: string;
  };
};

type PstBlueprintDefinition = {
  id: string;
  projectId: string;
  version: string;
  problem: string;
  targetUser: string;
  desiredOutcome: string;
  problemType: string;
  journey: string[];
  knowledgeRequirements: string[];
  componentRequirements: string[];
  aiRequirements: string[];
  expectedOutput: string[];
  actionPlan: string[];
  nextStep: string;
};
```

The project and Blueprint IDs MUST agree with `release.projectId`; the
Blueprint's problem, target user, desired outcome, journey, and expected output
are the source of truth for the compiled product promise.

### 3.3 Workflow

The workflow is a directed graph. Every step has a stable ID, a semantic type,
declared data inputs and outputs, dependencies, a transition target, and
optional configuration.

```ts
type PstWorkflowStep = {
  id: string;
  type:
    | "INPUT"
    | "ANSWER"
    | "PERSIST"
    | "RULES"
    | "SCORING"
    | "ANALYSIS"
    | "RECOMMENDATION"
    | "ACTION"
    | "OUTCOME"
    | "STEP"
    | string;
  title: string;
  description: string;
  inputs: string[];
  outputs: string[];
  dependencies: string[];
  nextStep: string;
  configuration?: Record<string, unknown>;
};
```

The current persisted `WorkflowStep` shape is the minimum source shape. The
Compiler normalizes legacy `STEP`, `OUTPUT`, and other known aliases into the
runtime kinds above. Unknown types are an error unless a registered contract
extension explicitly declares their input/output and execution semantics.

`configuration` is declarative data only. It may select a question schema,
persisted field, rule set, scoring scale, analysis template, recommendation
strategy, action template, or outcome mapping. It MUST NOT contain executable
JavaScript, SQL, provider credentials, or an instruction to bypass validation
or approval.

### 3.4 Pattern and Recipe

Pattern and Recipe are optional reusable library inputs, resolved into the
snapshot rather than looked up by the customer runtime.

```ts
type PstPatternDefinition = {
  id: string;
  name: string;
  version?: string;
  description?: string;
  steps: string[];
};

type PstRecipeDefinition = {
  id: string;
  name: string;
  version?: string;
  description?: string;
  components: string[];
};
```

For the current library model:

- a Pattern may provide the workflow/journey structure;
- a Recipe may provide component requirements;
- Blueprint values remain the fallback when the corresponding library input is
  absent;
- a Pattern and Recipe selected by the project MUST be included in the
  snapshot with their resolved versions;
- the same reference MUST NOT silently resolve to a different definition during
  compilation.

Pattern and Recipe are composition inputs, not product implementations. A new
PST variant should add or select configuration and reusable library records,
not add a `switch` or renderer branch named after that product.

The current `PstReleaseSnapshot` persistence type contains project, Blueprint,
workflow, and component snapshots. Pattern/Recipe definitions and rule/provider
configuration are not yet first-class fields in that type. That is a
source-contract dependency for the future release assembler: until those values
are included in a versioned snapshot, a Compiler input that needs them is
`MISSING_DEPENDENCY` and must be blocked rather than resolved from live rows.

### 3.5 Components

Components are resolved reusable assets and their project-level bindings.

```ts
type PstComponentDefinition = {
  id: string;
  assetId: string;
  name: string;
  type: string;
  source: string;
  version?: string;
  status: "READY" | "MISSING" | string;
  required: boolean;
  configuration?: Record<string, unknown>;
};
```

Every requirement in `blueprint.componentRequirements` (or the selected
Recipe's `components`) MUST resolve to an active, compatible component. The
runtime receives the resolved component capability/configuration it needs, not
an instruction to query the mutable Factory library.

### 3.6 Rules, scoring, and provider requirements

Rules are optional in the current database schema but are part of the Compiler
contract so the workflow does not need product-specific code as it grows.

```ts
type PstRuleDefinition = {
  id: string;
  version: string;
  name: string;
  kind: "RULE" | "SCORING" | string;
  when: {
    all?: PstPredicate[];
    any?: PstPredicate[];
  };
  then: Array<{
    set?: Record<string, unknown>;
    addScore?: { scale: string; value: number };
    emit?: string;
    goto?: string;
  }>;
};

type PstPredicate = {
  field: string;
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
  value?: unknown;
};

type PstProviderRequirement = {
  id: string;
  capability: "analysis" | "recommendation" | "other";
  mode: "assistive";
  configuration?: Record<string, unknown>;
};
```

Rule predicates and effects are data and must be evaluated by the future
runtime's allowlisted evaluator. The v1 Compiler does not invent rules from
natural-language fields. If a Blueprint requires rules, scoring, analysis, or
recommendation behavior for which no declarative definition exists, compilation
fails with a missing-dependency error rather than guessing.

## 4. Executable output

The output is a complete, self-contained runtime contract. It is not the raw
factory aggregate and does not require a database lookup to discover the
journey.

```ts
type PstExecutableRuntime = {
  contractVersion: "pst-runtime.v1";
  compiler: {
    name: "pst-compiler";
    version: string;
  };
  release: {
    releaseId: string;
    projectId: string;
    slug: string;
    version: string;
    publishedAt: string;
    snapshotHash: string;
  };
  product: {
    name: string;
    description: string;
    problem: string;
    targetUser: string;
    desiredOutcome: string;
    journey: string[];
    expectedOutput: string[];
  };
  context: PstContextContract;
  components: PstRuntimeComponent[];
  rules: PstRuntimeRule[];
  steps: PstExecutableStep[];
  entryStepId: string;
  outcomeStepIds: string[];
};
```

The output MUST contain all data needed to validate and execute the release.
It MUST be serializable JSON, deterministic, and safe to cache by
`releaseId + release.version + compiler.version + snapshotHash`. It MUST NOT
contain mutable draft timestamps as execution inputs, internal ownership data,
QA result details, or secrets.

### 4.1 Runtime context and state

```ts
type PstContextContract = {
  fields: Array<{
    key: string;
    label: string;
    type: "string" | "number" | "boolean" | "choice" | "date" | "json";
    required: boolean;
    sensitive?: boolean;
    options?: Array<{ value: string; label: string }>;
  }>;
  sessionPersistence: "ephemeral" | "customer_session";
};

type PstRuntimeComponent = {
  id: string;
  type: string;
  name: string;
  version?: string;
  configuration: Record<string, unknown>;
};

type PstRuntimeRule = {
  id: string;
  version: string;
  kind: "rule" | "scoring" | string;
  definition: Record<string, unknown>;
};
```

Runtime state has three conceptual namespaces:

1. `context`: user-provided starting context and profile fields;
2. `answers`: explicit responses collected by `INPUT`/`ANSWER` steps;
3. `derived`: scores, analysis, recommendations, actions, and outcome values.

Only declared outputs may be written. Persist operations must name their
destination and retention class. Sensitive fields are never returned in public
step metadata and must follow the runtime's persistence policy.

### 4.2 Executable steps and transitions

```ts
type PstExecutableStep = {
  id: string;
  kind:
    | "input"
    | "answer"
    | "persist"
    | "rules"
    | "scoring"
    | "analysis"
    | "recommendation"
    | "action"
    | "outcome";
  title: string;
  description: string;
  reads: string[];
  writes: string[];
  dependsOn: string[];
  next:
    | { type: "step"; stepId: string }
    | { type: "conditional"; branches: Array<{ whenRuleId: string; stepId: string }> }
    | { type: "complete"; outcomeId: string };
  config: Record<string, unknown>;
};
```

The runtime MUST execute only declared `reads`, `writes`, and transitions.
`dependsOn` is retained as an integrity and scheduling constraint; `next` is
the runtime transition contract. A step may not jump to an undeclared step or
write an undeclared state key.

`PstRuntimeRule` is a normalized, self-contained copy of the input rule with
stable IDs and versions. Components referenced by `config` are similarly
resolved into `components`. The runtime MUST reject a contract that contains
an unresolved reference rather than falling back to a default product behavior.

## 5. Blueprint-to-runtime mapping

The Compiler maps semantic intent to runtime behavior as follows.

| Blueprint/source | Compiler responsibility | Runtime result |
| --- | --- | --- |
| `problem`, `targetUser`, Product DNA user/problem | Copy and normalize the product promise. | `product.problem`, `product.targetUser`, and context labels used by the workspace. |
| `journey`, Pattern steps, workflow order | Resolve the graph and preserve configured order/branches. | `steps`, `entryStepId`, transitions, and visible journey labels. |
| `workflow` step type `INPUT` | Bind a declared context field or initial input. | `kind: "input"` with `reads`/`writes` and validation config. |
| `workflow` step type `ANSWER` or assessment/question configuration | Bind question schema and answer destination. | `kind: "answer"` writing `answers.<key>`. |
| `workflow` step type `PERSIST` | Validate an explicit storage target and retention policy. | `kind: "persist"` writing only approved context/answer/derived keys. |
| `rules` and `workflow` type `RULES` | Normalize predicates, effects, rule versions, and branch targets. | `kind: "rules"` plus conditional transitions. |
| `rules` and `workflow` type `SCORING` | Bind declared scales and numeric effects. | `kind: "scoring"` writing a derived score. |
| `workflow` type `ANALYSIS`, AI requirements | Bind an analysis template/provider capability in assistive mode. | `kind: "analysis"` with deterministic config or an explicit provider requirement. |
| `workflow` type `RECOMMENDATION`, expected output | Bind recommendation inputs and output shape. | `kind: "recommendation"` writing a recommendation for the customer. |
| `actionPlan`, workflow type `ACTION` | Bind configured action template and required inputs. | `kind: "action"` writing a concrete next action/plan. |
| `desiredOutcome`, `expectedOutput`, `nextStep`, workflow type `OUTPUT`/`OUTCOME` | Normalize completion criteria and final presentation. | `kind: "outcome"` and `outcomeStepIds`, with no hidden side effects. |
| `componentRequirements`, Recipe components, project components | Resolve active compatible assets and snapshot their versions/config. | `components` and step component references. |
| release metadata | Preserve release identity and source hash. | `compiler` and `release` metadata used for cache, audit, and support. |

The mapping is semantic, not positional. A customer workspace MUST render a
configured assessment differently from a configured vendor decision because the
input schema, rule/scoring config, and output mapping differ—not because the
renderer contains an assessment-specific or vendor-specific branch.

## 6. Compilation pipeline and invariants

The future implementation MUST perform these logical phases in order:

1. **Envelope check** — verify contract and source schema versions, required
   release metadata, and snapshot identity.
2. **Reference resolution** — resolve the Pattern, Recipe, components, rules,
   and provider capability declarations contained in the snapshot.
3. **Graph normalization** — normalize step types, IDs, reads/writes, entry,
   terminal outcomes, and transitions.
4. **Semantic mapping** — create the runtime context, components, rules, and
   executable steps from declarative configuration.
5. **Safety validation** — verify all references, writes, branches, and
   persistence targets; reject executable code or secret-like values.
6. **Deterministic emission** — emit the runtime contract and diagnostics with
   stable ordering and no generated random IDs.

The Compiler MUST NOT mutate the snapshot, project, Blueprint, or library rows.
It MUST NOT make network calls, execute provider calls, or create customer
records as a side effect of compilation.

## 7. Validation and diagnostics

Compilation succeeds only when there are no `ERROR` diagnostics. Warnings may
be emitted for non-blocking quality issues, but they remain visible to Factory
operators and are included in compile metadata, not the public customer
payload.

```ts
type PstCompileDiagnostic = {
  severity: "ERROR" | "WARNING";
  code: string;
  path: string;
  message: string;
  dependency?: string;
  expected?: string;
  actual?: string;
};

type PstCompileResult =
  | {
      status: "COMPILED";
      runtime: PstExecutableRuntime;
      warnings: PstCompileDiagnostic[];
    }
  | {
      status: "BLOCKED";
      runtime?: never;
      errors: PstCompileDiagnostic[];
      warnings: PstCompileDiagnostic[];
    };
```

At minimum, validation MUST cover:

- release is approved/published and project and publication statuses are both
  `PUBLISHED`;
- release snapshot is present, internally consistent, and matches its
  `projectId`, Blueprint `projectId`, and release metadata;
- release, Blueprint, workflow, component, Pattern, Recipe, rule, and runtime
  contract versions are parseable and supported;
- workflow IDs are unique, the entry step exists, dependencies exist, and
  `next` targets exist or terminate explicitly;
- every declared input/read is available from context or an earlier output;
- every declared output/write has one owner and a valid namespace;
- every required component and referenced rule/provider exists, is active, and
  is compatible with the requested capability;
- every required Blueprint component requirement is resolved;
- at least one terminal outcome exists and each reachable path terminates;
- conditional branches are exhaustive or have an explicit safe default;
- persistence destinations, retention classes, and sensitive-field handling are
  explicit;
- configuration contains data only and no executable source, credentials, or
  unsupported opaque references;
- output is deterministic and contains no accidental factory-only fields.

### 7.1 Error categories

Implementations SHOULD use stable diagnostic codes so Factory and acceptance
tests can make decisions without matching prose:

| Code | Meaning | Result |
| --- | --- | --- |
| `INVALID_RELEASE` | Release metadata or publication gate is invalid. | Block |
| `SNAPSHOT_MISMATCH` | Snapshot identity or project/Blueprint IDs disagree. | Block |
| `UNSUPPORTED_VERSION` | Source or target contract version is unsupported. | Block |
| `MISSING_DEPENDENCY` | Required Pattern, Recipe, component, rule, provider capability, or output mapping is absent. | Block |
| `INACTIVE_DEPENDENCY` | A required referenced asset or rule is not active/compatible. | Block |
| `INVALID_WORKFLOW` | Duplicate IDs, missing graph target, cycle without a declared loop contract, or no terminal outcome. | Block |
| `INVALID_DATA_CONTRACT` | Read/write, input, output, branch, or persistence declaration is inconsistent. | Block |
| `UNSAFE_CONFIGURATION` | Executable code, secret-like material, or unsupported side effect is present. | Block |
| `PUBLIC_FIELD_LEAK` | Factory-only data would enter the public runtime payload. | Block |
| `LEGACY_NORMALIZATION` | A supported legacy type or field was normalized. | Warning |
| `QUALITY_WARNING` | Non-blocking content or journey quality issue. | Warning |

Missing dependencies are never silently replaced with a generic component,
default rule, or product-specific fallback. The error path must identify the
missing item and its source path so the Factory can repair the draft and
publish a new snapshot.

## 8. Versioning and backward compatibility

There are three independently versioned contracts:

1. **Source schema version**: the shape of the release snapshot;
2. **Compiler version**: the translator implementation;
3. **Runtime contract version**: the shape and semantics consumed by the
   customer workspace.

Compatibility rules:

- a runtime MUST support the runtime contract versions it declares, or fail
  explicitly with `UNSUPPORTED_VERSION`;
- a Compiler MAY accept older source versions through a documented,
  lossless normalization step;
- normalization MUST NOT invent missing semantics; if information cannot be
  preserved, compilation is blocked;
- adding optional fields is backward compatible when old runtimes can ignore
  them safely;
- changing step meaning, state namespaces, rule semantics, persistence
  behavior, or transition meaning requires a new runtime contract version;
- a compiler upgrade MUST be reproducible and must not mutate an existing
  release's stored runtime contract;
- recompile-and-roll-forward is allowed for a new customer release; silent
  in-place mutation of a published release is not;
- a release rollback selects a previous immutable release/runtime contract and
  does not rewrite the current Factory draft.

The runtime cache key MUST include the release identity, snapshot hash, runtime
contract version, and Compiler version. This prevents a new translation from
being confused with a previous executable output.

## 9. Acceptance boundary

The v1.1 acceptance scenario remains the minimum integration proof:

- assessment and vendor-decision configurations compile through the same
  configuration-driven path and produce materially different steps/components;
- configured journeys expose their outcome and journey to the customer;
- disconnected workflows and missing library dependencies block before
  compilation/publication;
- duplicated projects remain isolated at the mutable draft layer;
- only an approved, published release can produce a customer runtime;
- an exact public slug resolves the immutable release snapshot, not live draft
  data.

Tests for the future Compiler should assert the output contract and diagnostic
codes, not just that a particular product page renders. The existing
manufacturing helpers remain source/configuration preparation; they are not the
Compiler contract itself.

## 10. Explicit scope boundary

This specification does not authorize:

- a marketplace or catalog of customer-created PSTs;
- billing, subscriptions, checkout, or entitlements;
- Gustafta calls, personas, knowledge retrieval, or provider credentials;
- Factory Learning, analytics feedback loops, or automatic optimization;
- arbitrary user-authored code in Blueprint configuration;
- a separate hard-coded implementation for each PST product.
