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

| Area        | Contents                                                                                        |
| ----------- | ----------------------------------------------------------------------------------------------- |
| Run flow    | 20 waves × 40 s, shop after each wave, elite (10) and boss (20) waves                           |
| Combat      | Enemy catalog (rusher / swarmer / special), telegraphs, elite and boss behaviours               |
| Progression | Spark/Flux economy, level-ups, card catalog (ability / buff / trade-off), shop reroll/lock      |
| Abilities   | Chain lightning, fire zone, multi-shot, turret — Q/E slots; scales with player damage/fire rate |
| Audio       | Adaptive music + SFX driven through the `@volstudio/core` music engine                          |
| Mobile      | On-screen touch controls, Android back button, auto-pause on background, haptics                |

Player stats are not part of the combat HUD: the `StatsPanel` button appears
only in the shop/intermission and opens a right-side modal drawer. Player stats
and Q/E abilities are categorized separately, with ability icons and effective
runtime values: turret damage, turret health, fire-rate-scaled turret cadence,
and chain lightning's total targets/jumps including the first target. Purchases,
sales, rerolls, and slot changes refresh the open drawer immediately. Its scrim
matches the card/shop screens and does not add blur.

Gameplay numbers live as data under `src/config/`; balancing is a config change, not a code change.

### Ability progression balance

Abilities with fixed damage parameters follow the player's current `damage`
stat, so chain lightning and fire zones do not fall behind the base weapon in
the late game. Multi-shot already uses player damage per projectile. Turrets
also have a maximum health derived from player maximum health and an internal
fire interval that follows player `fireRate`; turret health cannot fall below
its configured minimum ratio under health trade-offs. Ability activation
cooldowns use the same `fireRate` rule. The shared scaling lives under
`src/runtime/ability/`, its tuning is in `src/config/abilities.ts`, and its
contract is covered by regression tests.

### Simulation / render boundary

`src/runtime/simulation/VolHellSimulation.ts` is a Phaser-free model of waves,
enemies, economy and pickups. `VolHellSimulationDriver` advances it and gives
the render port only copied, read-only snapshots; long-run tests and the
benchmark use that surface without constructing a renderer. This boundary is
not yet a replacement for the entire production Phaser path: interactive
elite/boss controllers and the existing visual entity managers remain Phaser
owned and still require device smoke testing.

### Mobile / touch

`shouldUseTouchControls()` (CORE) mounts on-screen controls only when the
primary pointer is coarse AND cannot hover: dash plus two ability buttons at
the bottom right, pause at the top right (see `GameMobileControls`,
`TouchControls`). Ability/pause inputs are edge-triggered on touch, matching
their keyboard behaviour; `dash` carries frame state instead, so it merges
into the touch joystick's action set through `VirtualActionSource` in the SAME
frame — as separate providers, moving would have blocked pressing dash. The
Android hardware back button is bridged through a `vol:androidback` event
(`MainActivity.kt` → `backNavigation.ts`) and routed by whichever screen is
open (exit confirmation in the menu, pause in-game, consumed by card/death
screens). Backgrounding the app (`observeAppVisibility`) clears virtual button
presses and auto-pauses the run. Haptics (`core/src/platform/haptics.ts`) use
named patterns, default to enabled, and can be turned off in Settings; on
platforms without `navigator.vibrate` they are silent no-ops.

F11 toggles fullscreen in desktop and Tauri WebViews through the shared CORE
`FullscreenController`, covering the Phaser canvas and DOM root together. If a
browser reserves F11 for its own window, the app does not receive that event
and the browser's native behaviour is preserved.

## Hardening contract

- Scene restarts do not leave keyboard keys, Phaser managers, DOM screens, i18n
  listeners, rAF/timers, or async telegraphs behind; owning systems expose an
  explicit `destroy()`/`stopAll()` boundary.
- Run completion (victory/defeat) is guarded by a generation counter: a stale
  stats-submission result returning after a restart cannot open the summary
  screen over the new run.
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

## License

[Apache License 2.0](../../LICENSE)
