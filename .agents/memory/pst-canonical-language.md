---
name: Canonical PST language
description: Durable boundaries for canonical PST source normalization and Manufacturing IR.
---

Canonical PST source and Manufacturing IR are product-neutral contracts. Product names, labels, and output names must never determine step semantics.

**Why:** A shared manufacturing engine can support materially different PSTs only when behavior comes from explicit kinds, state bindings, transitions, and declarative configuration.

**How to apply:** Use finite semantic step kinds, require `context`, `answers`, or `derived` state namespaces, and block ambiguous legacy steps instead of guessing.

The immutable snapshot hash must be recomputed and verified before a release enters the canonical source boundary.

**Why:** Copying a claimed hash without verification allows changed payloads to retain an old cache and audit identity.

**How to apply:** Use the same canonical JSON hashing implementation for release creation and canonical-source verification; require complete release identity and canonical UTC publication time.

Canonical normalization remains pure and stops at Manufacturing IR.

**Why:** Mixing validation policy, compilation, runtime behavior, provider calls, or persistence into normalization would blur version boundaries and make backward compatibility difficult to reason about.

**How to apply:** Normalize one authoritative workflow into deterministic graph/state data only. Add Validator, Compiler emission, and execution as separate versioned stages.