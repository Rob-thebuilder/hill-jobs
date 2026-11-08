// Builds the weekly Work At Hill email and creates it in Buttondown.
// Usage: node scripts/weekly-email.mjs --current snapshot.json [--previous last-week.json] [--out email.html] [--dry-run]
//   snapshot.json comes from: node scripts/build.mjs --snapshot snapshot.json
// Env: BUTTONDOWN_API_KEY (from .env locally, an Actions secret in CI). Never printed.
// Without the key, or with --dry-run, or before data/site.json "newsletter" is filled in,
// it only writes the email to --out so you can preview it.
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { renderWeeklyEmail, fetchAlertTags, createEmail, newsletterReady } from './lib/newsletter.mjs';
import { mountainDate } from './lib/usajobs.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : null;
};
const readJson = async (p) => JSON.parse(await readFile(p, 'utf8'));

const currentPath = arg('--current');
if (!currentPath) {
  console.error('Usage: node scripts/weekly-email.mjs --current snapshot.json [--previous last-week.json] [--out email.html] [--dry-run]');
  process.exit(2);
}
const envFile = path.join(ROOT, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const site = await readJson(path.join(ROOT, 'data/site.json'));
const synonyms = await readJson(path.join(ROOT, 'data/synonyms.json'));
const current = await readJson(currentPath);
const previousPath = arg('--previous');
const previous = previousPath && existsSync(previousPath) ? await readJson(previousPath) : null;
const key = process.env.BUTTONDOWN_API_KEY;
const live = !process.argv.includes('--dry-run') && !!key && newsletterReady(site);

let alertTags = [];
if (live) {
  try {
    alertTags = await fetchAlertTags({ key });
  } catch (err) {
    console.error(`✗ Could not read subscribers' saved searches (${err.message}).`);
    process.exit(1);
  }
}

const today = mountainDate(new Date());
const email = renderWeeklyEmail({ current, previous, alertTags, synonyms, site, today });
const out = arg('--out');
if (out) await writeFile(out, `<!-- ${email.subject} -->\n${email.body}\n`);
console.log(`Subject: ${email.subject}`);
console.log(`${previous ? `${email.newCount} new job titles since last week` : 'First run: no previous snapshot, so no "new jobs" list'}; ${email.eventCount} events; ${alertTags.length} saved searches`);

if (!live) {
  const why = !newsletterReady(site) ? 'data/site.json newsletter settings are not filled in' : !key ? 'BUTTONDOWN_API_KEY is not set' : '--dry-run';
  console.log(`Preview only (${why}).${out ? ` Wrote ${out}.` : ''}`);
  process.exit(0);
}

try {
  const mode = site.newsletter.sendMode === 'send' ? 'send' : 'draft';
  const created = await createEmail({ key, subject: email.subject, body: email.body, mode });
  console.log(`✓ ${mode === 'send' ? 'Sent' : 'Draft created in Buttondown'}${created?.id ? ` (email ${created.id})` : ''}.`);
} catch (err) {
  console.error(`✗ Buttondown did not accept the email (${err.message}).`);
  process.exit(1);
}
