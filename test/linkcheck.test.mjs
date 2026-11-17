import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { checkUrl, classify, onDomain, setFetch } from '../scripts/check-links.mjs';

const cfg = JSON.parse(await readFile(new URL('../data/link-check.json', import.meta.url), 'utf8'));
const res = (status, headers = {}) => new Response(status === 204 || (status >= 300 && status < 400) ? null : 'x', { status, headers });

test('link-check settings are valid', () => {
  assert.ok(Number.isInteger(cfg.retries) && cfg.retries >= 0 && cfg.retries <= 5);
  assert.ok(cfg.blockedStatuses.every((s) => Number.isInteger(s) && s >= 400));
  for (const d of cfg.skipDomains) {
    assert.match(d.domain, /^[a-z0-9.-]+\.[a-z]+$/, d.domain);
    assert.ok(d.why && d.why.length > 10, `${d.domain} needs a reason`);
  }
});

test('bot refusals are BLOCKED, dead links are BROKEN', () => {
  for (const s of [401, 403, 429, 999]) assert.equal(classify({ status: s }, cfg), 'BLOCKED', String(s));
  assert.equal(classify({ status: 'error', detail: 'timed out after 15 s' }, cfg), 'BLOCKED');
  assert.equal(classify({ status: 200, wall: 'Workday maintenance page' }, cfg), 'BLOCKED');
  for (const s of [404, 410, 500]) assert.equal(classify({ status: s }, cfg), 'BROKEN', String(s));
  assert.equal(classify({ status: 'error', detail: 'ENOTFOUND' }, cfg), 'BROKEN');
  assert.equal(classify({ status: 200 }, cfg), 'OK');
});

test('skip domains match the domain and its subdomains only', () => {
  assert.ok(onDomain('www.hill.af.mil', 'hill.af.mil'));
  assert.ok(onDomain('hill.af.mil', 'hill.af.mil'));
  assert.ok(!onDomain('nothill.af.mil', 'hill.af.mil'));
});

test('timeouts, 429s and 5xx are retried; a 404 is not', async () => {
  let calls = 0;
  setFetch(async () => (++calls < 3 ? res(503) : res(200)));
  let r = await checkUrl('https://a.example/', { retries: 2, pauseMs: 1 });
  assert.equal(r.status, 200);
  assert.equal(r.attempts, 2); // the first 503 HEAD is retried as GET, then once more

  calls = 0;
  setFetch(async () => { calls++; return res(404); });
  r = await checkUrl('https://a.example/', { retries: 2, pauseMs: 1 });
  assert.equal(r.status, 404);
  assert.equal(r.attempts, 1);
});

test('a redirect to a Workday maintenance page counts as blocked, not moved', async () => {
  setFetch(async (url) => (url.includes('myworkdayjobs') ? res(302, { location: 'https://static.community.workday.com/maintenance-page.html' }) : res(200)));
  const r = await checkUrl('https://x.wd5.myworkdayjobs.com/External', { retries: 0 });
  assert.equal(r.wall, 'Workday maintenance page');
  assert.equal(classify(r, cfg), 'BLOCKED');
  setFetch((...a) => fetch(...a));
});
