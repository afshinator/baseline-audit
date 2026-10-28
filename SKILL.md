---
name: baseline-audit
description: Audit a repo's production dependencies for packages the web platform now replaces natively — Intl formatting, fetch, dialog/popover/focus-trap, lodash helpers, date libraries and similar. Answers "can we drop this library?" with Baseline status, gzipped cost, audience safety and the usage that would break. Use when asked whether a package is still needed, to find removable or unused client JS, to check Baseline/newly-available support before shipping native APIs, to size up bundle bloat, or for a quarterly dependency review on a package.json.
compatibility: Requires node >= 18 and a package.json. Network used only for package sizes (optional).
---

# Baseline audit

Answers one question per installed package: **does the browser already do this, is the swap safe for my users, and do I use the parts it can't replace?**

Read-only. It never edits the audited repo and never creates a browserslist config.

## Run

```bash
node scripts/audit.mjs <repo-dir>                        # targets from project config, else assumed
node scripts/audit.mjs <repo-dir> --targets "chrome 124, safari 17.4, ios_saf 17.4"
node scripts/audit.mjs <repo-dir> --query "last 2 years, not dead"
node scripts/audit.mjs <repo-dir> --no-size              # offline, skips gzip measurement
node scripts/audit.mjs <repo-dir> --json                 # machine-readable
node scripts/audit.mjs --selfcheck                       # 121 invariants, no network
```

Default when the repo has no browserslist config: `browserslist "baseline widely available"`, labelled `[ASSUMED]` in the header. Read `references/targets.md` before interpreting that label.

## Verdicts

| Verdict | Meaning | What you do |
|---|---|---|
| `swap` | Baseline-safe for the targets, no library-specific usage found | Remove it; write the native version |
| `check` | Partial replacement, or the repo uses a feature the platform lacks | Read the usage section before touching it |
| `blocked` | Replacement is not supported by at least one target browser | Do not swap; note the revisit date |
| `blocked-cost` | Polyfill costs more than the library it replaces | Do not swap; note the revisit date |
| `unverified` | No comparable engine in the target set | Establish real targets first |
| `keep` | No Baseline-represented replacement exists | Leave it alone |

## Procedure

1. Run the audit on the repo. Report the header line verbatim, especially `[ASSUMED]`.
2. Lead with `swap` rows and the recoverable gzip total. For each, name the platform API and the files that import the package.
3. For each `check` row, read the listed hit and decide keep vs wrap. Never present a `check` as a swap.
4. For each `blocked` row, state the failing browser and version against the target, not just "not supported".
5. Do not swap code unless asked. This skill reports; the migration is separate work.
6. If a package you expect is missing, it is absent from the table: say so and check `data/mappings.json` rather than guessing a replacement.

## Hard rules

- Never say "safe for your users" when the header says `[ASSUMED]`. Say "safe for Baseline-Widely targets."
- Never write or modify a browserslist config as part of this work. In Next it silently changes CSS and JS transform targets.
- Never trust bundlephobia's number as the saving in this repo. It is the published package size, not your tree-shaken slice.
- Never invent a mapping. Unknown package = no verdict.

## Maintaining

- `data/mappings.json` — the package → feature mapping. Hand-curated, decays. Every row must resolve against the dataset; `--selfcheck` enforces that.
- `data/web-features.json` — trimmed snapshot of `web-features`, 241KB, dated. Refresh with `node scripts/refresh-data.mjs` (or `--from <data.json>` offline), then re-run `--selfcheck`.
- Refresh both quarterly. Feature statuses move from `low` to `high` 30 months after landing; a `blocked` row silently becomes a `swap`.
