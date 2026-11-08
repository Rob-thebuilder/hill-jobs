// Build-time open-job counts from the official USAJOBS Search API. Node built-ins only.
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

/** YYYY-MM-DD in Mountain Time, the base's local date. */
export function mountainDate(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/**
 * Fetches counts for every employer whose jobsUrl maps to API params.
 * Returns null when there are no credentials, else { checkedAt: 'YYYY-MM-DD', counts: { id: n }, eligible: n }.
 * Never throws for network/API problems; failed entries are simply left out.
 */
export async function fetchCounts(employers, { key, email, apiUrl = API_URL, fetchImpl = globalThis.fetch, timeoutMs = 10_000, now = new Date(), log = console } = {}) {
  const eligible = employers
    .map((e) => ({ id: e.id, params: apiParamsFromJobsUrl(e.jobsUrl) }))
    .filter((e) => e.params);
  if (!key || !email) {
    log.warn('USAJOBS counts: skipped (no API key or email set)');
    return null;
  }

  const counts = {};
  for (const { id, params } of eligible) {
    const url = new URL(apiUrl);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set('ResultsPerPage', '1');
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
    let n;
    try {
      n = (await res.json())?.SearchResult?.SearchResultCountAll;
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
  }
  return { checkedAt: mountainDate(now), counts, eligible: eligible.length };
}
