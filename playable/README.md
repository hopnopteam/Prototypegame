# Night Express playable ad

`night-express-playable.html` is the whole ad: one self-contained file (code, art, font and sounds inlined; no
external requests), about 1.1 MB. It is built from the game's own world code, so carriages, characters, cash and
sounds are the real game's; the game itself is untouched (apart from a smoother walk cycle shared with it).

## The flow (5–10 minutes): deliver → get paid → upgrade

**Splash (1.8 s, or a tap):** "UPGRADE YOUR TRAIN" over the live scene, "Drag to move" with a hand on a pad, the app
icon and Install in the corners (after the reference), then it fades into play.

**Tutorial (~0:00–1:00).** The train starts as one carriage, the lobby, with **one room open**; the other two are
covered and padlocked. Passenger 1, one step at a time in the instruction pill: *Check in the guest* → *Get their bag*
→ *Bring it to their room* (they pay: coins fly to the counter) → *Buy Room 2* (exactly what they paid). Passenger 2
does the same with the arrow only. Then "GREAT JOB!" and play.

**Play.** Each guest asks for one thing at a time (a blanket, a towel in Comfort, tea or coffee), and later visits the
café and the theatre. Every delivery: "+$X" over the guest and a burst of coins flying to the money counter with a
rising coin sound. A goal bar at the top always shows the next big goal ("Next: Comfort Class") and how far along the
way to it you are.

**Upgrades, in order.** Small ones show two tiles at a time; each changes something in place (the camera pushes in on
it, it grows in with a sparkle, confetti and a small shake) and adds +$2 to every delivery. A big one (the Attendant, a
new class, a new carriage) only appears once every small one before it is bought.

| # | Upgrade | Kind | Price | What you see |
|---|---|---|---|---|
| 1 | Room 2 | tutorial | $20 | the lid lifts off the room, the bed drops in |
| 2–6 | Room 3, Reading Lamps, Lobby Rug, Fresh Flowers, Bigger Rack | small | $40–80 | a room opens; lamps / flowers in every room; a red rug; a longer rack |
| 7 | Attendant | big | $130 | she arrives and takes over requests the player leaves for 4 s |
| 8 | Comfort Class | big | $190 | the makeover sweeps the lobby; class card |
| 9 | Minibars | small | $110 | a minibar in every room |
| 10 | Café Car | big | $130 | rolls in under a tarp, ropes snap, the tarp slides off |
| 11–12 | Pastry Stand, Faster Attendant | small | $110–130 | croissants on the counter; she walks faster |
| 13 | Luxury Class | big | $170 | navy and gold makeover |
| 14 | Theatre Car | big | $160 | covered-carriage reveal; start the movie at the projector |
| 15–16 | Big Speakers, Red Carpet | small | $100–110 | speakers by the screen; a red carpet with spotlights |
| 17 | **Dining Car** | final | $170 | covered-carriage reveal, then the end screen |

**End screen.** The camera glides into the new Dining Car (the game's own Luxury dining carriage: white cloths, lamps,
place settings and glasses, velvet chairs, diners at the tables) and drifts slowly along it; over it "UPGRADE YOUR
TRAIN!" and one big **PLAY NOW** button. The button (and a tap anywhere) calls `openStore()` in
`src/playable/network.ts`, the one place the store link lives. It also shows after 20 s without a touch.

**All the numbers** (prices, pay, timings, camera, the splash) are in `TUNE` at the top of `src/playable/main.ts`.

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
