// Automated phone checks from SPEC §12, run against dist/ in headless Chrome.
// Node 22+ built-ins only (http, zlib, child_process, global WebSocket).
// Usage: node scripts/build.mjs && node scripts/verify-page.mjs
//   CHROME=/path/to/chrome to override the browser location.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { LABELS } from './build.mjs';
import { createRequire } from 'node:module';
import { launchChrome } from './lib/chrome.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- results ----------
let failures = 0;
function check(name, ok, detail = '') {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

// ---------- oracle: expected results computed from the data, not the page ----------
const data = JSON.parse(await readFile(path.join(ROOT, 'data/employers.json'), 'utf8'));
const hill = data.employers.filter((e) => e.base === 'hill');
// Expected results use the shared search engine (unit-tested in test/search.test.mjs) over the
// search data embedded in the built page, so live USAJOBS titles are included.
const Search = createRequire(import.meta.url)('../assets/search.js');
const builtHtml = await readFile(path.join(DIST, 'index.html'), 'utf8').catch(() => '');
const embedded = builtHtml.match(/<script type="application\/json" id="search-data">([\s\S]*?)<\/script>/);
const searchIndex = embedded ? Search.createIndex(JSON.parse(embedded[1]).employers, JSON.parse(embedded[1]).synonyms) : null;
function expected({ q = '', type = '', cats = [] }) {
  const results = searchIndex ? Search.search(searchIndex, q).results : {};
  return hill.filter((e) => results[e.id] && (!type || e.type === type) && (!cats.length || e.categories.some((c) => cats.includes(c)))).length;
}
const nameOf = Object.fromEntries(hill.map((e) => [e.id, e.name]));

// ---------- static server (gzip, like GitHub Pages) ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(DIST, path.normalize(p));
    if (!file.startsWith(DIST)) throw new Error('outside dist');
    let body = await readFile(file);
    const ext = path.extname(file);
    const headers = { 'content-type': TYPES[ext] || 'application/octet-stream', 'cache-control': 'no-store' };
    if (ext !== '.png' && /gzip/.test(req.headers['accept-encoding'] || '')) {
      body = gzipSync(body);
      headers['content-encoding'] = 'gzip';
    }
    res.writeHead(200, headers).end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;

// ---------- Chrome + CDP ----------
await stat(path.join(DIST, 'index.html')).catch(() => {
  console.error('dist/index.html missing: run node scripts/build.mjs first');
  process.exit(1);
});
const chrome = await launchChrome();
const { send, waitFor, listeners } = chrome;
async function cleanup() {
  await chrome.close();
  server.close();
}
const hardStop = setTimeout(async () => {
  console.error('FAIL  verify timed out after 120 s');
  await cleanup();
  process.exit(1);
}, 120_000);

/** Opens a fresh tab with the given emulation and returns helpers bound to it. */
async function openPage(url, { width = 390, height = 844, js = true, scheme = 'light', reducedMotion = false } = {}) {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const s = (m, p) => send(m, p, sessionId);
  await s('Page.enable');
  await s('Runtime.enable');
  await s('Network.enable');
  const requests = [];
  let bytes = 0;
  const onNet = (m) => {
    if (m.sessionId !== sessionId) return;
    if (m.method === 'Network.requestWillBeSent') requests.push(m.params.request.url);
    if (m.method === 'Network.loadingFinished') bytes += m.params.encodedDataLength;
  };
  listeners.add(onNet);
  await s('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 3, mobile: true });
  await s('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await s('Emulation.setEmulatedMedia', {
    features: [
      { name: 'prefers-color-scheme', value: scheme },
      { name: 'prefers-reduced-motion', value: reducedMotion ? 'reduce' : 'no-preference' },
    ],
  });
  if (!js) await s('Emulation.setScriptExecutionDisabled', { value: true });
  const loaded = waitFor(sessionId, 'Page.loadEventFired');
  await s('Page.navigate', { url });
  await loaded;
  const evaluate = async (expression) => {
    const r = await s('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`page error: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
    return r.result.value;
  };
  return {
    evaluate,
    requests,
    get bytes() { return bytes; },
    type: async (text) => {
      await evaluate(`document.querySelector('#q').focus()`);
      await s('Input.insertText', { text });
      await sleep(250); // > 100 ms debounce
    },
    close: async () => { listeners.delete(onNet); await send('Target.closeTarget', { targetId }); },
  };
}

// Reads the page's filter state in one round trip.
const STATE = `(() => ({
  // Counted by what's actually on screen, not by the hidden attribute.
  shown: [...document.querySelectorAll('#list > li')].filter(li => li.getClientRects().length > 0).length,
  hiddenButShown: [...document.querySelectorAll('#list > li')].filter(li => li.hidden && li.getClientRects().length > 0).length,
  count: document.querySelector('#count').textContent,
  empty: document.querySelector('#empty').getClientRects().length > 0,
  search: location.search,
  pressed: [...document.querySelectorAll('.chip[aria-pressed="true"]')].map(c => c.dataset.type ?? c.dataset.cat).filter(Boolean),
  allPressed: document.querySelector('.chip[data-type=""]').getAttribute('aria-pressed') === 'true',
  q: document.querySelector('#q').value,
}))()`;
const click = (sel) => `document.querySelector(${JSON.stringify(sel)}).click()`;
const nextPop = `new Promise(r => addEventListener('popstate', () => setTimeout(r, 30), { once: true }))`;

// Contrast of each visible text element against its effective background.
const CONTRAST = `(() => {
  const parse = (c) => { const m = c.match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 }; };
  const blend = (top, bot) => ({ r: top.r * top.a + bot.r * (1 - top.a), g: top.g * top.a + bot.g * (1 - top.a), b: top.b * top.a + bot.b * (1 - top.a), a: 1 });
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const bgOf = (el) => {
    const layers = [];
    for (let n = el; n; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; } }
    let bg = { r: 255, g: 255, b: 255, a: 1 };
    for (const l of layers.reverse()) bg = blend(l, bg);
    return bg;
  };
  const sels = ['h1', '.eyebrow', '.tagline', '.stat', '.stat strong', '.search label', '.chip-label', '.chip', '.count', '.badge', '.card h2', '.desc', '.tags li', '.btn-jobs', '.link-secondary', '.open-jobs', '.open-jobs .checked', '.meta span', '.meta a', '.site-footer p', '.recruiter', '.reset', '.empty p', '.btn-clear', '.search input', '.why', '.suggest', '.empty-usajobs a'];
  const out = [];
  for (const sel of sels) for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || el.closest('[hidden]')) continue;
    const cs = getComputedStyle(el);
    const fg = blend(parse(cs.color), bgOf(el));
    const L1 = lum(fg), L2 = lum(bgOf(el));
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const size = parseFloat(cs.fontSize), bold = Number(cs.fontWeight) >= 700;
    const need = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
    out.push({ sel, ratio: Math.round(ratio * 100) / 100, need, ok: ratio >= need });
  }
  return out;
})()`;

const H = `${ORIGIN}/`;
const total = hill.length;

try {
  // 1. No horizontal page scroll at phone widths, in default, all-chips and empty states.
  const allCats = Object.keys(LABELS.categories).join(',');
  for (const [w, h] of [[320, 640], [360, 740], [390, 844], [414, 896], [844, 390]]) {
    for (const [label, qs] of [['default', ''], ['all categories on', `?cat=${allCats}`], ['empty state', '?q=zzqqxx']]) {
      const p = await openPage(H + qs, { width: w, height: h });
      const r = await p.evaluate(`({ sw: document.documentElement.scrollWidth, iw: innerWidth, bw: document.body.scrollWidth })`);
      check(`no sideways scroll ${w}×${h} (${label})`, r.sw <= r.iw && r.bw <= r.iw, `scrollWidth ${r.sw}, innerWidth ${r.iw}`);
      await p.close();
    }
  }

  // 2. Chip rows scroll sideways inside their own container on a phone.
  {
    const p = await openPage(H, { width: 390 });
    const rows = await p.evaluate(`[...document.querySelectorAll('.chip-row')].map(r => ({ sw: r.scrollWidth, cw: r.clientWidth, ox: getComputedStyle(r).overflowX }))`);
    check('category chip row scrolls horizontally at 390 px', rows[1].sw > rows[1].cw && rows[1].ox === 'auto', JSON.stringify(rows[1]));
    await p.close();
  }

  // 3. Without JavaScript: every employer and link is visible; JS-only controls are hidden.
  {
    const p = await openPage(H, { width: 390, js: false });
    const r = await p.evaluate(`(() => {
      const arts = [...document.querySelectorAll('ul.grid > li > article')];
      return {
        className: document.documentElement.className,
        articles: arts.length,
        visible: arts.filter(a => a.getBoundingClientRect().height > 0).length,
        links: arts.filter(a => { const l = a.querySelector('a.btn-jobs'); return l && /^https:\\/\\//.test(l.href) && l.getBoundingClientRect().height > 0; }).length,
        searchShown: getComputedStyle(document.querySelector('.search')).display !== 'none',
        filtersShown: getComputedStyle(document.querySelector('.filters')).display !== 'none',
        count: document.querySelector('#count').textContent,
      };
    })()`);
    check('no-JS: page stays in no-js mode', r.className === 'no-js', r.className);
    check(`no-JS: all ${total} employers visible`, r.articles === total && r.visible === total, `${r.visible}/${r.articles}`);
    check('no-JS: every card has a visible https "View jobs" link', r.links === total, `${r.links}/${total}`);
    check('no-JS: search box and chips hidden', !r.searchShown && !r.filtersShown);
    check('no-JS: count shows full total', r.count === `${total} employers`, r.count);
    await p.close();
  }

  // 4. Search + chips combine with AND; empty state; Clear filters.
  {
    const p = await openPage(H, { width: 390 });
    let s = await p.evaluate(STATE);
    check('initial view shows everything ("All" type pressed)', s.shown === total && s.count === `${total} employers` && s.pressed.join() === '' && s.allPressed, JSON.stringify(s));

    await p.type('Boeing');
    s = await p.evaluate(STATE);
    check('search "Boeing"', s.shown === expected({ q: 'Boeing' }) && s.shown >= 1, `${s.shown} shown, expected ${expected({ q: 'Boeing' })}`);
    check('URL holds the search term', s.search === '?q=Boeing', s.search);

    await p.evaluate(click('.chip[data-cat="engineering"]'));
    s = await p.evaluate(STATE);
    const e1 = expected({ q: 'Boeing', cats: ['engineering'] });
    check('search "Boeing" + Engineering', s.shown === e1 && s.search === '?q=Boeing&cat=engineering', `${s.shown} shown (expected ${e1}), ${s.search}`);

    await p.evaluate(click('.chip[data-cat="engineering"]'));
    await p.evaluate(click('.chip[data-cat="base-services"]'));
    s = await p.evaluate(STATE);
    const e2 = expected({ q: 'Boeing', cats: ['base-services'] });
    check('search "Boeing" + Base services hides Boeing → empty state', s.shown === 0 && e2 === 0 && s.empty && s.count === '0 employers', JSON.stringify(s));

    await p.evaluate(click('#clear'));
    s = await p.evaluate(STATE);
    const focused = await p.evaluate(`document.activeElement.id`);
    check('Clear filters resets everything', s.shown === total && s.q === '' && s.search === '' && s.pressed.join() === '' && !s.empty && focused === 'q', JSON.stringify(s));

    await p.type('bôeing');
    s = await p.evaluate(STATE);
    check('accents ignored ("bôeing" finds Boeing)', s.shown === expected({ q: 'boeing' }) && s.shown >= 1, `${s.shown} shown`);
    await p.evaluate(click('#reset'));

    await p.type('SENTINEL icbm');
    s = await p.evaluate(STATE);
    check('case-insensitive multi-word search ("SENTINEL icbm")', s.shown === expected({ q: 'sentinel icbm' }) && s.shown >= 1, `${s.shown} shown, expected ${expected({ q: 'sentinel icbm' })}`);
    await p.evaluate(click('#reset'));

    await p.evaluate(click('.chip[data-type="federal"]'));
    s = await p.evaluate(STATE);
    check('type chip "Federal civilian"', s.shown === expected({ type: 'federal' }) && s.pressed.join() === 'federal', `${s.shown} shown, expected ${expected({ type: 'federal' })}`);

    await p.evaluate(click('.chip[data-cat="trades-maintenance"]'));
    await p.evaluate(click('.chip[data-cat="software-it"]'));
    s = await p.evaluate(STATE);
    const e3 = expected({ type: 'federal', cats: ['trades-maintenance', 'software-it'] });
    check('type AND any-of categories', s.shown === e3, `${s.shown} shown, expected ${e3}`);

    // 5. Live region text changes with each filter change.
    const live = await p.evaluate(`(() => { const c = document.querySelector('#count'); return c.getAttribute('aria-live') + '|' + c.getAttribute('role'); })()`);
    check('result count is an aria-live="polite" status region', live === 'polite|status', live);
    check('result count text matches results', s.count === `${e3} employer${e3 === 1 ? '' : 's'}`, s.count);

    // 6. Back button restores each previous view.
    const before = [];
    await p.evaluate(click('#reset'));
    before.push(await p.evaluate(STATE)); // clean
    await p.evaluate(click('.chip[data-type="prime"]'));
    before.push(await p.evaluate(STATE));
    await p.evaluate(click('.chip[data-cat="engineering"]'));
    before.push(await p.evaluate(STATE));
    await p.evaluate(click('.chip[data-cat="software-it"]'));
    let ok = true;
    const trail = [];
    for (let i = before.length - 1; i >= 0; i--) {
      await p.evaluate(`(() => { const w = ${nextPop}; history.back(); return w; })()`);
      const now = await p.evaluate(STATE);
      trail.push(now.search || '(none)');
      if (now.search !== before[i].search || now.shown !== before[i].shown || now.pressed.join() !== before[i].pressed.join()) ok = false;
    }
    check('Back button restores each previous filter view', ok, trail.join(' → '));

    await p.close();
  }

  // One history entry per typing burst, not per letter; Back then undoes the whole word.
  {
    const p = await openPage(H, { width: 390 });
    const len0 = await p.evaluate('history.length');
    await p.type('l');
    await p.type('o');
    await p.type('g');
    const len1 = await p.evaluate('history.length');
    check('typing a word adds one history entry, not one per letter', len1 - len0 === 1, `history grew by ${len1 - len0}`);
    await p.evaluate(`(() => { const w = ${nextPop}; history.back(); return w; })()`);
    const s = await p.evaluate(STATE);
    check('Back after typing restores the unfiltered view', s.search === '' && s.q === '' && s.shown === total, JSON.stringify(s));
    await p.close();
  }

  // 6b. The five example searches from SPEC §5, typed into the real page.
  {
    const p = await openPage(H, { width: 390 });
    for (const q of ['painter', 'coater', 'LO', 'networking', 'admin']) {
      await p.evaluate(click('#reset'));
      await p.evaluate(`(() => { const i = document.querySelector('#q'); i.value = ''; })()`);
      await p.type(q);
      const r = await p.evaluate(`[...document.querySelectorAll('#list > li')].filter(li => li.getClientRects().length > 0).map(li => ({ id: li.querySelector('.card').dataset.id, why: li.querySelector('.why').getClientRects().length ? li.querySelector('.why').textContent : '' }))`);
      const want = expected({ q });
      check(`example search "${q}" finds ${want} employer(s), each with a "Matches:" line`,
        r.length === want && want >= 1 && r.every((x) => x.why.startsWith('Matches: ')),
        r.map((x) => `${nameOf[x.id]} — ${x.why || '(no reason shown)'}`).join('; '));
    }
    await p.evaluate(click('#reset'));
    const whyHidden = await p.evaluate(`[...document.querySelectorAll('.why')].every(w => w.hidden)`);
    check('no "Matches:" lines when the search is empty', whyHidden);
    const anyHiddenVisible = await p.evaluate(`[...document.querySelectorAll('[hidden]')].filter(el => el.getClientRects().length > 0).map(el => el.id || el.className)`);
    check('elements marked hidden are really hidden on screen', anyHiddenVisible.length === 0, anyHiddenVisible.join(', '));
    await p.close();
  }

  // 6c. A search with no results shows a helpful empty state.
  {
    const p = await openPage(H + '?q=zzqqxx', { width: 390 });
    const r = await p.evaluate(`({
      title: document.querySelector('#empty-title').textContent,
      suggestions: [...document.querySelectorAll('.suggest')].map(b => b.textContent),
      usajobsShown: !document.querySelector('#empty-usajobs').hidden,
      usajobs: document.querySelector('#usajobs-link').href,
      emptyShown: !document.querySelector('#empty').hidden,
    })`);
    const u = new URL(r.usajobs);
    check('empty state names the search and offers suggestions', r.emptyShown && r.title === 'No employers list “zzqqxx” yet.' && r.suggestions.length >= 3, `${r.title} | ${r.suggestions.join(', ')}`);
    check('empty state links to the same search on USAJOBS at Hill', r.usajobsShown && u.hostname === 'www.usajobs.gov' && u.searchParams.get('k') === 'zzqqxx' && u.searchParams.get('l') === 'Hill AFB, Utah', r.usajobs);
    await p.evaluate(click('.suggest[data-q="mechanic"]'));
    const s = await p.evaluate(STATE);
    check('tapping a suggestion runs that search', s.q === 'mechanic' && s.shown === expected({ q: 'mechanic' }) && s.shown > 0 && s.search === '?q=mechanic', JSON.stringify(s));
    await p.close();

    const f = await openPage(H + '?q=painter&type=services', { width: 390 });
    const msg = await f.evaluate(`(() => { const e = document.querySelector('#empty-filtered'); return e.hidden ? '' : e.textContent; })()`);
    const without = expected({ q: 'painter' });
    check('empty state says when the chips are hiding matches', expected({ q: 'painter', type: 'services' }) === 0 && msg.includes(`${without} employer`), msg || '(nothing shown)');
    await f.close();
  }

  // 7. Shared filtered URLs open in the same view.
  for (const [qs, want, pressed] of [
    ['?cat=trades-maintenance', expected({ cats: ['trades-maintenance'] }), 'trades-maintenance'],
    ['?q=boeing&type=prime&cat=engineering', expected({ q: 'boeing', type: 'prime', cats: ['engineering'] }), 'prime,engineering'],
    ['?cat=engineering&cat=base-services', expected({ cats: ['engineering', 'base-services'] }), 'engineering,base-services'],
    ['?type=bogus&cat=nope', total, ''],
  ]) {
    const p = await openPage(H + qs, { width: 390 });
    const s = await p.evaluate(STATE);
    const sorted = (x) => x.split(',').sort().join();
    check(`shared URL ${qs}`, s.shown === want && sorted(s.pressed.join()) === sorted(pressed), `${s.shown} shown (expected ${want}), pressed [${s.pressed}]`);
    await p.close();
  }

  // 8. Tap targets ≥ 44×44 and search input ≥ 16 px (no zoom on iOS focus).
  {
    const p = await openPage(H, { width: 390 });
    const r = await p.evaluate(`(() => {
      const small = [...document.querySelectorAll('a, button, input')]
        .filter(el => !el.classList.contains('skip') && !el.closest('[hidden]'))
        .map(el => { const b = el.getBoundingClientRect(); return { el: (el.className || el.tagName) + ': ' + el.textContent.trim().slice(0, 30), w: Math.round(b.width), h: Math.round(b.height) }; })
        .filter(x => x.w > 0 && (x.w < 44 || x.h < 44));
      return { small, inputFont: parseFloat(getComputedStyle(document.querySelector('#q')).fontSize) };
    })()`);
    check('all tap targets are at least 44×44 px', r.small.length === 0, r.small.slice(0, 5).map((x) => `${x.el} ${x.w}×${x.h}`).join('; '));
    check('search input font-size ≥ 16 px', r.inputFont >= 16, `${r.inputFont}px`);
    await p.close();
  }

  // 9. Contrast in both themes (with a pressed chip and the empty state rendered too).
  for (const scheme of ['light', 'dark']) {
    for (const qs of ['?cat=engineering', '?q=zzqqxx']) {
      const p = await openPage(H + qs, { width: 390, scheme });
      const res = await p.evaluate(CONTRAST);
      const bad = res.filter((x) => !x.ok);
      const worst = res.reduce((a, b) => (b.ratio / b.need < a.ratio / a.need ? b : a), res[0]);
      check(`contrast WCAG AA, ${scheme} theme (${qs})`, bad.length === 0 && res.length > 5,
        bad.length ? [...new Map(bad.map((b) => [b.sel, b])).values()].map((b) => `${b.sel} ${b.ratio}:1 < ${b.need}`).join('; ') : `${res.length} elements, lowest ${worst.sel} ${worst.ratio}:1`);
      await p.close();
    }
  }
  {
    const p = await openPage(H, { width: 390, scheme: 'dark' });
    const bg = await p.evaluate(`getComputedStyle(document.body).backgroundColor`);
    check('dark mode applies the dark theme', bg === 'rgb(8, 17, 31)', bg);
    await p.close();
  }

  // 10. Reduced motion: no animations.
  {
    const p = await openPage(H, { width: 390 });
    const n = await p.evaluate('document.getAnimations().length');
    await p.close();
    const q = await openPage(H, { width: 390, reducedMotion: true });
    const m = await q.evaluate('document.getAnimations().length');
    check('prefers-reduced-motion stops the runway animation', n > 0 && m === 0, `${n} animation(s) normally, ${m} with reduced motion`);
    await q.close();
  }

  // 11. Network: no third-party requests; transfer under 100 KB.
  {
    const p = await openPage(H, { width: 390 });
    await sleep(300);
    const third = p.requests.filter((u) => !u.startsWith(ORIGIN) && !u.startsWith('data:'));
    check('zero third-party requests', third.length === 0, third.join(', ') || `${p.requests.length} same-origin requests`);
    const kb = p.bytes / 1024;
    check('page transfer under 100 KB', kb < 100, `${kb.toFixed(1)} KB over ${p.requests.length} requests`);
    const missing = await p.evaluate(`Promise.all([...document.querySelectorAll('link[rel~=icon], link[rel=apple-touch-icon], link[rel=stylesheet]')].map(l => fetch(l.href).then(r => r.ok ? null : l.getAttribute('href'))))`);
    check('linked css/icons all load', missing.every((x) => !x), missing.filter(Boolean).join(', '));
    await p.close();
  }

  // 12. Semantics and link hygiene.
  {
    const p = await openPage(H, { width: 390 });
    const r = await p.evaluate(`(() => {
      const blank = [...document.querySelectorAll('a[target=_blank]')];
      return {
        h1: document.querySelectorAll('h1').length,
        main: document.querySelectorAll('main').length,
        cards: document.querySelectorAll('ul.grid > li > article').length,
        chips: document.querySelectorAll('.chip').length,
        chipsPressable: [...document.querySelectorAll('.chip')].every(c => c.tagName === 'BUTTON' && c.hasAttribute('aria-pressed')),
        blank: blank.length,
        blankOk: blank.every(a => /\\bnoopener\\b/.test(a.rel) && /opens in new tab/.test(a.textContent)),
        disclaimer: document.querySelector('footer').textContent.includes('Work At Hill is an independent directory and is not affiliated with or endorsed by the U.S. Air Force, the Department of Defense, or any listed employer.'),
        title: document.title,
        meta: ['description', 'twitter:card'].every(n => document.querySelector('meta[name="' + n + '"]')?.content) && ['og:title', 'og:image', 'og:description', 'og:url'].every(n => document.querySelector('meta[property="' + n + '"]')?.content),
        canonical: document.querySelector('link[rel=canonical]')?.href,
        jsonLd: document.querySelectorAll('script[type="application/ld+json"]').length,
        sourceLeak: document.documentElement.outerHTML.includes('sourceUrl'),
        openJobs: [...document.querySelectorAll('.card')].map(c => ({
          usajobs: c.querySelector('a.btn-jobs').href.startsWith('https://www.usajobs.gov/search/results/'),
          text: c.querySelector('.open-jobs')?.textContent.replace(/\\s+/g, ' ').trim() ?? null,
        })),
      };
    })()`);
    check('one <h1>, one <main>', r.h1 === 1 && r.main === 1, `h1 ${r.h1}, main ${r.main}`);
    check(`cards are articles in a list (${total})`, r.cards === total, String(r.cards));
    check('chips are <button aria-pressed>', r.chips > 0 && r.chipsPressable);
    check('new-tab links have rel=noopener and "opens in new tab" text', r.blank >= total && r.blankOk, `${r.blank} links`);
    check('footer disclaimer present (exact text)', r.disclaimer);
    check('title, description, Open Graph and Twitter tags present', r.meta && !!r.title, r.title);
    check('canonical URL is https://workathill.com/', r.canonical === 'https://workathill.com/', r.canonical);
    check('no JobPosting structured data', r.jsonLd === 0);
    const withCount = r.openJobs.filter((c) => c.text !== null);
    const misplaced = withCount.filter((c) => !c.usajobs).length;
    const badText = withCount.filter((c) => !/^(\d+ open jobs?|No open jobs right now) · checked [A-Z][a-z]{2} \d{1,2}, \d{4}$/.test(c.text));
    check('open-job counts only on USAJOBS cards, in the right format',
      misplaced === 0 && badText.length === 0,
      withCount.length ? `${withCount.length} cards with counts${badText.length ? `; bad: ${badText.map((c) => c.text).join(' | ')}` : ''}` : 'no counts in this build');
    const html = await readFile(path.join(DIST, 'index.html'), 'utf8');
    const leaked = hill.filter((e) => html.includes(e.sourceUrl) && e.sourceUrl !== e.jobsUrl && e.sourceUrl !== e.secondaryUrl);
    check('internal sourceUrl values never appear on the page', leaked.length === 0, leaked.map((e) => e.id).join(', '));
    await p.close();
  }
} catch (err) {
  failures++;
  console.error('FAIL  verify crashed:', err);
} finally {
  clearTimeout(hardStop);
  await cleanup();
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
