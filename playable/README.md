# Night Express playable ad

`night-express-playable.html` is the whole ad: one self-contained file (code, art, font and sounds inlined; no
external requests), about 1.1 MB. It is built from the game's own world code, so carriages, characters, the platform,
cash and sounds are the real game's; the game itself is untouched.

## The flow (the test bot finishes in 6:44; a person takes about 8-10 minutes)

**Start.** A splash with the app icon shows while the shaders compile. The scene is never shown half-built. Then comes the start screen: "UPGRADE YOUR TRAIN!", "DRAG TO MOVE" with a hand on a joystick ring, the app icon (bottom left) and an INSTALL button (bottom right, there for the whole ad and opening the store). The first touch clears the titles.

**Tutorial (one guest, the whole loop).** Four travellers in all. One stands at the desk and three wait on the reception sofa.
1. Check in the guest. They take a key, pay the fare onto the desk and go to their room.
2. Grab the cash.
3. Get the bag, then bring the bag.
4. Get tea, then bring tea.
5. "NICE WORK! Now check in the others." The sofa guests come to the desk one at a time, and normal play begins.

Each step ends with praise. The arrow at the conductor's feet turns toward the next step of the way, a bouncing arrow marks the goal, and the hint line says it in two or three words ("Get tea", "Bring the bag").

**Requests.** Each guest asks for each thing once: their bag, tea, a blanket, then a towel in Comfort and coffee in Business. After that only drinks come round again, after a rest, along with café and theatre visits. The number of open requests is capped (one in the tutorial, then 2, 3 after Comfort, 4 with the Attendant).

**Upgrades.** Each one appears ("NEW UPGRADE!") once you can afford it. Until then the hint line shows the progress ("Café Car: $50/220").

| Upgrade | Price | What it does |
|---|---|---|
| Comfort Class | $180 | The makeover sweeps the lobby, then the sleeper; requests pay $20 → $30 |
| Café Car | $220 | Coffee and croissants |
| Café Makeover | $260 | A new look; orders pay $40 |
| Attendant | $280 | Brings the tea; her takings wait on the desk |
| Business Class | $320 | Requests pay $40; coffee in the rooms |
| Luxury Café | $360 | Orders pay $50 |
| Theatre Car | $400 | Start the movie; every seat pays |

Then the goal is "Dining Car: $X/240", and the end card comes once you can afford it.

The venues have plain floors (no patterned carpets). In the ad build only, room doorways are 1.8 m wide. All the numbers are in `TUNE` at the top of `src/playable/main.ts`.

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
