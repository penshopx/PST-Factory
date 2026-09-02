---
name: App Storage signed uploads
description: How this project creates authenticated private upload targets without Google Cloud client dependencies.
---

Use the local App Storage sidecar to create short-lived signed `PUT` URLs for private browser uploads when the managed package environment cannot install the Google Cloud storage clients.

**Why:** Repeated attempts to add the template's Google Cloud dependencies failed in this workspace, while the Replit sidecar signing endpoint is already available to artifact services and avoids introducing credential handling into application code.

**How to apply:** Keep URL issuance behind authenticated API routes, derive storage destinations from the injected private object directory, return only normalized application object paths to the client, and persist project authorization metadata separately after a successful direct upload.