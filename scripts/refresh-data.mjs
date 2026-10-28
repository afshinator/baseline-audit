#!/usr/bin/env node
// Rebuild data/web-features.json from the web-features npm dataset.
// Usage:
//   node refresh-data.mjs                  # download latest from unpkg
//   node refresh-data.mjs --from <path>    # use a local data.json (e.g. from npm pack)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'data', 'web-features.json');
const SRC_URL = 'https://unpkg.com/web-features/data.json';

const fromIdx = process.argv.indexOf('--from');
const localPath = fromIdx > -1 ? process.argv[fromIdx + 1] : null;

const raw = localPath
  ? JSON.parse(fs.readFileSync(localPath, 'utf8'))
  : await (await fetch(SRC_URL)).json();

// data.json carries no version, so pin the upstream release explicitly.
const upstreamVersion = localPath
  ? JSON.parse(fs.readFileSync(path.join(path.dirname(localPath), 'package.json'), 'utf8')).version
  : (await (await fetch('https://registry.npmjs.org/web-features/latest')).json()).version;

const major = v => (v == null ? null : String(v).split('-')[0]);
// Highest minimum version per engine across the feature's compat keys.
function deriveSupport(status) {
  const out = {};
  for (const key of Object.values(status.by_compat_key ?? {})) {
    for (const [engine, ver] of Object.entries(key.support ?? {})) {
      if (ver == null || ver === false) continue;
      const cur = out[engine];
      if (cur == null || parseFloat(major(ver)) > parseFloat(major(cur))) out[engine] = major(ver);
    }
  }
  return out;
}

const features = {};
for (const [id, f] of Object.entries(raw.features)) {
  const st = f.status;
  if (!st) continue; // 12 features carry no status; they cannot answer any question
  const support = st.support && Object.keys(st.support).length ? st.support : deriveSupport(st);
  const slim = { name: f.name, baseline: st.baseline, support };
  if (st.baseline_low_date) slim.low_date = st.baseline_low_date;
  if (st.baseline_high_date) slim.high_date = st.baseline_high_date;
  features[id] = slim;
}

const out = {
  upstream: 'web-features',
  upstream_version: upstreamVersion,
  upstream_url: SRC_URL,
  refreshed_at: new Date().toISOString().slice(0, 10),
  features,
};
fs.writeFileSync(OUT, JSON.stringify(out));
const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
console.log(`wrote ${Object.keys(features).length} features (${kb}KB) -> ${OUT}`);

// self-check: the article's headline swaps must resolve, and statuses must be sane
const need = ['intl-relative-time-format', 'intl-plural-rules', 'intl-duration-format', 'dialog', 'popover', 'structured-clone', 'array-group', 'set-methods', 'temporal', 'fetch'];
const missing = need.filter(id => !features[id]);
if (missing.length) throw new Error('missing feature ids: ' + missing.join(', '));
if (features.dialog.baseline !== 'high') throw new Error('dialog should be Baseline high');
if (!features.temporal.support || !Object.keys(features.temporal.support).length) throw new Error('temporal lost its support data');
console.log('self-check ok');
