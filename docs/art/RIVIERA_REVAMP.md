# Riviera Coast Line: the tropical revamp (plan, approved choices 24 Nov)

Owner: "completely transform the Riviera… tropical beach vibe… every carriage 1 to 9, every detail… distinct language
from the countryside… exciting carriages and upgrades first… different upgrade lines… gameplay in every carriage, not
cosmetics… an end to the train… use Blender or whatever is needed." Concept art: the owner's three tiki-bar, beach-café
and spa images (bamboo, thatch, rattan, hibiscus, leis, palm-leaf rugs, wavy water runners, coconut drinks, tiki torches,
woven pendant lamps, a carved "Smoothie Bar" sign). This is a **gameplay change to Route 2 only**: Route 1 stays
byte-identical in the pacing simulator; Route 2 gets a fresh pacing pass.

## Decisions (owner, 24 Nov)
- **Line-up, most exciting first:** Beach Lobby → Smoothie Bar → **Pool Car** → **Beach Lounge** (new; replaces the
  Washroom Car) → Sea-View Sleeper → Seafood Diner → Spa → Kids' Play → Honeymoon Suites, then an **open rear deck**
  with a railing as the train's end.
- **Upgrade line on every carriage:** Broken → **Driftwood** → **Bamboo** → **Tiki Paradise** (replacing Repair /
  Makeover / Luxury and Comfort / First Class / Royal Suite on this route). Names, emblems, liveries and every
  furnishing per tier follow it; nothing luxurious carries over (no velvet, gilt, marble, four-posters, pianos).
  Session 69 (owner: "too abstract, does not indicate upgrades"): the looks keep those names, but the tiles read as
  things to buy (Repair → Bamboo Makeover → Tiki Luxury on venues; Repair → Sea View Rooms → Tiki Suites on passenger
  carriages, the Honeymoon Suites' Sea View Suites → Ocean Suites) and the classes as what is sold (Beach Hut, Sea
  View, Ocean Suite, Tiki Suite).

## Visual language (vs the Countryside)
| | Countryside | Riviera |
|---|---|---|
| Light | deep night, amber lamps | golden hour, low warm sun, sun streaks |
| Walls | painted panels, wood caps | bamboo poles and woven rattan panels, thatch trim on the caps |
| Floors | planks, carpets, parquet | sun-bleached deck boards, jute runners with a wavy blue "water" border, palm-leaf rugs |
| Light fittings | lamps, sconces | woven pendant lamps, tiki torches, string lights |
| Greenery | potted plants | monstera, palms, hibiscus, leis and flower garlands on every rail |
| Signs | brass plates | carved, painted surf-board signs ("Smoothie Bar", "Spa") |
| Furniture | upholstered, polished | rattan chairs with turquoise cushions, bamboo tables with white cloths |
| Outside | lake, fields, villages | turquoise sea with sparkle, sand, palms, lush grass with flowers |

## Each carriage: what you do there (gameplay, not cosmetics)
1. **Beach Lobby** (cabanas): check-in at a bamboo desk under a thatch canopy; welcome lemonade on arrival; surfboard
   rack (bags). Tiers add a lei stand (guests take one: a tip) and a coconut bar.
2. **Smoothie Bar:** guests sit at the bar; blend at the blender row (each fruit a different blender light), serve in a
   coconut or glass. Tiers add blenders (faster) and the tiki bar's Happy Hour (from the Bar Lounge mechanic).
3. **Pool Car** (moved up): swim, towel, skim leaves (existing mechanic), plus a lifeguard chair; the most visual car,
   so it comes third.
4. **Beach Lounge** (new, replaces the Washroom Car): a car of big panoramic windows and sand on the floor: loungers,
   parasols, a hammock. Guests come to chill; the conductor hands out **sunscreen** and **cold drinks**, and at a
   **"sunset view"** (every ride, like the dome's scenic view) everyone lounging pays. Its back room becomes the **towel
   and sunscreen hut** they are fetched from (so the back room has a job). The washroom routine moves to cabin showers.
5. **Sea-View Sleeper:** cabanas with sea-view windows; requests (lemonade, aloe, towel); sand in the mess.
6. **Seafood Diner:** grill station instead of a range; plates of grilled fish; clear tables.
7. **Spa:** robes, massage, rest (existing) plus **foot baths** (a basin of petals: fill it, a guest soaks) from Bamboo.
8. **Kids' Play:** puppet show and noise meter (existing) on a beach theme: sandpit, beach balls, a slide.
9. **Honeymoon Suites:** do-not-disturb (existing), canopy beds in muslin and hibiscus instead of velvet.
- **Rear deck:** an open observation platform with a bamboo railing, string lights and two loungers; guests step out
  to watch the sea (a calm idle spot), and it closes the train visually.
- **Back rooms:** every Riviera back room gets a job (the lounge's towel hut, the diner's fish icebox the grill draws
  from, the spa's linen store for fresh towels) or is removed and the guest area takes the space.

## Station and outside
- Station: a boardwalk platform of bleached planks on piles over sand, a thatched ticket hut, a surf shop, an ice-cream
  cart, parasols, palms in planters, lanterns on poles, bunting of flags; the sea right behind the railing.
- Outside: turquoise sea with a sparkle shader and foam at the sand, grass dense with flower tufts, palms, beach huts.

## How it is built
- A **tropical kit** modelled in Blender (`art/blender/tropical_kit.py`): bamboo pole, rattan panel, thatch strip,
  tiki torch, woven pendant lamp, surfboard sign, rattan chair, bamboo table, lounger, parasol, hammock, blender,
  coconut drink, hibiscus, lei garland, palm-leaf rug, foot bath; baked to vertex colour + AO and merged like today's
  models (`models.bin`), restyled to the bible.
- Riviera layouts per type and tier in `layout.ts` (the route's `layout` knobs grow into per-type plan overrides);
  furnishings per tier in `RivieraProps.ts`; Beach Lounge as a new type `lounge` (layout, venue entry, staff "Beach
  Host"), `RIVIERA_COAST.carriages` reordered.
- Tier names, emblems and liveries per route (`RouteDef.tiers`), read by the refit tiles, title cards and chips.

## Order of work (sessions)
1. Line-up and tiers as data (order, Beach Lounge type with its mechanic, tier names, rear deck); a pacing pass.
2. Tropical kit in Blender, baked; the lobby, smoothie bar and pool car dressed per tier.
3. Lounge, sleeper, diner dressed; back rooms given jobs or removed.
4. Spa (with foot baths), kids, honeymoon dressed; station and outside.
5. Golden-hour polish (sun streaks, sea sparkle, grass), comparison shots, pacing proof that Route 1 is untouched.
