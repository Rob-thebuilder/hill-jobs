import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderBase, openJobsLine } from '../scripts/build.mjs';
import { apiParamsFromJobsUrl } from '../scripts/lib/usajobs.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = async (rel) => readFile(path.join(ROOT, rel), 'utf8');
const data = JSON.parse(await read('data/employers.json'));
const site = JSON.parse(await read('data/site.json'));
const template = await read('templates/base.html');
const usajobsIds = data.employers.filter((e) => apiParamsFromJobsUrl(e.jobsUrl)).map((e) => e.id);
const render = (counts) => renderBase('hill', data.bases.hill, data.employers, site, template, counts);
const strip = (html) => html.replace(/<[^>]+>/g, '');

// Splits rendered HTML into { id: cardHtml }.
const cards = (html) =>
  Object.fromEntries([...html.matchAll(/<article[^>]*aria-labelledby="e-([^"]+)"[\s\S]*?<\/article>/g)].map((m) => [m[1], m[0]]));

// ---------- rendering ----------

test('counts appear only on cards whose jobs link is a USAJOBS search', () => {
  const counts = { checkedAt: '2026-11-06', counts: Object.fromEntries(usajobsIds.map((id, i) => [id, i + 2])) };
  const byId = cards(render(counts));
  assert.equal(Object.keys(byId).length, data.employers.length);
  for (const [id, card] of Object.entries(byId)) {
    const has = card.includes('class="open-jobs"');
    assert.equal(has, usajobsIds.includes(id), id);
    if (has) assert.match(strip(card), new RegExp(`${counts.counts[id]} open jobs · checked Nov 6, 2026`));
  }
  // The count sits above "View jobs" and carries a machine-readable date.
  const card = byId['dla-hill'];
  assert.ok(card.indexOf('open-jobs') < card.indexOf('btn-jobs'));
  assert.match(card, /<time datetime="2026-11-06">Nov 6, 2026<\/time>/);
});

test('singular, plural and zero wording', () => {
  const c = (n) => strip(openJobsLine('x', { checkedAt: '2026-01-02', counts: { x: n } }));
  assert.equal(c(1).trim(), '1 open job · checked Jan 2, 2026');
  assert.equal(c(23).trim(), '23 open jobs · checked Jan 2, 2026');
  assert.equal(c(0).trim(), 'No open jobs right now · checked Jan 2, 2026');
  assert.equal(openJobsLine('x', { checkedAt: '2026-01-02', counts: {} }), '');
  assert.equal(openJobsLine('x', null), '');
});

test('without counts the page is the same, minus the count lines', () => {
  const without = render(null);
  assert.ok(!without.includes('open-jobs'));
  const withCounts = render({ checkedAt: '2026-11-06', counts: Object.fromEntries(usajobsIds.map((id) => [id, 4])) });
  assert.equal(withCounts.replace(/<p class="open-jobs">.*<\/p>\n/g, ''), without);
});

test('counts do not change what search matches', () => {
  const html = render({ checkedAt: '2026-11-06', counts: { 'dla-hill': 11 } });
  const dataText = cards(html)['dla-hill'].match(/data-text="([^"]*)"/)[1];
  assert.ok(!/open job|11/.test(dataText));
});

// ---------- the build never fails because of the API ----------

function runBuild(env, outDir) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'scripts/build.mjs'), '--out', outDir], {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('close', (code) => resolve({ code, out }));
  });
}

async function withFakeApi(handler, fn) {
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    return await fn(`http://127.0.0.1:${server.address().port}/api/search`);
  } finally {
    server.close();
  }
}

const FAKE_KEY = 'FAKE-KEY-456-do-not-log';
const FAKE_EMAIL = 'fake-builder@example.invalid';

async function buildCase(env) {
  const out = await mkdtemp(path.join(tmpdir(), 'wah-build-'));
  try {
    const r = await runBuild(env, out);
    const html = r.code === 0 ? await readFile(path.join(out, 'index.html'), 'utf8') : '';
    return { ...r, html };
  } finally {
    await rm(out, { recursive: true, force: true });
  }
}

const articleCount = (html) => (html.match(/<article /g) || []).length;

test('build with an empty key: succeeds, full page, no counts', async () => {
  // Empty env vars beat .env, so this works on a machine that has a real key in .env.
  const r = await buildCase({ USAJOBS_API_KEY: '', USAJOBS_EMAIL: '' });
  assert.equal(r.code, 0, r.out);
  assert.equal(articleCount(r.html), data.employers.length);
  assert.ok(!r.html.includes('open-jobs'));
  assert.match(r.out, /skipped/);
});

test('build with a rejected key: succeeds, no counts, key never printed', async () => {
  await withFakeApi((req, res) => res.writeHead(401).end(`bad key ${req.headers['authorization-key']}`), async (apiUrl) => {
    const r = await buildCase({ USAJOBS_API_KEY: FAKE_KEY, USAJOBS_EMAIL: FAKE_EMAIL, USAJOBS_API_URL: apiUrl });
    assert.equal(r.code, 0, r.out);
    assert.equal(articleCount(r.html), data.employers.length);
    assert.ok(!r.html.includes('open-jobs'));
    assert.match(r.out, /HTTP 401/);
    assert.ok(!r.out.includes(FAKE_KEY) && !r.out.includes(FAKE_EMAIL), 'credentials printed');
    assert.ok(!r.html.includes(FAKE_KEY) && !r.html.includes(FAKE_EMAIL), 'credentials in page');
  });
});

test('build with the API unreachable: succeeds, no counts', async () => {
  // A closed port: connection refused for every request.
  const port = await withFakeApi(() => {}, async (apiUrl) => new URL(apiUrl).port);
  const r = await buildCase({ USAJOBS_API_KEY: FAKE_KEY, USAJOBS_EMAIL: FAKE_EMAIL, USAJOBS_API_URL: `http://127.0.0.1:${port}/api/search` });
  assert.equal(r.code, 0, r.out);
  assert.equal(articleCount(r.html), data.employers.length);
  assert.ok(!r.html.includes('open-jobs'));
  assert.match(r.out, /0\/7, building without counts/);
});

test('build with a working API: counts on the USAJOBS cards, sent with the right headers', async () => {
  const seen = [];
  let apiHost;
  await withFakeApi((req, res) => {
    seen.push({ key: req.headers['authorization-key'], ua: req.headers['user-agent'], host: req.headers.host, q: new URL(req.url, 'http://x').searchParams });
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ SearchResult: { SearchResultCountAll: 6 } }));
  }, async (apiUrl) => {
    apiHost = new URL(apiUrl).host;
    const r = await buildCase({ USAJOBS_API_KEY: FAKE_KEY, USAJOBS_EMAIL: FAKE_EMAIL, USAJOBS_API_URL: apiUrl });
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /USAJOBS counts: 7\/7/);
    assert.equal((r.html.match(/class="open-jobs"/g) || []).length, 7);
    assert.ok(!r.out.includes(FAKE_KEY) && !r.out.includes(FAKE_EMAIL), 'credentials printed');
  });
  assert.equal(seen.length, 7);
  for (const s of seen) {
    assert.equal(s.key, FAKE_KEY);
    assert.equal(s.ua, FAKE_EMAIL);
    // Node's fetch sets Host from the URL (it's data.usajobs.gov against the real API).
    assert.equal(s.host, apiHost);
    assert.equal(s.q.get('ResultsPerPage'), '1');
  }
});
