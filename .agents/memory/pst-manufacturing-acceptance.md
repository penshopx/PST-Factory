---
name: PST manufacturing boundary
description: Durable rule for adding PST variants without product-specific runtime branches.
---

New PST variants must be represented by Blueprint, pattern, recipe, and library
configuration that the shared manufacturing runtime can resolve. The acceptance
scenario is the guardrail for proving materially different journeys, components,
QA gates, publication gates, and customer boundaries still work together.

**Why:** Factory's core claim is that a new PST is primarily configuration and
reusable intelligence, not a new product implementation. Without an executable
contrast between two variants, a builder can appear generic while quietly
serving only one product shape.

**How to apply:** When changing manufacturing behavior or adding a PST family,
extend the fixture scenario first (or keep it green if behavior is unchanged),
then verify both API and customer workspace paths.