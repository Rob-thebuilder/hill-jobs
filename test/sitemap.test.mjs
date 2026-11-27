import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, mkdtemp, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderSitemap, renderRobots } from '../scripts/build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(await readFile(path.join(ROOT, 'data/employers.json'), 'utf8'));
const jobTypes = JSON.parse(await readFile(path.join(ROOT, 'data/job-types.json'), 'utf8'));
const site = JSON.parse(await readFile(path.join(ROOT, 'data/site.json'), 'utf8'));

/**
 * Minimal XML well-formedness check (Node has no XML parser built in): one declaration,
 * one root element, every tag closed in order, no stray "<" or "&" in text.
 */
function assertWellFormedXml(xml) {
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n/, 'XML declaration first');
  const body = xml.replace(/^<\?xml[^?]*\?>/, '');
  const stack = [];
  let roots = 0;
  const tokens = body.split(/(<[^>]*>)/);
  for (const tok of tokens) {
    if (!tok.startsWith('<')) {
      assert.ok(!/[<>]/.test(tok), `stray angle bracket in text: ${tok}`);
      assert.ok(!/&(?!(amp|lt|gt|quot|apos|#\d+);)/.test(tok), `unescaped & in text: ${tok}`);
      if (!stack.length) assert.equal(tok.trim(), '', `text outside the root element: ${tok}`);
      continue;
    }
    const m = tok.match(/^<(\/?)([A-Za-z][\w:.-]*)((?:\s+[\w:.-]+="[^"<&]*")*)\s*(\/?)>$/);
    assert.ok(m, `malformed tag: ${tok}`);
    const [, closing, name, , selfClosing] = m;
    if (closing) {
      assert.equal(stack.pop(), name, `</${name}> closes the wrong element`);
    } else {
      if (!stack.length) roots++;
      if (!selfClosing) stack.push(name);
    }
  }
  assert.equal(stack.length, 0, `unclosed: ${stack.join(', ')}`);
  assert.equal(roots, 1, 'exactly one root element');
}

const locs = (xml) => [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);

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

test('the build writes a valid sitemap of indexable https://workathill.com pages, without /thanks/', async () => {
  const out = await mkdtemp(path.join(tmpdir(), 'wah-sitemap-'));
  try {
    const r = await runBuild(out);
    assert.equal(r.code, 0, r.out);
    const xml = await readFile(path.join(out, 'sitemap.xml'), 'utf8');
    assertWellFormedXml(xml);
    assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);

    const urls = locs(xml);
    const expected = [
      ...Object.values(data.bases).map((b) => b.path),
      '/employers/', '/get-trained/', '/how-hiring-works/', '/about/', '/privacy/',
      ...data.employers.filter((e) => e.base === 'hill').map((e) => `/employers/${e.id}/`),
      '/jobs/', ...jobTypes.types.map((t) => `/jobs/${t.id}/`),
    ].map((p) => `https://workathill.com${p}`);
    assert.deepEqual([...urls].sort(), [...new Set(expected)].sort());
    for (const u of urls) assert.ok(u.startsWith('https://workathill.com/'), u);
    assert.ok(!xml.includes('/thanks/'), '/thanks/ is noindex and must not be listed');

    // Every listed page was written by this build and isn't marked noindex.
    for (const u of urls) {
      const file = path.join(out, new URL(u).pathname, 'index.html');
      await access(file);
      assert.ok(!/<meta name="robots" content="noindex">/.test(await readFile(file, 'utf8')), `${u} is noindex`);
    }
    // /thanks/ is still built, just not listed.
    assert.match(await readFile(path.join(out, 'thanks', 'index.html'), 'utf8'), /noindex/);

    // lastmod is the build date (Mountain time, like the rest of the build), one per URL.
    const lastmods = [...xml.matchAll(/<lastmod>([^<]*)<\/lastmod>/g)].map((m) => m[1]);
    assert.equal(lastmods.length, urls.length);
    for (const d of lastmods) assert.match(d, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(new Set(lastmods).size, 1);

    const robots = await readFile(path.join(out, 'robots.txt'), 'utf8');
    assert.equal(robots, 'User-agent: *\nAllow: /\n\nSitemap: https://workathill.com/sitemap.xml\n');
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});

test('sitemap and robots follow site.siteUrl and escape it', () => {
  const other = { ...site, siteUrl: 'https://example.com/a&b/' };
  const xml = renderSitemap(other, data.bases, '2026-11-23');
  assertWellFormedXml(xml);
  assert.ok(locs(xml).every((u) => u.startsWith('https://example.com/a&amp;b/')));
  assert.match(xml, /<lastmod>2026-11-23<\/lastmod>/);
  assert.match(renderRobots(site), /^Sitemap: https:\/\/workathill\.com\/sitemap\.xml$/m);
});
