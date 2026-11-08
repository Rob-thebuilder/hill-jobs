// Work At Hill — search, filter chips and URL state. The page is fully usable without this file.
(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const input = $('#q');
  const form = $('.search');
  const list = $('#list');
  const countEl = $('#count');
  const emptyEl = $('#empty');
  const resetBtn = $('#reset');
  const typeChips = $$('.chip[data-type]');
  const catChips = $$('.chip[data-cat]');
  if (!input || !list) return;

  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ' ').trim();

  const cards = $$('.card', list).map((el) => ({
    li: el.parentElement,
    type: el.dataset.type,
    cats: el.dataset.cats.split(' '),
    text: norm(el.dataset.text),
  }));
  const TYPES = new Set(typeChips.map((c) => c.dataset.type).filter(Boolean));
  const CATS = new Set(catChips.map((c) => c.dataset.cat));

  // ---- state <-> URL ----
  const fromUrl = () => {
    const p = new URLSearchParams(location.search);
    const type = p.get('type') || '';
    const cats = p.getAll('cat').flatMap((v) => v.split(',')).filter((c) => CATS.has(c));
    return { q: p.get('q') || '', type: TYPES.has(type) ? type : '', cats: new Set(cats) };
  };
  const toUrl = (s) => {
    const p = new URLSearchParams();
    if (s.q.trim()) p.set('q', s.q.trim());
    if (s.type) p.set('type', s.type);
    // Keep chip order so the same filters always give the same URL.
    const cats = catChips.map((c) => c.dataset.cat).filter((c) => s.cats.has(c));
    if (cats.length) p.set('cat', cats.join(','));
    const qs = p.toString().replace(/%2C/g, ',');
    return location.pathname + (qs ? `?${qs}` : '') + location.hash;
  };
  const current = () => location.pathname + location.search + location.hash;

  let state = fromUrl();

  // ---- render ----
  const render = () => {
    const tokens = norm(state.q).split(' ').filter(Boolean);
    let shown = 0;
    for (const c of cards) {
      const match =
        (!state.type || c.type === state.type) &&
        (!state.cats.size || c.cats.some((cat) => state.cats.has(cat))) &&
        tokens.every((t) => c.text.includes(t));
      c.li.hidden = !match;
      if (match) shown++;
    }
    const text = `${shown} employer${shown === 1 ? '' : 's'}`;
    if (countEl.textContent !== text) countEl.textContent = text;
    emptyEl.hidden = shown !== 0;
    list.hidden = shown === 0;
    resetBtn.hidden = !(state.q.trim() || state.type || state.cats.size);
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

  const clearAll = () => {
    state = { q: '', type: '', cats: new Set() };
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
    input.focus();
    input.select();
  });

  input.value = state.q;
  render();
})();
