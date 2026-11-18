# The "bigger, organised station" sketch: a top-down SVG of the proposed platform lanes and bays. python3 -I layout.py <scratch dir>
import sys
S = sys.argv[1]
PX, PY, Z0, Z1 = 16, 26, -22, 44   # px per metre along and across; z range shown
TOP = 54                            # svg y of the train's platform edge
def X(z): return 20 + (z - Z0) * PX
def Y(m): return TOP + m * PY       # m: metres out from the train
LANES = [('Edge lane · queues', 0, 1.6, '#2A3360'), ('Service lane · the work', 1.6, 3.8, '#26305A'), ('Walkway · kept clear', 3.8, 6.2, '#222B52'), ('Back lane · benches, lamps, stalls', 6.2, 8.8, '#26305A')]
out = []
a = out.append
W = X(Z1) + 20
a(f'<svg viewBox="0 0 {W:.0f} {Y(12.6):.0f}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Top-down plan of the proposed station: the train along the top, four lanes running its length, and fixed bays for each piece">')
a('<style>text{font-family:"Nunito Sans",system-ui,sans-serif;fill:#EEE7D8}.s{font-size:10px;fill:#AEB0C8}.b{font-size:11px;font-weight:700}.lane{font-size:10px;font-weight:700;letter-spacing:.08em;fill:#AEB0C8;text-transform:uppercase}</style>')
# The train
a(f'<rect x="{X(Z0)}" y="{TOP-30}" width="{X(-1)-X(Z0)}" height="26" rx="4" fill="#3A2F2A"/><text x="{X(-12)}" y="{TOP-13}" class="s">locomotive</text>')
for i, (name, z) in enumerate([('Lobby', 0), ('Café', 19), ('Sleeper', 38)]):
    zz = min(z + 18, Z1)
    a(f'<rect x="{X(z)}" y="{TOP-30}" width="{X(zz)-X(z)}" height="26" rx="4" fill="#34507A"/><text x="{X(z)+8}" y="{TOP-13}" class="b">{name}</text>')
for z, lab in [(1.5, 'door'), (39.5, 'second door')]:
    a(f'<rect x="{X(z)-14}" y="{TOP-6}" width="28" height="6" fill="#E2B653"/><text x="{X(z)+18}" y="{TOP-34}" class="s">{lab}</text>')
# Lanes
for name, m0, m1, col in LANES:
    a(f'<rect x="{X(Z0)}" y="{Y(m0)}" width="{X(Z1)-X(Z0)}" height="{(m1-m0)*PY}" fill="{col}"/>')
    a(f'<text x="{X(Z0)+6}" y="{Y(m0)+16}" class="lane">{name}</text>')
a(f'<line x1="{X(Z0)}" x2="{X(Z1)}" y1="{Y(0.12)}" y2="{Y(0.12)}" stroke="#E2B653" stroke-width="2"/>')
a(f'<line x1="{X(Z0)}" x2="{X(-15.2)}" y1="{Y(8.8)}" y2="{Y(8.8)}" stroke="#AEB0C8" stroke-width="3"/><line x1="{X(-12.6)}" x2="{X(Z1)}" y1="{Y(8.8)}" y2="{Y(8.8)}" stroke="#AEB0C8" stroke-width="3"/>')
a(f'<text x="{X(-12.3)}" y="{Y(8.8)-4}" class="s">railing</text>')
def bay(z0, z1, m0, m1, label, col='#D9B45E', sub=''):
    a(f'<rect x="{X(z0)}" y="{Y(m0)}" width="{X(z1)-X(z0)}" height="{(m1-m0)*PY}" rx="3" fill="{col}" fill-opacity=".22" stroke="{col}" stroke-width="1.5"/>')
    a(f'<text x="{(X(z0)+X(z1))/2}" y="{(Y(m0)+Y(m1))/2+4}" class="b" text-anchor="middle">{label}</text>')
    if sub: a(f'<text x="{(X(z0)+X(z1))/2}" y="{(Y(m0)+Y(m1))/2+16}" class="s" text-anchor="middle">{sub}</text>')
# Queues in the edge lane (dots), ahead of each door
for dz in (0, 38):
    for i in range(6): a(f'<circle cx="{X(-0.6+dz-i*0.8)}" cy="{Y(1.0)}" r="4" fill="#AEB0C8"/>')
# Service lane bays
for dz, tag in ((0, ''), (38, ' 2')):
    bay(-4.4 + dz, -0.4 + dz, 1.8, 3.6, 'Ticket office' + tag, sub='low canopy')
    bay(2.4 + dz, 3.6 + dz, 1.8, 3.6, 'Bell', col='#E2B653')
bay(5, 10, 1.8, 3.6, 'Luggage bay', col='#C9805B', sub='barrow · trolley · cases')
bay(11.5, 15, 1.8, 3.6, 'Restock cart', col='#6FA88A')
bay(24, 28, 1.8, 3.6, 'Parcels', col='#C9805B', sub='scale · crates')
# Walkway arrow
a(f'<line x1="{X(-13.9)}" y1="{Y(5)}" x2="{X(30)}" y2="{Y(5)}" stroke="#AEB0C8" stroke-dasharray="6 6" stroke-width="1.5"/><text x="{X(-9)}" y="{Y(5)-5}" class="s">latecomers and day riders: station house to the doors</text>')
# Back lane
bay(-11, -7, 6.4, 8.6, 'Newsstand', col='#6FA88A')
bay(0, 2, 6.4, 8.6, 'Clock', col='#E2B653')
bay(14, 18.5, 6.4, 8.6, 'Market stall', col='#C95B6E', sub='fruit · bread')
for z in (-5.5, 4, 8.5, 20.5, 26.5, 32.5, 41):
    a(f'<circle cx="{X(z)}" cy="{Y(8.2)}" r="5" fill="#E2B653"/>')                       # lamp
    a(f'<rect x="{X(z+0.6)}" y="{Y(7.4)}" width="{2.2*PX}" height="{0.6*PY}" rx="2" fill="#B98A5E"/>')  # bench
    a(f'<rect x="{X(z+3.2)}" y="{Y(7.3)}" width="{0.8*PX}" height="{0.8*PY}" rx="2" fill="#5E9A62"/>')  # planter
a(f'<text x="{X(20.5)}" y="{Y(6.75)}" class="s">module: lamp · bench · planter, every 6 m</text>')
# Station house beyond the railing, its gate on the walkway's line
a(f'<rect x="{X(-21)}" y="{Y(9.3)}" width="{X(-13)-X(-21)}" height="{3*PY}" rx="3" fill="#C9B79A" fill-opacity=".35" stroke="#C9B79A"/><text x="{X(-17)}" y="{Y(11)}" class="b" text-anchor="middle">Station house</text>')
a(f'<text x="{X(-13.9)}" y="{Y(9.7)+8}" class="s" text-anchor="middle">gate</text>')
a(f'<rect x="{X(-11)}" y="{Y(9.4)}" width="{X(Z1)-X(-11)}" height="{2.4*PY}" fill="#2F5D45" fill-opacity=".35"/><text x="{X(4)}" y="{Y(10.8)}" class="s">forecourt: hedges, trees, postbox, water tower, sheep beyond</text>')
# Scale bar
a(f'<line x1="{X(30)}" x2="{X(35)}" y1="{Y(12.1)}" y2="{Y(12.1)}" stroke="#EEE7D8" stroke-width="2"/><text x="{X(35)+6}" y="{Y(12.1)+4}" class="s">5 m</text>')
a('</svg>')
open(f'{S}/layout.svg', 'w').write('\n'.join(out))
print('ok')
