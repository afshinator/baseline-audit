#!/usr/bin/env node
// Baseline dependency audit: which installed packages can the browser do natively?
// Read-only. Never writes to the audited repo, never creates a browserslist config.
//
//   node audit.mjs [dir] [--targets "chrome 124, safari 17.4"] [--query "<browserslist query>"]
//                  [--json] [--no-size] [--selfcheck]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'data', 'web-features.json'), 'utf8'));
const MAPPINGS = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'data', 'mappings.json'), 'utf8')).entries;
const CACHE_FILE = path.join(os.homedir(), '.cache', 'baseline-audit', 'sizes.json');
const CACHE_TTL_DAYS = 30;
const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'out', 'coverage', '.turbo', '.cache', 'vendor']);
const SRC_EXT = /\.(js|jsx|ts|tsx|mjs|cjs|vue|svelte|astro|html|css|scss)$/;
const ENGINE = { chrome: 'chrome', and_chr: 'chrome_android', edge: 'edge', firefox: 'firefox', and_ff: 'firefox_android', safari: 'safari', ios_saf: 'safari_ios' };
const MONTHS = 30;

// ---------- args ----------
const argv = process.argv.slice(2);
const flag = n => argv.includes(n);
const opt = n => { const i = argv.indexOf(n); return i > -1 ? argv[i + 1] : undefined; };
const dir = path.resolve(argv.find(a => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--targets' && argv[argv.indexOf(a) - 1] !== '--query') ?? '.');

const major = v => (v == null ? null : String(v).split('-')[0]);
const num = v => parseFloat(String(major(v)).replace('%', ''));

// ---------- targets ----------
function parseTargetsLiteral(s) {
  return s.split(',').map(t => t.trim()).filter(Boolean).map(t => {
    const m = t.match(/^([a-z_]+)\s+([\d.]+)/i);
    if (!m) throw new Error(`unparseable target: ${t}`);
    return { browser: m[1].toLowerCase(), version: m[2] };
  });
}

// The gate only cares about the oldest supported version per engine.
function normalizeTargets(list) {
  const min = new Map();
  for (const t of list) {
    const cur = min.get(t.browser);
    if (cur == null || num(t.version) < num(cur)) min.set(t.browser, t.version);
  }
  return [...min].map(([browser, version]) => ({ browser, version }));
}

function browserslistHere(query) {
  const bin = path.join(dir, 'node_modules', '.bin', 'browserslist');
  const argv = query ? [query] : [];
  const opts = { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] };
  try {
    const out = fs.existsSync(bin)
      ? execFileSync(bin, argv, opts)
      : execFileSync('npx', ['--no-install', 'browserslist', ...argv], opts);
    return out.trim().split('\n').filter(Boolean);
  } catch { return null; }
}

function hasBrowserslistConfig(d) {
  if (fs.existsSync(path.join(d, '.browserslistrc'))) return true;
  try { return Boolean(JSON.parse(fs.readFileSync(path.join(d, 'package.json'), 'utf8')).browserslist); } catch { return false; }
}

function resolveTargets() {
  const lit = opt('--targets');
  if (lit) return { targets: normalizeTargets(parseTargetsLiteral(lit)), source: '--targets', assumed: true };
  const q = opt('--query') ?? (hasBrowserslistConfig(dir) ? '' : 'baseline widely available');
  const list = browserslistHere(q);
  if (list && list.length) return { targets: normalizeTargets(parseTargetsLiteral(list.join(', '))), source: q ? `browserslist "${q}"` : 'project browserslist config', assumed: Boolean(q) };
  if (opt('--query')) throw new Error(`could not resolve --query "${opt('--query')}": install browserslist in the project, or pass --targets "chrome 124, safari 17.4"`);
  const fallback = parseTargetsLiteral('chrome 124, edge 124, firefox 125, safari 17.4, ios_saf 17.4');
  return { targets: fallback, source: hasBrowserslistConfig(dir) ? 'assumed default (project browserslist config unreadable)' : 'assumed default (no project browserslist config)', assumed: true };
}

// ---------- deps ----------
function readDeps() {
  let pkg = {};
  try { pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')); } catch { return { versions: {}, names: [] }; }
  const names = Object.keys(pkg.dependencies ?? {});
  const versions = {};
  try {
    const nm = path.join(dir, 'node_modules');
    if (fs.existsSync(nm)) {
      for (const n of names) {
        try { versions[n] = JSON.parse(fs.readFileSync(path.join(nm, n, 'package.json'), 'utf8')).version; } catch {}
      }
    }
    if (Object.keys(versions).length < names.length) {
      const lock = JSON.parse(fs.readFileSync(path.join(dir, 'package-lock.json'), 'utf8'));
      for (const n of names) versions[n] ??= lock.packages?.[`node_modules/${n}`]?.version;
    }
  } catch {}
  // last resort: exact-pinned ranges from package.json
  for (const n of names) {
    const r = pkg.dependencies?.[n];
    versions[n] ??= typeof r === 'string' && /^\d+\.\d+\.\d+$/.test(r) ? r : undefined;
  }
  return { versions, names };
}

// ---------- sizes ----------
function loadCache() { try { return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch { return {}; } }
function saveCache(c) { fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true }); fs.writeFileSync(CACHE_FILE, JSON.stringify(c, null, 0)); }

async function gzipOf(spec, cache) {
  const hit = cache[spec];
  if (hit && Date.now() - hit.at < CACHE_TTL_DAYS * 864e5) return hit;
  const url = `https://bundlephobia.com/api/size?package=${encodeURIComponent(spec)}`;
  let rec;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(25000) });
    const body = await res.json().catch(() => ({}));
    if (res.ok && Number.isFinite(body.gzip)) rec = { gzip: body.gzip, version: body.version };
    else rec = { gzip: null, error: body?.error?.code ?? `HTTP ${res.status}` };
  } catch (e) {
    rec = { gzip: null, error: 'network/timeout' };
  }
  cache[spec] = { ...rec, at: Date.now() };
  return cache[spec];
}

// ---------- source scan ----------
function walk(d, acc = []) {
  let entries = [];
  try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.well-known') continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(p, acc); }
    else if (SRC_EXT.test(e.name)) acc.push(p);
  }
  return acc;
}
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function importers(files, pkg) {
  const re = new RegExp(`(?:from|require\\(|import\\()\\s*['"]${esc(pkg)}(?:/[^'"]*)?['"]`);
  return files.filter(f => re.test(fs.readFileSync(f, 'utf8')));
}
function signalHits(files, patterns) {
  const hits = [];
  for (const pat of patterns) {
    const re = new RegExp(pat);
    for (const f of files) {
      const m = fs.readFileSync(f, 'utf8').match(re);
      if (m) { hits.push({ signal: pat, file: path.relative(dir, f), match: m[0].slice(0, 40) }); break; }
    }
  }
  return hits;
}

// ---------- feature gate ----------
function gate(feature, targets) {
  if (!feature) return { ok: null, reason: 'no Baseline feature id' };
  const label = feature.name;
  const support = feature.support ?? {};
  const fails = [];
  let compared = 0;
  for (const t of targets) {
    const engine = ENGINE[t.browser];
    if (!engine) continue;
    const min = support[engine];
    if (min == null) { fails.push(`${t.browser} unsupported`); continue; }
    compared++;
    if (num(t.version) < num(min)) fails.push(`${t.browser} ${t.version} < ${min}`);
  }
  if (!compared && !fails.length) return { ok: null, reason: 'no comparable engines in target set', label };
  return { ok: fails.length === 0, reason: fails.slice(0, 2).join('; '), baseline: feature.baseline, label };
}

function revisit(feature) {
  if (!feature) return '';
  if (feature.high_date) return '';
  if (feature.low_date) {
    const d = new Date(feature.low_date);
    d.setMonth(d.getMonth() + MONTHS);
    return `~${d.toISOString().slice(0, 7)}`;
  }
  return 'unknown (not Baseline)';
}

// ---------- self-check ----------
function selfcheck() {
  const asserts = [];
  const ok = (name, cond) => asserts.push({ name, pass: Boolean(cond) });
  // Minimum versions resolved from `browserslist "baseline widely available"` on 2026-10-28.
  const targets = parseTargetsLiteral('chrome 124, edge 124, firefox 125, safari 17.4, ios_saf 17.4');
  for (const id of ['dialog', 'structured-clone', 'array-group', 'abortsignal-timeout', 'intl-list-format', 'intl']) {
    const r = gate(DATA.features[id], targets);
    ok(`Baseline Widely feature "${id}" passes Baseline-Widely targets`, r.ok === true);
  }
  for (const id of ['intl-duration-format', 'popover', 'set-methods', 'anchor-positioning', 'temporal']) {
    const r = gate(DATA.features[id], targets);
    ok(`non-Widely feature "${id}" fails Baseline-Widely targets`, r.ok === false);
  }
  for (const e of MAPPINGS) {
    for (const id of e.feature_ids) ok(`mapping ${e.package} -> feature id ${id} exists`, Boolean(DATA.features[id]));
    for (const p of e.keep_if) { let valid = true; try { new RegExp(p); } catch { valid = false; } ok(`mapping ${e.package} regex ${p} compiles`, valid); }
  }
  const bad = asserts.filter(a => !a.pass);
  for (const a of asserts.slice(0, 200)) if (!a.pass) console.log(`FAIL  ${a.name}`);
  console.log(`${asserts.length - bad.length}/${asserts.length} checks passed; mappings=${MAPPINGS.length} features=${Object.keys(DATA.features).length}`);
  process.exit(bad.length ? 1 : 0);
}
if (flag('--selfcheck')) selfcheck();

// ---------- run ----------
const { versions, names } = readDeps();
if (!names.length) { console.error(`no dependencies found in ${dir}/package.json`); process.exit(2); }
let resolved;
try { resolved = resolveTargets(); } catch (e) { console.error(`error: ${e.message}`); process.exit(1); }
const { targets, source, assumed } = resolved;
const files = walk(dir);
const cache = loadCache();
const rows = [];
const watch = [];
const unmapped = [];

for (const entry of MAPPINGS) {
  if (!names.includes(entry.package)) continue;
  const version = versions[entry.package];
  const feats = entry.feature_ids.map(id => DATA.features[id]).filter(Boolean);
  const gates = feats.map(f => gate(f, targets));
  const blockedIdx = gates.findIndex(g => g.ok === false);
  const blocked = blockedIdx > -1 ? { ...gates[blockedIdx], feature: feats[blockedIdx].name } : undefined;
  const unknown = gates.length === 0 || gates.every(g => g.ok === null);

  const importSites = importers(files, entry.package);
  const signals = entry.keep_if.length && importSites.length ? signalHits(importSites, entry.keep_if) : [];

  let libGzip = null, polyGzip = null, sizeErr = null;
  if (!flag('--no-size') && version) {
    const lib = await gzipOf(`${entry.package}@${version}`, cache);
    libGzip = lib.gzip; sizeErr = lib.gzip ? null : lib.error;
    if (entry.polyfill) polyGzip = (await gzipOf(entry.polyfill, cache)).gzip;
  }

  const net = libGzip == null ? null : (polyGzip ? libGzip - polyGzip : libGzip);
  let verdict;
  if (!entry.feature_ids.length) verdict = 'keep';
  else if (blocked) verdict = 'blocked';
  else if (net != null && net <= 0) verdict = 'blocked-cost';
  else if (unknown) verdict = 'unverified';
  else if (entry.partial || signals.length) verdict = 'check';
  else verdict = 'swap';

  const worst = blocked ?? gates.find(g => g.ok === true) ?? gates[0];
  rows.push({ entry, version, libGzip, polyGzip, net, verdict, signals, importSites: importSites.length, sizeErr, worst, feats });
  const revisitDate = feats.map(revisit).filter(Boolean)[0];
  if ((verdict === 'blocked' || verdict === 'blocked-cost' || verdict === 'unverified') && revisitDate) {
    watch.push({ pkg: entry.package, replacement: entry.replacement, why: blocked ? `${blocked.feature}: ${blocked.reason}` : worst?.reason, revisit: revisitDate });
  }
}

saveCache(cache);
for (const n of names) if (!MAPPINGS.some(e => e.package === n)) unmapped.push(n);

const order = { swap: 0, check: 1, unverified: 2, blocked: 3, 'blocked-cost': 4, keep: 5 };
rows.sort((a, b) => (order[a.verdict] - order[b.verdict]) || ((b.net ?? 0) - (a.net ?? 0)));
const swapRows = rows.filter(r => r.verdict === 'swap');
const sized = swapRows.filter(r => r.net != null);
const recoverable = sized.reduce((s, r) => s + r.net, 0);

if (flag('--json')) {
  console.log(JSON.stringify({ dir, targets: { source, assumed, list: targets }, rows, watch, unmapped, recoverable, data: DATA.refreshed_at }, null, 2));
  process.exit(0);
}

const kb = b => (b == null ? '?' : `${(b / 1024).toFixed(1)}K`);
const out = [];
out.push(`# Baseline audit — ${path.basename(dir)}`);
out.push(`targets: ${targets.map(t => `${t.browser} ${t.version}`).join(', ')}`);
out.push(`targets source: ${source}${assumed ? '  [ASSUMED — not from project config]' : '  [from project config]'}`);
out.push(`prod deps: ${names.length} · mapped: ${rows.length} · unmapped: ${unmapped.length} · feature data: ${DATA.upstream ?? 'web-features'}@${DATA.upstream_version ?? '?'} (${DATA.refreshed_at})`);
out.push('');
out.push('| package | ver | gz | replacement | baseline | audience | imports | net gz | verdict |');
out.push('|---|---|---|---|---|---|---|---|---|');
for (const r of rows) {
  const b = r.feats.length ? r.feats.map(f => f.baseline === 'high' ? 'widely' : f.baseline === 'low' ? 'newly' : 'limited').join('/') : '—';
  const aud = r.worst?.ok === true ? 'ok' : r.worst?.ok === false ? `no (${r.worst.reason})` : 'unknown';
  out.push(`| ${r.entry.package} | ${r.version ?? '?'} | ${kb(r.libGzip)}${r.sizeErr ? ` (${r.sizeErr})` : ''} | ${r.entry.replacement} | ${b} | ${aud} | ${r.importSites} | ${r.net == null ? '?' : kb(r.net)} | **${r.verdict}** |`);
}
out.push('');
out.push(sized.length
  ? `**Recoverable now: ${kb(recoverable)} gzipped across ${sized.length} swap${sized.length === 1 ? '' : 's'}.**`
  : swapRows.length
    ? `**Swappable now: ${swapRows.length} package${swapRows.length === 1 ? '' : 's'} (sizes not measured — rerun without --no-size).**`
    : `**No clean swap in this project.** ${rows.length} mapped package${rows.length === 1 ? '' : 's'} found, all blocked, partial or keep-worthy.`);
if (unmapped.length) out.push(`Unmapped (no entry in the replacement table): ${unmapped.join(', ')}`);

if (rows.some(r => r.signals.length)) {
  out.push('');
  out.push('## Usage that blocks a clean drop');
  for (const r of rows.filter(x => x.signals.length)) {
    out.push(`- **${r.entry.package}** — ${r.signals.map(s => `\`${s.match}\` in ${s.file}`).join(', ')}. ${r.entry.note}`);
  }
}
if (watch.length) {
  out.push('');
  out.push('## Watchlist (do not swap yet)');
  for (const w of watch) out.push(`- **${w.pkg}** → ${w.replacement}: ${w.why || 'insufficient Baseline support'}. Revisit ${w.revisit}.`);
}
if (rows.some(r => r.importSites === 0)) {
  out.push('');
  out.push('## Not imported anywhere in this repo');
  out.push(rows.filter(r => r.importSites === 0).map(r => `\`${r.entry.package}\``).join(', ') + ' — imported dynamically, re-exported through a barrel file, aliased, or already unused. Verify with a real search before acting on the verdict.');
}
out.push('');
out.push('## Caveats');
out.push(`- Sizes are Bundlephobia's published package size, not your tree-shaken bundle. Your real number is lower; confirm with a bundle analyzer.`);
out.push(`- Verdicts are lookup-driven: only the ${MAPPINGS.length} mapped packages get a recommendation.`);
if (assumed) out.push(`- The audience gate used an assumed target set. If you ship to older devices, this report is optimistic — see references/targets.md.`);
out.push(`- No browserslist config was read from this project and none was written.`);
const ageDays = Math.floor((Date.now() - Date.parse(DATA.refreshed_at)) / 864e5);
if (ageDays > 120) {
  const line = `- **Stale data:** feature snapshot is ${ageDays} days old (${DATA.upstream}@${DATA.upstream_version}). Feature statuses move low→high over time, so swaps may be missing. Refresh with \`node scripts/refresh-data.mjs\`.`;
  out.push(line);
  console.error(`warning: stale feature data (${ageDays} days). Run scripts/refresh-data.mjs.`);
}
console.log(out.join('\n'));
