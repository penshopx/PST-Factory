# Gustafta Integration

PST Factory treats Gustafta as an external engine behind an adapter. The current
`MockGustaftaEngine` supports persona, knowledge retrieval, and response methods so
the factory can develop independently.

No production endpoint, credential, or request shape is invented here. When the real
Gustafta API specification is available, implement the adapter behind the existing
interface and keep the Factory domain code unchanged.

## Public capability bridge

PST Factory may expose additive links to verified public Gustafta capabilities without
changing the Factory domain or passing customer data between systems:

- Gustafta Platform Guide (`/chat/8193`)
- Gustafta Work Help Desk (`/chat/1`)
- Document Review (`/bedah-dokumen`)
- Tender Workspace (`/tender`)

These links open `https://gustafta.my.id` in a separate browser tab. They are navigation
links, not an authenticated server-to-server API integration. PST Factory does not send
project, Blueprint, release, ownership, QA, or customer workspace data through them.

The backend `GustaftaEngine` remains provider-neutral and mocked until Gustafta supplies
an official API contract and an approved authentication method. Public frontend bundle
routes or undocumented internal endpoints must not be treated as a stable API contract.