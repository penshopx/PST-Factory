---
name: PST acceptance fixtures
description: Constraints for authenticated PST acceptance runs that use Clerk test accounts.
---

Keep authenticated PST acceptance fixtures to a small number of Clerk test accounts per run.

**Why:** The connected Clerk development tenant rejected creation of a fourth short-lived acceptance user with HTTP 422, while a three-user fixture completed successfully.

**How to apply:** Reuse the existing owner, viewer, and outsider identities for role and isolation scenarios before adding another test account.