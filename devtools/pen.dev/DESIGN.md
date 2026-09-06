# pen.dev — tasarım kararları

Nasıl çalıştırılacağı [README](README.md)'dedir.

## Oyunda tüketim

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

// Scene.preload()
const rig = articulateRigDefinition(buildRigDefinition(metadata, partUrls), ARTICULATION);
preloadRigTextures(this, rig);

// Scene.create()
const { container, parts } = assembleRig(this, rig);
```

Eklem şeması, pivot sözleşmesi ve montaj kuralları CORE'un rig modülündedir.

## Gönderimde yol yeniden yazımı

Gönderilen metadata'nın `file` alanları tüketicinin kendi yoluna göre yeniden
yazılır (`assets/rig/<entity>/parts/<partId>.png`) ve `previews` DÜŞÜRÜLÜR:
önizleme bir yazarlık referansıdır, çalışma zamanı yükü değil.

Yeniden adlandırılmış bir parçanın eskisi hedefte kalırsa hem bundle'ı şişirir
hem bir sonraki okuyucuyu yanıltır; bu yüzden fazlalıklar silinir.

## Katman sınırı

Rig'in çalışma zamanı yüzeyi (`validateRigMetadata`, `buildRigDefinition`,
`assembleRig`) CORE'dadır, burada değil. Bir oyunun çalışma zamanı asset'ini
ÜRETEN araca bağlanmamalıdır — sınır PAKET değil ZAMANDIR.

## Export manifest sözleşmesi

`scripts/organize-pen-export.mjs` ham `Export()` çıktısını
(`<nodeId>.png`) entity düzenine taşır ve metadata yazar:

```
pen_export/<domain>/<entityId>/{parts,previews}/<partId>.png
pen_export/<domain>/<entityId>/metadata/<entityId>.metadata.json
```

```json
{
  "entityId": "arachnid",
  "domain": "enemies",
  "sourcePenFile": "devtools/pen.dev/pen/entities.pen",
  "sourceSheetNodeId": "bBlFU",
  "exportScale": 2,
  "rootSizePx": { "width": 224, "height": 268.8 },
  "parts": [
    { "id": "PqKhX", "partId": "top_cap", "type": "rectangle", "width": 16, "height": 10 },
    { "id": "QrLmY", "partId": "barrel", "parent": "top_cap", "width": 24, "height": 6 }
  ],
  "previews": [{ "id": "mjtTL", "partId": "reference_card", "width": 520, "height": 520 }]
}
```

**`parent` bir RENDER eklemidir.** Verilirse parça o `partId`nin altına bağlanır
ve üst parça döndüğünde birlikte döner (kol → önkol → el); ebeveyn manifestte
bu parçadan ÖNCE tanımlanmalıdır. Eklem limiti, kütle ya da kısıt taşımaz.

**`x`/`y`/`rotation` opsiyoneldir.** Bir export sheet'in hücre düzeninden gelen
konum gerçek rig yerleşimi DEĞİLDİR; o durumda atlanır ve metadata'ya
`positionPx: null` yazılır. Verildiğinde `x`/`y` parçanın rig kökünün yerel
uzayındaki sol-üst köşesi, `rotation` aynı köşe etrafında CCW derecedir.

Bu script Pencil ile konuşmaz; yalnız dosya taşır ve JSON üretir. Export sheet
düğümlerini bulup native `Export()` çağırma adımı MCP `execute` üzerinden ayrı
yapılır ve buranın tükettiği staging dizinini üretir.
