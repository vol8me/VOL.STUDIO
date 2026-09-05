# VOL-HELL

Wave-based tactical arena-survival game. A run lasts 20 waves; a card pick and shop open between waves, with an elite on wave 10 and a boss on wave 20.

[Türkçe](README.md)

## Stack

Phaser 4 · TypeScript · Vite · `@volstudio/core` (shared systems + UI kit)

This package is the monorepo's game package and also serves as the Vite root (`index.html`, `public/`). See the [root README](../../README.en.md) for the monorepo overview.

## Running

```bash
pnpm install
pnpm --filter @volstudio/vol-hell dev
```

## Commands

| Command                                                  | Description                     |
| -------------------------------------------------------- | ------------------------------- |
| `pnpm --filter @volstudio/vol-hell dev`                  | Vite dev server                 |
| `pnpm --filter @volstudio/vol-hell build`                | Production build                |
| `pnpm --filter @volstudio/vol-hell preview`              | Serve the production build      |
| `pnpm --filter @volstudio/vol-hell typecheck`            | TypeScript check                |
| `pnpm --filter @volstudio/vol-hell test`                 | Tests                           |
| `pnpm --filter @volstudio/vol-hell test:coverage`        | Tests + coverage thresholds     |
| `pnpm --filter @volstudio/vol-hell benchmark:simulation` | Headless simulation benchmark   |
| `pnpm --filter @volstudio/vol-hell generate:audio`       | Generate audio and music assets |
| `pnpm --filter @volstudio/vol-hell audio:qa`             | Measure generated audio assets  |

Shipped audio assets (`public/assets/audio/**/*.ogg`) are kept in the repo; regenerate them with `pnpm --filter @volstudio/vol-hell generate:audio` when the sound design changes. Intermediate formats (WAV, MP3) are not kept in the repo (see [sound-synth](../../devtools/audio-synth/DESIGN.md), [music-engine](../../core/docs/music-engine.md)).

## UI

vol-hell does not invent its own UI components; all interface components come from `@volstudio/core` (`core/src/ui/`). For live component examples, see [devtools/vol-ui](../../devtools/vol-ui/README.md).

## Further reading

- [DESIGN.en.md](DESIGN.en.md) — systems, balance, simulation/render boundary,
  mobile and graphics-quality decisions, hardening contract
- [root README](../../README.en.md) — monorepo overview, setup, quality gates

## License

[Apache License 2.0](../../LICENSE)
