---
name: PST acceptance fixtures
description: Constraints for authenticated PST acceptance runs that use Clerk test accounts.
---

Keep authenticated PST acceptance fixtures to a small number of Clerk test accounts per run.

**Why:** The connected Clerk development tenant rejected creation of a fourth short-lived acceptance user with HTTP 422, while a three-user fixture completed successfully.

**How to apply:** Reuse the existing owner, viewer, and outsider identities for role and isolation scenarios before adding another test account.

Deterministic public PST fixtures must be reconciled during API startup, before the server is considered ready; public GET probes must remain read-only.

**Why:** Browser proxy checks can reach the public route before any authenticated request, so lazy request-time seeding causes false 404s or makes a read-only probe mutate the database.

**How to apply:** Run idempotent fixture reconciliation before opening the API port, and verify repeated startups preserve one valid active release.