#!/usr/bin/env python3
"""Вади от оригиналния FFXRunner6.dir онова, което Blender конверсията е загубила.

Директорският файл носи сцената два пъти:

  * 3DEM блок — Shockwave 3D (IFX, предшественикът на U3D). Възлите в него
    са некомпресирани: име, родител, потребителски свойства и матрица 4x4.
    Геометрията на моделите обаче е компресирана с аритметичен кодер и тук
    не се чете.
  * XMED блок „MAX_exported_world" — физиката на Havok. За всяко твърдо тяло:
    име, върхове и триъгълници в локалните координати на обекта, без никаква
    компресия.

Заедно дават точното място на всеки обект и формата на всяко тяло, което
участва във физиката: невидимите пътища и рампи, стените, камиона,
паркираните коли. Плюс камерите на оригинала и четирите тригера на
сценария, които конверсията изобщо не е пренесла.

    python3 tools/w3d/extract.py        # пише assets/original.json
"""
import json
import pathlib
import re
import struct

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent.parent
DIR_FILE = ROOT / 'source/original_files/director/FFXRunner6.dir'
OUT = ROOT / 'assets/original.json'
WORLD_OBJECTS = ROOT / 'tools/world_objects.txt'

HAVOK_MAGIC = b'\xa9\xee\x9f\x01E0\x05\x05'


def chunks(data):
    """Записите от mmap на RIFX файла (малко-ендиан: 'XFIR')."""
    off = data.find(b'pamm')
    size = struct.unpack('<I', data[off + 4:off + 8])[0]
    body = data[off + 8:off + 8 + size]
    hdr_len, entry_len, _, used = struct.unpack('<HHii', body[:12])
    for k in range(used):
        e = body[hdr_len + k * entry_len: hdr_len + (k + 1) * entry_len]
        fourcc = e[:4][::-1].decode('latin1')
        length, pos = struct.unpack('<ii', e[4:12])
        yield fourcc, data[pos + 8:pos + 8 + length]


class Reader:
    def __init__(self, b):
        self.b, self.p = b, 0

    def u16(self):
        v = struct.unpack('<H', self.b[self.p:self.p + 2])[0]
        self.p += 2
        return v

    def f32(self):
        v = struct.unpack('<f', self.b[self.p:self.p + 4])[0]
        self.p += 4
        return v

    def s(self):
        n = self.u16()
        v = self.b[self.p:self.p + n].decode('latin1')
        self.p += n
        return v


NODE_KIND = {0xffffff70: 'group', 0xffffff71: 'light', 0xffffff72: 'model', 0xffffff74: 'view'}


def ifx_nodes(d):
    """Възлите на IFX сцената. Блокът е [тип u32][дължина u32][данни, до 4]."""
    p = d.find(b'IFX\x00')
    out = {}
    while p + 8 <= len(d):
        bt, ds = struct.unpack('<II', d[p:p + 8])
        data = d[p + 8:p + 8 + ds]
        p += 8 + ((ds + 3) & ~3)
        if bt not in NODE_KIND:
            continue
        r = Reader(data)
        name, parent, props = r.s(), r.s(), r.s()
        matrix = [r.f32() for _ in range(16)]
        node = {'kind': NODE_KIND[bt], 'parent': parent, 'matrix': matrix, 'props': props}
        if bt == 0xffffff74:
            # Изгледът: [u32][hither][yon][fieldOfView в градуси, по вертикала]
            rest = data[r.p:]
            node['fov'] = struct.unpack('<f', rest[12:16])[0]
        out[name] = node
    return out


def havok_bodies(d):
    """Телата от MAX_exported_world: име, върхове и триъгълници."""
    out = {}
    for part in d.split(HAVOK_MAGIC)[1:]:
        z = part.find(b'\x00')
        name = part[:z].decode('latin1')
        j = z + 1
        nv = struct.unpack('<I', part[j:j + 4])[0]
        j += 4
        verts = struct.unpack('<%df' % (nv * 3), part[j:j + 12 * nv])
        j += 12 * nv
        nt = struct.unpack('<I', part[j:j + 4])[0]
        j += 4
        tris = struct.unpack('<%dI' % (nt * 3), part[j:j + 12 * nt])
        out[name] = (verts, tris)
    return out


def mass(props):
    m = re.search(r'Mass = ([\d.,]+)', props)
    return float(m.group(1).replace(',', '.')) if m else None


def transform(m, v):
    """Матриците на Director са по колони: позицията е в m[12..14]."""
    x, y, z = v
    return [m[0] * x + m[4] * y + m[8] * z + m[12],
            m[1] * x + m[5] * y + m[9] * z + m[13],
            m[2] * x + m[6] * y + m[10] * z + m[14]]


def sanitise(name):
    # Така са се изродили имената при конверсията (виж data.js).
    return re.sub(r"['+-]", '_', name).rstrip('_')


def main():
    data = DIR_FILE.read_bytes()
    world3d = havok = None
    for fourcc, body in chunks(data):
        if fourcc != 'XMED':
            continue
        if body.startswith(b'3DEM') and (world3d is None or len(body) > len(world3d)):
            world3d = body
        elif b'MAX_exported_world' in body[:40]:
            havok = body
    nodes = ifx_nodes(world3d)
    bodies = havok_bodies(havok)

    converted = {sanitise(l.strip()) for l in WORLD_OBJECTS.read_text().splitlines() if l.strip()}

    def target_of(name):
        t = nodes.get(name + '.Target')
        return t['matrix'][12:15] if t else None

    cameras = {n: {'position': v['matrix'][12:15], 'target': target_of(n), 'fov': round(v['fov'], 3)}
               for n, v in nodes.items() if v['kind'] == 'view' and n != 'defaultview'}

    triggers = {n.lstrip('-'): {'position': v['matrix'][12:15], 'matrix': v['matrix']}
                for n, v in nodes.items() if n.startswith('-SW')}

    missing = {}
    for name, v in nodes.items():
        if v['kind'] != 'model' or sanitise(name) in converted or name.startswith('-SW'):
            continue
        entry = {'matrix': v['matrix'], 'mass': mass(v['props'])}
        if name in bodies:
            verts, tris = bodies[name]
            world = [transform(v['matrix'], verts[i:i + 3]) for i in range(0, len(verts), 3)]
            entry['vertices'] = [round(c, 3) for p in world for c in p]
            entry['triangles'] = list(tris)
            # Локалният размер — за подреждане на модели от cars.glb.
            xs, ys, zs = verts[0::3], verts[1::3], verts[2::3]
            entry['local_size'] = [round(max(a) - min(a), 3) for a in (xs, ys, zs)]
        missing[name] = entry

    # Същото тяло и за обектите, които конверсията ИМА — за сверка на
    # координатите (виж README: съвпадат до сантиметри).
    check = {}
    for name in ('Transenna16', 'Chiesazz+', "'StradaZona02"):
        if name in nodes and name in bodies:
            verts, _ = bodies[name]
            world = [transform(nodes[name]['matrix'], verts[i:i + 3]) for i in range(0, len(verts), 3)]
            check[name] = {'matrix': nodes[name]['matrix'],
                           'min': [round(min(p[k] for p in world), 2) for k in range(3)],
                           'max': [round(max(p[k] for p in world), 2) for k in range(3)]}

    # Матриците на обекти, които конверсията има и които служат за образец
    # на липсващите: къщата CasazzD01 е същата като D09–D11, бараката
    # Capanazz15 е най-близката по размер до Capanazz08, а оградите са
    # слети в един обект Transenna16.
    sources = {}
    for name in ('CasazzD01', 'Capanazz15', 'Transenna16'):
        if name in nodes:
            sources[name] = {'matrix': nodes[name]['matrix']}
            if name in bodies:
                verts, _ = bodies[name]
                world = [transform(nodes[name]['matrix'], verts[i:i + 3]) for i in range(0, len(verts), 3)]
                sources[name]['min'] = [round(min(p[k] for p in world), 3) for k in range(3)]
                sources[name]['max'] = [round(max(p[k] for p in world), 3) for k in range(3)]

    OUT.write_text(json.dumps({
        'sources': sources,
        'source': 'source/original_files/director/FFXRunner6.dir (tools/w3d/extract.py)',
        'cameras': cameras,
        'triggers': triggers,
        'missing': missing,
        'check': check,
    }, ensure_ascii=False, separators=(',', ':')))
    with_body = sum(1 for m in missing.values() if 'vertices' in m)
    print(f'{OUT.relative_to(ROOT)}: {len(cameras)} камери, {len(triggers)} тригера, '
          f'{len(missing)} липсващи обекта ({with_body} с физично тяло)')


if __name__ == '__main__':
    main()
