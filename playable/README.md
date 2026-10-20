# Night Express playable ad

`night-express-playable.html` is the whole ad: one self-contained file (code, art, font and sounds inlined; no
external requests), about 1.1 MB. It is built from the game's own world code, so carriages, characters, the platform,
cash and sounds are the real game's; the game itself is untouched.

## The flow (about five minutes)

1. Millbrook station: two travellers walk along the platform, in at the door and queue at the lobby desk.
2. Check them in at the desk, then lead each one to their room (they follow you). Each pays.
3. They ask for tea, luggage, a blanket: fetch it (urn, rack, linen cupboard) and bring it. Each delivery pays.
4. The money on your back buys, one at a time: a new room → a new sleeper carriage (and a station full of new
   guests) → the café (lattes and croissants) → the theatre (start the film, hand round popcorn) → the sleeper's
   class refit, whose guests then want champagne and coffee.
5. After those last deliveries, the end card: "CHOOSE NEXT TRAIN UPGRADE". It also shows after 15 s without a touch.

Every number (prices, pay, speeds, timings) is in `TUNE` at the top of `src/playable/main.ts`.

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
