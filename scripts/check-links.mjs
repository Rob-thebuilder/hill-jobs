// Checks every outbound link the site shows: employers (jobsUrl, secondaryUrl), resume help,
// "More ways to find Hill jobs" programs, and events. Node 20+ built-ins only.
// Usage: node scripts/check-links.mjs [--report report.md] [--data path/to/employers.json]
//   [--test-url URL]   also check one extra URL (to test the broken-link issue flow)
//   [--extra FILE]     also check links from a JSON list [{ name, field, url }] (e.g. candidates under review)
//   [--only-extra]     check only the --extra links
// Exit 1 if any link is broken and not on data/link-allowlist.json.
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UA = 'WorkAtHill-LinkCheck/1.0 (+https://workathill.com)';
const TIMEOUT_MS = 15_000;
const MAX_HOPS = 10;
const CONCURRENCY = 5;

/** Every outbound link shown on the site, as [{ id, name, field, url }]. Missing files are skipped. */
export function collectLinks({ employers = [], resources = [], programs = [], events = [], annual = [] }) {
  return [
    ...employers.flatMap((e) => [
      { id: e.id, name: e.name, field: 'jobsUrl', url: e.jobsUrl },
      ...(e.secondaryUrl ? [{ id: e.id, name: e.name, field: 'secondaryUrl', url: e.secondaryUrl }] : []),
    ]),
    ...resources.map((r) => ({ id: r.id, name: r.name, field: 'resume help', url: r.url })),
    ...programs.map((p) => ({ id: p.id, name: p.name, field: 'more ways', url: p.url })),
    ...events.map((e) => ({ id: e.id, name: e.title, field: 'event', url: e.url })),
    ...annual.map((a) => ({ id: a.id, name: a.title, field: 'yearly event', url: a.url })),
  ].filter((l) => typeof l.url === 'string' && l.url);
}

async function loadSiteLinks(employersPath) {
  const read = async (rel, key) => {
    const p = path.join(ROOT, rel);
    return existsSync(p) ? JSON.parse(await readFile(p, 'utf8'))[key] || [] : [];
  };
  const employers = JSON.parse(await readFile(employersPath, 'utf8')).employers;
  const eventsFile = existsSync(path.join(ROOT, 'data/events.json')) ? JSON.parse(await readFile(path.join(ROOT, 'data/events.json'), 'utf8')) : {};
  return {
    employerCount: employers.length,
    links: collectLinks({
      employers,
      resources: await read('data/resources.json', 'resources'),
      programs: await read('data/programs.json', 'programs'),
      events: eventsFile.events || [],
      annual: eventsFile.annual || [],
    }),
  };
}

// Registrable-ish domain: last two labels (good enough to tell jobs.x.com from y.com).
const site = (host) => host.replace(/^www\./, '').split('.').slice(-2).join('.');

async function request(url, method) {
  return fetch(url, {
    method,
    redirect: 'manual',
    headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,*/*;q=0.8' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

/** Follows redirects by hand so cross-domain hops can be reported. */
async function checkUrl(url) {
  let current = url;
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    let res;
    try {
      res = await request(current, 'HEAD');
      // Many careers sites reject HEAD; retry those with GET.
      if ([403, 404, 405, 501].includes(res.status) || res.status >= 500) {
        res.body?.cancel();
        res = await request(current, 'GET');
      }
    } catch {
      try {
        res = await request(current, 'GET');
      } catch (err) {
        return { status: 'error', detail: err.name === 'TimeoutError' ? 'timed out after 15 s' : (err.cause?.code || err.message), finalUrl: current };
      }
    }
    res.body?.cancel();
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      current = new URL(res.headers.get('location'), current).toString();
      continue;
    }
    return { status: res.status, finalUrl: current };
  }
  return { status: 'error', detail: `more than ${MAX_HOPS} redirects`, finalUrl: current };
}

async function main() {
  const arg = (name) => {
    const i = process.argv.indexOf(name);
    return i > -1 ? process.argv[i + 1] : null;
  };
  const dataPath = arg('--data') || path.join(ROOT, 'data/employers.json');
  const reportPath = arg('--report');
  const allow = JSON.parse(await readFile(path.join(ROOT, 'data/link-allowlist.json'), 'utf8')).entries || [];
  const isAllowed = (url) => allow.find((a) => url === a.url || (a.url.endsWith('*') && url.startsWith(a.url.slice(0, -1))));

  const { employerCount, links: siteLinks } = await loadSiteLinks(dataPath);
  const extraPath = arg('--extra');
  const extra = extraPath ? JSON.parse(await readFile(extraPath, 'utf8')).map((l, i) => ({ id: `extra-${i}`, ...l })) : [];
  const links = process.argv.includes('--only-extra') ? extra : [...siteLinks, ...extra];
  const testUrl = arg('--test-url');
  if (testUrl) links.push({ id: 'test-url', name: 'TEST (remove me)', field: 'jobsUrl', url: testUrl });

  const results = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < links.length) {
        const link = links[next++];
        const r = await checkUrl(link.url);
        const broken = r.status === 'error' || r.status >= 400;
        const movedSite = site(new URL(r.finalUrl).hostname) !== site(new URL(link.url).hostname);
        results.push({ ...link, ...r, broken, movedSite, allowed: !!isAllowed(link.url) });
        console.log(`${broken ? (isAllowed(link.url) ? 'ALLOW' : 'BROKEN') : movedSite ? 'MOVED' : 'OK'}  ${r.status}${r.detail ? ` (${r.detail})` : ''}  ${link.id} ${link.field}  ${link.url}`);
      }
    }),
  );

  const order = (a, b) => a.name.localeCompare(b.name) || a.field.localeCompare(b.field);
  const broken = results.filter((r) => r.broken && !r.allowed).sort(order);
  const allowed = results.filter((r) => r.broken && r.allowed).sort(order);
  const moved = results.filter((r) => !r.broken && r.movedSite).sort(order);
  const row = (r) => `| ${r.name} | ${r.field} | ${r.url} | ${r.status}${r.detail ? ` (${r.detail})` : ''} |`;
  const movedRow = (r) => `| ${r.name} | ${r.field} | ${r.url} | ${r.finalUrl} |`;

  const report = [
    `Checked ${results.length} links (${employerCount} employers plus resume help, programs and events) on ${new Date().toISOString().slice(0, 10)}.`,
    '',
    `## Broken (${broken.length})`,
    broken.length ? '| Name | Field | URL | Status |\n|---|---|---|---|\n' + broken.map(row).join('\n') : 'None.',
    '',
    `## Redirected to another domain: review (${moved.length})`,
    moved.length ? '| Name | Field | URL | Ends at |\n|---|---|---|---|\n' + moved.map(movedRow).join('\n') : 'None.',
    '',
    `## Failing but allowlisted (${allowed.length})`,
    'These sites block automated checks; check them by hand in a browser.',
    allowed.length ? '| Name | Field | URL | Status |\n|---|---|---|---|\n' + allowed.map(row).join('\n') : 'None.',
  ].join('\n');

  if (reportPath) await writeFile(reportPath, report + '\n');
  console.log(`\n${results.length} checked: ${broken.length} broken, ${moved.length} moved domain, ${allowed.length} allowlisted`);
  process.exit(broken.length ? 1 : 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
