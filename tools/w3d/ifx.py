"""Чете IFX/W3D (Shockwave 3D) от 3DEM блок на Director: възлите на сцената."""
import struct

def blocks(d, start=16):
    p = start
    while p + 8 <= len(d):
        bt, ds = struct.unpack('<II', d[p:p+8])
        yield p, bt, d[p+8:p+8+ds]
        p += 8 + ((ds + 3) & ~3)

class R:
    def __init__(self, b): self.b, self.p = b, 0
    def u16(self): v = struct.unpack('<H', self.b[self.p:self.p+2])[0]; self.p += 2; return v
    def u32(self): v = struct.unpack('<I', self.b[self.p:self.p+4])[0]; self.p += 4; return v
    def f32(self): v = struct.unpack('<f', self.b[self.p:self.p+4])[0]; self.p += 4; return v
    def s(self): n = self.u16(); v = self.b[self.p:self.p+n].decode('latin1'); self.p += n; return v
    def rest(self): return self.b[self.p:]

NODE_KIND = {0xffffff70: 'group', 0xffffff71: 'light', 0xffffff72: 'model', 0xffffff74: 'view'}

def nodes(d):
    out = []
    for off, bt, data in blocks(d):
        if bt not in NODE_KIND: continue
        r = R(data)
        name = r.s(); parent = r.s(); props = r.s()
        m = [r.f32() for _ in range(16)]
        out.append({'kind': NODE_KIND[bt], 'name': name, 'parent': parent, 'props': props,
                    'matrix': m, 'rest': r.rest()})
    return out
