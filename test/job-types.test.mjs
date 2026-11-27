import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  validateJobTypes, jobTypeEmployers, jobTypeMatcher, jobTypesFor, renderJobType, renderJobsIndex, renderEmployerPage, jobTypePath,
} from '../scripts/build.mjs';

const read = async (rel) => readFile(new URL(`../${rel}`, import.meta.url), 'utf8');
const data = JSON.parse(await read('data/employers.json'));
const site = JSON.parse(await read('data/site.json'));
const jobTypes = JSON.parse(await read('data/job-types.json'));
const tTemplate = await read('templates/job-type.html');
const iTemplate = await read('templates/jobs.html');
const EMP_TEMPLATE = await read('templates/employer.html');
const hill = data.employers.filter((e) => e.base === 'hill');
const byId = (id) => jobTypes.types.find((t) => t.id === id);
const page = (t, jc = null, ct = null) => renderJobType(t, jobTypes, data.bases.hill, data.employers, site, tTemplate, jc, ct, '2026-11-27');

test('job-types.json is valid and every type lists at least 2 employers', () => {
  assert.deepEqual(validateJobTypes(jobTypes, data.employers), []);
  for (const t of jobTypes.types) assert.ok(jobTypeEmployers(t, data.employers).length >= 2, t.id);
});

test('validation catches bad ids, patterns, groups, related links and types that match nobody', () => {
  const bad = { groups: { trades: 'x' }, types: [
    { id: 'Bad Id', name: 'A', group: 'nope', intro: 'x', match: ['('], exclude: [], pay: 'xx', trades: 'no', related: ['missing'] },
  ] };
  const errs = validateJobTypes(bad, data.employers).join('\n');
  for (const want of ['id must be', 'group must be', 'not a valid regular expression', 'pay must be', 'trades must be', 'related "missing"']) assert.match(errs, new RegExp(want));
  const none = { groups: { trades: 'x' }, types: [{ id: 'zz', name: 'Z', group: 'trades', intro: 'x', match: ['zzzqqq'], exclude: [], pay: 'wg', trades: true, related: [] }] };
  assert.match(validateJobTypes(none, data.employers).join(), /matches no employer/);
});

test('matching is precise: known employers in, known false positives out', () => {
  const ids = (id) => jobTypeEmployers(byId(id), data.employers).map((r) => r.e.id);
  assert.ok(ids('aircraft-mechanic').includes('air-force-civilian-hill'));
  assert.ok(!ids('aircraft-mechanic').includes('booz-allen'), 'a logistics analyst is not a mechanic');
  assert.ok(ids('painting-coatings').includes('lockheed-martin'));
  assert.ok(!ids('it-cybersecurity').includes('mitre'), 'facility security officer is not a cyber job');
  assert.ok(!ids('retail-food').includes('summit-technologies'), 'FMS logistics is not retail');
  const ok = jobTypeMatcher(byId('painting-coatings'));
  assert.ok(ok('LO coatings technician (F-35)') && ok('Aircraft Painter') && !ok('Logistics analyst'));
});

test('each page lists its employers A–Z with matched roles, links to employer pages, and has one h1', () => {
  for (const t of jobTypes.types) {
    const html = page(t);
    const rows = jobTypeEmployers(t, data.employers);
    assert.equal((html.match(/<h1>/g) || []).length, 1, t.id);
    assert.ok(!/\{\{\w+\}\}/.test(html), `${t.id}: unfilled placeholder`);
    assert.ok(html.includes(`<link rel="canonical" href="https://workathill.com${jobTypePath(t)}">`), t.id);
    const names = [...html.matchAll(/<a class="card-name" href="\.\.\/\.\.\/employers\/([a-z0-9-]+)\/">/g)].map((m) => m[1]);
    assert.deepEqual(names, rows.map((r) => r.e.id), `${t.id}: cards in A–Z order`);
    for (const r of rows) for (const role of r.roles) assert.ok(html.includes(role.replace(/&/g, '&amp;')), `${t.id}: ${role}`);
    const desc = html.match(/<meta name="description" content="([^"]*)">/)[1].replace(/&amp;/g, '&');
    assert.ok(desc.length <= 160, `${t.id}: description ${desc.length}`);
    for (const m of html.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)) assert.match(m[0], /rel="noopener"/);
  }
});

test('live openings: only titles that match the job type, capped per employer, with a dated total', () => {
  const t = byId('aircraft-mechanic');
  const fed = 'air-force-civilian-hill';
  const jc = { checkedAt: '2026-11-27', counts: {}, titles: { [fed]: ['Aircraft Mechanic', 'Aircraft Engine Mechanic', 'Aircraft Mechanic Helper', 'Aircraft Mechanic Leader', 'Budget Analyst'] } };
  const html = page(t, jc);
  assert.match(html, /<strong>4<\/strong> matching openings/);
  assert.match(html, /Open now:<\/span> Aircraft Mechanic, Aircraft Engine Mechanic, Aircraft Mechanic Helper <span class="jt-more">\+1 more<\/span>/);
  assert.ok(!html.includes('Budget Analyst'));
  assert.ok(!page(t).includes('matching opening'), 'no total without live titles');
});

test('category-based type shows descriptions when no role matches; trades get the Get Trained tip', () => {
  const html = page(byId('internships-entry'));
  assert.ok(jobTypeEmployers(byId('internships-entry'), data.employers).some((r) => r.roles.length === 0));
  assert.match(html, /<p class="desc">/);
  assert.match(page(byId('aircraft-mechanic')), /get-trained\//);
  assert.ok(!page(byId('software')).includes('get-trained/">Trade schools'));
});

test('index lists every type in its group, and employer pages link back to their job types', () => {
  const idx = renderJobsIndex(jobTypes, data.bases.hill, data.employers, site, iTemplate);
  for (const t of jobTypes.types) assert.ok(idx.includes(`<a href="./${t.id}/">`), t.id);
  for (const g of Object.values(jobTypes.groups)) assert.ok(idx.includes(g.replace(/&/g, '&amp;')), g);
  const lm = hill.find((e) => e.id === 'lockheed-martin');
  const ep = renderEmployerPage(lm, data.bases.hill, data.employers, site, EMP_TEMPLATE, null, null, null, jobTypes);
  for (const t of jobTypesFor(lm, jobTypes)) assert.ok(ep.includes(`href="../../jobs/${t.id}/"`), t.id);
});

