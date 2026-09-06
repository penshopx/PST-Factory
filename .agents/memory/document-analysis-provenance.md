---
name: Document analysis provenance
description: Rules for keeping document-backed Architect results attributable without exposing private source text.
---

Persist each document-backed Architect result as an immutable analysis artifact containing source document identities, actual sizes, content hashes, and contract version. A Blueprint may reference that artifact, but private extracted text must not enter release runtime payloads.

**Why:** A free-text Blueprint alone cannot prove which document versions supported it. Conversely, copying source text into a public release would leak private project material.

**How to apply:** Preserve the artifact reference in new snapshots as optional provenance metadata for legacy compatibility. Clear the reference whenever the Blueprint is edited manually, because the edited result is no longer identical to the recorded analysis.