# Sound and music credits

**Sound effects** are synthesised in `src/audio/AudioEngine.ts` (no files).

**Music:** `music_theme.mp3` is the Night Express theme, an original jazz waltz in F for piano and strings
written for this game. Its score lives in `scripts/audio/build_music.py`, which renders it from these
recordings (all free to use in a commercial game with attribution):

| Instrument | Source | Licence |
|---|---|---|
| Piano | Salamander Grand Piano V3 by Alexander Holm, via npm [`@audio-samples/piano-mp3-velocity6`](https://www.npmjs.com/package/@audio-samples/piano-mp3-velocity6) and [`-velocity8`](https://www.npmjs.com/package/@audio-samples/piano-mp3-velocity8) | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| Contrabass, cello, violin, harp | [tonejs-instruments](https://github.com/nbrosowsky/tonejs-instruments) by Nicholaus Brosowsky (edited from public-domain recordings), via npm `tonejs-instrument-*-mp3` | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |

To change the music, edit the score (chords, melody, strings) in the script and re-render:
`python3 scripts/audio/build_music.py <dir of unpacked npm packages> [--preview out.wav]` (usage in the file).
Its level in the game is `mix.music` in `src/config/audio.ts`.
