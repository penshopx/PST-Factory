---
name: PST browser acceptance routing
description: Environment-specific routing needed when the PST browser acceptance drives the Vite frontend and API together.
---

Browser acceptance must use the shared Replit development proxy URL when the frontend and API run as separate managed artifacts. The direct Vite port serves the frontend fallback for `/api` instead of forwarding API requests.

**Why:** Direct navigation to the local Vite port made the dashboard receive HTML for an activity request, so the browser run failed before reaching the publish conflict flow.

**How to apply:** Set `PST_BROWSER_URL` to the shared development domain for local browser acceptance runs; keep API-only acceptance pointed at the API artifact URL.

The browser proxy preflight should call a private API route without credentials and require the API's JSON `401` response; a `502` means the API artifact is unavailable, while HTML indicates frontend fallback.

**Why:** A no-session request distinguishes a working shared proxy from an unavailable API service or a Vite SPA fallback without creating Clerk sessions or acceptance data.

**How to apply:** Run the preflight before creating Clerk test users, and keep the expected unauthenticated response tied to a stable private route.

A transient `502` can occur while the managed API artifact is restarting; rerun the routing check after confirming `/api/healthz` is back to `200` before treating it as a code regression.

**Why:** The same proxy and API returned the expected four-route pass immediately after the API finished becoming reachable, without any source change.

**How to apply:** Check workflow readiness and rerun once after a restart; preserve the fail-fast assertion when the proxy remains unavailable.

Browser assertions for localized release content should target the exact visible label or a stable test id rather than a broad regex that also matches the surrounding card heading.

**Why:** A broad fallback regex matched both the release-history heading and its localized live-release label, triggering Playwright strict-mode failure after routing was corrected.

**How to apply:** Keep language alternatives narrow and use exact matching when the UI copy is controlled by the application.

The routing validation should probe an unauthenticated JSON API endpoint through the shared browser URL and reject HTML responses.

**Why:** A successful page load does not prove that frontend `/api` calls are proxied; the Vite fallback can still return `200` HTML for an API path.

**How to apply:** Expect the API's unauthenticated status and JSON content type, and explicitly reject HTML markers in the probe body.

Published-route preflights must use a release created by the current acceptance run (or an explicitly supplied fixture slug), never a hard-coded slug left in the database by an earlier run.

**Why:** A fresh database can have no active release for the old slug, making a valid proxy fail before the authenticated lifecycle has provisioned its own published workspace.

**How to apply:** Run stable health/auth/not-found probes before Clerk setup, then append the published-workspace probe after the current project reaches `PUBLISHED` and assert its release version and customer steps.
