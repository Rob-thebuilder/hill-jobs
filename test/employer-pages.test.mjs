import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderEmployerPage, similarEmployers, employerPath, renderBase, LABELS } from '../scripts/build.mjs';

const read = async (rel) => readFile(new URL(`../${rel}`, import.meta.url), 'utf8');
const data = JSON.parse(await read('data/employers.json'));
const site = JSON.parse(await read('data/site.json'));
const template = await read('templates/employer.html');
const hill = data.employers.filter((e) => e.base === 'hill');
const page = (e, jobCounts = null, careerTitles = null) =>
  renderEmployerPage(e, data.bases.hill, data.employers, site, template, jobCounts, careerTitles, '2026-11-26');

test('every Hill employer gets a page with one h1, its name, a canonical URL and a careers link', () => {
  for (const e of hill) {
    const html = page(e);
    const name = e.name.replace(/&/g, '&amp;');
    assert.equal((html.match(/<h1>/g) || []).length, 1, e.id);
    assert.ok(html.includes(`<h1>${name}</h1>`), e.id);
    assert.ok(html.includes(`<link rel="canonical" href="https://workathill.com${employerPath(e)}">`), e.id);
    assert.ok(html.includes(`href="${e.jobsUrl.replace(/&/g, '&amp;')}" target="_blank" rel="noopener"`), e.id);
    assert.ok(html.includes(`badge-${e.type}">${LABELS.types[e.type].replace(/&/g, '&amp;')}`), e.id);
    assert.ok(!/\{\{\w+\}\}/.test(html), `${e.id}: unfilled placeholder`);
    const desc = html.match(/<meta name="description" content="([^"]*)">/)[1].replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    assert.ok(desc.length <= 160, `${e.id}: description ${desc.length} chars`);
  }
});

test('page shows roles, links each category to the filtered home page, and has valid breadcrumbs', () => {
  const e = hill.find((x) => x.roles.length >= 2);
  const html = page(e);
  for (const r of e.roles) assert.ok(html.includes(`<li>${r.replace(/&/g, '&amp;')}</li>`), r);
  for (const c of e.categories) assert.ok(html.includes(`href="../../?cat=${c}"`), c);
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(ld['@type'], 'BreadcrumbList');
  assert.deepEqual(ld.itemListElement.map((i) => i.item), ['https://workathill.com/', 'https://workathill.com/employers/', `https://workathill.com${employerPath(e)}`]);
});

test('names with markup are escaped everywhere, including the JSON-LD block', () => {
  const evil = { ...hill[0], id: 'x', name: 'A</script><b>&co', description: 'Desc <i>x</i>', roles: ['<img src=x>'] };
  const html = renderEmployerPage(evil, data.bases.hill, [evil, ...data.employers], site, template);
  assert.ok(!html.includes('<b>&co') && !html.includes('<i>x</i>') && !html.includes('<img src=x>'));
  const ld = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1];
  assert.ok(!ld.includes('</'), 'no closing tag can end the JSON-LD block early');
});

test('live job titles show (deduped, capped at 20) only when the build read some', () => {
  const contractor = hill.find((e) => e.type !== 'federal');
  assert.ok(!page(contractor).includes('Recent openings'));
  const titles = [...Array.from({ length: 25 }, (_, i) => `Title ${i}`), 'Title 0'];
  const html = page(contractor, null, { [contractor.id]: titles });
  assert.ok(html.includes('Recent openings near Hill'));
  assert.equal((html.match(/<li>Title \d+<\/li>/g) || []).length, 20);
  assert.match(html, /Plus 5 more on their site/);
  assert.match(html, /datetime="2026-11-26"/);

  const fed = hill.find((e) => e.type === 'federal');
  const jc = { checkedAt: '2026-11-25', counts: { [fed.id]: 3 }, titles: { [fed.id]: ['Aircraft Mechanic', 'Engineer'] } };
  const fh = page(fed, jc);
  assert.match(fh, /<strong>3<\/strong> open jobs/);
  assert.match(fh, /<li>Aircraft Mechanic<\/li>/);
  assert.match(fh, /datetime="2026-11-25"/);
});

test('similar employers share a category, never include the employer itself, and link to real pages', () => {
  const ids = new Set(hill.map((e) => e.id));
  for (const e of hill) {
    const sim = similarEmployers(e, data.employers);
    assert.ok(sim.length <= 6);
    for (const o of sim) {
      assert.notEqual(o.id, e.id);
      assert.ok(o.categories.some((c) => e.categories.includes(c)), `${e.id} → ${o.id}`);
    }
    for (const m of page(e).matchAll(/<ul class="emp-similar">([\s\S]*?)<\/ul>/g)) {
      for (const h of m[1].matchAll(/href="\.\.\/([a-z0-9-]+)\/"/g)) assert.ok(ids.has(h[1]), h[1]);
    }
  }
});

test('trade employers point to Get Trained; federal ones to federal resume help', () => {
  const trades = hill.find((e) => e.categories.includes('trades-maintenance'));
  assert.match(page(trades), /href="\.\.\/\.\.\/get-trained\/"/);
  const fed = hill.find((e) => e.type === 'federal');
  assert.match(page(fed), /Free federal resume help/);
});

test('home page cards link each name to its employer page', async () => {
  const home = renderBase('hill', data.bases.hill, data.employers, site, await read('templates/base.html'));
  for (const e of hill) assert.ok(home.includes(`<a class="card-name" href="./employers/${e.id}/">`), e.id);
});


test('aliases ("LM", "LMCO") find the employer in search but never appear on the page', async () => {
  const { createRequire } = await import('node:module');
  const Search = createRequire(import.meta.url)('../assets/search.js');
  const { searchData } = await import('../scripts/build.mjs');
  const synonyms = JSON.parse(await read('data/synonyms.json'));
  const sd = JSON.parse(searchData(data.employers, synonyms, null, null));
  const index = Search.createIndex(sd.employers, synonyms);
  for (const q of ['LM', 'lmco', 'Lockheed']) assert.ok(Search.search(index, q).results['lockheed-martin'], q);
  const lm = hill.find((e) => e.id === 'lockheed-martin');
  assert.ok(!page(lm).includes('LMCO'));
});
