# @volstudio/vol-asset-studio

A repository asset workbench for discovering visual, audio, font, and source
documents that actually exist in VOL.STUDIO. It is neither a game nor a
text-to-image generator: it indexes files on disk, follows live repository
changes, and provides a preview appropriate for each asset kind.

[Türkçe](README.md)

## Current scope

- live catalog, search, and kind/problem/Git-status filters across repo roots;
- file-size, media-signature, JSON-structure, and image-decoding diagnostics;
- PNG/JPEG/WebP/GIF/AVIF previews with server-side thumbnails;
- OGG/MP3/WAV/FLAC playback and FFmpeg/ffprobe metadata;
- WOFF/WOFF2/TTF/OTF font samples;
- source, derived-output, and recipe relationship metadata;
- identity-based incremental SSE updates with full resync after a sequence gap;
- Quick Look metadata and repository-relative path copying;
- read-only VisualSynth inspector for `.volsprite.json` documents, showing the
  source graph, channel preview, QA, real render profile, buffer cost, and
  region/halo decision;
- tile-backed pixel surface, layers/frames/palette, onion skin, undo/redo, and
  revision-checked atomic PNG saves;
- peak-pyramid waveform, selection, zoom, transport, gain, trim, fades, peak
  normalization, reverse, and atomic OGG/WAV saves;
- read-only reference search, rename preview, and recoverable trash.

Layers and frames are currently flattened into the composite when a direct PNG
is saved; reopening native `.volsprite.json` documents is not complete yet. An
audio processing chain is applied to the current OGG/WAV only after an explicit
save; persistence as a `.volaudio.json` recipe is not wired yet. MP3/FLAC files
can be inspected but require the OGG/WAV conversion path before saving. The
VisualSynth inspector renders the JSON source read-only in the browser through
CORE; it does not edit pixels or write files. Native `.volsprite.json` editing
and saving remains a separate debt.

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

| Endpoint                                      | Responsibility                         |
| --------------------------------------------- | -------------------------------------- |
| `GET /api/v1/project`                         | Project roots and access mode          |
| `GET /api/v1/catalog`                         | Revisioned asset summary               |
| `GET /api/v1/assets/:id/content`              | Real file with Range and ETag          |
| `GET /api/v1/assets/:id/thumbnail?size=…`     | Bounded image preview                  |
| `GET /api/v1/assets/:id/audio`                | Audio codec/duration/channel data      |
| `GET /api/v1/assets/:id/raster`               | Bounded raw RGBA for editing           |
| `GET /api/v1/assets/:id/waveform`             | Peak pyramid and structured audio QA   |
| `POST /api/v1/assets/:id/audio/render`        | Validate, process, and atomically save |
| `POST /api/v1/save-transactions`              | Revision-checked atomic asset save     |
| `GET /api/v1/references/:id`                  | Read-only reference index              |
| `POST /api/v1/file-operations/*`              | Rename preview and recoverable trash   |
| `GET /api/v1/events`                          | Live catalog SSE stream                |
| `POST/DELETE /api/v1/session/auth`            | Open/close a LAN session               |
| `POST/DELETE /api/v1/session/lease[ /renew ]` | Single-editor lock                     |

API errors never carry display copy. Stable `error.code` values are translated
to Turkish or English by the client i18n layer.
When the page closes, the client releases the editor lease with a `keepalive`
request; the server's short TTL remains the safe fallback if the network closes.

## Security boundary

- The host is loopback-only by default; the development frontend cannot bind
  to a LAN interface.
- Request origin and LAN session are checked before API handlers run.
- Canonical path and file identity are checked during configuration, catalog
  scans, and every file open; symlink escapes outside the repo are rejected.
- Thumbnail pixels, asset bytes, and request bodies are bounded.
- File responses implement revision, `ETag`, conditional requests, and a
  single-range `Range` contract.
- Writes happen only after an explicit save; the expected content revision is
  checked twice and a temp/backup/rollback transaction protects the target.
  Write routes reject `readonly` roots.

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
