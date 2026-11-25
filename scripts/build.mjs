// Validates data/employers.json, then renders one static page per base into dist/.
// Node built-ins only. Usage: node scripts/build.mjs [--check] [--no-counts] [--no-careers] [--out DIR]
//   --check      validate only (no network, no output)
//   --no-counts  skip the USAJOBS open-job counts and titles
//   --no-careers skip the contractor careers-site job titles
//   --no-events  skip reading public event calendars (curated events still show)
//   --snapshot F write this build's live job titles and events to F (for scripts/weekly-email.mjs)
//   --site F     use site settings from F instead of data/site.json (previews)
//   --out DIR    write the site somewhere other than dist/
// Env (from .env locally, Actions secrets in CI): USAJOBS_API_KEY, USAJOBS_EMAIL
import { readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fetchUsajobs } from './lib/usajobs.mjs';
import { fetchCareers } from './lib/careers.mjs';
import { fetchEvents, upcoming, EVENT_TYPES } from './lib/events.mjs';
import { mountainDate } from './lib/usajobs.mjs';
import { newsletterReady, subscribeAction } from './lib/newsletter.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUDGET_BYTES = 100 * 1024;
const Search = createRequire(import.meta.url)('../assets/search.js');

// The single slug → label map. The schema enums must match these keys.
export const LABELS = {
  types: {
    prime: 'Prime contractor',
    subcontractor: 'Subcontractor / supplier',
    federal: 'Federal civilian',
    services: 'Services / support',
  },
  categories: {
    'trades-maintenance': 'Trades & Maintenance',
    engineering: 'Engineering',
    'software-it': 'Software & IT',
    'logistics-supply': 'Logistics & Supply',
    'admin-business': 'Admin & Business',
    'internships-entry': 'Internships & Entry-level',
    'base-services': 'Base services',
  },
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const readJson = async (rel) => JSON.parse(await readFile(path.join(ROOT, rel), 'utf8'));

// ---------- validation ----------

// Small JSON Schema validator: covers only the keywords employers.schema.json uses.
function validate(schema, value, at, errors) {
  const types = schema.type ? [].concat(schema.type) : null;
  if (types) {
    const actual = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
    const ok = types.some((t) => t === actual || (t === 'integer' && Number.isInteger(value)));
    if (!ok) return errors.push(`${at}: expected ${types.join(' or ')}, got ${actual}`);
  }
  if (value === null) return;
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${at}: "${value}" is not one of ${schema.enum.join(', ')}`);
  }
  if (typeof value === 'string') {
    if (schema.minLength != null && value.length < schema.minLength) errors.push(`${at}: shorter than ${schema.minLength} chars`);
    if (schema.maxLength != null && value.length > schema.maxLength) errors.push(`${at}: ${value.length} chars, max ${schema.maxLength}`);
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) errors.push(`${at}: "${value}" does not match ${schema.pattern}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems != null && value.length < schema.minItems) errors.push(`${at}: needs at least ${schema.minItems} items`);
    if (schema.maxItems != null && value.length > schema.maxItems) errors.push(`${at}: at most ${schema.maxItems} items, has ${value.length}`);
    if (schema.uniqueItems && new Set(value.map((v) => JSON.stringify(v))).size !== value.length) errors.push(`${at}: items must be unique`);
    if (schema.items) value.forEach((v, i) => validate(schema.items, v, `${at}[${i}]`, errors));
  } else if (typeof value === 'object') {
    const props = schema.properties || {};
    for (const key of schema.required || []) if (!(key in value)) errors.push(`${at}: missing "${key}"`);
    if (schema.minProperties != null && Object.keys(value).length < schema.minProperties) errors.push(`${at}: needs at least ${schema.minProperties} entries`);
    for (const [key, v] of Object.entries(value)) {
      if (props[key]) validate(props[key], v, `${at}.${key}`, errors);
      else if (schema.additionalProperties === false) errors.push(`${at}: unknown field "${key}"`);
      else if (typeof schema.additionalProperties === 'object') validate(schema.additionalProperties, v, `${at}.${key}`, errors);
    }
  }
}

function sameKeys(a, b) {
  return a.length === b.length && [...a].sort().join() === [...b].sort().join();
}

export function validateData(data, schema) {
  const errors = [];
  validate(schema, data, 'data', errors);
  // Name schema errors by employer id rather than array index where possible.
  const named = errors.map((e) =>
    e.replace(/^data\.employers\[(\d+)\]/, (m, i) => `employer "${data.employers?.[i]?.id ?? i}"`),
  );

  const seen = new Set();
  for (const e of data.employers || []) {
    if (seen.has(e.id)) named.push(`employer "${e.id}": duplicate id`);
    seen.add(e.id);
    if (data.bases && !(e.base in data.bases)) named.push(`employer "${e.id}": unknown base "${e.base}"`);
  }

  const emp = schema.properties.employers.items.properties;
  if (!sameKeys(emp.type.enum, Object.keys(LABELS.types))) named.push('schema type enum and LABELS.types differ');
  if (!sameKeys(emp.categories.items.enum, Object.keys(LABELS.categories))) named.push('schema category enum and LABELS.categories differ');
  return named;
}

// ---------- rendering ----------

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const NEW_TAB = '<span class="sr-only"> (opens in new tab)</span>';

function formUrl(form, requestType, company) {
  if (!form) return null;
  const u = new URL(form.formUrl);
  u.searchParams.set('usp', 'pp_url');
  u.searchParams.set(form.requestTypeEntry, requestType);
  if (company) u.searchParams.set(form.companyEntry, company);
  return u.toString();
}

/**
 * Where "Suggest a change" and "Recruiter? Add or update your company" point. With the
 * Web3Forms key set, they open the listing form on the About page (same tab), with the request
 * type and company filled in by about.html's script. Otherwise the optional Google Form.
 */
export function listingLink(site, prefix, topic, company) {
  if (contactReady(site)) {
    const q = new URLSearchParams({ topic });
    if (company) q.set('company', company);
    return { href: `${prefix}about/?${q}#update`, newTab: false };
  }
  const url = formUrl(site?.form, topic === 'add' ? site?.form?.addValue : site?.form?.fixValue, company);
  return url ? { href: url, newTab: true } : null;
}

function verifiedLabel(ym) {
  const [y, m] = ym.split('-');
  return `${MONTHS[Number(m) - 1]} ${y}`;
}

function dateLabel(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

/** "23 open jobs · checked Nov 6, 2026", or '' when there's no count for this employer. */
export function openJobsLine(id, jobCounts) {
  const n = jobCounts?.counts?.[id];
  if (!Number.isInteger(n)) return '';
  const what = n === 0 ? 'No open jobs right now' : `<strong>${n}</strong> open job${n === 1 ? '' : 's'}`;
  return `<p class="open-jobs">${what} <span class="checked">· checked <time datetime="${esc(jobCounts.checkedAt)}">${dateLabel(jobCounts.checkedAt)}</time></span></p>\n`;
}

function renderCard(e, site, jobCounts, h = 'h2', prefix = './') {
  const typeLabel = LABELS.types[e.type];
  const catLabels = e.categories.map((c) => LABELS.categories[c]);
  const suggest = listingLink(site, prefix, 'fix', e.name);
  return `<li><article class="card" data-type="${esc(e.type)}" data-cats="${esc(e.categories.join(' '))}" data-id="${esc(e.id)}" aria-labelledby="e-${esc(e.id)}">
<div class="card-top"><span class="badge badge-${esc(e.type)}">${esc(typeLabel)}</span></div>
<${h} id="e-${esc(e.id)}">${esc(e.name)}</${h}>
<p class="desc">${esc(e.description)}</p>
<ul class="tags" aria-label="Job categories">${catLabels.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
<p class="why" hidden></p>
<div class="card-actions">
${openJobsLine(e.id, jobCounts)}<a class="btn-jobs" href="${esc(e.jobsUrl)}" target="_blank" rel="noopener">View jobs <span aria-hidden="true">→</span><span class="sr-only"> at ${esc(e.name)}</span>${NEW_TAB}</a>
${e.secondaryUrl ? `<a class="link-secondary" href="${esc(e.secondaryUrl)}" target="_blank" rel="noopener">${e.type === 'federal' ? 'Agency hiring page' : 'More openings'}<span class="sr-only"> for ${esc(e.name)}</span>${NEW_TAB}</a>` : ''}
</div>
<p class="meta"><span>Link verified ${verifiedLabel(e.verified)}</span>${suggest ? `<a href="${esc(suggest.href)}"${suggest.newTab ? ' target="_blank" rel="noopener"' : ''}>Suggest a change<span class="sr-only"> for ${esc(e.name)}</span>${suggest.newTab ? NEW_TAB : ''}</a>` : ''}</p>
</article></li>`;
}

function renderChips(employers) {
  const usedTypes = Object.keys(LABELS.types).filter((t) => employers.some((e) => e.type === t));
  const usedCats = Object.keys(LABELS.categories).filter((c) => employers.some((e) => e.categories.includes(c)));
  const typeChips = [`<button type="button" class="chip" data-type="" aria-pressed="true">All</button>`]
    .concat(usedTypes.map((t) => `<button type="button" class="chip" data-type="${t}" aria-pressed="false">${esc(LABELS.types[t])}</button>`))
    .join('');
  const catChips = usedCats
    .map((c) => `<button type="button" class="chip" data-cat="${c}" aria-pressed="false">${esc(LABELS.categories[c])}</button>`)
    .join('');
  return { typeChips, catChips };
}

const countText = (n) => `${n} employer${n === 1 ? '' : 's'}`;

function fill(template, values) {
  return template.replace(/\{\{(\w+)\}\}/g, (m, key) => {
    if (!(key in values)) throw new Error(`template placeholder {{${key}}} has no value`);
    return values[key];
  });
}

/** JSON for the page's search: synonyms plus each employer's searchable text. Safe inside <script>. */
export function searchData(employers, synonyms, jobCounts, careerTitles = null) {
  const data = {
    synonyms: { groups: synonyms?.groups || [] },
    employers: employers.map((e) => ({
      id: e.id,
      name: e.name,
      description: e.description,
      roles: e.roles || [],
      titles: jobCounts?.titles?.[e.id] || careerTitles?.[e.id] || [],
    })),
  };
  return JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}


// ---------- Employer Directory page (/employers/) ----------

/** Plural headings for the directory's groups, in LABELS.types order. */
export const GROUP_TITLES = {
  prime: 'Prime contractors',
  subcontractor: 'Subcontractors & suppliers',
  federal: 'Federal civilian employers',
  services: 'Services & support',
};

/** All employers for a base on one page, grouped by type, A–Z within each group. Built at deploy time. */
export function renderDirectory(baseId, base, allEmployers, site, template, jobCounts = null, synonyms = null, careerTitles = null) {
  const employers = allEmployers
    .filter((e) => e.base === baseId)
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base', numeric: true }));
  const root = site.siteUrl.replace(/\/$/, '');
  const label = `${base.name}, ${STATE_NAMES[base.state] || base.state}`;
  const groups = Object.keys(LABELS.types)
    .map((t) => [t, employers.filter((e) => e.type === t)])
    .filter(([, list]) => list.length)
    .map(([t, list]) => `    <section class="dir-group" id="type-${t}" aria-labelledby="g-${t}">
      <h2 class="group-title" id="g-${t}">${esc(GROUP_TITLES[t])} <span class="group-n">${list.length}</span></h2>
      <ul class="grid">
${list.map((e) => renderCard(e, site, jobCounts, 'h3', '../')).join('\n')}
      </ul>
    </section>`)
    .join('\n');
  return fill(template, {
    analytics: renderAnalytics(site),
    siteName: esc(site.siteName),
    baseLabel: esc(label),
    canonical: esc(`${root}/employers/`),
    ogImage: esc(`${root}/assets/og.png`),
    description: esc(`All ${countText(employers.length)} near ${label}, grouped by type: prime contractors, federal agencies, suppliers and base services, with direct links to each careers page.`),
    count: countText(employers.length),
    typeChips: renderChips(employers).typeChips,
    groups,
    searchData: searchData(employers, synonyms, jobCounts, careerTitles),
  });
}

// ---------- email signup (Buttondown) ----------

const SIGNUP_FINE = (prefix) =>
  `<p class="signup-fine">At most one email a week. You'll confirm by email first, and every email has an unsubscribe link. <a href="${prefix}privacy/">Privacy</a></p>`;

/** "Email me when … jobs show up" form; app.js shows it during a search and fills in the saved-search tag. */
export function renderAlertBox(site, prefix = './') {
  if (!newsletterReady(site)) return '';
  return `<form class="alert-box" id="alert-form" action="${esc(subscribeAction(site.newsletter.buttondownUsername))}" method="post" target="_blank" hidden>
      <p class="alert-title" id="alert-title">Email me new jobs for this search</p>
      <div class="signup-row">
        <label for="alert-email" class="sr-only">Email address</label>
        <input id="alert-email" type="email" name="email" required autocomplete="email" inputmode="email" placeholder="you@example.com" aria-describedby="alert-title">
        <button type="submit" class="btn-signup">Email me<span class="sr-only"> (opens in new tab)</span></button>
      </div>
      <input type="hidden" name="tag" value="weekly">
      <input type="hidden" name="tag" id="alert-tag" value="">
      ${SIGNUP_FINE(prefix)}
    </form>`;
}

export function renderSignupFooter(site, prefix = './') {
  if (!newsletterReady(site)) return '';
  return `<form class="signup" action="${esc(subscribeAction(site.newsletter.buttondownUsername))}" method="post" target="_blank" aria-labelledby="signup-title">
      <h2 class="signup-title" id="signup-title">Get weekly updates</h2>
      <p class="signup-lead">New jobs near Hill and upcoming job fairs and workshops, every Monday.</p>
      <div class="signup-row">
        <label for="signup-email" class="sr-only">Email address</label>
        <input id="signup-email" type="email" name="email" required autocomplete="email" inputmode="email" placeholder="you@example.com">
        <button type="submit" class="btn-signup">Sign up<span class="sr-only"> (opens in new tab)</span></button>
      </div>
      <input type="hidden" name="tag" value="weekly">
      ${SIGNUP_FINE(prefix)}
    </form>`;
}

/** Full state names for the label at the top of a base's page ("Hill AFB, Utah"). */
const STATE_NAMES = { UT: 'Utah' };

// ---------- "Let's Connect" contact form (Web3Forms) ----------

export const WEB3FORMS_ACTION = 'https://api.web3forms.com/submit';
const WEB3FORMS_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True once data/site.json has a Web3Forms access key. Web3Forms emails each message to the key's account. */
export const contactReady = (site) => WEB3FORMS_KEY.test(site?.contact?.web3formsKey || '');

// ---- Google Analytics 4 (site.analyticsId; null = no tag). gtag.js only: never also the GTM container. ----
const GA4_ID = /^G-[A-Z0-9]{4,20}$/;

export function validateAnalytics(site) {
  const id = site?.analyticsId;
  return id != null && !GA4_ID.test(id) ? ['analyticsId should be a GA4 measurement ID like G-XXXXXXXXXX, or null'] : [];
}

/** The GA4 tag, placed immediately after <head> on every indexable page (not /thanks/). */
export function renderAnalytics(site) {
  const id = site?.analyticsId;
  if (!id || !GA4_ID.test(id)) return '';
  return `<script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', '${id}');
</script>
`;
}

// ---- Security: Content-Security-Policy and Referrer-Policy as <meta> tags ----
// GitHub Pages can't send custom response headers, so the policy rides in each page's <head>.
// Inline scripts are allowed by their SHA-256 hash only, so injected markup can't run code.
// The Google domains are the ones Google documents for GA4 (with Google signals).
const GA_HOSTS = 'https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://*.g.doubleclick.net https://*.google.com';

export function cspPolicy(html) {
  const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
    .map((m) => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`);
  // Pages without the GA tag (e.g. /thanks/) don't allow any Google hosts.
  const ga = html.includes('googletagmanager.com/gtag/js');
  const gaScript = ga ? ' https://www.googletagmanager.com' : '';
  const gaHosts = ga ? ` ${GA_HOSTS}` : '';
  return [
    "default-src 'self'",
    `script-src 'self'${gaScript} ${[...new Set(hashes)].join(' ')}`.trim(),
    "style-src 'self'",
    `img-src 'self' data:${gaHosts}`,
    `connect-src 'self' https://api.web3forms.com${gaHosts}`,
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://api.web3forms.com https://buttondown.com",
    'upgrade-insecure-requests',
  ].join('; ');
}

/** Puts charset first, then the CSP and referrer tags, ahead of every script (including GA). */
export function withSecurityMeta(html) {
  const head = html.match(/<head>\n([\s\S]*?)<meta charset="utf-8">\n/);
  if (!head) throw new Error('page has no <head> followed by <meta charset="utf-8">');
  const meta = `<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="${esc(cspPolicy(html))}">\n<meta name="referrer" content="strict-origin-when-cross-origin">\n`;
  return html.replace(head[0], `<head>\n${meta}${head[1]}`);
}

// ---- IndexNow (site.indexNowKey; null = off). The key file proves to search engines that pings come from this site. ----
const INDEXNOW_KEY = /^[A-Za-z0-9-]{8,128}$/;

export function validateIndexNow(site) {
  const key = site?.indexNowKey;
  return key != null && !INDEXNOW_KEY.test(key) ? ['indexNowKey should be 8–128 letters, digits or dashes, or null'] : [];
}

/** { name, body } of the key file served at the site root, or null when IndexNow is off. */
export function indexNowKeyFile(site) {
  const key = site?.indexNowKey;
  return key && INDEXNOW_KEY.test(key) ? { name: `${key}.txt`, body: key } : null;
}

export function validateContact(site) {
  const key = site?.contact?.web3formsKey;
  return key != null && !WEB3FORMS_KEY.test(key) ? ['web3formsKey should look like xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'] : [];
}

/**
 * Footer contact form. A plain HTML post works without JavaScript: Web3Forms emails the
 * message and redirects to /thanks/. app.js sends it in the background instead and shows the result inline.
 */
export function renderContact(site, prefix = './') {
  if (!contactReady(site)) return '';
  const root = site.siteUrl.replace(/\/$/, '');
  return `<form class="contact" id="contact-form" action="${WEB3FORMS_ACTION}" method="post" aria-labelledby="contact-title">
      <h2 class="signup-title" id="contact-title">Let's Connect</h2>
      <p class="signup-lead">Questions, ideas or a correction? Send a message.</p>
      <input type="hidden" name="access_key" value="${esc(site.contact.web3formsKey)}">
      <input type="hidden" name="subject" value="New message from ${esc(new URL(root).host)}">
      <input type="hidden" name="from_name" value="${esc(site.siteName)}">
      <input type="hidden" name="redirect" value="${esc(root)}/thanks/">
      <input type="checkbox" name="botcheck" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
      <div class="contact-row">
        <p class="field"><label for="contact-name">Name</label><input id="contact-name" name="name" required autocomplete="name" maxlength="100"></p>
        <p class="field"><label for="contact-email">Email</label><input id="contact-email" type="email" name="email" required autocomplete="email" inputmode="email" maxlength="200"></p>
      </div>
      <p class="field"><label for="contact-message">Message</label><textarea id="contact-message" name="message" required rows="5" maxlength="4000"></textarea></p>
      <button type="submit" class="btn-signup">Send message</button>
      <p class="contact-status" id="contact-status" role="status" aria-live="polite"></p>
      <p class="signup-fine">Your email is used only to reply to you. <a href="${prefix}privacy/">Privacy</a></p>
    </form>`;
}

/** Request types on the About page's listing form: [value in the URL, label in the menu and the email]. */
export const LISTING_TOPICS = [
  ['add', 'Add my company'],
  ['fix', 'Fix a listing'],
  ['remove', 'Remove a listing'],
  ['resume', 'List my resume service'],
  ['event', 'Add an event'],
  ['partner', 'Link to or partner with the site'],
  ['other', 'Something else'],
];

/**
 * The About page's listing form (recruiters, employers, partners). Same Web3Forms inbox as Let's
 * Connect. A plain post, so it works without JavaScript; about.html's script only fills in the
 * request type and company from ?topic= and ?company=.
 */
export function renderUpdateForm(site) {
  if (!contactReady(site)) return '';
  const root = site.siteUrl.replace(/\/$/, '');
  const options = LISTING_TOPICS.map(([v, label]) => `<option value="${esc(label)}" data-topic="${v}">${esc(label)}</option>`).join('');
  return `<form class="contact" id="update-form" action="${WEB3FORMS_ACTION}" method="post" aria-labelledby="update-title">
      <h2 class="signup-title" id="update-title">Add or fix a listing</h2>
      <p class="signup-lead">Tell me what to add or change. I check every request by hand, usually within a few days.</p>
      <input type="hidden" name="access_key" value="${esc(site.contact.web3formsKey)}">
      <input type="hidden" name="subject" value="Listing request from ${esc(new URL(root).host)}">
      <input type="hidden" name="from_name" value="${esc(site.siteName)}">
      <input type="hidden" name="redirect" value="${esc(root)}/thanks/">
      <input type="checkbox" name="botcheck" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
      <div class="contact-row">
        <p class="field"><label for="update-topic">What's this about?</label><select id="update-topic" name="request" required>${options}</select></p>
        <p class="field"><label for="update-company">Company or organization</label><input id="update-company" name="company" autocomplete="organization" maxlength="120"></p>
      </div>
      <div class="contact-row">
        <p class="field"><label for="update-name">Your name</label><input id="update-name" name="name" required autocomplete="name" maxlength="100"></p>
        <p class="field"><label for="update-email">Work email</label><input id="update-email" type="email" name="email" required autocomplete="email" inputmode="email" maxlength="200"></p>
      </div>
      <p class="field"><label for="update-message">Details</label><textarea id="update-message" name="message" required rows="5" maxlength="4000" placeholder="For example: the right careers link, what your team does at Hill, or the event date and link."></textarea></p>
      <button type="submit" class="btn-signup">Send request</button>
      <p class="signup-fine">Your email is used only to reply to you. <a href="../privacy/">Privacy</a></p>
    </form>`;
}

export function renderAbout(site, template, employerCount) {
  const root = site.siteUrl.replace(/\/$/, '');
  const blurb = `${site.siteName} (${new URL(root).host}) is a free directory of the ${employerCount} employers hiring at Hill AFB, with direct links to each careers page, job fairs, training and resume help.`;
  const updateForm = renderUpdateForm(site);
  return fill(template, {
    analytics: renderAnalytics(site),
    siteName: esc(site.siteName),
    canonical: esc(`${root}/about/`),
    ogImage: esc(`${root}/assets/og.png`),
    siteUrl: esc(root + '/'),
    count: String(employerCount),
    blurb: esc(blurb),
    updateForm: updateForm
      ? updateForm
      : '<p>A request form will be posted here soon.</p>',
  });
}

export function renderThanks(site, template) {
  return fill(template, { siteName: esc(site.siteName) });
}

const PRIVACY_CONTACT = `
  <h2>The contact and listing forms (optional)</h2>
  <ul>
    <li><strong>Which forms:</strong> the Let's Connect form on the home page and the "Add or fix a listing" form on the <a href="../about/">About page</a>.</li>
    <li><strong>What's sent:</strong> what you type: your name, email address and message, plus the request type and company on the listing form. Nothing is sent until you press the send button.</li>
    <li><strong>How it's sent:</strong> <a href="https://web3forms.com/privacy" rel="noopener">Web3Forms</a>, a form service, emails your message to Work At Hill. Work At Hill keeps it in its email inbox.</li>
    <li><strong>How it's used:</strong> only to read and reply to your message. It's never added to any mailing list, sold, rented or shared.</li>
    <li><strong>Deleting it:</strong> ask in a message, and it will be deleted.</li>
  </ul>
`;

// Change this whenever the privacy page's wording changes.
export const PRIVACY_UPDATED = 'November 25, 2026';

const CONNECT_LINK = `the <a href="../#contact-form">Let's Connect form</a> on the home page`;

// Shown only while signup is live, like the contact-form section.
function privacyNewsletter(contactOn) {
  const ask = contactOn ? `write to us through ${CONNECT_LINK}, or reply to any email` : 'reply to any email';
  return `
  <h2>The weekly email (optional)</h2>
  <ul>
    <li><strong>What's kept:</strong> your email address, and the search terms you ask to be alerted about (for example "sheet metal"). Nothing else.</li>
    <li><strong>Who keeps it:</strong> <a href="https://buttondown.com/legal/privacy" rel="noopener">Buttondown</a>, the email service that stores the list and sends the email. Work At Hill never sells, rents or shares your address.</li>
    <li><strong>Confirming:</strong> after you sign up, you'll get an email asking you to confirm. Nothing is sent until you do.</li>
    <li><strong>What you get:</strong> at most one email a week, with new jobs near Hill, upcoming events and new matches for your saved searches.</li>
    <li><strong>Stopping:</strong> every email has an unsubscribe link. Unsubscribing stops all emails.</li>
    <li><strong>Deleting your data:</strong> to have your address and saved searches deleted, ${ask}.</li>
  </ul>
`;
}

export function renderPrivacy(site, template) {
  const newsOn = newsletterReady(site);
  const contactOn = contactReady(site);
  const short = renderAnalytics(site)
    ? ['Work At Hill uses Google Analytics, which sets cookies, to count visits and see which employer links get clicked. It never sells personal information.']
    : ['browsing Work At Hill collects nothing about you.'];
  if (newsOn) short.push('If you sign up for the weekly email, your email address and any saved searches are kept by our email service, Buttondown, and used only to send you that email.');
  if (contactOn) short.push("If you send a message through the Let's Connect form, it's used only to reply to you.");
  const contact = [];
  if (contactOn) contact.push(`  <p>Questions, or want something deleted? Use ${CONNECT_LINK}.</p>`);
  if (newsOn) contact.push(`  <p>${esc(`Work At Hill, ${site.newsletter.postalAddress}`)}</p>`);
  if (!contact.length) contact.push('  <p>A way to contact Work At Hill will be posted here soon.</p>');
  return fill(template, {
    analytics: renderAnalytics(site),
    siteName: esc(site.siteName),
    canonical: esc(site.siteUrl.replace(/\/$/, '') + '/privacy/'),
    updated: PRIVACY_UPDATED,
    shortVersion: short.join(' '),
    newsletter: newsOn ? privacyNewsletter(contactOn) : '',
    contactForm: contactOn ? PRIVACY_CONTACT : '',
    changesEmail: newsOn ? ' A change that affects subscribers is also mentioned in the next weekly email.' : '',
    contact: contact.join('\n'),
  });
}

export function renderGuide(site, template) {
  const root = site.siteUrl.replace(/\/$/, '');
  return fill(template, {
    analytics: renderAnalytics(site),
    siteName: esc(site.siteName),
    canonical: esc(`${root}/how-hiring-works/`),
    ogImage: esc(`${root}/assets/og.png`),
  });
}

/** Every indexable page the build writes. /thanks/ is left out: it's noindex. */
export function sitemapPaths(bases) {
  return [...new Set([...Object.values(bases).map((b) => b.path), '/employers/', '/get-trained/', '/how-hiring-works/', '/about/', '/privacy/'])];
}

/** sitemap.xml for the indexable pages; lastmod is the build date (YYYY-MM-DD). */
export function renderSitemap(site, bases, date) {
  const root = site.siteUrl.replace(/\/$/, '');
  const urls = sitemapPaths(bases)
    .map((p) => `  <url>\n    <loc>${esc(root + p)}</loc>\n    <lastmod>${esc(date)}</lastmod>\n  </url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function renderRobots(site) {
  const root = site.siteUrl.replace(/\/$/, '');
  return `User-agent: *\nAllow: /\n\nSitemap: ${root}/sitemap.xml\n`;
}

/** Official source links on the guide page (links marked class="src"). */
export function guideSourceLinks(template) {
  return [...template.matchAll(/<a class="src" href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => ({
    url: m[1].replace(/&amp;/g, '&'),
    label: m[2].replace(/<[^>]+>/g, '').replace(/\s*\(opens in new tab\)\s*/, '').trim(),
  }));
}

export function validateNewsletter(site) {
  const n = site?.newsletter;
  if (!n) return [];
  const errors = [];
  if (n.buttondownUsername != null && !/^[A-Za-z0-9_-]{1,64}$/.test(n.buttondownUsername)) errors.push('buttondownUsername has unexpected characters');
  if (n.buttondownUsername && !(typeof n.postalAddress === 'string' && n.postalAddress.trim().length >= 10)) {
    errors.push('set postalAddress too: every email must include a postal address (CAN-SPAM); a PO box is fine');
  }
  if (!['draft', 'send'].includes(n.sendMode)) errors.push('sendMode must be "draft" or "send"');
  return errors;
}

// ---------- more ways to find Hill jobs ----------

export const PROGRAM_KINDS = {
  program: 'Programs',
  'job-board': 'Job boards',
  'state-service': 'State services',
  'on-base-help': 'On-base help',
  college: 'College job boards',
};
const PROGRAM_KEYS = ['id', 'name', 'kind', 'who', 'url', 'verified', 'sourceUrl'];

export function validatePrograms(file) {
  const errors = [];
  if (!Array.isArray(file?.programs)) return ['"programs" must be a list'];
  const seen = new Set();
  for (const p of file.programs) {
    const at = `program "${p?.id}"`;
    for (const k of PROGRAM_KEYS) if (!(k in (p || {}))) errors.push(`${at}: missing "${k}"`);
    for (const k of Object.keys(p || {})) if (!PROGRAM_KEYS.includes(k)) errors.push(`${at}: unknown field "${k}"`);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p?.id || '') || seen.has(p?.id)) errors.push(`${at}: missing, bad or duplicate id`);
    seen.add(p?.id);
    if (!(p?.kind in PROGRAM_KINDS)) errors.push(`${at}: unknown kind "${p?.kind}"`);
    if (typeof p?.name !== 'string' || !p.name.trim() || p.name.length > 80) errors.push(`${at}: name must be 1–80 characters`);
    if (typeof p?.who !== 'string' || !p.who.trim() || p.who.length > 100) errors.push(`${at}: "who" must be 1–100 characters`);
    if (!/^https:\/\/\S+$/.test(p?.url || '') || !/^https:\/\/\S+$/.test(p?.sourceUrl || '')) errors.push(`${at}: url and sourceUrl must be https`);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(p?.verified || '')) errors.push(`${at}: verified must be YYYY-MM`);
  }
  return errors;
}

/** The section, plus the links to it from the empty state and the footer ('' when there are no programs). */
export function renderMoreWays(programs) {
  if (!programs?.length) return { section: '', emptyLink: '', footerLink: '' };
  const groups = Object.keys(PROGRAM_KINDS)
    .map((kind) => [kind, programs.filter((p) => p.kind === kind).sort((a, b) => a.name.localeCompare(b.name))])
    .filter(([, list]) => list.length);
  const section = `<section class="more-ways wrap" id="more-ways" aria-labelledby="more-ways-heading" tabindex="-1">
    <h2 id="more-ways-heading">More ways to find Hill jobs</h2>
    <p class="more-ways-lead">Programs and job boards that cover many employers at once.</p>
${groups.map(([kind, list]) => `    <h3 class="group-title">${esc(PROGRAM_KINDS[kind])} <span class="group-n">${list.length}</span></h3>
    <ul class="ways-list">
${list.map((p) => `      <li><a class="way-name" href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.name)}${NEW_TAB}</a><p class="way-who">${esc(p.who)}</p><p class="way-checked">Checked ${verifiedLabel(p.verified)}</p></li>`).join('\n')}
    </ul>`).join('\n')}
  </section>`;
  return {
    section,
    emptyLink: `<p class="empty-more"><a href="#more-ways" data-tab-link="employers">More ways to find Hill jobs <span aria-hidden="true">↓</span></a></p>`,
    footerLink: `<a href="#more-ways" data-tab-link="employers">More ways to find Hill jobs</a> · `,
  };
}

// ---------- Get Trained page (/get-trained/) ----------

/** Sections of the Get Trained page, in page order: [heading, intro]. */
export const TRAINING_SECTIONS = {
  certificates: ['Fast certificates', 'Hands-on certificates at the two tech colleges closest to Hill. Davis Tech lengths are for part-time study (15 hours a week). At OTECH, a full-time student finishes about 1 credit a week.'],
  apprenticeships: ['Apprenticeships', 'Get paid on the job while you take the required classes. Union programs place you with an employer. For the college programs, you find a job as an apprentice first, then take the classes.'],
  aviation: ['Aircraft mechanic (A&P) schools', 'These Utah programs prepare you for the FAA mechanic exams (airframe and powerplant, or "A&P"). None is in Davis or Weber County yet.'],
  funding: ['Paying for training', 'Grants, state help and free tuition that can lower what you pay.'],
};
const TRAINING_KEYS = ['id', 'section', 'name', 'provider', 'city', 'length', 'cost', 'credential', 'note', 'search', 'url', 'verified', 'sourceUrl'];
const isYearMonth = (s) => /^\d{4}-(0[1-9]|1[0-2])$/.test(s || '');

export function validateTraining(file, searchIndex = null) {
  const errors = [];
  if (!Array.isArray(file?.training)) return ['"training" must be a list'];
  if (!isYearMonth(file.checked)) errors.push('"checked" must be YYYY-MM');
  const seen = new Set();
  for (const t of file.training) {
    const at = `training "${t?.id}"`;
    for (const k of TRAINING_KEYS) if (!(k in (t || {}))) errors.push(`${at}: missing "${k}"`);
    for (const k of Object.keys(t || {})) if (!TRAINING_KEYS.includes(k)) errors.push(`${at}: unknown field "${k}"`);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(t?.id || '') || seen.has(t?.id)) errors.push(`${at}: missing, bad or duplicate id`);
    seen.add(t?.id);
    if (!(t?.section in TRAINING_SECTIONS)) errors.push(`${at}: unknown section "${t?.section}"`);
    if (!isText(t?.name, 80) || !isText(t?.provider, 100) || !isText(t?.city, 60)) errors.push(`${at}: name (≤80), provider (≤100) and city (≤60) are required`);
    for (const [k, max] of [['length', 60], ['cost', 60], ['credential', 110], ['note', 170], ['search', 30]]) {
      if (t?.[k] !== null && !isText(t?.[k], max)) errors.push(`${at}: "${k}" must be null or 1–${max} characters`);
    }
    if (!isHttps(t?.url) || !isHttps(t?.sourceUrl)) errors.push(`${at}: url and sourceUrl must be https`);
    if (!isYearMonth(t?.verified)) errors.push(`${at}: verified must be YYYY-MM`);
    // A "Hill jobs" link must lead somewhere: the term has to find employers by their researched roles.
    if (t?.search && searchIndex && !Object.keys(Search.search(searchIndex, t.search).results).length) {
      errors.push(`${at}: search "${t.search}" finds no employer`);
    }
  }
  for (const s of Object.keys(TRAINING_SECTIONS)) {
    if (!file.training.some((t) => t?.section === s)) errors.push(`section "${s}" has no entries`);
  }
  return errors;
}

function renderTrainingCard(t, prefix) {
  const id = `t-${t.id}`;
  const facts = [['Length', t.length], ['Cost', t.cost], ['Credential', t.credential]].filter(([, v]) => v);
  const jobs = t.search
    ? `<a class="train-jobs" href="${prefix}?q=${esc(encodeURIComponent(t.search))}">Hill jobs for “${esc(t.search)}” <span aria-hidden="true">→</span></a>\n`
    : '';
  return `<li><article class="res-card train-card" aria-labelledby="${esc(id)}">
<div class="card-top"><span class="kind">${esc(t.provider)}</span></div>
<h3 id="${esc(id)}">${esc(t.name)}</h3>
<dl class="res-facts"><div><dt>Where</dt><dd>${esc(t.city)}</dd></div>${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
${t.note ? `<p class="desc">${esc(t.note)}</p>\n` : ''}<div class="card-actions"><a class="btn-outline" href="${esc(t.url)}" target="_blank" rel="noopener">Visit website <span aria-hidden="true">→</span><span class="sr-only"> for ${esc(t.name)}, ${esc(t.provider)}</span>${NEW_TAB}</a>
${jobs}</div>
<p class="meta"><span>Checked ${verifiedLabel(t.verified)}</span></p>
</article></li>`;
}

/** The Get Trained page: one section per TRAINING_SECTIONS key, cards A–Z by provider, then name. */
export function renderTraining(site, template, file) {
  const root = site.siteUrl.replace(/\/$/, '');
  const prefix = '../';
  const byProvider = (a, b) => a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name);
  const sections = Object.entries(TRAINING_SECTIONS)
    .map(([key, [heading, intro]]) => {
      const list = file.training.filter((t) => t.section === key).sort(byProvider);
      return `  <section id="${key}" aria-labelledby="h-${key}">
    <h2 id="h-${key}" class="group-title">${esc(heading)} <span class="group-n">${list.length}</span></h2>
    <p class="note">${esc(intro)}</p>
    <ul class="res-grid">
${list.map((t) => renderTrainingCard(t, prefix)).join('\n')}
    </ul>
  </section>`;
    })
    .join('\n');
  const toc = Object.entries(TRAINING_SECTIONS)
    .map(([key, [heading]]) => `      <li><a href="#${key}">${esc(heading)}</a></li>`)
    .concat('      <li><a href="#more-paths">More paths into Hill</a></li>')
    .join('\n');
  return fill(template, {
    siteName: esc(site.siteName),
    analytics: renderAnalytics(site),
    canonical: esc(`${root}/get-trained/`),
    ogImage: esc(`${root}/assets/og.png`),
    count: String(file.training.length),
    checked: verifiedLabel(file.checked),
    toc,
    sections,
  });
}

// ---------- resume help + events ----------

export const RESOURCE_KINDS = {
  military: 'Military & family',
  state: 'State job center',
  veterans: 'Veterans',
  college: 'College career center',
  private: 'Private resume writer',
};

function renderResource(r) {
  const id = `r-${r.id}`;
  return `<li><article class="res-card" aria-labelledby="${esc(id)}">
<div class="card-top"><span class="badge badge-${r.cost}">${r.cost === 'free' ? 'Free' : 'Paid'}</span><span class="kind">${esc(RESOURCE_KINDS[r.kind])}</span></div>
<h3 id="${esc(id)}">${esc(r.name)}</h3>
<p class="desc">${esc(r.description)}</p>
<ul class="tags" aria-label="Services">${r.services.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
<dl class="res-facts"><div><dt>For</dt><dd>${esc(r.who)}</dd></div><div><dt>Where</dt><dd>${esc(r.city)}</dd></div></dl>
<div class="card-actions"><a class="btn-outline" href="${esc(r.url)}" target="_blank" rel="noopener">Visit website <span aria-hidden="true">→</span><span class="sr-only"> for ${esc(r.name)}</span>${NEW_TAB}</a></div>
<p class="meta"><span>Checked ${verifiedLabel(r.verified)}</span></p>
</article></li>`;
}

export function renderResourcesPanel(resources, prefix = './') {
  const free = resources.filter((r) => r.cost === 'free');
  const paid = resources.filter((r) => r.cost === 'paid');
  const byName = (a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base', numeric: true });
  return `<div class="panel-intro">
<h2 id="resume-heading">Resume Resources Near Hill</h2>
<p>Free resume resources are available at the base, state job centers and local colleges. They review and explain federal resumes and run workshops. Paid local resume professionals are listed after.</p>
<p>Applying for a federal job for the first time? Read <a href="${prefix}how-hiring-works/">how hiring at Hill works</a>: pay, clearances, getting on base and hiring preferences.</p>
</div>
<h3 class="group-title">Resources <span class="group-n">${free.length}</span></h3>
<ul class="res-grid">
${free.sort(byName).map(renderResource).join('\n')}
</ul>
<h3 class="group-title">Resume Professionals <span class="group-n">${paid.length}</span></h3>
<p class="note">Listed for convenience: Work At Hill doesn't endorse them, and nobody pays to be listed. Ask for samples (especially federal resumes) and check reviews before you buy.</p>
<ul class="res-grid">
${paid.sort(byName).map(renderResource).join('\n')}
</ul>`;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Sun, Nov 29, 2026 · 10:00 a.m." from "2026-11-29T10:00" (Mountain Time, as published). */
export function eventWhen(e) {
  const [y, m, d] = e.start.slice(0, 10).split('-').map(Number);
  const wd = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  let out = `${wd}, ${MONTHS[m - 1]} ${d}, ${y}`;
  const hm = e.start.slice(11, 16);
  if (!e.allDay && hm && hm !== '00:00') {
    let [h, min] = hm.split(':').map(Number);
    const ampm = h >= 12 ? 'p.m.' : 'a.m.';
    h = h % 12 || 12;
    out += ` · ${h}:${String(min).padStart(2, '0')} ${ampm}`;
  }
  return out;
}

function renderEvent(e) {
  const id = `ev-${e.id}`;
  const [, m, d] = e.start.slice(0, 10).split('-').map(Number);
  const where = [e.venue, e.city].filter(Boolean).join(', ');
  const repeats = e.moreDates ? ` <span class="ev-repeats">· repeats (${e.moreDates} more date${e.moreDates === 1 ? '' : 's'})</span>` : '';
  return `<li><article class="event-card" aria-labelledby="${esc(id)}">
<div class="ev-date" aria-hidden="true"><span class="ev-mon">${MONTHS[m - 1]}</span><span class="ev-day">${d}</span></div>
<div class="ev-body">
<span class="badge badge-ev badge-ev-${esc(e.type)}">${esc(EVENT_TYPES[e.type] || 'Event')}</span>
<h3 id="${esc(id)}">${esc(e.title)}</h3>
<p class="ev-when"><time datetime="${esc(e.start)}">${eventWhen(e)}</time>${repeats}</p>
${where ? `<p class="ev-where">${esc(where)}</p>` : ''}
<p class="ev-host">Listed by ${esc(e.host)}</p>
<a class="ev-link" href="${esc(e.url)}" target="_blank" rel="noopener">Event details <span aria-hidden="true">→</span><span class="sr-only"> for ${esc(e.title)}</span>${NEW_TAB}</a>
</div>
</article></li>`;
}

function renderAnnual(a) {
  return `<li><article class="annual-card" aria-labelledby="an-${esc(a.id)}">
<span class="badge badge-ev badge-ev-${esc(a.type)}">${esc(EVENT_TYPES[a.type] || 'Event')}</span>
<h3 id="an-${esc(a.id)}">${esc(a.title)}</h3>
<p class="annual-timing">${esc(a.timing)}</p>
<p class="ev-host">${esc(a.host)}</p>
<a class="ev-link" href="${esc(a.url)}" target="_blank" rel="noopener">Where it's announced <span aria-hidden="true">→</span><span class="sr-only"> for ${esc(a.title)}</span>${NEW_TAB}</a>
</article></li>`;
}

const MORE_CALENDARS = [
  ['Utah Workforce Services (jobs.utah.gov)', 'https://jobs.utah.gov/'],
  ['Air Force civilian hiring events', 'https://afciviliancareers.com/events/'],
  ['Utah Veterans and Military Affairs events', 'https://veterans.utah.gov/events/'],
  ['Layton City job-seeker news', 'https://lcecon.laytoncityutah.gov/tag/job-seekers/'],
  ['Weber State Career Services events', 'https://www.weber.edu/careerservices/events/'],
  ['Ogden-Weber Tech events', 'https://www.otech.edu/events/'],
];

export function renderEventsPanel(list, annual, checkedLabel) {
  const upcomingHtml = list.length
    ? `<ul class="event-list">\n${list.map(renderEvent).join('\n')}\n</ul>`
    : `<p class="empty-note">No dated events are posted right now. The yearly events below are the ones to watch for.</p>`;
  return `<div class="panel-intro">
<h2 id="events-heading">Job Fairs, Workshops and Meet-and-Greets</h2>
<p>Events at Hill AFB and in Northern Utah. Dates and details come from each host; check the event page before you go.</p>
</div>
<h3 class="group-title">Coming up <span class="group-n">${list.length}</span></h3>
${upcomingHtml}
<h3 class="group-title">Yearly events to watch for</h3>
<ul class="annual-grid">
${annual.map(renderAnnual).join('\n')}
</ul>
<h3 class="group-title">More event calendars</h3>
<ul class="more-cal">
${MORE_CALENDARS.map(([label, url]) => `<li><a href="${esc(url)}" target="_blank" rel="noopener">${esc(label)}${NEW_TAB}</a></li>`).join('\n')}
</ul>
<p class="fine-print">${esc(checkedLabel)}</p>`;
}

export function renderNextUp(list) {
  const items = list.slice(0, 3).map((e) => {
    const [, m, d] = e.start.slice(0, 10).split('-').map(Number);
    const where = (e.city || '').replace(/,\s*(UT|Utah)$/i, '');
    return `<li><a href="${esc(e.url)}" target="_blank" rel="noopener"><span class="nu-date">${MONTHS[m - 1]} ${d}</span><span class="nu-title">${esc(e.title)}</span><span class="nu-where">${esc([where, EVENT_TYPES[e.type] || 'Event'].filter(Boolean).join(' · '))}</span>${NEW_TAB}</a></li>`;
  });
  const body = items.length
    ? `<ul class="next-up-list">${items.join('')}</ul>`
    : `<p class="next-up-empty">No dated events right now. Yearly job fairs are listed under Events.</p>`;
  return `<aside class="next-up wrap" aria-labelledby="next-up-heading">
<div class="next-up-head"><h2 id="next-up-heading">Upcoming events</h2><a class="next-up-all" href="#events" data-tab-link="events">All events <span aria-hidden="true">→</span></a></div>
${body}
</aside>`;
}

const RESOURCE_KEYS = ['id', 'name', 'cost', 'kind', 'description', 'services', 'who', 'city', 'url', 'verified', 'sourceUrl'];
const isHttps = (u) => typeof u === 'string' && /^https:\/\/\S+$/.test(u);
const isText = (s, max) => typeof s === 'string' && s.trim().length > 0 && s.length <= max;

export function validateResources(file) {
  const errors = [];
  const seen = new Set();
  if (!Array.isArray(file?.resources)) return ['"resources" must be a list'];
  for (const r of file.resources) {
    const at = `resource "${r?.id}"`;
    for (const k of RESOURCE_KEYS) if (!(k in (r || {}))) errors.push(`${at}: missing "${k}"`);
    for (const k of Object.keys(r || {})) if (!RESOURCE_KEYS.includes(k)) errors.push(`${at}: unknown field "${k}"`);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(r?.id || '')) errors.push(`${at}: bad id`);
    if (seen.has(r?.id)) errors.push(`${at}: duplicate id`);
    seen.add(r?.id);
    if (!['free', 'paid'].includes(r?.cost)) errors.push(`${at}: cost must be "free" or "paid"`);
    if (!(r?.kind in RESOURCE_KINDS)) errors.push(`${at}: unknown kind "${r?.kind}"`);
    if (!isText(r?.name, 80)) errors.push(`${at}: name must be 1–80 characters`);
    if (!isText(r?.description, 160)) errors.push(`${at}: description must be 1–160 characters`);
    if (!isText(r?.who, 100) || !isText(r?.city, 40)) errors.push(`${at}: "who" (≤100) and "city" (≤40) are required`);
    if (!Array.isArray(r?.services) || r.services.length < 1 || r.services.length > 6 || !r.services.every((x) => isText(x, 40))) errors.push(`${at}: 1–6 services, each ≤40 characters`);
    if (!isHttps(r?.url) || !isHttps(r?.sourceUrl)) errors.push(`${at}: url and sourceUrl must be https`);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(r?.verified || '')) errors.push(`${at}: verified must be YYYY-MM`);
  }
  return errors;
}

export function validateEvents(file, sourcesFile) {
  const errors = [];
  const types = Object.keys(EVENT_TYPES);
  if (!Array.isArray(file?.events) || !Array.isArray(file?.annual)) return ['"events" and "annual" must be lists'];
  const ids = new Set();
  for (const e of file.events) {
    const at = `event "${e?.id}"`;
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(e?.id || '') || ids.has(e.id)) errors.push(`${at}: missing, bad or duplicate id`);
    ids.add(e?.id);
    if (!isText(e?.title, 120)) errors.push(`${at}: title must be 1–120 characters`);
    if (!types.includes(e?.type)) errors.push(`${at}: type must be one of ${types.join(', ')}`);
    if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(e?.start || '')) errors.push(`${at}: start must be YYYY-MM-DD or YYYY-MM-DDTHH:MM`);
    if (e?.end != null && !/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(e.end)) errors.push(`${at}: bad end`);
    if (!isText(e?.city, 60) || !isText(e?.host, 80)) errors.push(`${at}: city and host are required`);
    if (!isHttps(e?.url) || !isHttps(e?.sourceUrl)) errors.push(`${at}: url and sourceUrl must be https`);
  }
  for (const a of file.annual) {
    const at = `annual "${a?.id}"`;
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(a?.id || '') || ids.has(a.id)) errors.push(`${at}: missing, bad or duplicate id`);
    ids.add(a?.id);
    if (!types.includes(a?.type)) errors.push(`${at}: bad type`);
    if (!isText(a?.title, 120) || !isText(a?.timing, 160) || !isText(a?.host, 80)) errors.push(`${at}: title, timing and host are required`);
    if (!isHttps(a?.url) || !isHttps(a?.sourceUrl)) errors.push(`${at}: url and sourceUrl must be https`);
  }
  try {
    new RegExp(sourcesFile?.keywords || '');
  } catch {
    errors.push('event-sources.json: keywords is not a valid pattern');
  }
  for (const src of sourcesFile?.sources || []) {
    if (src.type !== 'tribe' || !isHttps(src.base) || !src.id || !src.name) errors.push(`event-sources.json: source "${src.id}" needs id, name, type "tribe" and an https base`);
  }
  return errors;
}

export function renderBase(baseId, base, allEmployers, site, template, jobCounts = null, synonyms = null, careerTitles = null, extras = {}) {
  const employers = allEmployers
    .filter((e) => e.base === baseId)
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base', numeric: true }));
  const depth = base.path.split('/').filter(Boolean).length;
  const prefix = depth ? '../'.repeat(depth) : './';
  const { typeChips, catChips } = renderChips(employers);
  const add = listingLink(site, prefix, 'add');
  const recruiterLink = add
    ? `<a class="recruiter" href="${esc(add.href)}"${add.newTab ? ' target="_blank" rel="noopener"' : ''}>Recruiter? Add or update your company${add.newTab ? NEW_TAB : ''}</a>`
    : '';
  const canonical = site.siteUrl.replace(/\/$/, '') + base.path;
  const description = `${countText(employers.length)} hiring at ${base.name}, ${base.state}: defense contractors and federal employers, with direct links to each careers page.`;
  const moreWays = renderMoreWays(extras.programs || []);
  return fill(template, {
    analytics: renderAnalytics(site),
    title: esc(`${site.siteName}: who's hiring at ${base.name}`),
    description: esc(description),
    canonical: esc(canonical),
    ogImage: esc(site.siteUrl.replace(/\/$/, '') + '/assets/og.png'),
    prefix,
    siteName: esc(site.siteName),
    baseName: esc(base.name),
    baseLabel: esc(`${base.name}, ${STATE_NAMES[base.state] || base.state}`),
    count: countText(employers.length),
    total: String(employers.length),
    recruiterLink,
    alertBox: renderAlertBox(site, prefix),
    signupFooter: renderSignupFooter(site, prefix),
    contactForm: renderContact(site, prefix),
    typeChips,
    catChips,
    cards: employers.map((e) => renderCard(e, site, jobCounts, 'h2', prefix)).join('\n'),
    searchData: searchData(employers, synonyms, jobCounts, careerTitles),
    resourceCount: String((extras.resources || []).length),
    eventCount: String((extras.events || []).length),
    nextUp: renderNextUp(extras.events || []),
    resourcesPanel: renderResourcesPanel(extras.resources || [], prefix),
    moreWays: moreWays.section,
    moreWaysEmptyLink: moreWays.emptyLink,
    moreWaysFooterLink: moreWays.footerLink,
    eventsPanel: renderEventsPanel(extras.events || [], extras.annual || [], extras.eventsChecked || ''),
  });
}

const SOURCE_TYPES = ['eightfold', 'workday', 'phenom', 'workable', 'applicantpro', 'es3', 'radancy-sitemap'];

export function validateJobSources(cfg, data) {
  const errors = [];
  const ids = new Set(data.employers.map((e) => e.id));
  for (const [id, src] of Object.entries(cfg?.sources || {})) {
    if (!ids.has(id)) errors.push(`"${id}" is not an employer id`);
    if (!SOURCE_TYPES.includes(src?.type)) errors.push(`"${id}": unknown type "${src?.type}"`);
    const fed = data.employers.find((e) => e.id === id)?.type === 'federal';
    if (fed) errors.push(`"${id}" is federal; federal titles come from USAJOBS`);
  }
  for (const id of Object.keys(cfg?.skipped || {})) {
    if (!ids.has(id)) errors.push(`skipped "${id}" is not an employer id`);
    if (cfg.sources?.[id]) errors.push(`"${id}" is both a source and skipped`);
  }
  return errors;
}

export function validatePlaces(p) {
  const errors = [];
  for (const key of ['hillNames', 'places', 'state']) {
    if (!Array.isArray(p?.[key]) || !p[key].length || p[key].some((x) => typeof x !== 'string' || !x.trim())) errors.push(`"${key}" must be a non-empty list of names`);
  }
  return errors;
}

// ---------- main ----------

async function main() {
  const argv = process.argv.slice(2);
  const checkOnly = argv.includes('--check');
  const outArg = argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : null;
  const DIST = outArg ? path.resolve(outArg) : path.join(ROOT, 'dist');
  const [data, schema, site, synonyms, jobSources, places, resourcesFile, eventsFile, eventSources, programsFile, trainingFile] = await Promise.all([
    readJson('data/employers.json'),
    readJson('data/employers.schema.json'),
    // --site FILE swaps in other site settings (e.g. to preview the email signup before setup).
    argv.includes('--site') ? JSON.parse(await readFile(path.resolve(argv[argv.indexOf('--site') + 1]), 'utf8')) : readJson('data/site.json'),
    readJson('data/synonyms.json'),
    readJson('data/job-sources.json'),
    readJson('data/locations.json'),
    readJson('data/resources.json'),
    readJson('data/events.json'),
    readJson('data/event-sources.json'),
    readJson('data/programs.json'),
    readJson('data/training.json'),
  ]);
  const rolesIndex = Search.createIndex(
    data.employers.map((e) => ({ id: e.id, name: e.name, description: e.description, roles: e.roles || [], titles: [] })),
    synonyms,
  );

  const errors = [
    ...validateData(data, schema),
    ...Search.validateSynonyms(synonyms).map((e) => `synonyms.json: ${e}`),
    ...validateJobSources(jobSources, data).map((e) => `job-sources.json: ${e}`),
    ...validatePlaces(places).map((e) => `locations.json: ${e}`),
    ...validateResources(resourcesFile).map((e) => `resources.json: ${e}`),
    ...validatePrograms(programsFile).map((e) => `programs.json: ${e}`),
    ...validateTraining(trainingFile, rolesIndex).map((e) => `training.json: ${e}`),
    ...validateEvents(eventsFile, eventSources).map((e) => `events.json: ${e}`),
    ...validateNewsletter(site).map((e) => `site.json newsletter: ${e}`),
    ...validateContact(site).map((e) => `site.json contact: ${e}`),
    ...validateAnalytics(site).map((e) => `site.json: ${e}`),
    ...validateIndexNow(site).map((e) => `site.json: ${e}`),
  ];
  if (errors.length) {
    console.error(`✗ ${errors.length} data error(s):\n  - ${errors.join('\n  - ')}`);
    process.exit(1);
  }
  console.log(`✓ data valid: ${data.employers.length} employers, ${Object.keys(data.bases).length} base(s)`);
  if (checkOnly) return;

  const template = await readFile(path.join(ROOT, 'templates/base.html'), 'utf8');
  // USAJOBS counts. Any failure here only drops the counts; it never stops the build.
  let jobCounts = null;
  if (!argv.includes('--no-counts')) {
    try {
      const envFile = path.join(ROOT, '.env');
      if (existsSync(envFile)) process.loadEnvFile(envFile); // existing env vars (CI secrets) win
      jobCounts = await fetchUsajobs(data.employers, {
        key: process.env.USAJOBS_API_KEY,
        email: process.env.USAJOBS_EMAIL,
        apiUrl: process.env.USAJOBS_API_URL || undefined, // tests point this at a local fake API
      });
      if (jobCounts) {
        const got = Object.keys(jobCounts.counts).length;
        const titled = Object.values(jobCounts.titles).reduce((n, t) => n + t.length, 0);
        if (got) console.log(`✓ USAJOBS counts: ${got}/${jobCounts.eligible} (checked ${jobCounts.checkedAt}), ${titled} job titles`);
        else console.warn(`WARN: USAJOBS counts: 0/${jobCounts.eligible}, building without counts`);
      }
    } catch (err) {
      console.warn(`WARN: USAJOBS counts failed (${err?.name || 'error'}), building without counts`);
      jobCounts = null;
    }
  }

  // Contractor job titles from careers sites (Hill AFB + Northern Utah only). Never stops the build.
  let careerTitles = null;
  if (!argv.includes('--no-careers')) {
    try {
      const r = await fetchCareers(jobSources, places);
      careerTitles = r.titles;
      const ok = Object.keys(r.titles).length;
      const total = Object.values(r.titles).reduce((n, t) => n + t.length, 0);
      const all = Object.keys(jobSources.sources).length;
      console.log(`${ok === all ? '✓' : 'WARN:'} Contractor job titles: ${ok}/${all} sources, ${total} titles near Hill`);
    } catch (err) {
      console.warn(`WARN: contractor job titles failed (${err?.name || 'error'}), building without them`);
    }
  }

  // Events: curated ones plus job-related events read from public calendars. Never stops the build.
  const today = mountainDate(new Date());
  let pulled = [];
  let eventsChecked = 'Only Hand-Picked Events Shown';
  if (!argv.includes('--no-events')) {
    try {
      const r = await fetchEvents(eventSources, places, { today });
      pulled = r.events;
      const ok = eventSources.sources.length - Object.keys(r.failed).length;
      eventsChecked = `Event calendars last checked ${dateLabel(today)}.`;
      console.log(`${ok === eventSources.sources.length ? '✓' : 'WARN:'} Event calendars: ${ok}/${eventSources.sources.length} read, ${pulled.length} job-related events nearby`);
    } catch (err) {
      console.warn(`WARN: event calendars failed (${err?.name || 'error'}), showing curated events only`);
    }
  }
  const curated = eventsFile.events.map((e) => ({ ...e, start: e.start, end: e.end || null, allDay: !/T/.test(e.start), venue: e.venue || '' }));
  const eventList = upcoming([...curated, ...pulled], today);
  const extras = { resources: resourcesFile.resources, events: eventList, annual: eventsFile.annual, eventsChecked, programs: programsFile.programs };

  if (!contactReady(site) && !site.form) console.warn('WARN: no contact.web3formsKey or "form" config in data/site.json; "Suggest a change" and recruiter links are left out.');
  if (!contactReady(site)) console.warn('WARN: data/site.json has no contact.web3formsKey; the Let\'s Connect form is left out.');
  if (!newsletterReady(site)) console.warn('WARN: data/site.json newsletter settings are not filled in; email signup forms are left out.');

  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });
  await cp(path.join(ROOT, 'assets'), path.join(DIST, 'assets'), { recursive: true });
  await cp(path.join(ROOT, 'CNAME'), path.join(DIST, 'CNAME'));
  await writeFile(path.join(DIST, '.nojekyll'), '');

  const gz = async (rel) => gzipSync(await readFile(path.join(DIST, rel))).length;
  const sharedAssets = ['assets/styles.css', 'assets/search.js', 'assets/app.js', 'assets/favicon.svg'];
  let failed = false;
  for (const [id, base] of Object.entries(data.bases)) {
    const html = withSecurityMeta(renderBase(id, base, data.employers, site, template, jobCounts, synonyms, careerTitles, extras));
    const dir = path.join(DIST, base.path);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'index.html'), html);
    const rel = path.join(base.path, 'index.html').replace(/^\//, '');
    const sizes = [gzipSync(html).length, ...(await Promise.all(sharedAssets.map(gz)))];
    const total = sizes.reduce((a, b) => a + b, 0);
    const kb = (total / 1024).toFixed(1);
    if (total > BUDGET_BYTES) {
      console.error(`✗ ${rel}: ${kb} KB gzipped, over the 100 KB budget`);
      failed = true;
    } else {
      console.log(`✓ wrote ${path.relative(ROOT, path.join(DIST, rel)) || rel} (${kb} KB gzipped incl. css/js/favicon)`);
    }
  }
  // Privacy page (always: it also covers what browsing collects, which is nothing).
  const privacyTemplate = await readFile(path.join(ROOT, 'templates/privacy.html'), 'utf8');
  await mkdir(path.join(DIST, 'privacy'), { recursive: true });
  await writeFile(path.join(DIST, 'privacy', 'index.html'), withSecurityMeta(renderPrivacy(site, privacyTemplate)));

  // Employer Directory: every Hill employer on one page, grouped by type.
  const dirTemplate = await readFile(path.join(ROOT, 'templates/employers.html'), 'utf8');
  await mkdir(path.join(DIST, 'employers'), { recursive: true });
  await writeFile(path.join(DIST, 'employers', 'index.html'), withSecurityMeta(renderDirectory('hill', data.bases.hill, data.employers, site, dirTemplate, jobCounts, synonyms, careerTitles)));

  // Thank-you page the contact form returns to when JavaScript is off.
  const thanksTemplate = await readFile(path.join(ROOT, 'templates/thanks.html'), 'utf8');
  await mkdir(path.join(DIST, 'thanks'), { recursive: true });
  await writeFile(path.join(DIST, 'thanks', 'index.html'), withSecurityMeta(renderThanks(site, thanksTemplate)));

  // "How hiring at Hill works" guide (every fact sourced; see data/GUIDE-SOURCES.md).
  const guideTemplate = await readFile(path.join(ROOT, 'templates/guide.html'), 'utf8');
  await mkdir(path.join(DIST, 'how-hiring-works'), { recursive: true });
  await writeFile(path.join(DIST, 'how-hiring-works', 'index.html'), withSecurityMeta(renderGuide(site, guideTemplate)));

  // Get Trained: schools, apprenticeships and funding for trades jobs (evidence in data/TRAINING-REVIEW.md).
  const trainingTemplate = await readFile(path.join(ROOT, 'templates/training.html'), 'utf8');
  await mkdir(path.join(DIST, 'get-trained'), { recursive: true });
  await writeFile(path.join(DIST, 'get-trained', 'index.html'), withSecurityMeta(renderTraining(site, trainingTemplate, trainingFile)));

  // About / For recruiters: who runs the site, how listings work, and the listing request form.
  const aboutTemplate = await readFile(path.join(ROOT, 'templates/about.html'), 'utf8');
  await mkdir(path.join(DIST, 'about'), { recursive: true });
  const hillCount = data.employers.filter((e) => e.base === 'hill').length;
  await writeFile(path.join(DIST, 'about', 'index.html'), withSecurityMeta(renderAbout(site, aboutTemplate, hillCount)));

  // Sitemap and robots.txt for search engines (indexable pages only; /thanks/ is noindex).
  await writeFile(path.join(DIST, 'sitemap.xml'), renderSitemap(site, data.bases, today));
  await writeFile(path.join(DIST, 'robots.txt'), renderRobots(site));
  console.log(`✓ wrote sitemap.xml (${sitemapPaths(data.bases).length} pages) and robots.txt`);
  const keyFile = indexNowKeyFile(site);
  if (keyFile) {
    await writeFile(path.join(DIST, keyFile.name), keyFile.body);
    console.log(`✓ wrote IndexNow key file /${keyFile.name}`);
  }

  // Snapshot for the weekly email: this build's live job titles and upcoming events.
  const snapshotOut = argv.includes('--snapshot') ? argv[argv.indexOf('--snapshot') + 1] : null;
  if (snapshotOut) {
    const snapshot = {
      date: today,
      employers: data.employers
        .filter((e) => e.base === 'hill')
        .map((e) => ({ id: e.id, name: e.name, jobsUrl: e.jobsUrl, titles: jobCounts?.titles?.[e.id] || careerTitles?.[e.id] || [] })),
      events: eventList.map(({ title, start, city, type, url }) => ({ title, start, city, type, url })),
    };
    await writeFile(path.resolve(snapshotOut), JSON.stringify(snapshot, null, 1));
    console.log(`✓ wrote snapshot ${snapshotOut}`);
  }
  if (failed) process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
