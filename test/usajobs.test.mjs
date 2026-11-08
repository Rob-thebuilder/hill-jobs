import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { apiParamsFromJobsUrl, fetchUsajobs, mountainDate } from '../scripts/lib/usajobs.mjs';

const data = JSON.parse(await readFile(new URL('../data/employers.json', import.meta.url), 'utf8'));
const FAKE_KEY = 'FAKE-KEY-123-do-not-log';
const FAKE_EMAIL = 'fake-sender@example.invalid';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const countBody = (n) => ({ SearchResult: { SearchResultCount: 1, SearchResultCountAll: n, SearchResultItems: [] } });
const captureLog = () => {
  const lines = [];
  return { lines, log: { warn: (...a) => lines.push(a.join(' ')), log: (...a) => lines.push(a.join(' ')) } };
};
const emp = (id, jobsUrl) => ({ id, jobsUrl });

// ---------- URL → API params ----------

test('every current USAJOBS jobsUrl maps to API params', () => {
  const expected = {
    'air-force-civilian-hill': { LocationName: 'Hill AFB, Utah', Organization: 'AF1M' },
    '75th-force-support-squadron': { LocationName: 'Hill AFB, Utah', Organization: 'AF1M', JobGradeCode: 'NA;NF;NL;NS' },
    'af-civilian-career-training': { LocationName: 'Hill AFB, Utah', Organization: 'AF1Y' },
    'dla-hill': { LocationName: 'Hill AFB, Utah', Organization: 'DD07' },
    'deca-hill-commissary': { LocationName: 'Hill AFB, Utah', Organization: 'DD34' },
    '419th-fighter-wing': { LocationName: 'Hill AFB, Utah', Organization: 'AF0M' },
    '75th-medical-group': { LocationName: 'Hill AFB, Utah', Organization: 'DD83' },
  };
  const mapped = Object.fromEntries(data.employers.map((e) => [e.id, apiParamsFromJobsUrl(e.jobsUrl)]).filter(([, p]) => p));
  assert.deepEqual(mapped, expected);
});

test('several agency codes are joined with ";"', () => {
  assert.deepEqual(apiParamsFromJobsUrl('https://www.usajobs.gov/search/results/?l=Hill%20AFB%2C%20Utah&a=AF1M&a=DD07'), {
    LocationName: 'Hill AFB, Utah',
    Organization: 'AF1M;DD07',
  });
});

test('URLs that cannot be mapped exactly get no count', () => {
  for (const url of [
    'https://www.usajobs.gov/search/results/?l=Hill%20AFB%2C%20Utah&a=AF1M&k=engineer', // unknown param
    'https://www.usajobs.gov/search/results/?a=AF1M', // no location
    'https://www.usajobs.gov/search/results/', // no params
    'https://www.usajobs.gov/job/885616700', // different path
    'https://usajobs.example.com/search/results/?l=Hill', // different host
    'http://www.usajobs.gov/search/results/?l=Hill', // not https
    'https://www.applymyexchange.com/hourly/',
    'not a url',
  ]) {
    assert.equal(apiParamsFromJobsUrl(url), null, url);
  }
});

// ---------- fetchUsajobs ----------

const fed = data.employers;

test('no key or email: returns null and makes no requests', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return json(countBody(1)); };
  for (const creds of [{ key: '', email: FAKE_EMAIL }, { key: FAKE_KEY, email: '' }, {}]) {
    const { log, lines } = captureLog();
    assert.equal(await fetchUsajobs(fed, { ...creds, fetchImpl, log }), null);
    assert.match(lines.join('\n'), /skipped/);
  }
  assert.equal(calls, 0);
});

test('success: one request per eligible entry with exactly the documented headers', async () => {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url: new URL(url), headers: init.headers });
    return json(countBody(seen.length * 2));
  };
  const { log } = captureLog();
  const r = await fetchUsajobs(fed, { key: FAKE_KEY, email: FAKE_EMAIL, fetchImpl, log, now: new Date('2026-11-06T18:00:00Z') });
  assert.equal(r.checkedAt, '2026-11-06');
  assert.equal(r.eligible, 7);
  assert.equal(seen.length, 7);
  assert.equal(Object.keys(r.counts).length, 7);
  assert.equal(r.counts['air-force-civilian-hill'], 2);
  for (const s of seen) {
    assert.deepEqual(s.headers, { Host: 'data.usajobs.gov', 'User-Agent': FAKE_EMAIL, 'Authorization-Key': FAKE_KEY });
    assert.equal(s.url.origin + s.url.pathname, 'https://data.usajobs.gov/api/search');
    assert.equal(s.url.searchParams.get('ResultsPerPage'), '500');
    assert.equal(s.url.searchParams.get('LocationName'), 'Hill AFB, Utah');
  }
  const fss = seen.find((s) => s.url.searchParams.get('JobGradeCode'));
  assert.equal(fss.url.searchParams.get('JobGradeCode'), 'NA;NF;NL;NS');
  assert.ok(!('aafes-hill-exchange' in r.counts));
});

test('one failing entry does not stop the others', async () => {
  let i = 0;
  const fetchImpl = async () => (++i === 2 ? json({}, 500) : json(countBody(5)));
  const { log, lines } = captureLog();
  const r = await fetchUsajobs(fed, { key: FAKE_KEY, email: FAKE_EMAIL, fetchImpl, log });
  assert.equal(Object.keys(r.counts).length, 6);
  assert.match(lines.join('\n'), /HTTP 500/);
});

test('401/403 stops early (bad key)', async () => {
  for (const status of [401, 403]) {
    let calls = 0;
    const fetchImpl = async () => { calls++; return new Response('nope', { status }); };
    const { log, lines } = captureLog();
    const r = await fetchUsajobs(fed, { key: FAKE_KEY, email: FAKE_EMAIL, fetchImpl, log });
    assert.equal(calls, 1);
    assert.deepEqual(r.counts, {});
    assert.match(lines.join('\n'), new RegExp(`HTTP ${status}`));
  }
});

test('network errors, timeouts and bad JSON skip just that entry', async () => {
  const responses = [
    () => { throw new TypeError('fetch failed'); },
    // Hangs until the timeout fires. The interval keeps the event loop alive like a real open socket
    // would (AbortSignal.timeout's own timer doesn't).
    (init) => new Promise((resolve, reject) => {
      const keepAlive = setInterval(() => {}, 1000);
      init.signal.addEventListener('abort', () => { clearInterval(keepAlive); reject(init.signal.reason); });
    }),
    () => new Response('<html>not json</html>', { status: 200 }),
    () => json(countBody(3)),
  ];
  let i = 0;
  const fetchImpl = async (url, init) => responses[Math.min(i++, responses.length - 1)](init);
  const { log, lines } = captureLog();
  const r = await fetchUsajobs(fed, { key: FAKE_KEY, email: FAKE_EMAIL, fetchImpl, log, timeoutMs: 30 });
  assert.equal(Object.keys(r.counts).length, 4);
  const text = lines.join('\n');
  assert.match(text, /network error|TypeError/);
  assert.match(text, /timed out/);
  assert.match(text, /not JSON/);
});

test('only non-negative integer counts are accepted', async () => {
  const bodies = [countBody(-1), countBody(1.5), countBody('7'), countBody(null), { nothing: true }, countBody(0), countBody('abc')];
  let i = 0;
  const fetchImpl = async () => json(bodies[i++]);
  const { log } = captureLog();
  const r = await fetchUsajobs(fed, { key: FAKE_KEY, email: FAKE_EMAIL, fetchImpl, log });
  assert.deepEqual(Object.values(r.counts).sort(), [0, 7]);
});

test('credentials never appear in log output, whatever fails', async () => {
  const failures = [
    () => { throw Object.assign(new Error(`boom ${FAKE_KEY} ${FAKE_EMAIL}`), { cause: { key: FAKE_KEY } }); },
    () => new Response(`echo ${FAKE_KEY}`, { status: 500 }),
    () => new Response(`echo ${FAKE_KEY}`, { status: 200 }),
    () => json({ SearchResult: { SearchResultCountAll: FAKE_KEY } }),
    () => new Response(FAKE_KEY, { status: 401 }),
  ];
  let i = 0;
  const fetchImpl = async () => failures[i++ % failures.length]();
  const { log, lines } = captureLog();
  await fetchUsajobs(fed, { key: FAKE_KEY, email: FAKE_EMAIL, fetchImpl, log });
  const text = lines.join('\n');
  assert.ok(lines.length >= 5);
  assert.ok(!text.includes(FAKE_KEY), 'key leaked into logs');
  assert.ok(!text.includes(FAKE_EMAIL), 'email leaked into logs');
});

test('checked date is the Mountain Time date', () => {
  assert.equal(mountainDate(new Date('2026-11-07T05:30:00Z')), '2026-11-06'); // 10:30 pm MST
  assert.equal(mountainDate(new Date('2026-11-07T07:30:00Z')), '2026-11-07'); // 12:30 am MST
  assert.equal(mountainDate(new Date('2026-07-01T05:30:00Z')), '2026-06-30'); // 11:30 pm MDT
});

// ---------- live job titles ----------

import { cleanTitle } from '../scripts/lib/usajobs.mjs';

test('job titles are cleaned up for display and search', () => {
  const cases = {
    'SUPERVISORY SYSTEMS ENGINEER - DIRECT HIRE AUTHORITY': 'Supervisory systems engineer',
    'LOGISTICS MANAGEMENT SPECIALIST-DIRECT HIRE AUTHORITY': 'Logistics management specialist',
    'Information Technology Specialist (SysAnalysis) Direct Hire Authority': 'Information Technology Specialist (SysAnalysis)',
    'INTELLIGENCE SPECIALIST - ALTERNATE HIRING AUTHORITY': 'Intelligence specialist',
    'IT SPECIALIST (INFOSEC)': 'IT specialist (INFOSEC)',
    'INFORMATION TECHNOLOGY SPECIALIST NH-2210-03 - DIRECT HIRE AUTHORITY': 'Information technology specialist NH-2210-03',
    'AIRCRAFT MECHANIC (F-35)': 'Aircraft mechanic (F-35)',
    'F-35 LO TECHNICIAN': 'F-35 LO technician',
    'Sales Store Checker': 'Sales Store Checker',
    '  ': '',
  };
  for (const [raw, want] of Object.entries(cases)) assert.equal(cleanTitle(raw), want, raw);
});

test('titles come back per employer, cleaned and de-duplicated; failures give none', async () => {
  const items = (...t) => t.map((x) => ({ MatchedObjectDescriptor: { PositionTitle: x } }));
  let i = 0;
  const fetchImpl = async () => {
    i++;
    if (i === 1) return json({ SearchResult: { SearchResultCountAll: 3, SearchResultItems: items('AIRCRAFT MECHANIC', 'AIRCRAFT MECHANIC - DIRECT HIRE AUTHORITY', 'PAINTER') } });
    if (i === 2) return json({}, 500);
    return json({ SearchResult: { SearchResultCountAll: 0, SearchResultItems: [] } });
  };
  const { log } = captureLog();
  const r = await fetchUsajobs(fed, { key: FAKE_KEY, email: FAKE_EMAIL, fetchImpl, log });
  const ids = Object.keys(r.counts);
  assert.equal(ids.length, 6);
  assert.deepEqual(r.titles[ids[0]], ['Aircraft mechanic', 'Painter']);
  assert.equal(r.counts[ids[0]], 3); // count is the API total, not the number of distinct titles
  const failedId = data.employers.filter((e) => apiParamsFromJobsUrl(e.jobsUrl))[1].id;
  assert.ok(!(failedId in r.titles) && !(failedId in r.counts));
  assert.deepEqual(r.titles[ids[1]], []);
});
