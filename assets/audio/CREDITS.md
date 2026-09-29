# Sound and music credits

**Sound effects** are synthesised in `src/audio/AudioEngine.ts` (no files).

**Music:** `music_theme.mp3` is the Night Express theme, an original, sunny lo-fi groove in F (80 bpm,
16 bars, 48 s loop) written for this game. Its score lives in `scripts/audio/build_music.py`, which renders
it from these recordings (all free to use in a commercial game; the CC BY ones need this credit):

| Instrument | Source | Licence |
|---|---|---|
| Piano | Salamander Grand Piano V3 by Alexander Holm, via npm [`@audio-samples/piano-mp3-velocity6`](https://www.npmjs.com/package/@audio-samples/piano-mp3-velocity6) | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| Electric bass, electric guitar | [tonejs-instruments](https://github.com/nbrosowsky/tonejs-instruments) by Nicholaus Brosowsky (edited from public-domain recordings), via npm `tonejs-instrument-bass-electric-mp3` and `tonejs-instrument-guitar-electric-mp3` | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| Drums (soft kick, soft snare, closed and pedal hi-hat) | The [Sonic Pi](https://sonic-pi.net) sample set (menegass kit from freesound.org), via npm [`supersonic-scsynth-samples`](https://www.npmjs.com/package/supersonic-scsynth-samples) | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) |

To change the music, edit the score (chords, melody, bass, drums) in the script and re-render:
`python3 scripts/audio/build_music.py <dir of unpacked npm packages> [--preview out.wav]` (usage in the file).
To use a different track instead, replace `music_theme.mp3` and set `loopSeconds` in `src/audio/music.ts`
to the track's loop length (or its full length if it has no tail). Its level in the game is `mix.music` in
`src/config/audio.ts`.
