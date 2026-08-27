# PST Asset System

Assets are the Factory's reusable building blocks. They are grouped into KNOWLEDGE,
TOOL, MINI_APP, AI, and WORKFLOW types. Each asset has a version, lifecycle status,
tags, domain, and compatibility hints.

Projects connect to assets rather than duplicating their definitions. The Builder
reports READY, MISSING, WARNING, and ERROR states before assembly completes.

Patterns and recipes are reusable manufacturing intelligence, not project snapshots.
Projects reference library records through `pst_project_patterns` and
`pst_project_recipes`. Architect uses the referenced steps/components to propose a
blueprint, and Builder derives the workflow and component requirements from those
same records. Library usage is calculated from the reference relations, so the
usage count and project list cannot drift from actual project selections.