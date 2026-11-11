import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isNearby, parseRobots, robotsAllows, extractJsonAfter, fetchCareers, USER_AGENT } from '../scripts/lib/careers.mjs';

const places = JSON.parse(await readFile(new URL('../data/locations.json', import.meta.url), 'utf8'));
const sources = JSON.parse(await readFile(new URL('../data/job-sources.json', import.meta.url), 'utf8'));
const quiet = { warn() {}, log() {} };

// ---------- location filter ----------

test('Hill AFB and Northern Utah places count as nearby; elsewhere does not', () => {
  for (const loc of [
    'Hill AFB, UT', 'Hill AFB, UT, US', 'Hill Air Force Base UT', 'Hill AFB, Utah, United States',
    'Roy, UT, US', 'United States-Utah-Roy', 'Clearfield, UT, US', 'Layton, Utah', 'Sunset, UT',
    'Ogden, Utah, United States', 'Brigham City, UT', 'North Ogden, UT',
  ]) assert.equal(isNearby(loc, places), true, loc);
  for (const loc of [
    'Salt Lake City, UT', 'Draper, UT, US', 'Bluffdale, UT, US', 'UT,US', 'Clinton, MD', 'Layton, NJ',
    'Roy, NM', 'Ogden, IA', 'Wright Patterson AFB, OH, US', '2 Locations', '', null,
  ]) assert.equal(isNearby(loc, places), false, String(loc));
});

// ---------- robots.txt ----------

test('robots.txt rules are read for "*" and matched by longest path', () => {
  const eightfold = parseRobots('User-agent: *\nDisallow: /\nAllow: /$\nAllow: /careers\nAllow: /api/pcsx\n\nUser-agent: Googlebot\nAllow: /\n');
  assert.equal(robotsAllows(eightfold, '/api/pcsx/search?domain=ngc.com'), true);
  assert.equal(robotsAllows(eightfold, '/api/apply/v2/jobs'), false);
  assert.equal(robotsAllows(eightfold, '/'), true);
  assert.equal(robotsAllows(eightfold, '/other'), false);

  const boeing = parseRobots('User-agent: *\nDisallow:/search-jobs/\n');
  assert.equal(robotsAllows(boeing, '/search-jobs/results?x=1'), false);
  assert.equal(robotsAllows(boeing, '/job/layton/project-manager/185/1'), true);

  const amentum = parseRobots('User-agent: *\nDisallow: /api/\nDisallow: /jobs/search?query=\nDisallow: /jobs/search?*&query=\n');
  assert.equal(robotsAllows(amentum, '/jobs/search?location=Utah'), true);
  assert.equal(robotsAllows(amentum, '/jobs/search?location=Utah&query=x'), false);
  assert.equal(robotsAllows(amentum, '/api/jobs'), false);

  assert.deepEqual(parseRobots('User-agent: *\nDisallow:\n'), []); // empty Disallow allows everything
  assert.equal(robotsAllows([], '/anything'), true);
});

test('robots.txt rules for our own user agent take priority over "*"', () => {
  const rules = parseRobots(`User-agent: *\nAllow: /\n\nUser-agent: ${USER_AGENT.split('/')[0]}\nDisallow: /\n`);
  assert.equal(robotsAllows(rules, '/jobs'), false);
});

test('embedded JSON is pulled out of a page, even with braces inside strings', () => {
  const html = '<script>var x = {"a":1,"eagerLoadRefineSearch":{"totalHits":2,"data":{"jobs":[{"title":"Say \\"hi\\" {ok}"}]}},"b":{}};</script>';
  assert.deepEqual(extractJsonAfter(html, '"eagerLoadRefineSearch":'), { totalHits: 2, data: { jobs: [{ title: 'Say "hi" {ok}' }] } });
  assert.equal(extractJsonAfter('nothing here', '"x":'), null);
});

// ---------- each careers system, with fake responses ----------

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const text = (body, status = 200) => new Response(body, { status });

/** A fake fetch: routes by URL; robots.txt allows everything unless overridden. */
function fakeFetch(routes, robots = {}) {
  const calls = [];
  const fn = async (url, init = {}) => {
    const u = new URL(url);
    calls.push({ url: u.toString(), method: init.method || 'GET', ua: init.headers?.['User-Agent'] });
    if (u.pathname === '/robots.txt') {
      const r = robots[u.host];
      if (typeof r === 'number') return text('', r);
      return text(r ?? 'User-agent: *\nAllow: /\n');
    }
    for (const [pattern, handler] of routes) if (pattern.test(u.toString())) return handler(u, init);
    return text('not found', 404);
  };
  fn.calls = calls;
  return fn;
}

const only = (...ids) => ({ sources: Object.fromEntries(ids.map((id) => [id, sources.sources[id]])) });

test('Eightfold: keeps nearby jobs and stops at the first page with none', async () => {
  const page = (n, loc) => Array.from({ length: 10 }, (_, i) => ({ name: `JOB ${n}-${i}`, locations: [loc], standardizedLocations: [loc] }));
  const fetchImpl = fakeFetch([
    [/start=0&/, () => json({ data: { positions: page(0, 'Hill AFB, UT, US') } })],
    [/start=10&/, () => json({ data: { positions: [...page(1, 'Clearfield, UT, US').slice(0, 5), ...page(1, 'Denver, CO, US').slice(5)] } })],
    [/start=20&/, () => json({ data: { positions: page(2, 'Denver, CO, US') } })],
    [/start=30&/, () => { throw new Error('should have stopped'); }],
  ]);
  const r = await fetchCareers(only('lockheed-martin'), places, { fetchImpl, log: quiet });
  assert.equal(r.titles['lockheed-martin'].length, 15);
  assert.equal(r.titles['lockheed-martin'][0], 'Job 0-0'); // ALL-CAPS titles are tidied
  assert.deepEqual(r.counts['lockheed-martin'], { seen: 30, nearby: 15, partial: false });
  assert.ok(fetchImpl.calls.every((c) => c.ua === USER_AGENT));
});

test('Workday: looks up postings that list several locations', async () => {
  const fetchImpl = fakeFetch([
    [/\/jobs$/, () => json({ total: 3, jobPostings: [
      { title: 'Network Engineer', locationsText: 'Sunset, UT' },
      { title: 'Analyst', locationsText: 'Reston, VA' },
      { title: 'SATCOM Specialist', locationsText: '2 Locations', externalPath: '/job/x' },
    ] })],
    [/\/job\/x$/, () => json({ jobPostingInfo: { location: 'Reston, VA', additionalLocations: ['Ogden, UT'] } })],
  ]);
  const r = await fetchCareers(only('leidos'), places, { fetchImpl, log: quiet });
  assert.deepEqual(r.titles.leidos, ['Network Engineer', 'SATCOM Specialist']);
  assert.ok(fetchImpl.calls.some((c) => c.method === 'POST'));
});

test('Phenom: reads the embedded results and pages by 20', async () => {
  const jobs = (n, loc) => Array.from({ length: n }, (_, i) => ({ title: `Engineer ${i}`, location: loc, multi_location: [loc] }));
  const pageHtml = (list) => `<html><script>phApp.ddo = {"eagerLoadRefineSearch":${JSON.stringify({ totalHits: 25, data: { jobs: list } })},"other":{}}</script>`;
  const fetchImpl = fakeFetch([
    [/from=0$/, () => text(pageHtml(jobs(20, 'Hill AFB, Utah, United States')))],
    [/from=20$/, () => text(pageHtml(jobs(5, 'Austin, Texas, United States')))],
  ]);
  const r = await fetchCareers(only('bae-systems'), places, { fetchImpl, log: quiet });
  assert.equal(r.titles['bae-systems'].length, 20);
  assert.ok(!fetchImpl.calls.some((c) => /[?&]s=1/.test(c.url)), 'the s=1 parameter makes Phenom ignore keywords');
});

test('Workable, ApplicantPro and ES3 lists are filtered to nearby jobs', async () => {
  const fetchImpl = fakeFetch([
    [/workable\.com\/api/, () => json({ jobs: [{ title: 'Aerospace Coater', city: 'Layton', state: 'Utah' }, { title: 'Accountant', city: 'Byron', state: 'Georgia' }] })],
    [/elblakecorp.*core\/jobs/, () => json({ data: { jobs: [{ title: 'Technical Writer', city: 'Hill Air Force Base', abbreviation: 'UT' }, { title: 'HR Coordinator', city: 'Columbus', abbreviation: 'GA' }] } })],
    [/es3inc\.com/, () => text(`<div id="jobposter-table">
      <div><div><h3><a href="https://www.es3inc.com/employment-opportunity/1">NDI Technician &amp; Inspector</a></h3></div> <div>Layton, UT</div> <div>Full-Time</div></div>
      <div><div><h3><a href="https://www.es3inc.com/employment-opportunity/2">Chemist</a></h3></div> <div>Oklahoma City, OK</div> <div>Full-Time</div></div></div>`)],
  ]);
  const r = await fetchCareers(only('kihomac', 'el-blake', 'es3'), places, { fetchImpl, log: quiet });
  assert.deepEqual(r.titles.kihomac, ['Aerospace Coater']);
  assert.deepEqual(r.titles['el-blake'], ['Technical Writer']);
  assert.deepEqual(r.titles.es3, ['NDI Technician & Inspector']);
});

test('Radancy sitemap: opens only job pages whose city is nearby, and checks the state there', async () => {
  const sitemap = `<urlset>
    <url><loc>https://jobs.boeing.com/job/layton/project-manager/185/1</loc></url>
    <url><loc>https://jobs.boeing.com/job/clinton/clinton-maryland-job/185/2</loc></url>
    <url><loc>https://jobs.boeing.com/job/seattle/engineer/185/3</loc></url></urlset>`;
  const fetchImpl = fakeFetch([
    [/sitemap\.xml$/, () => text(sitemap)],
    [/\/job\/layton\//, () => text('<h1>Project Manager (Associate)</h1><span class="job-location">Layton, Utah</span>')],
    [/\/job\/clinton\//, () => text('<h1>Clinton Job</h1><span class="job-location">Clinton, Maryland</span>')],
    [/\/job\/seattle\//, () => { throw new Error('should not open far-away jobs'); }],
  ]);
  const r = await fetchCareers(only('boeing'), places, { fetchImpl, log: quiet });
  assert.deepEqual(r.titles.boeing, ['Project Manager (Associate)']);
});

// ---------- robots.txt and failures ----------

test('a path disallowed by robots.txt is never requested', async () => {
  const fetchImpl = fakeFetch([[/workable/, () => json({ jobs: [] })]], { 'apply.workable.com': 'User-agent: *\nDisallow: /api/\n' });
  const r = await fetchCareers(only('kihomac'), places, { fetchImpl, log: quiet });
  assert.match(r.failed.kihomac, /robots\.txt disallows/);
  assert.ok(!('kihomac' in r.titles));
  assert.ok(!fetchImpl.calls.some((c) => c.url.includes('/api/')));
});

test('a site that refuses robots.txt (401/403/5xx) is skipped; a missing robots.txt is allowed', async () => {
  for (const status of [401, 403, 503]) {
    const fetchImpl = fakeFetch([[/workable/, () => json({ jobs: [] })]], { 'apply.workable.com': status });
    const r = await fetchCareers(only('kihomac'), places, { fetchImpl, log: quiet });
    assert.match(r.failed.kihomac, /refuses/, String(status));
  }
  const fetchImpl = fakeFetch([[/workable/, () => json({ jobs: [{ title: 'Machinist', city: 'Layton', state: 'UT' }] })]], { 'apply.workable.com': 404 });
  const r = await fetchCareers(only('kihomac'), places, { fetchImpl, log: quiet });
  assert.deepEqual(r.titles.kihomac, ['Machinist']);
});

test('one failing site does not stop the others, and nothing throws', async () => {
  const fetchImpl = fakeFetch([
    [/workable/, () => text('oops', 500)],
    [/elblakecorp/, () => json({ data: { jobs: [{ title: 'Writer', city: 'Ogden', abbreviation: 'UT' }] } })],
    [/es3inc/, () => { throw new TypeError('fetch failed'); }],
    [/isolvedhire/, () => text('<html>not json</html>')],
  ]);
  const lines = [];
  const r = await fetchCareers(only('kihomac', 'el-blake', 'es3', 'systems-implementers'), places, { fetchImpl, log: { warn: (m) => lines.push(m) } });
  assert.deepEqual(r.titles['el-blake'], ['Writer']);
  assert.deepEqual(Object.keys(r.failed).sort(), ['es3', 'kihomac', 'systems-implementers']);
  assert.equal(lines.length, 3);
});

test('job-sources.json covers every non-federal employer, as a source or a documented skip', async () => {
  const data = JSON.parse(await readFile(new URL('../data/employers.json', import.meta.url), 'utf8'));
  const { validateJobSources, validatePlaces } = await import('../scripts/build.mjs');
  assert.deepEqual(validateJobSources(sources, data), []);
  assert.deepEqual(validatePlaces(places), []);
  const usajobs = (e) => e.jobsUrl.startsWith('https://www.usajobs.gov/');
  for (const e of data.employers.filter((x) => !usajobs(x))) {
    assert.ok(sources.sources[e.id] || sources.skipped[e.id], `${e.id} is neither a source nor skipped`);
  }
  assert.match(validateJobSources({ sources: { nobody: { type: 'workable' } } }, data).join(), /not an employer/);
  assert.match(validateJobSources({ sources: { kihomac: { type: 'carrier-pigeon' } } }, data).join(), /unknown type/);
  assert.match(validateJobSources({ sources: { 'dla-hill': { type: 'workable' } } }, data).join(), /federal/);
});

test('a slow later page keeps the titles already read; a failed first page drops the source', async () => {
  const page = (n) => Array.from({ length: 10 }, (_, i) => ({ name: `Job ${n}-${i}`, locations: ['Clearfield, UT, US'] }));
  const timeout = () => { throw Object.assign(new Error('timed out'), { name: 'TimeoutError' }); };
  const lines = [];
  const fetchImpl = fakeFetch([
    [/start=0&/, () => json({ data: { positions: page(0) } })],
    [/start=10&/, () => json({ data: { positions: page(1) } })],
    [/start=20&/, timeout],
  ]);
  const r = await fetchCareers(only('northrop-grumman'), places, { fetchImpl, log: { warn: (m) => lines.push(m) } });
  assert.equal(r.titles['northrop-grumman'].length, 20);
  assert.equal(r.counts['northrop-grumman'].partial, true);
  assert.ok(!('northrop-grumman' in r.failed));
  assert.match(lines.join('\n'), /partly read/);

  const first = await fetchCareers(only('northrop-grumman'), places, { fetchImpl: fakeFetch([[/start=0&/, timeout]]), log: quiet });
  assert.equal(first.failed['northrop-grumman'], 'timed out');
  assert.ok(!('northrop-grumman' in first.titles));
});
