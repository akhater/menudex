"""Build a Menudex camera file from a Canon online manual (cam.start.canon).

Canon's HTML manuals have one "Tab Menus: ..." page per menu tab. Each lists the
secondary tabs (pages) in order with numbered rows, and links every row to a
feature page. This script reads those pages, pulls the sub-menu names out of
the linked feature pages, merges a hand-written enrich file (descriptions,
search synonyms) and writes the JSON the app loads.

Stdlib only:
    python tools/canon/extract.py tools/canon/cameras/eos-r6-mark-iii.json
"""
import html
import json
import os
import re
import sys
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CACHE = os.path.join(ROOT, '.cache', 'canon')

# Label icons that carry meaning; every other icon in a label is decorative.
ICON_TOKENS = {
    'icon_still': 'stills', 'icon_mov': 'movie', 'icon_playback': 'play',
    'icon_dial_bk': 'main', 'icon_dial2_bk': 'qcd2', 'icon_sub-dial_bk': 'qcd1',
    'icon_controlring': 'ring', 'icon_multi-controller_menu': 'mc',
    'icon_shutterbtn-halfpress': 'half', 'icon_assigned_button': 'assign', 'icon_Q1': 'q1',
}
TOKEN_TEXT = {
    'stills': 'Stills', 'movie': 'Movie', 'play': 'Playback', 'main': 'Main dial',
    'qcd1': 'Quick control dial 1', 'qcd2': 'Quick control dial 2', 'ring': 'Control ring',
    'mc': 'Multi-controller', 'half': 'Shutter button half-press', 'assign': 'Assigned button', 'q1': 'Q1',
}
# Values that show up as "Select [x]" but are choices, not sub-menus.
NOT_SUBMENU = {
    'ok', 'cancel', 'enable', 'disable', 'on', 'off', 'yes', 'no', 'auto', 'manual',
    'apply', 'set', 'register', 'done', 'save', 'load', 'start', 'reset', 'clear',
    'connect', 'none', 'standard', 'low', 'high', 'all', 'yes, erase', 'erase',
}


def fetch(base, name):
    path = os.path.join(CACHE, base.strip('/').split('/')[-3], name)
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        req = urllib.request.Request(base + name, headers={'User-Agent': 'Mozilla/5.0 Menudex'})
        with urllib.request.urlopen(req, timeout=60) as r:
            data = r.read()
        with open(path, 'wb') as f:
            f.write(data)
        time.sleep(0.2)
    with open(path, encoding='utf-8') as f:
        s = f.read()
    return s[s.find('<main'):s.find('</main>')]


def text(fragment, tokens=False):
    def icon(m):
        src = os.path.basename(m.group(1))
        for prefix, tok in ICON_TOKENS.items():
            if src.startswith(prefix + '_') or src.startswith(prefix + '.'):
                return '{%s}' % tok if tokens else ' '
        return ' '
    fragment = re.sub(r'<img[^>]*src="([^"]+)"[^>]*>', icon, fragment)
    fragment = re.sub(r'<[^>]+>', '', fragment)
    out = html.unescape(re.sub(r'\s+', ' ', fragment)).strip()
    return re.sub(r'\s*(\{\w+\})\s*', r'\1', out).strip() if tokens else out


def plain(label):
    return re.sub(r'\{(\w+)\}', lambda m: ' %s ' % TOKEN_TEXT.get(m.group(1), m.group(1)), label).replace('  ', ' ').strip()


def slug(s):
    s = re.sub(r'\{(\w+)\}', r' \1 ', s)
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')


def parse_listing(main):
    """Pages and numbered rows from a 'Tab Menus: ...' page."""
    pages = []
    parts = re.split(r'(<p id="[^"]+" class="stc-title">.*?</p>)', main, flags=re.S)
    for head, body in zip(parts[1::2], parts[2::2]):
        items = []
        rows = re.split(r'<li( class="adv-mark")?><span class="caption">\((\d+)\)</span>', body)
        for i in range(1, len(rows) - 2, 3):
            star, row, frag = rows[i], int(rows[i + 1]), rows[i + 2]
            frag = re.split(r'</li>\s*</ul>\s*</li>', frag)[0]
            a = re.search(r'<a class="link-title" href="([^"]+)">(.*?)</a>', frag, re.S)
            if a:
                label, ref = text(a.group(2), True), a.group(1)
            else:
                sp = re.search(r'<span class="tm[^"]*">(.*?)</span>', frag, re.S)
                label, ref = text(sp.group(1), True), None
            links = [{'label': text(t), 'ref': h} for h, t in
                     re.findall(r'<li class="list-indent"><a href="([^"]+)">(.*?)</a>', frag, re.S)]
            items.append({'row': row, 'label': label, 'ref': ref or (links[0]['ref'] if links else None),
                          'creative': bool(star), 'links': links})
        notes = [re.sub(r'^Note\s*', '', text(n)) for n in re.findall(r'<div class="note-box">(.*?)</div>', body, re.S)]
        pages.append({'name': text(head), 'items': items, 'notes': notes})
    return pages


def section(main, anchor):
    """HTML belonging to one anchor: up to the next anchor at the same or a higher level."""
    if not anchor:
        return main
    start = main.find('id="%s"' % anchor)
    if start < 0:
        return main
    start = main.rfind('<', 0, start)
    prefix, num = anchor.rsplit('_', 1)
    for m in re.finditer(r'id="%s_([\d-]+)"' % re.escape(prefix), main[start + 10:]):
        if m.group(1).count('-') <= num.count('-'):
            return main[start:start + 10 + m.start()]
    return main[start:]


def feature_details(base, ref, own_label):
    name, _, anchor = ref.partition('#')
    sec = section(fetch(base, name), anchor)
    subs, seen = [], {own_label.lower()}
    for step in re.findall(r'<p class="step-title">(.*?)</p>', sec, re.S):
        if not re.match(r'\s*(Select|Choose|Set|Press)', text(step)):
            continue
        for ui in re.findall(r'<span class="ui[^"]*">(.*?)</span>', step, re.S):
            t = text(ui)
            if t and t.lower() not in seen and t.lower() not in NOT_SUBMENU and len(t) > 1:
                seen.add(t.lower())
                subs.append(t)
    opts = []
    for ui in re.findall(r'<span class="ui[^"]*">(.*?)</span>', sec, re.S):
        t = text(ui)
        if t and t.lower() not in seen and len(t) > 1 and len(opts) < 60:
            seen.add(t.lower())
            opts.append(t)
    heads = [text(h) for h in re.findall(r'<h[23][^>]*>(.*?)</h[23]>', sec, re.S)]
    title = re.search(r'<h1[^>]*>(.*?)(?:<div|</h1>)', fetch(base, name), re.S)
    return {'title': text(title.group(1)) if title else '', 'subs': subs, 'opts': opts,
            'topics': [h for h in heads if h and h.lower() != own_label.lower()][:12]}


def build(cfg_path):
    with open(cfg_path, encoding='utf-8') as f:
        cfg = json.load(f)
    base = cfg['source']['url']
    enrich = {}
    if cfg.get('enrich'):
        with open(os.path.join(os.path.dirname(cfg_path), cfg['enrich']), encoding='utf-8') as f:
            enrich = json.load(f)

    pages, unused = [], set(enrich) - {'_pages'}
    for listing in cfg['listings']:
        for idx, p in enumerate(parse_listing(fetch(base, listing['page']))):
            modes = list(listing.get('modes', cfg['modes_all']))
            name = p['name']
            for suffix, mode in cfg.get('page_mode_suffixes', {}).items():
                if name.endswith(suffix):
                    name, modes = name[:-len(suffix)].strip(), [mode]
            page = {'id': '%s-%s-%d' % (listing['tab'], listing.get('key', 'all'), idx + 1),
                    'tab': listing['tab'], 'modes': modes, 'name': name, 'items': []}
            extra = enrich.get('_pages', {}).get(page['id'], {})
            page.update(extra)
            if p['notes']:
                page['notes'] = extra.get('notes', []) + p['notes']
            for it in p['items']:
                key = slug(it['label'])
                det = feature_details(base, it['ref'], plain(it['label'])) if it['ref'] else {}
                item = {'key': key, 'row': it['row'], 'label': it['label'], 'creative': it['creative'],
                        'ref': it['ref'], 'subs': det.get('subs', []), 'opts': det.get('opts', []),
                        'topics': det.get('topics', [])}
                if it['links']:
                    item['links'] = it['links']
                page['items'].append(item)
            pages.append(page)

    # Feature pages mention other menu items ("see Shutter mode"); those are
    # cross-references, not sub-menus, and would send searches to the wrong row.
    # Strings with a gap where an icon was ("On ( / )") are unreadable.
    labels = {re.sub(r'\{\w+\}', '', i['label']).strip().lower() for p in pages for i in p['items']}
    labels |= {plain(i['label']).lower() for p in pages for i in p['items']}
    broken = re.compile(r'\(\s*[:/)]|\s\)|\[\s|\s\]|^\W+$')
    for p in pages:
        for i in p['items']:
            own = re.sub(r'\{\w+\}', '', i['label']).strip().lower()
            for field in ('subs', 'opts'):
                i[field] = [s for s in i[field] if s.lower() != own and s.lower() not in labels and not broken.search(s)]
            unused.discard(i['key'])
            i.update(enrich.get(i['key'], {}))

    # Page numbers as shown on screen ("2/10") depend on the Photo/Movie switch.
    for mode in cfg['modes_all']:
        for tab in cfg['tabs']:
            visible = [p for p in pages if p['tab'] == tab['id'] and mode in p['modes']]
            for n, p in enumerate(visible, 1):
                p.setdefault('pos', {})[mode] = [n, len(visible)]

    out = {k: cfg[k] for k in ('schema', 'brand', 'model', 'firmware', 'slug', 'source', 'controls',
                                'modes', 'zones', 'tabs', 'tokens', 'popular', 'notes') if k in cfg}
    out['source']['retrieved'] = time.strftime('%Y-%m-%d')
    out['pages'] = pages
    dest = os.path.join(ROOT, cfg['out'])
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(dest, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    n_items = sum(len(p['items']) for p in pages)
    print('wrote %s: %d pages, %d rows' % (cfg['out'], len(pages), n_items))
    missing = sorted({i['key'] for p in pages for i in p['items'] if i['key'] not in enrich})
    if missing:
        print('no enrich entry for %d keys: %s' % (len(missing), ', '.join(missing)))
    if unused:
        print('enrich keys not matched: %s' % ', '.join(sorted(unused)))


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    build(sys.argv[1])
    sys.path.insert(0, os.path.join(ROOT, 'tools'))
    import build_catalog
    build_catalog.build()
