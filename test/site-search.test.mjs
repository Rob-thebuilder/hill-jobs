// Site-wide search: training, resume help, programs, events and guide sections found by the same search box.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import {
  renderBase, renderDirectory, renderTraining, renderGuide, renderAbout, renderEventsPanel, renderResourcesPanel,
  pageEntries, validateSitePages, renderJobType,
} from '../scripts/build.mjs';

const Search = createRequire(import.meta.url)('../assets/search.js');
const read = (rel) => readFile(new URL(`../${rel}`, import.meta.url), 'utf8');
const json = async (rel) => JSON.parse(await read(rel));

const data = await json('data/employers.json');
const site = await json('data/site.json');
const synonyms = await json('data/synonyms.json');
const sitePages = await json('data/site-pages.json');
const training = (await json('data/training.json')).training;
const resources = (await json('data/resources.json')).resources;
const programs = (await json('data/programs.json')).programs;
const eventsFile = await json('data/events.json');
const extras = { resources, programs, annual: eventsFile.annual, events: [], eventsChecked: '' };
const jobTypes = await json('data/job-types.json');
const pages = pageEntries(sitePages.pages, { ...extras, jobTypes, employers: data.employers }, training);
extras.pages = pages;

const index = Search.createIndex(pages.map((p) => ({ id: p.id, name: p.title, description: p.text || '', roles: p.keywords, titles: [], last: p.last })), synonyms);
const renderHomeTemplate = await read('templates/base.html');
const renderDirTemplate = await read('templates/employers.html');
const top = (q, n = 5) => Search.rank(index, q, n).ids;

test('site-pages.json is valid, and bad entries are caught', () => {
  assert.deepEqual(validateSitePages(sitePages), []);
  const bad = { pages: [
    { id: 'x', title: 'X', kind: 'K', path: 'https://evil.example/', keywords: ['a'] },
    { id: 'x', title: 'Y', kind: 'K', path: '?tab=resume', keywords: ['Upper'] },
  ] };
  const errors = validateSitePages(bad).join('\n');
  assert.match(errors, /path must be a site page/);
  assert.match(errors, /duplicate id/);
  assert.match(errors, /must be lowercase/);
});

test('every training school, resource, program and yearly event is searchable', () => {
  const ids = new Set(pages.map((p) => p.id));
  for (const t of training) assert.ok(ids.has(`t-${t.id}`), t.id);
  for (const r of resources) assert.ok(ids.has(`r-${r.id}`), r.id);
  for (const p of programs) assert.ok(ids.has(`p-${p.id}`), p.id);
  for (const a of eventsFile.annual) assert.ok(ids.has(`an-${a.id}`), a.id);
  assert.equal(ids.size, pages.length, 'ids are unique');
});

test('every on-site link points at an anchor that exists on that page', async () => {
  const html = {
    '': renderBase('hill', data.bases.hill, data.employers, site, await read('templates/base.html'), null, synonyms, null, extras)
      + renderResourcesPanel(resources) + renderEventsPanel([], eventsFile.annual, ''),
    'get-trained/': renderTraining(site, await read('templates/training.html'), { checked: '2026-11', training }),
    'how-hiring-works/': renderGuide(site, await read('templates/guide.html')),
    'about/': renderAbout(site, await read('templates/about.html'), data.employers.length),
    'employers/': renderDirectory('hill', data.bases.hill, data.employers, site, await read('templates/employers.html')),
  };
  for (const t of jobTypes.types) html[`jobs/${t.id}/`] = renderJobType(t, jobTypes, data.bases.hill, data.employers, site, await read('templates/job-type.html'));
  for (const p of pages.filter((x) => x.path)) {
    const m = p.path.match(/^((?:[a-z-]+\/){0,2})(?:\?tab=[a-z]+)?(?:#(.+))?$/);
    assert.ok(m, `${p.id}: odd path ${p.path}`);
    const page = html[m[1]];
    assert.ok(page !== undefined, `${p.id}: unknown page ${m[1]}`);
    if (m[2]) assert.ok(page.includes(`id="${decodeURIComponent(m[2])}"`), `${p.id}: #${m[2]} not found on /${m[1]}`);
  }
});

test('outside links are https and open in a new tab; on-site links stay on site', () => {
  for (const p of pages) {
    if (p.url) assert.match(p.url, /^https:\/\//, p.id);
    else assert.ok(!/^[a-z]+:/i.test(p.path), p.id);
  }
});

test('searches that find no employer still lead somewhere useful', () => {
  const expect = {
    welder: 't-davis-welding',
    hvac: 't-davis-hvacr',
    plumber: 't-davis-plumbing-apprenticeship',
    apprentice: 's-get-trained-apprenticeships',
    resume: 's-resume-help',
    'cover letter': 'r-davis-tech-career',
    'job fair': 's-events',
    skillbridge: 'p-dod-skillbridge',
    'real id': 's-guide-base',
    recruiter: 's-about-recruiters',
    gs: 's-guide-pay',
  };
  for (const [q, id] of Object.entries(expect)) assert.ok(top(q).includes(id), `"${q}" should show ${id}; got ${top(q).join(', ')}`);
});

test('the best page ranks first', () => {
  assert.equal(top('clearance')[0], 's-guide-clearances');
  assert.equal(top('pay')[0], 's-guide-pay');
  assert.equal(top('veteran')[0], 's-guide-preferences');
  assert.equal(top('resume')[0], 's-resume-help');
  assert.equal(Search.rank(index, 'apprentice', 5).ids.length, 5, 'limited to 5');
  assert.ok(Search.rank(index, 'apprentice', 5).total > 5, 'total counts the rest');
});

test('the homepage marks in-page links; the directory page links back with ../', () => {
  const dataOf = (html) => JSON.parse(html.match(/id="search-data">([\s\S]*?)<\/script>/)[1]);
  const home = dataOf(renderBase('hill', data.bases.hill, data.employers, site, renderHomeTemplate, null, synonyms, null, extras));
  const resume = home.pages.find((p) => p.id === 's-resume-help');
  assert.equal(resume.url, './?tab=resume');
  assert.equal(resume.here, true);
  assert.equal(home.pages.find((p) => p.id === 's-get-trained').here, false);
  assert.equal(home.pages.find((p) => p.id === 'p-dod-skillbridge').ext, true);
  const dir = dataOf(renderDirectory('hill', data.bases.hill, data.employers, site, renderDirTemplate, null, synonyms, null, pages));
  assert.equal(dir.pages.find((p) => p.id === 's-resume-help').url, '../?tab=resume');
  assert.ok(dir.pages.every((p) => !p.here));
});

test('free resume help always comes before paid resume writers', () => {
  const paid = new Set(resources.filter((r) => r.cost === 'paid').map((r) => `r-${r.id}`));
  for (const q of ['resume', 'federal resume', 'cover letter', 'linkedin']) {
    const ids = Search.rank(index, q).ids;
    const firstPaid = ids.findIndex((id) => paid.has(id));
    if (firstPaid >= 0) assert.ok(ids.slice(firstPaid).every((id) => paid.has(id)), `"${q}": ${ids.join(', ')}`);
  }
});

test('job-type pages are found by their name and by the roles they list', () => {
  assert.equal(top('machinist')[0], 'j-sheet-metal-machinist');
  assert.equal(top('painter')[0], 'j-painting-coatings');
  assert.ok(top('isso').includes('j-it-cybersecurity'));
  assert.ok(top('forklift').includes('j-logistics-supply'));
  assert.ok(top('aircraft mechanic').includes('j-aircraft-mechanic'));
  assert.deepEqual(top('boeing'), [], 'an employer name alone finds no page');
  for (const t of jobTypes.types) {
    const e = pages.find((p) => p.id === `j-${t.id}`);
    assert.ok(e && e.path === `jobs/${t.id}/` && e.kind === 'Job type', t.id);
  }
});
