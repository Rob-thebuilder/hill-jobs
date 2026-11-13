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

function renderCard(e, form, jobCounts) {
  const typeLabel = LABELS.types[e.type];
  const catLabels = e.categories.map((c) => LABELS.categories[c]);
  const suggest = formUrl(form, form?.fixValue, e.name);
  return `<li><article class="card" data-type="${esc(e.type)}" data-cats="${esc(e.categories.join(' '))}" data-id="${esc(e.id)}" aria-labelledby="e-${esc(e.id)}">
<div class="card-top"><span class="badge badge-${esc(e.type)}">${esc(typeLabel)}</span></div>
<h2 id="e-${esc(e.id)}">${esc(e.name)}</h2>
<p class="desc">${esc(e.description)}</p>
<ul class="tags" aria-label="Job categories">${catLabels.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
<p class="why" hidden></p>
<div class="card-actions">
${openJobsLine(e.id, jobCounts)}<a class="btn-jobs" href="${esc(e.jobsUrl)}" target="_blank" rel="noopener">View jobs <span aria-hidden="true">→</span><span class="sr-only"> at ${esc(e.name)}</span>${NEW_TAB}</a>
${e.secondaryUrl ? `<a class="link-secondary" href="${esc(e.secondaryUrl)}" target="_blank" rel="noopener">${e.type === 'federal' ? 'Agency hiring page' : 'More openings'}<span class="sr-only"> for ${esc(e.name)}</span>${NEW_TAB}</a>` : ''}
</div>
<p class="meta"><span>Link verified ${verifiedLabel(e.verified)}</span>${suggest ? `<a href="${esc(suggest)}" target="_blank" rel="noopener">Suggest a change<span class="sr-only"> for ${esc(e.name)}</span>${NEW_TAB}</a>` : ''}</p>
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

export function renderPrivacy(site, template) {
  const n = site.newsletter;
  const contact = n?.postalAddress ? `Work At Hill, ${n.postalAddress}` : 'A contact address will be posted here when the weekly email starts.';
  return fill(template, {
    siteName: esc(site.siteName),
    canonical: esc(site.siteUrl.replace(/\/$/, '') + '/privacy/'),
    postalAddress: esc(contact),
  });
}

export function renderGuide(site, template) {
  const root = site.siteUrl.replace(/\/$/, '');
  return fill(template, {
    siteName: esc(site.siteName),
    canonical: esc(`${root}/how-hiring-works/`),
    ogImage: esc(`${root}/assets/og.png`),
  });
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
<h2 id="events-heading">Job fairs, workshops and meet-and-greets</h2>
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
  const addUrl = formUrl(site.form, site.form?.addValue);
  const recruiterLink = addUrl
    ? `<a class="recruiter" href="${esc(addUrl)}" target="_blank" rel="noopener">Recruiter? Add or update your company${NEW_TAB}</a>`
    : '';
  const canonical = site.siteUrl.replace(/\/$/, '') + base.path;
  const description = `${countText(employers.length)} hiring at ${base.name}, ${base.state}: defense contractors and federal employers, with direct links to each careers page.`;
  const moreWays = renderMoreWays(extras.programs || []);
  return fill(template, {
    title: esc(`${site.siteName}: who's hiring at ${base.name}`),
    description: esc(description),
    canonical: esc(canonical),
    ogImage: esc(site.siteUrl.replace(/\/$/, '') + '/assets/og.png'),
    prefix,
    siteName: esc(site.siteName),
    baseName: esc(base.name),
    count: countText(employers.length),
    total: String(employers.length),
    recruiterLink,
    alertBox: renderAlertBox(site, prefix),
    signupFooter: renderSignupFooter(site, prefix),
    typeChips,
    catChips,
    cards: employers.map((e) => renderCard(e, site.form, jobCounts)).join('\n'),
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
  const [data, schema, site, synonyms, jobSources, places, resourcesFile, eventsFile, eventSources, programsFile] = await Promise.all([
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
  ]);

  const errors = [
    ...validateData(data, schema),
    ...Search.validateSynonyms(synonyms).map((e) => `synonyms.json: ${e}`),
    ...validateJobSources(jobSources, data).map((e) => `job-sources.json: ${e}`),
    ...validatePlaces(places).map((e) => `locations.json: ${e}`),
    ...validateResources(resourcesFile).map((e) => `resources.json: ${e}`),
    ...validatePrograms(programsFile).map((e) => `programs.json: ${e}`),
    ...validateEvents(eventsFile, eventSources).map((e) => `events.json: ${e}`),
    ...validateNewsletter(site).map((e) => `site.json newsletter: ${e}`),
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

  if (!site.form) console.warn('WARN: data/site.json has no "form" config; "Suggest a change" and recruiter links are left out.');
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
    const html = renderBase(id, base, data.employers, site, template, jobCounts, synonyms, careerTitles, extras);
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
  await writeFile(path.join(DIST, 'privacy', 'index.html'), renderPrivacy(site, privacyTemplate));

  // "How hiring at Hill works" guide (every fact sourced; see data/GUIDE-SOURCES.md).
  const guideTemplate = await readFile(path.join(ROOT, 'templates/guide.html'), 'utf8');
  await mkdir(path.join(DIST, 'how-hiring-works'), { recursive: true });
  await writeFile(path.join(DIST, 'how-hiring-works', 'index.html'), renderGuide(site, guideTemplate));

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
