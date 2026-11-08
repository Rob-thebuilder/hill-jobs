// Events (job fairs, resume workshops, meet-and-greets) near Hill AFB: curated ones from
// data/events.json plus ones read at build time from public calendars. Node built-ins only.
import { makeClient, isNearby, decode } from './careers.mjs';

export const EVENTS_USER_AGENT = 'WorkAtHill-Events/1.0 (+https://workathill.com)';
export const EVENT_TYPES = { 'job-fair': 'Job fair', workshop: 'Workshop', 'meet-greet': 'Meet & greet', other: 'Event' };
const MAX_PAGES = 4;

/** Guesses the event type from its title. */
export function classify(title) {
  const t = String(title).toLowerCase();
  if (/\b(job|career|hiring|internship)\s+(fair|expo|event)s?\b|\bhiring event\b|\bcareer fair\b|\bjob fair\b/.test(t)) return 'job-fair';
  if (/\b(resume|résumé|workshop|interview|class|seminar|training|briefing)\b/.test(t)) return 'workshop';
  if (/\b(network\w*|meet (and|&) greet|mixer|coffee|connection|open house)\b/.test(t)) return 'meet-greet';
  return 'other';
}

const words = (s) => new Set(String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter((w) => w.length > 2));

/** Drops near-duplicates: same day and city, and mostly the same words in the title. */
export function dedupe(events) {
  const kept = [];
  for (const e of events) {
    const day = e.start.slice(0, 10);
    const w = words(e.title);
    const dup = kept.find((k) => {
      if (k.start.slice(0, 10) !== day || (k.city || '') !== (e.city || '')) return false;
      const kw = words(k.title);
      const shared = [...w].filter((x) => kw.has(x)).length;
      return shared / Math.max(1, Math.min(w.size, kw.size)) >= 0.6;
    });
    if (!dup) kept.push(e);
  }
  return kept;
}

/**
 * Upcoming events (still on or after `today`, a YYYY-MM-DD string), soonest first, without
 * duplicates. A series (same title and city) shows only its next date, with `moreDates` counting the rest.
 */
export function upcoming(events, today) {
  const live = events.filter((e) => (e.end || e.start).slice(0, 10) >= today);
  live.sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
  const series = new Map();
  const out = [];
  for (const e of dedupe(live)) {
    const key = `${e.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}|${e.city || ''}`;
    if (series.has(key)) {
      series.get(key).moreDates++;
      continue;
    }
    const first = { ...e, moreDates: 0 };
    series.set(key, first);
    out.push(first);
  }
  return out;
}

// ---------- calendar readers ----------

const adapters = {
  // The Events Calendar (WordPress) REST API: /wp-json/tribe/events/v1/events
  async tribe(src, get, { today }) {
    const out = [];
    let url = `${src.base}/wp-json/tribe/events/v1/events?per_page=50&start_date=${today}`;
    for (let page = 0; url && page < MAX_PAGES; page++) {
      const data = await get(url, { json: true });
      for (const e of data?.events || []) {
        const v = e.venue && !Array.isArray(e.venue) ? e.venue : null;
        const city = v?.city ? [v.city, v.state || v.stateprovince || v.province].filter(Boolean).join(', ') : '';
        out.push({
          title: decode(e.title || ''),
          start: String(e.start_date || '').replace(' ', 'T').slice(0, 16),
          end: String(e.end_date || '').replace(' ', 'T').slice(0, 16) || null,
          allDay: !!e.all_day,
          city: city || src.defaultCity || '',
          venue: v?.venue ? decode(v.venue) : '',
          url: e.url,
          categories: (e.categories || []).map((c) => decode(c.name || '')),
        });
      }
      url = data?.next_rest_url || null;
    }
    return out;
  },
};

/**
 * Reads every calendar in `config` and keeps job-related events at Hill AFB / Northern Utah.
 * Returns { events: [...], failed: { id: reason } }. Never throws.
 */
export async function fetchEvents(config, places, { fetchImpl = globalThis.fetch, timeoutMs = 15_000, today, log = console } = {}) {
  const get = makeClient(fetchImpl, timeoutMs, EVENTS_USER_AGENT);
  const keywords = new RegExp(config?.keywords || 'job|career|hiring', 'i');
  const events = [];
  const failed = {};
  for (const src of config?.sources || []) {
    const adapter = adapters[src.type];
    if (!adapter) {
      failed[src.id] = `unknown source type "${src.type}"`;
      continue;
    }
    try {
      const raw = await adapter(src, get, { today });
      for (const e of raw) {
        if (!e.title || !/^\d{4}-\d{2}-\d{2}/.test(e.start) || !/^https:\/\//.test(e.url || '')) continue;
        if (!keywords.test(e.title) && !e.categories.some((c) => keywords.test(c))) continue;
        const near = isNearby(e.city, places) || isNearby(e.venue, places) || /\bhill (afb|air force base)\b/i.test(e.title);
        if (!near) continue;
        events.push({
          id: `${src.id}-${e.start.slice(0, 10)}-${e.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`,
          title: e.title,
          type: classify(e.title),
          start: e.start,
          end: e.end,
          allDay: e.allDay,
          city: e.city,
          venue: e.venue,
          host: src.name,
          url: e.url,
          source: src.id,
        });
      }
    } catch (err) {
      failed[src.id] = err?.name === 'TimeoutError' ? 'timed out' : err?.message || err?.name || 'error';
      log.warn(`Events: ${src.id} skipped (${failed[src.id]})`);
    }
  }
  return { events, failed };
}
