# baseline-audit

A skill for coding agents that answers one question per installed npm package: **does the browser already do this, is the swap safe for my users, and do I use the parts it can't replace?**

It exists because `npm audit` covers security and nothing covers relevance. Libraries installed for gaps the web platform has since closed keep shipping to users forever. This tool lists the candidates, prices them, checks their Baseline status against a real browser target set, and flags the library-specific behaviour that a naive find-and-replace would silently break.

Read-only by design: it never edits your project and never writes a browserslist config.

## Quick start

```bash
# install: clone into an agent skills directory
git clone https://github.com/afshinator/baseline-audit.git ~/.agents/skills/baseline-audit

# verify it works (124 invariants, no network)
node ~/.agents/skills/baseline-audit/scripts/audit.mjs --selfcheck

# or run it directly, without an agent
node ~/.agents/skills/baseline-audit/scripts/audit.mjs ~/code/my-app
```

Requires Node ≥ 18. Network is used only for package sizes; `--no-size` runs fully offline.

## Sample prompt

If you are new to this repo, this is the whole point of it — paste something like this into your agent:

> Use the baseline-audit skill on `./my-app`. Which of my production dependencies can the browser handle natively today, how much would each swap save in gzipped bytes, and which ones should I leave alone because I'm relying on features the platform doesn't replace? My audience is modern browsers only, so treat Baseline Widely available as safe. Don't change any code — I want the report first.

Useful variants:

> Audit `./apps/web` for dependencies that only exist because of older browsers, then show me the one swap with the best size-to-risk ratio.

> We support a long tail of old Android devices. Re-run the audit with `--targets "chrome 87, safari 14, ios_saf 14"` and tell me what that rules out.

## What you get

```
targets: chrome 124, edge 124, firefox 125, safari 17.4, ios_saf 17.4
targets source: --targets  [ASSUMED — not from project config]
prod deps: 7 · mapped: 7 · unmapped: 0 · feature data: web-features@3.44.0 (2026-10-28)

| package | ver | gz | replacement | baseline | audience | imports | net gz | verdict |
| lodash.clonedeep | 4.5.0 | 3.3K | structuredClone | widely | ok | 1 | 3.3K | swap |
| axios | 1.7.7 | 13.6K | fetch + AbortSignal.timeout | widely/widely | ok | 1 | 13.6K | check |
| humanize-duration | 3.35.0 | 6.7K | Intl.DurationFormat | newly | no (chrome 124 < 129) | 0 | 6.7K | blocked |
| dayjs | 1.11.23 | 3.0K | Temporal | limited | no (chrome 124 < 144) | 0 | -41.1K | blocked |
```

| Verdict | Meaning |
|---|---|
| `swap` | Baseline-safe for the targets, no library-specific usage found |
| `check` | Partial replacement, or the repo uses a feature the platform lacks |
| `blocked` | Replacement unsupported by at least one target browser |
| `blocked-cost` | The polyfill costs more than the library it replaces |
| `unverified` | No comparable engine in the target set |
| `keep` | No Baseline-represented replacement exists |

Plus a usage section naming the file and call that blocks each drop, a watchlist with revisit dates, and an explicit list of dependencies the table has no opinion on.

## The three questions behind every verdict

1. **Is the replacement Baseline-safe for my audience?** A feature that is Baseline *Widely* available can be used. One that is only *Newly* available needs your traffic checked. One that is *Limited* is not a swap.
2. **What does the swap cost?** If the polyfill outweighs the library, the bundle gets bigger. This is why `dayjs → Temporal` shows a −41.1K net today.
3. **Does the platform cover how I actually use it?** `fetch` has no interceptors, retries, or upload progress. `structuredClone` throws on functions. A grep for the specific API surface decides this row.

## Targets are the input that matters — and often a no-op

With no browserslist config the audit assumes Baseline-Widely targets and marks the report `[ASSUMED]`. That is not the same as "safe for your users", and it also means the audience column adds nothing beyond the Baseline column.

The gate changes a verdict only when a project declares a browser floor **older** than the feature's own support version. Measured against the 45 mapped packages that have feature data:

| Project floor | Rows whose verdict differs from a Baseline-Widely run |
|---|---|
| Baseline-Widely (chrome 124 / ios 17.4) | 0 of 45 — the gate is a no-op by construction |
| chrome 100 / safari 15 (2023-era) | 11 of 45 |
| chrome 87 / safari 14 (2021-era) | 11 of 45 (the same rows) |

The 11: `axios`, `a11y-dialog`, `focus-trap`, `focus-trap-react`, `body-scroll-lock`, `react-modal`, `@radix-ui/react-dialog`, `lodash.clonedeep`, `clone-deep`, `lodash.groupby`, `smoothscroll-polyfill`.

So the honest claim is narrow: **this tool prevents wrong swaps for projects with a declared legacy floor.** For a project with no config, or one at Baseline-Widely, the gate cannot change anything — and the report should be read as "safe for Baseline-Widely targets", nothing more. Empirically that is most projects: of 30 public repos probed on 2026-10-28 (32 attempted; 2 have no root `package.json`), 6 declared a browserslist config at all (2 in `package.json`, 4 in `.browserslistrc`), and only `jellyfin/jellyfin-web` declared a genuinely legacy floor. The rest either declared nothing or declared something permissive.

See [references/targets.md](references/targets.md) for how to establish a real target set, why adding a browserslist config is a build change (Next silently changes CSS and JS transform targets), and the `ios_saf` blind spot that has already produced one false pass.

## Data freshness

Verdicts come from `data/web-features.json`, a dated 241KB slice of [web-features](https://github.com/web-platform-dx/web-features). The audit prints the snapshot version and warns on stderr once the data is older than 120 days.

```bash
node scripts/refresh-data.mjs                                   # pull latest from unpkg
node scripts/refresh-data.mjs --from path/to/web-features/data.json
node scripts/audit.mjs --selfcheck                              # re-validate after refreshing
```

Feature statuses age from *Limited* to *Newly* to *Widely* (30 months after landing), so a stale snapshot quietly under-reports available swaps. The staleness warning is deliberately in the script rather than in CI: every consumer — clone, fork, agent — sees it, whereas a scheduled workflow would not reach them (and GitHub disables scheduled workflows in public repos after 60 days of inactivity, and in forks by default).

`data/mappings.json` is hand-curated and decays faster than the feature data. It holds 48 package → feature mappings with keep-signals and polyfill costs. `--selfcheck` fails if any row references a feature id that no longer exists.

## What this does not do

- It does not migrate your code, or prove a swap behaves identically.
- It does not measure your real bundle. Sizes are Bundlephobia's published package size; tree-shaking makes your actual cost lower. Confirm with a bundle analyzer before claiming a win.
- It does not invent replacements. 48 packages are mapped; anything else is reported as unmapped rather than guessed.
- It does not run on a schedule. Nothing does. Run it deliberately, ideally quarterly.

## Limitations worth knowing

- Package sizes come from a third-party API that is occasionally slow and returns `403 BlocklistedPackageError` for a few packages; those rows show `?` instead of a number.
- Version resolution needs `node_modules`, a `package-lock.json`, or exact pins in `package.json`. Ranges without a lockfile produce `?` sizes.
- Next.js rewrites Babel/SWC/CSS output from browserslist, so treat "add a browserslist config" as build work, not audit work.

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE): the bundled feature data derives from web-features (Apache-2.0) and @mdn/browser-compat-data (CC0-1.0).
