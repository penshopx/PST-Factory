---
name: PST runtime boundaries
description: Durable lessons for separating factory metadata from public customer runtime and keeping seeded references consistent.
---

Public customer responses must use an explicit allowlist contract rather than reusing the factory project aggregate. Factory aggregates contain library selections, QA metadata, and runtime source configuration that customers should not receive.

**Why:** A published slug is intentionally unauthenticated, so any internal fields included in that response become public even when the factory API itself is protected.

**How to apply:** Keep private and public response schemas separate, strip workflow configuration/source identifiers from public steps, and assert the absence of internal fields at the HTTP boundary.

Seeded project-to-pattern and project-to-recipe relations must be reconciled idempotently for every shipped fixture, including databases created before the latest seed logic.

**Why:** Lazy initialization can leave an existing database with valid library rows but no reference rows, making configuration-driven behavior appear generic while bypassing the intended pattern and recipe.

**How to apply:** Reconcile known fixture relations by stable project slugs on seed initialization and verify persisted counts, not only in-memory manufacturing fixtures.