# Property Map

An interactive property portfolio workspace based on the reviewed mockups. Includes a runnable Python/SQLite application and a self-contained browser preview.

## Developer first read

Start with [`docs/PROJECT_MINDMAP.md`](docs/PROJECT_MINDMAP.md) for the system map, runtime choices, domain model, invariants, and the shortest path to the right source file.

## Open the preview

Open `Property-Map.html` in a current desktop browser. This file contains all scripts and geographic data; an internet connection is not required. Projects and settings are saved to that browser's local storage. Export files are saved in IndexedDB. Use **Settings → Data & backups** to download your editable project data. The preview is a single-user edition: it does not provide shared access or authentication.

## Run the full application

Requires Python 3.10 or later. No Python packages need to be installed.

```bash
python server.py
```

Open http://127.0.0.1:8000. The default local edition stores projects in `data/property-map.sqlite3`. Its local administrator is a preview identity. The local edition is deliberately restricted to loopback binding.

## Shared team edition

Use a new persistent data directory, an administrator email and a strong initial password. Pass the password through your deployment secret manager or a secure environment-variable prompt; do not commit it.

Required environment variables:

| Variable | Value |
| --- | --- |
| `PROPERTY_MAP_MODE` | `shared` |
| `PROPERTY_MAP_DATA` | An absolute persistent data-directory path |
| `PROPERTY_MAP_ADMIN_EMAIL` | Initial administrator's email |
| `PROPERTY_MAP_ADMIN_PASSWORD` | Initial password, at least 12 characters |
| `PROPERTY_MAP_SECURE_COOKIE` | `1` when accessed over HTTPS |

Start the server with:

```bash
python server.py --host 0.0.0.0 --port 8000
```

Place it behind an HTTPS reverse proxy and mount the data directory on durable storage. The included Dockerfile provides a container entry point. The server edition has **not been deployed**. The standalone preview is published to GitHub Pages by `.github/workflows/pages.yml` on every push to `main`.

The app supplies its own email/password accounts; ChatGPT workspace SSO is not integrated. Administrators create accounts in **Team & access** (shown only to administrators of the shared edition), then grant Viewer or Contributor access per project. Administrators can access all projects. No invitation emails are sent. Password-reset and SSO workflows are future integration work. If you switch an existing local database to shared mode, a real administrator is created and the local preview identity cannot sign in.

## Working features

- Country selection and interactive state/province polygons for 250 Natural Earth country/territory datasets.
- State selection through the map or dropdown; linked US county dropdowns; manual district entry elsewhere.
- Project creation, persistent property creation/editing/deletion, duplicate-code checks and paired latitude/longitude validation.
- Property count, regional status and coordinate-location views; regional classification and competition outlines.
- Classic, Ocean and Earth palettes; custom hex/color pickers; locally generated color-harmony palettes based on mood keywords. Project map legends can be added, renamed, recolored, deleted, assigned to properties, and applied to dynamically loaded states or provinces for any selected country. Palette generation is procedural, not an AI model call.
- Account, team and project custom-field configuration. Text, number, date, dropdown and checkbox types; required fields; status conditions; visibility and edit permissions. Core fields are fixed.
- Account-default → team → project field precedence. Locked account fields cannot be overridden by a lower layer. Editing a property enforces newly required fields; unchanged historical rows do not prevent unrelated updates.
- Team labels can be managed without exposing user identity in the application shell. In shared mode, authentication and project permissions remain server-enforced; team labels do not automatically grant access.
- Complete exports default to all project properties, with an explicit filtered-view option. In the detailed layout, every property gets an unwrapped row, and the report widens to show full field values, including configured fields. PDF has a map page and numbered directory pages. The detailed PNG layout makes one continuous image when it fits; larger reports download as a ZIP of numbered PNG images. A separate single-image PNG layout keeps a large map on the left and groups every property code and full name by country/state on the right, adding list columns or height as needed. The single-image option reports a browser image-limit error rather than hiding properties when a portfolio exceeds the limit; choose HD or the detailed paginated layout in that case. HD and 4K control detail scale. The map shows the selected country and each directory follows the chosen export scope.
- Save PDF, PNG, or numbered PNG ZIP exports to existing projects or a new snapshot project; re-download previous exports.
- CSV export and portable JSON backup/import. JSON backups contain editable data, not PNG/PDF bytes. Imported projects receive new IDs and do not replace existing projects.
- Responsive layouts, keyboard-accessible map regions, labeled controls and focus-trapped dialogs.

## Data and geographic limitations

Sample property names are transcribed from the supplied reference; codes other than V227, V174 and V168 are illustrative. Sample property coordinates are empty intentionally. The listed source rows add up to **44** properties although the reference header states 45; the application computes totals from records.

Natural Earth admin-1 data was retrieved on 1 October 2026 and simplified for display. It contains 250 country/territory groups and 4,588 named regions. Administrative boundaries may be generalized, disputed or older than current official boundaries. US counties are from the us-atlas 2017 dataset. District polygons outside the United States and address geocoding are not included. Coordinate pins use entered values; they are not automatically geocoded or validated against region polygons.

The application stores custom-field visibility on the server and filters hidden values before responding. Browser-preview role settings are design configuration, not a security boundary.

## Source layout

- `public/app.js`: application, maps, dialogs, export rendering and offline storage adapter.
- `public/styles.css`: responsive visual system built on design tokens; rules in `docs/UI_STANDARDS.md`.
- `public/data/`: bundled geographic data.
- `public/vendor/`: pinned browser libraries and Material Symbols icon paths.
- `server.py`: HTTP API, SQLite storage, password hashing, sessions, ACLs and optimistic version checks.
- `seed.py`: sample projects and defaults.
- `build_preview.py`: generates the standalone HTML preview.
- `prepare_data.py` and `normalize_geo.cjs`: optional geographic-data build pipeline (run normalization after preparing fresh boundaries).
- `tests/test_server.py`: backend permission, validation and conflict tests.
- `tests/e2e.cjs`: browser workflow checks (requires Playwright and Chromium).
- `tests/accessibility_extreme.cjs`: axe, keyboard semantics, pagination deletion, 320px, and empty-workspace checks.

## Tests

```bash
python3 tests/test_server.py
npm install
npm run test:e2e
npm run test:shared
npm run test:a11y
npm run test:exports
```

The browser suites use the local Playwright dependency, or resolve it from `CODEX_PRIMARY_RUNTIME_NODE_MODULES` when supplied, and accept `CHROMIUM_PATH`; without it they use Playwright's own Chromium (`npx playwright install chromium`). They use temporary SQLite directories and do not modify production records.

## Deployment considerations

The bundled server is a compact reference implementation for review and small internal deployments behind an HTTPS proxy. Validate it against your organization's hosting, identity, retention and backup requirements before storing operational data. It does not include SSO, password reset, background jobs, multi-instance database coordination or a built-in AI provider. For larger multi-team deployments, migrate to your standard application server, managed database and identity provider.

## Third-party notices

See `THIRD_PARTY_NOTICES.md`. The original third-party licenses are included with the browser libraries.
