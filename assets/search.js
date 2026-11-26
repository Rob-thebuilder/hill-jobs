/* Work At Hill: search engine shared by the page (window.WorkAtHillSearch) and Node tests (module.exports).
 *
 * Rules:
 * - Text is lowercased, accents are dropped, "a&p" becomes "ap", and anything else that isn't a
 *   letter or digit splits words ("F-35" -> "f 35"). Letters and digits also split, so "F35",
 *   "F-35" and "F 35" are the same search, and "L3" finds "L3Harris".
 * - A query term of 2 characters or fewer must equal a whole word ("lo" never matches "Lockheed").
 *   Longer terms match the start of a word ("paint" matches "painter").
 * - Each whitespace-separated query part must match somewhere (AND); a part like "F-35" is matched
 *   as one phrase. Parts are matched against the employer's name, description, researched roles
 *   and live job titles.
 * - A query word or phrase that belongs to a synonym group matches whole words only (a plural "s"
 *   is allowed for terms longer than 2 letters), and also matches the group's other terms, but only in roles and job titles, so
 *   "admin" -> "office" doesn't hit "F-16 program office", and "office" doesn't hit "officer".
 * - Word endings: a last query word longer than 4 letters also tries its stem, so "mechanics",
 *   "contracts", "internship" and "welding" find "mechanic", "contract", "intern" and "weld".
 * - Typos: if nothing matches, a word of 5+ letters that isn't on the site is swapped for the
 *   closest word that is (same first letter, 1 edit, or 2 for 8+ letters) and the search runs
 *   again; the result then says which word it used ("northrup" -> "northrop").
 * - Site pages (data/site-pages.json plus every training, resource, program and event) use the same
 *   rules through rank(): title = name, keywords = roles, details = description.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WorkAtHillSearch = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SHORT = 2; // terms this long or shorter must match a whole word

  function normalize(s) {
    return String(s)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/([a-z0-9])&([a-z0-9])/g, '$1$2')
      .replace(/([a-z])(?=[0-9])|([0-9])(?=[a-z])/g, '$1$2 ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function words(s) {
    var n = normalize(s);
    return n ? n.split(' ') : [];
  }

  /**
   * True if the term's words appear consecutively in fieldWords. The last word may be a prefix,
   * unless it's short or `exact` is set (then it must be the whole word, or the word plus "s").
   */
  function matchWords(fieldWords, termWords, exact) {
    var t = termWords.length;
    if (!t) return false;
    var last = termWords[t - 1];
    for (var i = 0; i + t <= fieldWords.length; i++) {
      var ok = true;
      for (var j = 0; j < t - 1; j++) {
        if (fieldWords[i + j] !== termWords[j]) { ok = false; break; }
      }
      if (!ok) continue;
      var w = fieldWords[i + t - 1];
      if (exact) {
        if (w === last || (last.length > SHORT && w === last + 's')) return true; // "it" must not match "its"
      } else if (last.length <= SHORT ? w === last : w.lastIndexOf(last, 0) === 0) return true;
    }
    return false;
  }

  /** Other forms of a query word to try: "contracts" -> "contract", "internship" -> "intern". */
  function stems(w) {
    var out = [];
    if (w.length <= 4) return out;
    if (/ship$/.test(w) && w.length - 4 >= 4) out.push(w.slice(0, -4));
    if (/ing$/.test(w) && w.length - 3 >= 4) out.push(w.slice(0, -3));
    if (/s$/.test(w) && !/(ss|us|is)$/.test(w)) out.push(w.slice(0, -1));
    return out;
  }

  /** Synonym groups -> list of { terms: [[words]...], keys: Set of joined terms }. */
  function compileSynonyms(synonyms) {
    var groups = (synonyms && synonyms.groups) || [];
    return groups.map(function (g) {
      var seen = {};
      var terms = [];
      g.forEach(function (term) {
        var w = words(term);
        var key = w.join(' ');
        if (w.length && !seen[key]) { seen[key] = true; terms.push(w); }
      });
      return { terms: terms, keys: seen };
    });
  }

  /**
   * entries: [{ id, name, description, roles: [], titles: [] }]
   * synonyms: { groups: [[term, ...], ...] }
   */
  function createIndex(entries, synonyms) {
    var groups = compileSynonyms(synonyms);
    var maxPhrase = 1;
    groups.forEach(function (g) {
      g.terms.forEach(function (t) { if (t.length > maxPhrase) maxPhrase = t.length; });
    });
    var items = entries.map(function (e) {
      var list = function (arr) {
        return (arr || []).map(function (text) { return { text: text, words: words(text) }; });
      };
      return {
        id: e.id,
        last: !!e.last,
        name: words(e.name || ''),
        description: words(e.description || ''),
        roles: list(e.roles),
        titles: list(e.titles),
      };
    });
    var vocab = {};
    var add = function (ws) { ws.forEach(function (w) { vocab[w] = (vocab[w] || 0) + 1; }); };
    items.forEach(function (it) {
      add(it.name); add(it.description);
      it.roles.concat(it.titles).forEach(function (r) { add(r.words); });
    });
    return { items: items, groups: groups, maxPhrase: maxPhrase, vocab: vocab };
  }

  /** The synonym group whose longest term starts at q[i], as { len, group }, or null. */
  function synonymAt(index, q, i) {
    for (var len = Math.min(index.maxPhrase, q.length - i); len >= 1; len--) {
      var key = q.slice(i, i + len).map(function (x) { return x.w; }).join(' ');
      // A plural finds its group too: "painters" -> "painter", "interns" -> "intern".
      var single = /[a-z]{3}s$/.test(key) && !/ss$/.test(key) ? key.slice(0, -1) : null;
      for (var g = 0; g < index.groups.length; g++) {
        if (index.groups[g].keys[key]) return { len: len, group: index.groups[g], words: key.split(' ') };
        if (single && index.groups[g].keys[single]) return { len: len, group: index.groups[g], words: single.split(' ') };
      }
    }
    return null;
  }

  /**
   * Splits a query into clauses { words, group, exact }. Synonym phrases (longest first) become
   * group clauses; other words are grouped by the whitespace-separated part they came from.
   */
  function parseQuery(index, query) {
    var q = [];
    String(query).split(/\s+/).forEach(function (chunk, c) {
      words(chunk).forEach(function (w) { q.push({ w: w, chunk: c }); });
    });
    var clauses = [];
    var i = 0;
    while (i < q.length) {
      var syn = synonymAt(index, q, i);
      if (syn) {
        clauses.push({ words: syn.words, group: syn.group, exact: true });
        i += syn.len;
        continue;
      }
      var j = i + 1;
      while (j < q.length && q[j].chunk === q[i].chunk && !synonymAt(index, q, j)) j++;
      var cw = q.slice(i, j).map(function (x) { return x.w; });
      var alts = stems(cw[cw.length - 1]).map(function (s) { return cw.slice(0, -1).concat([s]); });
      clauses.push({ words: cw, group: null, exact: false, alts: alts });
      i = j;
    }
    return clauses;
  }

  /** The clause's words, or one of its stems, appear in fieldWords. */
  function clauseIn(fieldWords, clause) {
    if (matchWords(fieldWords, clause.words, clause.exact)) return true;
    var alts = clause.alts || [];
    for (var a = 0; a < alts.length; a++) {
      if (matchWords(fieldWords, alts[a], clause.exact)) return true;
    }
    return false;
  }

  function firstMatch(list, clause) {
    for (var k = 0; k < list.length; k++) {
      var fw = list[k].words;
      if (clauseIn(fw, clause)) return list[k].text;
      if (clause.group) {
        for (var t = 0; t < clause.group.terms.length; t++) {
          if (matchWords(fw, clause.group.terms[t], true)) return list[k].text;
        }
      }
    }
    return null;
  }

  /** Why one clause matches an item, or null. Priority: role, open job title, description, name. */
  function clauseReason(item, clause) {
    var r = firstMatch(item.roles, clause);
    if (r) return { kind: 'role', text: r };
    r = firstMatch(item.titles, clause);
    if (r) return { kind: 'title', text: r };
    if (clauseIn(item.description, clause)) return { kind: 'description', text: null };
    if (clauseIn(item.name, clause)) return { kind: 'name', text: null };
    return null;
  }

  /** Edit distance with adjacent swaps counted as one edit ("avoinics" -> "avionics" is 1). */
  function distance(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    var d = [];
    for (var i = 0; i <= a.length; i++) { d[i] = [i]; }
    for (var j = 0; j <= b.length; j++) d[0][j] = j;
    for (i = 1; i <= a.length; i++) {
      for (j = 1; j <= b.length; j++) {
        var cost = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
    return d[a.length][b.length];
  }

  /** The closest site word to a misspelled one, or null. Words already on the site are left alone. */
  function correctWord(index, w) {
    if (w.length < 5 || /[0-9]/.test(w) || index.vocab[w]) return null;
    var max = w.length >= 8 ? 2 : 1;
    var best = null;
    var bestD = max + 1;
    for (var v in index.vocab) {
      if (v.length < 4 || v[0] !== w[0]) continue;
      if (v.lastIndexOf(w, 0) === 0) return null; // already a prefix of a site word
      var dd = distance(w, v, max);
      if (dd < bestD || (dd === bestD && best && index.vocab[v] > index.vocab[best])) { best = v; bestD = dd; }
    }
    return bestD <= max ? best : null;
  }

  /**
   * Returns { query: normalized, results: { id: { reasons: [...] } } } for matching items, plus
   * `corrected` (the words searched instead) when a typo fix was needed to find anything.
   * An empty query matches everything with no reasons.
   */
  function search(index, query) {
    var out = searchExact(index, query);
    if (!out.query || Object.keys(out.results).length) return out;
    var changed = false;
    var fixed = String(query).split(/\s+/).map(function (chunk) {
      return words(chunk).map(function (w) {
        var c = correctWord(index, w);
        if (c) { changed = true; return c; }
        return w;
      }).join(' ');
    }).filter(Boolean).join(' ');
    if (!changed) return out;
    var retry = searchExact(index, fixed);
    if (!Object.keys(retry.results).length) return out;
    retry.corrected = fixed;
    return retry;
  }

  function searchExact(index, query) {
    var clauses = parseQuery(index, query);
    var results = {};
    index.items.forEach(function (item) {
      var reasons = [];
      for (var c = 0; c < clauses.length; c++) {
        var r = clauseReason(item, clauses[c]);
        if (!r) return;
        reasons.push(r);
      }
      // Prefer one role (or job title) that satisfies every part of the query.
      if (clauses.length > 1) {
        var lists = [['role', item.roles], ['title', item.titles]];
        for (var l = 0; l < lists.length; l++) {
          for (var k = 0; k < lists[l][1].length; k++) {
            var one = [lists[l][1][k]];
            if (clauses.every(function (cl) { return firstMatch(one, cl); })) {
              results[item.id] = { reasons: [{ kind: lists[l][0], text: one[0].text }] };
              return;
            }
          }
        }
      }
      results[item.id] = { reasons: reasons };
    });
    return { query: normalize(query), results: results };
  }

  /** How strongly one item matches the query: title 3, keyword 2 (+1 if a keyword is exactly the query word), details 1. */
  function score(item, clauses) {
    var s = 0;
    clauses.forEach(function (c) {
      if (clauseIn(item.name, c)) s += 3;
      if (firstMatch(item.roles, c) || firstMatch(item.titles, c)) s += 2;
      var key = c.words.join(' ');
      if (item.roles.some(function (r) { return r.words.join(' ') === key; })) s += 1;
      if (clauseIn(item.description, c)) s += 1;
    });
    return s;
  }

  /**
   * Ranked search for site pages (training, resources, guide sections...): the best `limit` ids,
   * strongest first, ties in data order; entries with `last` (paid listings) come after the rest. Returns { ids: [...], total, corrected }.
   */
  function rank(index, query, limit) {
    var out = search(index, query);
    var clauses = parseQuery(index, out.corrected || query);
    var order = {};
    var byId = {};
    index.items.forEach(function (it, i) { order[it.id] = i; byId[it.id] = it; });
    var scored = Object.keys(out.results).map(function (id) {
      return { id: id, s: score(byId[id], clauses) };
    });
    // Entries marked `last` (paid resume writers) always follow the free ones, as on the page.
    scored.sort(function (a, b) {
      return byId[a.id].last - byId[b.id].last || b.s - a.s || order[a.id] - order[b.id];
    });
    var ids = scored.map(function (x) { return x.id; });
    return { ids: limit ? ids.slice(0, limit) : ids, total: ids.length, corrected: out.corrected };
  }

  /** One-line explanation for a card, or '' (name-only matches need no explanation). */
  function explain(reasons) {
    var parts = [];
    var seen = {};
    (reasons || []).forEach(function (r) {
      var s = r.kind === 'role' ? r.text : r.kind === 'title' ? 'open job “' + r.text + '”' : null;
      if (s && !seen[s]) { seen[s] = true; parts.push(s); }
    });
    if (!parts.length && (reasons || []).some(function (r) { return r.kind === 'description'; })) parts.push('description');
    return parts.length ? 'Matches: ' + parts.slice(0, 2).join(', ') : '';
  }

  /** Checks a synonyms object; returns a list of problems (empty when fine). */
  function validateSynonyms(synonyms) {
    var errors = [];
    if (!synonyms || !Array.isArray(synonyms.groups)) return ['synonyms.json: "groups" must be an array'];
    var owner = {};
    synonyms.groups.forEach(function (g, gi) {
      if (!Array.isArray(g)) { errors.push('group ' + (gi + 1) + ' must be an array'); return; }
      var keys = {};
      g.forEach(function (term) {
        if (typeof term !== 'string' || !normalize(term)) { errors.push('group ' + (gi + 1) + ': empty or non-text term'); return; }
        if (term !== term.toLowerCase()) errors.push('group ' + (gi + 1) + ': "' + term + '" must be lowercase');
        var key = words(term).join(' ');
        if (owner[key] !== undefined && owner[key] !== gi) errors.push('"' + term + '" is in more than one group');
        owner[key] = gi;
        keys[key] = true;
      });
      if (Object.keys(keys).length < 2) errors.push('group ' + (gi + 1) + ' needs at least 2 different terms');
    });
    return errors;
  }

  return {
    normalize: normalize,
    words: words,
    matchWords: matchWords,
    createIndex: createIndex,
    parseQuery: parseQuery,
    search: search,
    rank: rank,
    explain: explain,
    validateSynonyms: validateSynonyms,
  };
});
