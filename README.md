# Product HeatMap

A property portfolio workspace with country and continent maps, project management, CSV imports, custom fields, and PNG/PDF exports. Python's standard library and SQLite power the local server; browser libraries and geography are bundled for offline use.

The only starter project is **Demo Property Portfolio**: 44 fictional properties across 11 US states. Names, codes, addresses, and notes are mock information. Coordinates are blank so fictional addresses cannot be mistaken for verified locations.

## Run locally

Requires Python 3.10 or newer. No Python packages are required.

```sh
python3 server.py
```

Open <http://127.0.0.1:8000>. Local mode has one administrator identity and binds only to loopback. SQLite data lives in `data/property-map.sqlite3`. Set `PROPERTY_MAP_DATA` to choose another persistent directory. New databases receive the demo once; restarting preserves subsequent edits.

## Standalone demo and GitHub Pages

```sh
python3 build_preview.py
```

Open the generated `Property-Map.html`. Scripts, libraries, and maps are embedded. Editable data stays in localStorage; exported files stay in IndexedDB. This edition is single user and has no authentication or shared storage.

This clean demo release uses `property-map-demo-v1` and `property-map-demo-files-v1` for browser storage. On first open, it removes the previous release's project cache and export database. Later edits to the demo persist normally.

Pushing to `main` triggers `.github/workflows/pages.yml`, which rebuilds and publishes the standalone edition to GitHub Pages. It publishes mock seed data, never local SQLite databases.

## Shared edition

The existing shared edition is intended for a trusted private network. Administrators use a password; members use an `@igt.com` email without mailbox verification. **Public multiuser production deployment requires verified authentication or an identity-aware access proxy.** HTTPS alone does not verify member identities. The standard-library server also requires a deployment-appropriate reverse proxy and process supervision for a hosted service.

For a private deployment, set:

| Variable | Purpose |
| --- | --- |
| `PROPERTY_MAP_MODE=shared` | Enable shared accounts and project permissions |
| `PROPERTY_MAP_DATA` | Persistent SQLite directory |
| `PROPERTY_MAP_ADMIN_EMAIL` | Initial admin email; defaults to `admin@igt.com` |
| `PROPERTY_MAP_ADMIN_PASSWORD` | Initial admin password, at least 12 characters |
| `PROPERTY_MAP_SECURE_COOKIE=1` | Secure session cookies when served behind HTTPS |

Then run `python3 server.py --host 0.0.0.0 --port 8000`. The initial password is used only when creating the first admin. Open `/admin` for administrator sign-in and `/` for member access. Members receive private workspaces; owners and administrators manage Viewer/Contributor membership. Version checks reject conflicting edits. Account deletion removes that account's owned workspaces and exports.

The macOS and Windows launchers guide private shared setup. The Dockerfile runs as a non-root user, expects these environment variables, persists `/data`, and enables secure cookies by default. Supply credentials at runtime; keep the service behind the private network/access proxy.

## Development and checks

Requires Node.js and the development dependencies for browser checks:

```sh
npm ci
npx playwright install chromium
npm test
npm run test:e2e
npm run test:exports
npm run test:continents
npm run test:shared
npm run test:storage
npm run test:a11y
```

GitHub Actions runs these checks on pull requests and pushes to `main`.

Additional geography and export regressions:

```sh
node tests/continent_loading.cjs
node tests/export_labels.cjs
```

Set `CHROMIUM_PATH` to use an existing Chromium executable. Build the standalone HTML before tests that open it. Test servers use temporary databases. Screenshots and exported test files are ignored by Git.

## Source layout

| Path | Responsibility |
| --- | --- |
| `public/app.js` | UI, maps, imports, and browser/server storage adapter |
| `public/export-engine.js` | Complete PNG and PDF layouts |
| `public/styles.css` | Responsive styling and design tokens |
| `public/data/` | Required worldwide geography and country indexes |
| `public/vendor/` | Bundled runtime libraries and licenses |
| `server.py` | HTTP API, SQLite, sessions, validation, and permissions |
| `seed.py` | Deterministic fictional demo and configuration defaults |
| `build_preview.py` | Reproducible standalone HTML build |
| `build_world.py` | World geometry generation from bundled country data |
| `prepare_data.py`, `normalize_geo.cjs` | Geographic source preparation and polygon winding |
| `tests/` | Backend and browser regression suites |

Read [the project mind map](docs/PROJECT_MINDMAP.md) before implementation changes and [UI standards](docs/UI_STANDARDS.md) before visual changes. Edit sources and rebuild; do not edit generated HTML.

## Data and deployment limits

Geographic boundaries are generalized Natural Earth admin-1 data; US location labels use the bundled us-atlas county dataset. Boundaries can differ from current official records. City names outside the US are manual text; coordinates are neither geocoded nor validated against region polygons. Property dots represent counts within a region, not verified locations.

Download JSON backups from Settings for editable records. They do not include export file bytes; back up the SQLite database separately for the server edition. Custom-field visibility and project permissions are enforced by the server; standalone role settings do not provide a security boundary.

See [third-party notices](THIRD_PARTY_NOTICES.md) for bundled dependencies and geography attribution.
