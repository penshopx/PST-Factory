# PST Asset System

Assets are the Factory's reusable building blocks. They are grouped into KNOWLEDGE,
TOOL, MINI_APP, AI, and WORKFLOW types. Each asset has a version, lifecycle status,
tags, domain, and compatibility hints.

Projects connect to assets rather than duplicating their definitions. The Builder
reports READY, MISSING, WARNING, and ERROR states before assembly completes.