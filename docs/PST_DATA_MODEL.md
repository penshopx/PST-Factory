# PST Data Model

The model keeps core entities relational and uses JSONB only where configuration is
expected to evolve.

| Entity | Purpose |
| --- | --- |
| `pst_projects` | Product identity, lifecycle, Product DNA, publication state |
| `pst_blueprints` | Structured manufacturing plan for one project |
| `pst_assets` | Reusable knowledge, tool, mini-app, AI, or workflow building block |
| `pst_patterns` | Reusable problem-solving sequence |
| `pst_recipes` | Recommended component combination |
| `pst_project_components` | Project-to-asset reuse connection |
| `pst_factory_events` | Manufacturing audit trail and analytics source |
| `pst_qa_runs` | QA status and category results |
| `pst_simulations` | Pre-publication simulation reports |

Production versions are represented by explicit version fields and are not destructively
overwritten by the current MVP operations.