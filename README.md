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

### Windows one-click shared launcher

Double-click `Run-Property-Map.bat`. On its first run, the launcher asks for an administrator password of at least 12 characters, creates `shared-data/property-map.sqlite3`, starts the shared server, and opens http://127.0.0.1:8000. Open http://127.0.0.1:8000/admin for administrator access. Keep the command window open while using the application and press **Ctrl+C** there to stop it.

The launcher stores application data locally in `shared-data/`; it does not save the cleartext administrator password in the BAT file. The initial password is requested only when the database does not yet exist.

### macOS one-click shared launcher

Double-click `Run-Property-Map.command` in Finder. On its first run, the launcher securely requests an administrator password of at least 12 characters. It then creates or reuses `shared-data/property-map.sqlite3`, starts the shared server, and opens http://127.0.0.1:8000 in the default browser. Open http://127.0.0.1:8000/admin for administrator access. Keep the Terminal window open and press **Control+C** there to stop the server.

If macOS reports that the launcher cannot be executed after copying or downloading it, open Terminal in the project folder once and run `chmod +x Run-Property-Map.command`.

## Shared team edition

Use a persistent local data directory, an `@igt.com` administrator email and a strong initial password. Pass the password through a secure environment-variable prompt; do not commit it. SQLite remains the only database and the database file stays on the computer running the application.

Required environment variables:

| Variable | Value |
| --- | --- |
| `PROPERTY_MAP_MODE` | `shared` |
| `PROPERTY_MAP_DATA` | An absolute persistent data-directory path |
| `PROPERTY_MAP_ADMIN_EMAIL` | Initial administrator's `@igt.com` email, such as `vivek.r@igt.com` |
| `PROPERTY_MAP_ADMIN_PASSWORD` | Initial password, at least 12 characters |
| `PROPERTY_MAP_SECURE_COOKIE` | `1` when accessed over HTTPS |

Start the server for access on the same computer with:

```bash
python server.py
```

To allow trusted local-network devices to connect, use `python server.py --host 0.0.0.0 --port 8000` and apply the network protections described below.

For access only from the same computer, keep the default `127.0.0.1` host. For other users on a trusted local network, bind to `0.0.0.0`, protect access with the machine firewall, and use an HTTPS reverse proxy before entering real account information. The included Dockerfile provides a container entry point. The server edition has **not been deployed**. The standalone preview is published to GitHub Pages by `.github/workflows/pages.yml` on every push to `main`; GitHub Pages does not host the SQLite database or authenticated accounts.

Open `/admin` to sign in as the administrator with the configured `@igt.com` email and password. The password is PBKDF2-hashed in SQLite and is never returned by the API. At the normal `/` URL, members enter only their `@igt.com` email. An existing member opens their workspace; a new address creates an email-only member account and private personal workspace automatically. This temporary email-only flow does not verify mailbox ownership, so use it only in a trusted local environment.

Administrators create, edit, deactivate, or delete accounts in **Team & access**. Administrators can access all projects; other users see only workspaces they own or projects explicitly shared with them as Viewer or Contributor. Open, unedited screens check the local server for saved changes every 15 seconds; project versions still prevent silent overwrites. No invitation emails are sent. SSO or email verification is future integration work. Deleting an account permanently deletes the projects and exports it owns.

## Working features

- World and country map selection using the bundled Natural Earth geography. The World view aggregates properties by country across all four map styles, renders each country as one solid silhouette without internal state/province strokes, and drills into the existing state/province perspective when a country is selected.
- State selection through the map or dropdown; one City field, shown as a linked dropdown for the bundled US location list and as manual entry elsewhere.
- Project creation, persistent property creation/editing/deletion, duplicate-code checks and paired latitude/longitude validation.
- Regional classification and competition outlines.
- Classic, Ocean and Earth palettes; custom hex/color pickers; locally generated color-harmony palettes based on mood keywords. Project map legends can be added, renamed, recolored, deleted, assigned to properties, and applied to dynamically loaded states or provinces for any selected country. Palette generation is procedural, not an AI model call.
- Account, team and project custom-field configuration. Text, number, date, dropdown and checkbox types; required fields; status conditions; visibility and edit permissions. Core fields are fixed.
- Account-default → team → project field precedence. Locked account fields cannot be overridden by a lower layer. Editing a property enforces newly required fields; unchanged historical rows do not prevent unrelated updates.
- Team labels can be managed without exposing user identity in the application shell. In shared mode, authentication and project permissions remain server-enforced; team labels do not automatically grant access.
- Four map styles: property count, property dots (one dot per property inside each region, coloured per region; dots show counts, not locations), map legends, and coordinate locations.
- Export is built for pasting into presentations. The PNG export is always **one image**, normally 16:9 at 3840 × 2160, and **Copy image** puts it on the clipboard. A radio-button choice selects either **Country overview**, which uses the same map and “Portfolio at a glance” composition as the PDF cover page, or **Property list beside the map**, which groups every included property by region. The map and list resize to share the slide and long names wrap; only a list that cannot fit at 12px makes the image taller. Checkboxes combine what the map shows (count color shading, property dots, map legends, locations), while **Country count labels (USA 207)** independently adds or removes the combined country/count badges without changing country background colors. An export covers the country shown on the map, so properties the project holds in other countries are left out. Other options: all or filtered properties, light or dark background, legend, date. A full PDF report is the alternative: a map page whose overview panel counts every map legend and every region (one column, or two when there are many), then a table with every field, optionally in a section per state or province. Every export is also saved under Recent exports for the current project.
- CSV import/export and portable JSON backup/import. The Import button beside Add property appends a Download CSV-format file to the current project after validating every row; duplicate property codes or invalid rows reject the entire upload. JSON backups contain editable data, not PNG/PDF bytes. Imported projects receive new IDs and do not replace existing projects.
- Responsive layouts, keyboard-accessible map regions, labeled controls and focus-trapped dialogs.

## Data and geographic limitations

Sample property names are transcribed from the supplied reference; codes other than V227, V174 and V168 are illustrative. Sample property coordinates are empty intentionally. The listed source rows add up to **44** properties although the reference header states 45; the application computes totals from records.

Natural Earth admin-1 data was retrieved on 1 October 2026 and simplified for display. It contains 250 country/territory groups and 4,588 named regions. Administrative boundaries may be generalized, disputed or older than current official boundaries. The US City dropdown is populated from the bundled us-atlas 2017 county-name dataset; it is a selectable location label, not a municipal-boundary dataset. City polygons outside the United States and address geocoding are not included. Coordinate pins use entered values; they are not automatically geocoded or validated against region polygons.

The seeded **CC HeatMap** project is reconstructed from an aggregate image containing 215 properties: 207 in the United States, 6 in Canada and 2 in Uruguay. Each regional count is expanded into placeholder property records because the application stores individual properties. The source did not provide names, statuses, addresses, cities or coordinates, so every generated row records that limitation in Notes and uses Live as the required default classification. The bundled map names Canada's region `Québec`; the country-only Uruguay row is assigned to `Montevideo` as a technical admin-1 placeholder.

The application stores custom-field visibility on the server and filters hidden values before responding. Browser-preview role settings are design configuration, not a security boundary.

## Source layout

- `public/app.js`: application, maps, dialogs, export rendering and offline storage adapter.
- `public/styles.css`: responsive visual system built on design tokens; rules in `docs/UI_STANDARDS.md`.
- `public/data/`: bundled geographic data.
- `build_world.py`: rebuilds the lightweight global country view from the bundled country files.
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
