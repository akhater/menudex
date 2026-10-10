"""Regenerate data/catalog.json (brand -> model -> firmware) from the camera files in data/.

    python tools/build_catalog.py
"""
import glob
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def version_key(v):
    return [int(x) if x.isdigit() else x for x in v.split('.')]


def build():
    brands = {}
    for path in glob.glob(os.path.join(ROOT, 'data', '*', '*', '*.json')):
        with open(path, encoding='utf-8') as f:
            cam = json.load(f)
        brand_id, model_id, _ = cam['slug'].split('/')
        brand = brands.setdefault(brand_id, {'id': brand_id, 'name': cam['brand'], 'models': {}})
        model = brand['models'].setdefault(model_id, {'id': model_id, 'name': cam['model'], 'firmware': []})
        model['firmware'].append({
            'version': cam['firmware'],
            'file': os.path.relpath(path, ROOT).replace(os.sep, '/'),
            'items': sum(len(p['items']) for p in cam['pages']),
        })
    catalog = {'brands': []}
    for brand in sorted(brands.values(), key=lambda b: b['name']):
        models = sorted(brand['models'].values(), key=lambda m: m['name'])
        for m in models:
            m['firmware'].sort(key=lambda fw: version_key(fw['version']), reverse=True)
        catalog['brands'].append({'id': brand['id'], 'name': brand['name'], 'models': models})
    with open(os.path.join(ROOT, 'data', 'catalog.json'), 'w', encoding='utf-8', newline='\n') as f:
        json.dump(catalog, f, ensure_ascii=False, indent=1)
    n = sum(len(m['firmware']) for b in catalog['brands'] for m in b['models'])
    print('wrote data/catalog.json: %d camera/firmware files' % n)


if __name__ == '__main__':
    build()
