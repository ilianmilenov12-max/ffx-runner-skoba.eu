#!/usr/bin/env python3
"""Изважда игровите данни от текстовия конфиг на оригинала в game/data.js.

Конфигът е cast member в FFXRunner6.dir; изваден е с dump_params.py.
"""
import re, json, io, sys, pathlib

SRC = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else 'tools/ffx_params.lingo.txt')
DST = pathlib.Path('game/data.js')
src = SRC.read_text()


def grab(name):
    """Стойността на `name = ...` до следващото присвояване на най-горно ниво."""
    m = re.search(rf'^{name}\s*=\s*(.+?)(?=^[A-Za-z_]+\s*=|\Z)', src, re.S | re.M)
    return m.group(1).strip() if m else None


def top_level_groups(text):
    """Съдържанието на всяка скоба от първо ниво в `[[a],[b],...]`.

    Спира при затварящата скоба на външния списък, за да не поглъща
    каквото следва след него в конфига.
    """
    text = text[text.index('['):]
    out, depth, start = [], 0, None
    for i, ch in enumerate(text[1:], 1):
        if ch == '[':
            depth += 1
            if depth == 1:
                start = i + 1
        elif ch == ']':
            if depth == 0:
                break            # затваря външния списък
            depth -= 1
            if depth == 0:
                out.append(text[start:i])
    return out


bonuses = [{'type': t, 'pos': [float(x), float(y), float(z)]}
           for t, x, y, z in re.findall(
               r'#type:\s*#(\w+),\s*#pos:\s*vector\(\s*(-?[\d.]+(?:e\d+)?),\s*'
               r'(-?[\d.]+(?:e\d+)?),\s*(-?[\d.]+(?:e\d+)?)\s*\)', grab('bonusList'))]

zone_on = [[int(n) for n in re.findall(r'\d+', g)] for g in top_level_groups(grab('zoneOn'))]
zone_list = [re.findall(r'"([^"]*)"', g) for g in top_level_groups(grab('zoneList'))]

n = int(re.search(r'zoneNumber\s*=\s*(\d+)', src).group(1))
zone_on, zone_list = zone_on[:n], zone_list[:n]
assert len(zone_on) == len(zone_list) == n, (len(zone_on), len(zone_list), n)

# Blender заменя ' + - в имената с _, но ги маха, ако са най-отзад.
sanitise = lambda s: re.sub(r"['+-]", '_', s).rstrip('_')

# Оригиналът кодира свойства в самото име на обекта (Starting.ls):
#   "-" = невидим (само за колизии/тригери), "+" = двустранен,
#   "*" = LOD, "?" = махни от сцената.
# Blender конверсията е заменила всички тези знаци с "_", затова ги
# възстановяваме от имената в zoneList, където са запазени.
flat = [o for z in zone_list for o in z]
invisible = sorted({sanitise(o) for o in flat if '-' in o})
double_sided = sorted({sanitise(o) for o in flat if '+' in o})

out = io.StringIO()
out.write('// Автоматично извлечено от FFXRunner6.dir — не редактирай на ръка.\n')
out.write('// Генерира се с tools/extract_params.py.\n')
out.write('// Координатите са в оригиналните Director единици (фут, Z нагоре).\n\n')
out.write('export const BONUSES = %s;\n\n' % json.dumps(bonuses))
out.write('export const ZONE_ON = %s;\n\n' % json.dumps(zone_on))
out.write('export const ZONE_LIST = %s;\n\n' % json.dumps([[sanitise(o) for o in z] for z in zone_list]))
out.write('// Тригерни обеми — невидими, но се засичат от лъча към земята.\n')
out.write('export const INVISIBLE = %s;\n\n' % json.dumps(invisible))
out.write('export const DOUBLE_SIDED = %s;\n' % json.dumps(double_sided))
DST.write_text(out.getvalue())

print(f'бонуси {len(bonuses)} · зони {len(zone_list)} · обекти {sum(len(z) for z in zone_list)} '
      f'· невидими {len(invisible)} · двустранни {len(double_sided)}')
