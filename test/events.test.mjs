import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { classify, dedupe, upcoming, fetchEvents, EVENTS_USER_AGENT } from '../scripts/lib/events.mjs';
import {
  renderBase, renderResourcesPanel, renderEventsPanel, renderNextUp, eventWhen, validateResources, validateEvents,
} from '../scripts/build.mjs';

const read = async (rel) => JSON.parse(await readFile(new URL(`../${rel}`, import.meta.url), 'utf8'));
const places = await read('data/locations.json');
const resources = await read('data/resources.json');
const eventsFile = await read('data/events.json');
const eventSources = await read('data/event-sources.json');
const quiet = { warn() {}, log() {} };
const strip = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

// ---------- data files ----------

test('resources.json and events.json are valid', () => {
  assert.deepEqual(validateResources(resources), []);
  assert.deepEqual(validateEvents(eventsFile, eventSources), []);
});

test('bad resource and event entries are caught', () => {
  const bad = structuredClone(resources);
  bad.resources[0].cost = 'cheap';
  bad.resources[1].url = 'http://example.com';
  bad.resources[2].id = bad.resources[3].id;
  bad.resources[4].services = [];
  delete bad.resources[5].sourceUrl;
  bad.resources[6].extra = 1;
  const errors = validateResources(bad).join('\n');
  for (const want of [/cost must be/, /must be https/, /duplicate id/, /1–6 services/, /missing "sourceUrl"/, /unknown field "extra"/]) assert.match(errors, want);

  const badEvents = {
    events: [{ id: 'x', title: 'Fair', type: 'party', start: 'Nov 3', city: 'Ogden', host: 'Someone', url: 'https://a.example', sourceUrl: 'https://a.example' }],
    annual: [{ id: 'x', title: 'Dup', type: 'job-fair', timing: 'Yearly', host: 'H', url: 'https://a.example', sourceUrl: 'https://a.example' }],
  };
  const e = validateEvents(badEvents, { keywords: '(', sources: [] }).join('\n');
  for (const want of [/type must be/, /start must be/, /duplicate id/, /not a valid pattern/]) assert.match(e, want);
});

// ---------- classification, de-duplication, upcoming ----------

test('event titles are sorted into job fairs, workshops and meet-and-greets', () => {
  assert.equal(classify('Hill AFB Hiring Event'), 'job-fair');
  assert.equal(classify('Manufacturing and Construction Career Fair'), 'job-fair');
  assert.equal(classify('Two-Page Federal Resume Workshop'), 'workshop');
  assert.equal(classify('Military Networking hosted by Warrior Revival'), 'meet-greet');
  assert.equal(classify('Employer Meet & Greet'), 'meet-greet');
  assert.equal(classify('Veterans Day Concert'), 'other');
});

const ev = (start, title, city = 'Ogden, UT') => ({ id: `${start}-${title}`, title, start, city, type: 'meet-greet', url: 'https://x.example', host: 'Host' });

test('the same event listed twice on one day is shown once', () => {
  const list = dedupe([
    ev('2026-11-29T10:00', 'Military Networking hosted by Warrior Revival'),
    ev('2026-11-29T10:00', 'Warrior Revival Military Networking'),
    ev('2026-11-29T10:00', 'Resume Workshop'),
  ]);
  assert.deepEqual(list.map((e) => e.title), ['Military Networking hosted by Warrior Revival', 'Resume Workshop']);
});

test('upcoming: past events drop off, soonest first, a monthly series shows once', () => {
  const list = upcoming([
    ev('2026-12-27T10:00', 'Military Networking'),
    ev('2026-11-07T10:00', 'Yesterday Fair'),
    ev('2026-11-29T10:00', 'Military Networking'),
    ev('2026-11-20T11:30', 'Veteran Networking', 'Kaysville, UT'),
    { ...ev('2026-11-07T09:00', 'Two-day Expo'), end: '2026-11-08T17:00' },
  ], '2026-11-08');
  assert.deepEqual(list.map((e) => `${e.start.slice(0, 10)} ${e.title} +${e.moreDates}`), [
    '2026-11-07 Two-day Expo +0', // still on today
    '2026-11-20 Veteran Networking +0',
    '2026-11-29 Military Networking +1',
  ]);
});

test('event dates read naturally', () => {
  assert.equal(eventWhen({ start: '2026-11-29T10:00' }), 'Sun, Nov 29, 2026 · 10:00 a.m.');
  assert.equal(eventWhen({ start: '2026-11-20T13:30' }), 'Fri, Nov 20, 2026 · 1:30 p.m.');
  assert.equal(eventWhen({ start: '2027-01-14T00:00' }), 'Thu, Jan 14, 2027');
  assert.equal(eventWhen({ start: '2027-03-11', allDay: true }), 'Thu, Mar 11, 2027');
});

// ---------- reading calendars (fake responses) ----------

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
function fakeFetch(handler, robots = 'User-agent: *\nAllow: /\n') {
  const calls = [];
  const fn = async (url, init = {}) => {
    const u = new URL(url);
    calls.push({ url: u.toString(), ua: init.headers?.['User-Agent'] });
    if (u.pathname === '/robots.txt') return typeof robots === 'number' ? new Response('', { status: robots }) : new Response(robots);
    return handler(u);
  };
  fn.calls = calls;
  return fn;
}
const tribe = (...events) => json({ events, total: events.length });
const tEvent = (title, start, venue = null, extra = {}) => ({ title, start_date: start, end_date: start, all_day: false, url: 'https://cal.example/e/1', venue: venue || [], categories: [], ...extra });

test('calendar events are kept only if job-related and nearby', async () => {
  const cfg = { keywords: eventSources.keywords, sources: [{ id: 'vets', name: 'Utah Veterans', type: 'tribe', base: 'https://cal.example' }] };
  const fetchImpl = fakeFetch(() => tribe(
    tEvent('Military Networking hosted by Warrior Revival', '2026-11-29 10:00:00', { venue: 'BBQ', city: 'Ogden', state: 'UT' }),
    tEvent('Veterans Day Concert', '2026-11-11 19:00:00', { city: 'Ogden', state: 'UT' }),
    tEvent('Career Fair', '2026-12-01 10:00:00', { city: 'Provo', state: 'UT' }),
    tEvent('Hill AFB Hiring Event', '2027-01-14 09:00:00'),
    tEvent('Resume Workshop', '2026-12-02 10:00:00', { city: 'Layton', state: 'UT' }, { url: 'http://insecure.example' }),
  ));
  const r = await fetchEvents(cfg, places, { fetchImpl, today: '2026-11-08', log: quiet });
  assert.deepEqual(r.events.map((e) => e.title), ['Military Networking hosted by Warrior Revival', 'Hill AFB Hiring Event']);
  assert.equal(r.events[0].type, 'meet-greet');
  assert.equal(r.events[0].start, '2026-11-29T10:00');
  assert.equal(r.events[0].city, 'Ogden, UT');
  assert.ok(fetchImpl.calls.every((c) => c.ua === EVENTS_USER_AGENT));
  assert.match(fetchImpl.calls[1].url, /start_date=2026-11-08/);
});

test('a calendar with no venue uses its default city, and pages are followed', async () => {
  const cfg = { keywords: 'fair', sources: [{ id: 'otech', name: 'OTECH', type: 'tribe', base: 'https://cal.example', defaultCity: 'Ogden, UT' }] };
  let page = 0;
  const fetchImpl = fakeFetch(() => {
    page++;
    return json({
      events: [tEvent(`Career Fair ${page}`, `2026-11-1${page} 14:00:00`)],
      next_rest_url: page < 2 ? 'https://cal.example/wp-json/tribe/events/v1/events?page=2' : undefined,
    });
  });
  const r = await fetchEvents(cfg, places, { fetchImpl, today: '2026-11-08', log: quiet });
  assert.deepEqual(r.events.map((e) => e.title), ['Career Fair 1', 'Career Fair 2']);
});

test('robots.txt is respected and a broken calendar does not stop the others', async () => {
  const cfg = {
    keywords: 'fair',
    sources: [
      { id: 'blocked', name: 'Blocked', type: 'tribe', base: 'https://blocked.example' },
      { id: 'broken', name: 'Broken', type: 'tribe', base: 'https://broken.example' },
      { id: 'ok', name: 'OK', type: 'tribe', base: 'https://ok.example' },
    ],
  };
  const calls = [];
  const fetchImpl = async (url) => {
    const u = new URL(url);
    calls.push(u.toString());
    if (u.pathname === '/robots.txt') return new Response(u.host === 'blocked.example' ? 'User-agent: *\nDisallow: /wp-json/\n' : '');
    if (u.host === 'broken.example') return new Response('<html>oops</html>', { status: 500 });
    return tribe(tEvent('Job Fair', '2026-12-01 10:00:00', { city: 'Layton', state: 'UT' }));
  };
  const r = await fetchEvents(cfg, places, { fetchImpl, today: '2026-11-08', log: quiet });
  assert.match(r.failed.blocked, /robots\.txt disallows/);
  assert.match(r.failed.broken, /HTTP 500/);
  assert.deepEqual(r.events.map((e) => e.source), ['ok']);
  assert.ok(!calls.some((c) => c.startsWith('https://blocked.example/wp-json')));
});

// ---------- rendering ----------

test('resume help: free listings first, then paid with the no-endorsement note', () => {
  const html = renderResourcesPanel(structuredClone(resources.resources));
  const text = strip(html);
  assert.ok(text.indexOf('Resources 7') < text.indexOf('Resume Professionals'));
  for (const r of resources.resources) assert.ok(html.includes(r.name.replace(/&/g, '&amp;')), r.name);
  assert.match(text, /doesn't endorse them, and nobody pays to be listed/);
  for (const r of resources.resources) if (r.sourceUrl !== r.url) assert.ok(!html.includes(r.sourceUrl), `sourceUrl leaked: ${r.id}`);
});

test('events panel: upcoming events, yearly events and an honest empty state', () => {
  const list = upcoming([ev('2026-11-29T10:00', 'Military Networking'), ev('2026-12-27T10:00', 'Military Networking')], '2026-11-08');
  const html = renderEventsPanel(list, eventsFile.annual, 'Event calendars last checked Nov 8, 2026.');
  assert.match(strip(html), /Sun, Nov 29, 2026 · 10:00 a\.m\. · repeats \(1 more date\)/);
  for (const a of eventsFile.annual) assert.ok(html.includes(`id="an-${a.id}"`));
  assert.match(strip(renderEventsPanel([], eventsFile.annual, '')), /No dated events are posted right now/);
});

test('the "Upcoming events" strip shows at most 3 and links to the Events tab', () => {
  const five = [1, 2, 3, 4, 5].map((d) => ev(`2026-12-0${d}T10:00`, `Job Fair ${d}`));
  const html = renderNextUp(five);
  assert.equal((html.match(/<li>/g) || []).length, 3);
  assert.match(html, /href="#events" data-tab-link="events"/);
  assert.match(strip(renderNextUp([])), /No dated events right now/);
});

test('the page has three tabs and three panels, with counts', async () => {
  const data = await read('data/employers.json');
  const site = await read('data/site.json');
  const template = await readFile(new URL('../templates/base.html', import.meta.url), 'utf8');
  const list = upcoming([ev('2026-11-29T10:00', 'Military Networking')], '2026-11-08');
  const html = renderBase('hill', data.bases.hill, data.employers, site, template, null, null, null, {
    resources: resources.resources, events: list, annual: eventsFile.annual, eventsChecked: 'x',
  });
  for (const id of ['employers', 'resume-help', 'events']) assert.match(html, new RegExp(`<section id="${id}" class="panel`));
  assert.match(html, /data-tab="resume">Resume Resources <span class="tab-n">9<\/span>/);
  assert.match(html, /<h2 id="resume-heading">Resume Resources Near Hill<\/h2>/);
  assert.match(html, /data-tab="events">Events <span class="tab-n">1<\/span>/);
  assert.equal((html.match(/<h1>/g) || []).length, 1);
  assert.match(html, /<p class="eyebrow">Hill AFB, Utah<\/p>/);
});
