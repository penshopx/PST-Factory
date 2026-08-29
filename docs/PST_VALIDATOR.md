# PST Validator v1

Status: **implemented as a pure diagnostic boundary**. The Validator checks a
`PstCanonicalSourceV1` or `PstManufacturingIrV1` before a future Compiler emits
an executable definition. It does not compile, execute, call providers, query
the database, mutate releases, or create customer state.

The shared implementation and types are exported by `@workspace/db/schema`.

## 1. Result contract

```ts
type PstValidationResultV1 =
  | { status: "VALIDATED"; diagnostics: []; warnings: PstValidationDiagnosticV1[] }
  | {
      status: "BLOCKED";
      diagnostics: PstValidationDiagnosticV1[];
      warnings: PstValidationDiagnosticV1[];
    };
```

There is no executable output in a blocked result. Diagnostics are ordered
deterministically and use stable codes so Factory and future Compiler flows do
not match prose.

`diagnostics` are blocking errors. `warnings` are non-blocking findings and are
kept separate so a future Compiler can accept only `status: "VALIDATED"` while
preserving quality information.

## 2. Diagnostic codes

| Code | Meaning | Result |
| --- | --- | --- |
| `INVALID_RELEASE` | Release or IR source identity is incomplete. | Block |
| `SNAPSHOT_MISMATCH` | Source identity or hash metadata is inconsistent. | Block |
| `UNSUPPORTED_VERSION` | Canonical source or IR version is unsupported. | Block |
| `MISSING_DEPENDENCY` | Read, dependency, transition target, or required declaration is absent. | Block |
| `INACTIVE_DEPENDENCY` | Resolved component is missing a version or is not READY. | Block |
| `INVALID_WORKFLOW` | Graph entry, IDs, order, transitions, reachability, cycle, or terminal outcome is invalid. | Block |
| `INVALID_DATA_CONTRACT` | Namespace, read/write ownership, or data contract is invalid. | Block |
| `UNSAFE_CONFIGURATION` | Credential-like data or unsupported unsafe configuration is present. | Block |
| `PUBLIC_FIELD_LEAK` | Factory-only data would cross into a public contract. | Block |
| `LEGACY_NORMALIZATION` | A supported legacy field was normalized. | Warning |
| `QUALITY_WARNING` | A non-blocking quality issue is present. | Warning |

## 3. Checks

For the canonical source, the Validator checks:

- canonical source and IR versions;
- release identity and snapshot hash metadata;
- release/project/Blueprint identity agreement;
- unique resolved component, rule, and provider IDs;
- component version and `READY` status;
- nested workflow, component, provider, and rule configuration for
  credential-like keys;
- lossless normalization into the Manufacturing IR.

For the Manufacturing IR, the Validator checks:

- nonempty unique node IDs and a valid graph entry;
- dependency existence and dependency ordering;
- transition target existence;
- conditional transitions have a safe default target;
- no cycles without an explicit loop contract;
- every node is reachable from the entry;
- at least one reachable terminal outcome;
- explicit state namespaces;
- reads are available from `context.*` or an earlier write;
- each write has one owner.

## 4. Compatibility boundary

The Validator does not guess missing semantics. `OUTPUT` has already been
normalized to `OUTCOME`; ambiguous `ASSESSMENT`, `STEP`, bare state keys, and
unsupported aliases are blocked by canonical normalization before validation.

Validator versioning is independent from source schema, IR, Compiler, and
runtime contract versions. A future Compiler must treat `BLOCKED` as a hard
stop and preserve the diagnostics for Factory operators.

## 5. Out of scope

- executable Compiler output;
- runtime execution or UI rendering;
- rule/scoring/AI/provider calls;
- persistence policy execution;
- publish-route changes;
- production three-PST execution proof.