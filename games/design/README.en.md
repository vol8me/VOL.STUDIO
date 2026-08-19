# games/design

VOL.STUDIO's shared design source and export pipeline: a Pencil canvas file
(`pen/entities.pen`), the part/preview images exported from it
(`pen_export/`), and a runtime layer that assembles them into a Phaser scene
(`@volstudio/design`, `src/`).

**Self-contained.** Neither `core/` nor any `games/<game>` package knows this
folder exists; the dependency is one-directional — games consume
`@volstudio/design`, never the other way around. It has its own
`package.json`, its own `tsconfig.json`, its own tests — picked up
automatically by the pnpm workspace's `games/*` glob, no manual registration
anywhere else.

**Ready to be detached.** This folder can be cut out as-is and moved
elsewhere (a separate repo, another studio project): its only outside
dependency is `phaser`, it imports no `@volstudio/*` package.

## Usage

The consuming game defines the `@volstudio/design` alias in its own
`vite.config.ts` and `tsconfig.json`, then:

```typescript
import { buildRigDefinition, preloadRigTextures, assembleRig } from '@volstudio/design';
import metadata from '.../metadata/<entity>.metadata.json';

// Collect part PNGs with the bundler's glob (Vite example):
const partUrls = import.meta.glob('.../parts/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
});

const rig = buildRigDefinition(metadata, partUrls);

// In Scene.preload():
preloadRigTextures(this, rig);

// In Scene.create():
const { container, parts } = assembleRig(this, rig);
```

`buildRigDefinition` takes a plain `Record<string, string>`, so the package
itself does not depend on Vite; the consuming game performs the glob.

A part carrying `parentPartId` is attached to its PARENT's container rather
than the root: rotating the parent rotates the whole chain (arm → forearm →
hand). Position and rotation in metadata are always authored in rig-root space;
assembly converts them into local space, compensating for the parent's
rotation. A rig without joints produces byte-identical output to before joint
support existed. This is a RENDER joint; it carries no physics constraints.

Its first step is to validate the metadata at runtime (`validateRigMetadata`,
also exported): `schemaVersion`, required fields and part types are checked,
and all problems are collected into a single message. The TypeScript interface
guarantees nothing about JSON read from disk — when an agent or an external
tool emits broken metadata, the failure is a message that says where the
problem is, not an opaque `TypeError`.

## Export

Getting PNGs out of Pencil is a two-step flow: the native `Export()` is
called through the Pencil MCP `execute` tool, then the output is moved into
the per-entity layout and given its metadata by
`scripts/organize-pen-export.mjs`. The usage comment at the top of that
script documents the manifest shape and every validation rule.

```bash
node scripts/organize-pen-export.mjs <manifest.json> <stagingDir> [outputRoot]
```

## Testing

```bash
pnpm --filter @volstudio/design typecheck
pnpm --filter @volstudio/design test:coverage
```

[Türkçe](README.md)
