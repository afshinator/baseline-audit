# Verification report

Generated 2026-10-29 by `node scripts/verify-claims.mjs` (--offline).
Every row below recomputes or re-fetches the value; no number is remembered. Re-run to re-check.

**17 passed, 0 failed, 3 skipped.**

| ID | Claim | Result | Evidence |
|---|---|---|---|
| D1 | Feature snapshot is a real, dated web-features release | **PASS** | web-features@3.44.0 (npm latest: n/a offline), 1219 features, 241KB, refreshed 2026-10-28 |
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
| C1 | Docs quote the same numbers the checks compute | **PASS** | README and docs/competitive-landscape.md agree with the computed values |
| C2 | SKILL.md frontmatter is valid for agent-skill discovery | **PASS** | name=baseline-audit, description 548/1024 chars |
| C5 | Docs quote the real self-check count | **PASS** | selfcheck 420/420; docs quote no fixed count (it scales with the mapping table) |
| E8 | Baseline-Widely minimum versions quoted in references/targets.md | **SKIP** | skipped (rate limit or offline) |
| E9 | Next.js browserslist behaviour claimed in references/targets.md | **SKIP** | skipped (rate limit or offline) |
| C4 | youmightnotneed rule counts quoted in the landscape doc | **SKIP** | skipped (rate limit or offline) |
| C3 | License and attribution files are present and correct | **PASS** | Apache-2.0 text present; NOTICE credits web-features + browser-compat-data |

## What this does not verify

- UNVERIFIED: whether a PyPI or crates.io equivalent exists (no supported search API was used).
- UNVERIFIED: import presence in repos where the GitHub code-search rate limit was exhausted.
- Judgement, not measurement: which repos are representative, and whether a benchmark sample is cherry-picked.
