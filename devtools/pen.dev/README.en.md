# pen.dev

VOL.STUDIO's shared design source and **export/ship** pipeline: a Pencil canvas
file (`pen/entities.pen`), the part/preview images exported from it
(`pen_export/`), and the tool that verifies that output and ships it to its
consumer (`@volstudio/pen.dev`, `src/`).

**The layer that reads a rig at runtime does not live here.** Validating
metadata, building a `RigDefinition`, articulating it and assembling it in a
Phaser scene all live in `@volstudio/core/rig` — a game's runtime must not
depend on the tool that produced its assets (see root `AGENTS.md`, "Bozulamaz
Kurallar" 4). This package produces and ships; CORE consumes.

**It is a build-time tool.** It never enters a game's bundle, does not depend on
Phaser, and sits under `devDependencies` in consuming packages. Its only
outward dependency is `@volstudio/core/rig/metadata` (devtool → core is
allowed).

[Türkçe](README.md)

## Usage

### 1. Organize the export

Getting PNGs out of Pencil is a two-step process: native `Export()` is called
through the Pencil MCP `execute` tool, then the output is moved into the entity
layout and its metadata is written. The usage comment at the top of the script
documents the manifest shape and every validation rule.

```bash
node scripts/organize-pen-export.mjs <manifest.json> <stagingDir> [outputRoot]
```

### 2. Ship it to the consumer

What lands under `pen_export/` is an **intermediate artifact**; a game's build
never reads it directly. (Intermediate does not mean disposable: this export
cannot be regenerated from the repo alone and is committed.) `rig:sync` verifies it and copies it into the
consuming package's ownership: metadata into its source tree, parts into its
static asset root.

```bash
pnpm --filter @volstudio/vol-arachnid rig:sync
```

The shipped metadata's `file` fields are rewritten against the consumer's own
path (`assets/rig/<entity>/parts/<partId>.png`) and `previews` is dropped — a
preview is an authoring reference, not a runtime payload. Leftovers at the
destination are removed: an old copy of a renamed part both bloats the bundle
and misleads the next reader.

Shipping **never copies an unverified export**. A part written in metadata but
missing on disk is an error, and so is a file on disk that metadata does not
mention.

### 3. Use it in a game

```typescript
import {
  articulateRigDefinition,
  assembleRig,
  buildRigDefinition,
  preloadRigTextures,
  validateRigMetadata,
} from '@volstudio/core';
import metadataRaw from '@/assets/rig/<entity>.metadata.json';

const metadata = validateRigMetadata(metadataRaw, '<entity>.metadata.json');
const partUrls = Object.fromEntries(metadata.parts.map((part) => [part.file, part.file]));

// In Scene.preload():
const rig = articulateRigDefinition(buildRigDefinition(metadata, partUrls), ARTICULATION);
preloadRigTextures(this, rig);

// In Scene.create():
const { container, parts } = assembleRig(this, rig);
```

The details (articulation schema, pivot contract, assembly rules) live in
CORE's rig module.

## Package surface

| Function                | Job                                                                     |
| ----------------------- | ----------------------------------------------------------------------- |
| `auditRigExport`        | **Collects** the gap between metadata and disk (missing parts, orphans) |
| `verifyRigExport`       | Same audit; **throws** on any gap. The publishability gate              |
| `syncRigExport`         | Copies a verified export into the consumer's ownership                  |
| `auditShippedRig`       | Gap between shipped metadata and the static directory                   |
| `resolveRigExportPaths` | Resolves an export reference to absolute file paths                     |

`auditRigExport` deliberately does not throw, so that a broken export shows all
of its gaps in one pass. `verifyRigExport` is a gate and stops at the first
difference it sees.

## Test

```bash
pnpm --filter @volstudio/pen.dev typecheck
pnpm --filter @volstudio/pen.dev test:coverage
```

Tests run against a real temporary directory. Mocking `fs` would be wrong here:
what is being verified is exactly the gap between "what is on disk" and "what
metadata claims", and a mocked disk cannot produce that gap by definition.
