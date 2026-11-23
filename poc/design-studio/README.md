# Vendored Design Studio host

This directory is the **host half** of [`dsh-design-studio@0.29.0`](https://github.com/OrderG-X/dsh-design-studio),
vendored under its MIT license (see `LICENSE`) and merged into the `dsh-workbench` POC plugin.

- `lib/` — unmodified upstream host code (preview servers, `/dsh-design-studio/api/*`,
  design tools and the `ui-design` skill provider).
- `skills/`, `locale/`, `icon.svg` — upstream assets used by the host/skill.
- `package.json` — trimmed to name/version/type so the host can read its version;
  the upstream bundle/client declarations are intentionally removed because the workbench
  plugin owns mounting.

The **client half** is forked at `../client.design-studio.js` (not inside this directory),
because DSH only serves package-local client chunks next to `client.js`. Its changes are:

1. Registers as `dsh-workbench` chunk `client.design-studio.js`.
2. `apply(ctx, { embed: { kind } })` skips its own right-sidebar tab registration and makes
   its header button open the workbench tab kind.
3. In embedded mode it does not register the `/design-library` command (the workbench hides
   the design library/home).
4. Exports `PreviewTab` and `makeT` so the workbench can compose the canvas with the
   requirement bar.

To upgrade: replace `lib/`, `skills/`, `locale/`, `icon.svg` and `package.json` version from the
new upstream release, then re-apply the four client changes above to the new
`lib/client.js` and update `../client.design-studio.js`. Run the POC UI check afterwards
(see `../../docs/POC结论.md`).

## Workbench integration (outside this directory)

- `../index.js` mounts only the host and the `preview_page` / `check_design` / `look_design`
  tools (plus the `ui-design` skill). The handoff/compare/brand/photos/style/frames/system
  tools are intentionally not exposed.
- `../client.js` renders the workbench's own design empty state when no preview target exists,
  auto-opens the newest HTML in the requirement folder, and hides the Design Studio toolbar
  entries that do not fit the workbench (home, appearance, export, paint, trial, version,
  phone preview, market/library).
- Design delivery and version records live in the workbench store (`designVersions`), not in
  Design Studio's own history.
