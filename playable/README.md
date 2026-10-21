# Night Express playable ad

`night-express-playable.html` is the whole ad: one self-contained file (code, art, font and sounds inlined; no
external requests), about 1.1 MB. It is built from the game's own world code, so carriages, characters, the platform,
cash and sounds are the real game's; the game itself is untouched.

## The flow (the test bot finishes in about 7 minutes; a person takes about 8-10)

One thing at a time. A single flow controller (`flow` in `src/playable/main.ts`) decides what is active, and requests, upgrade tiles and camera moves ask it first. Captions go through **one channel**: one at a time, each faded out before the next. A small caption (praise, a combo) is shown only if nothing else is showing, otherwise it is dropped. The same caption twice is dropped.

**The train never stops**, so nobody boards or leaves. Three passengers are aboard from the start: one at the reception desk, two waiting on the sofa. Once checked in they stay in their rooms all night, and the conductor looks after them. The train starts as **one carriage** (the lobby).

**Tutorial.**
- Passenger 1, one step at a time, shown in a large instruction pill under the money: *Check in the guest* → *Get their bag* → *Bring it to their room* → *Grab the cash*.
- Passenger 2 comes from the sofa and does the same, with the arrow only.
- Then "GREAT JOB!", passenger 3 comes to the desk, and play begins.

**Guidance.** A bouncing arrow marks the goal, and an arrow at the conductor's feet appears only when the goal is off screen.

**Play.** Each guest asks for one thing at a time through the night: a blanket once, a towel once (Comfort), then tea (or coffee in Business). Later they also visit the café and the theatre. At most 2 requests are open (3 with an Attendant).

**Deliveries.** Picking up takes 0.2 s. A delivery goes the moment the guest is in reach (anywhere in their room). Cash streams onto the back from a stride away. New sounds: a coin "ting" that climbs a scale as a pile streams in, a two-note bell for a delivery, and a rising arpeggio for an upgrade.

**Upgrades, one by one.** A goal bar shows the next one; its tile appears once it is affordable.

| Upgrade | Price |
|---|---|
| Café Car | $100 |
| Comfort Class | $160 |
| Attendant | $180 |
| Theatre Car | $240 |
| Faster Attendant | $200 |
| Business Class | $300 |
| 2nd Attendant (serves the café and theatre) | $260 |
| Café Makeover | $320 |

Class upgrades restyle the lobby and keep its three rooms. Then the goal is "Dining Car: $X/300", and the end card comes once you can afford it.

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
