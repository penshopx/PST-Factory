---
name: Managed artifact workflow and auth
description: Environment-specific constraints for this app's managed Vite workflow and Clerk web setup.
---

Managed artifact web workflows inject `PORT` and `BASE_PATH`; manual Vite builds need those values supplied explicitly, while workflow restarts should use the managed service name.

**Why:** A stale process can make a healthy Vite service fail with a port-in-use error, and a manual build otherwise fails before compiling because the project config intentionally requires both variables.

**How to apply:** Diagnose the actual listener before changing ports, restart the existing artifact workflow rather than creating a replacement, and run local builds with the artifact's injected environment values.