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