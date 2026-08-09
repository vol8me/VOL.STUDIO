# VOL-HELL

An early-skeleton Phaser game. Not yet playable.

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

| Command                                       | Description      |
| --------------------------------------------- | ---------------- |
| `pnpm --filter @volstudio/vol-hell dev`       | Vite dev server  |
| `pnpm --filter @volstudio/vol-hell build`     | Production build |
| `pnpm --filter @volstudio/vol-hell typecheck` | TypeScript check |

## UI

vol-hell does not invent its own UI components; all interface components come from `@volstudio/core` (`core/src/ui/`). For live component examples, see [games/vol-ui](../vol-ui/README.md).

## License

[Apache License 2.0](../../LICENSE)
