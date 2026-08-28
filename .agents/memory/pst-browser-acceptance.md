---
name: PST browser acceptance routing
description: Environment-specific routing needed when the PST browser acceptance drives the Vite frontend and API together.
---

Browser acceptance must use the shared Replit development proxy URL when the frontend and API run as separate managed artifacts. The direct Vite port serves the frontend fallback for `/api` instead of forwarding API requests.

**Why:** Direct navigation to the local Vite port made the dashboard receive HTML for an activity request, so the browser run failed before reaching the publish conflict flow.

**How to apply:** Set `PST_BROWSER_URL` to the shared development domain for local browser acceptance runs; keep API-only acceptance pointed at the API artifact URL.

Browser assertions for localized release content should target the exact visible label or a stable test id rather than a broad regex that also matches the surrounding card heading.

**Why:** A broad fallback regex matched both the release-history heading and its localized live-release label, triggering Playwright strict-mode failure after routing was corrected.

**How to apply:** Keep language alternatives narrow and use exact matching when the UI copy is controlled by the application.

The routing validation should probe an unauthenticated JSON API endpoint through the shared browser URL and reject HTML responses.

**Why:** A successful page load does not prove that frontend `/api` calls are proxied; the Vite fallback can still return `200` HTML for an API path.

**How to apply:** Expect the API's unauthenticated status and JSON content type, and explicitly reject HTML markers in the probe body.