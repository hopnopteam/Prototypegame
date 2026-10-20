# Night Express playable ad

`night-express-playable.html` is the whole ad: one self-contained file (code, art, font and sounds inlined; no
external requests), about 1.1 MB. It is built from the game's own world code, so carriages, characters, the platform,
cash and sounds are the real game's; the game itself is untouched.

## The flow (about a minute; started from the first, quick version)

1. Three passengers wait at their cabin doors for tea. Take a tray from the tea urn and serve them; each pays and goes
   into their cabin.
2. That money buys a Comfort Class refit of their carriage; the guests pay the dearer fare at their doors. Collect it.
3. That buys Business Class; the guests pay the Business fare.
4. That buys a Café Car (it rolls in and couples on). Two guests walk through to it and order lattes; make and serve them.
5. That buys a Theatre Car; the guests take their seats. Start the film at the projector: every seat pays.
6. The end card, "CHOOSE NEXT TRAIN UPGRADE" (also after 15 s without a touch).

Every price is less than what the step before it pays, so the next upgrade is always earned and never stuck; nothing
is free. All numbers are in `TUNE` at the top of `src/playable/main.ts`.

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
