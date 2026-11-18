"""Снимки настоящей карты для формы в демонстрации заказа (TgDemo → MapTile).

    python -I scripts/make-demo-map.py

Как в мини-приложении бота (Desktop/tow-truck-bot-python/app/webapp/app.js):
карта открыта на масштабе 9, по «Определить местоположение» встаёт на
масштаб 16 у точки. Владелец (15 ноября 2026) просил, чтобы приближение
выглядело как щипок пальцами, а не смена двух картинок, — поэтому снимаются
все масштабы 9…16 с точкой ровно в центре (с точностью до доли пикселя): на
сайте камера плавно приближается, а каждый следующий масштаб проявляется
поверх увеличенного предыдущего — так же подгружает тайлы Leaflet при щипке.

Подложка — тайлы OpenStreetMap (© участники OpenStreetMap, ODbL); подпись
«© OpenStreetMap» стоит на карте. Фильтр приглушения (как в боте) накладывает
CSS, тут — исходник. Адрес точки — обратный геокодер Nominatim, тот же, что у
бота, и та же чистка (cleanAddress: без страны, округа и индекса).

Сеть: tile.openstreetmap.org и nominatim.openstreetmap.org, через локальный
мост (правило ПК), с общим User-Agent без личных данных; ~50 тайлов разово,
дальше — из кэша gemini/osm-cache.
"""
import io
import json
import math
import os
import subprocess
import sys
import urllib.parse

from PIL import Image

PROXY = 'http://127.0.0.1:8889'
UA = 'gamera-landing-demo/1.0 (static demo image)'
CACHE = 'gemini/osm-cache'
OUT = 'public/photos'
W, H = 744, 480  # 2 × окно карты в форме (372 × 240 точек)

SPB_CENTER = (59.9343, 30.3351)
POINTS = {
    # Лиговский проспект у Московского вокзала и площади Восстания: карта
    # узнаётся сразу (вокзал, Невский), точка — на проезжей части проспекта.
    # Пробовали и КАД у Московского шоссе — по прикидке координат точка ушла
    # во двор в Шушарах, а центр понятнее посетителю.
    'ligovsky': (59.9289, 30.3598),
}


def fetch(url, path):
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return
    subprocess.run(
        ['curl', '-s', '-f', '--ssl-no-revoke', '-x', PROXY, '-A', UA, '-o', path, url],
        check=True,
    )


def tile_xy(lat, lon, z):
    n = 2 ** z
    x = (lon + 180) / 360 * n
    y = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
    return x, y


def render(lat, lon, z, name, quality=84):
    """Кадр с точкой ровно в центре, как у бота: окно 372 × 240 точек
    показывает 372 × 240 пикселей тайлов масштаба z (Leaflet без
    detectRetina), надписи того же размера. Сдвиг — с долями пикселя
    (аффинное преобразование), чтобы при смене масштаба на сайте карта не
    дёргалась. Для чётких экранов кадр увеличен вдвое (W × H)."""
    cx, cy = tile_xy(lat, lon, z)
    px, py = cx * 256, cy * 256
    w, h = W // 2, H // 2
    x0, y0 = px - w / 2, py - h / 2
    tx0, ty0 = int(x0 // 256), int(y0 // 256)
    tx1, ty1 = int((x0 + w) // 256), int((y0 + h) // 256)
    canvas = Image.new('RGB', ((tx1 - tx0 + 1) * 256, (ty1 - ty0 + 1) * 256))
    for tx in range(tx0, tx1 + 1):
        for ty in range(ty0, ty1 + 1):
            path = f'{CACHE}/{z}-{tx}-{ty}.png'
            fetch(f'https://tile.openstreetmap.org/{z}/{tx}/{ty}.png', path)
            canvas.paste(Image.open(path).convert('RGB'), ((tx - tx0) * 256, (ty - ty0) * 256))
    # 2× сразу из тайлов: каждый пиксель выхода берёт точку тайла (x0 + u/2, y0 + v/2)
    ox, oy = x0 - tx0 * 256, y0 - ty0 * 256
    big = canvas.resize((canvas.width * 2, canvas.height * 2), Image.LANCZOS)
    img = big.transform((W, H), Image.AFFINE, (1, 0, ox * 2, 0, 1, oy * 2), resample=Image.BICUBIC)
    out = f'{OUT}/{name}.webp'
    img.save(out, 'WEBP', quality=quality, method=6)
    print(out, os.path.getsize(out) // 1024, 'KB')
    return os.path.getsize(out)


def clean(display_name):
    return ', '.join(
        p for p in display_name.split(', ')
        if p not in ('Россия', 'Северо-Западный федеральный округ') and not (p.isdigit() and len(p) == 6)
    )


def address(lat, lon, key):
    path = f'{CACHE}/rev-{key}.json'
    q = urllib.parse.urlencode({'format': 'jsonv2', 'accept-language': 'ru', 'lat': lat, 'lon': lon, 'zoom': 18})
    fetch(f'https://nominatim.openstreetmap.org/reverse?{q}', path)
    with io.open(path, encoding='utf-8') as f:
        return clean(json.load(f).get('display_name', ''))


os.makedirs(CACHE, exist_ok=True)
key = 'ligovsky'
lat, lon = POINTS[key]
total = 0
# Крайние масштабы видны в покое — качество выше; промежуточные мелькают за
# доли секунды во время приближения — легче.
for z in range(9, 17):
    total += render(lat, lon, z, f'demo-map-z{z}', 84 if z in (9, 16) else 58)
print('всего', total // 1024, 'KB')
with io.open(f'{CACHE}/report.txt', 'w', encoding='utf-8') as f:
    f.write(f'{key} | {address(lat, lon, key)}' + chr(10))
print('готово, адрес — в', f'{CACHE}/report.txt')
