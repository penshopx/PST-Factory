---
name: PST denied-access auditing
description: Security boundary for recording authenticated cross-owner project access attempts.
---

Authenticated requests for an existing PST project outside the actor's owner/member scope must create a durable security audit event, while nonexistent and inaccessible project IDs must continue returning the exact same `404` response.

**Why:** Returning a different status when a project exists would let attackers enumerate private resources. Audit persistence failures must also never turn this protected `404` path into a distinguishable error response.

**How to apply:** Keep detection at the shared project-authorization choke point. Use only normalized route patterns and minimal actor/target identifiers; never store tokens, request bodies, project names, document content, or raw URLs in the audit event.