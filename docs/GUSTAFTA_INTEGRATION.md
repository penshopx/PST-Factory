# Gustafta Integration

PST Factory treats Gustafta as an external engine behind an adapter. The current
`MockGustaftaEngine` supports persona, knowledge retrieval, and response methods so
the factory can develop independently.

No production endpoint, credential, API key, or request shape is required here. The
current product scope intentionally stops at the public capability bridge.

## Public capability bridge

PST Factory may expose additive links to verified public Gustafta capabilities without
changing the Factory domain or passing customer data between systems:

- Gustafta Platform Guide (`/chat/8193`)
- Gustafta Work Help Desk (`/chat/1`)
- SBU Readiness Check (`/cek-kesiapan-sbu`)
- Construction Clinic (`/klinik-konsultasi`)
- Document Review (`/bedah-dokumen`)
- Brain Project (`/brain-project`)
- Ruang Simpan (`/ruang-simpan`)
- Tender Workspace (`/tender`)
- Contract Consultant (`/konsultan-kontrak`)
- Project Documentation Consultant (`/konsultan-dokumen-proyek`)

These links open `https://gustafta.my.id` in a separate browser tab. They are navigation
links, not an authenticated server-to-server API integration. PST Factory does not send
project, Blueprint, release, ownership, QA, or customer workspace data through them.

## Contextual project bridge

On a project overview, PST Factory shows a smaller contextual bridge only when the
project text signals construction, tender, SBU/SKK, documents, legality, contracts,
field work, or projects. It offers SBU Readiness, Construction Clinic, Document Review,
Brain Project, Tender Workspace, Contract Consultant, and Project Documentation
Consultant without copying the PST context into the link.

The backend `GustaftaEngine` remains provider-neutral and mocked. A direct API adapter is
optional future work, not a prerequisite for using PST Factory. Public frontend bundle
routes or undocumented internal endpoints must not be treated as a stable API contract.