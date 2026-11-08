import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const Search = createRequire(import.meta.url)('../assets/search.js');
const read = async (rel) => JSON.parse(await readFile(new URL(`../${rel}`, import.meta.url), 'utf8'));
const data = await read('data/employers.json');
const synonyms = await read('data/synonyms.json');

// Same entries the page builds (live USAJOBS titles are left out so results are repeatable).
const index = Search.createIndex(
  data.employers.map((e) => ({ id: e.id, name: e.name, description: e.description, roles: e.roles, titles: [] })),
  synonyms,
);
const nameOf = Object.fromEntries(data.employers.map((e) => [e.id, e.name]));
const run = (q, idx = index) => Search.search(idx, q).results;
const ids = (q, idx) => Object.keys(run(q, idx)).sort();

// ---------- the five example searches ----------

const EXAMPLES = ['painter', 'coater', 'LO', 'networking', 'admin'];

test('example searches: each finds employers, and the results are printed', (t) => {
  for (const q of EXAMPLES) {
    const results = run(q);
    const lines = Object.entries(results).map(([id, r]) => `    ${nameOf[id]} (${Search.explain(r.reasons) || 'name'})`);
    t.diagnostic(`"${q}" → ${lines.length} employer${lines.length === 1 ? '' : 's'}`);
    for (const line of lines) t.diagnostic(line);
    assert.ok(lines.length >= 1, `"${q}" found nothing`);
  }
});

test('"painter", "coater" and "LO" find the same employers (LO is a painting/coating trade)', () => {
  assert.deepEqual(ids('painter'), ids('coater'));
  assert.deepEqual(ids('LO'), ids('painter'));
  assert.deepEqual(ids('low observable'), ids('painter'));
});

test('"LO" never matches through "Lockheed", "logistics" or other words starting with "lo"', () => {
  const results = run('LO');
  assert.ok(Object.keys(results).length >= 1);
  for (const [id, r] of Object.entries(results)) {
    for (const reason of r.reasons) {
      assert.ok(reason.kind === 'role' || reason.kind === 'title', `${id} matched LO through its ${reason.kind}`);
      assert.match(reason.text, /\bLO\b|low[\s-]observables?|paint|coat/i, `${id}: ${reason.text}`);
    }
  }
});

test('every example result explains itself with a role', () => {
  for (const q of EXAMPLES) {
    for (const [id, r] of Object.entries(run(q))) {
      assert.match(Search.explain(r.reasons), /^Matches: /, `"${q}" → ${id} has no explanation`);
    }
  }
});

// ---------- matching rules ----------

const mini = (roles, extra = {}) =>
  Search.createIndex([{ id: 'x', name: extra.name || 'Acme', description: extra.description || '', roles, titles: extra.titles || [] }], synonyms);
const hits = (q, roles, extra) => 'x' in run(q, mini(roles, extra));

test('short terms match whole words only', () => {
  assert.equal(hits('lo', ['Logistics analyst'], { name: 'Lockheed', description: 'located near Hill' }), false);
  assert.equal(hits('lo', ['LO technician']), true);
  assert.equal(hits('it', ['Analyst'], { description: 'its own shop' }), false);
  assert.equal(hits('it', ['IT specialist']), true);
});

test('longer terms match the start of words; no matches inside words', () => {
  assert.equal(hits('mech', ['Aircraft mechanic']), true);
  assert.equal(hits('eing', ['Engineer'], { name: 'Boeing' }), false);
  assert.equal(hits('boe', [], { name: 'Boeing' }), true);
});

test('synonyms work in both directions, including phrases', () => {
  assert.equal(hits('coater', ['Aircraft painter']), true);
  assert.equal(hits('painter', ['Aerospace coater']), true);
  assert.equal(hits('low observable', ['LO technician']), true);
  assert.equal(hits('LO', ['Low observable restoration']), true);
  assert.equal(hits('networking', ['Cybersecurity analyst']), true);
  assert.equal(hits('admin', ['Office automation clerk']), true);
  assert.equal(hits('A&P', ['Airframe and powerplant mechanic']), true);
});

test('synonym words match whole words (plural s allowed), not word starts', () => {
  assert.equal(hits('admin', ['Commissary officer']), false); // "office" must not match "officer"
  assert.equal(hits('admin', ['IT systems administrator']), false);
  assert.equal(hits('coatings', ['LO coating specialist']), true);
  assert.equal(hits('network', ['Networks engineer']), true);
});

test('synonyms only expand into roles and job titles, not names or descriptions', () => {
  assert.equal(hits('admin', ['Engineer'], { description: 'Supports the F-16 program office' }), false);
  assert.equal(hits('office', ['Engineer'], { description: 'Supports the F-16 program office' }), true); // the literal word still matches
  assert.equal(hits('networking', ['Engineer'], { titles: ['IT specialist (INFOSEC)'] }), true);
});

test('category labels are not searched', () => {
  const dlaId = 'dla-hill';
  const r = run('Admin & Business');
  assert.ok(!(dlaId in r) || r[dlaId].reasons.every((x) => x.kind !== 'category'));
  assert.equal(hits('Software', ['Engineer']), false);
});

test('accents, case, "A&P" and "F-35" are normalized', () => {
  assert.equal(hits('BÔEING', [], { name: 'Boeing' }), true);
  assert.equal(hits('a&p', ['A&P mechanic']), true);
  assert.equal(hits('F-35', ['Aircraft mechanic (F-35)']), true);
  assert.equal(hits('F-35', ['F-16 engineer'], { description: 'paint booth 35 feet' }), false); // "F-35" is one phrase
});

test('"sheetmetal" written as one word finds sheet metal jobs', () => {
  assert.deepEqual(ids('sheetmetal'), ids('sheet metal'));
  assert.ok(ids('sheetmetal').length >= 1);
});

test('every query part must match (AND)', () => {
  assert.equal(hits('sheet metal', ['Sheet metal mechanic']), true);
  assert.equal(hits('sheet painter', ['Sheet metal mechanic']), false);
});

test('explanations: one role that covers the whole query wins; names need none', () => {
  const r = run('lo tech', mini(['Structures technician', 'LO coatings technician']));
  assert.equal(Search.explain(r.x.reasons), 'Matches: LO coatings technician');
  assert.equal(Search.explain(run('acme', mini(['Welder'])).x.reasons), '');
  assert.equal(Search.explain(run('booth', mini(['Welder'], { description: 'paint booth' })).x.reasons), 'Matches: description');
  assert.equal(Search.explain(run('mech', mini([], { titles: ['Aircraft mechanic'] })).x.reasons), 'Matches: open job “Aircraft mechanic”');
});

test('empty query matches everything with no explanation', () => {
  const r = run('   ');
  assert.equal(Object.keys(r).length, data.employers.length);
  assert.ok(Object.values(r).every((x) => x.reasons.length === 0));
});

// ---------- synonyms file ----------

test('synonyms.json is valid, and bad files are caught', () => {
  assert.deepEqual(Search.validateSynonyms(synonyms), []);
  assert.ok(Search.validateSynonyms({}).length);
  assert.match(Search.validateSynonyms({ groups: [['paint', 'coat'], ['coat', 'seal']] }).join(), /more than one group/);
  assert.match(Search.validateSynonyms({ groups: [['Paint', 'coat']] }).join(), /lowercase/);
  assert.match(Search.validateSynonyms({ groups: [['paint']] }).join(), /at least 2/);
});
