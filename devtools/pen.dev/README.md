# pen.dev

VOL.STUDIO'nun paylaşılan tasarım kaynağı ve **export/gönderim** hattı: bir
Pencil canvas dosyası (`pen/entities.pen`), ondan export edilen parça/önizleme
görselleri (`pen_export/`) ve bu çıktıyı doğrulayıp tüketicisine gönderen araç
(`@volstudio/pen.dev`, `src/`).

**Rig'i çalışma zamanında okuyan katman burada değildir.** Metadata'yı
doğrulayan, `RigDefinition` kuran, eklemlendiren ve Phaser sahnesinde
montajlayan yüzey `@volstudio/core/rig`de yaşar — bir oyunun çalışma zamanı
asset'ini üreten araca bağlanmamalıdır (bkz. kök `AGENTS.md`, "Bozulamaz
Kurallar" 4). Bu paket üretir ve gönderir; CORE tüketir.

**Build-time bir araçtır.** Hiçbir oyunun bundle'ına girmez, Phaser'a bağımlı
değildir ve tüketen paketlerde `devDependencies` altında durur. Dışarıya tek
bağımlılığı `@volstudio/core/rig/metadata`dır (devtool → core serbesttir).

[English](README.en.md)

## Kullanım

### 1. Export'u düzenle

Pencil'den PNG çıkarma iki adımlıdır: Pencil MCP `execute` ile native
`Export()` çağrılır, sonra çıktı entity düzenine taşınır ve metadata'sı yazılır.
Script'in başındaki kullanım yorumu manifest şeklini ve tüm doğrulama
kurallarını belgeler.

```bash
node scripts/organize-pen-export.mjs <manifest.json> <stagingDir> [outputRoot]
```

### 2. Tüketiciye gönder

Üretilen çıktı `pen_export/` altında **ara çıktıdır**; oyunun build'i onu
doğrudan okumaz. (Ara çıktı olması silinebilir olduğu anlamına gelmez: bu export
repodan yeniden üretilemez ve commit'lenir.) `rig:sync` onu doğrular ve tüketen paketin sahipliğine
kopyalar: metadata onun kaynak ağacına, parçalar onun statik asset köküne.

```bash
pnpm --filter @volstudio/vol-arachnid rig:sync
```

Gönderilen metadata'nın `file` alanları tüketicinin kendi yoluna göre yeniden
yazılır (`assets/rig/<entity>/parts/<partId>.png`) ve `previews` düşürülür —
önizleme bir yazarlık referansıdır, çalışma zamanı yükü değil. Hedefte kalan
fazlalıklar silinir: yeniden adlandırılmış bir parçanın eskisi hem bundle'ı
şişirir hem bir sonraki okuyucuyu yanıltır.

Gönderim **doğrulanmamış bir export'u kopyalamaz**. Metadata'da yazılı ama
diskte olmayan bir parça da, diskte olup metadata'da geçmeyen bir dosya da
hatadır.

### 3. Oyunda kullan

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

// Scene.preload() içinde:
const rig = articulateRigDefinition(buildRigDefinition(metadata, partUrls), ARTICULATION);
preloadRigTextures(this, rig);

// Scene.create() içinde:
const { container, parts } = assembleRig(this, rig);
```

Ayrıntı (eklem şeması, pivot sözleşmesi, montaj kuralları) CORE'un rig
modülündedir.

## Paket yüzeyi

| Fonksiyon               | İş                                                                       |
| ----------------------- | ------------------------------------------------------------------------ |
| `auditRigExport`        | Metadata ile disk arasındaki farkı **toplar** (eksik parça, yetim dosya) |
| `verifyRigExport`       | Aynı denetim; fark varsa **fırlatır**. Yayımlanabilirlik kapısı          |
| `syncRigExport`         | Doğrulanmış export'u tüketicinin sahipliğine kopyalar                    |
| `auditShippedRig`       | Gönderilmiş metadata ile statik dizin arasındaki fark                    |
| `resolveRigExportPaths` | Bir export referansını mutlak dosya yollarına çevirir                    |

`auditRigExport` bilinçli olarak fırlatmaz: bozuk bir export'ta eksiklerin
tamamı tek turda görülsün diye. `verifyRigExport` ise bir kapıdır ve fark
gördüğü anda durur.

## Test

```bash
pnpm --filter @volstudio/pen.dev typecheck
pnpm --filter @volstudio/pen.dev test:coverage
```

Testler gerçek bir geçici dizinde koşar. `fs` mock'lamak burada yanlış olurdu:
doğrulanan şey tam olarak "diskte ne var, metadata ne diyor" farkıdır ve
mock'lanan bir disk o farkı tanım gereği üretemez.
