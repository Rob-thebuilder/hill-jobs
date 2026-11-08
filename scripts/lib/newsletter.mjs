// Weekly email + saved-search alerts, sent through Buttondown. Node built-ins only.
// The site never stores emails: signup forms post straight to Buttondown, and this module
// only reads subscribers' saved-search tags and creates the weekly email.
import { createRequire } from 'node:module';

const Search = createRequire(import.meta.url)('../../assets/search.js');
export const API = 'https://api.buttondown.com/v1';
const MAX_ALERT_TAGS = 100;
const MAX_TITLES_PER_EMPLOYER = 8;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** True once the site has the settings needed to collect emails lawfully. */
export function newsletterReady(site) {
  const n = site?.newsletter;
  return !!(n && /^[A-Za-z0-9_-]{1,64}$/.test(n.buttondownUsername || '') && typeof n.postalAddress === 'string' && n.postalAddress.trim().length >= 10);
}

export const subscribeAction = (username) => `https://buttondown.com/api/emails/embed-subscribe/${encodeURIComponent(username)}`;

// ---------- saved-search tags ----------

/** "search:sheet metal" for a query, or null. Only plain lowercase words, so a tag is safe to put in a template. */
export function alertTag(query) {
  const term = Search.normalize(query).slice(0, 40).trim();
  return term ? `search:${term}` : null;
}

const SAFE_TAG = /^search:[a-z0-9]+( [a-z0-9]+)*$/;

/**
 * Tags come from subscribers (anyone can edit a form), so only tags that are exactly what
 * alertTag() would produce are used. Anything else could inject template code into everyone's email.
 */
export function safeAlertTags(tags) {
  const out = new Set();
  for (const t of tags) {
    if (typeof t !== 'string' || t.length > 47 || !SAFE_TAG.test(t)) continue;
    if (alertTag(t.slice(7)) !== t) continue;
    out.add(t);
    if (out.size >= MAX_ALERT_TAGS) break;
  }
  return [...out].sort();
}

// ---------- what's new ----------

/** New titles per employer since the previous snapshot, or null on the first run. */
export function newTitles(current, previous) {
  if (!previous) return null;
  const before = new Map(previous.employers.map((e) => [e.id, new Set(e.titles)]));
  const out = [];
  for (const e of current.employers) {
    const seen = before.get(e.id) || new Set();
    const fresh = e.titles.filter((t) => !seen.has(t));
    if (fresh.length) out.push({ ...e, titles: fresh });
  }
  return out.sort((a, b) => b.titles.length - a.titles.length || a.name.localeCompare(b.name));
}

/** New titles matching a saved search, grouped by employer (same rules as the site's search). */
export function matchAlert(fresh, term, synonyms) {
  const entries = [];
  for (const e of fresh) e.titles.forEach((t, i) => entries.push({ id: `${e.id}|${i}`, name: '', description: '', roles: [], titles: [t] }));
  const index = Search.createIndex(entries, synonyms);
  const hits = Object.keys(Search.search(index, term).results);
  const byEmployer = new Map();
  for (const key of hits) {
    const [id, i] = key.split('|');
    const e = fresh.find((x) => x.id === id);
    if (!byEmployer.has(id)) byEmployer.set(id, { ...e, titles: [] });
    byEmployer.get(id).titles.push(e.titles[Number(i)]);
  }
  return [...byEmployer.values()];
}

// ---------- the email ----------

// HTML-escape, and encode every brace so "{{" / "{%" from job sites can't act as template code.
export const esc = (s) =>
  String(s ?? '')
    .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
    .replace(/\{/g, '&#123;')
    .replace(/\}/g, '&#125;');

function shortDate(ymd) {
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number);
  return `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${MONTHS[m - 1]} ${d}`;
}

function employerList(list) {
  return list
    .map((e) => {
      const shown = e.titles.slice(0, MAX_TITLES_PER_EMPLOYER).map((t) => `<li>${esc(t)}</li>`).join('');
      const more = e.titles.length > MAX_TITLES_PER_EMPLOYER ? `<li>…and ${e.titles.length - MAX_TITLES_PER_EMPLOYER} more on their careers site</li>` : '';
      return `<h3><a href="${esc(e.jobsUrl)}">${esc(e.name)}</a> (${e.titles.length} new)</h3>\n<ul>${shown}${more}</ul>`;
    })
    .join('\n');
}

/**
 * Builds { subject, body } for the weekly email. `alertTags` must already be safe (safeAlertTags).
 * Saved-search sections use Buttondown's `{% if 'tag' in subscriber.tags %}` so each person sees only theirs.
 */
export function renderWeeklyEmail({ current, previous, alertTags = [], synonyms, site, today }) {
  const fresh = newTitles(current, previous);
  const horizon = new Date(Date.parse(`${today}T00:00:00Z`) + 31 * 864e5).toISOString().slice(0, 10);
  const events = (current.events || []).filter((e) => e.start.slice(0, 10) >= today && e.start.slice(0, 10) <= horizon);
  const newCount = fresh ? fresh.reduce((n, e) => n + e.titles.length, 0) : 0;
  const siteUrl = site.siteUrl.replace(/\/$/, '');

  const parts = [];
  parts.push(`<p>Here's what's new for job seekers around Hill AFB this week.</p>`);

  parts.push(`<h2>Upcoming events</h2>`);
  parts.push(events.length
    ? `<ul>${events.map((e) => `<li><strong>${shortDate(e.start)}</strong>: <a href="${esc(e.url)}">${esc(e.title)}</a>${e.city ? ` · ${esc(e.city.replace(/,\s*(UT|Utah)$/i, ''))}` : ''}</li>`).join('')}</ul>`
    : `<p>No dated events in the next month. <a href="${siteUrl}/?tab=events">See the yearly job fairs to watch for</a>.</p>`);

  parts.push(`<h2>New jobs near Hill this week</h2>`);
  if (!fresh) parts.push(`<p>Starting next week, this section lists the jobs posted since the last email.</p>`);
  else if (!fresh.length) parts.push(`<p>No new postings were found this week.</p>`);
  else parts.push(employerList(fresh));

  for (const tag of alertTags) {
    const term = tag.slice(7);
    const matches = fresh ? matchAlert(fresh, term, synonyms) : [];
    const body = matches.length ? employerList(matches) : `<p>No new matches this week. We'll keep looking.</p>`;
    parts.push(`{% if '${tag}' in subscriber.tags %}<h2>Your saved search: “${esc(term)}”</h2>\n${body}\n<p><a href="${siteUrl}/?q=${encodeURIComponent(term)}">See every employer that hires for “${esc(term)}”</a></p>{% endif %}`);
  }

  parts.push(`<hr>\n<p>You're getting this because you signed up at <a href="${siteUrl}/">workathill.com</a>. Use the unsubscribe link at the bottom of this email to stop. <a href="${siteUrl}/privacy/">Privacy</a>.</p>`);
  parts.push(`<p>Work At Hill is an independent directory and is not affiliated with or endorsed by the U.S. Air Force, the Department of Defense, or any listed employer.<br>${esc(site.newsletter?.postalAddress || '')}</p>`);

  const [, m, d] = today.split('-').map(Number);
  const subject = `Work At Hill weekly (${MONTHS[m - 1]} ${d}): ${fresh ? `${newCount} new job${newCount === 1 ? '' : 's'}` : 'new jobs'} and ${events.length} event${events.length === 1 ? '' : 's'}`;
  return { subject, body: parts.join('\n'), newCount, eventCount: events.length };
}

// ---------- Buttondown API ----------

async function api(path, { key, fetchImpl, method = 'GET', body }) {
  const res = await fetchImpl(`${API}${path}`, {
    method,
    headers: { Authorization: `Token ${key}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    res.body?.cancel?.();
    throw Object.assign(new Error(`Buttondown API HTTP ${res.status} on ${method} ${path.split('?')[0]}`), { status: res.status });
  }
  return res.json();
}

/** Every saved-search tag in use by active subscribers (validated). */
export async function fetchAlertTags({ key, fetchImpl = globalThis.fetch }) {
  const tags = new Set();
  let path = '/subscribers?type=regular';
  for (let page = 0; path && page < 200; page++) {
    const data = await api(path, { key, fetchImpl });
    for (const s of data?.results || []) for (const t of s.tags || []) tags.add(t);
    path = data?.next ? data.next.replace(API, '') : null;
  }
  return safeAlertTags([...tags]);
}

/** Creates the email in Buttondown: a draft by default, or sends it when mode is 'send'. */
export async function createEmail({ key, subject, body, mode = 'draft', fetchImpl = globalThis.fetch }) {
  return api('/emails', { key, fetchImpl, method: 'POST', body: { subject, body, status: mode === 'send' ? 'about_to_send' : 'draft' } });
}
