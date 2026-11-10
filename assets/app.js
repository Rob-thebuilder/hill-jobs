// Work At Hill — search, filter chips and URL state. The page is fully usable without this file.
// Matching rules live in search.js (shared with the Node tests).
(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const Search = window.WorkAtHillSearch;
  const input = $('#q');
  const form = $('.search');
  const list = $('#list');
  const countEl = $('#count');
  const emptyEl = $('#empty');
  const emptyTitle = $('#empty-title');
  const emptyFiltered = $('#empty-filtered');
  const emptyUsajobs = $('#empty-usajobs');
  const usajobsLink = $('#usajobs-link');
  const usajobsQ = $('#usajobs-q');
  const resetBtn = $('#reset');
  const alertForm = $('#alert-form'); // only present once the email list is set up
  const alertTitle = $('#alert-title');
  const alertTag = $('#alert-tag');
  const tabLinks = $$('.tab[data-tab]');
  const panels = $$('.panel[data-panel]');
  const tabsRow = $('.tabs-row');
  const typeChips = $$('.chip[data-type]');
  const catChips = $$('.chip[data-cat]');
  if (!Search || !input || !list) return;

  let index;
  try {
    const data = JSON.parse($('#search-data').textContent);
    index = Search.createIndex(data.employers, data.synonyms);
  } catch {
    return; // without search data the static page still works
  }

  const cards = $$('.card', list).map((el) => ({
    li: el.parentElement,
    id: el.dataset.id,
    type: el.dataset.type,
    cats: el.dataset.cats.split(' '),
    why: $('.why', el),
  }));
  const TYPES = new Set(typeChips.map((c) => c.dataset.type).filter(Boolean));
  const CATS = new Set(catChips.map((c) => c.dataset.cat));
  const USAJOBS_BASE = usajobsLink.href;

  // ---- tabs (plain links without JS; real tabs with it) ----
  const TABS = new Set(tabLinks.map((t) => t.dataset.tab));
  const HASH_TO_TAB = Object.fromEntries(tabLinks.map((t) => [t.getAttribute('href'), t.dataset.tab]));
  if (tabsRow) {
    tabsRow.setAttribute('role', 'tablist');
    tabsRow.setAttribute('aria-label', 'Sections');
    for (const t of tabLinks) {
      const panel = $(t.getAttribute('href'));
      t.setAttribute('role', 'tab');
      t.setAttribute('aria-controls', panel.id);
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', t.id);
    }
  }

  // ---- state <-> URL ----
  const fromUrl = () => {
    const p = new URLSearchParams(location.search);
    const type = p.get('type') || '';
    const cats = p.getAll('cat').flatMap((v) => v.split(',')).filter((c) => CATS.has(c));
    const tab = TABS.has(p.get('tab')) ? p.get('tab') : HASH_TO_TAB[location.hash] || 'employers';
    return { q: p.get('q') || '', type: TYPES.has(type) ? type : '', cats: new Set(cats), tab };
  };
  const toUrl = (s) => {
    const p = new URLSearchParams();
    if (s.q.trim()) p.set('q', s.q.trim());
    if (s.type) p.set('type', s.type);
    // Keep chip order so the same filters always give the same URL.
    const cats = catChips.map((c) => c.dataset.cat).filter((c) => s.cats.has(c));
    if (cats.length) p.set('cat', cats.join(','));
    if (s.tab && s.tab !== 'employers') p.set('tab', s.tab);
    const qs = p.toString().replace(/%2C/g, ',');
    return location.pathname + (qs ? `?${qs}` : '');
  };
  const current = () => location.pathname + location.search;

  let state = fromUrl();

  // ---- render ----
  const passesChips = (c) => (!state.type || c.type === state.type) && (!state.cats.size || c.cats.some((cat) => state.cats.has(cat)));

  const renderTabs = () => {
    for (const t of tabLinks) {
      const on = t.dataset.tab === state.tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
    }
    for (const p of panels) p.hidden = p.dataset.panel !== state.tab;
  };

  const render = () => {
    renderTabs();
    const q = state.q.trim();
    const { results } = Search.search(index, q);
    let shown = 0;
    for (const c of cards) {
      const hit = results[c.id];
      const match = !!hit && passesChips(c);
      c.li.hidden = !match;
      const why = match && q ? Search.explain(hit.reasons) : '';
      if (c.why.textContent !== why) c.why.textContent = why;
      c.why.hidden = !why;
      if (match) shown++;
    }
    const text = `${shown} employer${shown === 1 ? '' : 's'}`;
    if (countEl.textContent !== text) countEl.textContent = text;

    const filtersOn = !!(state.type || state.cats.size);
    emptyEl.hidden = shown !== 0;
    list.hidden = shown === 0;
    if (shown === 0) {
      emptyTitle.textContent = q ? `No employers list “${q}” yet.` : 'No employers match these filters.';
      // Would the search find anything without the chips?
      const withoutChips = q ? cards.filter((c) => results[c.id]).length : 0;
      emptyFiltered.textContent = withoutChips
        ? `${withoutChips} employer${withoutChips === 1 ? '' : 's'} match “${q}” if you clear the type and category filters.`
        : '';
      emptyFiltered.hidden = !(filtersOn && withoutChips);
      emptyUsajobs.hidden = !q;
      if (q) {
        const u = new URL(USAJOBS_BASE);
        u.searchParams.set('k', q);
        usajobsLink.href = u.toString();
        usajobsQ.textContent = `“${q}”`;
      }
    }
    resetBtn.hidden = !(q || filtersOn);
    if (alertForm) {
      // Saved-search tag, normalized the same way as scripts/lib/newsletter.mjs alertTag().
      const term = Search.normalize(q).slice(0, 40).trim();
      alertForm.hidden = !term;
      if (term) {
        alertTag.value = `search:${term}`;
        alertTitle.textContent = shown === 0
          ? `Nothing for “${q}” right now. Want an email when a job shows up?`
          : `Email me when new “${q}” jobs are posted near Hill`;
      }
    }
    for (const chip of typeChips) chip.setAttribute('aria-pressed', String(chip.dataset.type === state.type));
    for (const chip of catChips) chip.setAttribute('aria-pressed', String(state.cats.has(chip.dataset.cat)));
    if (input.value !== state.q && document.activeElement !== input) input.value = state.q;
  };

  const commit = (mode) => {
    const url = toUrl(state);
    if (url === current()) return;
    history[mode === 'push' ? 'pushState' : 'replaceState'](null, '', url);
  };

  // ---- search: debounced; one history entry per typing burst ----
  let debounce = 0;
  let burstTimer = 0;
  let inBurst = false;
  const endBurst = () => { inBurst = false; };
  input.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      state.q = input.value;
      state.tab = 'employers'; // the search box searches employers
      render();
      commit(inBurst ? 'replace' : 'push');
      inBurst = true;
      clearTimeout(burstTimer);
      burstTimer = setTimeout(endBurst, 1200);
    }, 100);
  });
  input.addEventListener('blur', endBurst);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && input.value) {
      e.preventDefault();
      input.value = '';
      input.dispatchEvent(new Event('input'));
    }
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    input.blur(); // closes the phone keyboard so results are visible
  });

  // ---- chips ----
  for (const chip of typeChips) {
    chip.addEventListener('click', () => {
      state.type = chip.dataset.type;
      endBurst();
      render();
      commit('push');
    });
  }
  for (const chip of catChips) {
    chip.addEventListener('click', () => {
      const cat = chip.dataset.cat;
      if (state.cats.has(cat)) state.cats.delete(cat);
      else state.cats.add(cat);
      endBurst();
      render();
      commit('push');
    });
  }

  // Suggestion buttons in the empty state run that search (keeping the chips as they are).
  for (const btn of $$('.suggest')) {
    btn.addEventListener('click', () => {
      state.q = btn.dataset.q;
      input.value = state.q;
      endBurst();
      render();
      commit('push');
    });
  }

  const showTab = (tab, { focusTab = false } = {}) => {
    if (!TABS.has(tab)) return;
    state.tab = tab;
    endBurst();
    render();
    commit('push');
    if (focusTab) tabLinks.find((t) => t.dataset.tab === tab)?.focus();
  };
  for (const t of tabLinks) {
    t.addEventListener('click', (e) => {
      e.preventDefault();
      showTab(t.dataset.tab);
    });
    t.addEventListener('keydown', (e) => {
      const i = tabLinks.indexOf(t);
      const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabLinks.length - 1 }[e.key];
      if (next === undefined) return;
      e.preventDefault();
      showTab(tabLinks[(next + tabLinks.length) % tabLinks.length].dataset.tab, { focusTab: true });
    });
  }
  for (const a of $$('[data-tab-link]')) {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      showTab(a.dataset.tabLink);
      // Scroll to the link's target inside the tab (e.g. #more-ways), or to the top of the tab.
      const target = $(a.getAttribute('href'));
      const behavior = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
      if (target && !target.classList.contains('panel')) {
        target.scrollIntoView({ block: 'start', behavior });
        target.focus({ preventScroll: true });
      } else tabsRow?.scrollIntoView({ block: 'start', behavior });
    });
  }

  const clearAll = () => {
    state = { q: '', type: '', cats: new Set(), tab: 'employers' };
    input.value = '';
    endBurst();
    render();
    commit('push');
    input.focus();
  };
  $('#clear').addEventListener('click', clearAll);
  resetBtn.addEventListener('click', clearAll);

  window.addEventListener('popstate', () => {
    state = fromUrl();
    input.value = state.q;
    endBurst();
    render();
  });

  // "/" focuses search (desktop), unless already typing somewhere.
  document.addEventListener('keydown', (e) => {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    e.preventDefault();
    if (state.tab !== 'employers') showTab('employers');
    input.focus();
    input.select();
  });

  input.value = state.q;
  render();
})();
