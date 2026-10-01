# Repository guidance

Before exploring implementation files, read `docs/PROJECT_MINDMAP.md`. Use its “First file to open” table to keep discovery scoped, then verify behavior in the named source and tests.

- Treat `Property-Map.html` as generated output; edit sources and rebuild it with `python3 build_preview.py`.
- Preserve the invariants listed in the mind map unless the task explicitly changes them.
- If architecture, storage, API routes, core invariants, or file ownership changes, update the mind map in the same change.
