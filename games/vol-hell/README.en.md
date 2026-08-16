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

## Systems

| Area        | Contents                                                                          |
| ----------- | --------------------------------------------------------------------------------- |
| Run flow    | 20 waves × 40 s, shop after each wave, elite (10) and boss (20) waves             |
| Combat      | Enemy catalog (rusher / swarmer / special), telegraphs, elite and boss behaviours |
| Progression | Spark/Flux economy, level-ups, card catalog (ability / buff / trade-off)          |
| Abilities   | Chain lightning, fire zone, multi-shot, turret — bound to the Q/E slots           |
| Audio       | Adaptive music + SFX driven through the `@volstudio/core` music engine            |

Gameplay numbers live as data under `src/config/`; balancing is a config change, not a code change.

## Commands

| Command                                            | Description                     |
| -------------------------------------------------- | ------------------------------- |
| `pnpm --filter @volstudio/vol-hell dev`            | Vite dev server                 |
| `pnpm --filter @volstudio/vol-hell build`          | Production build                |
| `pnpm --filter @volstudio/vol-hell preview`        | Serve the production build      |
| `pnpm --filter @volstudio/vol-hell typecheck`      | TypeScript check                |
| `pnpm --filter @volstudio/vol-hell test`           | Tests                           |
| `pnpm --filter @volstudio/vol-hell test:coverage`  | Tests + coverage (CI runs this) |
| `pnpm --filter @volstudio/vol-hell generate:audio` | Generate audio and music assets |

Audio assets are not kept in the repo; generate them with `generate:audio` (see [sound-synth](../../core/docs/sound-synth.md), [music-engine](../../core/docs/music-engine.md)).

## UI

vol-hell does not invent its own UI components; all interface components come from `@volstudio/core` (`core/src/ui/`). For live component examples, see [games/vol-ui](../vol-ui/README.md).

## License

[Apache License 2.0](../../LICENSE)
