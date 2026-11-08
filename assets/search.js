/* Work At Hill: search engine shared by the page (window.WorkAtHillSearch) and Node tests (module.exports).
 *
 * Rules:
 * - Text is lowercased, accents are dropped, "a&p" becomes "ap", and anything else that isn't a
 *   letter or digit splits words ("F-35" -> "f 35").
 * - A query term of 2 characters or fewer must equal a whole word ("lo" never matches "Lockheed").
 *   Longer terms match the start of a word ("paint" matches "painter").
 * - Each whitespace-separated query part must match somewhere (AND); a part like "F-35" is matched
 *   as one phrase. Parts are matched against the employer's name, description, researched roles
 *   and live job titles.
 * - A query word or phrase that belongs to a synonym group matches whole words only (a plural "s"
 *   is allowed for terms longer than 2 letters), and also matches the group's other terms, but only in roles and job titles, so
 *   "admin" -> "office" doesn't hit "F-16 program office", and "office" doesn't hit "officer".
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
        name: words(e.name || ''),
        description: words(e.description || ''),
        roles: list(e.roles),
        titles: list(e.titles),
      };
    });
    return { items: items, groups: groups, maxPhrase: maxPhrase };
  }

  /** The synonym group whose longest term starts at q[i], as { len, group }, or null. */
  function synonymAt(index, q, i) {
    for (var len = Math.min(index.maxPhrase, q.length - i); len >= 1; len--) {
      var key = q.slice(i, i + len).map(function (x) { return x.w; }).join(' ');
      for (var g = 0; g < index.groups.length; g++) {
        if (index.groups[g].keys[key]) return { len: len, group: index.groups[g] };
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
        clauses.push({ words: q.slice(i, i + syn.len).map(function (x) { return x.w; }), group: syn.group, exact: true });
        i += syn.len;
        continue;
      }
      var j = i + 1;
      while (j < q.length && q[j].chunk === q[i].chunk && !synonymAt(index, q, j)) j++;
      clauses.push({ words: q.slice(i, j).map(function (x) { return x.w; }), group: null, exact: false });
      i = j;
    }
    return clauses;
  }

  function firstMatch(list, clause) {
    for (var k = 0; k < list.length; k++) {
      var fw = list[k].words;
      if (matchWords(fw, clause.words, clause.exact)) return list[k].text;
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
    if (matchWords(item.description, clause.words, clause.exact)) return { kind: 'description', text: null };
    if (matchWords(item.name, clause.words, clause.exact)) return { kind: 'name', text: null };
    return null;
  }

  /**
   * Returns { query: normalized, results: { id: { reasons: [...] } } } for matching items.
   * An empty query matches everything with no reasons.
   */
  function search(index, query) {
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
    explain: explain,
    validateSynonyms: validateSynonyms,
  };
});
