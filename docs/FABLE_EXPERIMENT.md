# The Fable Experiment

A separate version of Night Express (branch `graphics-experiment-2`, its own play link and its own save), made to answer
"how would Fable 5.2 do it?". Everything it changes is in `src/config/fable.ts`, with the reason beside each number;
`?fable=0` on the address shows the game it started from, for a side-by-side.

## The idea: every ride is one night
The game's own rule is "one trip, one sleep": guests settle in, ask for things in the evening, sleep once, wake, ask
again and get off. But the world never showed it. It was held at one moonlit moment for the whole session, so the
strongest idea in the design, the journey rhythm, was only visible on a progress bar, and the player did most of their
work in the dark.

Here the sky is the ride's clock (`docs/fable/one-ride.jpg`):

| Where in the ride | The sky | What the player is doing |
|---|---|---|
| Station | warm afternoon | the rush: tickets, bags, boarding, the workshop |
| 0–25% | golden hour into sunset | evening requests, outings |
| 25–40% | the blue hour, lamps coming on | last requests before bed |
| 40–62% | night (lights out) | shoes, night owls |
| 62–90% | first light, a peach dawn | morning requests, sunrise tips |
| arriving | clear morning | the next station |

## What changed, and why
1. **The ride clock** (`FABLE_SKY`, `FABLE_CLOCK`, `Game.fableClock`, `Lighting`). Ten sky keys run in step with ride
   progress and ease between journey phases. *Why:* (a) the busiest and most demanding part of play, the station, is now
   the brightest and easiest to read, and the opening is no longer a black screen (`docs/fable/opening-before-after.jpg`);
   (b) each two-minute leg has a colour script, so the game looks different every twenty seconds instead of the same
   for two hours, which is also what an ad clip needs; (c) the night is kept, but as a short mood with the lamps on,
   not as the place all the work happens; (d) "Night Express" becomes literally true of every ride.
2. **Low ambient, strong warm key by day.** The old day keys lit everything evenly and looked washed out; these keep the
   ambient low and let a warm sun do the work, so forms have a lit side and a shaded side.
3. **Sun shadows on High and Ultra** (`FABLE_TIERS`). With a real sun, walls and furniture throwing shadows across the
   floors is what gives a dollhouse weight. It is the train's one static shadow map (redrawn only when the train
   changes), so it costs nothing per frame. Low and Medium (phones) keep the proven path with no shadow maps until this
   is checked on real devices.
4. **The route line is the sky** (`body.fable .journey` in `styles.css`). On the move, the bar shows the ride ahead:
   gold, sunset, a dark band for the night, pink for sunrise. *Why:* the player can now read "night is coming, serve
   before dark" and "sunrise is close" at a glance, with no words.
5. **Sunrise tips** (`gameplay/Sunrise.ts`, `FABLE_PLAY.sunrise`). As the ride's morning starts, every sleeper who went
   to bed content (nothing asked for and never got, not kept waiting) shows a heart and leaves a little extra (3 × their
   class's tip multiplier), paid in one burst with "N slept well" (`docs/fable/sunrise-tips.jpg`). *Why:* the night was
   each leg's dead stretch, and the evening's service had no visible payoff. Now each leg has a second beat between
   stations, landing exactly as the light comes back.
6. **Reviews you can see** (`FABLE_PLAY.reviewStars`, `Guests.review`). A guest getting off shows the stars they leave.
   *Why:* the Train Rating was already the average of these reviews, but they were silent, so the rating felt
   arbitrary. Five gold stars over a happy guest is the game showing what good service is.

## What it does not change
The Route 1 economy, prices, the unlock order, the tutorial, the camera, and every model. Sunrise tips add a little
income, so pacing is slightly faster than the main game; it has **not** been re-measured on the pacing simulator.

## Checks
595 unit tests and the smoke run pass. Only tested headless (software renderer), not on a phone.

## What I would do next
- Check the sun shadows on real phones and, if they hold, give them to Medium.
- Sun patches through the windows at golden hour and dawn that move with the clock (the earlier, static ones were
  rightly removed as "weird lights": they did not match any light in the scene).
- A sunrise sound of its own (birdsong fading in over the murmur) and a quieter night.
- Re-measure pacing with sunrise tips and trim `perGuest` if the mid-game speeds up.
