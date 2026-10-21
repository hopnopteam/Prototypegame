# Night Express playable ad

`night-express-playable.html` is the whole ad: one self-contained file (code, art, font and sounds inlined; no
external requests), about 1.1 MB. It is built from the game's own world code, so carriages, characters, the platform,
cash and sounds are the real game's; the game itself is untouched.

## The flow (about 7-9 minutes for a person; the test bot finishes in 5:18)

1. **Tutorial at Millbrook station** (a hint line under the money says each step; an arrow and a hand point the way):
   check in the first traveller at the reception desk (they get their key and pay onto the desk), collect the cash,
   get tea from the urn, bring it to them; the same for a second traveller and their bag from the rack; buy a new room.
2. **The game's loop, station after station:** travellers board and queue at the desk; guests ask for tea, blankets,
   their bags (later towels, croissants, champagne, coffee); guests whose stop it is get off, leaving a tip and an
   untidy room to tidy before the next guest can have it.
3. **Upgrades, one at a time, paid only with cash you carry:** a new sleeper carriage, another room, Comfort Class
   (the game's makeover sweeps down the carriage; fares x2.5), the Café Car, the Theatre Car (start the film: every
   seat pays), Business Class (fares x5).
4. After the Business Class guests' first orders: "5-STAR TRAIN!", then the end card, "CHOOSE NEXT TRAIN UPGRADE"
   (also after 15 s without a touch).

All numbers are in `TUNE` at the top of `src/playable/main.ts`.

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
