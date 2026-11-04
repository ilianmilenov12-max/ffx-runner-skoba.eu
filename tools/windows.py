#!/usr/bin/env python3
"""Намира прозорците по фасадните текстури → маски в assets/masks/.

    python3 tools/windows.py            # маски + преглед в tools/windows_review.jpg

Маската е черно-бяла картина с размерите на текстурата (512 по дългата
страна): бяло е прозорец (вдлъбнато), черно — стена. game/relief.js я чете
като карта на дълбочината. От шумните снимки направо не става — там
петната стават дупки, — затова тук прозорците се търсят като правоъгълници:

  1. цветът на стената е най-честият цвят в картината;
  2. всичко, което се различава от него повече от THRESHOLD, е кандидат;
  3. затваряне (слива рамките и пречките на прозореца в едно цяло) и
     отваряне (маха шума);
  4. свързаните области, които приличат на прозорец (достатъчно запълнени,
     не прекалено големи), стават правоъгълници.
"""
import json
import pathlib

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'tools/upscaled'
OUT = ROOT / 'assets/masks'
REVIEW = ROOT / 'tools/windows_review.jpg'
SIZE = 512

# Фасадите, по които се търсят прозорци, и най-големият прозорец като дял от
# страната на картината. Без тухлите и каменните стени: там няма прозорци, а
# фугите не са дупки. Прагът и цветът на стената се търсят автоматично:
# „най-честият цвят" не винаги е стената (при CasaA е червеният покрив), затова
# се пробват няколко кандидата и се избира разпознаването с най-добра оценка.
FACADES = {
    'CasaA': 0.45, 'CasaB': 0.45, 'CasaC': 0.45, 'CasaClat': 0.5, 'CasaD': 0.45,
    'Cinema': 0.45, 'Cityfacade01': 0.6, 'Cityfacade02': 0.4, 'Cityfacade03': 0.4,
    'Hotel1': 0.3, 'Hotel10': 0.3, 'Hotel2': 0.3, 'Hotel7': 0.4, 'Hotel9': 0.35,
    'ST_APSEW': 0.7, 'ST_BELFL': 0.65, 'ST_NAVFR': 0.5, 'ST_NAVRI': 0.5, 'ST_TOWFR': 0.65,
    'Stazione': 0.4, 'Store': 0.6, 'Windows1': 0.9, 'Windows2': 0.9, 'Windows3': 0.5,
    'capannone01': 0.6, 'capannone02': 0.4,
}
THRESHOLDS = (18, 24, 32, 42, 55, 70, 88)
# Няколко фасади не се поддават на общото търсене (гредите се сливат с
# прозорците, стъклените ивици са по цялата височина): за тях прагът е зададен.
TUNE = {
    'CasaB': (48, 60, 74), 'CasaClat': (20, 26, 34), 'Windows1': (22, 26, 30),
    'ST_NAVFR': (30, 38, 46), 'ST_NAVRI': (38, 46, 55),
}
SEARCH = 160          # търсенето върви на малка картина, за да е бързо
MIN_FILL = 0.5        # колко от правоъгълника трябва да е „прозорец"
MIN_SIDE = 0.01       # най-малката страна като дял от дългата страна

def wall_colors(im, count=10):
    """Кандидатите за цвят на стената: най-честите цветове, закръглени."""
    small = im.resize((128, 128))
    counts = {}
    for p in small.getdata():
        k = (p[0] >> 4, p[1] >> 4, p[2] >> 4)
        counts[k] = counts.get(k, 0) + 1
    best = sorted(counts, key=counts.get, reverse=True)[:count]
    out = []
    for k in best:
        px = [p for p in small.getdata() if (p[0] >> 4, p[1] >> 4, p[2] >> 4) == k]
        out.append(tuple(sum(c[i] for c in px) / len(px) for i in range(3)))
    return out


def distance(im, wall):
    """Разликата от цвета на стената, като сива картина (бързо, в C)."""
    solid = Image.new('RGB', im.size, tuple(round(c) for c in wall))
    return ImageChops.difference(im, solid).convert('L')


def candidates(dist, threshold):
    out = dist.point(lambda v: 255 if v > threshold else 0)
    # затваряне (слива рамките и пречките в едно), после отваряне (маха шума)
    out = out.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
    out = out.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))
    return out


def components(mask):
    w, h = mask.size
    m = mask.load()
    seen = bytearray(w * h)
    boxes = []
    for y0 in range(h):
        for x0 in range(w):
            if m[x0, y0] < 128 or seen[y0 * w + x0]:
                continue
            stack = [(x0, y0)]
            seen[y0 * w + x0] = 1
            n, x1, y1, x2, y2 = 0, x0, y0, x0, y0
            while stack:
                x, y = stack.pop()
                n += 1
                x1, y1, x2, y2 = min(x1, x), min(y1, y), max(x2, x), max(y2, y)
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and m[nx, ny] >= 128:
                        seen[ny * w + nx] = 1
                        stack.append((nx, ny))
            boxes.append((x1, y1, x2 + 1, y2 + 1, n))
    return boxes


def boxes_of(dist, threshold, biggest):
    w, h = dist.size
    out = []
    for x1, y1, x2, y2, n in components(candidates(dist, threshold)):
        bw, bh = x2 - x1, y2 - y1
        side = max(w, h) * MIN_SIDE
        if bw < side or bh < side or bw > w * biggest or bh > h * biggest:
            continue
        if n / (bw * bh) < MIN_FILL:
            continue
        out.append((x1, y1, x2, y2))
    # Прозорците по една фасада са горе-долу еднакви: това, което е много
    # по-дребно от средното, е петно или пукнатина, не прозорец.
    if len(out) > 3:
        areas = sorted((x2 - x1) * (y2 - y1) for x1, y1, x2, y2 in out)
        least = areas[len(areas) // 2] / 3.5
        out = [b for b in out if (b[2] - b[0]) * (b[3] - b[1]) >= least]
    return out


def score(boxes, size):
    """Истинската фасада е решетка: прозорците са горе-долу еднакви и
    подредени в редове. Ако „прозорците" покрият половината стена, значи
    цветът на стената е сбъркан."""
    if len(boxes) < 3:
        return 0
    areas = sorted((x2 - x1) * (y2 - y1) for x1, y1, x2, y2 in boxes)
    total = sum(areas)
    coverage = total / (size[0] * size[1])
    if coverage > 0.5:
        return 0
    median = areas[len(areas) // 2]
    alike = sum(1 for a in areas if median / 2.5 <= a <= median * 2.5) / len(areas)
    # колко от тях имат съсед на същия ред
    in_rows = 0
    for x1, y1, x2, y2 in boxes:
        height = y2 - y1
        for a1, b1, a2, b2 in boxes:
            if (a1, b1) == (x1, y1):
                continue
            if abs(b1 - y1) < height * 0.35 and abs(b2 - y2) < height * 0.35:
                in_rows += 1
                break
    rows_bonus = 0.4 + 0.6 * in_rows / len(boxes)
    return total * alike * rows_bonus


def windows(name, biggest):
    im = Image.open(SRC / f'{name}.jpg').convert('RGB')
    k = SEARCH / max(im.size)
    small = im.resize((round(im.size[0] * k), round(im.size[1] * k)), Image.LANCZOS)
    best = (0, None, None)
    for wall in wall_colors(small):
        dist = distance(small, wall)
        for threshold in TUNE.get(name, THRESHOLDS):
            found = boxes_of(dist, threshold, biggest)
            s = score(found, small.size)
            if s > best[0]:
                best = (s, wall, threshold)
    _, wall, threshold = best
    k = SIZE / max(im.size)
    im = im.resize((round(im.size[0] * k), round(im.size[1] * k)), Image.LANCZOS)
    if wall is None:
        return im, None, threshold, []
    return im, wall, threshold, boxes_of(distance(im, wall), threshold, biggest)


def main():
    OUT.mkdir(exist_ok=True)
    for old in OUT.glob('*.png'):
        old.unlink()
    index = {}
    thumbs = []
    for name, biggest in FACADES.items():
        im, wall, threshold, boxes = windows(name, biggest)
        # Под четири намерени прозореца фасадата остава плоска: иначе на
        # стената хлътват два прозореца, а съседните им остават гладки.
        if len(boxes) < 4:
            print(f'{name:14s} без прозорци ({len(boxes)})', flush=True)
            continue
        w, h = im.size
        mask = Image.new('L', (w, h), 0)
        d = ImageDraw.Draw(mask)
        for x1, y1, x2, y2 in boxes:
            d.rectangle((x1, y1, x2 - 1, y2 - 1), fill=255)
        mask.save(OUT / f'{name}.png', optimize=True)
        # Правоъгълниците в дялове от картината: game/facade.js ги вдига в
        # геометрия (первази и рамки), а маската отива в game/relief.js.
        index[name] = {
            'count': len(boxes),
            'wall': [round(c) for c in wall],
            'rects': [[round(x1 / w, 4), round(y1 / h, 4), round(x2 / w, 4), round(y2 / h, 4)]
                      for x1, y1, x2, y2 in boxes],
        }

        view = im.copy()
        dv = ImageDraw.Draw(view)
        for x1, y1, x2, y2 in boxes:
            dv.rectangle((x1, y1, x2 - 1, y2 - 1), outline=(255, 0, 255), width=2)
        dv.rectangle((0, 0, 150, 18), fill=(0, 0, 0))
        dv.text((4, 3), f'{name} {len(boxes)}', fill=(255, 255, 255))
        thumbs.append(view.resize((320, round(320 * h / w))))
        print(f'{name:14s} стена {tuple(round(c) for c in wall)} праг {threshold}  прозорци {len(boxes)}', flush=True)

    (OUT / 'index.json').write_text(json.dumps(index, indent=1))
    cols = 5
    rows = (len(thumbs) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * 320, rows * 320), (20, 20, 20))
    for i, t in enumerate(thumbs):
        sheet.paste(t, ((i % cols) * 320, (i // cols) * 320))
    sheet.save(REVIEW, quality=85)


if __name__ == '__main__':
    main()
