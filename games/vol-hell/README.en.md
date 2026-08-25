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

| Area        | Contents                                                                                   |
| ----------- | ------------------------------------------------------------------------------------------ |
| Run flow    | 20 waves × 40 s, shop after each wave, elite (10) and boss (20) waves                      |
| Combat      | Enemy catalog (rusher / swarmer / special), telegraphs, elite and boss behaviours          |
| Progression | Spark/Flux economy, level-ups, card catalog (ability / buff / trade-off), shop reroll/lock |
| Abilities   | Chain lightning, fire zone, multi-shot, turret — bound to the Q/E slots                    |
| Audio       | Adaptive music + SFX driven through the `@volstudio/core` music engine                     |

Gameplay numbers live as data under `src/config/`; balancing is a config change, not a code change.

## Hardening contract

- Scene restarts do not leave keyboard keys, Phaser managers, DOM screens, i18n
  listeners, rAF/timers, or async telegraphs behind; owning systems expose an
  explicit `destroy()`/`stopAll()` boundary.
- Runtime inputs reject or safely saturate `NaN`, `Infinity`, negative deltas,
  invalid directions, and corrupt counters. Score, economy, health, cooldown,
  and audio parameters remain finite.
- Audio settings persist debounced writes as ordered snapshots; `flush()` waits
  for an in-flight write. SFX loading cannot repopulate a released cache, and
  music loading from an old scene cannot leak into a new run.
- Card effects use a plan/commit/rollback boundary; the exposed inventory list
  cannot mutate the internal collection.

This contract is not a browser gate: real Web Audio behaviour, Phaser
renderer/device performance, and long-session gameplay still require manual
smoke testing.

## Commands

| Command                                            | Description                     |
| -------------------------------------------------- | ------------------------------- |
| `pnpm --filter @volstudio/vol-hell dev`            | Vite dev server                 |
| `pnpm --filter @volstudio/vol-hell build`          | Production build                |
| `pnpm --filter @volstudio/vol-hell preview`        | Serve the production build      |
| `pnpm --filter @volstudio/vol-hell typecheck`      | TypeScript check                |
| `pnpm --filter @volstudio/vol-hell test`           | Tests                           |
| `pnpm --filter @volstudio/vol-hell test:coverage`  | Tests + coverage thresholds     |
| `pnpm --filter @volstudio/vol-hell generate:audio` | Generate audio and music assets |
| `pnpm --filter @volstudio/vol-hell audio:qa`       | Measure generated audio assets  |

Shipped audio assets (`public/assets/audio/**/*.ogg`) are kept in the repo; regenerate them with `pnpm --filter @volstudio/vol-hell generate:audio` when the sound design changes. Intermediate formats (WAV, MP3) are not kept in the repo (see [sound-synth](../../core/docs/sound-synth.md), [music-engine](../../core/docs/music-engine.md)).

## UI

vol-hell does not invent its own UI components; all interface components come from `@volstudio/core` (`core/src/ui/`). For live component examples, see [devtools/vol-ui](../../devtools/vol-ui/README.md).

## License

[Apache License 2.0](../../LICENSE)
