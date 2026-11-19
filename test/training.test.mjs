import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { validateTraining, renderTraining, renderBase, TRAINING_SECTIONS } from '../scripts/build.mjs';
import { collectLinks } from '../scripts/check-links.mjs';

const Search = createRequire(import.meta.url)('../assets/search.js');
const readText = (rel) => readFile(new URL(`../${rel}`, import.meta.url), 'utf8');
const read = async (rel) => JSON.parse(await readText(rel));
const strip = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const site = await read('data/site.json');
const file = await read('data/training.json');
const data = await read('data/employers.json');
const synonyms = await read('data/synonyms.json');
const template = await readText('templates/training.html');
const review = await readText('data/TRAINING-REVIEW.md');
const index = Search.createIndex(
  data.employers.map((e) => ({ id: e.id, name: e.name, description: e.description, roles: e.roles, titles: [] })),
  synonyms,
);
const html = renderTraining(site, template, file);
const readBase = await readText('templates/base.html');

const entry = (over = {}) => ({
  id: 'x', section: 'certificates', name: 'Welding', provider: 'A Tech College', city: 'Ogden', length: '27 credits', cost: '$2,700 tuition',
  credential: 'Certificate', note: null, search: null, url: 'https://x.example/welding', verified: '2026-11', sourceUrl: 'https://x.example/source-only', ...over,
});

test('training.json is valid, and every "Hill jobs" search finds employers by their researched roles', () => {
  assert.deepEqual(validateTraining(file, index), []);
  for (const t of file.training.filter((x) => x.search)) {
    assert.ok(Object.keys(Search.search(index, t.search).results).length > 0, `${t.id}: "${t.search}" finds nothing`);
  }
});

test('bad training entries are caught', () => {
  const bad = { checked: 'Nov 2026', training: [
    entry({ section: 'blog' }),
    entry({ id: 'x', url: 'http://insecure.example' }),
    entry({ id: 'y', note: 'n'.repeat(171), verified: '2026-13', extra: 1 }),
    entry({ id: 'z', search: 'zzzz-no-such-trade' }),
  ] };
  const errors = validateTraining(bad, index).join('\n');
  for (const want of [/"checked" must be YYYY-MM/, /unknown section "blog"/, /duplicate id/, /must be https/, /"note" must be null or 1–170/, /verified must be YYYY-MM/, /unknown field "extra"/, /finds no employer/, /section "aviation" has no entries/]) {
    assert.match(errors, want);
  }
  assert.match(validateTraining({}).join(), /must be a list/);
});

test('the page has one h1, every section in order, and a table of contents that links to each', () => {
  assert.equal((html.match(/<h1[\s>]/g) || []).length, 1);
  assert.ok(!/\{\{\w+\}\}/.test(html), 'no leftover placeholders');
  const ids = [...Object.keys(TRAINING_SECTIONS), 'more-paths'];
  let last = -1;
  for (const id of ids) {
    const at = html.indexOf(`<section id="${id}"`);
    assert.ok(at > last, `section ${id} missing or out of order`);
    last = at;
    assert.match(html, new RegExp(`<a href="#${id}">`), `toc link to ${id}`);
  }
  assert.match(html, /<link rel="canonical" href="https:\/\/workathill\.com\/get-trained\/">/);
  assert.match(strip(html), /last checked Nov 2026/);
});

test('every entry is shown once, with a safe new-tab link and no internal source link', () => {
  const shown = new Set(file.training.map((t) => t.url));
  for (const t of file.training) {
    assert.equal(html.split(`id="t-${t.id}"`).length - 1, 1, t.id);
    assert.ok(html.includes(`href="${t.url.replace(/&/g, '&amp;')}" target="_blank" rel="noopener"`), `${t.id}: link`);
    if (!shown.has(t.sourceUrl)) assert.ok(!html.includes(t.sourceUrl), `${t.id}: sourceUrl must not appear`);
  }
  const external = [...html.matchAll(/<a [^>]*href="https?:[^"]*"[^>]*>[\s\S]*?<\/a>/g)].map((m) => m[0]);
  assert.equal(external.length, file.training.length);
  for (const a of external) assert.match(a, /target="_blank" rel="noopener"[\s\S]*opens in new tab/, a);
});

test('"Hill jobs" links open the homepage search for that term', () => {
  const card = renderTraining(site, template, { checked: '2026-11', training: Object.keys(TRAINING_SECTIONS).map((s, i) => entry({ id: `e${i}`, section: s, search: i ? null : 'aircraft mechanic' })) });
  assert.match(card, /<a class="train-jobs" href="\.\.\/\?q=aircraft%20mechanic">Hill jobs for “aircraft mechanic”/);
  assert.equal((card.match(/class="train-jobs"/g) || []).length, 1, 'only entries with a search get the link');
});

test('every listing is recorded in data/TRAINING-REVIEW.md', () => {
  for (const t of file.training) assert.ok(review.includes(t.url), `missing from TRAINING-REVIEW.md: ${t.id} ${t.url}`);
});

test('the homepage links to the page from the hero and the footer', () => {
  const base = renderBase('hill', data.bases.hill, data.employers, site, readBase, null, null, null, {});
  assert.match(base, /<a class="guide-link" href="\.\/get-trained\/">Get trained for a trade/);
  assert.match(base, /<p class="fine">[\s\S]*href="\.\/get-trained\/">Get Trained<\/a>/);
});
test('the other pages link to it in their footers', async () => {
  for (const t of ['employers', 'guide', 'privacy', 'thanks']) {
    assert.match(await readText(`templates/${t}.html`), /<a href="\.\.\/get-trained\/">Get Trained<\/a>/, t);
  }
});

test('the weekly link check covers every training link', () => {
  const links = collectLinks({ training: file.training });
  assert.equal(links.length, file.training.length);
  assert.ok(links.every((l) => l.field === 'training' && /^https:\/\//.test(l.url)));
});
