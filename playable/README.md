# Night Express playable ad

`night-express-playable.html` is the whole ad: one self-contained file (code, art, font and sounds inlined; no
external requests), about 1.1 MB. It is built from the game's own world code, so carriages, characters, cash and
sounds are the real game's; the game itself is untouched (apart from a smoother walk cycle shared with it).

## The flow (5–10 minutes): deliver → get paid → upgrade

**Splash (1.8 s, or a tap):** "UPGRADE YOUR TRAIN" over the live scene, "Drag to move" with a hand on a pad, the app
icon and Install in the corners (after the reference), then it fades into play.

**The lobby (the playable's own plan, `useCompactLobby` in `src/world/layout.ts`; the game's lobby is unchanged).**
Reception up front: the desk, the urn's counter (tea, coffee and a breakfast tray), the linen cupboard, the waiting sofa
against the front wall (back to the wall, facing the room), the luggage rack and a newsstand along the right wall. Behind
it a small washroom (a loo and a basin, a curved front corner and a wide sliding door of frosted glass) and **four
rooms**. **Four guests**, one per room; whenever a room is free the next waiting guest comes to the desk.

**Tutorial (~0:00–1:00), light on purpose.** One room open; the others are covered and padlocked. Only passenger 1 is
walked through, one short line at a time (*Check in the guest* → *Get their bag* → *Bring it to their room* → *Buy Room
2*), with **one arrow** (nothing else points). Passenger 2 is up to the player: the arrow comes back only after 3 s
standing still. From then on, no arrows or lines unless the player stops for 5 s (the dragging hand after 8 s).

**One request at a time.** While the conductor works alone, only one guest asks for something at a time; when it is
done, the next asks. With the Attendant, two at a time.

**Where things are.** A station's badge (its icon) floats over it only while something there is needed, and fades away
when it is not; what a guest wants is in their bubble.

**The jobs (different walks).**
- Check-in at the desk, then the guest's bag from the rack (one bag per guest, asked for once, carried one at a time).
- A blanket once, a towel once (Comfort), then round again, never the same twice running: tea (coffee in Luxury) or
  breakfast from the urn's counter, the paper from the newsstand, or **their shoes**: they leave them in the corridor
  outside their door; stand on them a moment and they shine (pays more).
- **The washroom:** now and then a guest uses it; the mess arrives animated (the puddle spreads, a towel, paper towels
  and the loo roll drop in, flies buzz over it) under a broom badge; tidy it from anywhere inside and the pieces go one
  by one as the ring fills, the puddle dries, "Spotless!" and a tip.
- Later the café (lattes, then croissants) and the theatre (start the film at the projector, popcorn).

Every payment: "+$X" over whoever paid and a burst of coins flying to the money counter.

**Movement.** Everyone paths over the real floor and steers round anyone in their way (the conductor included), so
nobody stands blocked; the conductor is only stopped by someone standing still. The carriage chips on the left (once the
train has two) walk the conductor to that carriage when tapped.

**Upgrades, one tile at a time.** Each small one changes something in place (the camera pushes in on it, it grows in
with a sparkle, confetti and a small shake) and adds +$2 to every delivery. A big one (the Attendant, a new class, a new
carriage) appears once every small one before it is bought. Paying fills the tile smoothly.

| # | Upgrade | Kind | Price | What you see |
|---|---|---|---|---|
| 1 | Room 2 | tutorial | $20 | the lid lifts off the room, the bed drops in |
| 2–6 | Room 3, Reading Lamps, Room 4, Fresh Flowers, Lobby Rug | small | $40–65 | rooms open; a brass reading lamp by each bed (a soft warm pool, nothing glaring); flowers on a little side table by each room's back wall; a red rug |
| 7 | Attendant | big | $120 | she arrives (fast from the start) and takes requests the player leaves for 4 s |
| 8 | Comfort Class | big | $170 | the makeover sweeps the lobby; class card |
| 9–10 | Minibars, Skates | small | $110–120 | a glass-front minibar in every room; skates on the conductor's feet, 15% faster |
| 11 | Café Car | big | $130 | rolls in under a tarp, ropes snap, the tarp slides off |
| 12 | Pastry Stand | small | $110 | croissants on the counter |
| 13 | Luxury Class | big | $170 | navy and gold makeover |
| 14 | Theatre Car | big | $150 | covered-carriage reveal |
| 15–16 | Big Speakers, Red Carpet | small | $100 | speakers by the screen; a red carpet with spotlights |
| 17 | **Dining Car** | final | $150 | covered-carriage reveal, then the end screen |

**End screen (after the reference).** The game dimmed behind; "UPGRADE YOUR TRAIN!"; a purple card whose picture slides
from one next carriage to another (an observation deck under a glass dome, a pool car, a gym car), with +2 stars and
x5 money; one big **PLAY NOW** button. The button (and a tap anywhere) calls `openStore()` in
`src/playable/network.ts`, the one place the store link lives. It also shows after 20 s without a touch.

**All the numbers** (prices, pay, timings, camera, the splash) are in `TUNE` at the top of `src/playable/main.ts`.

## The no-tutorial build

`night-express-playable-no-tutorial.html` is the same ad with no walkthrough: after the splash the player is straight
in play (one room open, the first guest at the desk, Room 2 the first upgrade). Nothing is explained up front; the
arrow and the hint line come only when the player stands still (after 3 s until the first delivery, then 5 s), and
the dragging hand after 8 s. Build it with `NO_TUTORIAL=1 node scripts/build-playable.mjs [network]`, or open either
build with `?notut=1` to try it.

## Testing

`node scripts/playable-bot.mjs [ts] [maxSeconds] [shotDir]` plays the ad headless: it taps to walk to the next job every
1.1 s of game time and prints when each upgrade is bought (and any long stall). Rebuild first:
`node scripts/build-playable.mjs`.

## Switching ad networks

Open the file and edit the block at the very top (`window.NX_AD`):

| `network` | Play Now calls | Notes |
|---|---|---|
| `'unity'` | `mraid.open(storeUrl)` | MRAID is injected by Unity Ads. |
| `'applovin'` | `mraid.open(storeUrl)` | MRAID is injected by AppLovin. |
| `'meta'` | `FbPlayableAd.onCTAClick()` | The store link comes from the campaign. Meta's 2 MB limit is met. |
| `'google'` | `ExitApi.exit()` | Also uncomment the `exitapi.js` line under the block (Google requires it, and it is the file's only external reference). The `ad.size` / `ad.orientation` meta tags are already there. |

Set `iosUrl` and `androidUrl` to your store pages (used by Unity and AppLovin, and as the fallback when the file is
opened outside an ad network). The ad waits for MRAID `ready` and for the ad to be on screen, and pauses while it is hidden.

Or rebuild with a network preset: `node scripts/build-playable.mjs meta` (sources in `src/playable/`; the end screen's
words in `src/playable/endcard.ts`).
