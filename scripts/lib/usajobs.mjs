// Build-time open-job counts and job titles from the official USAJOBS Search API. Node built-ins only.
// Never log credentials: log lines carry only employer ids, HTTP statuses and error names.

export const API_URL = 'https://data.usajobs.gov/api/search';

// Website search param → API param. Values with several entries are joined with ";".
// Verified 2026-11-06: these give exactly the website's counts for every Hill search.
const PARAM_MAP = { l: 'LocationName', a: 'Organization', pp: 'JobGradeCode' };

/**
 * Turns a USAJOBS website search URL into API query params, or null when it can't be
 * mapped exactly (so a card never shows a count that differs from its "View jobs" link).
 */
export function apiParamsFromJobsUrl(jobsUrl) {
  let u;
  try {
    u = new URL(jobsUrl);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.hostname !== 'www.usajobs.gov' || u.pathname !== '/search/results/') return null;
  const keys = [...new Set(u.searchParams.keys())];
  if (!keys.length || keys.some((k) => !(k in PARAM_MAP))) return null;
  if (!u.searchParams.get('l')) return null;
  const params = {};
  for (const k of keys) {
    const values = u.searchParams.getAll(k).map((v) => v.trim()).filter(Boolean);
    if (!values.length) return null;
    params[PARAM_MAP[k]] = values.join(';');
  }
  return params;
}

// Kept in capitals when an ALL-CAPS title is converted to sentence case.
const ACRONYMS = new Set(['IT', 'LO', 'NDI', 'NDT', 'CNC', 'HVAC', 'QA', 'ICBM', 'AFB', 'DOD', 'DLA', 'F-35', 'F-22', 'F-16', 'A-10', 'C-130', 'MRO', 'OA', 'II', 'III', 'IV', 'US', 'USAF']);

/**
 * Tidies a USAJOBS position title for display and search: drops hiring-authority suffixes and
 * turns ALL-CAPS titles into sentence case. Text in parentheses is left as is ("IT specialist (INFOSEC)").
 */
export function cleanTitle(raw) {
  let t = String(raw ?? '')
    .replace(/\s+/g, ' ')
    .replace(/\s*[-–—]?\s*\b(direct|alternate|expedited)[\s-]+hir(e|ing)\s+authority\b.*$/i, '')
    .replace(/\s*[-–—]\s*$/, '')
    .trim();
  if (!t) return '';
  const letters = t.replace(/\([^)]*\)/g, '').replace(/[^A-Za-z]/g, '');
  if (letters && letters === letters.toUpperCase()) {
    let first = true;
    t = t.replace(/\([^)]*\)|[A-Za-z0-9][A-Za-z0-9&'-]*/g, (tok) => {
      if (tok.startsWith('(')) return tok;
      const out = ACRONYMS.has(tok.toUpperCase()) || /\d/.test(tok) ? tok.toUpperCase() : first ? tok[0].toUpperCase() + tok.slice(1).toLowerCase() : tok.toLowerCase();
      first = false;
      return out;
    });
  }
  return t;
}

/** YYYY-MM-DD in Mountain Time, the base's local date. */
export function mountainDate(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/**
 * Fetches open-job counts and titles for every employer whose jobsUrl maps to API params.
 * Returns null when there are no credentials, else
 * { checkedAt: 'YYYY-MM-DD', counts: { id: n }, titles: { id: [title, ...] }, eligible: n }.
 * Never throws for network/API problems; failed entries are simply left out.
 */
export async function fetchUsajobs(employers, { key, email, apiUrl = API_URL, fetchImpl = globalThis.fetch, timeoutMs = 10_000, now = new Date(), log = console } = {}) {
  const eligible = employers
    .map((e) => ({ id: e.id, params: apiParamsFromJobsUrl(e.jobsUrl) }))
    .filter((e) => e.params);
  if (!key || !email) {
    log.warn('USAJOBS counts: skipped (no API key or email set)');
    return null;
  }

  const counts = {};
  const titles = {};
  for (const { id, params } of eligible) {
    const url = new URL(apiUrl);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set('ResultsPerPage', '500'); // the API maximum; Hill searches return far fewer
    let res;
    try {
      res = await fetchImpl(url, {
        // Host is listed because the API docs require it; Node's fetch sets it from the URL anyway.
        headers: { Host: 'data.usajobs.gov', 'User-Agent': email, 'Authorization-Key': key },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      log.warn(`USAJOBS counts: ${id} failed (${err?.name === 'TimeoutError' ? 'timed out' : err?.name || 'network error'})`);
      continue;
    }
    if (res.status === 401 || res.status === 403) {
      log.warn(`USAJOBS counts: HTTP ${res.status}; the API key or email was rejected, stopping`);
      res.body?.cancel?.();
      break;
    }
    if (!res.ok) {
      log.warn(`USAJOBS counts: ${id} failed (HTTP ${res.status})`);
      res.body?.cancel?.();
      continue;
    }
    let n, items;
    try {
      const body = await res.json();
      n = body?.SearchResult?.SearchResultCountAll;
      items = body?.SearchResult?.SearchResultItems;
    } catch {
      log.warn(`USAJOBS counts: ${id} failed (response was not JSON)`);
      continue;
    }
    // The API has returned counts as numbers; accept a digit string too, nothing else.
    if (typeof n === 'string' && /^\d+$/.test(n)) n = Number(n);
    if (!Number.isInteger(n) || n < 0) {
      log.warn(`USAJOBS counts: ${id} failed (no valid count in response)`);
      continue;
    }
    counts[id] = n;
    const list = Array.isArray(items) ? items.map((i) => cleanTitle(i?.MatchedObjectDescriptor?.PositionTitle)).filter(Boolean) : [];
    titles[id] = [...new Set(list)];
  }
  return { checkedAt: mountainDate(now), counts, titles, eligible: eligible.length };
}
