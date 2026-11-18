"""Маршруты по дорогам от Петербурга к городам карты «Едем» (Coverage.tsx).

    python -I scripts/make-routes.py

Владелец (15 ноября 2026): жёлтая линия от Петербурга к наведённому городу
шла дугой напрямик и ложилась на соседние огоньки. Теперь линия идёт по
настоящим дорогам, как в навигаторе: видно, как поедет эвакуатор, а города
по пути — честно «по дороге». Длина пути — в бирке «≈ N км».

Маршрут — открытый сервис OSRM (router.project-osrm.org, данные
© участники OpenStreetMap), разово, через локальный мост (правило ПК), с общим
User-Agent; уходят только координаты центров городов из lib/places.ts. Ответы
кэшируются в gemini/osm-cache, повторный запуск сеть не трогает.

Выход — lib/routes.ts: путь SVG в координатах карты (та же проекция, что
lib/mapShapes.ts), упрощённый до ~1 точки карты, и длина в км.
"""
import io
import json
import math
import os
import re
import hashlib
import time
import urllib.parse
import urllib.request

PROXY = 'http://127.0.0.1:8889'
UA = 'gamera-landing-demo/1.0 (static demo map)'
CACHE = 'gemini/osm-cache'
OUT = 'lib/routes.ts'

# Проекция — как в lib/mapShapes.ts (MAP_PROJ).
LON0, LAT1, K, S = 27.55, 61.35, 0.501511, 243.1677


def project(lon, lat):
    return ((lon - LON0) * K * S, (LAT1 - lat) * S)


def cities():
    src = io.open('lib/places.ts', encoding='utf-8').read()
    spb = re.search(r"export const SPB = \{ name: '([^']+)', lon: ([\d.]+), lat: ([\d.]+)", src)
    found = re.findall(r"\{ name: '([^']+)', lon: ([\d.]+), lat: ([\d.]+), dir:", src)
    return (float(spb.group(2)), float(spb.group(3))), [(n, float(lo), float(la)) for n, lo, la in found]


# Через мост тем же прокси, но клиентом Python: curl (schannel) не договаривается
# с этим сервером о шифровании. Прямых запросов нет — только ProxyHandler.
OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({'https': PROXY, 'http': PROXY}))


def fetch(url, path):
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return False
    with OPENER.open(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=30) as r:
        data = r.read()
    with open(path, 'wb') as f:
        f.write(data)
    return True


def simplify(pts, eps):
    """Дуглас — Пекер: убрать точки, отклоняющиеся от прямой меньше eps."""
    if len(pts) < 3:
        return pts
    (x1, y1), (x2, y2) = pts[0], pts[-1]
    dx, dy = x2 - x1, y2 - y1
    norm = math.hypot(dx, dy) or 1e-9
    best, idx = 0.0, 0
    for i in range(1, len(pts) - 1):
        x, y = pts[i]
        d = abs(dy * x - dx * y + x2 * y1 - y2 * x1) / norm
        if d > best:
            best, idx = d, i
    if best <= eps:
        return [pts[0], pts[-1]]
    return simplify(pts[: idx + 1], eps)[:-1] + simplify(pts[idx:], eps)


def path(pts):
    """M x y, дальше относительные l dx dy с одним знаком после запятой."""
    out = [f'M{pts[0][0]:.1f} {pts[0][1]:.1f}']
    px, py = round(pts[0][0], 1), round(pts[0][1], 1)
    rel = []
    for x, y in pts[1:]:
        x, y = round(x, 1), round(y, 1)
        rel.append(f'{x - px:.1f} {y - py:.1f}'.replace('.0 ', ' ').replace('-0 ', '0 '))
        px, py = x, y
    return out[0] + 'l' + ' '.join(rel)


os.makedirs(CACHE, exist_ok=True)
(lon0, lat0), items = cities()
routes = {}
for name, lon, lat in items:
    slug = hashlib.md5(name.encode('utf-8')).hexdigest()[:10]
    cache = f'{CACHE}/route-{slug}.json'
    q = urllib.parse.urlencode({'overview': 'full', 'geometries': 'geojson'})
    url = f'https://router.project-osrm.org/route/v1/driving/{lon0},{lat0};{lon},{lat}?{q}'
    if fetch(url, cache):
        time.sleep(1.1)  # правило демо-сервера: не чаще раза в секунду
    with io.open(cache, encoding='utf-8') as f:
        r = json.load(f)['routes'][0]
    pts = [project(x, y) for x, y in r['geometry']['coordinates']]
    pts = simplify(pts, 0.9)
    routes[name] = {'d': path(pts), 'km': round(r['distance'] / 1000)}
    print(name, routes[name]['km'], 'км,', len(pts), 'точек')

body = ',\n'.join(f"  {json.dumps(n, ensure_ascii=False)}: {{ km: {v['km']}, d: '{v['d']}' }}" for n, v in routes.items())
with io.open(OUT, 'w', encoding='utf-8', newline='\n') as f:
    f.write(
        '/**\n'
        ' * Маршруты по дорогам от центра Петербурга к городам карты «Едем».\n'
        ' * Собрано scripts/make-routes.py (OSRM, данные © участники OpenStreetMap).\n'
        ' * d — путь SVG в координатах карты (lib/mapShapes.ts), km — длина по дороге.\n'
        ' * Не править вручную.\n'
        ' */\n'
        'export const ROUTES: Record<string, { km: number; d: string }> = {\n'
        + body
        + ',\n}\n'
    )
print('готово:', OUT, os.path.getsize(OUT) // 1024, 'КБ')
