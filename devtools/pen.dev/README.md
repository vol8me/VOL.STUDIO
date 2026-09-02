# pen.dev

VOL.STUDIO'nun paylaşılan tasarım kaynağı ve export pipeline'ı: bir Pencil
canvas dosyası (`pen/entities.pen`), ondan export edilen parça/önizleme
görselleri (`pen_export/`) ve bunları bir Phaser sahnesinde birleştiren
çalışma zamanı katmanı (`@volstudio/pen.dev`, `src/`).

**Bağımsız.** `core/` ve hiçbir `games/<oyun>` paketi bu klasörün varlığını
bilmez; bağımlılık tek yönlüdür, oyunlar `@volstudio/pen.dev`'ı tüketir, tersi
olmaz. Kendi `package.json`'ı, kendi `tsconfig.json`'ı, kendi testleri
vardır — pnpm workspace'in `devtools/*` glob'u tarafından otomatik yakalanır,
başka hiçbir dosyada elle kayıt gerekmez.

**Sökülmeye hazır.** Bu klasör olduğu gibi kesilip başka bir yere (ayrı bir
repo, başka bir stüdyo projesi) taşınabilir: dışarıya tek bağımlılığı
`phaser`'dır, hiçbir `@volstudio/*` paketini import etmez.

## Kullanım

Tüketen oyun `@volstudio/pen.dev` alias'ını kendi `vite.config.ts` ve
`tsconfig.json`'ında tanımlar, ardından:

```typescript
import { buildRigDefinition, preloadRigTextures, assembleRig } from '@volstudio/pen.dev';
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

### Yayımlanmış düz bir export'a eklem eklemek

Eklem bilgisinin ASIL yeri export manifestidir (`parent` alanı). Ne var ki
yayımlanmış düz bir export'u yeniden üretmek her zaman mümkün değildir
(kaynak staging çıktısı tüketilip silinmiştir) ve eklemsiz bir zincirde yalnız
uçlar sürülebilir: ara kemikler kardeş kalır, sürülen parça dönerken onlar
export pozunda donar ve uzuv kopuk görünür.

`articulateRigDefinition` şemayı TÜKETİCİ tarafında bildirmeye izin verir:

```typescript
import { articulateRigDefinition, buildRigDefinition } from '@volstudio/pen.dev';

const rig = articulateRigDefinition(buildRigDefinition(metadata, partUrls), {
  leg_r0_femur: 'leg_r0_coxa',
  leg_r0_tibia: 'leg_r0_femur',
});
```

Dönen tanımda parçalar topolojik sıradadır (ebeveyn her zaman çocuktan önce),
aynı ebeveynin çocuklarında kaynak çizim sırası korunur. Bilinmeyen parça,
kendine bağlanma ve döngü reddedilir. Metadata dosyasına DOKUNULMAZ, yani bir
sonraki export bu kararı ezmez; manifeste `parent` eklenip export yeniden
üretildiğinde şema gereksizleşir.

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
pnpm --filter @volstudio/pen.dev typecheck
pnpm --filter @volstudio/pen.dev test:coverage
```

[English](README.en.md)
