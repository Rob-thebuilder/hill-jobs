#!/usr/bin/env node
// Tells Bing and the other IndexNow search engines which pages changed, right after a deploy,
// instead of waiting for their next crawl. Node built-ins only.
//
// Usage: node scripts/indexnow.mjs [--scope all|home] [--dry-run]
//   --scope all   every page in the sitemap, employer pages included (after a push to main: content may have changed anywhere)
//   --scope home  only the home page (the daily rebuild refreshes job counts and events there)
//   --dry-run     print what would be sent, send nothing
//
// It never fails the workflow: any problem is printed and the script exits 0.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sitemapPaths, indexNowKeyFile } from './build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// One shared endpoint: participating engines (Bing among them) pass submissions on to each other.
export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';

/** The JSON body for one IndexNow submission, or null when IndexNow is off. */
export function buildSubmission(site, bases, scope = 'all', employers = [], jobTypes = null) {
  const keyFile = indexNowKeyFile(site);
  if (!keyFile) return null;
  const root = site.siteUrl.replace(/\/$/, '');
  const paths = scope === 'home' ? ['/'] : sitemapPaths(bases, employers, jobTypes);
  return {
    host: new URL(root).host,
    key: keyFile.body,
    keyLocation: `${root}/${keyFile.name}`,
    urlList: paths.map((p) => root + p),
  };
}

/** Plain-language meaning of the IndexNow response codes. */
export function describeStatus(code) {
  return (
    {
      200: 'accepted',
      202: 'received; the key is still being checked',
      400: 'bad request (invalid format)',
      403: 'key not valid: the key file was not found at keyLocation or does not match',
      422: 'URLs do not belong to the host, or the key does not match',
      429: 'too many requests; try again later',
    }[code] || `unexpected response ${code}`
  );
}

async function main() {
  const argv = process.argv.slice(2);
  const scope = argv.includes('--scope') ? argv[argv.indexOf('--scope') + 1] : 'all';
  if (!['all', 'home'].includes(scope)) {
    console.log(`IndexNow: unknown --scope "${scope}", nothing sent`);
    return;
  }
  const site = JSON.parse(await readFile(path.join(ROOT, 'data/site.json'), 'utf8'));
  const { bases, employers } = JSON.parse(await readFile(path.join(ROOT, 'data/employers.json'), 'utf8'));
  const jobTypes = JSON.parse(await readFile(path.join(ROOT, 'data/job-types.json'), 'utf8'));
  const body = buildSubmission(site, bases, scope, employers, jobTypes);
  if (!body) {
    console.log('IndexNow: off (no indexNowKey in data/site.json), nothing sent');
    return;
  }
  if (argv.includes('--dry-run')) {
    console.log(JSON.stringify(body, null, 2));
    return;
  }
  try {
    const res = await fetch(INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const ok = res.status === 200 || res.status === 202;
    console.log(`${ok ? '✓' : 'WARN:'} IndexNow: ${body.urlList.length} URL(s), HTTP ${res.status} (${describeStatus(res.status)})`);
  } catch (err) {
    console.log(`WARN: IndexNow request failed (${err?.name || 'error'}); nothing else is affected`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.log(`WARN: IndexNow skipped (${err?.message || err})`);
  });
}
