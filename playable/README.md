# Night Express playable ad

`night-express-playable.html` is the whole ad: one self-contained file (code, art, font and sounds inlined; no
external requests), about 1.1 MB. It is built from the game's own world code, so carriages, characters, the platform,
cash and sounds are the real game's; the game itself is untouched.

## The flow (the test bot finishes in 6:10; a person takes about 8-9 minutes)

The train never stops at a station. One mechanic is taught at a time, and each lesson ends with praise ("NICE!", "GREAT!"...):

1. **Check in.** Four travellers queue at the reception desk. Stand there and each takes a key, pays the fare onto the desk and goes to their room. Three more wait in the lobby for rooms not yet built.
2. **Collect the cash** from the desk.
3. **Tea**, then **a blanket**, then **their bag.** One guest asks at a time. A gold trail of chevrons on the floor and an arrow lead to the urn, the linen cupboard and the rack, then to the guest. Each guest asks for their bag once only.
4. **Upgrades.** Each one appears ("NEW UPGRADE!") only once you can afford it; until then the hint line shows "Comfort Class: $130/260". The order: New Room $60, New Room $100, New Room $140 (a waiting traveller checks in to each), **Comfort Class** $260, **Attendant** $200 (serves tea; her takings wait on the desk), **Café Car** $300, **Attendant+** $280 (blankets and towels too), **Theatre Car** $380.
5. **Requests are capped:** one at a time at first, then one more after the second room, after Comfort Class and after the Attendant. Café and theatre visits join once those cars are open, and each is taught on first use with the guide on.
6. **Rewards:** each guest reacts with an emoji (😊 🥰 🤩 😋 🍿), hearts and sparkles, and the +$ floats up. Serving within 9 s builds a combo ("COMBO x3!", a bonus bill from x3).
7. **The guide** stays on until Comfort Class, and again while a new venue is taught. After that it shows when you stop.
8. **The camera** eases in a little while walking and back out when standing or working.
9. **The end.** "Dining Car: $X/300". The end card comes once you can afford it (or after 15 s without a touch, then without the price).

In the ad build only, room doorways are 1.8 m wide (1.4 m in the game); `scripts/build-playable.mjs` patches this. All the numbers are in `TUNE` at the top of `src/playable/main.ts`.

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
