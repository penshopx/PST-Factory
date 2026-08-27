---
name: PST release snapshots
description: Durable release boundary for keeping published customer journeys stable while factory drafts continue to evolve.
---

Published customer workspaces must resolve an immutable release snapshot. Factory edits, restores, and library changes may update the editable draft, but they must not alter the customer payload until a new approved release is published.

**Why:** A customer URL is a stable product surface; reading live Blueprint rows makes post-publish edits silently change the experience and removes the ability to compare or recover a known release.

**How to apply:** Create the release snapshot atomically with publication, version it independently from draft edits, expose release history to factory users, and keep restore operations draft-only until the next publish gate.

Concurrent publish conflicts must be user-visible and retry-safe: the factory should tell the operator another request won, offer a refresh, and reload the current project, blueprint, and release history before retrying.

**Why:** The API can correctly reject a stale second publish, but a silent mutation error leaves the operator with stale approval state and no safe recovery path.

**How to apply:** Preserve a structured retryable conflict response at the API boundary and render an explicit refresh action in the Publish tab.