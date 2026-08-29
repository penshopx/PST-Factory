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

The Validator must enforce the same declaration, graph, state, and unsafe-configuration rules whether it receives Canonical Source or Manufacturing IR directly, without duplicating diagnostics.

**Why:** A direct-IR path otherwise becomes a bypass around source validation, while running identical checks twice produces noisy and unstable diagnostics.

**How to apply:** Share pure diagnostic collectors across both entry points. On Canonical Source success, validate the normalized IR once; use source-level fallback checks only when normalization is blocked.

A valid journey terminates only at a reachable `OUTCOME` node with a `complete` transition.

**Why:** Treating any completed action or rule node as a successful terminal would let incomplete customer journeys pass validation.

**How to apply:** Require an explicit reachable terminal outcome, verify all transition paths and targets, and block cycles unless a future version defines a loop contract.