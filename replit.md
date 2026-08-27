# PST Factory

Problem-Solving Toolkit manufacturing workspace: turn a defined problem into a reusable, QA'd, publishable guided product.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/pst-factory` — React/Vite factory dashboard, project workspace, libraries, guided create flow, and customer workspace.
- `artifacts/api-server/src/routes/pst.ts` — PST API handlers, seed data, manufacturing transitions, mock provider orchestration.
- `lib/api-spec/openapi.yaml` — source of truth for API contracts.
- `lib/db/src/schema/pst.ts` — relational PST domain model.
- `docs/` — product, architecture, lifecycle, asset, knowledge, QA, and Gustafta notes.

## Architecture decisions

- Product DNA and Blueprint are stored as distinct structured concepts; flexible workflow and result configuration uses JSONB.
- Asset reuse is modeled through project-to-asset connections, so duplicating a PST reuses library definitions.
- AI and Gustafta are accessed through provider-neutral interfaces; current implementations are clearly MOCK.
- QA is a hard gate: blocking errors prevent approval, and only approved PSTs can publish.
- Production authentication and role enforcement remain a pre-release gate before inviting external users.

## Product

- Dashboard with live factory summaries and event activity.
- PST project creation, editing, duplication, archive, Architect proposal, Blueprint editing, assembly, preview, simulation, QA, approval, and publish.
- Reusable asset, pattern, and recipe libraries.
- Published customer-facing guided workspace rendered from the project Blueprint.

## User preferences

- Use Indonesian for user-facing communication.
- Prefer a high-contrast dark/black and light/blue pairing with bright, legible text.

## Gotchas

- Run OpenAPI codegen after changing `lib/api-spec/openapi.yaml`; the generated Zod package currently targets Zod 3, so use numeric schemas instead of OpenAPI integer schemas when codegen emits `zod.int()`.
- Do not invent Gustafta endpoints; replace the mock adapter only when the real API contract is available.
- Development seed data is created on the first PST API request and is intentionally small.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
