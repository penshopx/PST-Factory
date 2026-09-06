---
name: Persistent product briefs
description: Boundary between saved Framework Analyzer decisions and the manufactured PST runtime.
---

Keep one active Product Brief per project containing the Framework Analyzer result, selected primary product, selected solutions, and generated action plan. Bind it server-side to the current Blueprint timestamp and analysis-artifact reference.

**Why:** Browser-only analysis disappears on refresh and cannot guide later work, while feeding exploratory commercial recommendations directly into the Compiler would weaken the deterministic manufacturing boundary.

**How to apply:** Persist and restore Product Brief state through project-authorized endpoints. Validate selections against the same analysis and mark the brief stale when its Blueprint timestamp differs. Keep it outside public runtime and publication gating unless an explicit later decision changes that boundary.