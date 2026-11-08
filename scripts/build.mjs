// Validates data/employers.json, then renders one static page per base into dist/.
// Node built-ins only. Usage: node scripts/build.mjs [--check] [--no-counts] [--no-careers] [--out DIR]
//   --check      validate only (no network, no output)
//   --no-counts  skip the USAJOBS open-job counts and titles
//   --no-careers skip the contractor careers-site job titles
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

export function renderBase(baseId, base, allEmployers, site, template, jobCounts = null, synonyms = null, careerTitles = null) {
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
    typeChips,
    catChips,
    cards: employers.map((e) => renderCard(e, site.form, jobCounts)).join('\n'),
    searchData: searchData(employers, synonyms, jobCounts, careerTitles),
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
  const [data, schema, site, synonyms, jobSources, places] = await Promise.all([
    readJson('data/employers.json'),
    readJson('data/employers.schema.json'),
    readJson('data/site.json'),
    readJson('data/synonyms.json'),
    readJson('data/job-sources.json'),
    readJson('data/locations.json'),
  ]);

  const errors = [
    ...validateData(data, schema),
    ...Search.validateSynonyms(synonyms).map((e) => `synonyms.json: ${e}`),
    ...validateJobSources(jobSources, data).map((e) => `job-sources.json: ${e}`),
    ...validatePlaces(places).map((e) => `locations.json: ${e}`),
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

  if (!site.form) console.warn('WARN: data/site.json has no "form" config; "Suggest a change" and recruiter links are left out.');

  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });
  await cp(path.join(ROOT, 'assets'), path.join(DIST, 'assets'), { recursive: true });
  await cp(path.join(ROOT, 'CNAME'), path.join(DIST, 'CNAME'));
  await writeFile(path.join(DIST, '.nojekyll'), '');

  const gz = async (rel) => gzipSync(await readFile(path.join(DIST, rel))).length;
  const sharedAssets = ['assets/styles.css', 'assets/search.js', 'assets/app.js', 'assets/favicon.svg'];
  let failed = false;
  for (const [id, base] of Object.entries(data.bases)) {
    const html = renderBase(id, base, data.employers, site, template, jobCounts, synonyms, careerTitles);
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
  if (failed) process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
