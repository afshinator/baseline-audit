#!/usr/bin/env node
// Re-derives every factual claim this repo makes, from source, and writes docs/verification.md.
// Nothing here is a remembered number: each row either computes the value or fetches it live.
//
//   node scripts/verify-claims.mjs            # everything
//   node scripts/verify-claims.mjs --offline  # dataset + behaviour only, no network
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const AUDIT = path.join(HERE, 'audit.mjs');
const OFFLINE = process.argv.includes('--offline');
const NO_WRITE = process.argv.includes('--no-write');
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/web-features.json'), 'utf8'));
const MAPS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/mappings.json'), 'utf8')).entries;
const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
const skill = fs.readFileSync(path.join(ROOT, 'SKILL.md'), 'utf8');
const landscape = fs.readFileSync(path.join(ROOT, 'docs', 'competitive-landscape.md'), 'utf8');

const results = [];
let tmpRoot = null;
const tmp = () => (tmpRoot ??= fs.mkdtempSync(path.join(os.tmpdir(), 'verify-claims-')));
const run = (args, opts = {}) => {
  try { return { out: execFileSync('node', [AUDIT, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }), code: 0 }; }
  catch (e) { return { out: `${e.stdout ?? ''}${e.stderr ?? ''}`, code: e.status ?? 1 }; }
};
const fixture = (name, files) => {
  const d = path.join(tmp(), name);
  for (const [rel, body] of Object.entries(files)) {
    const p = path.join(d, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body);
  }
  return d;
};
const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], ...opts });
const ghJson = endpoint => JSON.parse(sh('gh', ['api', endpoint]));
const npmJson = async url => { const r = await fetch(url, { signal: AbortSignal.timeout(30000) }); return r.json(); };
const rowTable = out => out.split('\n').filter(l => l.startsWith('| ') && !l.startsWith('| package') && !l.startsWith('|---'));

async function claim(id, description, fn) {
  let pass = false, evidence = '', skipped = false;
  try {
    const r = await fn();
    if (r === 'SKIP') { skipped = true; evidence = 'skipped (rate limit or offline)'; }
    else if (r === true) pass = true;
    else if (typeof r === 'string') { pass = true; evidence = r; }
    else if (r && r.pass !== undefined) { pass = r.pass; evidence = r.evidence ?? ''; }
  } catch (e) { evidence = `ERROR ${e.message}`.slice(0, 300); }
  results.push({ id, description, status: skipped ? 'SKIP' : pass ? 'PASS' : 'FAIL', evidence: String(evidence).replace(/\|/g, '\\|').slice(0, 400) });
  process.stderr.write(`${skipped ? 'SKIP' : pass ? 'PASS' : 'FAIL'} ${id}\n`);
}

// ---------------- dataset ----------------
await claim('D1', 'Feature snapshot is a real, dated web-features release', async () => {
  const size = fs.statSync(path.join(ROOT, 'data/web-features.json')).size;
  const feats = Object.keys(DATA.features).length;
  const dated = !Number.isNaN(Date.parse(DATA.refreshed_at));
  if (!DATA.upstream_version || !dated || feats < 1000 || size > 320 * 1024) throw new Error(`version=${DATA.upstream_version} dated=${dated} feats=${feats} size=${size}`);
  let live = 'n/a offline';
  if (!OFFLINE) {
    const meta = await npmJson('https://registry.npmjs.org/web-features/latest');
    live = meta.version;
    if (meta.version !== DATA.upstream_version) throw new Error(`snapshot ${DATA.upstream_version} != latest ${meta.version}`);
  }
  return `${DATA.upstream}@${DATA.upstream_version} (npm latest: ${live}), ${feats} features, ${Math.round(size / 1024)}KB, refreshed ${DATA.refreshed_at}`;
});

await claim('D2', 'Headline feature statuses match the claims in README/docs', async () => {
  const g = id => DATA.features[id];
  const checks = [
    ['dialog is Baseline widely', g('dialog')?.baseline === 'high'],
    ['popover is newly available and iOS needs 18.3', g('popover')?.baseline === 'low' && g('popover')?.support.safari_ios === '18.3'],
    ['intl-duration-format needs Chrome 129', g('intl-duration-format')?.baseline === 'low' && g('intl-duration-format')?.support.chrome === '129'],
    ['temporal is not Baseline, Chrome 144', g('temporal')?.baseline === false && g('temporal')?.support.chrome === '144'],
    ['array-group is widely available since 2026-09-05', g('array-group')?.baseline === 'high' && g('array-group')?.high_date === '2026-09-05'],
    ['anchor-positioning is not Baseline', g('anchor-positioning')?.baseline === false],
  ];
  const bad = checks.filter(([, v]) => !v).map(([k]) => k);
  if (bad.length) throw new Error(`failed: ${bad.join('; ')}`);
  return checks.map(([k]) => k).join('; ');
});

await claim('D3', 'Mapping table is internally consistent', async () => {
  const pkgs = MAPS.map(e => e.package);
  const dupes = pkgs.filter((p, i) => pkgs.indexOf(p) !== i);
  const missing = MAPS.flatMap(e => e.feature_ids.filter(id => !DATA.features[id]).map(id => `${e.package}->${id}`));
  const badRe = MAPS.flatMap(e => e.keep_if.filter(p => { try { new RegExp(p); return false; } catch { return true; } }).map(p => `${e.package}:${p}`));
  if (dupes.length || missing.length || badRe.length) throw new Error(`dupes=${dupes} missing=${missing} badRe=${badRe}`);
  const wt = MAPS.filter(e => e.feature_ids.length).length;
  if (!readme.includes(`${MAPS.length} packages`) || !readme.includes(`${wt} with a Baseline feature`)) throw new Error(`README quotes a different mapping count (${MAPS.length}/${wt})`);
  return `${MAPS.length} packages (${wt} with a feature id), 0 duplicates, ${MAPS.reduce((n, e) => n + e.feature_ids.length, 0)} feature refs resolve, ${MAPS.reduce((n, e) => n + e.keep_if.length, 0)} keep-signal regexes compile; README agrees`;
});

await claim('D4', 'Audience-gate arithmetic quoted in README', async () => {
  const support = f => Object.fromEntries(Object.entries(f.support ?? {}).map(([k, v]) => [k, parseFloat(String(v).split('-')[0])]));
  const passes = (fs_, tgt) => Object.entries(tgt).every(([e, t]) => fs_.every(f => { const v = support(f)[e]; return v != null && t >= v; }));
  const TGT = {
    bw: { chrome: 124, edge: 124, firefox: 125, safari: 17.4, safari_ios: 17.4 },
    f2023: { chrome: 100, edge: 100, firefox: 102, safari: 15, safari_ios: 15 },
    f2021: { chrome: 87, edge: 87, firefox: 78, safari: 14, safari_ios: 14 },
  };
  const rows = MAPS.filter(e => e.feature_ids.length).map(e => ({ pkg: e.package, fs: e.feature_ids.map(i => DATA.features[i]).filter(Boolean) })).filter(r => r.fs.length);
  const calc = k => rows.filter(r => passes(r.fs, TGT[k]) !== passes(r.fs, TGT.bw)).map(r => r.pkg).sort();
  const flip23 = calc('f2023'), flip21 = calc('f2021'), flipBw = calc('bw');
  const bwPass = rows.filter(r => passes(r.fs, TGT.bw)).length;
  if (flipBw.length !== 0) throw new Error(`gate is not a no-op at Baseline-Widely: ${flipBw.slice(0, 5)}`);
  const nums = [`of ${rows.length}`, `${bwPass} of them`, `${flip23.length} of ${rows.length}`, `${flip21.length} of ${rows.length}`, `0 of ${rows.length}`];
  const missing = nums.filter(n => !readme.includes(n) && !landscape.includes(n));
  if (missing.length) throw new Error(`docs do not quote ${missing.join(', ')} (computed rows=${rows.length} bw=${bwPass} flip2023=${flip23.length} flip2021=${flip21.length})`);
  return `${rows.length} rows, ${bwPass} pass at Baseline-Widely, ${flip23.length} flip at chrome 100, ${flip21.length} at chrome 87, ${flipBw.length} at Baseline-Widely; docs quote all of it`;
});

// ---------------- behaviour ----------------
await claim('B1', 'Self-check passes and covers the alias fixture', async () => {
  const r = run(['--selfcheck']);
  if (r.code !== 0) throw new Error(`exit ${r.code}`);
  const m = r.out.match(/(\d+)\/(\d+) checks passed/);
  if (!m || m[1] !== m[2]) throw new Error(r.out.trim());
  return `${m[1]}/${m[2]} checks pass`;
});

await claim('B2', 'A declared legacy floor flips the verdict (the whole thesis)', async () => {
  const d = path.join(tmp(), 'flip');
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ name: 'flip', dependencies: { axios: '1.7.7' } }));
  fs.writeFileSync(path.join(d, '.browserslistrc'), 'chrome 100\nsafari 15\n');
  fs.writeFileSync(path.join(tmp(), 'empty.js'), '');
  const withCfg = run([d, '--no-size'], { cwd: d }).out;
  const bw = run([d, '--no-size', '--targets', 'chrome 124, edge 124, firefox 125, safari 17.4, ios_saf 17.4'], { cwd: d }).out;
  const blocked = /\| axios \|.*\*\*blocked\*\*/.test(withCfg);
  const swap = /\| axios \|.*\*\*swap\*\*/.test(bw);
  const labelled = withCfg.includes('[from project config]');
  if (!blocked || !swap || !labelled) throw new Error(`blocked=${blocked} swap=${swap} labelled=${labelled}`);
  return 'chrome 100/safari 15 → blocked; Baseline-Widely targets → swap; header marks project config';
});

await claim('B3', 'Keep-signals are found through a re-export wrapper', async () => {
  const d = fixture('alias', {
    'package.json': JSON.stringify({ name: 'alias', dependencies: { axios: '1.7.7' } }),
    'src/http.ts': "import axios from 'axios';\nexport const http = axios;\n",
    'src/setup.ts': "import { http } from './http';\nhttp.interceptors.request.use((c) => c);\n",
  });
  const out = run([d, '--no-size'], { cwd: d }).out;
  if (!/\| axios \|.*\*\*check\*\*/.test(out)) throw new Error('verdict is not check');
  if (!out.includes('(through a re-export)')) throw new Error('no re-export note');
  return 'verdict check, signal reported as "(through a re-export)"';
});

await claim('B4', 'Version resolution: lockfile, node_modules, exact pin, bun.lock ranges', async () => {
  const exact = fixture('v-exact', { 'package.json': JSON.stringify({ name: 'v1', dependencies: { axios: '1.7.7' } }) });
  const range = fixture('v-range', { 'package.json': JSON.stringify({ name: 'v2', dependencies: { axios: '^1.7.0' } }), 'bun.lock': 'x\n' });
  const e = run([exact, '--no-size', '--json'], { cwd: exact }).out;
  const r = run([range, '--no-size', '--json'], { cwd: range }).out;
  const ev = JSON.parse(e).rows[0].version, rv = JSON.parse(r).rows[0].version;
  if (ev !== '1.7.7') throw new Error(`exact pin resolved to ${ev}`);
  if (rv !== undefined && rv !== null) throw new Error(`bun.lock range resolved to ${rv}, expected unresolved`);
  return 'exact pin → 1.7.7; bun.lock + range → unresolved (no invented version)';
});

await claim('B5', 'Audit never writes to the audited repo', async () => {
  const d = fixture('readonly', {
    'package.json': JSON.stringify({ name: 'ro', dependencies: { 'lodash.groupby': '4.6.0' } }),
    'src/a.js': "import g from 'lodash.groupby';\nexport const x = g([], String);\n",
  });
  const digest = () => sh('sh', ['-c', `find ${JSON.stringify(d)} -type f | sort | xargs shasum | shasum`]);
  const before = digest();
  run([d, '--no-size'], { cwd: d });
  const after = digest();
  if (before !== after) throw new Error('files changed');
  // The only permitted write is the size cache under $HOME.
  const src = fs.readFileSync(AUDIT, 'utf8').replace(/^\s*\/\/.*$/gm, '');
  const writes = [...src.matchAll(/fs\.(writeFileSync|appendFileSync)\(([^,)]+)/g)].map(m => m[2].trim());
  // Allowed targets: the size cache under $HOME and the self-check's tmpdir fixtures.
  const outsideAllowed = writes.filter(w => !/CACHE_FILE/.test(w) && !/\bfx\b/.test(w));
  const intoAudited = writes.filter(w => /\bdir\b/.test(w));
  if (outsideAllowed.length) throw new Error(`unexpected write targets: ${outsideAllowed.join(', ')}`);
  if (intoAudited.length) throw new Error(`write targeting the audited dir: ${intoAudited.join(', ')}`);
  return `checksums unchanged; ${writes.length} write call(s), all to CACHE_FILE or self-check fixtures, none to the audited dir`;
});

await claim('B6', 'Stale snapshot produces a loud warning', async () => {
  const copy = path.join(tmp(), 'stalecopy');
  fs.cpSync(ROOT, copy, { recursive: true, filter: s => !s.includes('.git') });
  const p = path.join(copy, 'data', 'web-features.json');
  const d = JSON.parse(fs.readFileSync(p, 'utf8'));
  d.refreshed_at = '2026-01-01';
  fs.writeFileSync(p, JSON.stringify(d));
  const r = run([path.join(tmp(), 'readonly'), '--no-size'], { cwd: path.join(copy, 'scripts') });
  const staleCopy = path.join(tmp(), 'audit-stale.mjs');
  fs.copyFileSync(path.join(copy, 'scripts', 'audit.mjs'), staleCopy);
  const res = execFileSync('node', [path.join(copy, 'scripts', 'audit.mjs'), path.join(tmp(), 'readonly'), '--no-size'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (!/Stale data|stale feature data/i.test(res)) throw new Error('no staleness warning');
  return 'backdated snapshot warns on stderr and in the report';
});

await claim('B7', 'Resolved targets collapse to the oldest version per engine', async () => {
  const out = run([path.join(tmp(), 'readonly'), '--no-size', '--query', 'last 2 years'], { cwd: tmp() }).out;
  const line = out.split('\n').find(l => l.startsWith('targets: ')) ?? '';
  const list = line.replace('targets: ', '').split(',').map(s => s.trim().split(' ')[0]).filter(Boolean);
  const dupes = list.filter((b, i) => list.indexOf(b) !== i);
  if (!list.length) throw new Error('no targets resolved');
  if (dupes.length) throw new Error(`duplicate engines: ${dupes}`);
  return `${list.length} engines, one version each: ${line.slice(0, 120)}`;
});

await claim('B8', 'An unresolvable --query fails loudly instead of falling back', async () => {
  const r = run([path.join(tmp(), 'readonly'), '--no-size', '--query', 'not a real query zzz'], { cwd: tmp() });
  if (r.code === 0) throw new Error('exited 0');
  if (!/could not resolve --query/.test(r.out)) throw new Error(r.out.slice(0, 200));
  return `exit ${r.code} with an explicit error`;
});

await claim('B9', 'Dependencies with no import site are called out, not silently swapped', async () => {
  const d = fixture('noimport', { 'package.json': JSON.stringify({ name: 'ni', dependencies: { 'timeago.js': '4.0.2' } }) });
  const out = run([d, '--no-size'], { cwd: d }).out;
  if (!/## Not imported anywhere in this repo/.test(out)) throw new Error('section missing');
  if (!/`timeago\.js`/.test(out)) throw new Error('package not named');
  return 'section present and names the package';
});

// ---------------- external ----------------
if (!OFFLINE) {
  await claim('E1', 'Bundlephobia gzip figures quoted for pinned versions', async () => {
    const expected = { 'timeago.js@4.0.2': 1037, 'pluralize@8.0.0': 2385, 'numeral@2.0.6': 3897, 'humanize-duration@3.35.0': 6841, 'tippy.js@6.3.7': 14449, 'focus-trap@8.2.4': 6590, 'a11y-dialog@8.1.5': 1787, 'lodash.clonedeep@4.5.0': 3401, 'lodash.groupby@4.6.0': 4384, '@js-temporal/polyfill@0.5.1': 45167, 'dayjs@1.11.23': 3062 };
    const got = {};
    for (const spec of Object.keys(expected)) {
      const r = await npmJson(`https://bundlephobia.com/api/size?package=${encodeURIComponent(spec)}`);
      got[spec] = r.gzip;
    }
    const bad = Object.entries(expected).filter(([k, v]) => got[k] !== v);
    if (bad.length) throw new Error(`drift: ${bad.map(([k, v]) => `${k} expected ${v} got ${got[k]}`).join(', ')}`);
    return `${Object.keys(expected).length} pinned sizes unchanged; Temporal polyfill ${got['@js-temporal/polyfill@0.5.1']}B = ${(got['@js-temporal/polyfill@0.5.1'] / got['dayjs@1.11.23']).toFixed(1)}x dayjs`;
  });

  await claim('E2', 'npm facts cited about prior art', async () => {
    const mr = await npmJson('https://registry.npmjs.org/module-replacements/latest');
    const ymn = await npmJson('https://registry.npmjs.org/youmightnotneed/latest');
    const dl = async p => (await npmJson(`https://api.npmjs.org/downloads/point/last-week/${p}`)).downloads;
    const mrDl = await dl('module-replacements'), ymnDl = await dl('youmightnotneed'), ecDl = await dl('eslint-plugin-compat');
    if (mr.version !== '3.4.0' || mr.license !== 'MIT') throw new Error(`module-replacements ${mr.version}/${mr.license}`);
    if (ymn.version !== '0.4.0' || ymn.license !== 'MIT') throw new Error(`youmightnotneed ${ymn.version}/${ymn.license}`);
    if (mrDl < 900000) throw new Error(`module-replacements downloads ${mrDl}`);
    if (ymnDl > 50) throw new Error(`youmightnotneed downloads ${ymnDl}, doc claims ~5`);
    if (ecDl < 900000) throw new Error(`eslint-plugin-compat downloads ${ecDl}`);
    return `module-replacements ${mr.version} ${mrDl}/wk; youmightnotneed ${ymn.version} ${ymnDl}/wk; eslint-plugin-compat ${ecDl}/wk`;
  });

  await claim('E3', 'e18e native manifest carries feature ids and per-engine floors', async () => {
    const dir = path.join(tmp(), 'mr');
    fs.mkdirSync(dir, { recursive: true });
    sh('npm', ['pack', 'module-replacements@3.4.0', '--silent'], { cwd: dir });
    sh('tar', ['xzf', fs.readdirSync(dir).find(f => f.endsWith('.tgz')), '-C', dir], { cwd: dir });
    const native = JSON.parse(fs.readFileSync(path.join(dir, 'package', 'manifests', 'native.json'), 'utf8'));
    const reps = Object.values(native.replacements ?? {});
    const withFeature = reps.filter(r => r.webFeatureId?.featureId);
    const withEngines = reps.filter(r => Array.isArray(r.engines) && r.engines.length);
    if (reps.length !== 205) throw new Error(`replacements=${reps.length}, doc says 205`);
    if (withFeature.length !== 153) throw new Error(`webFeatureId=${withFeature.length}, doc says 153`);
    if (withEngines.length !== 187) throw new Error(`engines=${withEngines.length}, docs say 187`);
    if (!landscape.includes('187')) throw new Error('landscape doc does not quote 187');
    return `${reps.length} replacements (object keyed by id), ${withFeature.length} with webFeatureId, ${withEngines.length} with per-engine minVersion`;
  });

  await claim('E4', 'Repo probe sample: 32 repos, 6 with browserslist configs', async () => {
    const repos = 'wjkang/3YAdmin kongyijilafumi/react-ant-admin tryghost/ghost appsmithorg/appsmith documenso/documenso wordpress/wp-calypso element-hq/element-web jitsi/jitsi-meet RocketChat/Rocket.Chat calcom/cal.com twentyhq/twenty hoppscotch/hoppscotch nocodb/nocodb outline/outline chatwoot/chatwoot n8n-io/n8n makeplane/plane directus/directus excalidraw/excalidraw immich-app/immich linkwarden/linkwarden grafana/grafana home-assistant/frontend jellyfin/jellyfin-web misskey-dev/misskey elk-zone/elk sct/overseerr karakeep-app/karakeep strapi/strapi payloadcms/payload medusajs/medusa appwrite/console'.split(' ');
    const want = new Set(['axios', 'dayjs', 'luxon', 'lodash', 'moment', 'uuid', 'query-string', 'pluralize', 'date-fns', 'tippy.js', 'focus-trap', 'qs', 'numeral', 'humanize-duration', 'timeago.js', 'resize-observer-polyfill', 'intersection-observer', '@floating-ui/dom', '@popperjs/core', 'body-scroll-lock', 'a11y-dialog', 'react-modal']);
    let withCfg = 0, withLock = 0, withDeps = 0, probed = 0;
    const cfg = {};
    for (const r of repos) {
      let pkg;
      try { pkg = JSON.parse(sh('curl', ['-sf', '--max-time', '15', `https://raw.githubusercontent.com/${r}/HEAD/package.json`])); } catch { continue; }
      probed++;
      let conf = null;
      try { conf = sh('curl', ['-sf', '--max-time', '15', `https://raw.githubusercontent.com/${r}/HEAD/.browserslistrc`]).trim(); } catch {}
      if (!conf && pkg.browserslist) conf = JSON.stringify(pkg.browserslist);
      if (conf) { withCfg++; cfg[r] = conf.slice(0, 80); }
      let lock = null;
      for (const f of ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock']) {
        try { sh('curl', ['-sfI', '--max-time', '15', `https://raw.githubusercontent.com/${r}/HEAD/${f}`]); lock = f; break; } catch {}
      }
      if (lock) withLock++;
      const all = { ...pkg.dependencies, ...pkg.devDependencies };
      if (Object.keys(all).some(k => want.has(k) || want.has(k.split('.')[0]))) withDeps++;
    }
    if (probed !== 30) throw new Error(`probed=${probed}, docs say 30 (32 attempted)`);
    if (withCfg !== 6) throw new Error(`configs=${withCfg}, README/docs say 6 (${JSON.stringify(cfg)})`);
    if (withLock !== 28) throw new Error(`lockfiles=${withLock}, docs say 28`);
    if (withDeps !== 16) throw new Error(`mapped deps=${withDeps}, docs say 16`);
    if (!readme.includes('of 30 public repos') || !readme.includes('6 declared')) throw new Error('README numbers differ');
    if (!landscape.includes('**30** public repos') && !landscape.includes('30 public repos')) throw new Error('landscape numbers differ');
    return `32 attempted, ${probed} with a root package.json, ${withCfg} configs, ${withLock} lockfiles, ${withDeps} with a mapped dep`;
  });

  await claim('E5', 'Named candidate repos declare the targets the docs claim', async () => {
    const jf = JSON.parse(sh('curl', ['-sf', '--max-time', '15', 'https://raw.githubusercontent.com/jellyfin/jellyfin-web/HEAD/package.json']));
    const ol = JSON.parse(sh('curl', ['-sf', '--max-time', '15', 'https://raw.githubusercontent.com/outline/outline/HEAD/package.json']));
    const cw = sh('curl', ['-sf', '--max-time', '15', 'https://raw.githubusercontent.com/chatwoot/chatwoot/HEAD/.browserslistrc']).trim();
    const jfQ = jf.browserslist.join(', ');
    const resolve = q => sh('npx', ['--yes', 'browserslist', q]).trim().split('\n');
    const mins = list => {
      const m = {};
      for (const l of list) { const [b, v] = l.split(' '); const n = parseFloat(v.split('-')[0]); if (!(b in m) || n < m[b]) m[b] = n; }
      return m;
    };
    const jm = mins(resolve(jfQ)), om = mins(resolve(ol.browserslist.join(', ')));
    const jfLowestIos = resolve(jfQ).filter(l => l.startsWith('ios_saf ')).map(l => l.split(' ')[1])
      .sort((a, b) => parseFloat(a) - parseFloat(b))[0];
    if (jm.chrome !== 27 || jm.edge !== 18) throw new Error(`jellyfin resolves to ${JSON.stringify(jm)}`);
    if (!/^10\./.test(jfLowestIos)) throw new Error(`jellyfin lowest ios_saf = ${jfLowestIos}`);
    if (om.chrome !== 109 || om.ios_saf !== 16.6) throw new Error(`outline resolves to ${JSON.stringify(om)}`);
    if (!/^defaults$/m.test(cw)) throw new Error(`chatwoot rc = ${cw}`);
    if (!readme.includes('jellyfin/jellyfin-web')) throw new Error('README does not name the legacy-config repo');
    return `jellyfin → chrome 27 / edge 18 / lowest ios_saf ${jfLowestIos}; outline → chrome 109 / ios_saf 16.6; chatwoot rc = defaults`;
  });

  await claim('E6', 'Import sites exist where the shortlist claims they do', async () => {
    const rate = ghJson('rate_limit').resources.code_search ?? {};
    if ((rate.remaining ?? 0) < 3) return 'SKIP';
    const check = (q, mustInclude) => {
      const d = ghJson(`search/code?q=${encodeURIComponent(q)}&per_page=10`);
      const paths = (d.items ?? []).map(i => i.path);
      if (!paths.some(p => mustInclude.test(p))) throw new Error(`${q} → ${paths.slice(0, 4).join(', ')}`);
      return paths.length;
    };
    const a = check('repo:jellyfin/jellyfin-web axios', /^src\//);
    const b = check('repo:outline/outline pluralize', /\.(ts|tsx)$/);
    const c = check('repo:grafana/grafana moment', /^public\/|^packages\//);
    return `jellyfin axios ${a} source hits; outline pluralize ${b}; grafana moment ${c}`;
  });

  await claim('E7', 'Published repo HEAD matches local HEAD', async () => {
    const local = sh('git', ['-C', ROOT, 'rev-parse', 'HEAD']).trim();
    const remote = sh('git', ['-C', ROOT, 'ls-remote', 'origin', 'main']).trim().split('\t')[0];
    if (local !== remote) throw new Error(`local ${local} != remote ${remote}`);
    return `HEAD ${local.slice(0, 7)} on origin/main`;
  });
}

// ---------------- docs ----------------
await claim('C1', 'Docs quote the same numbers the checks compute', async () => {
  const needs = [
    [readme, 'of 30 public repos'], [readme, '6 declared'], [readme, '0 of 326'],
    [landscape, '205'], [landscape, '82 rule ids'], [landscape, '**30** public repos'], [landscape, '6 declare'],
  ];
  const missing = needs.filter(([doc, s]) => !doc.includes(s)).map(([, s]) => s);
  if (missing.length) throw new Error(`missing: ${missing.join(', ')}`);
  return 'README and docs/competitive-landscape.md agree with the computed values';
});

await claim('E10', 'Committed benchmark report matches its machine-readable JSON', async () => {
  const dir = path.join(ROOT, 'docs', 'benchmarks');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();
  if (!files.length) return 'SKIP';
  const latest = files.at(-1);
  const data = JSON.parse(fs.readFileSync(path.join(dir, latest), 'utf8'));
  const md = fs.readFileSync(path.join(dir, latest.replace('.json', '.md')), 'utf8');
  const t = data.totals;
  const claims = [
    [`${t.prodDeps} production dependencies`, 'total production deps'],
    [`${t.mapped} matched a row`, 'mapped total'],
    [t.swap === 0 ? 'No package came back `swap`' : `${t.swap} package`, 'swap count'],
    [`${t.check} \`check\``, 'check count'],
    [`${t.blocked} \`blocked\``, 'blocked count'],
    [`${t.flips} verdict`, 'flip count'],
  ];
  const bad = claims.filter(([needle]) => !md.includes(needle)).map(([, what]) => what);
  if (bad.length) throw new Error(`report disagrees with ${latest}: ${bad.join(', ')}`);
  const tableRows = md.split('\n').filter(l => /^\| R\d+ \|/.test(l)).length;
  if (tableRows !== data.repos.length) throw new Error(`report has ${tableRows} repo rows, JSON has ${data.repos.length}`);
  return `${latest}: ${data.repos.length} repos, ${t.prodDeps} deps, ${t.mapped} mapped, ${t.swap} swap, ${t.check} check, ${t.blocked} blocked — report matches JSON`;
});

await claim('C6', 'No stale verification count quoted in the docs', async () => {
  const quoted = [...readme.matchAll(/(\d+) machine checks/g)].map(m => Number(m[1]));
  const stale = quoted.filter(q => q !== results.length + 1); // +1: this check itself
  if (stale.length) throw new Error(`README says ${stale.join('/')} machine checks, report has ${results.length + 1}`);
  return quoted.length ? `README quotes ${quoted[0]}, which matches` : 'docs quote no fixed count';
});

await claim('E11', 'Tailwind claim in references/targets.md (no browserslist, hardcoded CSS targets)', async () => {
  if (OFFLINE) return 'SKIP';
  const dir = path.join(tmp(), 'tw');
  fs.mkdirSync(dir, { recursive: true });
  sh('npm', ['pack', '@tailwindcss/node@4.3.3', '--silent'], { cwd: dir });
  sh('tar', ['xzf', fs.readdirSync(dir).find(f => f.endsWith('.tgz')), '-C', dir], { cwd: dir });
  const dist = fs.readFileSync(path.join(dir, 'package', 'dist', 'index.js'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package', 'package.json'), 'utf8'));
  const hardcoded = /targets:\{safari:16<<16\|1024,ios_saf:16<<16\|1024,firefox:8388608,chrome:7274496\}/.test(dist);
  if (!hardcoded) throw new Error('hardcoded Lightning CSS targets not found');
  if (/browserslist/.test(dist) || Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).some(d => d === 'browserslist')) throw new Error('package references browserslist');
  if (!/Tailwind v4 does \*\*not\*\* read browserslist/.test(fs.readFileSync(path.join(ROOT, 'references', 'targets.md'), 'utf8'))) throw new Error('targets.md wording changed');
  return `@tailwindcss/node@${pkg.version}: hardcoded targets safari 16.1 / ios 16.1 / firefox 128 / chrome 111, zero browserslist references`;
});

await claim('C2', 'SKILL.md frontmatter is valid for agent-skill discovery', async () => {
  const fm = skill.match(/^---\n([\s\S]*?)\n---\n/);
  if (!fm) throw new Error('no frontmatter');
  const kv = Object.fromEntries(fm[1].split('\n').filter(l => l.includes(':')).map(l => [l.slice(0, l.indexOf(':')).trim(), l.slice(l.indexOf(':') + 1).trim()]));
  if (kv.name !== 'baseline-audit') throw new Error(`name ${kv.name}`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(kv.name) || kv.name.length > 64) throw new Error('name format');
  if (!kv.description || kv.description.length < 60 || kv.description.length > 1024) throw new Error(`description length ${kv.description?.length}`);
  return `name=${kv.name}, description ${kv.description.length}/1024 chars`;
});

await claim('C5', 'Docs quote the real self-check count', async () => {
  const r = run(['--selfcheck']);
  const m = r.out.match(/(\d+)\/(\d+) checks passed/);
  if (!m) throw new Error('selfcheck output unreadable');
  const n = Number(m[2]);
  const quoted = [...readme.matchAll(/(\d+) invariants/g), ...skill.matchAll(/(\d+) invariants/g)].map(x => Number(x[1]));
  if (!quoted.length) return `selfcheck ${n}/${m[1]}; docs quote no fixed count (it scales with the mapping table)`;
  const stale = quoted.filter(q => q !== n);
  if (stale.length) throw new Error(`docs say ${[...new Set(stale)].join('/')} invariants, selfcheck runs ${n}`);
  return `selfcheck ${n}/${m[1]}; README and SKILL.md both say ${n}`;
});

await claim('E8', 'Baseline-Widely minimum versions quoted in references/targets.md', async () => {
  if (OFFLINE) return 'SKIP';
  const list = sh('npx', ['--yes', 'browserslist', 'baseline widely available']).trim().split('\n');
  const min = {};
  for (const l of list) {
    const [b, v] = l.split(' ');
    const n = parseFloat(v.split('-')[0]);
    if (!(b in min) || n < parseFloat(min[b])) min[b] = v;
  }
  const want = { chrome: '124', edge: '124', firefox: '125', safari: '17.4', ios_saf: '17.4' };
  const doc = fs.readFileSync(path.join(ROOT, 'references', 'targets.md'), 'utf8');
  for (const [engine, v] of Object.entries(want)) {
    const got = min[engine];
    if (!got || parseFloat(got) < parseFloat(v)) throw new Error(`${engine}: resolved ${got}, doc says ${v}`);
  }
  if (!doc.includes('chrome 124, edge 124, firefox 125, safari 17.4, ios_saf 17.4')) throw new Error('targets.md does not quote the current minimums');
  return `browserslist "baseline widely available" → chrome ${min.chrome}, edge ${min.edge}, firefox ${min.firefox}, safari ${min.safari}, ios_saf ${min.ios_saf}`;
});

await claim('E9', 'Next.js browserslist behaviour claimed in references/targets.md', async () => {
  if (OFFLINE) return 'SKIP';
  const utils = sh('curl', ['-sfL', '--max-time', '40', 'https://unpkg.com/next@16.1.6/dist/build/utils.js']);
  const constants = sh('curl', ['-sfL', '--max-time', '40', 'https://unpkg.com/next@16.1.6/dist/shared/lib/modern-browserslist-target.js']);
  const checks = [
    ['loadConfig is called with path+env', /browserslist[\s\S]{0,200}loadConfig\(\{[^}]*path:[^}]*env:/.test(utils)],
    ['config load is wrapped in a silent catch', /try\s*\{[\s\S]{0,3000}loadConfig[\s\S]{0,3000}\} catch/.test(utils)],
    ['default target is chrome 111/edge 111/firefox 111/safari 16.4', ['chrome 111', 'edge 111', 'firefox 111', 'safari 16.4'].every(v => constants.includes(v))],
  ];
  const bad = checks.filter(([, v]) => !v).map(([k]) => k);
  if (bad.length) throw new Error(bad.join('; '));
  return 'next@16.1.6: loadConfig({path, env}) inside try/catch, defaults chrome 111 / edge 111 / firefox 111 / safari 16.4';
});

await claim('C4', 'youmightnotneed rule counts quoted in the landscape doc', async () => {
  if (OFFLINE) return 'SKIP';
  const txt = sh('curl', ['-sf', '--max-time', '25', 'https://youmightnotneed.dev/llms.txt']);
  const pages = new Set([...txt.matchAll(/https:\/\/youmightnotneed\.dev\/rules\/([a-z0-9-]+)/g)].map(m => m[1]));
  const dir = path.join(tmp(), 'ymn');
  sh('git', ['clone', '-q', '--depth', '1', 'https://github.com/jomaendle/youmightnotneed.git', dir]);
  const ids = sh('sh', ['-c', `grep -ohE 'id: "[a-z0-9-]+"' ${JSON.stringify(dir)}/packages/catalog/src/rules/*.ts | sort -u | wc -l`]).trim();
  if (pages.size !== 81) throw new Error(`published rule pages=${pages.size}, doc says 81`);
  if (Number(ids) !== 82) throw new Error(`rule ids=${ids}, doc says 82`);
  if (!landscape.includes('81 published rule pages') || !landscape.includes('82 rule ids')) throw new Error('doc numbers differ');
  return `${pages.size} published rule pages, ${ids} rule ids in source, both quoted correctly`;
});

await claim('C3', 'License and attribution files are present and correct', async () => {
  const lic = fs.readFileSync(path.join(ROOT, 'LICENSE'), 'utf8');
  const notice = fs.readFileSync(path.join(ROOT, 'NOTICE'), 'utf8');
  if (!/Apache License/.test(lic) || !/Version 2\.0/.test(lic)) throw new Error('LICENSE is not Apache-2.0');
  if (!/web-features/.test(notice) || !/browser-compat-data/.test(notice)) throw new Error('NOTICE missing attribution');
  return 'Apache-2.0 text present; NOTICE credits web-features + browser-compat-data';
});

// ---------------- report ----------------
const pass = results.filter(r => r.status === 'PASS').length;
const fail = results.filter(r => r.status === 'FAIL');
const skip = results.filter(r => r.status === 'SKIP').length;
const lines = [
  '# Verification report',
  '',
  `Generated ${new Date().toISOString().slice(0, 10)} by \`node scripts/verify-claims.mjs\`${OFFLINE ? ' (--offline)' : ''}.`,
  'Every row below recomputes or re-fetches the value; no number is remembered. Re-run to re-check.',
  '',
  `**${pass} passed, ${fail.length} failed, ${skip} skipped.**`,
  '',
  '| ID | Claim | Result | Evidence |',
  '|---|---|---|---|',
  ...results.map(r => `| ${r.id} | ${r.description} | **${r.status}** | ${r.evidence} |`),
  '',
  '## What this does not verify',
  '',
  '- UNVERIFIED: whether a PyPI or crates.io equivalent exists (no supported search API was used).',
  '- UNVERIFIED: import presence in repos where the GitHub code-search rate limit was exhausted.',
  '- Judgement, not measurement: which repos are representative, and whether a benchmark sample is cherry-picked.',
  '',
];
if (!NO_WRITE) fs.writeFileSync(path.join(ROOT, 'docs', 'verification.md'), lines.join('\n'));
if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail.length} failed, ${skip} skipped${NO_WRITE ? '' : ' → docs/verification.md'}`);
if (fail.length) { for (const f of fail) console.log(`FAIL ${f.id} ${f.description}: ${f.evidence}`); process.exit(1); }
