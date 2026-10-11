import { buildIndex, search } from './search.js';
import { icon } from './icons.js';

const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ORDINAL = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th', '11th', '12th'];

// localStorage can be missing or throw (private mode, blocked storage); the app must work without it.
const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem('menudex.' + key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem('menudex.' + key, JSON.stringify(value)); } catch { /* not persisted */ }
  },
};

const state = {
  catalog: null,
  entries: [],        // flat catalog: [{slug, brand, model, firmware, file}]
  slug: null,
  cam: null,
  tabs: new Map(),
  features: new Map(),
  docs: [],
  mode: store.get('mode', 'photo'),
  query: '',
  navCount: 0,
};

const view = $('#view');

/* ---------- data ---------- */

async function loadJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

function flattenCatalog(catalog) {
  return catalog.brands.flatMap((b) => b.models.flatMap((m) => m.firmware.map((fw) => ({
    slug: `${b.id}/${m.id}/${fw.version}`, brandId: b.id, brand: b.name, modelId: m.id, model: m.name, firmware: fw.version, file: fw.file,
  }))));
}

function tokenText(t) {
  return state.cam.tokens?.[t]?.text || t;
}

function plainLabel(label) {
  return label.replace(/\{(\w+)\}/g, (_, t) => ` ${tokenText(t)} `).replace(/\s+/g, ' ').trim();
}

function indexCamera(cam) {
  state.cam = cam;
  state.tabs = new Map(cam.tabs.map((t, i) => [t.id, { ...t, index: i }]));
  const features = new Map();
  for (const page of cam.pages) {
    const tab = state.tabs.get(page.tab);
    for (const item of page.items) {
      let f = features.get(item.key);
      if (!f) {
        f = { ...item, plainLabel: plainLabel(item.label), locations: [], pageNames: [], tabNames: [] };
        features.set(item.key, f);
      }
      f.locations.push({ page, item, tab });
      f.pageNames.push(page.name);
      f.tabNames.push(tab.name, tab.short);
    }
  }
  state.features = features;
  state.docs = buildIndex([...features.values()]);
}

async function useCamera(slug) {
  if (state.slug === slug && state.cam) return;
  const entry = state.entries.find((e) => e.slug === slug);
  indexCamera(await loadJSON(entry.file));
  state.slug = slug;
  store.set('camera', slug);
}

/* ---------- locations ---------- */

// A page that exists in both Photo and Movie mode at the same position is one stop;
// otherwise each mode gets its own stop with its own page number.
function stops(f) {
  const out = [];
  for (const l of f.locations) {
    const pos = l.page.pos;
    const same = l.page.modes.length > 1 && l.page.modes.every((m) => String(pos[m]) === String(pos[l.page.modes[0]]));
    const groups = same ? [l.page.modes] : l.page.modes.map((m) => [m]);
    for (const modes of groups) out.push({ ...l, modes, id: `${l.page.id}:${modes.join('+')}` });
  }
  return out;
}

function stopFor(f, mode) {
  const all = stops(f);
  return all.find((s) => s.modes.includes(mode)) || all[0];
}

function modeOf(stop) {
  return stop.modes.includes(state.mode) ? state.mode : stop.modes[0];
}

function modeLabel(id) {
  return state.cam.modes.find((m) => m.id === id)?.label || id;
}

function modesHTML(modes) {
  return modes.map((m) => `<span class="mode-tag">${icon(m === 'movie' ? 'movie' : 'camera')}${esc(modeLabel(m))}</span>`).join('');
}

/* ---------- routing ---------- */

function parseRoute() {
  const [path, qs] = location.hash.replace(/^#\/?/, '').split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  const params = new URLSearchParams(qs || '');
  if (parts.length >= 3) return { slug: parts.slice(0, 3).join('/'), view: parts[3] || 'home', arg: parts[4], params };
  return { slug: null, view: 'home', arg: null, params };
}

function href(viewName, arg, params) {
  let h = `#/${state.slug}`;
  if (viewName && viewName !== 'home') h += `/${viewName}`;
  if (arg) h += `/${encodeURIComponent(arg)}`;
  const qs = params ? new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString() : '';
  return qs ? `${h}?${qs}` : h;
}

function itemHref(key, stop, sub) {
  return href('item', key, { at: stop?.id, sub });
}

async function route() {
  const r = parseRoute();
  let slug = r.slug;
  if (!state.entries.some((e) => e.slug === slug)) {
    const saved = store.get('camera', null);
    slug = state.entries.some((e) => e.slug === saved) ? saved : state.entries[0].slug;
    history.replaceState(null, '', `#/${slug}`);
    r.view = 'home';
  }
  try {
    await useCamera(slug);
  } catch (err) {
    view.innerHTML = `<div class="empty"><h2>Couldn't load this camera</h2><p>${esc(err.message)}</p><p>If you're offline, open the app once while online so it can save the camera data.</p></div>`;
    return;
  }
  renderChrome();
  if ($('#picker').open) $('#picker').close();
  if (r.view === 'item') renderItem(r.arg, r.params);
  else if (r.view === 'browse') renderBrowse(r.arg);
  else renderHome();
}

function go(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

/* ---------- shared bits ---------- */

function labelHTML(label) {
  return esc(label).replace(/\{(\w+)\}/g, (_, t) => {
    const tok = state.cam.tokens?.[t];
    if (!tok) return '';
    if (tok.glyph) return `<span class="tok" title="${esc(tok.text)}" aria-label="${esc(tok.text)}">${icon(tok.glyph)}</span>`;
    return `<span class="tok tok-text" title="${esc(tok.text)}">${esc(tok.short)}</span>`;
  });
}

function whereHTML(stop, mode) {
  const { tab, page, item } = stop;
  const [n, total] = page.pos[mode];
  return `<span class="where" style="--a:${tab.accent}">${icon(tab.icon)}<b>${esc(tab.short)}</b>`
    + `<span class="sep">›</span>${n}/${total} <span class="pg">${esc(page.name)}</span>`
    + `<span class="sep">›</span>row ${item.row}</span>`;
}

function screenHTML(page, mode, targetRow, sub) {
  const tab = state.tabs.get(page.tab);
  const [n, total] = page.pos[mode];
  const tabs = state.cam.tabs.map((t) => `<span class="cs-tab${t.id === tab.id ? ' on' : ''}" title="${esc(t.name)}">${icon(t.icon)}</span>`).join('');
  const dashes = Array.from({ length: total }, (_, i) => `<i${i + 1 === n ? ' class="on"' : ''}></i>`).join('');
  const rows = page.items.map((it) => {
    const f = state.features.get(it.key);
    const stop = stops(f).find((s) => s.page.id === page.id && s.modes.includes(mode));
    const target = it.row === targetRow;
    return `<li><a class="cs-row${target ? ' target' : ''}" href="${itemHref(it.key, stop, target ? sub : null)}"${target ? ' aria-current="location"' : ''}>`
      + `<span class="cs-n">${it.row}</span><span class="cs-label">${labelHTML(it.label)}</span>`
      + `${it.creative ? '<span class="cs-star" title="Creative Zone modes only">★</span>' : ''}`
      + `${target ? `<span class="cs-pin">${icon('pin')}</span>` : ''}</a></li>`;
  });
  for (let i = page.items.length; i < 7; i++) rows.push('<li class="cs-empty"></li>');
  return `<div class="cam-screen" style="--c:${tab.color};--a:${tab.accent}">
    <div class="cs-tabs">${tabs}</div>
    <div class="cs-dashes">${dashes}</div>
    <div class="cs-head"><span>${esc(page.name)}</span><span>${n}/${total}</span></div>
    <ol class="cs-rows">${rows.join('')}</ol>
  </div>`;
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 1800);
}

function setTitle(text) {
  document.title = text ? `${text} · ${state.cam.model} · Menudex` : `Menudex · ${state.cam.brand} ${state.cam.model}`;
}

/* ---------- chrome ---------- */

function renderChrome() {
  const e = state.entries.find((x) => x.slug === state.slug);
  $('#cameraBtn .cam-brand').textContent = `${e.brand} `;
  $('#cameraBtn .cam-model').textContent = e.model;
  $('#cameraBtn .cam-fw').textContent = `fw ${e.firmware}`;
  for (const b of document.querySelectorAll('.modes button')) {
    b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode));
  }
  $('#q').placeholder = `Search ${state.cam.model} settings…`;
  $('#zoneNote').textContent = state.cam.zones.note;
  $('#source').innerHTML = `Menu data: <a href="${esc(state.cam.source.url)}" target="_blank" rel="noopener">${esc(state.cam.source.name)}</a>, retrieved ${esc(state.cam.source.retrieved)}. Not affiliated with ${esc(state.cam.brand)}.`;
}

/* ---------- home & results ---------- */

function renderHome() {
  setTitle('');
  const q = state.query.trim();
  if (q) return renderResults(q);
  const cam = state.cam;
  const recent = store.get(`recent.${state.slug}`, []).map((k) => state.features.get(k)).filter(Boolean);
  const tiles = cam.tabs.map((t) => {
    const n = cam.pages.filter((p) => p.tab === t.id && p.modes.includes(state.mode)).length;
    return `<a class="tile" href="${href('browse', t.id)}" style="--a:${t.accent};--c:${t.color}">
      <span class="tile-ico">${icon(t.icon)}</span><span class="tile-name">${esc(t.name)}</span><span class="tile-n">${n} page${n === 1 ? '' : 's'}</span></a>`;
  }).join('');
  view.innerHTML = `
    <section class="intro">
      <h1>Where's that setting?</h1>
      <p>Type what you're after. You get the exact <b>tab</b>, <b>page</b> and <b>row</b> on your ${esc(cam.model)}, step by step.</p>
    </section>
    <section>
      <h2 class="label">Popular</h2>
      <div class="chips">${(cam.popular || []).map((p) => `<button class="chip" data-q="${esc(p)}">${esc(p)}</button>`).join('')}</div>
    </section>
    ${recent.length ? `<section><h2 class="label">${icon('history')} Recently viewed</h2><div class="list">${recent.map((f) => resultHTML(f, null)).join('')}</div></section>` : ''}
    <section>
      <h2 class="label">Browse the menu <span class="muted">· ${esc(modeLabel(state.mode))} mode</span></h2>
      <div class="tiles">${tiles}</div>
    </section>`;
}

function resultHTML(f, sub) {
  const stop = stopFor(f, state.mode);
  const mode = modeOf(stop);
  const other = !stop.modes.includes(state.mode);
  return `<a class="result" href="${itemHref(f.key, stop, sub)}" style="--a:${stop.tab.accent}">
    <div class="r-title">${labelHTML(f.label)}${sub ? `<span class="r-sub">› ${esc(sub)}</span>` : ''}</div>
    <div class="r-where">${whereHTML(stop, mode)}${other ? `<span class="badge">${esc(modeLabel(mode))} mode</span>` : ''}${f.creative ? '<span class="badge star" title="Creative Zone modes only">★</span>' : ''}</div>
    ${f.desc ? `<div class="r-desc">${esc(f.desc)}</div>` : ''}
  </a>`;
}

function renderResults(q) {
  const hits = search(state.docs, q);
  if (!hits.length) {
    view.innerHTML = `<div class="empty"><h2>No match for “${esc(q)}”</h2>
      <p>Try another word for it (e.g. “silent” instead of “quiet shutter”), or browse the menu tab by tab.</p>
      <div class="tiles compact">${state.cam.tabs.map((t) => `<a class="tile" href="${href('browse', t.id)}" style="--a:${t.accent};--c:${t.color}"><span class="tile-ico">${icon(t.icon)}</span><span class="tile-name">${esc(t.name)}</span></a>`).join('')}</div></div>`;
    return;
  }
  view.innerHTML = `<p class="count">${hits.length} result${hits.length === 1 ? '' : 's'} · positions for <b>${esc(modeLabel(state.mode))}</b> mode</p>
    <div class="list">${hits.map((h) => resultHTML(state.features.get(h.key), h.sub)).join('')}</div>`;
}

/* ---------- item (the walk) ---------- */

// A camera file may spell out how a control is used ("Press the INFO button…");
// otherwise it's a dial to turn.
function controlHint(ctrl) {
  return ctrl.hint || `Turn the ${ctrl.label}${ctrl.alt ? `, ${ctrl.alt}` : ''}.`;
}

function walkSteps(stop, mode, sub) {
  const { tab, page, item } = stop;
  const cam = state.cam;
  const c = cam.controls;
  const [n, total] = page.pos[mode];
  const steps = [];
  if (stop.modes.length === 1) steps.push({ text: esc(cam.modes.find((m) => m.id === mode).how) });
  steps.push({ text: `Press <kbd>${esc(c.open.label)}</kbd>.` });
  steps.push({
    // The AF tab's icon is the text "AF"; don't print it twice.
    text: `Go to the <b class="tabname" style="--a:${tab.accent}">${tab.icon === 'af' ? '' : icon(tab.icon)}${esc(tab.name)}</b> tab, the ${esc(tab.colorName)} one (${ORDINAL[tab.index]} of ${cam.tabs.length}).`,
    hint: controlHint(c.tab),
  });
  steps.push({
    text: `Go to page <b>${n} of ${total}</b>: “${esc(page.name)}”`,
    hint: `${controlHint(c.page)} “${n}/${total}” shows at the top right.`,
  });
  const graphic = page.layout === 'graphic';
  steps.push({
    text: `${graphic ? 'Pick' : 'Select row'} <b>${item.row}</b>: “${labelHTML(item.label)}”, then press <kbd>${esc(c.confirm.label)}</kbd>.`,
    hint: controlHint(c.row),
  });
  if (sub) steps.push({ text: `Choose “<b>${esc(sub)}</b>”` });
  return steps;
}

function directionsText(f, stop, mode, sub) {
  const { tab, page, item } = stop;
  const [n, total] = page.pos[mode];
  const cam = state.cam;
  return `${cam.brand} ${cam.model} (fw ${cam.firmware}): ${f.plainLabel}${sub ? ` › ${sub}` : ''}\n`
    + `${stop.modes.length === 1 ? `${modeLabel(mode)} mode · ` : ''}MENU › ${tab.name} tab (${tab.colorName}, ${ORDINAL[tab.index]}) › page ${n}/${total} “${page.name}” › row ${item.row}${sub ? ` › ${sub}` : ''}`;
}

function renderItem(key, params) {
  const f = state.features.get(key);
  if (!f) {
    view.innerHTML = `<div class="empty"><h2>Not on this camera</h2><p>That setting isn't in the ${esc(state.cam.model)} menu data.</p><a class="btn" href="${href('home')}">Search instead</a></div>`;
    return;
  }
  const all = stops(f);
  const stop = all.find((s) => s.id === params.get('at')) || stopFor(f, state.mode);
  const mode = modeOf(stop);
  const sub = params.get('sub') || '';
  const cam = state.cam;
  setTitle(f.plainLabel);

  const recent = store.get(`recent.${state.slug}`, []).filter((k) => k !== key);
  store.set(`recent.${state.slug}`, [key, ...recent].slice(0, 6));

  const elsewhere = !stop.modes.includes(state.mode);
  const steps = walkSteps(stop, mode, sub);
  const notes = stop.page.notes || [];
  const opts = (f.opts || []).filter((o) => !/^\d+$/.test(o));

  view.innerHTML = `
    <article class="item" style="--a:${stop.tab.accent}">
      <button class="back" type="button" id="backBtn">${icon('back')} Back</button>
      <h1>${labelHTML(f.label)}${sub ? `<span class="h-sub">› ${esc(sub)}</span>` : ''}</h1>
      <div class="meta">
        ${modesHTML([...new Set(all.flatMap((s) => s.modes))])}
        ${f.creative ? '<span class="badge star">★ Creative Zone only</span>' : ''}
        ${f.fw ? `<span class="badge new">fw ${esc(cam.firmware)}</span>` : ''}
      </div>
      ${f.desc ? `<p class="desc">${esc(f.desc)}</p>` : ''}

      ${all.length > 1 ? `<div class="stops" role="tablist" aria-label="Where it appears">${all.map((s) => `
        <a role="tab" class="stop${s.id === stop.id ? ' on' : ''}" aria-selected="${s.id === stop.id}" href="${itemHref(key, s, sub)}" style="--a:${s.tab.accent}">
          <span class="stop-mode">${modesHTML(s.modes)}</span>${whereHTML(s, modeOf(s))}</a>`).join('')}</div>` : ''}

      ${elsewhere ? `<div class="callout">${icon('info')}<div>You're set to <b>${esc(modeLabel(state.mode))}</b> mode, but this lives in the <b>${esc(modeLabel(mode))}</b> menus. Flip the switch first.</div></div>` : ''}

      <div class="walk">
        ${screenHTML(stop.page, mode, stop.item.row, sub)}
        <ol class="steps">${steps.map((s) => `<li><div class="step-text">${s.text}</div>${s.hint ? `<div class="step-hint">${esc(s.hint)}</div>` : ''}</li>`).join('')}</ol>
      </div>
      <p class="touch-note">${esc(cam.controls.touch)}</p>

      ${f.creative ? `<div class="callout star">${icon('starOutline')}<div><b>Creative Zone only.</b> Shows in ${esc(cam.zones.creative)} modes. In ${esc(cam.zones.basic)} it's hidden, and the rows below it move up.</div></div>` : ''}
      ${f.fw ? `<div class="callout new">${icon('download')}<div>${esc(f.fw)}</div></div>` : ''}
      ${notes.map((n) => `<div class="callout">${icon('info')}<div>${esc(n)}</div></div>`).join('')}

      ${f.subs?.length ? `<section><h2 class="label">Inside this menu</h2><div class="chips">${f.subs.map((s) => `
        <a class="chip${s === sub ? ' on' : ''}" href="${itemHref(key, stop, s === sub ? null : s)}">${esc(s)}</a>`).join('')}</div></section>` : ''}
      ${opts.length ? `<details class="opts"><summary>Options & terms on the manual page (${opts.length})</summary><div class="chips small">${opts.map((o) => `<span class="chip static">${esc(o)}</span>`).join('')}</div></details>` : ''}

      <div class="actions">
        <button class="btn" type="button" id="shareBtn">${icon('share')} Copy directions</button>
        ${f.ref ? `<a class="btn ghost" href="${esc(cam.source.url + f.ref)}" target="_blank" rel="noopener">${icon('ext')} Canon manual</a>` : ''}
      </div>
    </article>`;

  $('#backBtn').addEventListener('click', () => (state.navCount > 0 ? history.back() : go(href('home'))));
  $('#shareBtn').addEventListener('click', async () => {
    const text = directionsText(f, stop, mode, sub);
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) await navigator.share({ title: f.plainLabel, text });
      else { await navigator.clipboard.writeText(text); toast('Directions copied'); }
    } catch (err) {
      if (err?.name !== 'AbortError') toast("Couldn't copy on this device");
    }
  });
  $('.cs-row.target')?.scrollIntoView?.({ block: 'nearest' });
}

/* ---------- browse ---------- */

function renderBrowse(tabId) {
  const cam = state.cam;
  const tab = state.tabs.get(tabId) || state.tabs.get(cam.tabs[0].id);
  setTitle(`${tab.name} tab`);
  const pages = cam.pages.filter((p) => p.tab === tab.id && p.modes.includes(state.mode))
    .sort((a, b) => a.pos[state.mode][0] - b.pos[state.mode][0]);
  view.innerHTML = `
    <nav class="tabstrip" aria-label="Menu tabs">${cam.tabs.map((t) => `
      <a class="ts${t.id === tab.id ? ' on' : ''}" href="${href('browse', t.id)}" style="--a:${t.accent};--c:${t.color}" title="${esc(t.name)}"${t.id === tab.id ? ' aria-current="page"' : ''}>${icon(t.icon)}</a>`).join('')}</nav>
    <header class="browse-head" style="--a:${tab.accent}">
      <h1>${icon(tab.icon)} ${esc(tab.name)}</h1>
      <p>${ORDINAL[tab.index]} tab · ${esc(tab.colorName)} · ${pages.length} page${pages.length === 1 ? '' : 's'} in ${esc(modeLabel(state.mode))} mode</p>
    </header>
    <div class="pages">${pages.map((p) => `<section class="page-block">${screenHTML(p, state.mode, null, null)}
      ${(p.notes || []).map((n) => `<p class="page-note">${esc(n)}</p>`).join('')}</section>`).join('')}</div>`;
}

/* ---------- camera picker ---------- */

function openPicker() {
  const dlg = $('#picker');
  const cur = state.entries.find((e) => e.slug === state.slug);
  const brandSel = $('#pickBrand');
  const modelSel = $('#pickModel');
  const fwSel = $('#pickFw');
  const uniq = (list, key) => [...new Map(list.map((e) => [e[key], e])).values()];
  const fill = (sel, list, valueKey, labelKey, selected) => {
    sel.innerHTML = list.map((e) => `<option value="${esc(e[valueKey])}"${e[valueKey] === selected ? ' selected' : ''}>${esc(e[labelKey])}</option>`).join('');
  };
  const update = (level) => {
    if (level <= 0) fill(brandSel, uniq(state.entries, 'brandId'), 'brandId', 'brand', cur.brandId);
    const models = uniq(state.entries.filter((e) => e.brandId === brandSel.value), 'modelId');
    if (level <= 1) fill(modelSel, models, 'modelId', 'model', cur.modelId);
    const fws = state.entries.filter((e) => e.brandId === brandSel.value && e.modelId === modelSel.value);
    fill(fwSel, fws, 'firmware', 'firmware', cur.firmware);
  };
  brandSel.onchange = () => update(1);
  modelSel.onchange = () => update(2);
  update(0);
  dlg.showModal();
}

function pickCamera(ev) {
  ev.preventDefault();
  const slug = `${$('#pickBrand').value}/${$('#pickModel').value}/${$('#pickFw').value}`;
  $('#picker').close();
  if (slug !== state.slug) go(`#/${slug}`);
}

/* ---------- boot ---------- */

function bindChrome() {
  const input = $('#q');
  let pending = 0;
  input.addEventListener('input', () => {
    state.query = input.value;
    $('#clearQ').hidden = !input.value;
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(() => {
      if (parseRoute().view !== 'home') go(href('home'));
      else renderHome();
    });
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { input.value = ''; input.dispatchEvent(new Event('input')); }
    if (e.key === 'Enter') { input.blur(); const first = $('.result'); if (first && e.ctrlKey) first.click(); }
  });
  $('#clearQ').addEventListener('click', () => { input.value = ''; input.dispatchEvent(new Event('input')); input.focus(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== input && !e.target.closest('input,select,textarea')) { e.preventDefault(); input.focus(); }
  });
  view.addEventListener('click', (e) => {
    const chip = e.target.closest('button[data-q]');
    if (!chip) return;
    input.value = chip.dataset.q;
    input.dispatchEvent(new Event('input'));
  });
  for (const b of document.querySelectorAll('.modes button')) {
    b.addEventListener('click', () => {
      state.mode = b.dataset.mode;
      store.set('mode', state.mode);
      const r = parseRoute();
      // An item link pins its location; drop it so the item re-opens at the new mode's spot.
      if (r.view === 'item') go(href('item', r.arg, { sub: r.params.get('sub') }));
      else route();
    });
  }
  $('.brand').addEventListener('click', () => { input.value = ''; state.query = ''; $('#clearQ').hidden = true; });
  $('#cameraBtn').addEventListener('click', openPicker);
  $('#pickForm').addEventListener('submit', pickCamera);
  $('#pickCancel').addEventListener('click', () => $('#picker').close());
  window.addEventListener('hashchange', () => { state.navCount++; route().then(() => window.scrollTo(0, 0)); });

  let deferred = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; $('#installBtn').hidden = false; });
  $('#installBtn').addEventListener('click', async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    deferred = null;
    $('#installBtn').hidden = true;
  });
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !matchMedia('(display-mode: standalone)').matches;
  $('#iosHint').hidden = !ios;
}

async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('sw.js');
    await navigator.serviceWorker.ready;
    $('#offline').innerHTML = `${icon('check')} Works offline`;
  } catch { /* still works online */ }
}

async function boot() {
  bindChrome();
  try {
    state.catalog = await loadJSON('data/catalog.json');
  } catch (err) {
    view.innerHTML = `<div class="empty"><h2>Couldn't load the camera list</h2><p>${esc(err.message)}</p></div>`;
    return;
  }
  state.entries = flattenCatalog(state.catalog);
  await route();
  registerSW();
}

boot();
