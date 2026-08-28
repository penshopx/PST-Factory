# PST Manufacturing v1.1 Acceptance Criteria

The tenth PST proof is an executable scenario, not a product-specific implementation. Run it with:

```bash
pnpm --filter @workspace/scripts run test:pst-acceptance
```

Untuk mengaktifkan acceptance dua sesi browser dan menyimpan bukti konflik
publish, jalankan:

```bash
PST_BROWSER_ACCEPTANCE=1 \
pnpm --filter @workspace/scripts run test:pst-acceptance
```

Saat mode browser aktif di Replit, script otomatis memakai URL proxy
`https://${REPLIT_DEV_DOMAIN}` agar request frontend ke `/api` diteruskan ke
API artifact. `PST_BROWSER_URL` tetap dapat dipakai sebagai override untuk
lingkungan lain. Hasil JSON mencantumkan
`authenticatedRoute.browserPublishConflict.visualEvidence` dan screenshot
disimpan di `artifacts/pst-factory/acceptance-evidence/`. Folder tujuan dapat
diganti dengan `PST_ACCEPTANCE_EVIDENCE_DIR`.

Pemeriksaan routing proxy dapat dijalankan secara terpisah saat workflow
frontend dan API aktif:

```bash
pnpm --filter @workspace/scripts run test:pst-routing
```

The scenario is accepted when all of these remain true:

- Two materially different Blueprint configurations (assessment and vendor decision) produce different workflow steps and component sets through the same builder.
- The customer workspace model exposes each Blueprint's configured outcome and journey.
- A disconnected workflow creates a blocking QA `ERROR`; it cannot be approved or published.
- A missing library dependency makes the builder `BLOCKED` and creates a technical QA `ERROR`.
- Duplicating a PST isolates its mutable workflow and component configuration from the source.
- A configured and approved PST with non-blocking QA can publish; an unapproved PST cannot.
- Customer access is limited to an exact slug whose project and publication statuses are both `PUBLISHED`.

The scenario intentionally uses fixture data and the same manufacturing functions used by the API route. Adding another PST should require new configuration/library data, not a new product branch in the builder or customer renderer.