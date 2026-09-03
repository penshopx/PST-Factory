---
name: PST release snapshots
description: Durable release boundary for keeping published customer journeys stable while factory drafts continue to evolve.
---

Published customer workspaces must resolve an immutable release snapshot. Factory edits, restores, and library changes may update the editable draft, but they must not alter the customer payload until a new approved release is published.

**Why:** A customer URL is a stable product surface; reading live Blueprint rows makes post-publish edits silently change the experience and removes the ability to compare or recover a known release.

**How to apply:** Create the release snapshot atomically with publication, version it independently from draft edits, expose release history to factory users, and keep restore operations draft-only until the next publish gate.

Public delivery must remain available while a published project is edited into a
new draft. The internal project `status` may move to a blueprint or QA state;
the public route should rely on `publicationStatus` plus a matching valid release
snapshot.

**Why:** Draft preparation after publication must not make an already-delivered
customer URL disappear or expose the mutable draft in place of its release.

**How to apply:** Keep the live release lookup and snapshot consistency checks at
the public boundary, but do not require the mutable draft status to remain
`PUBLISHED`.

Concurrent publish conflicts must be user-visible and retry-safe: the factory should tell the operator another request won, offer a refresh, and reload the current project, blueprint, and release history before retrying.

**Why:** The API can correctly reject a stale second publish, but a silent mutation error leaves the operator with stale approval state and no safe recovery path.

**How to apply:** Preserve a structured retryable conflict response at the API boundary and render an explicit refresh action in the Publish tab.

Startup fixtures and reconciliation must never replace the payload of an existing release. A release may be created when absent, but historical snapshot content remains immutable.

**Why:** Rebuilding a fixture release from current mutable rows silently changes a published customer contract and invalidates its audit history.

**How to apply:** Repair fixtures by creating a new release or through an explicit controlled migration; never update a stored release snapshot during normal startup.

Only snapshots carrying a declared canonical hash algorithm are integrity-verified. Legacy snapshots without that marker remain readable for compatibility but must not be represented as hash-verified.

**Why:** A hash string alone does not prove which serialization algorithm produced it, and JSON key ordering cannot be reconstructed reliably from historical JSONB.

**How to apply:** Canonicalize new snapshot payloads before hashing, retain the algorithm marker, and keep legacy readability separate from integrity verification.

Release configuration must reject credential-like data and malformed rule/provider declarations before persistence instead of silently dropping them.

**Why:** Silent omission makes compilation depend on live defaults, while retained credentials would leak secrets into release history.

**How to apply:** Recursively inspect declarative configuration, block credential-bearing keys, and fail publication when a configured rule or provider is incomplete.

Modern publication must compile the exact candidate snapshot before inserting
the release or marking the project published. Keep executable component
declarations separate from restorable Factory component references.

**Why:** Discovering an incomplete modern snapshot only when the public route is
opened creates a published-but-unusable release. Executable component identities
also are not Asset Library foreign keys and cannot safely restore draft rows.

**How to apply:** Materialize draft authoring metadata into strict canonical and
Compiler-Ready data, run the complete Compiler pipeline in the publication
transaction, and restore Factory rows only from their separately snapshotted
library references.

QA and human approval must authorize the canonical hash of the exact next
release candidate, not merely a mutable project status.

**Why:** A Blueprint or configuration change after QA can produce a different
executable while leaving old PASS/APPROVED labels visible. Status-only gates
would let that unreviewed candidate publish.

**How to apply:** Compute the candidate while holding project then Blueprint
locks, persist its hash on QA and approval, clear approval when QA reruns, and
rematerialize plus compare both hashes inside the publish transaction before
any release or project write. Existing null bindings are non-authorizing.