---
name: Bundled PDF extraction
description: Native dependency requirement for running pdf-parse inside the bundled API artifact.
---

Declare the native canvas package used by `pdf-parse` as a direct API dependency when bundling the server.

**Why:** The parser worked under the TypeScript test runner, but the bundled API could not resolve the transitive native canvas module and crashed on startup while initializing DOM matrix support.

**How to apply:** After changing PDF parser dependencies or server bundling, verify the built server through a workflow restart, not only unit tests or direct source execution.