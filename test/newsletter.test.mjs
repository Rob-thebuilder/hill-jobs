import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  newsletterReady, subscribeAction, alertTag, safeAlertTags, newTitles, matchAlert, renderWeeklyEmail,
  fetchAlertTags, createEmail, API,
} from '../scripts/lib/newsletter.mjs';
import { renderAlertBox, renderSignupFooter, renderPrivacy, validateNewsletter } from '../scripts/build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = async (rel) => JSON.parse(await readFile(path.join(ROOT, rel), 'utf8'));
const synonyms = await read('data/synonyms.json');
const baseSite = await read('data/site.json');
const ready = { ...baseSite, newsletter: { buttondownUsername: 'workathill', postalAddress: 'PO Box 123, Layton, UT 84041', sendMode: 'draft' } };

// ---------- settings ----------

test('signup stays off until both the Buttondown username and a postal address are set', () => {
  assert.equal(newsletterReady(baseSite), false);
  assert.equal(newsletterReady({ newsletter: { buttondownUsername: 'workathill', postalAddress: null } }), false);
  assert.equal(newsletterReady(ready), true);
  assert.deepEqual(validateNewsletter(baseSite), []);
  assert.deepEqual(validateNewsletter(ready), []);
  assert.match(validateNewsletter({ newsletter: { buttondownUsername: 'workathill', postalAddress: '', sendMode: 'draft' } }).join(), /postal address/);
  assert.match(validateNewsletter({ newsletter: { buttondownUsername: 'bad name!', postalAddress: 'PO Box 123, Layton UT', sendMode: 'draft' } }).join(), /unexpected characters/);
  assert.match(validateNewsletter({ newsletter: { buttondownUsername: null, postalAddress: null, sendMode: 'blast' } }).join(), /sendMode/);
});

test('forms: none before setup; after setup they post to Buttondown with the right tags', () => {
  assert.equal(renderAlertBox(baseSite), '');
  assert.equal(renderSignupFooter(baseSite), '');
  const alert = renderAlertBox(ready);
  const footer = renderSignupFooter(ready);
  for (const html of [alert, footer]) {
    assert.match(html, new RegExp(`action="${subscribeAction('workathill').replace(/[.?]/g, '\\$&')}" method="post" target="_blank"`));
    assert.match(html, /<input [^>]*type="email" name="email" required/);
    assert.match(html, /name="tag" value="weekly"/);
    assert.match(html, /href="\.\/privacy\/">Privacy<\/a>/);
    assert.match(html, /confirm by email first/);
  }
  assert.match(alert, /id="alert-form"[^>]*hidden/);
  assert.match(alert, /name="tag" id="alert-tag" value=""/);
});

test('privacy page shows the postal address, or a placeholder before setup', async () => {
  const template = await readFile(path.join(ROOT, 'templates/privacy.html'), 'utf8');
  assert.match(renderPrivacy(ready, template), /Work At Hill, PO Box 123, Layton, UT 84041/);
  assert.match(renderPrivacy(baseSite, template), /will be posted here/);
  assert.match(renderPrivacy(ready, template), /No accounts, no cookies, no analytics/);
});

// ---------- saved-search tags ----------

test('saved-search tags are normalized like the site search', () => {
  assert.equal(alertTag('Sheet Metal'), 'search:sheet metal');
  assert.equal(alertTag('  LO  '), 'search:lo');
  assert.equal(alertTag('A&P'), 'search:ap');
  assert.equal(alertTag('F-35 crew'), 'search:f 35 crew');
  assert.equal(alertTag('   '), null);
  assert.equal(alertTag('x'.repeat(80)).length, 'search:'.length + 40);
});

test('only safe tags reach the email template (no injection, no junk, capped)', () => {
  const evil = "search:x' in subscriber.tags %}{{ subscriber.email }}{% if '";
  const kept = safeAlertTags([
    'weekly', 'search:painter', 'search:painter', evil, 'search:Upper', 'search:a  b', 'search:{{x}}',
    `search:${'a'.repeat(41)}`, 'search:', 42, null,
  ]);
  assert.deepEqual(kept, ['search:painter']);
  const many = Array.from({ length: 150 }, (_, i) => `search:term ${i}`);
  assert.equal(safeAlertTags(many).length, 100);
});

// ---------- weekly content ----------

const snapshot = (titles, events = []) => ({
  date: '2026-11-09',
  employers: [
    { id: 'kihomac', name: 'KIHOMAC', jobsUrl: 'https://www.kihomac.com/careers/', titles: titles.kihomac || [] },
    { id: 'air-force-civilian-hill', name: 'Air Force civilian jobs at Hill', jobsUrl: 'https://www.usajobs.gov/search/results/?l=Hill%20AFB%2C%20Utah&a=AF1M', titles: titles.af || [] },
  ],
  events,
});

test('new jobs are the titles that were not there last week; the first run has none', () => {
  const prev = snapshot({ kihomac: ['Machinist'], af: ['Aircraft mechanic'] });
  const cur = snapshot({ kihomac: ['Machinist', 'Master Craftsman Sheet Metal Technician'], af: ['Aircraft mechanic', 'Painter'] });
  const fresh = newTitles(cur, prev);
  assert.deepEqual(fresh.map((e) => [e.id, e.titles]), [['air-force-civilian-hill', ['Painter']], ['kihomac', ['Master Craftsman Sheet Metal Technician']]]);
  assert.equal(newTitles(cur, null), null);
  assert.deepEqual(matchAlert(fresh, 'sheetmetal', synonyms).map((e) => e.titles), [['Master Craftsman Sheet Metal Technician']]);
  assert.deepEqual(matchAlert(fresh, 'LO', synonyms).map((e) => e.titles), [['Painter']]); // LO is in the painting group
  assert.deepEqual(matchAlert(fresh, 'welder', synonyms), []);
});

test('the weekly email: events in the next month, new jobs, one section per saved search, address in footer', () => {
  const events = [
    { title: 'Military Networking', start: '2026-11-29T10:00', city: 'Ogden, UT', type: 'meet-greet', url: 'https://cal.example/1' },
    { title: 'Far Future Fair', start: '2027-03-01T10:00', city: 'Layton, UT', type: 'job-fair', url: 'https://cal.example/2' },
    { title: 'Last Week', start: '2026-11-01T10:00', city: 'Ogden, UT', type: 'job-fair', url: 'https://cal.example/3' },
  ];
  const prev = snapshot({ kihomac: [] });
  const cur = snapshot({ kihomac: ['Sheet Metal Technician', 'Aerospace Coater'] }, events);
  const e = renderWeeklyEmail({ current: cur, previous: prev, alertTags: ['search:painter', 'search:welder'], synonyms, site: ready, today: '2026-11-09' });
  assert.equal(e.subject, 'Work At Hill weekly (Nov 9): 2 new jobs and 1 event');
  assert.match(e.body, /Sun, Nov 29<\/strong>: <a href="https:\/\/cal\.example\/1">Military Networking<\/a> · Ogden/);
  assert.ok(!e.body.includes('Far Future Fair') && !e.body.includes('Last Week'));
  assert.match(e.body, /KIHOMAC<\/a> \(2 new\)/);
  assert.match(e.body, /\{% if 'search:painter' in subscriber\.tags %\}<h2>Your saved search: “painter”<\/h2>\n<h3>.*KIHOMAC.*\(1 new\)<\/h3>\n<ul><li>Aerospace Coater<\/li><\/ul>/);
  assert.match(e.body, /\{% if 'search:welder' in subscriber\.tags %\}.*No new matches this week/s);
  assert.equal((e.body.match(/\{% if /g) || []).length, 2);
  assert.equal((e.body.match(/\{% endif %\}/g) || []).length, 2);
  assert.match(e.body, /PO Box 123, Layton, UT 84041/);
  assert.match(e.body, /not affiliated with or endorsed by/);
});

test('job titles from careers sites cannot inject template code or HTML', () => {
  const cur = snapshot({ kihomac: ['{{ subscriber.email }} Painter', '<script>x</script> {% if 1 %}Coater'] });
  const e = renderWeeklyEmail({ current: cur, previous: snapshot({}), alertTags: [], synonyms, site: ready, today: '2026-11-09' });
  assert.ok(!e.body.includes('{{'), 'no "{{" may survive');
  assert.ok(!/\{%(?! if 'search:| endif)/.test(e.body), 'no stray "{%"');
  assert.ok(!e.body.includes('<script>'));
  assert.match(e.body, /&#123;&#123; subscriber\.email &#125;&#125; Painter/);
});

test('first run says the new-jobs list starts next week', () => {
  const e = renderWeeklyEmail({ current: snapshot({ kihomac: ['Machinist'] }), previous: null, alertTags: [], synonyms, site: ready, today: '2026-11-09' });
  assert.match(e.body, /Starting next week, this section lists the jobs posted since the last email/);
  assert.match(e.subject, /new jobs and 0 events/);
});

// ---------- Buttondown API (fake) ----------

const KEY = 'FAKE-BUTTONDOWN-KEY-789';
const jsonRes = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('reads saved-search tags across pages, with the token header', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), auth: init.headers.Authorization });
    if (String(url).includes('page=2')) return jsonRes({ results: [{ tags: ['search:painter', 'weekly'] }], next: null });
    return jsonRes({ results: [{ tags: ['weekly', 'search:sheet metal'] }, { tags: ["search:x' %}{{evil}}"] }], next: `${API}/subscribers?type=regular&page=2` });
  };
  const tags = await fetchAlertTags({ key: KEY, fetchImpl });
  assert.deepEqual(tags, ['search:painter', 'search:sheet metal']);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((c) => c.auth === `Token ${KEY}` && c.url.startsWith(`${API}/subscribers`)));
});

test('creates a draft by default, sends only when asked, and never puts the key in errors', async () => {
  const bodies = [];
  const fetchImpl = async (url, init) => {
    bodies.push(JSON.parse(init.body));
    return jsonRes({ id: 'em_1' });
  };
  await createEmail({ key: KEY, subject: 's', body: 'b', fetchImpl });
  await createEmail({ key: KEY, subject: 's', body: 'b', mode: 'send', fetchImpl });
  assert.deepEqual(bodies.map((b) => b.status), ['draft', 'about_to_send']);
  await assert.rejects(
    createEmail({ key: KEY, subject: 's', body: 'b', fetchImpl: async () => new Response('nope', { status: 401 }) }),
    (err) => /HTTP 401/.test(err.message) && !err.message.includes(KEY),
  );
});

// ---------- the weekly script, end to end, offline ----------

test('weekly-email.mjs previews without an API key and writes the email file', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'wah-weekly-'));
  try {
    await writeFile(path.join(dir, 'cur.json'), JSON.stringify(snapshot({ kihomac: ['Machinist', 'Aerospace Coater'] })));
    await writeFile(path.join(dir, 'prev.json'), JSON.stringify(snapshot({ kihomac: ['Machinist'] })));
    const out = path.join(dir, 'email.html');
    const r = await new Promise((resolve) => {
      const child = spawn(process.execPath, [path.join(ROOT, 'scripts/weekly-email.mjs'), '--current', path.join(dir, 'cur.json'), '--previous', path.join(dir, 'prev.json'), '--out', out], {
        env: { ...process.env, BUTTONDOWN_API_KEY: '' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let text = '';
      child.stdout.on('data', (d) => (text += d));
      child.stderr.on('data', (d) => (text += d));
      child.on('close', (code) => resolve({ code, text }));
    });
    assert.equal(r.code, 0, r.text);
    assert.match(r.text, /Preview only/);
    assert.match(r.text, /1 new job titles since last week/);
    assert.match(await readFile(out, 'utf8'), /Aerospace Coater/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
