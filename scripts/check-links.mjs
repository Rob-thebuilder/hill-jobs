// Checks every outbound link the site shows: employers (jobsUrl, secondaryUrl), resume help,
// "More ways to find Hill jobs" programs, Get Trained listings, and events. Node 20+ built-ins only.
// Usage: node scripts/check-links.mjs [--report report.md] [--data path/to/employers.json]
//   [--test-url URL]   also check one extra URL (to test the broken-link issue flow)
//   [--extra FILE]     also check links from a JSON list [{ name, field, url }] (e.g. candidates under review)
//   [--only-extra]     check only the --extra links
// Settings (retries, statuses that mean "blocked by bot protection", domains to skip) are in data/link-check.json.
// Each link ends up OK, MOVED (another domain), BLOCKED (refused an automated check), SKIP (skipDomains),
// ALLOW (failing but on data/link-allowlist.json) or BROKEN. Exit 1 only if something is BROKEN.
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { guideSourceLinks } from './build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UA = 'WorkAtHill-LinkCheck/1.0 (+https://workathill.com)';
const TIMEOUT_MS = 15_000;
const MAX_HOPS = 10;
const CONCURRENCY = 5;

/** Every outbound link shown on the site, as [{ id, name, field, url }]. Missing files are skipped. */
export function collectLinks({ employers = [], resources = [], programs = [], events = [], annual = [], guide = [], training = [] }) {
  return [
    ...employers.flatMap((e) => [
      { id: e.id, name: e.name, field: 'jobsUrl', url: e.jobsUrl },
      ...(e.secondaryUrl ? [{ id: e.id, name: e.name, field: 'secondaryUrl', url: e.secondaryUrl }] : []),
    ]),
    ...resources.map((r) => ({ id: r.id, name: r.name, field: 'resume help', url: r.url })),
    ...programs.map((p) => ({ id: p.id, name: p.name, field: 'more ways', url: p.url })),
    ...events.map((e) => ({ id: e.id, name: e.title, field: 'event', url: e.url })),
    ...annual.map((a) => ({ id: a.id, name: a.title, field: 'yearly event', url: a.url })),
    ...guide.map((g, i) => ({ id: `guide-${i}`, name: g.label, field: 'guide source', url: g.url })),
    ...training.map((t) => ({ id: t.id, name: `${t.name} (${t.provider})`, field: 'training', url: t.url })),
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
      guide: existsSync(path.join(ROOT, 'templates/guide.html')) ? guideSourceLinks(await readFile(path.join(ROOT, 'templates/guide.html'), 'utf8')) : [],
      training: await read('data/training.json', 'training'),
    }),
  };
}

// Registrable-ish domain: last two labels (good enough to tell jobs.x.com from y.com).
const site = (host) => host.replace(/^www\./, '').split('.').slice(-2).join('.');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fetchImpl = (...a) => fetch(...a);
export const setFetch = (fn) => { fetchImpl = fn; }; // for tests

/** The host is the domain or one of its subdomains. */
export const onDomain = (host, domain) => host === domain || host.endsWith(`.${domain}`);

/** A Workday outage or maintenance page, or a Cloudflare bot challenge: the site is up, it just isn't answering bots. */
function botWall(res, url) {
  const u = new URL(url);
  if (onDomain(u.hostname, 'static.community.workday.com') || u.pathname.includes('/wday/drs/outage')) return 'Workday maintenance page';
  if (res && res.headers?.get('cf-mitigated') === 'challenge') return 'Cloudflare challenge';
  if (res && [403, 503].includes(res.status) && /cloudflare/i.test(res.headers?.get('server') || '')) return 'Cloudflare';
  return null;
}

async function request(url, method) {
  return fetchImpl(url, {
    method,
    redirect: 'manual',
    headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,*/*;q=0.8' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

/** Follows redirects by hand so cross-domain hops can be reported. */
async function checkOnce(url) {
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
      const wall = botWall(null, current);
      if (wall) return { status: res.status, finalUrl: current, wall };
      continue;
    }
    return { status: res.status, finalUrl: current, wall: botWall(res, current), retryAfter: Number(res.headers.get('retry-after')) || 0 };
  }
  return { status: 'error', detail: `more than ${MAX_HOPS} redirects`, finalUrl: current };
}

/** Checks a link, retrying timeouts, 429s and 5xx errors with a short pause. */
export async function checkUrl(url, { retries = 2, pauseMs = 2000 } = {}) {
  let r;
  let attempts = 0;
  while (true) {
    r = await checkOnce(url);
    attempts++;
    const retryable = r.status === 'error' || r.status === 429 || (r.status >= 500 && !r.wall);
    if (!retryable || attempts > retries) break;
    await sleep(Math.min(10_000, r.retryAfter ? r.retryAfter * 1000 : pauseMs * attempts));
  }
  return { ...r, attempts };
}

/** OK, BLOCKED or BROKEN for one result, using the settings in data/link-check.json. */
export function classify(r, cfg) {
  if (r.wall) return 'BLOCKED';
  if (r.status === 'error') return /timed out/.test(r.detail || '') ? 'BLOCKED' : 'BROKEN';
  if ((cfg.blockedStatuses || []).includes(r.status)) return 'BLOCKED';
  return r.status >= 400 ? 'BROKEN' : 'OK';
}

async function main() {
  const arg = (name) => {
    const i = process.argv.indexOf(name);
    return i > -1 ? process.argv[i + 1] : null;
  };
  const dataPath = arg('--data') || path.join(ROOT, 'data/employers.json');
  const reportPath = arg('--report');
  const allow = JSON.parse(await readFile(path.join(ROOT, 'data/link-allowlist.json'), 'utf8')).entries || [];
  const cfg = JSON.parse(await readFile(path.join(ROOT, 'data/link-check.json'), 'utf8'));
  const skipFor = (url) => (cfg.skipDomains || []).find((d) => onDomain(new URL(url).hostname, d.domain));
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
        const skip = skipFor(link.url);
        if (skip) {
          results.push({ ...link, verdict: 'SKIP', status: 'not checked', detail: skip.why, finalUrl: link.url });
          console.log(`SKIP  ${link.id} ${link.field}  ${link.url}  (${skip.domain} blocks bots)`);
          continue;
        }
        const r = await checkUrl(link.url, { retries: cfg.retries ?? 2 });
        let verdict = classify(r, cfg);
        if (verdict === 'BROKEN' && isAllowed(link.url)) verdict = 'ALLOW';
        const movedSite = verdict === 'OK' && site(new URL(r.finalUrl).hostname) !== site(new URL(link.url).hostname);
        if (movedSite) verdict = 'MOVED';
        if (r.wall) r.detail = r.wall;
        results.push({ ...link, ...r, verdict });
        console.log(`${verdict}  ${r.status}${r.detail ? ` (${r.detail})` : ''}  ${link.id} ${link.field}  ${link.url}`);
      }
    }),
  );

  const order = (a, b) => a.name.localeCompare(b.name) || a.field.localeCompare(b.field);
  const pick = (v) => results.filter((r) => r.verdict === v).sort(order);
  const broken = pick('BROKEN');
  const allowed = pick('ALLOW');
  const moved = pick('MOVED');
  const blocked = [...pick('BLOCKED'), ...pick('SKIP')].sort(order);
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
    'Checked by hand earlier; check them again in a browser now and then.',
    allowed.length ? '| Name | Field | URL | Status |\n|---|---|---|---|\n' + allowed.map(row).join('\n') : 'None.',
    '',
    `## Blocked or not checked: bot protection (${blocked.length})`,
    'These sites refuse automated checks (403/429/999, timeouts, Cloudflare or Workday pages) or are on the skip list in data/link-check.json. They are not counted as broken; open them in a browser now and then.',
    blocked.length ? '| Name | Field | URL | Status |\n|---|---|---|---|\n' + blocked.map(row).join('\n') : 'None.',
  ].join('\n');

  if (reportPath) await writeFile(reportPath, report + '\n');
  console.log(`\n${results.length} links: ${broken.length} broken, ${moved.length} moved domain, ${blocked.length} blocked or skipped, ${allowed.length} allowlisted`);
  process.exit(broken.length ? 1 : 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
