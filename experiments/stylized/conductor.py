"""The conductor, stylized to go with the stylized carriage: modelled, rigged and animated from scratch in Blender.

Run:  python conductor.py <out.glb> [preview.png]

An original character in the game's toy-like language: a big rounded head with a friendly face (eyes with a
catchlight, brows, a neat moustache, rosy cheeks, ears, hair under the cap), a railway peaked cap with a gold braid
and a winged-wheel badge, a double-breasted navy jacket with gold buttons, lapels, epaulettes, gold cuffs, a pocket
flap and a watch chain, a white collar and a red tie, white gloves, trousers and glossy black shoes.

Every part is lofted from rings (or turned on a lathe) and smoothed, skinned to a 17-bone skeleton by distance to
each bone (each part may only follow the bones it belongs to), and animated procedurally: idle, walk, run,
carry_idle, carry_walk, work, cheer, wave. Faces -Y in Blender (+Z in glTF, as the game expects).
"""
import bpy, bmesh, math, os, sys
from mathutils import Vector, Matrix, Quaternion, Euler

OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/conductor.glb'
PREVIEW = sys.argv[2] if len(sys.argv) > 2 else None
FPS = 30

bpy.ops.wm.read_factory_settings(use_empty=True)
S = bpy.context.scene
S.render.fps = FPS


# ------------------------------------------------------------------ materials
def srgb(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]


MATS = {}


def mat(name, hexcol, rough=0.6, metal=0.0, coat=0.0, emit=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*srgb(hexcol), 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    b.inputs['Coat Weight'].default_value = coat
    if emit:
        b.inputs['Emission Color'].default_value = (*srgb(hexcol), 1)
        b.inputs['Emission Strength'].default_value = emit
    MATS[name] = m
    return m


mat('jacket', '#2b3c86', 0.62)
mat('jacket dark', '#22306c', 0.62)
mat('trousers', '#1d2756', 0.66)
mat('gold', '#f2b53a', 0.32, 0.55)
mat('glove', '#f8f6f0', 0.7)
mat('shirt', '#fbfaf5', 0.6)
mat('tie', '#cf2c3c', 0.5)
mat('skin', '#f6c29a', 0.55)
mat('cheek', '#f39a8c', 0.6)
mat('nose', '#f3b08c', 0.5)
mat('hair', '#6e3f22', 0.65)
mat('moustache', '#5c331b', 0.7)
mat('eye', '#17121c', 0.15)
mat('eye white', '#ffffff', 0.2, emit=0.4)
mat('mouth', '#8a2a2a', 0.5)
mat('shoe', '#1b1b22', 0.28, coat=0.6)
mat('sole', '#4a3326', 0.8)
mat('cap', '#24316f', 0.55)
mat('visor', '#121218', 0.18, coat=0.8)


# ------------------------------------------------------------------ mesh building
PARTS = []  # (object, allowed bones or a single rigid bone)


def finish(bm, name, material, bones, subsurf=1, smooth=True):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    S.collection.objects.link(ob)
    ob.data.materials.append(MATS[material])
    for p in me.polygons:
        p.use_smooth = smooth
    if subsurf:
        md = ob.modifiers.new('sub', 'SUBSURF')
        md.levels = md.render_levels = subsurf
        bpy.context.view_layer.objects.active = ob
        ob.select_set(True)
        bpy.ops.object.modifier_apply(modifier='sub')
        ob.select_set(False)
    PARTS.append((ob, bones))
    return ob


def frame(t, ref):
    t = t.normalized()
    side = (ref - t * ref.dot(t))
    if side.length < 1e-5:
        side = Vector((1, 0, 0)) - t * t.x
    side.normalize()
    return side, t.cross(side).normalized()


def loft(name, pts, radii, material, bones, ref=Vector((1, 0, 0)), segs=16, caps=(True, True), subsurf=1, twist=0.0):
    """Rings along a path. `radii` are (side, other) per point; the side axis follows `ref` across the path."""
    bm = bmesh.new()
    rings = []
    n = len(pts)
    for i, p in enumerate(pts):
        p = Vector(p)
        a = Vector(pts[min(i + 1, n - 1)]) - Vector(pts[max(i - 1, 0)])
        side, other = frame(a, Vector(ref))
        rx, ry = radii[i]
        ring = []
        for k in range(segs):
            th = 2 * math.pi * k / segs + twist
            ring.append(bm.verts.new(p + side * (rx * math.cos(th)) + other * (ry * math.sin(th))))
        rings.append(ring)
    for i in range(n - 1):
        for k in range(segs):
            k2 = (k + 1) % segs
            bm.faces.new((rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]))
    for end, ring in ((0, rings[0]), (1, rings[-1])):
        if caps[end]:
            c = bm.verts.new(sum((v.co for v in ring), Vector()) / segs)
            for k in range(segs):
                k2 = (k + 1) % segs
                f = (ring[k], ring[k2], c) if end == 1 else (ring[k2], ring[k], c)
                bm.faces.new(f)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return finish(bm, name, material, bones, subsurf)


def blob(name, centre, radii, material, bones, segs=20, rings=14, power=1.0, rot=(0, 0, 0), cut=None, subsurf=0):
    """An ellipsoid (a superellipsoid with power < 1); `cut(v)` drops vertices it rejects (local, before scaling)."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=1.0)
    for v in bm.verts:
        if power != 1.0:  # squarer: each coordinate pushed out toward the unit cube
            v.co = Vector([math.copysign(abs(x) ** power, x) for x in v.co])
    if cut:
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not cut(v.co)], context='VERTS')
    R = Euler(rot).to_matrix()
    for v in bm.verts:
        v.co = Vector(centre) + R @ Vector((v.co.x * radii[0], v.co.y * radii[1], v.co.z * radii[2]))
    return finish(bm, name, material, bones, subsurf=subsurf)


def lathe(name, profile, centre, material, bones, segs=28, scale=(1, 1), rot=(0, 0, 0), subsurf=0):
    """A surface of revolution round Z from (radius, height) pairs."""
    bm = bmesh.new()
    rings = []
    R = Euler(rot).to_matrix()
    for r, h in profile:
        ring = []
        for k in range(segs):
            th = 2 * math.pi * k / segs
            ring.append(bm.verts.new(Vector(centre) + R @ Vector((r * math.cos(th) * scale[0], r * math.sin(th) * scale[1], h))))
        rings.append(ring)
    for i in range(len(rings) - 1):
        for k in range(segs):
            k2 = (k + 1) % segs
            bm.faces.new((rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]))
    for ring, top in ((rings[0], False), (rings[-1], True)):
        if ring[0].co.xy != ring[1].co.xy:
            c = bm.verts.new(sum((v.co for v in ring), Vector()) / segs)
            for k in range(segs):
                k2 = (k + 1) % segs
                bm.faces.new((ring[k], ring[k2], c) if top else (ring[k2], ring[k], c))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return finish(bm, name, material, bones, subsurf)


# ------------------------------------------------------------------ the figure (metres; faces -Y; +X is his left)
LEGS = ['hips', 'thigh.{s}', 'shin.{s}']
TORSO = ['hips', 'spine', 'chest', 'neck']
ARM = ['chest', 'upperarm.{s}', 'forearm.{s}']

# jacket: rings up the body (z, half-width, half-depth, forward offset)
JACKET = [(0.545, 0.182, 0.150, 0.0), (0.58, 0.176, 0.140, 0.0), (0.64, 0.162, 0.126, 0.0), (0.70, 0.152, 0.118, 0.0),
          (0.78, 0.160, 0.124, -0.004), (0.87, 0.172, 0.132, -0.008), (0.94, 0.176, 0.130, -0.006), (0.99, 0.160, 0.118, 0.0),
          (1.025, 0.115, 0.098, 0.0), (1.04, 0.07, 0.07, 0.0)]


def jacket_front(z):
    """Where the jacket's front is at height z (its depth there and the forward offset)."""
    for a, b in zip(JACKET, JACKET[1:]):
        if a[0] <= z <= b[0]:
            t = (z - a[0]) / (b[0] - a[0])
            return a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t, a[1] + (b[1] - a[1]) * t
    return JACKET[-1][2], 0, JACKET[-1][1]


loft('jacket', [(0, o, z) for z, _, _, o in JACKET], [(w, d) for _, w, d, _ in JACKET], 'jacket', TORSO, segs=20)
# the hem a touch flared, in a darker navy, and the trousers' seat under it
lathe('hem', [(1.0, 0.0), (1.0, 0.03)], (0, 0, 0.53), 'jacket dark', TORSO, scale=(0.188, 0.156))

for s, side in ((1, 'L'), (-1, 'R')):
    legs = [b.format(s=side) for b in LEGS]
    x = s * 0.088
    loft(f'trouser {side}', [(x, 0, 0.66), (x, 0, 0.56), (x * 1.02, 0, 0.36), (x * 1.03, 0.005, 0.15), (x * 1.03, 0.008, 0.085)],
         [(0.08, 0.08), (0.078, 0.078), (0.064, 0.066), (0.06, 0.062), (0.064, 0.066)], 'trousers', legs, caps=(True, False))
    # a gold stripe down the outer seam
    loft(f'stripe {side}', [(x + s * 0.066, 0, 0.55), (x + s * 0.058, 0.002, 0.36), (x + s * 0.057, 0.006, 0.12)],
         [(0.004, 0.012)] * 3, 'gold', legs, ref=Vector((0, 1, 0)), segs=8, subsurf=0)
    # shoes: a rounded toe, a sole and a heel
    foot = [f'foot.{side}', f'shin.{side}']
    loft(f'shoe {side}', [(x, 0.05, 0.06), (x, 0.0, 0.065), (x, -0.07, 0.055), (x, -0.135, 0.045), (x, -0.165, 0.04)],
         [(0.055, 0.05), (0.06, 0.058), (0.062, 0.05), (0.056, 0.042), (0.035, 0.03)], 'shoe', foot, ref=Vector((1, 0, 0)), segs=16)
    loft(f'sole {side}', [(x, 0.06, 0.016), (x, -0.06, 0.016), (x, -0.16, 0.016)], [(0.058, 0.014), (0.064, 0.014), (0.042, 0.012)],
         'sole', foot, ref=Vector((1, 0, 0)), segs=12)

    arm = [b.format(s=side) for b in ARM]
    sh = Vector((s * 0.165, 0.0, 0.965))
    el = Vector((s * 0.215, 0.012, 0.775))
    wr = Vector((s * 0.232, -0.008, 0.61))
    loft(f'sleeve {side}', [sh + Vector((0, 0, 0.03)), sh, sh.lerp(el, 0.5), el, el.lerp(wr, 0.5), wr],
         [(0.066, 0.068), (0.066, 0.066), (0.058, 0.058), (0.053, 0.053), (0.05, 0.05), (0.052, 0.052)], 'jacket', arm,
         ref=Vector((0, 1, 0)), caps=(True, False))
    # gold cuff
    cuff_c = wr + (el - wr).normalized() * 0.012
    loft(f'cuff {side}', [wr, cuff_c + (el - wr).normalized() * 0.02], [(0.056, 0.056), (0.056, 0.056)], 'gold',
         [f'forearm.{side}'], ref=Vector((0, 1, 0)), segs=18, subsurf=0, caps=(True, True))
    # a white glove: palm, fingers in a mitten, a thumb pointing forward
    hand = [f'hand.{side}', f'forearm.{side}']
    hc = wr + Vector((s * 0.004, -0.004, -0.06))
    blob(f'glove {side}', hc, (0.032, 0.046, 0.062), 'glove', hand, segs=18, rings=12)
    loft(f'thumb {side}', [hc + Vector((-s * 0.012, -0.03, 0.03)), hc + Vector((-s * 0.016, -0.055, 0.0)), hc + Vector((-s * 0.012, -0.062, -0.022))],
         [(0.016, 0.016), (0.015, 0.015), (0.012, 0.012)], 'glove', hand, ref=Vector((1, 0, 0)), segs=10)
    loft(f'glove cuff {side}', [wr + Vector((0, 0, 0.0)), wr + Vector((0, 0, -0.02))], [(0.044, 0.044), (0.04, 0.04)], 'glove', hand,
         ref=Vector((0, 1, 0)), segs=14)
    # epaulette on the shoulder: a gold pad with a rolled edge
    ep = Vector((s * 0.128, 0.0, 1.0))
    blob(f'epaulette {side}', ep, (0.062, 0.05, 0.016), 'gold', ['chest'], segs=18, rings=8, rot=(0, -s * 0.38, 0))
    lathe(f'epaulette rim {side}', [(1.0, -0.006), (1.15, 0.0), (1.0, 0.006)], ep + Vector((s * 0.03, 0, -0.012)), 'gold', ['chest'],
          scale=(0.03, 0.05), rot=(0, -s * 0.38, 0), segs=20)

# neck, collar, shirt and tie
loft('neck', [(0, 0, 1.0), (0, 0, 1.09)], [(0.052, 0.05), (0.05, 0.048)], 'skin', ['neck', 'head'], caps=(False, False))
lathe('collar', [(1.0, 0.0), (1.06, 0.025), (1.0, 0.045)], (0, -0.004, 1.02), 'shirt', ['neck', 'chest'], scale=(0.066, 0.062))
d, o, w = jacket_front(0.96)
bm = bmesh.new()
pts = [Vector((-0.045, -d + o - 0.004, 1.035)), Vector((0.045, -d + o - 0.004, 1.035)), Vector((0, -d + o - 0.012, 0.89))]
vs = [bm.verts.new(p) for p in pts]
bm.faces.new(vs)
bmesh.ops.extrude_face_region(bm, geom=bm.faces[:])
for v in bm.verts[3:]:
    v.co.y += 0.006
finish(bm, 'shirt front', 'shirt', ['chest'], subsurf=0, smooth=False)
loft('tie knot', [(0, -d + o - 0.018, 1.02), (0, -d + o - 0.02, 1.0)], [(0.014, 0.01), (0.012, 0.01)], 'tie', ['chest'], segs=10, subsurf=0)
loft('tie', [(0, -d + o - 0.02, 1.0), (0, -d + o - 0.022, 0.95), (0, -d + o - 0.02, 0.905)], [(0.016, 0.006), (0.022, 0.006), (0.006, 0.005)],
     'tie', ['chest'], ref=Vector((1, 0, 0)), segs=8, subsurf=0)
# lapels: two flat panels in a darker navy folding out from the collar
for s in (1, -1):
    z0, z1 = 1.03, 0.86
    d0, o0, _ = jacket_front(z0 - 0.02)
    d1, o1, _ = jacket_front(z1)
    loft(f'lapel {s}', [(s * 0.05, -d0 + o0 - 0.006, z0 - 0.01), (s * 0.075, -d1 + o1 - 0.03, 0.93), (s * 0.03, -d1 + o1 - 0.006, z1)],
         [(0.03, 0.006), (0.032, 0.006), (0.008, 0.004)], 'jacket dark', ['chest'], ref=Vector((1, 0, 0)), segs=8, subsurf=1)
# buttons: double-breasted, two rows of three
for z in (0.66, 0.75, 0.84):
    dd, oo, _ = jacket_front(z)
    for x in (-0.052, 0.052):
        blob(f'button {x} {z}', (x, -dd + oo - 0.004, z), (0.014, 0.008, 0.014), 'gold', ['spine', 'chest', 'hips'], segs=12, rings=8)
# a pocket flap on his left with the watch chain looping to the middle button
dd, oo, ww = jacket_front(0.65)
loft('pocket', [(0.07, -dd + oo + 0.012, 0.66), (0.145, -dd + oo + 0.032, 0.66)], [(0.016, 0.006), (0.016, 0.006)], 'jacket dark',
     ['hips', 'spine'], ref=Vector((0, 0, 1)), segs=8, subsurf=0)
chain = [Vector((0.052, -dd + oo - 0.006, 0.75))]
for k in range(1, 9):
    t = k / 8
    chain.append(Vector((0.052 + 0.06 * t, -jacket_front(0.75 - 0.09 * t)[0] + oo - 0.006 - 0.012 * math.sin(t * math.pi), 0.75 - 0.09 * t - 0.03 * math.sin(t * math.pi))))
loft('watch chain', chain, [(0.003, 0.003)] * len(chain), 'gold', ['spine', 'hips'], segs=6, subsurf=0)

# ------------------------------------------------------------------ the head
HEAD = Vector((0, 0.005, 1.265))
HR = (0.185, 0.172, 0.198)
blob('head', HEAD, HR, 'skin', ['head'], segs=36, rings=26, power=0.88)


def on_face(x, z, inset=0.0):
    """A point on the head's surface in front (−Y) at (x, z) offset from the head's centre."""
    nx, nz = x / HR[0], (z) / HR[2]
    # superellipsoid front: |x|^(2/p)+|y|^(2/p)+|z|^(2/p)=1 with p = 0.88
    e = 2 / 0.88
    yy = max(0.0, 1 - abs(nx) ** e - abs(nz) ** e) ** (1 / e)
    return Vector((HEAD.x + x, HEAD.y - yy * HR[1] + inset, HEAD.z + z))


for s in (1, -1):
    # ears
    blob(f'ear {s}', HEAD + Vector((s * 0.178, 0.012, -0.012)), (0.02, 0.034, 0.044), 'skin', ['head'], segs=14, rings=10)
    blob(f'ear in {s}', HEAD + Vector((s * 0.19, 0.008, -0.012)), (0.008, 0.02, 0.028), 'cheek', ['head'], segs=10, rings=8)
    # eyes: a dark oval, a catchlight; brows over them
    e = on_face(s * 0.068, 0.012, 0.006)
    blob(f'eye {s}', e, (0.024, 0.012, 0.032), 'eye', ['head'], segs=16, rings=10)
    blob(f'catchlight {s}', e + Vector((s * 0.007, -0.009, 0.012)), (0.0075, 0.004, 0.0085), 'eye white', ['head'], segs=8, rings=6)
    b0 = on_face(s * 0.04, 0.068, -0.002)
    b1 = on_face(s * 0.1, 0.06, -0.002)
    loft(f'brow {s}', [b0, (b0 + b1) / 2 + Vector((0, -0.004, 0.006)), b1], [(0.009, 0.006), (0.01, 0.007), (0.007, 0.005)], 'hair', ['head'],
         ref=Vector((0, 0, 1)), segs=8, subsurf=0)
    # rosy cheeks
    blob(f'cheek {s}', on_face(s * 0.1, -0.035, 0.009), (0.03, 0.008, 0.02), 'cheek', ['head'], segs=14, rings=8)
    # the moustache: two tapering curls from under the nose, turned up at the ends
    m0 = on_face(s * 0.004, -0.045, -0.012)
    m1 = on_face(s * 0.045, -0.055, -0.008)
    m2 = on_face(s * 0.085, -0.048, -0.002)
    m3 = on_face(s * 0.1, -0.025, 0.0)
    loft(f'moustache {s}', [m0, m1, m2, m3], [(0.016, 0.012), (0.019, 0.013), (0.012, 0.009), (0.005, 0.004)], 'moustache', ['head'],
         ref=Vector((0, 0, 1)), segs=10, subsurf=1)
# the nose and a small smile
blob('nose', on_face(0, -0.012, -0.012), (0.026, 0.022, 0.024), 'nose', ['head'], segs=16, rings=12)
sm = [on_face(x, -0.09 + 0.012 * (x / 0.03) ** 2, 0.002) for x in (-0.03, -0.015, 0, 0.015, 0.03)]
loft('smile', sm, [(0.0045, 0.0045)] * 5, 'mouth', ['head'], segs=8, subsurf=0)
# hair: the back and sides under the cap, sideburns
hair = blob('hair', HEAD + Vector((0, 0.01, 0.01)), (HR[0] * 1.045, HR[1] * 1.05, HR[2] * 1.035), 'hair', ['head'], segs=40, rings=30, power=0.88, subsurf=1,
            cut=lambda c: c.z < 0.85 and c.z > -0.55 + 0.5 * max(0.0, -c.y) and c.y > 0.06 + 0.15 * max(0.0, -c.z) - 0.12 * max(0.0, c.z - 0.3))

# sideburns: short tapering strips in front of the ears
for s in (1, -1):
    sb = [HEAD + Vector((s * 0.172, -0.012, 0.07)), HEAD + Vector((s * 0.176, -0.022, 0.02)), HEAD + Vector((s * 0.172, -0.028, -0.03))]
    loft(f'sideburn {s}', sb, [(0.012, 0.02), (0.012, 0.016), (0.01, 0.009)], 'hair', ['head'], ref=Vector((1, 0, 0)), segs=10)

# the cap: a crown flaring over a gold braid band, a glossy visor, a winged-wheel badge
CAP = HEAD + Vector((0, 0.01, 0.135))
TILT = (math.radians(-7), 0, 0)
lathe('cap band', [(1.0, 0.0), (1.0, 0.062)], CAP, 'cap', ['head'], scale=(0.192, 0.182), rot=TILT, segs=36)
lathe('cap braid', [(1.0, 0.004), (1.018, 0.012), (1.018, 0.03), (1.0, 0.038)], CAP, 'gold', ['head'], scale=(0.192, 0.182), rot=TILT, segs=36)
lathe('cap crown', [(1.0, 0.06), (1.12, 0.1), (1.2, 0.125), (1.17, 0.14), (0.9, 0.152), (0.0, 0.156)], CAP, 'cap', ['head'],
      scale=(0.19, 0.18), rot=TILT, segs=36, subsurf=1)
lathe('cap piping', [(1.205, 0.12), (1.225, 0.126), (1.205, 0.132)], CAP, 'gold', ['head'], scale=(0.19, 0.18), rot=TILT, segs=36)
bm = bmesh.new()
R = Euler(TILT).to_matrix()
ring_in, ring_out = [], []
for k in range(17):
    th = math.pi + math.pi * k / 16
    ci = Vector((0.192 * math.cos(th), 0.182 * math.sin(th), 0.004))
    co = Vector((0.205 * math.cos(th), 0.182 * math.sin(th) - 0.09 * math.sin(th) ** 2 * 1.0, -0.022 * math.sin(th) ** 2))
    ring_in.append(bm.verts.new(CAP + R @ ci))
    ring_out.append(bm.verts.new(CAP + R @ co))
for k in range(16):
    bm.faces.new((ring_in[k], ring_in[k + 1], ring_out[k + 1], ring_out[k]))
bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.008)
finish(bm, 'visor', 'visor', ['head'], subsurf=1)
bp = CAP + R @ Vector((0, -0.2, 0.09))
blob('badge wheel', bp, (0.018, 0.006, 0.018), 'gold', ['head'], segs=14, rings=8, rot=(math.radians(-7), 0, 0))
for s in (1, -1):
    blob(f'badge wing {s}', bp + Vector((s * 0.03, 0.003, 0.004)), (0.024, 0.004, 0.009), 'gold', ['head'], segs=12, rings=6,
         rot=(0, s * 0.25, 0))


# ------------------------------------------------------------------ the skeleton
arm_data = bpy.data.armatures.new('rig')
rig = bpy.data.objects.new('conductor', arm_data)
S.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')
BONES = {
    'hips': ((0, 0, 0.60), (0, 0, 0.72), None),
    'spine': ((0, 0, 0.72), (0, 0, 0.86), 'hips'),
    'chest': ((0, 0, 0.86), (0, 0, 1.0), 'spine'),
    'neck': ((0, 0, 1.0), (0, 0, 1.09), 'chest'),
    'head': ((0, 0, 1.09), (0, 0, 1.46), 'neck'),
}
for s, side in ((1, 'L'), (-1, 'R')):
    x = s * 0.088
    BONES[f'thigh.{side}'] = ((x, 0, 0.62), (x * 1.02, 0, 0.36), 'hips')
    BONES[f'shin.{side}'] = ((x * 1.02, 0, 0.36), (x * 1.03, 0.006, 0.075), f'thigh.{side}')
    BONES[f'foot.{side}'] = ((x * 1.03, 0.006, 0.075), (x, -0.15, 0.04), f'shin.{side}')
    BONES[f'upperarm.{side}'] = ((s * 0.165, 0, 0.965), (s * 0.215, 0.012, 0.775), 'chest')
    BONES[f'forearm.{side}'] = ((s * 0.215, 0.012, 0.775), (s * 0.232, -0.008, 0.61), f'upperarm.{side}')
    BONES[f'hand.{side}'] = ((s * 0.232, -0.008, 0.61), (s * 0.236, -0.012, 0.5), f'forearm.{side}')
for name, (h, t, parent) in BONES.items():
    b = arm_data.edit_bones.new(name)
    b.head, b.tail = Vector(h), Vector(t)
    b.roll = 0
for name, (h, t, parent) in BONES.items():
    if parent:
        b = arm_data.edit_bones[name]
        b.parent = arm_data.edit_bones[parent]
        b.use_connect = (Vector(arm_data.edit_bones[parent].tail) - Vector(h)).length < 1e-4
bpy.ops.object.mode_set(mode='OBJECT')
SEG = {n: (Vector(h), Vector(t)) for n, (h, t, _) in BONES.items()}


def seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(1e-9, ab.dot(ab))))
    return (p - (a + ab * t)).length


# ------------------------------------------------------------------ skinning: by distance to each allowed bone
for ob, bones in PARTS:
    for n in bones:
        ob.vertex_groups.new(name=n)
    for v in ob.data.vertices:
        if len(bones) == 1:
            ob.vertex_groups[bones[0]].add([v.index], 1.0, 'REPLACE')
            continue
        ws = sorted(((1.0 / (seg_dist(v.co, *SEG[n]) + 0.01) ** 4, n) for n in bones), reverse=True)[:2]
        tot = sum(w for w, _ in ws)
        for w, n in ws:
            ob.vertex_groups[n].add([v.index], w / tot, 'REPLACE')

# join into one skinned mesh
objs = [ob for ob, _ in PARTS]
bpy.ops.object.select_all(action='DESELECT')
for ob in objs:
    ob.select_set(True)
bpy.context.view_layer.objects.active = objs[0]
bpy.ops.object.join()
body = bpy.context.view_layer.objects.active
body.name = 'conductor body'
body.parent = rig
md = body.modifiers.new('rig', 'ARMATURE')
md.object = rig
print('TRIS', sum(len(p.vertices) - 2 for p in body.data.polygons), 'VERTS', len(body.data.vertices))


# ------------------------------------------------------------------ animation
REST = {pb.name: pb.bone.matrix_local.to_3x3() for pb in rig.pose.bones}
for pb in rig.pose.bones:
    pb.rotation_mode = 'QUATERNION'


def rot(name, x=0.0, y=0.0, z=0.0):
    """A rotation given about the armature's axes (X: his left, Y: back, Z: up), as the bone's pose."""
    B = REST[name]
    Rw = Euler((math.radians(x), math.radians(y), math.radians(z)), 'XYZ').to_matrix()
    return (B.inverted() @ Rw @ B).to_quaternion()


def lift(name, dz=0.0, dy=0.0):
    return REST[name].inverted() @ Vector((0, dy, dz))


def make(name, frames, pose, loop=True):
    """`pose(t)` returns {bone: (x, y, z) degrees, 'hips_loc': (dz, dy)} for t in [0, 1)."""
    act = bpy.data.actions.new(name)
    rig.animation_data_create()
    rig.animation_data.action = act
    for f in range(frames + (1 if loop else 0)):
        t = (f % frames) / frames if loop else f / max(1, frames - 1)
        p = pose(t)
        for pb in rig.pose.bones:
            r = p.get(pb.name, (0, 0, 0))
            pb.rotation_quaternion = rot(pb.name, *r)
            pb.keyframe_insert('rotation_quaternion', frame=f)
            if pb.name == 'hips':
                pb.location = lift('hips', *p.get('hips_loc', (0, 0)))
                pb.keyframe_insert('location', frame=f)
    tr = rig.animation_data.nla_tracks.new()
    tr.name = name
    strip = tr.strips.new(name, 0, act)
    # Blender 4.4+: an action holds slots; the strip must name the rig's
    if hasattr(strip, 'action_slot') and len(act.slots):
        strip.action_slot = act.slots[0]
    rig.animation_data.action = None
    return act


TAU = 2 * math.pi
sin = math.sin
cos = math.cos
ARM_DOWN = 4  # arms rest a little out from the body


def base_arms(p, out=ARM_DOWN):
    p['upperarm.L'] = (0, -out, 0)
    p['upperarm.R'] = (0, out, 0)
    p['forearm.L'] = (-8, 0, 0)
    p['forearm.R'] = (-8, 0, 0)


def idle(t):
    b = sin(TAU * t)
    p = {'hips_loc': (0.003 * b, 0)}
    p['chest'] = (1.5 * b, 0, 0)
    p['spine'] = (0.8 * b, 0, 1.2 * sin(TAU * t + 1))
    p['head'] = (-1.2 * b, 1.5 * sin(TAU * t + 0.6), 2 * sin(TAU * t * 1 + 2))
    base_arms(p, ARM_DOWN + 1.5 * b)
    p['forearm.L'] = (-10 - 2 * b, 0, 0)
    p['forearm.R'] = (-10 - 2 * b, 0, 0)
    return p


def legs(p, t, swing, knee, bob, lean=0.0):
    for side, ph in (('L', 0.0), ('R', 0.5)):
        a = TAU * (t + ph)
        s = sin(a)
        p[f'thigh.{side}'] = (-swing * s, 0, 0)
        # the knee bends as the leg swings through (the back half of the stride)
        k = knee * max(0.0, sin(a + 0.6)) ** 1.1 * 0.8 + knee * 0.12 + 4
        p[f'shin.{side}'] = (k, 0, 0)
        p[f'foot.{side}'] = (-(k * 0.35) + swing * 0.3 * s, 0, 0)
    p['hips_loc'] = (bob * (abs(cos(TAU * t)) - 0.6), 0)
    p['hips'] = (0, 0, 6 * sin(TAU * t) * (swing / 28))
    p['spine'] = (lean, 0, -4 * sin(TAU * t) * (swing / 28))
    p['chest'] = (lean * 0.5, 0, -3 * sin(TAU * t) * (swing / 28))


def walk(t):
    p = {}
    legs(p, t, 26, 42, 0.026)
    for side, ph, sg in (('L', 0.5, -1), ('R', 0.0, 1)):
        a = TAU * (t + ph)
        p[f'upperarm.{side}'] = (-22 * sin(a), sg * ARM_DOWN, 0)
        p[f'forearm.{side}'] = (-14 - 10 * max(0, sin(a)), 0, 0)
    p['head'] = (-2, 0, 3 * sin(TAU * t))
    return p


def run(t):
    p = {}
    legs(p, t, 40, 85, 0.05, lean=8)
    for side, ph, sg in (('L', 0.5, -1), ('R', 0.0, 1)):
        a = TAU * (t + ph)
        p[f'upperarm.{side}'] = (-42 * sin(a) - 6, sg * (ARM_DOWN + 6), 0)
        p[f'forearm.{side}'] = (-75, 0, 0)
    p['head'] = (-6, 0, 3 * sin(TAU * t))
    return p


def carry_arms(p, b=0.0):
    for side, sg in (('L', -1), ('R', 1)):
        p[f'upperarm.{side}'] = (-28 + b, sg * 10, sg * -6)
        p[f'forearm.{side}'] = (-78 - b, 0, sg * 8)
        p[f'hand.{side}'] = (8, 0, 0)


def carry_idle(t):
    p = idle(t)
    carry_arms(p, 1.2 * sin(TAU * t))
    return p


def carry_walk(t):
    p = walk(t)
    carry_arms(p, 3 * sin(TAU * 2 * t))
    p['spine'] = (p['spine'][0] - 3, 0, p['spine'][2] * 0.5)
    return p


def work(t):
    # leaning in, both hands busy in front: wiping, sorting, polishing
    a = TAU * t
    p = {'hips_loc': (-0.01 + 0.004 * sin(2 * a), 0)}
    p['spine'] = (10, 0, 4 * sin(a))
    p['chest'] = (6, 0, 3 * sin(a))
    p['head'] = (8 + 3 * sin(2 * a), 0, -4 * sin(a))
    p['thigh.L'] = (-4, 0, 0)
    p['thigh.R'] = (4, 0, 0)
    p['shin.L'] = (10, 0, 0)
    p['shin.R'] = (8, 0, 0)
    p['upperarm.R'] = (-40 - 12 * sin(a), 8, 10 * cos(a))
    p['forearm.R'] = (-55 - 15 * cos(a), 0, 12 * sin(a))
    p['upperarm.L'] = (-34 + 8 * sin(a + 2), -8, -6)
    p['forearm.L'] = (-60, 0, -8)
    p['hand.R'] = (0, 0, 20 * sin(a))
    return p


def cheer(t):
    # a little crouch, a hop with both arms flung up, and down again
    up = max(0.0, sin(math.pi * min(1, max(0, (t - 0.18) / 0.5))))
    crouch = max(0.0, sin(math.pi * min(1, t / 0.2))) * 0.6 + max(0.0, sin(math.pi * min(1, max(0, (t - 0.66) / 0.2)))) * 0.5
    p = {'hips_loc': (0.09 * up - 0.05 * crouch, 0)}
    p['thigh.L'] = p['thigh.R'] = (-30 * crouch - 6 * up, 0, 0)
    p['shin.L'] = p['shin.R'] = (55 * crouch + 18 * up, 0, 0)
    p['foot.L'] = p['foot.R'] = (-20 * crouch + 25 * up, 0, 0)
    p['spine'] = (8 * crouch - 6 * up, 0, 0)
    p['head'] = (-14 * up, 0, 0)
    arms = min(1.0, t / 0.22) * (1 - max(0.0, (t - 0.82) / 0.18))
    p['upperarm.L'] = (-10 * arms, -(ARM_DOWN + 150 * arms), 0)
    p['upperarm.R'] = (-10 * arms, ARM_DOWN + 150 * arms, 0)
    p['forearm.L'] = (-12 - 20 * arms, 0, 0)
    p['forearm.R'] = (-12 - 20 * arms, 0, 0)
    return p


def wave(t):
    p = idle(t)
    a = min(1.0, t / 0.15) * (1 - max(0.0, (t - 0.85) / 0.15))
    p['upperarm.R'] = (-20 * a, ARM_DOWN + 125 * a, 0)
    p['forearm.R'] = (-(10 + 40 * a), 0, 0)
    p['hand.R'] = (0, 25 * a * sin(TAU * 3 * t), 0)
    p['head'] = (-4 * a, 6 * a, 8 * a)
    p['spine'] = (0, -3 * a, 0)
    return p


make('idle', 72, idle)
make('walk', 24, walk)
make('run', 18, run)
make('carry_idle', 72, carry_idle)
make('carry_walk', 24, carry_walk)
make('work', 36, work)
make('cheer', 40, cheer, loop=False)
make('wave', 60, wave, loop=False)

# ------------------------------------------------------------------ export
for ob in bpy.data.objects:
    ob.select_set(ob in (rig, body))
bpy.context.view_layer.objects.active = rig
bpy.ops.export_scene.gltf(filepath=OUT, use_selection=True, export_format='GLB', export_apply=False, export_yup=True,
                          export_animations=True, export_animation_mode='NLA_TRACKS', export_force_sampling=True,
                          export_skins=True, export_def_bones=False, export_optimize_animation_size=True)
print('EXPORTED', OUT)

# ------------------------------------------------------------------ a preview: turnaround and poses
if PREVIEW:
    import numpy as np
    S.render.engine = 'CYCLES'
    S.cycles.samples = 24
    S.cycles.use_denoising = True
    S.render.resolution_x, S.render.resolution_y = 520, 620
    S.render.film_transparent = False
    world = bpy.data.worlds.new('w')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.75, 0.82, 0.95, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.7
    S.world = world
    S.view_settings.view_transform = 'AgX'
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sun.data.energy = 4
    sun.data.color = (1, 0.88, 0.72)
    sun.data.angle = math.radians(8)
    sun.rotation_euler = (math.radians(50), 0, math.radians(-35))
    S.collection.objects.link(sun)
    floor = bpy.data.objects.new('floor', bpy.data.meshes.new('floor'))
    bmf = bmesh.new()
    bmesh.ops.create_grid(bmf, x_segments=1, y_segments=1, size=4)
    bmf.to_mesh(floor.data)
    floor.data.materials.append(mat('floor', '#c58a55', 0.7))
    S.collection.objects.link(floor)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    cam.data.lens = 70
    S.collection.objects.link(cam)
    S.camera = cam
    shots = [('idle', 20, -25, 0.8), ('idle', 20, 200, 0.8), ('walk', 6, -60, 0.8), ('run', 4, -80, 0.8), ('carry_walk', 6, -35, 0.8),
             ('work', 9, -40, 0.8), ('cheer', 22, -20, 0.8), ('wave', 22, -30, 0.8)]
    tiles = []
    for name, f, az, el in shots:
        for t in rig.animation_data.nla_tracks:
            t.mute = True
        act = bpy.data.actions[name]
        rig.animation_data.action = act
        if hasattr(rig.animation_data, 'action_slot') and len(act.slots):
            rig.animation_data.action_slot = act.slots[0]
        S.frame_set(f)
        a = math.radians(az)
        dist = 3.2
        cam.location = Vector((math.sin(a) * dist * 0.9, -math.cos(a) * dist * 0.9, 1.75))
        cam.rotation_euler = (Vector((0, 0, 0.78)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
        path = PREVIEW + f'.{len(tiles)}.png'
        S.render.filepath = path
        bpy.ops.render.render(write_still=True)
        tiles.append(path)
    from PIL import Image
    ims = [Image.open(p) for p in tiles]
    sheet = Image.new('RGB', (520 * 4, 620 * 2))
    for i, im in enumerate(ims):
        sheet.paste(im, ((i % 4) * 520, (i // 4) * 620))
    sheet.save(PREVIEW)
    for p in tiles:
        os.remove(p)
    print('PREVIEW', PREVIEW)
