# Gustafta Integration

PST Factory treats Gustafta as an external engine behind an adapter. The current
`MockGustaftaEngine` supports persona, knowledge retrieval, and response methods so
the factory can develop independently.

No production endpoint, credential, or request shape is invented here. When the real
Gustafta API specification is available, implement the adapter behind the existing
interface and keep the Factory domain code unchanged.