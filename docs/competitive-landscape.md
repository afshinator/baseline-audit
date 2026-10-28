# Competitive landscape: dependency → web-platform replacement auditors

Researched 2026-10-28. Every entry below was confirmed by opening the npm registry record, the GitHub repo, or the project's own docs — not a listicle or search snippet. Numbers are live from the endpoints named in [Verification](#verification) and will drift; the command to re-check each is included.

## Summary verdict

**Partial equivalent exists, and it is one project: [`youmightnotneed`](https://github.com/jomaendle/youmightnotneed) (CLI + MCP server + agent skill + site, MIT, v0.4.0, published 2026-10-07).**

It does the package→feature mapping (80 curated rules, Baseline tier derived from `web-features`, gzipped size per package, "keep it if" conditions per rule) but it does **not** do the two things our audit is built around:

1. **Audience gating.** Its detection is a pure function of `package.json`. No repo read, no `browserslist` resolution. `packages/catalog/src/` contains no `node:fs` import and no `browserslist` reference (verified by cloning the repo and grepping). Gating is delegated to the human/agent as prose: ["Where a project states its own support target … that target wins over the tier"](https://github.com/jomaendle/youmightnotneed/blob/main/skills/youmightnotneed/references/reading-a-finding.md).
2. **Usage-signal check.** No grep for library-specific API surface (`axios.interceptors`, `onUploadProgress`). Its own README says *"A dependency in package.json is not proof of what it is used for"* and answers that with hand-written conditions, not code inspection.

Nobody else joins dependency mapping to a resolved browser target set either. The ecosystem splits cleanly: mapping lives in [e18e/module-replacements](https://github.com/e18e/module-replacements) and `youmightnotneed`; browser-target gating lives in [eslint-plugin-compat](https://github.com/amilajack/eslint-plugin-compat) and the CSS linters — but those gate *code you wrote*, never *packages you installed*.

**Nothing anywhere produces a per-dependency verdict (`swap` / `check` / `blocked` / `blocked-cost` / `keep`), and nothing compares polyfill cost to library cost.**

## Findings

`Mapping` = maps an installed package to the platform feature that replaces it. `Gating` = compares that feature's support against *this project's* browser targets. `Usage` = inspects repo code for library-specific API surface.

| # | Tool | What it actually does | Mapping | Gating | Usage | Popularity (week of 2026-10-21) | License | Last release |
|---|---|---|---|---|---|---|---|---|
| 1 | [youmightnotneed](https://github.com/jomaendle/youmightnotneed) | CLI/MCP/skill/site: reads `package.json`, matches package names against 82 rules, reports native replacement + Baseline tier + "keep it if" conditions + "up to N kB" | **yes** (82 rules) | **no** (manual, prose) | **partial** (agent told to grep call sites; no automation) | npm `youmightnotneed` 5/wk; repo 0★ | MIT | 0.4.0, 2026-10-07 |
| 2 | [e18e/module-replacements](https://github.com/e18e/module-replacements) (`module-replacements`) | Data manifest of modules → native/preferred replacement, each native entry carrying a `webFeatureId` + BCD compat key | **yes** (manifest also carries per-engine `minVersion`) | no | no | npm 1,055,956/wk; 1,014★ | MIT | pushed 2026-10-26 |
| 3 | [@e18e/eslint-plugin](https://github.com/e18e/eslint-plugin) / [eslint-plugin-depend](https://github.com/es-tooling/eslint-plugin-depend) | `ban-dependencies` flags imports and `package.json` entries using the manifests above; suggests replacement | **yes** (via manifest) | no (only Node engine ranges) | **partial** (import presence, not API usage) | npm 793,347/wk and 353,642/wk | MIT | pushed 2026-10-27 / 2026-08-04 |
| 4 | [You-Dont-Need-Lodash-Underscore](https://github.com/you-dont-need/You-Dont-Need-Lodash-Underscore) (`eslint-plugin-you-dont-need-lodash-underscore`) | Per-call-site rule pairing lodash/underscore methods with native equivalents (`_.assign` → `Object.assign`) | **partial** (two libs, method→method) | no | **yes** (AST call sites) | npm 350,545/wk; 19,117★ | MIT | 6.14.0, 2024-04-03 |
| 5 | [eslint-plugin-unicorn](https://github.com/sindresorhus/eslint-plugin-unicorn) | Individual `prefer-*` rules encode native swaps (`prefer-structured-clone`, `prefer-date-now`, `prefer-blob-readable-stream`, …) | **partial** (per-API, no dep awareness) | no | **yes** | npm 7,874,718/wk | MIT | actively pushed |
| 6 | [eslint-plugin-baseline-js](https://github.com/3ru/eslint-plugin-baseline-js) | One ESLint rule enforcing Web API + JS builtin Baseline level (`widely`/`newly`/`year`) via `web-features` + `eslint-plugin-es-x` | no | **partial** (Baseline tier, not browserslist) | yes (code, not deps) | npm 67,858/wk; 234★ | MIT | 0.7.6, 2026-10-26 |
| 7 | [stylelint-plugin-use-baseline](https://github.com/ryo-manba/stylelint-plugin-use-baseline) | Stylelint rule disallowing CSS features below a Baseline level | no | **partial** (tier only) | CSS declarations only | npm 18,555/wk; 39★ | MIT | 1.4.8, 2026-10-18 |
| 8 | [Biome `useBaseline` (CSS)](https://biomejs.dev/linter/rules/use-baseline/) | Built-in lint rule: "Baseline (CSS)" — flags CSS not in Baseline | no | **partial** | CSS only | Biome repo 26,018★ | Apache-2.0/MIT | pushed 2026-10-28 |
| 9 | [eslint-plugin-compat](https://github.com/amilajack/eslint-plugin-compat) | Flags Web/ES API usage unsupported by the project's **browserslist** targets (MDN data) | no | **yes** (real browserslist resolution) | **yes** (API calls in source) | npm 1,344,100/wk; 3,186★ | MIT | 7.0.2, 2026-04-29 |
| 10 | [doiuse](https://github.com/anandthakker/doiuse) / [stylelint-no-unsupported-browser-features](https://github.com/RJWadley/stylelint-no-unsupported-browser-features) / [stylelint-browser-compat](https://github.com/3846masa/stylelint-browser-compat) | CSS lint against caniuse × browserslist | no | **yes** | CSS only | npm 677,312 / 320,900 / 26,956 per wk | MIT | 6.0.6, 2025-12-13 |
| 11 | [browserslist-config-baseline](https://github.com/web-platform-dx/browserslist-config-baseline) | A browserslist **config** expressing Baseline widely available | no | **yes** (defines targets, gates nothing) | no | npm 35,439/wk; 60★ | Apache-2.0 | 0.5.0, 2025-08-04 |
| 12 | [baseline-browser-mapping](https://github.com/web-platform-dx/baseline-browser-mapping) | Data lib: browser versions → Baseline feature set | no | no (building block) | no | npm 200,376,639/wk; 65★ | Apache-2.0 | 2.11.34, 2026-10-27 |
| 13 | [web-features](https://github.com/web-platform-dx/web-features) / [compute-baseline](https://github.com/web-platform-dx/web-features/blob/main/packages/compute-baseline) | The dataset we both use; statuses, not audits | no | no | no | npm 2,089,573 / 847 per wk; 952★ | Apache-2.0 | 3.44.0, 2026-10-22 |
| 14 | [baseline-status](https://github.com/web-platform-dx/baseline-status) | `<baseline-status featureId>` display widget | no | no | no | npm 541/wk; 244★ | Apache-2.0 | pushed 2026-08-06 |
| 15 | [@edziocodes/baseline-cli](https://github.com/gaiborjosue/baseline-cli) | AST-scans the project's own JS/TS/CSS/HTML for 40+ Baseline features, fails CI under a `.baselinerc.json` year threshold, scaffolds a GH Action | no | **partial** (Baseline year) | **yes** (AST feature detection) | npm 4/wk; 2★ | MIT | 1.1.1, 2025-10-06 |
| 16 | [baseline-check-tool](https://github.com/rasike-dev/baseline-check-tool) | Claims "AI-powered" Baseline + security + a11y + bundle analysis, VS Code extension, GitHub Action | no | **partial** (claimed threshold) | claimed, **UNVERIFIED** | npm 16/wk | MIT | 2.3.3, 2025-12-04 |
| 17 | [knip](https://github.com/webpro-nl/knip) / [depcheck](https://github.com/depcheck/depcheck) / [unplugin-unused](https://github.com/unplugin/unplugin-unused) | Finds unused dependencies, exports, files | no | no | yes (import graph) — but never says *what replaces it* | npm 21,992,946 / 1,735,738 / 18,657 per wk; knip 12,545★ | ISC / MIT / MIT | knip pushed 2026-10-28 |
| 18 | [core-js-compat](https://github.com/zloirock/core-js) | browserslist targets → which core-js polyfills are required | no (polyfill, not platform feature) | **yes** (browserslist) | no | npm 58,468,597/wk; repo 25,528★ | MIT | pushed 2026-10-28 |
| 19 | [Bundlephobia](https://github.com/pastelsky/bundlephobia) (`/api/size`) | Per-package min + gzip size; the API our audit already calls | no | no | no | site live; repo 9,613★ | MIT | pushed 2026-10-27 |
| 20 | [pkg-size.dev](https://pkg-size.dev) / [Package Phobia](https://github.com/styfle/packagephobia) | Package install/bundle size in a browser UI | no | no | no | npm wrapper `pkg-size` 2,058/wk, `packagephobia` 10/wk; 2,315★ | MIT | 2022 / pushed 2026-10-05 |
| 21 | [size-limit](https://github.com/ai/size-limit) / [vite-bundle-visualizer](https://github.com/btd/rollup-plugin-visualizer) / [source-map-explorer](https://github.com/danvk/source-map-explorer) | Budget your *own* built output | no | no | no | npm 1,794,925 / 420,245 / 1,504,822 per wk; 7,039★ | MIT | pushed 2026-10-28 |
| 22 | [@e18e/web-features-codemods](https://github.com/e18e/web-features-codemods) | Codemods rewriting syntax (`arr[arr.length-1]` → `arr.at(-1)`), one polyfill-import remover | no (syntax, not deps) | no | **yes** (pattern match) | npm 3,023/wk; 32★ | MIT | 0.3.0, 2026-07-06 |

## Per-candidate notes

### 1. youmightnotneed — the only real overlap

- Four surfaces over one pure `detect()`: `npx youmightnotneed`, `npx youmightnotneed-mcp` (tools `analyze_dependencies`, `get_rule`, `list_rules`), an agent skill (`npx skills add jomaendle/youmightnotneed`), and the site. [`packages/catalog/src/detect.ts`](https://github.com/jomaendle/youmightnotneed/blob/main/packages/catalog/src/detect.ts) starts with: *"detect() is pure: no filesystem, no network, no `process`, no clock."*
- **Mapping is real and broad:** `curl -s https://youmightnotneed.dev/llms.txt | grep -oE 'https://youmightnotneed\.dev/rules/[a-z0-9-]+' | sort -u | wc -l` → **81 published rule pages**, covering axios→`fetch` ([`rules/fetch.ts`](https://github.com/jomaendle/youmightnotneed/blob/main/packages/catalog/src/rules/fetch.ts) lists `axios`, `redaxios`, …), moment→`Intl.DateTimeFormat`, focus-trap→`inert`, framer-motion→`@starting-style`, `swiper`→CSS scroll-snap.
- **It already knows the axios gotcha, in the right place.** `fetch.ts` says: *"Interceptors and upload progress are what is genuinely missing, and they are the reasons to keep the library"* — and the `unless` conditions list upload progress and XSRF/transform/adapter features. That is the same conclusion our usage grep reaches mechanically; theirs is authored text, so it holds for every repo rather than the one being audited.
- **Baseline is derived, not hardcoded:** each rule stores `web-features` IDs; `baseline.ts` ranks `widely/newly/limited` and reports the *least*-supported required feature. That is better engineering than a hand-maintained status column.
- **Size is a committed snapshot**, not Bundlephobia: `packageSizes` from `generated/sizes.ts`, with `measuredVersion` tracked separately from the installed version. Labels the total "up to", correctly.
- **Gating: absent.** No `browserslist` anywhere in `packages/catalog/src` (grep: zero hits outside skill prose). No lockfile read — the comment in `detect.ts` says *"Versions are ignored in v1."*
- **Usage: absent as automation.** The skill instructs the agent to grep call sites and read a per-rule "keep it if" list. Rules carry `agent.unless` conditions enforced by schema, which is the strongest thing in the category, but it is text, not code inspection.
- **Maturity risk:** first published 2026-08-31, v0.4.0 on 2026-10-07, 5 weekly downloads, 0 stars, 0 watchers, 0 open issues, **3 commits since 2026-09-28** (`api.github.com/repos/jomaendle/youmightnotneed/commits?since=2026-09-28T00:00:00Z`). One maintainer. Do not over-index on it *yet*; do assume it will grow, because the site and skill are polished and the MCP surface is where agents will find it.

### 2–3. e18e: the mapping layer is already a commodity dataset

`module-replacements` ships JSON manifests (`native.json`, `micro-utils`, `preferred`) where native entries look like:

```json
"%TypedArray%.prototype.at": { "type": "native",
  "webFeatureId": { "featureId": "typed-arrays", "compatKey": "javascript.builtins.TypedArray.at" } }
```

1.05M weekly downloads, consumed by `eslint-plugin-depend` (495★) and `@e18e/eslint-plugin`. **This is the piece of our tool that is least defensible.** Any competitor can import it. Our value cannot be the mapping table alone.

What the ESLint consumers do *not* do: read browserslist, or check whether your use of the module is actually replaceable. `ban-dependencies.ts` checks imports and `package.json`, and gates only on Node `engines`.

### 9–11. The gating stack exists, but only for code you wrote

`eslint-plugin-compat` is the reference implementation of audience gating: it resolves `browserslist` (including per-environment configs) and flags APIs from MDN data that fall outside it, with a `polyfills` allowlist. It never looks at installed packages. `doiuse` and the stylelint wrappers do the same for CSS against caniuse. `browserslist-config-baseline` gives you the target *set* ("baseline widely available") but audits nothing.

So both halves of our gate exist in public: `browserslist`-resolved targets (`eslint-plugin-compat`, and `browserslist` itself at 173M/wk) and feature→minimum-version data (`baseline-browser-mapping`, 200M/wk). Nobody has wired them to a package inventory.

### 6–8. Baseline enforcement linters are the loudest adjacent category

`eslint-plugin-baseline-js` (67.8k/wk, 234★) is the credible one: one rule, `available: "widely" | "newly" | year`, delegating AST detection to `eslint-plugin-es-x`/core. The `eslint-plugin-baseline` npm name (0.0.1, 2/wk, no license field) is an OIDC publishing stub, not a tool — do not cite it as a competitor. `stylelint-plugin-use-baseline` and Biome's `useBaseline` cover CSS with the same tier-not-browserslist model.

These are complements to us, not substitutes: they catch what you wrote, we catch what you installed.

### 15–16. Low-quality Baseline "CLIs" — existence verified, claims not

`@edziocodes/baseline-cli` (4/wk) is real, MIT, and does AST feature detection with a `.baselinerc.json` year threshold plus a generated GitHub Action; its own README is the only evidence of behaviour (no tests I could find). `baseline-check-tool` (16/wk) advertises AI analysis, security, accessibility and bundle optimisation in one binary; I could not verify any of it beyond the README, and the repo shows 2.3.3 released 2025-12-04 with no evidence of correctness. **Mark both UNVERIFIED on accuracy; cite neither as prior art.**

### 17–18. Adjacent, not overlapping

`knip` (22M/wk) answers "is this used?" — complementary, and youmightnotneed's README points at it explicitly. `core-js-compat` is the only mainstream tool that takes browserslist targets and returns *what polyfilling is required*; it does not know that a package could be replaced by a built-in, only that a language feature needs a polyfill. It is the closest thing to our `blocked-cost` reasoning, and it still doesn't do the cost comparison.

### 19–21. Size tooling is infrastructure, not competition

Bundlephobia is an API (`GET https://bundlephobia.com/api/size?package=axios@1.7.7` → `{"size":35049,"gzip":13902,…}`), not an auditor. `pkg-size.dev` and Package Phobia measure install/bundle weight. `size-limit`, `vite-bundle-visualizer`, `source-map-explorer` measure *your* output against budgets. None of them knows what a package does.

### Correction, verified directly in the tarball (2026-10-28)

`npm pack module-replacements@3.4.0` then reading `package/manifests/native.json`:

- `replacements` is an **object keyed by id**, 205 entries; 153 carry `webFeatureId: { featureId, compatKey }`.
- **187 of 205** carry `engines: [{ engine, minVersion }]` — the same per-browser floor our gate compares against. Not all of them.
- `manifests/preferred.json` (175 entries) and `manifests/micro-utilities.json` (105) cover non-platform and micro-utility swaps.
- `youmightnotneed` rule count: 81 published rule pages (live `llms.txt`, 2026-10-28) and 82 rule ids in source (`grep -ohE 'id: "[a-z0-9-]+"' packages/catalog/src/rules/*.ts | sort -u | wc -l`). The earlier `grep -c '^- \['` figure of 85 was a bad proxy — it counted link lines in `llms.txt`, not rules.

Consequence for this repo: the mapping table is commodity data available weekly, including support floors. Only the join (§G1–§G5) is defensible.

## What the uncovered join is actually worth (measured)

The join is unclaimed, but unclaimed does not mean valuable in every case. Recomputed 2026-10-28 from `data/web-features.json` + `data/mappings.json`:

- 45 mapped packages carry feature data; 25 pass Baseline-Widely targets.
- Against a chrome 100 / safari 15 floor, **11 of 45** verdicts flip versus a Baseline-Widely run: `axios`, `a11y-dialog`, `focus-trap`, `focus-trap-react`, `body-scroll-lock`, `react-modal`, `@radix-ui/react-dialog`, `lodash.clonedeep`, `clone-deep`, `lodash.groupby`, `smoothscroll-polyfill`. A chrome 87 / safari 14 floor produces the identical 11.
- Against Baseline-Widely targets the gate flips **0 of 45** by construction.
- Of **30** public repos probed (32 attempted; `appsmithorg/appsmith` and `wordpress/wp-calypso` have no root `package.json`), via `raw.githubusercontent.com/<repo>/HEAD/{package.json,.browserslistrc}`: **6 declare a browserslist config**, 28 ship a lockfile, 16 have at least one mapped dependency.
  - Legacy floors: `jellyfin/jellyfin-web` (`Chrome 27 … Edge 18, iOS > 10, Firefox ESR` → chrome 27 / edge 18 / lowest ios_saf 10.0-10.2) and `home-assistant/frontend` (`Chrome >= 67, Edge >= 79, Firefox >= 98, iOS >= 15.4, Safari >= 15.4`, with a comment explaining they pinned iOS 15.4 *because that is where native `<dialog>` landed*).
  - Permissive floors that flip nothing: `outline/outline` (`> 0.25%, not dead` → chrome 109 / ios_saf 16.6), `grafana/grafana` (production: last 2 versions per engine).
  - Traps: `chatwoot/chatwoot` pins `.browserslistrc` to `defaults`, which resolves wide enough (op_mini, old Chrome) to fail nearly every gate; `kongyijilafumi/react-ant-admin` pins `ie > 9`.

Positioning consequence: "prevents wrong swaps for projects with a declared legacy floor" is defensible and quantified. "Changes the answer at scale" is not — for undetermined audiences the gate is decoration.

## Gaps nobody covers

- **G1 — Package inventory × resolved browser targets.** No published tool takes installed packages *and* the project's resolved `browserslist`/lockfile and decides per package. Both halves exist separately (module-replacements / youmightnotneed for mapping; eslint-plugin-compat / doiuse for gating); the join is unclaimed.
- **G2 — Polyfill-cost verdict.** Nothing compares "polyfill needed to back-fill this feature" against "size of the library it replaces". `core-js-compat` computes required polyfills but never prices them against the alternative.
- **G3 — Library-specific usage grep.** Only the lodash/underscore rule and unicorn's `prefer-*` rules inspect *call sites*, and only for their own narrow API set. Nothing greps for `axios.interceptors`, `onUploadProgress`, `followCursor`, i.e. the parts of a library the platform cannot replace. youmightnotneed explicitly punts this to the agent as prose.
- **G4 — Installed versions, not declared ranges.** youmightnotneed ignores versions by design; Bundlephobia sizes the latest published version. No tool sizes *your* resolved tree-shaken slice (our own doc admits Bundlephobia's number is not the saving either).
- **G5 — Graded verdicts with a revisit date.** Every tool emits pass/fail or a suggestion list. Nothing emits `blocked → revisit when X ships`, which is the decision a team actually needs to schedule work.
- **G6 — Nothing exists outside npm/web.** No PyPI or crates.io equivalent of a dependency→platform-feature auditor surfaced. PyPI has no supported search API; I did not verify Python tooling beyond noting that `pyupgrade`-style tools rewrite syntax per call site and are not dependency auditors. Treat as **UNVERIFIED / not investigated**.

## Prior art we should credit

1. **`web-features` (web-platform-dx, Apache-2.0)** — the Baseline status dataset, already our dependency. youmightnotneed derives tiers from it the same way; both of us inherit whatever it gets wrong.
2. **`baseline-browser-mapping` (web-platform-dx, Apache-2.0)** — the browser-version↔Baseline-feature-set mapping that makes target comparison tractable.
3. **`module-replacements` native manifest (e18e, MIT)** — the `webFeatureId` + BCD `compatKey` pairing is the cleanest public expression of "this module exists because this feature didn't"; its existence is why our mapping table cannot be the moat.
4. **youmightnotneed's rule schema (MIT)** — deriving a rule's availability from the *weakest* required feature, and requiring a non-empty `unless` list so no rule can ship without its caveats. Copy that discipline.
5. **`eslint-plugin-compat` (amilajack, MIT)** — the browserslist-resolution behaviour and the `polyfills` allowlist idea; our gating should match its per-environment handling.
6. **Bundlephobia (pastelsky, MIT)** — gzip measurement, and the honesty that it is not your tree-shaken cost.
7. **Jad Joubran's Smashing Magazine article (2026-08)** describing the manual audit. Per the brief I did not re-report it; I checked for the script version and found none: `api.github.com/users/jadjoubran/repos?per_page=100` (all 100 repos, fetched 2026-10-28) contains `baseline-status` (a fork of the web component) and `codetogo.io` (snippet site), no dependency auditor. **No tooling was published from that article — UNVERIFIED beyond the author's public repo list.**

## Verification

- npm weekly downloads, all fetched 2026-10-28T22:0xZ:
  `curl -s https://api.npmjs.org/downloads/point/last-week/<pkg>` (scoped names URL-encoded, e.g. `@e18e%2Feslint-plugin`). Window returned: `2026-10-21..2026-10-27`.
- GitHub stars/license/pushed-at: `curl -s https://api.github.com/repos/<owner>/<repo>`.
- npm metadata (license, latest version date, repo): `curl -s https://registry.npmjs.org/<pkg>` → `.dist-tags.latest`, `.time[latest]`.
- npm search sweeps (registry search API, 8–25 hits each): `baseline browserslist`, `eslint-plugin-baseline`, `stylelint-plugin-use-baseline`, `doiuse`, `eslint-plugin-compat`, `youmightnotneed`, `web-features`, `bundlephobia`, `packagephobia`, `size-limit`, `depcheck`, `unused dependencies`, `can i drop`, `you dont need lodash`, `web platform api replaces library`, `web-features dependency audit`, `baseline dependencies cli`, `native api replacement package`, `polyfill detection package.json`, `modernize dependencies`. Nothing beyond the table above surfaced.
- GitHub repo search: `you-might-not-need`, `baseline+web+platform+skill`, `drop+dependencies+web+platform`, `baseline+in:name,description+skill`, `web-features+in:description`, `agent+skill+baseline+browser+in:description`. The only relevant hit was our own repo (`afshinator/baseline-audit`).
- Agent-skill registries: `https://agentskills.io/.well-known/agent-skills/index.json` → 200 but contains exactly **1** generic entry (`.claude-plugin "agent"`), no baseline/dependency skill. `https://agentskills.io/api/skills` → 404. `anthropics/skills` tree (542 files, `skills/` list checked) has **no** baseline or dependency-audit skill.
- youmightnotneed behaviour claims verified by `git clone --depth 1 https://github.com/jomaendle/youmightnotneed /tmp/ymn` then `grep -rn "browserslist" /tmp/ymn -i` (2 hits, both skill prose) and `grep -rn "node:fs" /tmp/ymn/packages/catalog/src` (0 hits outside tests).
- Link check: every URL in this document returned HTTP 200 via `curl -sIL -o /dev/null -w '%{http_code}' <url>` except `https://www.npmjs.com/package/youmightnotneed`, which returns **403** to curl (bot blocking) — use `https://registry.npmjs.org/youmightnotneed` instead.
- One repo status not resolvable: `github.com/privatenumber/pkg-size` (the source link npm records for `pkg-size`) now **301**-redirects; `api.github.com/repos/privatenumber/pkg-size` returns 404. The site `https://pkg-size.dev` is live (200) but its source repo location is **UNVERIFIED**.
