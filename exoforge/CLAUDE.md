# EXOFORGE: Scrap to Sky

This folder is a **separate game** that happens to live inside the Night Express repository until it gets its own repo.
The repository root's `CLAUDE.md` (Night Express) does **not** apply here.

- The full brief is `SPEC.md` (Part A game spec, Part B art bible). `START-HERE.md` is the owner's workflow guide.
- `PROGRESS.md` is the log: read it first, continue with the next unfinished milestone, and update it at the end.
- Run everything from this folder: `npm run build`, `npm test`, `npm run play`, `npm run shots`, `npm run chunks`.
- Keep `src/sim`, `src/econ` and `src/content` free of Pixi and DOM imports (a test enforces it).
- Every tunable flight number lives in `src/econ/balance.ts`; camera and view numbers in `src/render/config.ts`.
- Style references in `art/references/` are local only (see its README); ask the owner for them before visual work.
- Phone testing: the cloud container cannot serve the phone, so each build is published as one self-contained HTML
  page (`dist/index.html`) to the owner's private Artifact link listed in `PROGRESS.md`.
