import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  renderContact, renderPrivacy, renderThanks, renderBase, contactReady, validateContact, WEB3FORMS_ACTION,
} from '../scripts/build.mjs';

const read = async (rel) => readFile(new URL(`../${rel}`, import.meta.url), 'utf8');
const site = JSON.parse(await read('data/site.json'));
const KEY = '12345678-abcd-4ef0-9876-0123456789ab';
const ready = { ...site, contact: { web3formsKey: KEY } };
const off = { ...site, contact: { web3formsKey: null } };

test('contact form stays off until a Web3Forms key is set, and bad keys are caught', () => {
  assert.equal(contactReady(off), false);
  assert.equal(renderContact(off), '');
  assert.equal(contactReady(ready), true);
  assert.deepEqual(validateContact(off), []);
  assert.deepEqual(validateContact(ready), []);
  assert.match(validateContact({ contact: { web3formsKey: 'not-a-key' } }).join(), /should look like/);
  assert.deepEqual(validateContact(site), [], 'data/site.json contact settings are valid');
});

test("contact form posts to Web3Forms with labeled, required fields and returns to /thanks/", () => {
  const html = renderContact(ready);
  assert.match(html, new RegExp(`action="${WEB3FORMS_ACTION.replace(/[.]/g, '\\.')}" method="post"`));
  assert.ok(!/target="_blank"/.test(html), 'stays in the same tab so the redirect lands on /thanks/');
  assert.match(html, new RegExp(`name="access_key" value="${KEY}"`));
  assert.match(html, /name="redirect" value="https:\/\/workathill\.com\/thanks\/"/);
  assert.match(html, /name="subject" value="New message from workathill\.com"/);
  assert.match(html, /<h2 class="signup-title" id="contact-title">Let's Connect<\/h2>/);
  for (const [id, name] of [['contact-name', 'name'], ['contact-email', 'email'], ['contact-message', 'message']]) {
    assert.match(html, new RegExp(`<label for="${id}">`), `${id} has a label`);
    assert.match(html, new RegExp(`id="${id}"[^>]*name="${name}"[^>]*required`), `${id} is required`);
  }
  assert.match(html, /type="email" name="email"/);
  assert.match(html, /name="botcheck" class="hp" tabindex="-1"/);
  assert.match(html, /role="status"/);
  assert.match(html, /href="\.\/privacy\/">Privacy<\/a>/);
  assert.ok(!/@/.test(html.replace(/you@example\.com/g, '')), 'no email address appears in the page');
});

test('home page footer has the form only when set up; privacy page explains it', async () => {
  const data = JSON.parse(await read('data/employers.json'));
  const template = await read('templates/base.html');
  const page = (s) => renderBase('hill', data.bases.hill, data.employers, s, template, null, null, null, {});
  const footer = (html) => html.slice(html.indexOf('<footer'));
  assert.match(footer(page(ready)), /id="contact-form"/);
  assert.ok(!page(off).includes('id="contact-form"'));
  assert.ok(!page(off).includes('{{'), 'no unfilled placeholders');

  const privacy = await read('templates/privacy.html');
  assert.match(renderPrivacy(ready, privacy), /The Let's Connect form \(optional\)[\s\S]*Web3Forms/);
  assert.ok(!renderPrivacy(off, privacy).includes('Web3Forms'));
  assert.ok(!renderPrivacy(off, privacy).includes('{{'));
});

test('thank-you page is not indexed and links home', async () => {
  const html = renderThanks(site, await read('templates/thanks.html'));
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.match(html, /<h1>Message sent<\/h1>/);
  assert.match(html, /href="\.\.\/"/);
  assert.ok(!html.includes('{{'));
});
