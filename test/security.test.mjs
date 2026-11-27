import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, readdir, mkdtemp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cspPolicy, withSecurityMeta } from '../scripts/build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

async function htmlFiles(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await htmlFiles(p)));
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

const unescape = (s) => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');

test('cspPolicy allows inline scripts by hash only, never unsafe-inline or unsafe-eval', () => {
  const body = "document.documentElement.className = 'js';";
  const policy = cspPolicy(`<head>\n<script>${body}</script>`);
  const hash = createHash('sha256').update(body).digest('base64');
  assert.ok(policy.includes(`'sha256-${hash}'`));
  assert.ok(!/unsafe-(inline|eval)/.test(policy));
  assert.match(policy, /object-src 'none'/);
  assert.match(policy, /base-uri 'self'/);
  assert.ok(!policy.includes('google'), 'no Google hosts without the GA tag');
});

test('withSecurityMeta refuses a page without the expected <head>', () => {
  assert.throws(() => withSecurityMeta('<html><body>hi</body></html>'), /no <head>/);
});

test('every built page has a CSP covering each inline script, and safe new-tab links', async () => {
  const out = await mkdtemp(path.join(tmpdir(), 'wah-sec-'));
  try {
    const r = await runBuild(out);
    assert.equal(r.code, 0, r.out);
    const files = await htmlFiles(out);
    assert.ok(files.length >= 7, `expected all pages, got ${files.length}`);
    for (const file of files) {
      const rel = path.relative(out, file);
      const html = await readFile(file, 'utf8');
      const m = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/);
      assert.ok(m, `${rel}: missing CSP`);
      const policy = unescape(m[1]);
      assert.ok(!/unsafe-(inline|eval)/.test(policy), `${rel}: CSP must not allow unsafe-inline/eval`);
      for (const s of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
        const hash = createHash('sha256').update(s[1]).digest('base64');
        assert.ok(policy.includes(`'sha256-${hash}'`), `${rel}: inline script not covered by CSP hash`);
      }
      const firstScript = html.indexOf('<script');
      assert.ok(firstScript === -1 || html.indexOf('Content-Security-Policy') < firstScript, `${rel}: CSP must come before any script`);
      assert.ok(!/<script(?![^>]*type="application\/(?:ld\+)?json")[^>]*>[\s\S]*?<\/script>/.test(html.replace(/<script>[\s\S]*?<\/script>|<script [^>]*src="[^"]+"[^>]*><\/script>/g, '')),
        `${rel}: only hashed inline scripts and src scripts are allowed`);
      assert.ok(!/\son[a-z]+="/i.test(html), `${rel}: no inline event handlers (CSP would block them)`);
      assert.ok(!/\sstyle="/i.test(html), `${rel}: no style attributes (CSP would block them)`);
      for (const a of html.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)) {
        assert.match(a[0], /rel="[^"]*noopener/, `${rel}: target=_blank link without rel=noopener: ${a[0].slice(0, 80)}`);
      }
      for (const h of html.matchAll(/\s(?:href|src|action)="(javascript:|data:|vbscript:)/gi)) {
        assert.fail(`${rel}: dangerous URL scheme ${h[1]}`);
      }
    }
    const thanks = await readFile(path.join(out, 'thanks', 'index.html'), 'utf8');
    assert.ok(!thanks.includes('google'), '/thanks/ allows no Google hosts');
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});
