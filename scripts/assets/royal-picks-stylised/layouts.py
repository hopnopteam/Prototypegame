import json
exec(open('/tmp/claude-0/hunt2/tools/catalog.py').read().split('# Each option')[0])
QP = 'src/quaternius-props/'
def tex(name, x, z, w, d, rot=0): return [{'tex': f'rugtex2/{name}.png', 'x': x, 'z': z, 'w': w, 'd': d, 'y': 0.024, 'rot': rot, 'fullimg': True}]
W2 = lambda x, z, i=5, y=1.6: {'x': x, 'y': y, 'z': z, 'i': i, 'd': 4.5}
def royal(P, SILK, rugname):
    return [
      M(KK + 'bed_double_B.gltf', 1.0, 3.15, [1.4, 1.85], 0, P),
      M(KK + 'table_small.gltf', -0.1, 2.5, [0.42, 0.42], 0, P), M(KK + 'lamp_table.gltf', -0.1, 2.5, [0.22, 0.22], 0, P, on=True),
      M(KK + 'table_small.gltf', 2.05, 2.5, [0.42, 0.42], 0, P), M(TB + 'candle.gltf', 2.05, 2.5, [0.1, 0.1], 0, dict(yellow='#F2D27A'), on=True),
      M(QP + 'Chest_Wood.gltf', 1.0, 4.45, [0.75, 0.42], 0, raw=True),
      M(KK + 'cabinet_medium_decorated.gltf', -0.38, 4.1, [0.42, 0.9], 90, P),
      M(KK + 'pillow_B.gltf', 1.0, 3.75, [0.38, 0.2], 0, dict(blue=SILK['blue'])),
      M('src/quaternius-house/Fireplace.obj', -0.42, 7.45, [0.42, 1.05], 90),
      M(KK + 'couch_pillows.gltf', 1.75, 7.45, [0.66, 1.35], -90, SILK),
      M(KK + 'armchair.gltf', 0.7, 6.4, [0.66, 0.66], 0, P), M(KK + 'armchair.gltf', 0.7, 8.5, [0.66, 0.66], 180, P),
      M(KK + 'table_low.gltf', 0.75, 7.45, [0.5, 0.78], 90, P), M(TK + 'pastry_stand_B_decorated.gltf', 0.75, 7.3, [0.2, 0.2], 0, on=True),
      M(KK + 'lamp_standing.gltf', -0.35, 8.95, [0.3, 0.3], 0, P), M(QH + 'Houseplant_6.obj', 2.05, 8.95, [0.45, 0.45], 0),
      M(KK + 'table_small.gltf', -0.38, 6.55, [0.36, 0.36], 0, P), M(TP + 'radio.gltf', -0.38, 6.55, [0.22, 0.16], 90, dict(teal=P['wood'], grey='#C9A24A', yellow='#C9A24A', red='#C9A24A'), on=True),
    ], tex(rugname, 0.8, 7.45, 1.95, 2.6) + tex('claret_runner' if 'claret' in rugname else 'claret_runner', 1.0, 3.2, 0.0001, 0.0001)
ROY_P2 = dict(ROY, blue='#1F5C45', red='#1F5C45'); SILK_P2 = dict(ROY_P2, blue='#E6D3A3', yellow='#1F5C45')
ROY_P3 = dict(ROY, blue='#B76E79', red='#B76E79', wood='#F2E6D0', dkwood='#F2E6D0'); SILK_P3 = dict(ROY_P3, blue='#FBF4E6', yellow='#B76E79')
def royal2(P, SILK):
    return [
      M(KK + 'bed_double_B.gltf', 1.6, 3.15, [1.85, 1.4], -90, P),
      M(KK + 'table_small.gltf', 2.08, 2.38, [0.4, 0.4], 0, P), M(KK + 'lamp_table.gltf', 2.08, 2.38, [0.22, 0.22], 0, P, on=True),
      M(KK + 'cabinet_small_decorated.gltf', -0.35, 2.55, [0.5, 0.5], 90, P),
      M(KK + 'armchair_pillows.gltf', 0.2, 3.35, [0.58, 0.58], -60, SILK),
      M(KK + 'couch_pillows.gltf', -0.28, 7.75, [0.66, 1.35], 90, SILK),
      M(KK + 'table_low.gltf', 0.65, 7.75, [0.5, 0.78], 90, P), M(TP + 'serving_tray_round.gltf', 0.65, 7.75, [0.3, 0.3], 0, dict(wood='#C9A24A'), on=True),
      M(KK + 'armchair.gltf', 1.45, 7.15, [0.62, 0.62], -90, P), M(KK + 'armchair.gltf', 1.45, 8.35, [0.62, 0.62], -90, P),
      M(QH + 'Table_RoundSmall2.obj', 1.15, 5.25, [0.55, 0.55], 0, P), M(TK + 'pastry_stand_B_decorated.gltf', 1.15, 5.25, [0.2, 0.2], 0, on=True),
      M(KK + 'chair_C.gltf', 1.15, 4.75, [0.4, 0.4], 0, SILK), M(KK + 'chair_C.gltf', 1.15, 5.8, [0.4, 0.4], 180, SILK),
      M(KK + 'lamp_standing.gltf', -0.35, 9.0, [0.3, 0.3], 0, P), M(QH + 'Houseplant_6.obj', 2.1, 9.0, [0.42, 0.42], 0),
      M(QP + 'Chest_Wood.gltf', 2.1, 4.35, [0.4, 0.7], 90, raw=True),
    ], tex('claret_medallion', 0.7, 7.75, 1.95, 2.5) + tex('claret_runner', 1.15, 5.25, 0.9, 1.6)
FST_P6 = dict(FST, blue='#1F5E66', red='#1F5E66', wood='#1A1A1A', dkwood='#1A1A1A', yellow='#C8A962')
def first(P, rugname):
    IV = dict(P, blue='#EFE6D2', yellow=P['blue'])
    return [
      M(KK + 'bed_double_A.gltf', 1.62, 3.2, [1.8, 1.35], -90, P),
      M(KK + 'table_small.gltf', 1.6, 4.25, [0.38, 0.38], 0, P), M(KN + 'lampSquareTable.obj', 1.6, 4.25, [0.18, 0.18], 0, dict(grey='#C9A24A'), on=True),
      M(KK + 'shelf_B_large_decorated.gltf', -0.42, 3.3, [0.38, 0.95], 90, dict(P, yellow='#C9A24A', red='#7A1E32')),
      M(KK + 'chair_C.gltf', 0.12, 3.3, [0.42, 0.42], -90, IV),
      M(KK + 'couch.gltf', 0.9, 8.85, [1.35, 0.62], 180, P),
      M(KK + 'armchair.gltf', -0.05, 7.75, [0.6, 0.6], 90, P), M(KK + 'armchair.gltf', 1.7, 7.75, [0.6, 0.6], -90, P),
      M(TK + 'table_round_A.gltf', 0.85, 7.8, [0.55, 0.55], 0, P), M(TP + 'wine_bottle.gltf', 0.82, 7.8, [0.07, 0.07], 0, dict(green='#1E3A28', yellow='#D4AF5A', red='#D4AF5A'), on=True),
      M(KK + 'lamp_standing.gltf', -0.35, 8.95, [0.28, 0.28], 0, dict(P, grey='#B8913A')),
      M(QH + 'Houseplant_6.obj', 2.05, 8.95, [0.4, 0.4], 0),
    ], tex(rugname, 0.9, 7.8, 2.0, 2.4, 0) + tex('sapphire_runner' if rugname != 'champagne_trellis' else 'sapphire_runner', 0.4, 5.6, 0.75, 1.9)
def first2(P):
    IV = dict(P, blue='#EFE6D2', yellow=P['blue'])
    DK = dict(wood=P['blue'], yellow=P['blue'], red=P['blue'], peach=P['blue'])
    return [
      M(KK + 'bed_double_A.gltf', 0.85, 3.15, [1.35, 1.8], 0, P),
      M(KK + 'table_small.gltf', -0.2, 2.5, [0.38, 0.38], 0, P), M(KN + 'lampSquareTable.obj', -0.2, 2.5, [0.18, 0.18], 0, dict(grey='#C9A24A'), on=True),
      M(KK + 'table_small.gltf', 1.9, 2.5, [0.38, 0.38], 0, P), M(KN + 'lampSquareTable.obj', 1.9, 2.5, [0.18, 0.18], 0, dict(grey='#C9A24A'), on=True),
      M(KN + 'loungeChair.obj', 1.55, 6.9, [0.62, 0.62], 90, DK), M(KN + 'loungeChair.obj', 1.55, 8.2, [0.62, 0.62], 90, DK),
      M(TK + 'table_round_A.gltf', 1.95, 7.55, [0.42, 0.42], 0, P), M(TP + 'teapot.gltf', 1.95, 7.55, [0.12, 0.1], 0, dict(teal='#EFE6D2'), on=True),
      M(KK + 'shelf_B_large_decorated.gltf', -0.42, 7.55, [0.38, 0.95], 90, dict(P, yellow='#C9A24A', red='#7A1E32')),
      M(KK + 'chair_C.gltf', 0.6, 4.6, [0.42, 0.42], 180, IV),
      M(KK + 'lamp_standing.gltf', -0.35, 9.0, [0.28, 0.28], 0, dict(P, grey='#B8913A')),
    ], tex('champagne_trellis', 1.25, 7.55, 1.8, 2.5)
LAY = {
 'L1': ('royal', 5, *royal(ROY, ROY_SILK, 'claret_medallion'), 'Bedchamber and fireside salon', 'The recommended Royal set (P1 Crown Claret). The bed in the middle of the front wall with a nightstand either side, a trunk at its foot, a dresser by the window; past the door a fireside salon: the sofa against the windows, a pair of claret armchairs round a low table with the macaron stand, a wireless by the fire, the painted medallion rug.'),
 'L1b': ('royal', 5, *royal(ROY_P2, SILK_P2, 'emerald_medallion'), 'Bedchamber and salon in P2 Imperial Emerald', 'The same room in emerald, walnut and champagne silk (walls stay claret here: the wall colour is the game\'s own and is not changed by this page).'),
 'L1c': ('royal', 5, *royal(ROY_P3, SILK_P3, 'rose_medallion'), 'Bedchamber and salon in P3 Rose Palace', 'The same room in dusty rose, cream and gold: lighter and romantic.'),
 'L2': ('royal', 5, *royal2(ROY, ROY_SILK), 'The drawing room', 'A different orientation: the bed lengthwise along the windows at the far end with a vanity and a reading chair, a tea table for two in the middle on a runner, and a drawing room at the camera end: the sofa against the corridor wall facing two armchairs by the windows.'),
 'L4': ('first', 4, *first(FST, 'sapphire_trellis'), 'The Pullman lounge', 'The recommended First Class set (P5 Sapphire Pullman). The bed along the windows, a low bookcase and a writing chair by the corridor wall, a runner from the door, and a lounge at the camera end: a sapphire sofa, two club chairs round a mahogany table with champagne, on the painted trellis rug.'),
 'L4b': ('first', 4, *first(FST_P6, 'champagne_trellis'), 'The Pullman lounge in P6 Art Deco Teal', 'The same room in teal velvet and black lacquer with champagne gold.'),
 'L5': ('first', 4, *first2(FST), 'The club car', 'First Class as a club car: the bed against the front wall between two Deco lamps, and two square-cut Deco lounge chairs facing the windows at the camera end, a tea table between them; a low bookcase opposite.'),
}
meta = {}
for k, (kind, tier, models, rugs, name, text) in LAY.items():
    rugs = [r for r in rugs if r['w'] > 0.01]
    json.dump({'carriage': {'type': 'sleeper', 'tier': tier, 'clear': [0]}, 'cam': {'x': 0.85, 'z': 6.3, 'zoom': 0.56}, 'lights': [W2(1.0, 3.3, 4, 2.0), W2(0.9, 7.6, 4, 2.0)], 'rugs': rugs, 'models': models}, open(f'{W}/specs/{k}.json', 'w'))
    meta[k] = {'kind': kind, 'name': name, 'text': text, 'files': sorted({m['url'] for m in models})}
json.dump(meta, open('/tmp/claude-0/hunt2/layouts.json', 'w'), indent=1)
print(list(meta))
