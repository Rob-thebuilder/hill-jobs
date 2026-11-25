import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  renderAbout, renderUpdateForm, renderBase, renderDirectory, listingLink, LISTING_TOPICS, WEB3FORMS_ACTION,
} from '../scripts/build.mjs';

const read = async (rel) => readFile(new URL(`../${rel}`, import.meta.url), 'utf8');
const site = JSON.parse(await read('data/site.json'));
const data = JSON.parse(await read('data/employers.json'));
const KEY = '12345678-abcd-4ef0-9876-0123456789ab';
const ready = { ...site, contact: { web3formsKey: KEY }, form: null };
const off = { ...site, contact: { web3formsKey: null }, form: null };
const google = {
  ...off,
  form: { formUrl: 'https://docs.google.com/forms/d/e/X/viewform', companyEntry: 'entry.1', requestTypeEntry: 'entry.2', addValue: 'Add my company', fixValue: 'Fix details' },
};
const hill = data.employers.filter((e) => e.base === 'hill');

test('About page: casual intro, how listings work, recruiter form and a copyable blurb', async () => {
  const html = renderAbout(ready, await read('templates/about.html'), hill.length);
  assert.ok(!html.includes('{{'), 'no unfilled placeholders');
  assert.match(html, /<h1>About Work At Hill<\/h1>/);
  assert.match(html, /Rob Smith/);
  assert.match(html, /aviation maintenance world for 10\+ years/);
  assert.match(html, /Free for job seekers, always\.<\/strong> Every employer is listed free, sorted A–Z, and nobody can pay to rank higher in the directory\. If the site carries sponsors, they're clearly labeled and kept separate from the listings\./);
  assert.match(html, new RegExp(`Each of the ${hill.length} employers`));
  assert.match(html, /<div class="form-panel" id="update">\s*<form class="contact" id="update-form"/);
  assert.match(html, /<link rel="canonical" href="https:\/\/workathill\.com\/about\/">/);
  assert.match(html, new RegExp(`free directory of the ${hill.length} employers hiring at Hill AFB`));
  assert.match(html, /not affiliated with or endorsed by/);
  assert.ok(!/Lockheed/.test(html), 'no employer named in the bio');
});

test('listing form posts to Web3Forms, has every request type, and stays off without a key', () => {
  assert.equal(renderUpdateForm(off), '');
  const html = renderUpdateForm(ready);
  assert.match(html, new RegExp(`action="${WEB3FORMS_ACTION.replace(/[.]/g, '\\.')}" method="post"`));
  assert.ok(!/target="_blank"/.test(html));
  assert.match(html, /name="redirect" value="https:\/\/workathill\.com\/thanks\/"/);
  assert.match(html, /name="subject" value="Listing request from workathill\.com"/);
  for (const [v, label] of LISTING_TOPICS) assert.ok(html.includes(`<option value="${label}" data-topic="${v}">`), v);
  for (const [id, name, required] of [['update-topic', 'request', true], ['update-company', 'company', false], ['update-name', 'name', true], ['update-email', 'email', true], ['update-message', 'message', true]]) {
    assert.match(html, new RegExp(`<label for="${id}">`), `${id} has a label`);
    assert.match(html, new RegExp(`id="${id}"[^>]*name="${name}"`), `${id} name`);
    assert.equal(new RegExp(`id="${id}"[^>]*required`).test(html), required, `${id} required=${required}`);
  }
  assert.match(html, /name="botcheck" class="hp"/);
  assert.ok(!/@/.test(html), 'no email address in the page');
});

test('without a key, the About page says the form is coming instead of leaving a gap', async () => {
  const html = renderAbout(off, await read('templates/about.html'), hill.length);
  assert.match(html, /A request form will be posted here soon/);
  assert.ok(!html.includes('id="update-form"'));
});

test('"Suggest a change" and the recruiter link open the About form, prefilled, in the same tab', async () => {
  assert.deepEqual(listingLink(ready, './', 'fix', 'Boeing'), { href: './about/?topic=fix&company=Boeing#update', newTab: false });
  assert.deepEqual(listingLink(ready, '../', 'add'), { href: '../about/?topic=add#update', newTab: false });
  assert.equal(listingLink(off, './', 'fix', 'Boeing'), null);
  const g = listingLink(google, './', 'fix', 'Boeing');
  assert.equal(g.newTab, true);
  assert.match(g.href, /^https:\/\/docs\.google\.com\/forms\/.*entry\.2=Fix\+details.*entry\.1=Boeing/);

  const home = renderBase('hill', data.bases.hill, data.employers, ready, await read('templates/base.html'), null, null, null, {});
  const cards = home.match(/<article class="card"[\s\S]*?<\/article>/g);
  assert.equal(cards.length, hill.length);
  for (const c of cards) assert.match(c, /<a href="\.\/about\/\?topic=fix&amp;company=[^"]+#update">Suggest a change<span class="sr-only"> for /);
  assert.equal((home.match(/class="recruiter" href="\.\/about\/\?topic=add#update">Recruiter\? Add or update your company<\/a>/g) || []).length, 1, 'once, at the bottom');
  const footerStart = home.indexOf('<footer');
  assert.ok(home.indexOf('class="recruiter"') > footerStart, 'the recruiter link is in the footer, not the hero');
  assert.match(home, /<a href="\.\/about\/">About<\/a>/);

  const dir = renderDirectory('hill', data.bases.hill, data.employers, ready, await read('templates/employers.html'));
  assert.match(dir, /<a href="\.\.\/about\/\?topic=fix&amp;company=[^"]+#update">Suggest a change/);
  assert.ok(!dir.includes('{{'));

  const offHome = renderBase('hill', data.bases.hill, data.employers, off, await read('templates/base.html'), null, null, null, {});
  assert.ok(!offHome.includes('Suggest a change') && !offHome.includes('class="recruiter"'), 'no dead links without a form');
});

test('every page footer links to About', async () => {
  for (const f of ['base', 'employers', 'guide', 'privacy', 'thanks', 'training', 'about']) {
    const html = await read(`templates/${f}.html`);
    const footer = html.slice(html.indexOf('<footer'));
    assert.match(footer, /about\/">About<\/a>|href="\.\/">About<\/a>/, f);
  }
});

test('footers promise free listings with no pay-to-rank, and drop the old "No paid placement" line', async () => {
  for (const f of ['base', 'employers']) {
    const html = await read(`templates/${f}.html`);
    assert.match(html, /Free for job seekers\. Every employer is listed free, sorted A–Z[^.]*, and nobody can pay to rank higher\./, f);
    assert.ok(!/No paid placement/i.test(html), f);
  }
});
