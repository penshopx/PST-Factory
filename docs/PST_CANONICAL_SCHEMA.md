# Canonical PST Schema and Manufacturing IR v1

Status: **contract and pure normalization only**. This milestone defines the
language consumed by a future Validator and Compiler. It does not publish,
compile, execute, call providers, persist customer state, or render a product.

## 1. Architecture boundary

```text
immutable release snapshot + release identity
                    |
                    v
        PstCanonicalSourceV1
                    |
           pure normalization
                    |
                    v
        PstManufacturingIrV1
                    |
          future Validator/Compiler
```

Both contracts are product-neutral. Cashflow Health Check, Decision Readiness,
and Document Compliance use the same versions and node kinds. Their data,
rules, state bindings, and graph configuration differ; the normalizer does not
branch on product names.

The normative TypeScript contract is exported by `@workspace/db/schema`.

## 2. Canonical source

`PstCanonicalSourceV1` has contract version `pst-canonical-source.v1` and
contains:

- complete immutable release identity, publication timestamp, source schema,
  snapshot hash, and hash algorithm;
- a customer-safe project promise;
- a Blueprint definition without a duplicate workflow;
- one authoritative workflow;
- resolved and versioned Pattern, Recipe, and component definitions;
- resolved declarative rules and provider capability requirements.

The persisted snapshot's top-level `workflow` is authoritative. Its
`blueprint.workflow` mirror must be structurally equal or normalization is
blocked with `SNAPSHOT_MISMATCH`. Missing step configuration becomes `{}`.

Canonicalization is pure: it performs no database query, network call,
provider invocation, random ID generation, or mutation.

## 3. State contract

Every read and write uses one explicit namespace:

| Namespace | Meaning |
| --- | --- |
| `context.*` | Session and customer context supplied to the journey. |
| `answers.*` | Customer answers collected by the journey. |
| `derived.*` | Scores, analysis, recommendations, actions, and outcomes derived by configured operations. |

Already namespaced source keys are preserved. Legacy bare keys require an
explicit binding:

```ts
configuration: {
  canonical: {
    bindings: {
      inputs: { profile: "context.profile" },
      outputs: { score: "derived.readiness_score" }
    }
  }
}
```

The normalizer never guesses a namespace from labels, output names, or a
particular PST product.

## 4. Step normalization

The finite v1 semantic kinds are:

`INPUT`, `ANSWER`, `PERSIST`, `RULES`, `SCORING`, `ANALYSIS`,
`RECOMMENDATION`, `ACTION`, and `OUTCOME`.

| Source type | IR kind | Rule |
| --- | --- | --- |
| Any finite v1 kind | Same kind | Direct mapping. |
| `OUTPUT` | `OUTCOME` | Supported legacy alias. |
| `ASSESSMENT` | Explicit `configuration.canonical.kind` | Never inferred from labels. |
| `STEP` | Explicit `configuration.canonical.kind` | Never inferred from labels. |
| Unknown | Block | Contract extensions are not part of v1. |

`dependencies` becomes `dependsOn`. Source order and IDs are preserved.
An empty `nextStep` becomes `{type: "complete"}` only for `OUTCOME`. A nonempty
target becomes `{type: "step", target}`. Conditional transitions require an
explicit declarative `configuration.canonical.next`; they are never inferred.

Canonical-only bindings and transition metadata are consumed during
normalization and are not copied into the node's runtime `config`.

## 5. Manufacturing IR

`PstManufacturingIrV1` has version `pst-manufacturing-ir.v1` and contains:

- immutable source identity and snapshot hash;
- the normalized product promise;
- resolved declarations with deterministic ID ordering;
- an ordered graph of nodes:

```ts
type PstManufacturingIrNodeV1 = {
  id: string;
  kind: PstCanonicalStepKind;
  title: string;
  description: string;
  reads: PstStateReference[];
  writes: PstStateReference[];
  dependsOn: string[];
  next: PstIrNextV1;
  config: Record<string, unknown>;
};
```

IR generation is deterministic and data-only. It does not evaluate a rule,
perform scoring, call AI, generate UI, or decide whether the graph is safe to
execute. Those checks belong to the future Validator and Compiler.

## 6. Legacy and compatibility rules

- Legacy snapshots remain readable by existing customer routes.
- A snapshot can enter the canonical source only when required identity,
  source version, hash algorithm, resolved versions, and workflow consistency
  are present.
- Legacy aliases are normalized only when semantics are lossless.
- Missing state namespaces or ambiguous step kinds block normalization.
- Normalization never rewrites the stored release.
- Contract semantics change only through a new canonical or IR version.

## 7. Seven-gate acceptance

1. **Shared Engine:** one schema and normalizer for every PST.
2. **Declarative:** semantics come from kinds, bindings, transitions, rules,
   and configuration data.
3. **No Product-Specific Code:** no product-name branches.
4. **Snapshot Compatible:** only complete immutable release data enters the
   canonical source.
5. **Generic Runtime Compatible:** IR contains normalized graph/state semantics.
6. **Three-PST Proof:** three distinct fixtures are representable through the
   same contracts.
7. **Backward Compatibility:** legacy data is preserved and either normalized
   losslessly or blocked explicitly.

## 8. Explicitly out of scope

- publish-route or database migrations;
- Validator diagnostics and graph safety enforcement;
- Compiler emission and executable PST definitions;
- rule, scoring, provider, persistence, or AI execution;
- customer runtime/UI projection;
- production three-PST execution proof.