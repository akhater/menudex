# Menudex

**Every camera setting. Exact tab, page, row.**

A PWA that tells you exactly where a camera setting lives: which tab, which page, which row. It shows a copy of the camera's menu screen with your row marked, plus numbered steps. Like a mall directory for your camera menu.

First camera: **Canon EOS R6 Mark III, firmware 1.1.0** (8 tabs, 60 pages, 266 rows).

**Live:** https://akhater.github.io/menudex/ (open it on your phone and add it to your home screen).

## Run it

It's static files with no build step. Any static server works:

```bash
python -m http.server 8765
```

Then open http://localhost:8765. To install it on a phone, deploy the folder to any static host with HTTPS (GitHub Pages, Cloudflare Pages, Netlify) and use "Add to Home Screen". After the first visit it works offline.

When you change the app shell (`index.html`, `css/`, `js/`), bump `VERSION` in `sw.js` so installed copies refresh.

## How it's put together

| Path | What it is |
|---|---|
| `index.html`, `css/app.css` | Mobile-first UI, dark by default, follows the system light/dark setting |
| `js/app.js` | Routing (`#/brand/model/firmware/item/<key>`), the search/browse/item views, the walker steps |
| `js/search.js` | Client-side fuzzy search over item names, sub-menus, synonyms and descriptions |
| `sw.js` | Offline cache: app shell plus every camera file in the catalog |
| `data/catalog.json` | Brand → model → firmware list that drives the camera picker (generated) |
| `data/<brand>/<model>/<firmware>.json` | One camera's menu: tabs → pages (with "2/10" positions per Photo/Movie switch) → rows (generated) |
| `tools/canon/extract.py` | Builds a camera file from Canon's online manual (stdlib only) |
| `tools/canon/cameras/*.json` | Per-camera config: manual URL, tab colors, controls, which manual pages list the menus |
| `tools/canon/cameras/*.enrich.json` | Hand-written descriptions, search synonyms and firmware notes, keyed by item |

### Where the data comes from

Canon's online Advanced User Guide has one "Tab Menus" page per tab, listing every page and numbered row, and marking Creative-Zone-only items. The extractor reads those pages, pulls sub-menu names ("Auto range", "Min. shutter spd.") from each linked feature page, and drops cross-references to other menu items. Page counts and row order were checked against the manual's own menu screenshots.

Positions assume a Creative Zone mode (P/Tv/Av/M/Fv/B/C1–C3). In A+ and SCN the camera hides the ★ items, so rows below them move up. The app says so on every ★ item.

## Add a camera or firmware

For a Canon body with a cam.start.canon manual:

1. Copy `tools/canon/cameras/eos-r6-mark-iii.json`, then set `model`, `firmware`, `slug`, `out`, `source.url`, and the `listings` (the manual's "Tab Menus: …" pages).
2. Run `python tools/canon/extract.py tools/canon/cameras/<camera>.json`. It caches manual pages in `.cache/`, writes the camera file, regenerates `data/catalog.json`, and lists items that have no enrich entry yet.
3. Write the enrich file (`desc`, `kw` synonyms, optional `fw` note) for those items.
4. Check a few pages against the manual's menu screenshots. Firmware updates can add, remove or reorder rows.

Other brands need their own extractor that writes the same camera file format. The app itself is brand-agnostic.

`tools/make_icons.py` (needs Pillow) re-renders the PNG icons from the same design as `icons/icon.svg`.

Not affiliated with Canon. Menu names are Canon's; descriptions are original. Code is MIT licensed (see `LICENSE`).
