# Executable PST Definition v1

Status: **contract only**. This document freezes the output language for a
future Compiler. It does not implement Compiler emission, runtime execution,
provider calls, customer persistence, or UI behavior.

The shared TypeScript contract is exported by `@workspace/db/schema` as
`ExecutablePstDefinitionV1`.

## 1. Compiler boundary

```text
PstCanonicalSourceV1
        ↓
PstManufacturingIrV1
        ↓
PstValidationResultV1 = VALIDATED
        ↓
PstCompilerInputV1
        ↓
ExecutablePstDefinitionV1
```

The Compiler accepts only validated Manufacturing IR. It does not normalize
Canonical Source, query the database, read current library rows, call a
provider, execute a customer session, or mutate a release.

## 2. Executable definition

Every definition contains:

- `runtimeVersion: "pst-runtime.v1"`;
- independent Compiler version and immutable release identity;
- customer-safe product promise;
- explicit context/state persistence contract;
- resolved Pattern, Recipe, component, rule, and provider declarations;
- ordered executable steps;
- entry step and outcome step IDs.

The definition is serializable JSON and deterministic for a fixed validated IR
and Compiler version. It contains no ownership, QA, draft, credential, or live
library lookup information.

## 3. Typed operation allowlist

Each executable step has exactly one `operation`:

| Step kind | Operation | Required references |
| --- | --- | --- |
| `input` | `collect-context` | Context field state references. |
| `answer` | `collect-answers` | Question schema and answer state references. |
| `persist` | `persist` | Explicit state target and retention class. |
| `rules` | `evaluate-rules` | Resolved rule IDs. |
| `scoring` | `score` | Scale reference and derived output. |
| `analysis` | `analyze` | Analysis template, output, optional provider ID. |
| `recommendation` | `recommend` | Strategy reference, output, optional provider ID. |
| `action` | `action` | Action template and output. |
| `outcome` | `outcome` | Outcome identity and output references. |

Operation configuration is an allowlisted discriminated union, not arbitrary
JSON. Every reference must resolve to a declaration or a namespaced state
field. Provider IDs identify capability requirements only; the executable
definition never carries provider credentials.

## 4. Transition contract

```ts
type PstExecutableNextV1 =
  | { type: "step"; stepId: string }
  | {
      type: "conditional";
      branches: Array<{ whenRuleId: string; stepId: string }>;
      defaultStepId: string;
    }
  | { type: "complete"; outcomeId: string };
```

Conditional transitions reference rule IDs rather than raw predicates and
always provide a safe default. Completion references an explicit outcome ID.
The Compiler must reject missing targets, unresolved rule IDs, and terminal
transitions that do not point to an `outcome` step.

## 5. Three-PST proof contract

The proof must send three full IR graphs through the same Compiler signature:

- Cashflow Health Check: context/answers → rules/scoring → diagnosis →
  recommendation → action → outcome.
- Decision Readiness: context/answers → rules/scoring → conditional option →
  action → outcome.
- Document Compliance: document/context → analysis → rules → gap/recommendation
  → action → outcome.

The only differences are declarative state references, operation configuration,
resolved declarations, and graph data. The Compiler source must contain zero
product-name branches and zero database/network/provider calls.

Acceptance must assert:

1. validated IR compiles;
2. blocked validation cannot compile;
3. all three definitions have the same runtime/compiler contract versions;
4. definitions are deterministic across repeated compilation;
5. operation references and transitions resolve;
6. all three graphs have an explicit outcome;
7. no product-specific branch or external call is observed.

## 6. Compatibility

Source schema, IR, Compiler, and runtime versions are independent. A Compiler
upgrade may recompile an unchanged release, but must never mutate the stored
release or silently change its runtime definition in place. Unsupported IR or
runtime versions produce `UNSUPPORTED_VERSION`.