---
name: Legacy PST release compatibility
description: Boundary between historical marker-free releases and strict modern Compiler validation.
---

Only historical snapshots with no source-version, hash, or hash-algorithm
marker may enter the bounded legacy read adapter. Any modern provenance marker
commits the release to the strict canonical Compiler pipeline; modern failures
must never fall back to legacy interpretation.

**Why:** Falling back after a modern validation failure could turn a malformed
or tampered release into a different executable journey. Historical snapshots
still need to remain readable without mutating immutable release records or
claiming integrity metadata they never carried.

**How to apply:** Keep the adapter product-neutral, linear, read-only, and
fail-closed. Reject configured steps and rule/provider semantics that cannot be
translated exactly. Identify generated definitions as legacy compatibility
output and validate them with the current Generic Runtime before serving them.