import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderDirectory, GROUP_TITLES, LABELS } from '../scripts/build.mjs';

const read = async (rel) => readFile(new URL(`../${rel}`, import.meta.url), 'utf8');
const data = JSON.parse(await read('data/employers.json'));
const site = JSON.parse(await read('data/site.json'));
const synonyms = JSON.parse(await read('data/synonyms.json'));
const html = renderDirectory('hill', data.bases.hill, data.employers, site, await read('templates/employers.html'), null, synonyms);
const hill = data.employers.filter((e) => e.base === 'hill');

test('directory lists every employer once, grouped by type, A–Z within each group', () => {
  assert.equal((html.match(/<article class="card"/g) || []).length, hill.length);
  for (const e of hill) assert.equal(html.split(`data-id="${e.id}"`).length - 1, 1, e.id);
  const sections = [...html.matchAll(/<section class="dir-group" id="type-([a-z]+)"[\s\S]*?<\/section>/g)];
  assert.deepEqual(sections.map((m) => m[1]), Object.keys(LABELS.types).filter((t) => hill.some((e) => e.type === t)));
  for (const [block, type] of sections.map((m) => [m[0], m[1]])) {
    const ids = [...block.matchAll(/data-type="([a-z]+)"[^>]*data-id="([^"]+)"/g)];
    assert.ok(ids.every(([, t]) => t === type), `${type} group holds only ${type}`);
    const names = [...block.matchAll(/<h3 id="e-[^"]+">([^<]+)<\/h3>/g)].map((m) => m[1]);
    assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base', numeric: true })));
    assert.match(block, new RegExp(`${GROUP_TITLES[type].replace('&', '&amp;')} <span class="group-n">${ids.length}</span>`));
  }
});

test('directory page: one h1, search box, All + type pills, careers buttons open in a new tab', () => {
  assert.equal((html.match(/<h1>/g) || []).length, 1);
  assert.match(html, /<h1>Employer Directory<\/h1>/);
  assert.match(html, /<input id="dq" name="q" type="search"/);
  assert.match(html, /data-type="" aria-pressed="true">All<\/button>/);
  for (const t of new Set(hill.map((e) => e.type))) assert.match(html, new RegExp(`data-type="${t}" aria-pressed="false"`));
  const buttons = [...html.matchAll(/<a class="btn-jobs" href="[^"]+" target="_blank" rel="noopener">/g)];
  assert.equal(buttons.length, hill.length);
  assert.match(html, /<link rel="canonical" href="https:\/\/workathill\.com\/employers\/">/);
  assert.ok(!html.includes('{{'));
  assert.ok(!html.includes('sourceUrl'));
});

test('every page links to the Employer Directory in its footer', async () => {
  for (const f of ['templates/base.html', 'templates/guide.html', 'templates/privacy.html', 'templates/thanks.html', 'templates/employers.html']) {
    const t = await read(f);
    const footer = t.slice(t.indexOf('<footer'));
    assert.match(footer, /href="(\{\{prefix\}\}|\.\.\/|\.\/)(employers\/)?">Employers<\/a>/, f);
  }
});
