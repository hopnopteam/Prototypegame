# Night Express playable ad

`night-express-playable.html` is the whole ad: one self-contained file (code, art, font and sounds inlined; no
external requests), about 1.1 MB. It is built from the game's own world code, so carriages, characters, the platform,
cash and sounds are the real game's; the game itself is untouched.

## The flow (the test bot finishes in about 6 minutes; a person takes about 7-9)

One thing at a time. A single flow controller (`flow` in `src/playable/main.ts`) decides what is active. Passengers, requests, upgrade tiles and camera moves all ask `flow.allows(...)` first. Big messages go through one queue: one at a time, 1.8 s each, a short gap between them, and duplicates dropped.

**Start.** A splash with the app icon shows until the scene is ready. Then the start screen: "UPGRADE YOUR TRAIN!", "DRAG TO MOVE", the app icon and an INSTALL button. The train is **one carriage**, the lobby.

**1. Tutorial (about 30-60 s).** Nothing else happens while it runs: no other passengers, requests, upgrades or camera moves.
- Passenger 1, step by step, one instruction at a time: *Check in the guest* → *Follow them to the room* → *Get the bag* → *Bring the bag* → *Grab the cash* (they pay into a little pile beside them). Each step ends with "NICE!".
- Passenger 2 comes aboard through the lobby door and does the same, with arrows only and no text.
- Then "GREAT JOB! Now hire an Attendant to help", and play begins.

**2. Play.** A passenger comes aboard only while a room is free, one at a time. Each asks for one thing at a time: their bag first, then a blanket (a towel in Comfort), then tea. They ask 2-3 times, then leave and free the room. Only a few requests are open across the train (2 to start, more with a second carriage and with each Attendant). An item is delivered once: the order closes as it is handed over, and the guest asks for nothing new until it lands.

**3. Upgrades, one by one.** The goal bar under the money always shows the next one with a progress bar. Its tile appears ("NEW UPGRADE!") once you can afford it.

| Upgrade | Price | What it does |
|---|---|---|
| Attendant | $120 | Takes over room deliveries; you collect the cash |
| New Carriage | $200 | A sleeper rolls in under a tarp; more rooms, more guests |
| Comfort Class | $240 | Makeover of both carriages; deliveries pay more |
| Faster Attendant | $260 | Moves 1.5× faster |
| Café Car | $300 | Rolls in under a tarp; guests come for coffee and croissants |
| 2nd Attendant | $320 | A second Attendant |
| Café Makeover | $340 | New café interior; orders pay more |

Then the goal is "Dining Car: $X/300", and the end card comes once you can afford it.

All the numbers are in `TUNE` at the top of `src/playable/main.ts`.

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
