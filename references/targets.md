# Target sets — the only input that changes verdicts

Every `swap` verdict is a statement about a browser set. Get the set wrong and the audit is noise.

## Where targets come from, in order

1. `--targets "chrome 124, safari 17.4, ios_saf 17.4"` — literal, explicit, no config needed. Wins over everything.
2. `--query "<browserslist query>"` — resolved through the project's `browserslist` binary if installed, else `npx --no-install`.
3. Project config: `.browserslistrc` or a `browserslist` key in `package.json`, resolved with no query.
4. Nothing found → `browserslist "baseline widely available"`, header marked `[ASSUMED]`.

`[ASSUMED]` means the report describes a modern audience, not your audience. Say that out loud when reporting.

## Why not to just add a browserslist config

Verified against `next@16.1.6` on 2026-10-28:

- `dist/build/utils.js` `getSupportedBrowsers()` calls `browserslist.loadConfig({ path: dir, env: dev ? 'development' : 'production' })`.
- The result feeds `dist/build/webpack-config.js` `targets: supportedBrowsers` (CSS via Lightning CSS) and the SWC loader options.
- With no config, Next falls back to `MODERN_BROWSERSLIST_TARGET` = `chrome 111, edge 111, firefox 111, safari 16.4` (comment: generated via `browserslist "baseline widely available"` on 2025-10-01).
- The config load is wrapped in `try {} catch {}`. There is no warning.

So adding a config quietly changes what your build emits. Do that as its own deliberate task, never as a side effect of an audit.

Tailwind v4 does **not** read browserslist: `@tailwindcss/node` hardcodes Lightning CSS targets (`safari 16.1`, `ios_saf 16.1`, `firefox 128`, `chrome 111`). Lightning CSS supports browserslist only opt-in, and Tailwind does not opt in.

## Recording an audience decision

Most projects have no browserslist config, and the audit should not invent one. Decide per project, in writing:

- **Known-modern audience** (internal tool, demo, personal project): audit with `--targets "chrome 124, edge 124, firefox 125, safari 17.4, ios_saf 17.4"` — the current Baseline-Widely minimums. Report the result as "safe for Baseline-Widely targets", never as "safe for your users".
- **Public traffic you do not control**: install a browserslist config deliberately, in its own commit, then re-audit with no `--targets` flag so the header reads `[from project config]`.
- **Mixed**: pass an explicit literal per audit and keep the assumption in the report.

## Known blind spot

`ios_saf` is the binding constraint far more often than desktop Safari. Baseline-Widely iOS (17.4) fails `popover` (needs 18.3). Always include `ios_saf` in the target list; omitting it has already produced a false pass once.
