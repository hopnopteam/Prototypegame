# Night Express playable ad

`night-express-playable.html` is the whole ad: one self-contained file (code, art, font and sounds inlined; no
external requests), about 1.1 MB. It is built from the game's own world code, so carriages, characters, the platform,
cash and sounds are the real game's; the game itself is untouched.

## The flow (the test bot finishes in 7:37; a person takes longer, about 8-10 minutes)

The train never stops at a station: it rides on through the night from the first frame.

1. **Check-in (0:00).** Ten travellers queue at the lobby's reception desk. Stand at the desk and they check in one after another: each gets a key, pays the fare onto the desk and walks to their room. Whoever has no room yet waits in the lobby with a bed bubble.
2. **Deliveries.** Guests ask for tea (the urn), then a blanket (the linen cupboard), then their bag (the luggage rack), then any of these. Fetch it, bring it, and they pay. Guests left waiting more than 16 s turn 😠, and they show 😍 when served.
3. **Upgrades, one at a time** (only cash carried on your back goes in): New Room $40, New Room $60, New Room $80 (a waiting traveller checks in to each), **Comfort Class** $200 (the makeover, and dearer requests), **Attendant** $150 (serves tea by herself and leaves her takings on the desk for you to collect; you still do blankets, towels and bags), **Café Car** $260 (lattes and croissants), **Sleeper Car** $360 (the last travellers check in), **Theatre Car** $460 (start the film, every seat pays, popcorn).
4. **The guide** (a gold arrow, the hint line and the hand) shows every step until Comfort Class. After that it shows only when you stop.
5. **The end.** The goal line then reads "Next upgrade: Dining Car $X/300". The end card (CHOOSE NEXT TRAIN UPGRADE, the Dining Car, $300, "You have $..." in green) appears only once you can afford it. After 15 s without a touch the end card shows anyway (ad networks expect the CTA), but then without the price tag or the "You have" line.

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
