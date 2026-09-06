# pen.dev

VOL.STUDIO's design source and **export/sync** pipeline: a Pencil canvas file
(`pen/entities.pen`), the part images exported from it (`pen_export/`), and the
tool that verifies and ships that output to its consumer.

**It is a build-time tool.** It never enters a game bundle, does not depend on
Phaser, and sits under `devDependencies` in consuming packages. The layer that
reads a rig at runtime lives in `@volstudio/core/rig`, not here: this package
PRODUCES and SHIPS, CORE consumes.

[Türkçe](README.md)

## Flow

```bash
# 1. Move Pencil's staging output into entity layout and write metadata
node scripts/organize-pen-export.mjs <manifest.json> <stagingDir> [outputRoot]

# 2. Verify and ship into the consumer's ownership
pnpm --filter @volstudio/vol-arachnid rig:sync
```

`pen_export/` is an INTERMEDIATE output and no game build reads it directly —
but it is not disposable: it cannot be regenerated from the repository, so it
is committed.

Shipping **refuses an unverified export**: a part named in metadata but missing
on disk is an error, and so is a file on disk absent from metadata. Leftovers
in the target are deleted.

Runtime consumption and the articulation contract are in [DESIGN.md](DESIGN.md).

## Package surface

| Function                | Job                                                          |
| ----------------------- | ------------------------------------------------------------ |
| `auditRigExport`        | **Collects** metadata ↔ disk differences                    |
| `verifyRigExport`       | Same audit; **throws** on any difference — the publish gate  |
| `syncRigExport`         | Copies a verified export into the consumer's ownership       |
| `auditShippedRig`       | Difference between shipped metadata and the static directory |
| `resolveRigExportPaths` | Turns an export reference into absolute file paths           |

`auditRigExport` deliberately does not throw, so a broken export shows every
problem in one pass. `verifyRigExport` is a gate and stops at the first one.

## Tests

```bash
pnpm --filter @volstudio/pen.dev test:coverage
```

Tests run against a real temporary directory; mocking `fs` would be wrong here —
what is verified is exactly "what is on disk versus what metadata claims".

## License

[Apache License 2.0](../../LICENSE)
