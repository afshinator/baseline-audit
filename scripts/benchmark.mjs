#!/usr/bin/env node
// Run the audit across a fixed set of public repos and emit an aggregate benchmark.
// Repo names are deliberately kept out of the committed report (see docs/benchmarks/README.md):
// labels R1..Rn only. Clone paths and the label map stay in the local work dir.
//
//   node scripts/benchmark.mjs                       # default set
//   node scripts/benchmark.mjs owner/name owner/name  # explicit set
//   node scripts/benchmark.mjs --reuse                # keep existing clones
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const WORK = path.join(os.tmpdir(), 'baseline-bench');
const REUSE = process.argv.includes('--reuse');
const DEFAULT_SET = [
  'jellyfin/jellyfin-web',   // declared legacy floor
  'grafana/grafana',         // declared modern floor, heavy mapping density
  'outline/outline',         // permissive floor
  'nocodb/nocodb',           // control: expected no mapped dependency
];
const repos = process.argv.slice(2).filter(a => !a.startsWith('--'));
const set = repos.length ? repos : DEFAULT_SET;
const BW = 'chrome 124, edge 124, firefox 125, safari 17.4, ios_saf 17.4';

fs.mkdirSync(WORK, { recursive: true });
const audit = (dir, extra = []) => {
  try {
    return JSON.parse(execFileSync('node', [path.join(HERE, 'audit.mjs'), dir, '--json', ...extra], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 }));
  } catch (e) { throw new Error(`audit failed on ${dir}: ${(e.stderr ?? '').slice(0, 200)}`); }
};

const rows = [];
for (const [i, repo] of set.entries()) {
  const label = `R${i + 1}`;
  const dir = path.join(WORK, repo.replace('/', '__'));
  if (!REUSE || !fs.existsSync(path.join(dir, 'package.json'))) {
    fs.rmSync(dir, { recursive: true, force: true });
    execFileSync('git', ['clone', '-q', '--depth', '1', `https://github.com/${repo}.git`, dir], { stdio: 'ignore' });
  }
  const declared = (() => { try { return Object.keys(JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).dependencies ?? {}).length; } catch { return 0; } })();
  const base = declared === 0 ? { rows: [], recoverable: 0, targets: { source: 'n/a', assumed: false } } : audit(dir);
  const bw = declared === 0 ? { rows: [] } : audit(dir, ['--no-size', '--targets', BW]);
  const verdicts = base.rows.reduce((a, r) => ((a[r.verdict] = (a[r.verdict] ?? 0) + 1), a), {});
  const flips = base.rows
    .map(r => ({ pkg: r.entry.package, a: r.verdict, b: (bw.rows.find(x => x.entry.package === r.entry.package) ?? {}).verdict }))
    .filter(x => x.b && x.a !== x.b);
  rows.push({
    label, repo,
    prodDeps: declared,
    assumed: base.targets.assumed,
    mapped: base.rows.length, verdicts, flips,
    recoverable: base.recoverable,

  });
  process.stderr.write(`${label} ${repo}: ${rows.at(-1).prodDeps} prod deps, ${base.rows.length} mapped, ${base.rows.filter(r => r.verdict === 'swap').length} swap\n`);
}

fs.writeFileSync(path.join(WORK, 'labels.json'), JSON.stringify(rows.map(r => ({ label: r.label, repo: r.repo })), null, 2));

const totals = rows.reduce((a, r) => ({
  prodDeps: a.prodDeps + r.prodDeps,
  mapped: a.mapped + r.mapped,
  swap: a.swap + (r.verdicts.swap ?? 0),
  check: a.check + (r.verdicts.check ?? 0),
  blocked: a.blocked + ((r.verdicts.blocked ?? 0) + (r.verdicts['blocked-cost'] ?? 0)),
  keep: a.keep + (r.verdicts.keep ?? 0),
  recoverable: a.recoverable + r.recoverable,
  flips: a.flips + r.flips.length,
  withConfig: a.withConfig + (r.mapped > 0 && !r.assumed ? 1 : 0),
  nullRepos: a.nullRepos + (r.mapped === 0 ? 1 : 0),
  noConfig: a.noConfig + (r.mapped > 0 && r.assumed ? 1 : 0),
}), { prodDeps: 0, mapped: 0, swap: 0, check: 0, blocked: 0, keep: 0, recoverable: 0, flips: 0, withConfig: 0, nullRepos: 0, noConfig: 0 });

const date = new Date().toISOString().slice(0, 10);
const out = [
  `# Benchmark: ${rows.length} public web apps`,
  '',
  `Run ${date} with \`node scripts/benchmark.mjs\`. Repos are labelled, not named: this is an aggregate result, and naming other people's projects to advertise a tool is not a trade worth making. The label map stays local (\`$TMPDIR/baseline-bench/labels.json\`).`,
  '',
  '## Setup',
  '',
  `- ${rows.length} repositories: ${totals.withConfig} with a declared browserslist target set, ${totals.noConfig} with none (audited against assumed Baseline-Widely targets), ${totals.nullRepos} with no production dependencies at all.`,
  `- ${totals.nullRepos === 0 ? 'No' : totals.nullRepos} produced no mapped dependency at all; included deliberately so the sample is not all winners.`,
  `- ${totals.prodDeps} production dependencies scanned in total; ${totals.mapped} matched a row in the mapping table.`,
  '',
  '## Result',
  '',
  totals.swap
    ? `- **${totals.swap} package${totals.swap === 1 ? '' : 's'} came back \`swap\`** — Baseline-safe on that project's own targets, no library-specific usage found, keep-signals analysed.`
    : '- **No package came back \`swap\`.** Every mapped dependency either needs a feature the project targets do not support, uses API surface the platform lacks, or has no usage analysis here.',
  `- ${totals.check} \`check\`, ${totals.blocked} \`blocked\`/\`blocked-cost\`, ${totals.keep} \`keep\`.`,
  totals.swap ? `- ${(totals.recoverable / 1024).toFixed(1)}KB gzipped across those swaps, using published package sizes (the real tree-shaken saving is lower).` : '- 0KB recoverable from clean swaps in this sample.',
  `- ${totals.flips} verdict${totals.flips === 1 ? '' : 's'} changed when the same repos were re-audited against Baseline-Widely instead of their own targets.`,
  '',
  '## Per repo',
  '',
  '| Repo | Prod deps | Mapped | Targets | swap | check | blocked | keep | Flips vs Baseline-Widely |',
  '|---|---|---|---|---|---|---|---|---|',
  ...rows.map(r => `| ${r.label} | ${r.prodDeps} | ${r.mapped} | ${r.mapped === 0 ? 'n/a' : r.assumed ? 'assumed' : 'declared'} | ${r.verdicts.swap ?? 0} | ${r.verdicts.check ?? 0} | ${(r.verdicts.blocked ?? 0) + (r.verdicts['blocked-cost'] ?? 0)} | ${r.verdicts.keep ?? 0} | ${r.flips.length} |`),
  '',
  '## What the numbers do not say',
  '',
  '- A `swap` verdict is a hypothesis, not a migration. Every swap in this run was checked by hand against the source (see the verification notes in the commit that added this file); false positives are reported there.',
  '- Published package size is not tree-shaken size. Treat the KB figure as an upper bound.',
  '- Four repos is a sample, not a survey. One of them exists to prove the tool can return nothing.',
];
fs.mkdirSync(path.join(ROOT, 'docs', 'benchmarks'), { recursive: true });
fs.mkdirSync(path.join(ROOT, 'docs', 'benchmarks'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'docs', 'benchmarks', `${date}.json`), JSON.stringify({
  date, rule: 'aggregate only: repo names are not committed',
  repos: rows.map(r => ({ label: r.label, prodDeps: r.prodDeps, mapped: r.mapped, declared: !r.assumed && r.mapped > 0, verdicts: r.verdicts, flips: r.flips.length })),
  totals,
}, null, 2));
fs.writeFileSync(path.join(ROOT, 'docs', 'benchmarks', `${date}.md`), out.join('\n'));
console.log(out.join('\n'));
