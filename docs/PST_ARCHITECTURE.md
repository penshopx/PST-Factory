# PST Factory Technical Architecture

## A. Technology stack

- React + TypeScript + Vite for the factory web app.
- Node.js + TypeScript + Express 5 for the shared API service.
- PostgreSQL with Drizzle ORM for relational product-manufacturing data.
- OpenAPI as the API contract; Orval generates the React Query client and Zod validators.
- Reusable provider interfaces for AI and Gustafta capabilities.

## B. Application architecture

The web app is a focused factory shell. The API exposes dashboard, project, library,
manufacturing, QA, publishing, and customer workspace boundaries. Projects own a
structured Product DNA and a separate versioned blueprint. Reusable assets, patterns,
and recipes are shared library records rather than project copies.

## C. Database schema

The initial schema includes `pst_projects`, `pst_blueprints`, `pst_assets`,
`pst_patterns`, `pst_recipes`, `pst_project_components`, `pst_factory_events`,
`pst_qa_runs`, and `pst_simulations`. JSONB is limited to flexible configurations
such as Product DNA, workflow step configuration, and QA result details.

## D. API structure

All application routes live below `/api/pst` and are defined first in
`lib/api-spec/openapi.yaml`. The route groups are:

- dashboard summaries and activity
- project CRUD, duplicate, archive
- Architect and Blueprint
- asset, pattern, and recipe libraries
- Builder, simulator, QA, approval, and publish
- customer-facing workspace

## E. Authentication

The first build keeps the product focused on the factory flow and exposes a role-ready
server boundary. Production authentication and server-side role enforcement should be
connected before external users are invited. The publish operation remains explicit
and can only follow a passing QA and human approval state.

## F. AI provider abstraction

`AIProvider` exposes blueprint proposal behavior. `MockAIProvider` is the current
development implementation and is clearly surfaced to users as a proposal, never as
an autonomous publisher.

## G. Gustafta adapter

`GustaftaEngine` is an intentionally provider-neutral interface with mock persona,
knowledge, and response methods. No Gustafta endpoint is assumed until a real API
specification is supplied.

## H. PST domain model

The domain uses:

`Problem + User + Journey + Components + Intelligence + Outcome`

as structured Product DNA, while the Blueprint adds problem type, knowledge and AI
requirements, executable workflow steps, expected outputs, action plan, and next step.

## I. Asset architecture

Assets are reusable records with type, tags, domain, compatibility, status, and version.
Projects connect to assets through `pst_project_components`; a second project can reuse
the same asset record without copying its definition.

## J. Workflow architecture

Workflow steps are explicit records inside a blueprint configuration with IDs, types,
inputs, outputs, dependencies, next-step links, and optional configuration. Builder
and QA validate the graph rather than relying on hard-coded product logic.

The normative Blueprint-to-runtime boundary is defined in
[`PST_COMPILER_CONTRACT.md`](./PST_COMPILER_CONTRACT.md). A future Compiler consumes
only an approved immutable release snapshot and emits a versioned, data-only
executable contract for the customer workspace. It must not read mutable drafts,
execute arbitrary configuration, or add product-specific branches.

## K. Security model

Inputs are validated at the API boundary with generated Zod schemas. Provider
credentials are never placed in frontend code. Blocking QA errors prevent approval and
publishing. Authentication/role middleware is a pre-release gate for production use.

## L. Deployment approach

The React app and shared API run as managed Replit artifacts. The database schema is
applied through the workspace's Drizzle push flow in development; production schema
changes are handled by the publish flow.

## M. Phase plan

1. Foundation and contract
2. Relational domain model
3. Project workspace
4. Architect and Blueprint editor
5. Reusable libraries
6. Builder and workflow
7. Preview, simulation, QA
8. Human approval and customer workspace
9. Gustafta adapter implementation
10. Factory memory, measurement, and learning

## N. Risks

- Real Gustafta capabilities may differ from the mock adapter contract.
- Authentication and permission enforcement must be completed before production
  multi-user access.
- Blueprint workflow flexibility must remain validated as more component types are added.
- Analytics must use recorded events and show empty states rather than inferred data.