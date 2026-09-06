---
name: Persistent product briefs
description: Boundary between saved Framework Analyzer decisions and the manufactured PST runtime.
---

Keep one active Product Brief per project containing the Framework Analyzer result, selected primary product, selected solutions, and generated action plan. Bind it server-side to the current Blueprint timestamp and analysis-artifact reference.

**Why:** Browser-only analysis disappears on refresh and cannot guide later work, while feeding exploratory commercial recommendations directly into the Compiler would weaken the deterministic manufacturing boundary.

**How to apply:** Persist and restore Product Brief state through project-authorized endpoints. Any brief or Blueprint change atomically resets approval to DRAFT. Lock the project, Blueprint, and brief when approving; require a primary product, action plan, and matching timestamp. Keep it outside public runtime and publication gating unless explicitly changed.

Official Executive Summary exports must be generated server-side from the stored APPROVED brief and its matching Blueprint, with approval provenance and no private source-document text.

**Why:** Browser-generated files can diverge from the reviewed decision and cannot prove which brief or Blueprint was approved.

**How to apply:** Reject draft, stale, or incomplete exports. Return deterministic Markdown, TXT, or JSON content with project, brief, approval, and Blueprint identity; the browser only downloads the server response.