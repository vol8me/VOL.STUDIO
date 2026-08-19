# games/design

VOL.STUDIO'nun paylaşılan tasarım kaynağı ve export pipeline'ı: bir Pencil
canvas dosyası (`pen/entities.pen`), ondan export edilen parça/önizleme
görselleri (`pen_export/`) ve bunları bir Phaser sahnesinde birleştiren
çalışma zamanı katmanı (`@volstudio/design`, `src/`).

**Bağımsız.** `core/` ve hiçbir `games/<oyun>` paketi bu klasörün varlığını
bilmez; bağımlılık tek yönlüdür, oyunlar `@volstudio/design`'ı tüketir, tersi
olmaz. Kendi `package.json`'ı, kendi `tsconfig.json`'ı, kendi testleri
vardır — pnpm workspace'in `games/*` glob'u tarafından otomatik yakalanır,
başka hiçbir dosyada elle kayıt gerekmez.

**Sökülmeye hazır.** Bu klasör olduğu gibi kesilip başka bir yere (ayrı bir
repo, başka bir stüdyo projesi) taşınabilir: dışarıya tek bağımlılığı
`phaser`'dır, hiçbir `@volstudio/*` paketini import etmez.

## Kullanım

Tüketen oyun `@volstudio/design` alias'ını kendi `vite.config.ts` ve
`tsconfig.json`'ında tanımlar, ardından:

```typescript
import { buildRigDefinition, preloadRigTextures, assembleRig } from '@volstudio/design';
import metadata from '.../metadata/<entity>.metadata.json';

// Parça PNG'lerini bundler'ın glob'u ile topla (Vite örneği):
const partUrls = import.meta.glob('.../parts/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
});

const rig = buildRigDefinition(metadata, partUrls);

// Scene.preload() içinde:
preloadRigTextures(this, rig);

// Scene.create() içinde:
const { container, parts } = assembleRig(this, rig);
```

`buildRigDefinition` düz bir `Record<string, string>` aldığı için paket
Vite'a bağlı değildir; glob'u tüketen oyun yapar.

Bir parça `parentPartId` taşıyorsa kökün değil ÜST PARÇANIN container'ına
girer: üst parçayı döndürmek alt zinciri de döndürür (kol → önkol → el).
Metadata'daki konum ve dönüş her zaman rig kökü uzayında yazılır; montaj
bunları ebeveynin dönüşünü telafi ederek yerel uzaya çevirir. Eklem taşımayan
bir rig, eklem desteği eklenmeden önceki çıktının birebir aynısını verir.
Bu bir RENDER eklemidir; fizik/eklem kısıtı taşımaz.

İlk iş metadata'yı çalışma zamanında doğrulamaktır (`validateRigMetadata`,
ayrıca dışa açıktır): `schemaVersion`, zorunlu alanlar ve parça tipleri
kontrol edilir, sorunlar tek mesajda toplanır. TypeScript arayüzü dosyadan
okunan JSON hakkında hiçbir garanti vermez — bir agent ya da dış araç bozuk
metadata ürettiğinde hata, anlaşılmaz bir `TypeError` yerine nerede olduğunu
söyleyen bir mesaj olur.

## Export

Pencil'den PNG çıkarma iki adımlıdır: Pencil MCP `execute` ile native
`Export()` çağrılır, sonra çıktı `scripts/organize-pen-export.mjs` ile
entity düzenine taşınır ve metadata'sı yazılır. Script'in başındaki kullanım
yorumu manifest şeklini ve tüm doğrulama kurallarını belgeler.

```bash
node scripts/organize-pen-export.mjs <manifest.json> <stagingDir> [outputRoot]
```

## Test

```bash
pnpm --filter @volstudio/design typecheck
pnpm --filter @volstudio/design test:coverage
```

[English](README.en.md)
