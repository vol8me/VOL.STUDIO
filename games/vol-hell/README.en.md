# VOL-HELL

Wave-based tactical arena survival. A run lasts 20 waves; card picks and a shop
open between waves, an elite arrives at wave 10 and a boss at wave 20.

Phaser 4 · TypeScript · Vite · `@volstudio/core`. This package is also the
monorepo's Vite root (`index.html`, `public/`).

[Türkçe](README.md) · [root README](../../README.en.md)

## Running

```bash
pnpm --filter @volstudio/vol-hell dev
```

All recipes: `pnpm exec just --list`; package scripts: `package.json`.

## Two contracts

**UI invents nothing.** Every interface part comes from `@volstudio/core`; live
examples in [devtools/vol-ui](../../devtools/vol-ui/README.md).

**Audio is generated through the canonical publication gate.** Shipped `.ogg`
files and their manifests live in the repo. Source job, family, and music
documents live under `devtools/audio-synth/audio-{jobs,families,music}/`; changes
are republished through `audio:job`. Intermediate formats (WAV, MP3) are not
tracked — see
[audio-synth](../../devtools/audio-synth/DESIGN.md),
[music-engine](../../core/docs/music-engine.md).

## Deeper

Systems, balance, the simulation/render boundary, mobile and graphics-quality
decisions: [DESIGN.en.md](DESIGN.en.md).

## License

[Apache License 2.0](../../LICENSE)
