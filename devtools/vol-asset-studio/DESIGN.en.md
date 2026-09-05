# Asset Studio — design decisions

The server contract and the security boundary. How to run it lives in the
[README](README.en.md) — a README is an introduction, not a contract dump.

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
