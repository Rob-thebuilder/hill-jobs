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

  const p = new URLSearchParams(location.search);
  let state = { q: p.get('q') || '', type: TYPES.has(p.get('type')) ? p.get('type') : '' };

  const render = () => {
    const q = state.q.trim();
    const { results } = Search.search(index, q);
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
    countEl.textContent = `${shown} employer${shown === 1 ? '' : 's'}`;
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
