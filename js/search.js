// Client-side search over one camera's menu features.
// Each feature is a document; each sub-menu ("Auto range") is its own document
// pointing back at the feature, so a search can land on the exact sub-option.

const STOP = new Set(('a an the to how where is do i my in of for on set setting settings change ' +
  'turn menu find camera what which can with and or it up get use using').split(' '));

const WEIGHTS = { label: 10, sub: 9, kw: 7, parent: 4, page: 3, tab: 2.5, topics: 2, desc: 2, opts: 1.5 };

export function normalize(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\{(\w+)\}/g, ' $1 ').replace(/[→↔]/g, ' ');
}

// "Wi-Fi" yields both "wi", "fi" and "wifi" so either spelling matches.
export function tokens(s) {
  const n = normalize(s);
  const split = n.replace(/[^a-z0-9+]+/g, ' ').trim().split(' ');
  const joined = n.replace(/([a-z0-9])[-.'’](?=[a-z0-9])/g, '$1').replace(/[^a-z0-9+]+/g, ' ').trim().split(' ');
  return [...new Set([...split, ...joined])].filter(Boolean);
}

function queryTokens(q) {
  const n = normalize(q).replace(/([a-z0-9])[-.'’](?=[a-z0-9])/g, '$1').replace(/[^a-z0-9+]+/g, ' ').trim();
  const all = n ? n.split(' ') : [];
  const kept = all.filter((t) => !STOP.has(t));
  return { phrase: n, list: kept.length ? kept : all };
}

function lev(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

function tokenScore(q, t) {
  if (t === q) return 1;
  if (q.length > 3 && q.endsWith('s') && t === q.slice(0, -1)) return 0.95;
  if (t.startsWith(q)) return q.length >= 2 ? 0.85 : 0.3;
  if (q.length >= 4 && t.includes(q)) return 0.5;
  if (q.length >= 4 && t.length >= 3) {
    const d = lev(q, t, 2);
    if (d === 1) return 0.6;
    if (d === 2 && q.length >= 7) return 0.4;
  }
  if (q.length >= 5 && t.length > q.length && lev(q, t.slice(0, q.length), 1) === 1) return 0.5;
  return 0;
}

function phrases(list) {
  return list.map((s) => normalize(s).replace(/([a-z0-9])[-.'’](?=[a-z0-9])/g, '$1').replace(/[^a-z0-9+]+/g, ' ').trim());
}

function makeDoc(feature, fields, sub) {
  const doc = { key: feature.key, sub, fields: {}, phrases: {} };
  for (const [name, values] of Object.entries(fields)) {
    const list = (Array.isArray(values) ? values : [values]).filter(Boolean);
    if (!list.length) continue;
    doc.fields[name] = [...new Set(list.flatMap(tokens))];
    if (name === 'label' || name === 'sub' || name === 'kw') doc.phrases[name] = phrases(list);
  }
  return doc;
}

// features: [{key, label, subs, opts, topics, kw, desc, pageNames, tabNames}]
export function buildIndex(features) {
  const docs = [];
  for (const f of features) {
    const doc = makeDoc(f, {
      label: f.plainLabel, kw: f.kw, page: f.pageNames, tab: f.tabNames,
      topics: f.topics, desc: f.desc, opts: f.opts,
    }, null);
    // Words a sub-menu adds beyond its parent's name ("Min. shutter spd." under "ISO speed settings").
    const own = new Set(tokens(f.plainLabel));
    doc.subWords = (f.subs || []).map((s) => ({ sub: s, toks: tokens(s).filter((t) => !own.has(t) && !STOP.has(t)) }))
      .filter((s) => s.toks.length);
    docs.push(doc);
    for (const s of f.subs || []) {
      docs.push(makeDoc(f, { sub: s, parent: f.plainLabel, page: f.pageNames, tab: f.tabNames }, s));
    }
  }
  return docs;
}

function scoreDoc(doc, q) {
  let total = 0;
  for (const qt of q.list) {
    let best = 0;
    for (const [name, toks] of Object.entries(doc.fields)) {
      const w = WEIGHTS[name];
      for (const t of toks) {
        const s = tokenScore(qt, t);
        if (s && s * w > best) best = s * w;
      }
    }
    if (!best) return 0;
    total += best;
  }
  if (q.phrase.length > 2) {
    for (const [name, list] of Object.entries(doc.phrases)) {
      for (const p of list) {
        if (p === q.phrase) total += name === 'kw' ? 12 : 20;
        else if (p.includes(q.phrase)) total += name === 'kw' ? 6 : 10;
      }
    }
  }
  return total;
}

// Best score per feature. A sub-menu hit wins only when it clearly beats the feature itself.
export function search(docs, query, limit = 40) {
  const q = queryTokens(query);
  if (!q.list.length) return [];
  const byKey = new Map();
  for (const doc of docs) {
    const score = scoreDoc(doc, q);
    if (!score) continue;
    const prev = byKey.get(doc.key);
    // The feature document comes before its sub-menu documents.
    if (!prev || score > prev.score * 1.15) byKey.set(doc.key, { key: doc.key, score, sub: doc.sub, doc });
  }
  const hits = [...byKey.values()].sort((a, b) => b.score - a.score).slice(0, limit);
  for (const h of hits) {
    if (!h.sub) h.sub = bestSub(h.doc, q);
    delete h.doc;
  }
  return hits;
}

// When the feature itself won but the query also names one of its sub-menus
// ("auto iso min shutter" -> Min. shutter spd.), point at that sub-menu.
function bestSub(doc, q) {
  let best = null;
  // Camera labels abbreviate ("min.", "spd."), so a query word may extend a sub-menu word.
  const matches = (qt, t) => tokenScore(qt, t) >= 0.6 || (t.length >= 3 && qt.startsWith(t));
  const label = doc.fields.label || [];
  for (const { sub, toks } of doc.subWords || []) {
    const hit = toks.filter((t) => q.list.some((qt) => matches(qt, t))).length;
    const ratio = hit / toks.length;
    // One shared word is enough only if the sub-menu plus its parent's name explain the whole query.
    const explained = q.list.every((qt) => toks.some((t) => matches(qt, t)) || label.some((t) => matches(qt, t)));
    if ((hit >= 2 || (hit && ratio >= 0.5 && explained)) && (!best || hit > best.hit || (hit === best.hit && ratio > best.ratio))) {
      best = { sub, hit, ratio };
    }
  }
  return best ? best.sub : null;
}
