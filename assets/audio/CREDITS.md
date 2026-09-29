# Sound credits

Every file here is free to use in a commercial game. Rebuild with `python3 scripts/audio/build_sounds.py <uisfx package> <kenney clones>`
(trims leading silence, fades, normalises to −1 dBFS, encodes mono MP3).

| Files | Source | Licence |
|---|---|---|
| `ui_*.mp3` | [uisfx](https://www.npmjs.com/package/uisfx) 0.4.0, Soft and Glass packs (press, snap, drop, notification, reaction, invalid-drop, blocked, swipe, success, check, reward, unlock, level-up, achievement, purchase, streak) | Audio CC0-1.0 (code MIT) |
| `k_coin.mp3` | Kenney, [Starter Kit 3D Platformer](https://github.com/KenneyNL/Starter-Kit-3D-Platformer) `sounds/coin.ogg` | CC0 |
| `k_place_a–d.mp3` | Kenney, [Starter Kit City Builder](https://github.com/KenneyNL/Starter-Kit-City-Builder) `sounds/placement-*.ogg` | CC0 |
| `r_*.mp3` | Rendered for Night Express by `scripts/audio/build_sounds.py`: steam whistle (long, short), rail clacks, coupling clunk, desk bell, sliding door, broom swishes, washroom flush, station chime, footsteps on boards, old-floorboard creaks | Ours |

Which game cue plays which file, and at what level, is set in `src/config/audio.ts`.
