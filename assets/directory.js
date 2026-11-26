// Employer Directory page: search box and type pills. Without this file every employer still shows.
(() => {
  const Search = window.WorkAtHillSearch;
  const input = document.getElementById('dq');
  const countEl = document.getElementById('dcount');
  const emptyEl = document.getElementById('dempty');
  const chips = [...document.querySelectorAll('.chip[data-type]')];
  const groups = [...document.querySelectorAll('.dir-group')];
  if (!Search || !input || !groups.length) return;

  let index;
  try {
    const data = JSON.parse(document.getElementById('search-data').textContent);
    index = Search.createIndex(data.employers, data.synonyms);
  } catch {
    return;
  }
  const cards = [...document.querySelectorAll('.dir-group .card')].map((el) => ({
    li: el.parentElement, id: el.dataset.id, type: el.dataset.type, why: el.querySelector('.why'),
  }));
  const TYPES = new Set(chips.map((c) => c.dataset.type).filter(Boolean));

  const $ = (sel) => document.querySelector(sel);
  // ---- site pages (training, resume help, events, hiring guide…) found by the same search ----
  const PAGE_LIMIT = 5;
  const pagesBox = $('#page-hits');
  const pagesList = $('#page-hits-list');
  const pagesMore = $('#page-hits-more');
  const pageById = {};
  let pageIndex = null;
  try {
    const data = JSON.parse($('#search-data').textContent);
    if (Array.isArray(data.pages) && data.pages.length) {
      for (const p of data.pages) pageById[p.id] = p;
      pageIndex = Search.createIndex(
        data.pages.map((p) => ({ id: p.id, name: p.title, description: p.text, roles: p.keywords, titles: [], last: p.last })),
        data.synonyms,
      );
    }
  } catch {
    pageIndex = null;
  }
  const pageItem = (p) => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = p.url;
    const kind = document.createElement('span');
    kind.className = 'ph-kind';
    kind.textContent = p.kind;
    a.append(kind, p.title);
    if (p.ext) {
      a.target = '_blank';
      a.rel = 'noopener';
      const sr = document.createElement('span');
      sr.className = 'sr-only';
      sr.textContent = ' (opens in new tab)';
      a.append(sr);
    }
    if (p.here) a.dataset.here = '1';
    li.append(a);
    if (p.context) {
      const c = document.createElement('span');
      c.className = 'ph-context';
      c.textContent = p.context;
      li.append(c);
    }
    return li;
  };
  const renderPages = (q) => {
    if (!pagesBox) return;
    const r = q && pageIndex ? Search.rank(pageIndex, q, PAGE_LIMIT) : { ids: [], total: 0 };
    const key = r.ids.join('|');
    if (pagesBox.dataset.key !== key) {
      pagesBox.dataset.key = key;
      pagesList.replaceChildren(...r.ids.map((id) => pageItem(pageById[id])));
    }
    pagesBox.hidden = !r.ids.length;
    const more = r.total - r.ids.length;
    pagesMore.textContent = more > 0 ? `${more} more. Add a word to narrow it down.` : '';
    pagesMore.hidden = more <= 0;
  };

  const p = new URLSearchParams(location.search);
  let state = { q: p.get('q') || '', type: TYPES.has(p.get('type')) ? p.get('type') : '' };

  const render = () => {
    const q = state.q.trim();
    const { results, corrected } = Search.search(index, q);
    renderPages(q);
    let shown = 0;
    for (const c of cards) {
      const hit = results[c.id];
      const match = !!hit && (!state.type || c.type === state.type);
      c.li.hidden = !match;
      const why = match && q ? Search.explain(hit.reasons) : '';
      c.why.textContent = why;
      c.why.hidden = !why;
      if (match) shown++;
    }
    for (const g of groups) {
      const n = g.querySelectorAll('.grid > li:not([hidden])').length;
      g.hidden = n === 0;
      g.querySelector('.group-n').textContent = n;
    }
    countEl.textContent = `${shown} employer${shown === 1 ? '' : 's'}${corrected && shown ? ` · showing results for “${corrected}”` : ''}`;
    emptyEl.hidden = shown !== 0;
    for (const c of chips) c.setAttribute('aria-pressed', String(c.dataset.type === state.type));
  };

  const saveUrl = () => {
    const u = new URLSearchParams();
    if (state.q.trim()) u.set('q', state.q.trim());
    if (state.type) u.set('type', state.type);
    const qs = u.toString();
    history.replaceState(null, '', location.pathname + (qs ? `?${qs}` : ''));
  };

  input.addEventListener('input', () => { state.q = input.value; render(); saveUrl(); });
  input.form.addEventListener('submit', (e) => { e.preventDefault(); input.blur(); });
  for (const c of chips) {
    c.addEventListener('click', () => { state.type = c.dataset.type; render(); saveUrl(); });
  }
  input.value = state.q;
  render();
})();
