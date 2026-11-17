# Layout concepts (L#): candidate furniture arranged in the emptied suite (x -0.6..2.34, z 2.16..9.21; door on the
# corridor wall at z 4.99..6.39, the tidy spot at (0.0, 5.7)), in the game's camera. Rotation: 0 faces +z (toward
# the camera end), 90 faces +x (the window wall), -90 faces the corridor, 180 faces the front.
import json
W = '/tmp/claude-0/hunt/www'
PH = lambda n: f'ph/{n}/{n}_1k.gltf'
Q = 'dl/q-props/Exports/glTF/'
QH = 'dl/q-house/pack/OBJ/'
KK = 'dl/kk-furniture/KayKit_Furniture_Bits_1.0_FREE/Assets/gltf/'
TT = 'repo/tinytreats-picnic/'
exec(open('/tmp/claude-0/hunt/gen/rugspecs.py').read().split('ROOM =')[0].split('LIGHTS =')[0])
def rug(tex, x, z, w, d, border=None, line=None, bw=0.16, rep=1.2, round_=False):
    out = []
    if border: out.append({'color': border, 'x': x, 'z': z, 'w': w, 'd': d, 'y': 0.020, 'round': round_})
    if line: out.append({'color': line, 'x': x, 'z': z, 'w': w - 2 * bw + 0.06, 'd': d - 2 * bw + 0.06, 'y': 0.022, 'round': round_})
    inset = bw if border else 0
    out.append({'tex': tex, 'x': x, 'z': z, 'w': w - 2 * inset, 'd': d - 2 * inset, 'y': 0.024, 'repeat': rep, 'round': round_})
    return out
M = lambda url, x, z, fit, rot=0, **k: {'url': url, 'x': x, 'z': z, 'fit': fit, 'rot': rot, **k}
WARM = lambda x, z, i=5, y=1.6: {'x': x, 'y': y, 'z': z, 'i': i, 'd': 4.5}
L = {}
L['L1'] = ('royal', 5, [
  M(PH('GothicBed_01'), 1.0, 3.25, [1.75, 2.15]),
  M(PH('ClassicNightstand_01'), -0.27, 2.45, [0.42, 0.38]), M(PH('vintage_oil_lamp'), -0.27, 2.45, [0.16, 0.16], on=True),
  M(PH('ClassicNightstand_01'), 2.1, 2.45, [0.42, 0.38]), M(PH('vintage_oil_lamp'), 2.1, 2.45, [0.16, 0.16], on=True),
  M(PH('Ottoman_01'), 1.0, 4.65, [0.62, 0.45]),
  M(PH('vintage_grandfather_clock_01'), -0.4, 4.45, [0.3, 0.45], 90),
  M(QH + 'Fireplace.obj', -0.4, 7.3, [0.42, 1.05], 90),
  M(PH('sofa_03'), 2.0, 7.3, [0.7, 1.4], -90),
  M(PH('ArmChair_01'), 0.85, 6.5, [0.7, 0.7], 0), M(PH('ArmChair_01'), 0.85, 8.4, [0.7, 0.7], 180),
  M(PH('coffee_table_round_01'), 0.9, 7.4, [0.62, 0.62]), M(PH('brass_goblets'), 0.9, 7.4, [0.22, 0.14], on=True),
  M(Q + 'CandleStick_Stand.gltf', 2.12, 8.95, [0.3, 0.3]), M(PH('potted_plant_04'), -0.38, 8.95, [0.34, 0.34]),
], rug('rugtex/gold_damask.jpg', 0.85, 7.4, 1.9, 2.4, '#5A1424', '#D4AF5A', rep=1.6), [WARM(1.0, 3.3), WARM(0.2, 7.3, 6, 1.0)],
 'The Bedchamber and Salon', 'The four-poster faces you across the room from the front wall, a nightstand and lamp either side. Past the door, a salon round a stove-fireplace: a camelback sofa against the windows, two bergères, a round table with the champagne goblets, on a gold damask rug. The clock stands guard by the door.')
L['L2'] = ('royal', 5, [
  M(PH('GothicBed_01'), 1.5, 3.3, [1.6, 2.1]),
  M(PH('chinese_screen_panels'), -0.12, 2.35, [0.95, 0.3]),
  M(PH('ClassicConsole_01'), -0.38, 3.65, [0.42, 0.95], 90), M(PH('marble_bust_01'), -0.38, 3.65, [0.2, 0.2], 90, on=True),
  M(Q + 'Chest_Wood.gltf', 1.5, 4.72, [0.75, 0.4]),
  M(PH('vintage_day_bed'), 1.98, 5.85, [0.7, 1.45], -90),
  M(PH('GothicCabinet_01'), -0.36, 7.4, [0.45, 0.95], 90),
  M(PH('round_wooden_table_02'), 0.95, 7.55, [0.72, 0.72]), M(Q + 'CandleStick_Triple.gltf', 0.95, 7.55, [0.22, 0.12], on=True),
  M(PH('ArmChair_01'), 0.95, 6.75, [0.66, 0.66], 0), M(PH('ArmChair_01'), 0.95, 8.4, [0.66, 0.66], 180),
  M(PH('potted_plant_04'), 2.1, 9.0, [0.34, 0.34]), M(Q + 'CandleStick_Stand.gltf', 2.1, 7.0, [0.3, 0.3]),
], rug('rugtex/claret_velvet.jpg', 0.95, 7.6, 1.8, 2.3, '#C9A24A', None, bw=0.08, rep=0.8), [WARM(1.4, 3.3), WARM(0.95, 7.6, 6, 1.2)],
 'Dressing Room and Private Dining', 'The bed along the windows as today, a lacquered screen closing off a dressing corner with a carved vanity and a bust. A trunk at the foot, a daybed under the window by the door, and in the foreground a candlelit table for two by the armoire, on claret velvet.')
L['L3'] = ('royal', 5, [
  M(PH('GothicBed_01'), 0.55, 7.75, [2.15, 1.75], 90),
  M(PH('ClassicNightstand_01'), -0.38, 6.62, [0.38, 0.42], 90), M(PH('vintage_oil_lamp'), -0.38, 6.62, [0.16, 0.16], on=True),
  M(PH('Ottoman_01'), 1.95, 7.75, [0.45, 0.62], 90),
  M(QH + 'Fireplace.obj', 0.85, 2.38, [1.05, 0.42], 0),
  M(PH('sofa_03'), 0.85, 4.35, [1.4, 0.7], 180),
  M(PH('ArmChair_01'), -0.22, 3.3, [0.66, 0.66], 90), M(PH('ArmChair_01'), 1.95, 3.3, [0.66, 0.66], -90),
  M(PH('coffee_table_round_01'), 0.85, 3.35, [0.56, 0.56]),
  M(PH('vintage_grandfather_clock_01'), 2.15, 2.4, [0.42, 0.3], 0),
  M(Q + 'CandleStick_Stand.gltf', -0.38, 8.95, [0.3, 0.3]), M(PH('potted_plant_04'), 2.12, 9.0, [0.34, 0.34]),
], rug('rugtex/crimson_quatrefoil.jpg', 0.85, 3.35, 2.3, 1.85, '#14204A', '#D4AF5A', bw=0.2, rep=1.4), [WARM(0.85, 3.2, 6, 1.1), WARM(0.6, 7.7)],
 'Bed Facing the Windows', 'Turned round: the headboard against the corridor wall past the door, so the bed looks out over the countryside. The front of the room becomes a salon round the fireplace on the end wall: a sofa, two bergères and a low table on a framed crimson rug.')
L['L4'] = ('first', 4, [
  M(KK + 'bed_double_A.gltf', 1.55, 3.25, [1.55, 2.0]),
  M(PH('ClassicNightstand_01'), 0.55, 2.45, [0.4, 0.36]), M(KK + 'lamp_table.gltf', 0.55, 2.45, [0.2, 0.2], on=True),
  M(PH('vintage_wooden_drawer_01'), -0.38, 6.95, [0.42, 0.9], 90), M(PH('chinese_armchair'), 0.08, 6.95, [0.55, 0.55], -90),
  M(QH + 'Couch_Large2.obj', 1.2, 8.85, [1.4, 0.62], 180),
  M(PH('GreenChair_01'), 0.25, 7.8, [0.62, 0.62], 90), M(PH('GreenChair_01'), 2.1, 7.8, [0.62, 0.62], -90),
  M(PH('round_wooden_table_02'), 1.2, 7.85, [0.6, 0.6]), M(TT + 'wine_bottle.gltf', 1.15, 7.85, [0.09, 0.09], on=True), M(TT + 'wine_glass.gltf', 1.3, 7.95, [0.06, 0.06], on=True),
  M(KK + 'lamp_standing.gltf', 2.15, 9.0, [0.3, 0.3]),
], rug('rugtex/sapphire_velvet.jpg', 1.2, 8.0, 2.3, 2.0, '#C9A24A', None, bw=0.08, rep=0.8), [WARM(1.4, 3.3), WARM(1.2, 7.9, 6, 1.1)],
 'The Pullman Lounge', 'First Class as a modern Pullman, not a palace: the bed along the windows, a writing bureau and chair by the door, and a lounge at the camera end, a sofa and two velvet club chairs round a table with champagne, on sapphire velvet.')
L['L5'] = ('first', 4, [
  M(KK + 'bed_double_A.gltf', 0.45, 7.8, [2.0, 1.55], 90),
  M(PH('ClassicNightstand_01'), -0.38, 6.75, [0.36, 0.4], 90), M(KK + 'lamp_table.gltf', -0.38, 6.75, [0.2, 0.2], on=True),
  M(PH('mid_century_lounge_chair'), 0.3, 3.25, [0.7, 0.75], 90), M(PH('mid_century_lounge_chair'), 1.9, 3.25, [0.7, 0.75], -90),
  M(PH('side_table_01'), 1.1, 3.25, [0.42, 0.42]), M(TT + 'wine_bottle.gltf', 1.05, 3.25, [0.09, 0.09], on=True), M(TT + 'wine_glass.gltf', 1.18, 3.32, [0.06, 0.06], on=True),
  M(PH('sofa_02'), 1.1, 2.45, [1.3, 0.55], 0),
  M(PH('vintage_wooden_drawer_01'), 2.1, 5.75, [0.42, 0.9], -90),
  M(KK + 'lamp_standing.gltf', 2.15, 4.5, [0.3, 0.3]),
], rug('rugtex/champagne_herringbone.jpg', 1.1, 3.35, 2.4, 1.8, '#2A2F45', None, bw=0.12, rep=2.4) + rug('rugtex/ivory_fleece.jpg', 1.85, 7.8, 0.8, 1.3, rep=1.0), [WARM(1.1, 3.2, 6, 1.1), WARM(0.5, 7.7)],
 'Window-Facing Bed and Drinks Corner', 'The bed turned to face the windows from the corridor wall, a fleece at its side. At the front, two lounge chairs face each other over a side table with champagne, a low sofa behind them: a bright, modern drinks corner.')
meta = {}
for lid, (grp, tier, models, rugs, lights, title, desc) in L.items():
    json.dump({'carriage': {'type': 'sleeper', 'tier': tier, 'clear': [0]}, 'cam': {'x': 0.8, 'z': 5.75, 'zoom': 0.6}, 'lights': lights, 'rugs': rugs, 'models': models}, open(f'{W}/specs/{lid}.json', 'w'))
    json.dump({'carriage': {'type': 'sleeper', 'tier': tier, 'clear': [0]}, 'cam': {'x': 0.8, 'z': 5.9, 'zoom': 0.45}, 'lights': lights, 'rugs': rugs, 'models': models}, open(f'{W}/specs/{lid}c.json', 'w'))
    meta[lid] = {'group': grp, 'title': title, 'desc': desc, 'models': [m['url'] for m in models]}
json.dump(meta, open('/tmp/claude-0/hunt/gen/layouts.json', 'w'))
print('ok')
