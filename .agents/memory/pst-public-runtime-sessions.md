---
name: Public PST runtime sessions
description: Authority, release pinning, and concurrency rules for executable customer journeys.
---

Public customer journeys must execute through persisted server-side sessions.
The browser receives only an allowlisted step/result view; executable
definitions and runtime state remain internal. Each session is pinned to one
immutable release and advances only when the caller supplies its current
revision.

**Why:** Browser-local execution loses progress and exposes implementation
state. Unguarded advances can replay actions or let concurrent submissions run
the same transition twice, while unpinned sessions can silently cross release
boundaries.

**How to apply:** Generate opaque session IDs, lock the session row before
checking revision, return conflict for stale callers, and reject advances when
the active published release no longer matches the session's pinned release.
Project/workspace metadata must never expose the executable definition.