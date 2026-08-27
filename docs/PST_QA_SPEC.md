# PST QA Specification

QA checks the categories required for a trustworthy PST:

- Problem: problem, user, and outcome are defined.
- Knowledge: requirements and references are available.
- Workflow: steps connect and required inputs are present.
- AI: configuration and instructions exist.
- Output: outputs are defined and connected to the outcome.
- Technical: dependencies and configuration resolve.
- UX: the creator and eventual user can understand what to do.

Each check returns PASS, WARNING, or ERROR. Any ERROR blocks approval and publishing.

Technical dependency resolution is a blocking check: when a Blueprint requirement
does not resolve to an active library asset, Builder returns `BLOCKED` and QA
returns a technical `ERROR`. The v1.1 acceptance scenario covers this alongside
two materially different Blueprint configurations and the customer access boundary.