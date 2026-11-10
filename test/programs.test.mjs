import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validatePrograms, renderMoreWays, renderBase } from '../scripts/build.mjs';
import { collectLinks } from '../scripts/check-links.mjs';

const read = async (rel) => JSON.parse(await readFile(new URL(`../${rel}`, import.meta.url), 'utf8'));
const strip = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const sample = [
  { id: 'skillbridge', name: 'DoD SkillBridge', kind: 'program', who: 'Service members in their last 180 days', url: 'https://skillbridge.osd.mil/', verified: '2026-11', sourceUrl: 'https://skillbridge.osd.mil/about' },
  { id: 'clearancejobs', name: 'ClearanceJobs: Hill AFB', kind: 'job-board', who: 'People with (or eligible for) a security clearance', url: 'https://www.clearancejobs.com/jobs/hill-afb-ut', verified: '2026-11', sourceUrl: 'https://www.clearancejobs.com/' },
  { id: 'apprentice', name: 'Ogden ALC apprenticeships', kind: 'program', who: 'People starting a skilled trade', url: 'https://example.org/apprentice', verified: '2026-11', sourceUrl: 'https://example.org/source-only' },
];

test('programs.json is valid', async () => {
  assert.deepEqual(validatePrograms(await read('data/programs.json')), []);
  assert.deepEqual(validatePrograms({ programs: sample }), []);
});

test('bad program entries are caught', () => {
  const bad = structuredClone(sample);
  bad[0].kind = 'blog';
  bad[1].url = 'http://insecure.example';
  bad[2].id = bad[0].id;
  bad.push({ id: 'x', name: 'X', kind: 'program', who: 'y'.repeat(101), url: 'https://x.example', verified: 'Nov 2026', sourceUrl: 'https://x.example', extra: 1 });
  const errors = validatePrograms({ programs: bad }).join('\n');
  for (const want of [/unknown kind "blog"/, /must be https/, /duplicate id/, /"who" must be 1–100/, /verified must be YYYY-MM/, /unknown field "extra"/]) assert.match(errors, want);
  assert.match(validatePrograms({}).join(), /must be a list/);
});

test('no programs: no section and no links to it', () => {
  assert.deepEqual(renderMoreWays([]), { section: '', emptyLink: '', footerLink: '' });
});

test('the section groups by kind, A–Z, with safe new-tab links and no internal source links', () => {
  const { section, emptyLink, footerLink } = renderMoreWays(sample);
  const text = strip(section);
  assert.match(text, /^More ways to find Hill jobs/);
  assert.ok(text.indexOf('Programs 2') < text.indexOf('Job boards 1'), 'programs before job boards');
  assert.ok(text.indexOf('DoD SkillBridge') < text.indexOf('Ogden ALC apprenticeships'), 'A–Z within a group');
  const links = [...section.matchAll(/<a [^>]*>/g)].map((m) => m[0]);
  assert.equal(links.length, 3);
  assert.ok(links.every((a) => /target="_blank" rel="noopener"/.test(a)));
  assert.equal((section.match(/opens in new tab/g) || []).length, 3);
  assert.ok(!section.includes('source-only'), 'sourceUrl must not appear');
  assert.match(emptyLink, /href="#more-ways" data-tab-link="employers"/);
  assert.match(footerLink, /href="#more-ways"/);
});

test('the section sits inside the Employers tab, after the employer grid', async () => {
  const data = await read('data/employers.json');
  const site = await read('data/site.json');
  const template = await readFile(new URL('../templates/base.html', import.meta.url), 'utf8');
  const html = renderBase('hill', data.bases.hill, data.employers, site, template, null, null, null, { programs: sample });
  const employers = html.indexOf('<section id="employers"');
  const grid = html.indexOf('id="list"');
  const moreWays = html.indexOf('id="more-ways"');
  const resume = html.indexOf('<section id="resume-help"');
  assert.ok(employers < grid && grid < moreWays && moreWays < resume);
  assert.match(html, /<p class="empty-more"><a href="#more-ways"/);
});

test('the weekly link check covers employers, resume help, programs and events', async () => {
  const links = collectLinks({
    employers: [{ id: 'e', name: 'E', jobsUrl: 'https://e.example/jobs', secondaryUrl: 'https://e.example/2' }],
    resources: [{ id: 'r', name: 'R', url: 'https://r.example' }],
    programs: sample,
    events: [{ id: 'ev', title: 'Fair', url: 'https://ev.example' }],
    annual: [{ id: 'a', title: 'Yearly', url: 'https://a.example' }],
  });
  assert.deepEqual(links.map((l) => l.field), ['jobsUrl', 'secondaryUrl', 'resume help', 'more ways', 'more ways', 'more ways', 'event', 'yearly event']);
  const real = collectLinks({
    employers: (await read('data/employers.json')).employers,
    resources: (await read('data/resources.json')).resources,
    annual: (await read('data/events.json')).annual,
  });
  assert.ok(real.length > 30 && real.every((l) => /^https:\/\//.test(l.url)));
});
