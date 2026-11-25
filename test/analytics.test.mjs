import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  renderAnalytics, validateAnalytics, renderBase, renderDirectory, renderGuide, renderPrivacy, renderThanks, PRIVACY_UPDATED,
} from '../scripts/build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFile(path.join(ROOT, rel), 'utf8');
const site = JSON.parse(await read('data/site.json'));
const data = JSON.parse(await read('data/employers.json'));
const ID = 'G-BGK14WRT9L';

const TAG = `<script async src="https://www.googletagmanager.com/gtag/js?id=${ID}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', '${ID}');
</script>
`;

test('site.json carries the GA4 measurement ID', () => {
  assert.equal(site.analyticsId, ID);
  assert.deepEqual(validateAnalytics(site), []);
  assert.deepEqual(validateAnalytics({ analyticsId: null }), []);
  assert.match(validateAnalytics({ analyticsId: 'GTM-WD6RQKLN' }).join(), /GA4 measurement ID/);
  assert.match(validateAnalytics({ analyticsId: 'UA-123-1' }).join(), /GA4 measurement ID/);
});

test('renderAnalytics gives the exact gtag.js snippet, or nothing when the ID is null or invalid', () => {
  assert.equal(renderAnalytics(site), TAG);
  assert.equal(renderAnalytics({ ...site, analyticsId: null }), '');
  assert.equal(renderAnalytics({ ...site, analyticsId: '"><script>alert(1)</script>' }), '');
});

function runBuild(outDir) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'scripts/build.mjs'), '--no-careers', '--no-events', '--out', outDir], {
      env: { ...process.env, USAJOBS_API_KEY: '', USAJOBS_EMAIL: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('close', (code) => resolve({ code, out }));
  });
}

test('every indexable page has the tag right after <head>; /thanks/ and the GTM container never appear', async () => {
  const out = await mkdtemp(path.join(tmpdir(), 'wah-ga-'));
  try {
    const r = await runBuild(out);
    assert.equal(r.code, 0, r.out);
    const pages = [
      ...Object.values(data.bases).map((b) => path.join(b.path, 'index.html')),
      'employers/index.html', 'get-trained/index.html', 'how-hiring-works/index.html', 'about/index.html', 'privacy/index.html',
    ];
    for (const rel of pages) {
      const html = await readFile(path.join(out, rel), 'utf8');
      assert.ok(html.includes(`<head>\n${TAG}<meta charset="utf-8">`), `${rel}: tag missing or not immediately after <head>`);
      assert.equal(html.split('googletagmanager.com/gtag/js').length - 1, 1, `${rel}: tag appears once`);
      assert.ok(!html.includes('GTM-'), `${rel}: GTM container must not be added`);
    }
    const thanks = await readFile(path.join(out, 'thanks', 'index.html'), 'utf8');
    assert.ok(!thanks.includes('googletagmanager') && !thanks.includes('gtag('), '/thanks/ has no analytics');
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});

test('with analyticsId null, no page gets a tag and the privacy page makes no analytics claim', async () => {
  const off = { ...site, analyticsId: null };
  const pages = [
    renderBase('hill', data.bases.hill, data.employers, off, await read('templates/base.html'), null, null, null, {}),
    renderDirectory('hill', data.bases.hill, data.employers, off, await read('templates/employers.html')),
    renderGuide(off, await read('templates/guide.html')),
    renderPrivacy(off, await read('templates/privacy.html')),
    renderThanks(off, await read('templates/thanks.html')),
  ];
  for (const html of pages) {
    assert.ok(!html.includes('googletagmanager') && !html.includes('gtag('));
    assert.ok(!html.includes('{{'), 'no unfilled placeholders');
  }
  assert.match(pages[3], /Short version:<\/strong> browsing Work At Hill collects nothing about you\./);
});

test('privacy page explains Google Analytics in plain words, with the opt-out link and a current date', async () => {
  const html = renderPrivacy(site, await read('templates/privacy.html'));
  assert.match(html, /Short version:<\/strong> Work At Hill uses Google Analytics, which sets cookies, to count visits and see which employer links get clicked\. It never sells personal information\./);
  assert.match(html, /<a href="https:\/\/tools\.google\.com\/dlpage\/gaoptout" rel="noopener">/);
  assert.match(html, /never sells personal information/);
  assert.ok(!/no cookies|no analytics|no tracking of any kind|loads nothing from other companies/.test(html), 'old no-analytics wording is gone');
  assert.match(html, /<meta name="description" content="[^"]*Google Analytics[^"]*opt out[^"]*">/);
  assert.match(html, new RegExp(`Last updated ${PRIVACY_UPDATED}`));
});
