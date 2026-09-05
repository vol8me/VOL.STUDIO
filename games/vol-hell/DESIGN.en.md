# VOL.HELL — design decisions

This document holds WHY the game is built the way it is. How to run it and what
commands exist live in the [README](README.en.md) — a README is an
introduction, not a decision log.

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
platforms without support they are silent no-ops. The setting is
CAPABILITY-bound: desktop has no `navigator.vibrate` and neither keyboard nor
mouse rumbles, so haptics are only possible through a connected gamepad's
rumble motor — the checkbox stays disabled without one and becomes live the
moment a pad is plugged in (see `observeHapticsCapability`).

Video settings (display mode, window resolution, graphics quality) are shown
only on non-touch surfaces. **Window resolution additionally requires a native
window** (`hasNativeWindow()`): a desktop build played in a browser has no API
to resize the window, so the control is disabled — left enabled, the user would
change the value, the value would persist, and nothing would happen. Graphics
quality changes both render DPR and particle density LIVE; the DPR provider is
passed from `bootstrap` and quality profiles are data in `src/config/video.ts`.

### Graphics quality

Two levels, with a MEASURABLE gap between them:

| Knob                          | High | Low                          |
| ----------------------------- | ---- | ---------------------------- |
| Raster scale                  | 1.0  | 0.7 (**~49% of the pixels**) |
| DPR ceiling                   | 2    | 1                            |
| Particle count                | ×1   | ×0.35                        |
| Particle lifespan             | ×1   | ×0.6                         |
| Bullet trails                 | on   | off                          |
| Entity outlines               | on   | off                          |
| Ground markers                | on   | off                          |
| DOM `backdrop-filter`/shadows | on   | off                          |

Raster scale is the heaviest lever. It does NOT change world size: the camera
is zoomed by the same factor, so the arena and all speeds stay fixed and only
sharpness differs (see `core/docs/primitives.md`). That separation also closes
an old inconsistency — the world used to be measured in device pixels, so a 2x
display got a 50% wider arena, meaning the quality setting silently changed
gameplay.

Levels are DATA in `src/config/video.ts`; the mechanism lives in CORE
`GraphicsQuality` and no game-specific knob lives in CORE.

F11 toggles fullscreen in desktop and Tauri WebViews through the shared CORE
`FullscreenController`, covering the Phaser canvas and DOM root together. If a
browser reserves F11 for its own window, the app does not receive that event
and the browser's native behaviour is preserved.

## Simulation time

Render frame time is split into fixed steps by `SimulationClock`
(`core/src/time/SimulationClock.ts`). The policy lives in one place and
is tested without constructing Phaser: at low FPS several full steps reclaim
real time, at huge deltas (tab return) a catch-up ceiling applies and the
DROPPED time is reported.

**Known limit:** above 60 FPS the leftover slice runs as a variable-length step
so input response is not delayed by a frame. That means identical input can
produce different results at different render rates — the simulation is not yet
fully deterministic. Removing it changes game feel (up to 16 ms of input
latency) and requires render-side interpolation; planned as a separate round.

## Hardening contract

- Settings writes never fail SILENTLY: `settingsPersistence` forwards the error
  to the console, to the `diagnostics` event stream (`settingsPersistFailed`)
  and to subscribed UI together. A setting that looks applied at runtime but
  cannot reach disk would otherwise go unnoticed until the player quits.
- Menu music tolerates partial load success: a broken track is skipped and a
  transient failure is retried on the next entry (see `app/menuMusic.ts`).
- Death music is picked from LOADED candidates; with none known it is still
  attempted and the engine swallows the error.

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
