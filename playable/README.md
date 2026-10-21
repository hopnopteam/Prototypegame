# Night Express playable ad

`night-express-playable.html` is the whole ad: one self-contained file (code, art, font and sounds inlined; no
external requests), about 1.1 MB. It is built from the game's own world code, so carriages, characters, the platform,
cash and sounds are the real game's; the game itself is untouched.

## The flow (the test bot finishes in about 7 minutes; a person takes about 8-10)

**One thing at a time.** A single flow controller (`flow` in `src/playable/main.ts`) decides what is active.
- **Messages:** only one is on screen at a time (a caption, or else the instruction pill). Each fades out before the next, and a small one (praise, a combo) is dropped if anything else is up.
- **Labels over the world** (guest bubbles, item signs, the upgrade tile's marker, the guide arrow, the +$ floats) are checked every frame. A label that would touch a more important one, or the HUD, is hidden for that frame.
- The bot checks this every poll on a small (360×640) and a tall (390×844) screen. Both runs had 0 overlaps and 0 moments with two messages.

**The train never stops; nobody leaves.** It starts as one carriage, the lobby. Three passengers come to the reception one at a time, each walking in slowly from the front of the carriage, and stay in their rooms all night.

**Tutorial: three guests, each alone.** The next guest walks in only after the current one is fully looked after, and after a short "DONE!" pause.
- **Steps for each guest:** check them in at the desk → they walk to their room and ask a moment later → get their one item → bring it → collect the cash.
- **Each guest asks for one item:** guest 1 their bag (the rack), guest 2 a blanket (the linen cupboard), guest 3 tea (the tea counter). The supply spots always carry their icon sign, which lights up when needed.
- **Help:** guest 1 gets an arrow, a glowing ring and short words ("Go to the desk", "Grab the bag", "Bring to the guest", "Collect the cash"). Guest 2 gets the arrow, the ring and one word. Guest 3 gets only a light arrow.
- **One target at a time:** the arrow over the goal, or, when the goal is off screen, an arrow at the conductor's feet.

**Pace** (all in `TUNE.pace`): a 1 s breath after each step, a 2.5 s pause between guests, requests 1.4 s after a guest reaches their room, and a slow walk-in.

**Play.** At most 2 requests are open at once (3 with an Attendant). Each guest asks for one thing at a time: their bag, a blanket, a towel in Comfort, then tea (or coffee in Business). They also visit the café and the theatre.

**Upgrades, one by one.** A goal bar shows the next one; its tile appears once it is affordable.

| Upgrade | Price |
|---|---|
| Café Car | $100 |
| Comfort Class | $160 |
| Attendant | $180 |
| Theatre Car | $240 |
| Faster Attendant | $200 |
| Business Class | $300 |
| 2nd Attendant (café and theatre) | $260 |
| Café Makeover | $320 |

Tiles sit in open spots the camera always sees (the carriages' rear vestibule, the open lobby floor, the café's middle aisle). Then the goal is "Dining Car: $X/300", and the end card comes once you can afford it.

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

Or rebuild with a network preset: `node scripts/build-playable.mjs meta` (sources in `src/playable/`; tuning numbers in
`TUNE` at the top of `src/playable/main.ts`; the end card's text in `src/playable/endcard.ts`).
