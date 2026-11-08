// Build-time job titles from contractor careers sites, limited to Hill AFB and Northern Utah.
// Node built-ins only. Every request first checks the site's robots.txt. Only titles are kept,
// and only for search. Any failure drops that employer's titles; it never throws.
import { cleanTitle } from './usajobs.mjs';

export const USER_AGENT = 'WorkAtHill-JobTitles/1.0 (+https://workathill.com)';
const MAX_PAGES = 60; // safety cap per source (Northrop Grumman alone has 300+ jobs in Clearfield)

// ---------- location filter ----------

const words = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);

function hasPhrase(w, phrase) {
  const p = words(phrase);
  for (let i = 0; i + p.length <= w.length; i++) if (p.every((x, j) => w[i + j] === x)) return true;
  return false;
}

/** True if a location string is at Hill AFB, or names a Northern Utah place together with Utah/UT. */
export function isNearby(location, places) {
  const w = words(location);
  if (!w.length) return false;
  if (places.hillNames.some((h) => hasPhrase(w, h))) return true;
  const inUtah = places.state.some((s) => hasPhrase(w, s));
  return inUtah && places.places.some((p) => hasPhrase(w, p));
}

// ---------- robots.txt ----------

/** Rules for "*" (or our agent) from a robots.txt body: [{ allow, path }]. */
export function parseRobots(text) {
  const groups = [];
  let current = null;
  let lastWasAgent = false;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === 'user-agent') {
      if (!lastWasAgent) groups.push((current = { agents: [], rules: [] }));
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (current && (key === 'allow' || key === 'disallow')) current.rules.push({ allow: key === 'allow', path: value });
    }
  }
  const ours = groups.filter((g) => g.agents.some((a) => a && a !== '*' && USER_AGENT.toLowerCase().startsWith(a)));
  const chosen = ours.length ? ours : groups.filter((g) => g.agents.includes('*'));
  return chosen.flatMap((g) => g.rules).filter((r) => r.path !== ''); // an empty rule means "allow everything"
}

function ruleMatches(path, pattern) {
  if (pattern === '') return false; // "Disallow:" (empty) allows everything
  const anchored = pattern.endsWith('$');
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp('^' + body + (anchored ? '$' : '')).test(path);
}

/** Longest matching rule wins; Allow wins a tie. No matching rule means allowed. */
export function robotsAllows(rules, pathWithQuery) {
  let best = null;
  for (const r of rules) {
    if (!ruleMatches(pathWithQuery, r.path)) continue;
    const len = r.path.replace(/\$$/, '').length;
    if (!best || len > best.len || (len === best.len && r.allow)) best = { len, allow: r.allow };
  }
  return best ? best.allow : true;
}

// ---------- polite fetch ----------

/** A fetch that checks robots.txt first, identifies itself and times out. Shared with events.mjs. */
export function makeClient(fetchImpl, timeoutMs, userAgent = USER_AGENT) {
  const robotsCache = new Map();
  async function rulesFor(origin) {
    if (!robotsCache.has(origin)) {
      robotsCache.set(origin, (async () => {
        const res = await fetchImpl(`${origin}/robots.txt`, { headers: { 'User-Agent': userAgent }, signal: AbortSignal.timeout(timeoutMs) });
        if (res.status === 401 || res.status === 403) return { blocked: true };
        if (res.status >= 500) return { blocked: true }; // RFC 9309: server error means don't crawl
        if (!res.ok) return { rules: [] }; // no robots.txt: allowed
        return { rules: parseRobots(await res.text()) };
      })());
    }
    return robotsCache.get(origin);
  }
  return async function politeFetch(url, { method = 'GET', body, json = false, headers = {} } = {}) {
    const u = new URL(url);
    const robots = await rulesFor(u.origin);
    if (robots.blocked) throw Object.assign(new Error('site refuses automated requests'), { name: 'RobotsBlocked' });
    if (!robotsAllows(robots.rules, u.pathname + u.search)) throw Object.assign(new Error(`robots.txt disallows ${u.pathname}`), { name: 'RobotsDisallowed' });
    const res = await fetchImpl(url, {
      method,
      body,
      headers: { 'User-Agent': userAgent, Accept: json ? 'application/json' : 'text/html,application/xml;q=0.9,*/*;q=0.8', ...headers },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      res.body?.cancel?.();
      throw Object.assign(new Error(`HTTP ${res.status}`), { name: 'HttpError' });
    }
    return json ? res.json() : res.text();
  };
}

// ---------- adapters: each returns [{ title, locations: [..] }] ----------

export const decode = (s) =>
  String(s)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();

const adapters = {
  // Eightfold (Northrop Grumman, Lockheed Martin, CACI): results come sorted by distance from Hill,
  // so stop at the first page with no nearby jobs.
  async eightfold(src, get, places) {
    const out = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const url = `https://${src.host}/api/pcsx/search?domain=${encodeURIComponent(src.domain)}&query=&location=${encodeURIComponent('Hill AFB, UT')}&start=${page * 10}&sort_by=distance`;
      const data = await get(url, { json: true });
      const positions = data?.data?.positions || [];
      const jobs = positions.map((p) => ({ title: p.name, locations: [...(p.locations || []), ...(p.standardizedLocations || [])] }));
      out.push(...jobs);
      if (positions.length < 10 || !jobs.some((j) => j.locations.some((l) => isNearby(l, places)))) break;
    }
    return out;
  },

  // Workday (Leidos): text search, then look up each posting that lists several locations.
  async workday(src, get) {
    const base = `https://${src.host}/wday/cxs/${src.tenant}/${src.site}`;
    const out = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const data = await get(`${base}/jobs`, {
        method: 'POST',
        json: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appliedFacets: {}, limit: 20, offset: page * 20, searchText: src.searchText }),
      });
      const postings = data?.jobPostings || [];
      for (const p of postings) {
        let locations = [p.locationsText];
        if (/^\d+ Locations$/i.test(p.locationsText || '') && p.externalPath) {
          try {
            const d = await get(`${base}${p.externalPath}`, { json: true });
            locations = [d?.jobPostingInfo?.location, ...(d?.jobPostingInfo?.additionalLocations || [])];
          } catch {
            locations = [];
          }
        }
        out.push({ title: p.title, locations });
      }
      if (postings.length < 20 || (page + 1) * 20 >= (data?.total ?? 0)) break;
    }
    return out;
  },

  // Phenom (BAE Systems): the search page embeds its results as JSON.
  async phenom(src, get) {
    const out = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      // Note: adding "&s=1" makes Phenom ignore the keywords, so it's left off.
      const html = await get(`${src.url}?keywords=${encodeURIComponent(src.keywords)}&from=${page * 20}`);
      const block = extractJsonAfter(html, '"eagerLoadRefineSearch":');
      const jobs = block?.data?.jobs || [];
      out.push(...jobs.map((j) => ({ title: j.title, locations: [j.location, ...(j.multi_location || [])] })));
      if (!jobs.length || (page + 1) * 20 >= (block?.totalHits ?? 0)) break;
    }
    return out;
  },

  // Workable (KIHOMAC): one public list of all jobs.
  async workable(src, get) {
    const data = await get(`https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(src.account)}`, { json: true });
    return (data?.jobs || []).map((j) => ({ title: j.title, locations: [[j.city, j.state].filter(Boolean).join(', '), ...(j.locations || []).map((l) => [l.city, l.region].filter(Boolean).join(', '))] }));
  },

  // ApplicantPro / isolved Hire (E.L. Blake, Systems Implementers): public job list JSON.
  async applicantpro(src, get) {
    const data = await get(`https://${src.host}/core/jobs/${src.domainId}?getParams=${encodeURIComponent(JSON.stringify({ isInternal: 0 }))}`, { json: true });
    const jobs = data?.data?.jobs || [];
    return jobs.map((j) => ({ title: j.title, locations: [[j.city, j.abbreviation || j.state].filter(Boolean).join(', '), j.jobLocation].filter(Boolean) }));
  },

  // ES3: a plain table of openings with a location column.
  async es3(src, get) {
    const html = await get(src.url);
    const rows = [...html.matchAll(/<h3>\s*<a[^>]*href="[^"]*employment-opportunity\/\d+[^"]*"[^>]*>([\s\S]*?)<\/a>\s*<\/h3>\s*<\/div>\s*<div>([\s\S]*?)<\/div>/g)];
    return rows.map((m) => ({ title: decode(m[1]), locations: [decode(m[2])] }));
  },

  // Radancy sitemaps (Boeing, L3Harris): job URLs carry a city slug; open only the nearby ones.
  async 'radancy-sitemap'(src, get, places) {
    const xml = await get(src.sitemap);
    const nearbySlugs = new Set([...places.hillNames, ...places.places].map((p) => words(p).join('-')));
    const urls = [...xml.matchAll(/<loc>([^<]*\/job\/([^/<]+)\/[^<]+)<\/loc>/g)].filter((m) => nearbySlugs.has(m[2])).map((m) => m[1]);
    const out = [];
    for (const url of urls.slice(0, 40)) {
      try {
        const page = await get(url);
        const title = decode((page.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || '');
        const loc = decode((page.match(/class="[^"]*job-location[^"]*"[^>]*>([\s\S]*?)<\//) || [])[1] || '');
        const fromLd = [...page.matchAll(/"addressLocality"\s*:\s*"([^"]+)"[\s\S]{0,200}?"addressRegion"\s*:\s*"([^"]+)"/g)].map((m) => `${m[1]}, ${m[2]}`);
        if (title) out.push({ title, locations: [loc, ...fromLd] });
      } catch {
        // skip this one job page
      }
    }
    return out;
  },
};

/** Parses the JSON object that starts right after `marker` in a page, or null. */
export function extractJsonAfter(text, marker) {
  const at = text.indexOf(marker);
  if (at < 0) return null;
  const s = text.slice(at + marker.length);
  let depth = 0;
  let inString = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) {
      try {
        return JSON.parse(s.slice(0, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * Reads nearby job titles for every configured source.
 * Returns { titles: { id: [title, ...] }, counts: { id: { seen, nearby } }, failed: { id: reason } }.
 */
export async function fetchCareers(config, places, { fetchImpl = globalThis.fetch, timeoutMs = 15_000, log = console } = {}) {
  const get = makeClient(fetchImpl, timeoutMs);
  const titles = {};
  const counts = {};
  const failed = {};
  for (const [id, src] of Object.entries(config?.sources || {})) {
    const adapter = adapters[src.type];
    if (!adapter) {
      failed[id] = `unknown source type "${src.type}"`;
      continue;
    }
    try {
      const jobs = await adapter(src, get, places);
      const nearby = jobs.filter((j) => j.title && (j.locations || []).some((l) => isNearby(l, places)));
      titles[id] = [...new Set(nearby.map((j) => cleanTitle(j.title)).filter(Boolean))];
      counts[id] = { seen: jobs.length, nearby: nearby.length };
    } catch (err) {
      failed[id] = err?.name === 'TimeoutError' ? 'timed out' : err?.message || err?.name || 'error';
      log.warn(`Careers titles: ${id} skipped (${failed[id]})`);
    }
  }
  return { titles, counts, failed };
}
