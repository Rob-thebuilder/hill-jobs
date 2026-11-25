import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateIndexNow, indexNowKeyFile, sitemapPaths } from '../scripts/build.mjs';
import { buildSubmission, describeStatus, INDEXNOW_ENDPOINT } from '../scripts/indexnow.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = async (rel) => readFile(path.join(ROOT, rel), 'utf8');
const site = JSON.parse(await read('data/site.json'));
const { bases } = JSON.parse(await read('data/employers.json'));

test('the IndexNow key in site.json is valid, and bad keys are caught', () => {
  assert.deepEqual(validateIndexNow(site), []);
  assert.match(site.indexNowKey, /^[0-9a-f]{32}$/);
  assert.deepEqual(validateIndexNow({ indexNowKey: null }), []);
  assert.match(validateIndexNow({ indexNowKey: 'short' }).join(), /8–128/);
  assert.match(validateIndexNow({ indexNowKey: 'has spaces in it' }).join(), /8–128/);
  assert.equal(indexNowKeyFile({ indexNowKey: null }), null);
});

test('the build writes the key file at the site root, containing only the key', async () => {
  const out = await mkdtemp(path.join(tmpdir(), 'wah-indexnow-'));
  try {
    const code = await new Promise((resolve) => {
      const child = spawn(process.execPath, [path.join(ROOT, 'scripts/build.mjs'), '--no-careers', '--no-events', '--out', out], {
        env: { ...process.env, USAJOBS_API_KEY: '', USAJOBS_EMAIL: '' },
        stdio: 'ignore',
      });
      child.on('close', resolve);
    });
    assert.equal(code, 0);
    assert.equal(await readFile(path.join(out, `${site.indexNowKey}.txt`), 'utf8'), site.indexNowKey);
    const xml = await readFile(path.join(out, 'sitemap.xml'), 'utf8');
    assert.ok(!xml.includes(site.indexNowKey), 'the key file is not in the sitemap');
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});

test('submissions list every sitemap page after a push, and only the home page on the daily rebuild', () => {
  const all = buildSubmission(site, bases, 'all');
  assert.equal(all.host, 'workathill.com');
  assert.equal(all.key, site.indexNowKey);
  assert.equal(all.keyLocation, `https://workathill.com/${site.indexNowKey}.txt`);
  assert.deepEqual(all.urlList, sitemapPaths(bases).map((p) => `https://workathill.com${p}`));
  for (const u of all.urlList) assert.ok(new URL(u).host === all.host, u);
  assert.deepEqual(buildSubmission(site, bases, 'home').urlList, ['https://workathill.com/']);
  assert.equal(buildSubmission({ ...site, indexNowKey: null }, bases), null);
  assert.equal(INDEXNOW_ENDPOINT, 'https://api.indexnow.org/indexnow');
  assert.match(describeStatus(403), /key file/);
  assert.match(describeStatus(202), /received/);
});

test('the deploy workflow notifies IndexNow only after a successful deploy from main', async () => {
  const yml = await read('.github/workflows/deploy.yml');
  const job = yml.slice(yml.indexOf('  indexnow:'));
  assert.match(job, /needs: deploy/);
  assert.match(job, /if: github\.event_name != 'pull_request' && github\.ref == 'refs\/heads\/main'/);
  assert.match(job, /node scripts\/indexnow\.mjs --scope \$\{\{ github\.event_name == 'schedule' && 'home' \|\| 'all' \}\}/);
  assert.ok(!/secrets\./.test(job), 'no secrets needed');
});
