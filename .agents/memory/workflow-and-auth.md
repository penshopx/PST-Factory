---
name: Managed artifact workflow and auth
description: Environment-specific constraints for this app's managed Vite workflow and Clerk web setup.
---

Managed artifact web workflows inject `PORT` and `BASE_PATH`; manual Vite builds need those values supplied explicitly, while workflow restarts should use the managed service name.

**Why:** A stale process can make a healthy Vite service fail with a port-in-use error, and a manual build otherwise fails before compiling because the project config intentionally requires both variables.

**How to apply:** Diagnose the actual listener before changing ports, restart the existing artifact workflow rather than creating a replacement, and run acceptance scripts with `PST_API_URL` or the workflow's injected `PORT` instead of assuming the port in project prose.

Acceptance scripts invoked through a pnpm workspace filter may run with the package directory as their current working directory; resolve saved evidence from the workspace root when the output path is part of the project artifact.

**Why:** A relative screenshot path initially placed browser acceptance evidence under the scripts package instead of the intended artifact directory.

**How to apply:** Derive the root from the script module location, then report evidence paths relative to that root.

Browser acceptance must use the Replit development domain rather than the raw Vite port so `/api` requests cross the managed frontend/API proxy; authenticate test contexts with `@clerk/testing` server-side sign-in and `+clerk_test` fixture addresses.

**Why:** Direct requests to the Vite port return the frontend fallback for `/api`, and password sign-in from fresh Playwright contexts triggers Clerk Device Trust email verification.

**How to apply:** Set `PST_BROWSER_URL=https://$REPLIT_DEV_DOMAIN`, call `clerkSetup()` once, and use `clerk.signIn({ page, emailAddress })` for each isolated browser context.
