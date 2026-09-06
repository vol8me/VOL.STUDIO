# @volstudio/vol-asset-studio

Asset workspace that surfaces the repository's images, audio, fonts and
production documents in one web view. It is **not** a text-to-image generator:
it indexes what actually exists on disk, watches live changes, previews by type
and saves editable assets under revision control.

[Türkçe](README.md)

## Running

```bash
pnpm --filter @volstudio/vol-asset-studio dev     # :5175
```

The root `pnpm dev` starts it too. Production packaging and LAN exposure are in
[DESIGN.md](DESIGN.md).

The server prints a one-time access key on startup; you enter it once and the
rest of the session travels in an `HttpOnly` cookie.

## What it does

- Live catalogue across repository roots: search, type/problem/Git filters,
  incremental updates over SSE.
- Previews: PNG/JPEG/WebP/GIF/AVIF plus thumbnails, OGG/MP3/WAV/FLAC playback
  with metadata, WOFF/WOFF2/TTF/OTF font samples.
- **PNG editor**: tiled pixel surface, layers/palette, undo/redo, atomic save.
  Saving FLATTENS visible layers; layer separation and history live only while
  the document is open.
- **Audio editor**: waveform, selection, gain, trim, fade, normalize, reverse
  and atomic OGG/WAV save. MP3/FLAC can be inspected; editing needs conversion.
- Read-only VisualSynth inspector for `.volsprite.json`.
- Reference lookup, rename preview, recoverable trash.

Animation authoring and native sprite project files are **out of scope**.

## Configuration

The root [`asset-studio.json`](../../asset-studio.json) declares which folders
appear in the catalogue and each root's role (`source`, `derived`, `shipped`,
`readonly`). Unknown fields, duplicate ids or escaping paths are rejected at
startup with a single error.

## Verification

```bash
pnpm --filter @volstudio/vol-asset-studio test
```

Repository gate is `pnpm high`. Audio metadata needs `ffprobe`;
`pnpm run doctor:env` checks for it.

## License

[Apache License 2.0](../../LICENSE)
