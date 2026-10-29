# Verification report

Generated 2026-10-29 by `node scripts/verify-claims.mjs`.
Every row below recomputes or re-fetches the value; no number is remembered. Re-run to re-check.

**30 passed, 0 failed, 0 skipped.**

| ID | Claim | Result | Evidence |
|---|---|---|---|
| D1 | Feature snapshot is a real, dated web-features release | **PASS** | web-features@3.44.0 (npm latest: 3.44.0), 1219 features, 241KB, refreshed 2026-10-28 |
| D2 | Headline feature statuses match the claims in README/docs | **PASS** | dialog is Baseline widely; popover is newly available and iOS needs 18.3; intl-duration-format needs Chrome 129; temporal is not Baseline, Chrome 144; array-group is widely available since 2026-09-05; anchor-positioning is not Baseline |
| D3 | Mapping table is internally consistent | **PASS** | 328 packages (326 with a feature id), 0 duplicates, 336 feature refs resolve, 70 keep-signal regexes compile; README agrees |
| D4 | Audience-gate arithmetic quoted in README | **PASS** | 326 rows, 290 pass at Baseline-Widely, 26 flip at chrome 100, 31 at chrome 87, 0 at Baseline-Widely; docs quote all of it |
| B1 | Self-check passes and covers the alias fixture | **PASS** | 420/420 checks pass |
| B2 | A declared legacy floor flips the verdict (the whole thesis) | **PASS** | chrome 100/safari 15 → blocked; Baseline-Widely targets → swap; header marks project config |
| B3 | Keep-signals are found through a re-export wrapper | **PASS** | verdict check, signal reported as "(through a re-export)" |
| B4 | Version resolution: lockfile, node_modules, exact pin, bun.lock ranges | **PASS** | exact pin → 1.7.7; bun.lock + range → unresolved (no invented version) |
| B5 | Audit never writes to the audited repo | **PASS** | checksums unchanged; 3 write call(s), all to CACHE_FILE or self-check fixtures, none to the audited dir |
| B6 | Stale snapshot produces a loud warning | **PASS** | backdated snapshot warns on stderr and in the report |
| B7 | Resolved targets collapse to the oldest version per engine | **PASS** | 10 engines, one version each: targets: and_chr 156, and_ff 158, android 156, chrome 131, edge 131, firefox 132, ios_saf 18.2, opera 115, safari 18.2,  |
| B8 | An unresolvable --query fails loudly instead of falling back | **PASS** | exit 1 with an explicit error |
| B9 | Dependencies with no import site are called out, not silently swapped | **PASS** | section present and names the package |
| E1 | Bundlephobia gzip figures quoted for pinned versions | **PASS** | 11 pinned sizes unchanged; Temporal polyfill 45167B = 14.8x dayjs |
| E2 | npm facts cited about prior art | **PASS** | module-replacements 3.4.0 1055956/wk; youmightnotneed 0.4.0 5/wk; eslint-plugin-compat 1344100/wk |
| E3 | e18e native manifest carries feature ids and per-engine floors | **PASS** | 205 replacements (object keyed by id), 153 with webFeatureId, 187 with per-engine minVersion |
| E4 | Repo probe sample: 32 repos, 6 with browserslist configs | **PASS** | 32 attempted, 30 with a root package.json, 6 configs, 28 lockfiles, 16 with a mapped dep |
| E5 | Named candidate repos declare the targets the docs claim | **PASS** | jellyfin → chrome 27 / edge 18 / lowest ios_saf 10.0-10.2; outline → chrome 109 / ios_saf 16.6; chatwoot rc = defaults |
| E6 | Import sites exist where the shortlist claims they do | **PASS** | jellyfin axios 10 source hits; outline pluralize 7; grafana moment 10 |
| E7 | Published repo HEAD matches local HEAD | **PASS** | HEAD 5461c51 on origin/main |
| C1 | Docs quote the same numbers the checks compute | **PASS** | README and docs/competitive-landscape.md agree with the computed values |
| E10 | Committed benchmark report matches its machine-readable JSON | **PASS** | 2026-10-29.json: 4 repos, 432 deps, 22 mapped, 0 swap, 9 check, 13 blocked — report matches JSON |
| C6 | No stale verification count quoted in the docs | **PASS** | docs quote no fixed count |
| E11 | Tailwind claim in references/targets.md (no browserslist, hardcoded CSS targets) | **PASS** | @tailwindcss/node@4.3.3: hardcoded targets safari 16.1 / ios 16.1 / firefox 128 / chrome 111, zero browserslist references |
| C2 | SKILL.md frontmatter is valid for agent-skill discovery | **PASS** | name=baseline-audit, description 548/1024 chars |
| C5 | Docs quote the real self-check count | **PASS** | selfcheck 420/420; docs quote no fixed count (it scales with the mapping table) |
| E8 | Baseline-Widely minimum versions quoted in references/targets.md | **PASS** | browserslist "baseline widely available" → chrome 124, edge 124, firefox 125, safari 17.4, ios_saf 17.4 |
| E9 | Next.js browserslist behaviour claimed in references/targets.md | **PASS** | next@16.1.6: loadConfig({path, env}) inside try/catch, defaults chrome 111 / edge 111 / firefox 111 / safari 16.4 |
| C4 | youmightnotneed rule counts quoted in the landscape doc | **PASS** | 81 published rule pages, 82 rule ids in source, both quoted correctly |
| C3 | License and attribution files are present and correct | **PASS** | Apache-2.0 text present; NOTICE credits web-features + browser-compat-data |

## What this does not verify

- UNVERIFIED: whether a PyPI or crates.io equivalent exists (no supported search API was used).
- UNVERIFIED: import presence in repos where the GitHub code-search rate limit was exhausted.
- Judgement, not measurement: which repos are representative, and whether a benchmark sample is cherry-picked.
