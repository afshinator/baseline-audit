# Hand verification of the 2026-10-29 benchmark

Companion to [2026-10-29.md](2026-10-29.md). The pre-registered rule (decided before the run, in the repo's own plan) was:

> publish a positive result only if **at least one `swap` survives hand-verification** and the ratio of **confirmed swaps to false positives is at least 2:1**; otherwise publish the negative result.

## Outcome: negative result

- Confirmed clean swaps: **0**
- Mapped dependencies examined: 22 across 4 repos
- `check`/`blocked`/`keep` verdicts that survived inspection: **22 of 22**

The threshold is not met. What follows is the evidence, including the one place where the tool was right and this author was wrong.

## The first run produced four `swap` verdicts. All four were wrong.

| Verdict | Package | What the source actually does | Correct outcome |
|---|---|---|---|
| swap | `pluralize` | `pluralize('frame', n, true)` — generates a word form | cannot be replaced: `Intl.PluralRules` selects a category, it does not inflect words |
| swap | `pluralize` (second repo) | `pluralize(role)`, `pluralize(lowerFirst(modelName))` — derives endpoint names | same |
| swap | `node-fetch` | `err instanceof FetchError`, plus `timeout: 5000` | global `fetch` throws `TypeError`; option shape differs |
| swap | `query-string` | `queryString.stringify({ ...p, skipEmptyString: true })` | `URLSearchParams` has no `skipEmptyString`; not a clean swap |

Root cause: those rows carried no keep-signals, so "no signal found" was read as "nothing blocks it". That is the failure mode the `usage_analyzed` flag and the `partial` marker exist to prevent, and it was a real defect in the table.

## What changed as a result

`data/overrides.json`:

- `pluralize` — `partial: true`, keep-signals `pluralize(`, `.plural(`, `.singular(`. The platform genuinely cannot do word-form inflection, so this row can never be a clean swap.
- `node-fetch` — keep-signals `FetchError`, `.buffer(`, and the option shapes `agent:`, `timeout:`, `size:`.
- `query-string` — keep-signals `arrayFormat`, `skipEmpty`/`skipNull`, `allowDots`, `sort:`, `depth:`, `strict:`.
- `partial: true` was **removed** from `node-fetch` and `query-string` after review: an unconditional cap would hide legitimate swaps for repos that only use the covered subset. Only keep-signals should decide.

After the fix, all four rows come back `check` in the same repos, with the blocking call site named.

## Where the tool beat the human

`query-string` in repo R3: reading `app/utils/routeHelpers.ts` alone suggested a clean swap (flat `parse`/`stringify` only). The audit's keep-signal hit `skipEmptyString` in two other files that import the package (`app/scenes/Drafts.tsx`, `app/scenes/Search/Search.tsx`), which makes it a `check`. The grep was right and the manual read was incomplete — the opposite direction of error from the four above.

## Per repo, after the fixes

| Repo | Mapped | Outcome | Independently confirmed |
|---|---|---|---|
| R1 | 6 | all `blocked` | declared chrome 27 / edge 18 / ios 10.x floor; `axios` in `src/hooks/*`, both observers in `src/lib/legacy/` |
| R2 | 7 | 3 `check`, 4 `blocked` | `moment`, `@floating-ui/*`, `@popperjs/core` blocked because Temporal and anchor positioning are not in Safari; `pluralize`, `date-fns`, `lodash` checked on real call sites |
| R3 | 9 | 6 `check`, 3 `blocked` | `node-fetch` and `query-string` checked as described above; `@radix-ui/*` blocked by `ios_saf 17.4 < 18.3` |
| R4 | 0 | no findings | control repo with no production dependencies; included so the sample is not all positives |

## What this result means

The tool's **blocked** verdicts are its strongest output: they are arithmetic against declared targets, and every one held up. Its **swap** verdicts are only as good as the keep-signal list behind them, which is why rows without one can no longer be reported as a swap at all.

The honest headline for this sample is: *four production web apps, 432 dependencies, 22 candidates, zero clean swaps.* Anything larger would be cherry-picking.
