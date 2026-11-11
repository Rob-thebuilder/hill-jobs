import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderGuide, guideSourceLinks, renderBase, renderResourcesPanel } from '../scripts/build.mjs';
import { collectLinks } from '../scripts/check-links.mjs';

const read = (rel) => readFile(new URL(`../${rel}`, import.meta.url), 'utf8');
const site = JSON.parse(await read('data/site.json'));
const template = await read('templates/guide.html');
const html = renderGuide(site, template);
const sourcesSheet = await read('data/GUIDE-SOURCES.md');

test('the guide has one h1, the five sections, and an "On this page" list that links to them', () => {
  assert.equal((html.match(/<h1[\s>]/g) || []).length, 1);
  const sections = ['federal-or-contractor', 'pay', 'clearances', 'getting-on-base', 'preferences'];
  for (const id of sections) {
    assert.match(html, new RegExp(`<section id="${id}"`), id);
    assert.match(html, new RegExp(`<a href="#${id}">`), `toc link to ${id}`);
  }
  assert.ok(!/\{\{\w+\}\}/.test(html), 'no leftover placeholders');
  assert.match(html, /<link rel="canonical" href="https:\/\/workathill\.com\/how-hiring-works\/">/);
});

test('every source link is an official .gov or .mil page over https', () => {
  const links = guideSourceLinks(template);
  assert.ok(links.length >= 12, `expected the guide to cite many sources, found ${links.length}`);
  for (const { url } of links) {
    const u = new URL(url);
    assert.equal(u.protocol, 'https:', url);
    assert.match(u.hostname, /\.(gov|mil)$/, `not an official source: ${url}`);
  }
});

test('every external link opens safely in a new tab and says so', () => {
  const external = [...html.matchAll(/<a [^>]*href="https?:[^"]*"[^>]*>[\s\S]*?<\/a>/g)].map((m) => m[0]);
  assert.ok(external.length >= 12);
  for (const a of external) {
    assert.match(a, /target="_blank" rel="noopener"/, a);
    assert.match(a, /opens in new tab/, a);
  }
});

test('every source on the page is recorded in data/GUIDE-SOURCES.md', () => {
  for (const { url } of guideSourceLinks(template)) assert.ok(sourcesSheet.includes(url), `missing from GUIDE-SOURCES.md: ${url}`);
});

test('the main page links to the guide from the hero, the footer and the Resume help tab', async () => {
  const data = JSON.parse(await read('data/employers.json'));
  const base = await read('templates/base.html');
  const page = renderBase('hill', data.bases.hill, data.employers, site, base, null, null, null, { resources: [] });
  assert.match(page, /<a class="guide-link" href="\.\/how-hiring-works\/">New to Hill hiring\?/);
  assert.match(page, /<p class="fine">[\s\S]*href="\.\/how-hiring-works\/">How hiring at Hill works<\/a>/);
  assert.match(renderResourcesPanel([]), /href="\.\/how-hiring-works\/">how hiring at Hill works<\/a>/);
});

test('the weekly link check includes the guide sources', () => {
  const links = collectLinks({ guide: guideSourceLinks(template) });
  assert.equal(links.length, guideSourceLinks(template).length);
  assert.ok(links.every((l) => l.field === 'guide source'));
});
