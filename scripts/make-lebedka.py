# Сноска «Лебёдка» в обзоре (components/sections/Truck.tsx).
#   python -I scripts/make-lebedka.py
#
# Крупных кадров лебёдки в съёмке нет: она видна только в IMG_2167 (0–1,5 с), около
# 125 px в кадре 4K. Камера там стоит, поэтому 90 кадров совмещаются и складываются
# (медиана) — уходит шум сжатия, лебёдка и трос читаются заметно чище одного кадра.
# Вырез 240 × 180 px вокруг лебёдки, увеличение до 560 × 420, свет как у кадров обзора,
# только чуть светлее: лебёдка тёмная на тёмно-красном щите.
import os, subprocess, tempfile, glob
import numpy as np
from PIL import Image
from scipy.ndimage import shift as nd_shift

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FF = os.path.join(ROOT, 'node_modules', 'ffmpeg-static', 'ffmpeg.exe' if os.name == 'nt' else 'ffmpeg')
SRC = os.path.join(ROOT, '..', 'VideoWeb', 'assets', 'bmw', 'IMG_2167.MP4')
OUT = os.path.join(ROOT, 'public', 'photos', 'tour-lebedka.webp')
BOX = (1010, 950, 640, 480)          # x, y, w, h куска 4K для совмещения
CARD = (178, 135, 418, 315)          # вырез сноски внутри куска (4 : 3), лебёдка — половина ширины

with tempfile.TemporaryDirectory() as tmp:
    x, y, w, h = BOX
    # Метаданные ролика (место съёмки) не переносятся: -map_metadata -1.
    subprocess.run([FF, '-v', 'error', '-y', '-ss', '0', '-t', '1.5', '-i', SRC, '-map_metadata', '-1', '-an',
                    '-vf', f'crop={w}:{h}:{x}:{y}', os.path.join(tmp, '%03d.png')], check=True)
    ims = [np.asarray(Image.open(f).convert('RGB')).astype(np.float32) for f in sorted(glob.glob(os.path.join(tmp, '*.png')))]

    # Совмещение по фазовой корреляции (руки дрожат на доли пикселя).
    win = np.outer(np.hanning(h), np.hanning(w))
    F0 = np.fft.fft2(ims[len(ims) // 2].mean(-1) * win)
    def offset(a):
        R = F0 * np.conj(np.fft.fft2(a.mean(-1) * win))
        r = np.fft.ifft2(R / (np.abs(R) + 1e-6)).real
        i, j = np.unravel_index(np.argmax(r), r.shape)
        def sub(v, k, n):
            p, q, s = v[(k - 1) % n], v[k], v[(k + 1) % n]
            d = p - 2 * q + s
            return k + (0.5 * (p - s) / d if d else 0)
        dy, dx = sub(r[:, j], i, h), sub(r[i, :], j, w)
        return (dy - h if dy > h / 2 else dy), (dx - w if dx > w / 2 else dx)
    stack = np.median(np.stack([
        np.stack([nd_shift(a[..., c], offset(a), order=3, mode='nearest') for c in range(3)], -1) for a in ims
    ]), 0)

    card = os.path.join(tmp, 'card.png')
    Image.fromarray(stack.clip(0, 255).astype(np.uint8)).crop(CARD).save(card)
    grade = 'eq=brightness=-0.015:contrast=1.06:saturation=0.9,colorbalance=bs=0.03:bm=0.012'
    subprocess.run([FF, '-v', 'error', '-y', '-i', card, '-map_metadata', '-1',
                    '-vf', f'scale=560:420:flags=lanczos,unsharp=5:5:0.55,{grade}',
                    '-c:v', 'libwebp', '-quality', '82', '-compression_level', '6', OUT], check=True)
print(OUT, f'{os.path.getsize(OUT) // 1024} КБ')
