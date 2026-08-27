---
name: Workspace test runner
description: Environment-specific guidance for running focused TypeScript tests in this pnpm workspace.
---

Use the workspace-provided test executable in package scripts rather than loading a transitive loader package with Node's `--import` flag.

**Why:** A package can expose a `.bin` executable through pnpm while Node's package resolver still cannot import that transitive package by name.

**How to apply:** For focused TypeScript tests, invoke the available workspace executable directly (for example, `tsx --test ...`) unless the package explicitly declares the loader as a dependency.