---
name: Persistent product briefs
description: Boundary between saved Framework Analyzer decisions and the manufactured PST runtime.
---

Keep one active Product Brief per project containing the Framework Analyzer result, selected solutions, and generated action plan. Bind it server-side to the current Blueprint timestamp and analysis-artifact reference.

**Why:** Browser-only analysis disappears on refresh and cannot guide later work, while feeding exploratory commercial recommendations directly into the Compiler would weaken the deterministic manufacturing boundary.

**How to apply:** Persist and restore Product Brief state through project-authorized endpoints. Treat it as an internal decision record; do not include it in public runtime payloads or publication gating unless a later explicit product decision changes that boundary.