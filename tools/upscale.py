#!/usr/bin/env python3
"""Увеличава текстурите ×4 с Real-ESRGAN (tools/esrgan) → tools/upscaled/.

    python3 tools/upscale.py

После tools/export_gltf.py предпочита tools/upscaled/ пред оригиналите.

Три поправки след AI-то:
  * настилките (асфалт, тротоари, трева, паваж...) излизат гладки като
    пластмаса — AI-то изтрива зърното. Връщаме го: високите честоти на
    обикновеното увеличение се добавят обратно, плюс лек шум;
  * прозрачността не минава през модела: тя се увеличава отделно и се прави
    отново двоична (оригиналът е #rgba5551 — един бит алфа), за да са
    ръбовете на дърветата и оградите остри;
  * нищо не става по-голямо от 2048 — големите картини се увеличават по-малко.
"""
import os
import pathlib
import shutil
import subprocess
import tempfile

from PIL import Image, ImageFilter
import random

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'source/blender_conversion/images'
ALPHA = ROOT / 'tools/alpha'
OUT = ROOT / 'tools/upscaled'
ESRGAN = ROOT / 'tools/esrgan/realesrgan-ncnn-vulkan'
MODELS = ROOT / 'tools/esrgan/models'
MAX_SIDE = 2048

# Настилки и природа: тук зърното е самата текстура.
GRAINY = ('asfalto', 'strada', 'cemento', 'marciapiede', 'ciotoli', 'spietrini',
          'sabbia', 'erba', 'binari', 'muropiazza', 'tunnelpareti', 'metallo',
          'capannone', 'recinto', 'staccionata', 'cassalegno')


def is_grainy(name):
    n = name.lower()
    return any(g in n for g in GRAINY)


def restore_grain(ai, source):
    """ai + (увеличение − размазано увеличение) + лек шум."""
    up = source.convert('RGB').resize(ai.size, Image.BICUBIC)
    soft = up.filter(ImageFilter.GaussianBlur(2.2))
    ai_px, up_px, soft_px = ai.load(), up.load(), soft.load()
    out = Image.new('RGB', ai.size)
    o = out.load()
    rnd = random.Random(7)
    w, h = ai.size
    for y in range(h):
        for x in range(w):
            n = rnd.gauss(0, 2.2)
            a, u, s = ai_px[x, y], up_px[x, y], soft_px[x, y]
            o[x, y] = tuple(max(0, min(255, int(a[k] + (u[k] - s[k]) * 0.9 + n))) for k in range(3))
    return out


def main():
    OUT.mkdir(exist_ok=True)
    sources = {}
    for f in sorted(SRC.glob('*.png')):
        alpha = ALPHA / f.name
        sources[f.stem] = alpha if alpha.exists() else f

    with tempfile.TemporaryDirectory() as tmp:
        tin, tout = pathlib.Path(tmp, 'in'), pathlib.Path(tmp, 'out')
        tin.mkdir(); tout.mkdir()
        for stem, path in sources.items():
            Image.open(path).convert('RGB').save(tin / f'{stem}.png')
        subprocess.run([str(ESRGAN), '-i', str(tin), '-o', str(tout), '-n', 'realesrgan-x4plus',
                        '-s', '4', '-m', str(MODELS), '-f', 'png'], check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        for stem, path in sources.items():
            src = Image.open(path)
            ai = Image.open(tout / f'{stem}.png').convert('RGB')
            if max(ai.size) > MAX_SIDE:
                k = MAX_SIDE / max(ai.size)
                ai = ai.resize((round(ai.size[0] * k), round(ai.size[1] * k)), Image.LANCZOS)
            if is_grainy(stem):
                ai = restore_grain(ai, src)
            has_alpha = src.mode in ('RGBA', 'LA') and src.getchannel('A').getextrema()[0] < 255
            for old in OUT.glob(stem + '.*'):
                old.unlink()
            if has_alpha:
                a = src.getchannel('A').resize(ai.size, Image.BICUBIC).point(lambda v: 255 if v >= 128 else 0)
                ai.putalpha(a)
                ai.save(OUT / f'{stem}.png', optimize=True)
            else:
                ai.save(OUT / f'{stem}.jpg', quality=90, optimize=True)
            print(f'{stem:28s} {src.size[0]}×{src.size[1]} → {ai.size[0]}×{ai.size[1]}'
                  f'{"  зърно" if is_grainy(stem) else ""}{"  алфа" if has_alpha else ""}', flush=True)


if __name__ == '__main__':
    main()
