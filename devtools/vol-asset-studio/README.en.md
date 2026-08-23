# @volstudio/vol-asset-studio

A repository asset workbench for discovering visual, audio, font, and source
documents that actually exist in VOL.STUDIO. It is neither a game nor a
text-to-image generator: it indexes files on disk, follows live repository
changes, and provides a preview appropriate for each asset kind.

[Türkçe](README.md)

## Current scope

The Stage 3 surface is intentionally **read only**:

- live catalog, search, and kind/problem/Git-status filters across repo roots;
- PNG/JPEG/WebP/GIF/AVIF previews with server-side thumbnails;
- OGG/MP3/WAV/FLAC playback and FFmpeg/ffprobe metadata;
- WOFF/WOFF2/TTF/OTF font samples;
- source, derived-output, and recipe relationship metadata;
- identity-based incremental SSE updates with full resync after a sequence gap;
- Quick Look metadata and repository-relative path copying.

Pixel/audio editing, version history, and safe writes are not presented as if
they existed in this stage. The CORE workbench components are infrastructure
for the next stage; every control visible on the current screen works.

## Running

From the repository root:

```bash
pnpm --filter @volstudio/vol-asset-studio dev
```

The repository host and Vite share `http://127.0.0.1:5175`. The root `pnpm
dev` command also starts Asset Studio alongside VOL.HELL and VOL.UI.

Production package:

```bash
pnpm --filter @volstudio/vol-asset-studio build
pnpm --filter @volstudio/vol-asset-studio start
```

LAN exposure is accepted only with the production frontend:

```bash
pnpm --filter @volstudio/vol-asset-studio build
pnpm --filter @volstudio/vol-asset-studio exec node dist-server/server/cli.js --production --host 0.0.0.0
```

The repository host prints a temporary access key to the terminal at startup.
Enter it once in the web UI; subsequent image, audio, font, and SSE requests
use an `HttpOnly` session cookie. The key is never placed in a URL or browser
storage.

## Project configuration

The root [`asset-studio.json`](../../asset-studio.json) declares which folders
belong in the catalog. Each root has a stable identifier, repository-relative
path, role, and allowed asset kinds.

| Role       | Meaning                                       |
| ---------- | --------------------------------------------- |
| `source`   | Editable source document for production       |
| `derived`  | Output that can be regenerated from a source  |
| `shipped`  | Runtime asset distributed with the game       |
| `readonly` | Discoverable asset that is not a write target |

Missing optional roots remain visible in the project response without
crashing the service. Unknown fields, duplicate root identifiers,
absolute/escaping paths, and invalid limits are rejected as a single startup
configuration error.

## Repository host contract

| Endpoint                                      | Responsibility                       |
| --------------------------------------------- | ------------------------------------ |
| `GET /api/v1/project`                         | Project roots and access mode        |
| `GET /api/v1/catalog`                         | Revisioned asset summary             |
| `GET /api/v1/assets/:id/content`              | Real file with Range and ETag        |
| `GET /api/v1/assets/:id/thumbnail?size=…`     | Bounded image preview                |
| `GET /api/v1/assets/:id/audio`                | Audio codec/duration/channel data    |
| `GET /api/v1/events`                          | Live catalog SSE stream              |
| `POST/DELETE /api/v1/session/auth`            | Open/close a LAN session             |
| `POST/DELETE /api/v1/session/lease[ /renew ]` | Single-editor lock for future writes |

API errors never carry display copy. Stable `error.code` values are translated
to Turkish or English by the client i18n layer.

## Security boundary

- The host is loopback-only by default; the development frontend cannot bind
  to a LAN interface.
- Request origin and LAN session are checked before API handlers run.
- Canonical path and file identity are checked during configuration, catalog
  scans, and every file open; symlink escapes outside the repo are rejected.
- Thumbnail pixels, asset bytes, and request bodies are bounded.
- File responses implement revision, `ETag`, conditional requests, and a
  single-range `Range` contract.
- The Stage 3 client calls no write endpoint; Forge outputs are visible only
  as a `readonly` legacy root.

## Verification

```bash
pnpm --filter @volstudio/vol-asset-studio typecheck
pnpm --filter @volstudio/vol-asset-studio test
pnpm --filter @volstudio/vol-asset-studio test:coverage
pnpm --filter @volstudio/vol-asset-studio build
```

The repository-wide closing gate is `pnpm high`. Audio metadata requires
`ffprobe`; `pnpm run doctor:env` checks it.

## License

[Apache License 2.0](../../LICENSE)
