---
name: OpenAI Responses JSON mode
description: Compatibility requirement for structured JSON output through the Replit OpenAI proxy.
---

When using Responses API `text.format` with `json_object`, include the word “JSON” explicitly in the user input message even when the system instructions already require JSON.

**Why:** The proxy rejects the request with a 400 when only the instruction field mentions JSON; it validates the input messages separately.

**How to apply:** Keep an explicit JSON-output sentence in every Responses user message that requests `json_object`, and preserve it during prompt refactors.