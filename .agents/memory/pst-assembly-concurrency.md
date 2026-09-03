---
name: PST assembly concurrency
description: Concurrency and revision rules for mutable assembly workspaces derived from PST blueprints.
---

All mutations that can affect a project's build inputs or assembly output must
serialize through the same project-level mutex. When both project and assembly
rows are needed, lock the project first and the assembly second. A blueprint
change invalidates the previous assembly rather than presenting its checklist
and mitigations as current.

**Why:** Assembly content is mutable JSON derived from a specific blueprint
revision. Independent read-modify-write operations or an interleaved build and
blueprint edit can otherwise lose user progress or label stale content as if it
belongs to the newest blueprint.

**How to apply:** Put reference selection, blueprint reads/writes, component
replacement, assembly writes, and project status changes behind the shared
project lock and commit each coherent transition atomically. Preserve assembly
state only when its recorded blueprint source still matches exactly.