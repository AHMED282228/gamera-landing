# Обводка ремней — по геометрии, а не по пикселям: края ленты (s = середина ± полширины)
# по тому же пути, что в strap_render.py (крюк спереди → касание → дуга через верх →
# касание → крюк сзади), торец — вокруг крюка. Видимость — та же, что у ленты: за шиной
# линия обрывается (поперёк не перечёркнута — ремень там не кончается).
#   python -I -X utf8 strap_edges.py → edges.json (доли кадра) и edges-*.png (просмотр ×4)
import numpy as np, json
from PIL import Image, ImageDraw

FW, FH = 2752, 1548
G = json.load(open('geo.json'))
BOX = json.load(open('boxes.json'))
SRC = r'C:\Users\AHMED\Desktop\VideoWeb-new\public\photos\tour-c-2752.webp'
D_R = 400 / 350


def cross2(u, v):
    return u[..., 0] * v[..., 1] - u[..., 1] * v[..., 0]


def dp(P, eps):
    """Дуглас — Пейкер: убрать лишние точки, отклонение не больше eps px."""
    if len(P) < 3:
        return P
    A, B = P[0], P[-1]
    d = B - A
    n = np.hypot(*d)
    dist = np.abs(cross2(d[None, :], P - A)) / n if n > 0 else np.hypot(*(P - A).T)
    k = int(np.argmax(dist))
    if dist[k] <= eps:
        return np.array([A, B])
    return np.vstack([dp(P[: k + 1], eps)[:-1], dp(P[k:], eps)])


out = {}
for name in ('rear', 'front'):
    g = G[name]
    c, v, l, t = (np.array(g[k], float) for k in ('c', 'v', 'l', 't'))
    T, w = g['T'], g['w']
    Minv = np.linalg.inv(np.array([l, v]).T)
    beta = np.arccos(1 / np.hypot(D_R, 1))
    ang = np.arctan2(-1, D_R) + beta
    psi_r, psi_f = np.pi / 2 + ang, 3 * np.pi / 2 - ang
    s_c, hw = 0.5, w / 2 / T

    def P(psi, s):
        return c + np.sin(psi) * l + np.cos(psi) * v + s * T * t

    def W2I(X, Y, s):
        return c + X * l + (1 - Y) * v + s * T * t

    # путь густо: точка на 0,2–0,5 px
    items = [('run', (-D_R + (-np.cos(ang) + D_R) * k, (1 + np.sin(ang)) * k)) for k in np.linspace(0, 1, 160)]
    items += [('arc', psi) for psi in np.linspace(psi_f, psi_r, 900)[1:-1]]
    items += [('run', (np.cos(ang) + (D_R - np.cos(ang)) * k, (1 + np.sin(ang)) * (1 - k))) for k in np.linspace(0, 1, 160)]

    def pt(it, s):
        kind, val = it
        return P(val, s) if kind == 'arc' else W2I(val[0], val[1], s)

    def hidden(it, s):  # как tire_hidden в strap_render.py
        kind, val = it
        if kind == 'arc':
            d = np.degrees(val) % 360
            return not (g['sil'][0] < d < g['sil'][1])
        q = Minv @ (W2I(val[0], val[1], s) - c)
        return q[0] ** 2 + q[1] ** 2 < 1.0

    N = len(items)
    edges = {}
    for side, s in (('a', s_c - hw), ('b', s_c + hw)):
        pts = np.array([pt(it, s) for it in items])
        vis = np.array([not hidden(it, s) for it in items])
        spans, i = [], 0
        while i < N:
            if vis[i]:
                j = i
                while j + 1 < N and vis[j + 1]:
                    j += 1
                spans.append((i, j))
                i = j + 1
            else:
                i += 1
        edges[side] = (pts, spans)

    # торец у крюка: от края ленты — к дальним углам крюка — к другому краю
    scale = np.linalg.norm(v) / 350.0
    HL, HW = 14 * scale * 2.2, 9 * scale * 2.2

    def cap(anc, toward, endA, endB):
        d = toward - anc
        d /= np.linalg.norm(d)
        n = np.array([-d[1], d[0]])
        k1, k2 = anc - d * HL / 2 + n * HW / 2, anc - d * HL / 2 - n * HW / 2
        if np.hypot(*(k1 - endA)) > np.hypot(*(k2 - endA)):
            k1, k2 = k2, k1
        return [k1, k2]

    ancF, ancR = W2I(-D_R, 0, s_c), W2I(D_R, 0, s_c)
    capF = cap(ancF, W2I(-D_R + 0.1, 0, s_c), W2I(-D_R, 0, s_c - hw), W2I(-D_R, 0, s_c + hw))
    capR = cap(ancR, W2I(D_R - 0.1, 0, s_c), W2I(D_R, 0, s_c - hw), W2I(D_R, 0, s_c + hw))

    pa, sa = edges['a']
    pb, sb = edges['b']
    runs, used_a, used_b = [], set(), set()
    fa = next((x for x in sa if x[0] == 0), None)
    fb = next((x for x in sb if x[0] == 0), None)
    ra = next((x for x in sa if x[1] == N - 1), None)
    rb = next((x for x in sb if x[1] == N - 1), None)
    if fa and fb and fa == ra and fb == rb:  # ремень виден целиком — замкнутый контур
        loop = list(pa[fa[0]:fa[1] + 1]) + capR[::-1] + list(pb[fb[0]:fb[1] + 1][::-1]) + capF[::-1]
        runs.append(np.array(loop + loop[:1]))
        used_a |= {fa}
        used_b |= {fb}
    else:
        if fa and fb:  # передний конец: вниз по краю a → вокруг крюка → вверх по краю b
            runs.append(np.array(list(pa[fa[0]:fa[1] + 1][::-1]) + capF + list(pb[fb[0]:fb[1] + 1])))
            used_a.add(fa)
            used_b.add(fb)
        elif fa or fb:  # у крюка видна одна кромка: по ней вниз → крюк обведён целиком
            k1, k2 = capF
            dF = W2I(-D_R + 0.1, 0, s_c) - ancF
            dF /= np.linalg.norm(dF)
            near = lambda k: k + dF * HL  # ближний к колесу угол крюка
            if fa:
                runs.append(np.array(list(pa[fa[0]:fa[1] + 1][::-1]) + [k1, near(k1), near(k2), k2, k1]))
                used_a.add(fa)
            else:
                runs.append(np.array([k2, near(k2), near(k1), k1, k2] + list(pb[fb[0]:fb[1] + 1])))
                used_b.add(fb)
        if ra and rb:  # задний конец
            capr = capR if np.hypot(*(capR[0] - pa[-1])) < np.hypot(*(capR[1] - pa[-1])) else capR[::-1]
            runs.append(np.array(list(pa[ra[0]:ra[1] + 1]) + capr + list(pb[rb[0]:rb[1] + 1][::-1])))
            used_a.add(ra)
            used_b.add(rb)
    for p_, ss, used in ((pa, sa, used_a), (pb, sb, used_b)):
        for sp in ss:
            if sp not in used and sp[1] - sp[0] > 2:
                runs.append(p_[sp[0]:sp[1] + 1])
    runs = [dp(np.asarray(r, float), 0.06) for r in runs]
    out[name] = [[[round(float(x) / FW, 5), round(float(y) / FH, 5)] for x, y in r] for r in runs]
    print(name, 'кусков', len(runs), 'точек', [len(r) for r in runs])

    x0, y0, x1, y1 = BOX[name]
    ph = Image.open(SRC).convert('RGB').crop((x0, y0, x1, y1))
    lay = Image.open(f'strap-{name}.png')
    ph.paste(lay, (0, 0), lay)
    K = 4
    big = ph.resize(((x1 - x0) * K, (y1 - y0) * K), Image.LANCZOS)
    dr = ImageDraw.Draw(big)
    for r in runs:
        dr.line([((x - x0) * K, (y - y0) * K) for x, y in r], fill=(255, 178, 30), width=2, joint='curve')
    big.save(f'edges-{name}.png')
json.dump(out, open('edges.json', 'w'))
