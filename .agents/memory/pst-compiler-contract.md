---
name: PST Compiler boundary
description: Durable rules for translating published PST snapshots into customer runtime contracts.
---

The future PST Compiler must consume a complete, immutable release snapshot and
emit a deterministic, versioned, data-only runtime contract. It must not read
mutable Factory rows, execute configuration as code, or add product-specific
branches.

**Why:** Customer URLs must remain stable while Factory drafts and reusable
library records continue to evolve; missing semantics must fail explicitly
instead of being replaced by an implicit product default.

**How to apply:** Embed resolved Pattern, Recipe, component, rule, and provider
configuration in the versioned release snapshot before compilation. Keep source
schema, Compiler, and runtime contract versions independent and include all of
them in diagnostics/cache identity.

Compiler v1 is the next milestone after the verified Snapshot Foundation. Its
acceptance requires one shared engine to produce distinct behavior for Cashflow
Health Check, Decision Readiness, and Document Compliance from declarative
configuration, not product-name branches.

**Why:** PST Factory is intended to be a reusable manufacturing engine rather
than a collection of product-specific features.

**How to apply:** For any task touching Schema, Pattern, Recipe, Blueprint,
Snapshot, Compiler, or Runtime, review the title, description, and acceptance
criteria before building. The expected pipeline is Snapshot → Validate →
Manufacturing IR → Compile → Executable PST Definition → Customer Runtime.

This review is a required Architecture Review Gate with three outcomes:
🟢 Build when the task strengthens the shared declarative engine, 🟡 Revise when
the scope needs adjustment, and 🔴 Defer when it moves away from the
manufacturing-engine roadmap.

The Compiler milestone is only complete when the same engine produces different
executable PST definitions and customer outcomes for Cashflow Health Check,
Decision Readiness, and Document Compliance. Adding a handler or branch named
for one of those products is an architecture red flag.

**Why:** Different PST behavior must come from configuration, knowledge, Pattern,
Recipe, Rules, and Providers while the engine remains stable.

**How to apply:** Before building a core task, require its title, description,
and acceptance criteria. Reject product-specific implementation when the same
result can be represented declaratively.

The Architecture Review Checklist also requires backward compatibility: existing
PSTs must continue to support Load → Validate → Run → Publish without manual
rewrites after an engine change.

**Why:** A manufacturing engine becomes more valuable as the catalog grows only
when new capabilities do not strand previously published or reusable PSTs.

**How to apply:** Review migrations, snapshot readers, validators, compiler
normalization, and runtime adapters for legacy inputs. Prefer versioned
normalization or compatibility adapters over forcing every old PST to be
rewritten.

The long-term boundary is a canonical PST schema shared by Pattern, Recipe,
Blueprint, Compiler, and Runtime. Versioned PST inputs should flow through
version-specific normalizers into that canonical schema before reaching the
shared engine.

**Why:** A stable canonical language lets the Factory evolve schema versions
without linear technical debt or one-off product migrations.

**How to apply:** Keep v1/v2/... normalization explicit and isolated from the
engine. New schema versions may add normalizers, but the Compiler and Runtime
should consume the canonical representation rather than branching on product
or historical input shape.

The preferred milestone order is Canonical PST Schema → Manufacturing IR →
Validator → Compiler v1 → Executable PST Definition → Generic Runtime →
Three-PST Proof → Versioned Normalizer → Factory Learning. The canonical schema
and IR must be stable enough to serve as the shared language before normalizer
work is expanded.

**Why:** Normalizing multiple historical inputs before the canonical contract is
settled would encode assumptions too early and make compatibility work harder to
change.

**How to apply:** Review Compiler-related assignments for this sequence. If a
task jumps directly from snapshots to a large Compiler without defining the
canonical schema and IR, revise the scope or defer it rather than building
product-specific shortcuts.

Compiler v1 must not start until the IR-to-runtime operation contract is
explicit: opaque node configuration, raw conditional predicates, undeclared
references, and completion without an outcome identity are blockers.

**Why:** A generic compiler can only emit safe executable definitions when every
operation, transition, persistence target, rule reference, and output mapping
has typed declarative semantics.

**How to apply:** Freeze an allowlisted `ExecutablePstDefinitionV1`, require
validated IR as the only input, map branches to rule IDs and step IDs, and
reject opaque or unbound configuration before emission.

Compiler architecture review must distinguish representability proof from
execution proof. Three fixtures passing the same schema/IR pipeline does not
yet prove three executable customer journeys.

**Why:** A one-node outcome fixture can hide missing input, scoring, rule,
action, and persistence semantics while appearing product-neutral.

**How to apply:** Require full Cashflow, Decision, and Compliance graph fixtures,
deterministic golden outputs, zero product branches, and zero DB/network/provider
calls before declaring Compiler v1 ready.

Compiler-Ready integrity is a freshness check, not permission to trust nested
data. Compiler v1 must recursively revalidate the complete emitted envelope,
declaration uniqueness, all references, terminal outcomes, and typed rule
effects even when an artifact carries a matching canonical hash.

**Why:** A caller can mutate or forge an in-memory ready artifact and recompute
its hash; projection without full defensive validation can leak private fields,
create ambiguous references, or let rules target undeclared runtime state.

**How to apply:** Keep runtime rules and component configuration as exact
allowlisted unions, reject unknown keys recursively, constrain rule effects to
declared components/steps/state writes, sort diagnostics, and never fall back to
raw snapshot objects during emission.