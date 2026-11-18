"""Размывает номера на кадрах обзора строго по контуру номера.

    python -I scripts/blur-plates.py

Углы номеров сняты по кадрам 4K (увеличение ×4 с сеткой), с учётом наклона:
размывается только четырёхугольник самой таблички (+1 px), края смягчены на
1–2 px, всё вокруг — рамка платформы, бампер, фонари — остаётся как в съёмке.
Выход — gemini/obzor/*-bez-nomera.png, их берёт scripts/make-tour.mjs.
"""
from PIL import Image, ImageDraw, ImageFilter

JOBS = [
    (
        'gemini/obzor/b-szadi-pustoj.jpg',
        'gemini/obzor/b-bez-nomera.png',
        # номер эвакуатора
        [[(2065, 1458), (2214, 1437), (2214, 1485), (2065, 1501)]],
    ),
    (
        'gemini/2-szadi-apparely.jpg',
        'gemini/obzor/c-bez-nomera.png',
        [
            # номер BMW
            [(2396, 1112), (2549, 1106), (2552, 1158), (2402, 1168)],
            # номер эвакуатора
            [(2258, 1561), (2408, 1534), (2408, 1581), (2262, 1603)],
        ],
    ),
]

for src, out, quads in JOBS:
    img = Image.open(src).convert('RGB')
    mask = Image.new('L', img.size, 0)
    d = ImageDraw.Draw(mask)
    for q in quads:
        d.polygon(q, fill=255, outline=255)
    # +1 px по контуру и мягкий край, чтобы не было ступеньки
    mask = mask.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(1.2))
    # Размытие берётся по самой табличке: вокруг каждого номера окно с запасом,
    # но в кадр попадает только то, что под маской.
    blurred = img.copy()
    for q in quads:
        xs = [p[0] for p in q]
        ys = [p[1] for p in q]
        box = (min(xs) - 30, min(ys) - 30, max(xs) + 30, max(ys) + 30)
        region = img.crop(box).filter(ImageFilter.GaussianBlur(14))
        blurred.paste(region, box[:2])
    img = Image.composite(blurred, img, mask)
    img.save(out, compress_level=3)
    print(out)
