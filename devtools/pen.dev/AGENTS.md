# devtools/pen.dev Agent Anayasası

## Kimlik ve Kapsam

Bu klasör bir tasarım-kaynağı + **export/gönderim** pipeline'ıdır: kaynağı
tutar, export'u düzenler, ürettiğini DOĞRULAR ve tüketicisine GÖNDERİR.

**Rig'i çalışma zamanında okuyan katman burada DEĞİLDİR.** Metadata'yı
doğrulayan, `RigDefinition` kuran, eklemlendiren ve Phaser sahnesinde
montajlayan yüzey `@volstudio/core/rig`de yaşar. Sebep AGENTS.md Kural 4'tür:
bir oyunun çalışma zamanı, asset'ini üreten araca bağlanmaz — bağlandığında
`devtools/` oyunun gönderilen bundle'ının sözleşmesine girer. Bu paket bir
dönem o katmanı taşıyordu ve `vol-arachnid` onu `dependencies` altından import
ediyordu; sınır `pnpm quick` içindeki `workspace-contract` kapısıyla korunuyor.

Bağımlılık yönü: pen.dev → `@volstudio/core/rig/metadata` (devtool → core
serbesttir). Hiçbir oyunu ve başka bir devtool'u import etmez. Phaser'a
bağımlılığı YOKTUR; bu paket bir Node aracıdır.

```
devtools/pen.dev/
  pen/entities.pen                    kaynak (Pencil canvas)
  pen_export/<domain>/<entityId>/     üretilen ara çıktı (COMMIT'LENİR, bkz. aşağı)
  scripts/organize-pen-export.mjs     export-organize aracı
  scripts/sync-rig.ts                 tüketiciye gönderim CLI'ı
  src/rigExport.ts                    doğrulama + gönderim (@volstudio/pen.dev)
  tests/                              vitest (node ortamı, gerçek tmp dizini)
```

## Bozulamaz Kural: `.pen` Dosyasına Erişim

**`pen/entities.pen` dosyasına ASLA Read/Grep/Edit ile dokunulmaz.** Dosya bir
Pencil canvas belgesidir, elle parse edilmek üzere tasarlanmamıştır. Tek erişim
yolu Pencil MCP araçlarıdır: `get_app_state`, `get_guidelines`, `execute`. Bir
görevin başında şemaya ihtiyaç varsa önce
`get_app_state({ include_schema: true, include_canvas_design: true, include_scripts_and_shaders: false })`
çağrılır.

Doküman **canlı, çok kullanıcılı bir canvas**tır — bir önceki oturumdan
hatırlanan node id'lere güvenme, taze `Get` ile doğrula.

## İki Adımlı Export Pipeline'ı

**Adım 1 — keşif + native export (MCP `execute`, her seferinde taze).**
`Export(nodeIds, "png", stagingDir)` ile Pencil'in kendi renderer'ı kullanılır;
gradyan, image-fill, shader, rotasyon/mirror ve çok katmanlı gölgeleri doğru
işler. Bunun için elle SVG/cairo renderer yazma — bir kez denendi, native
`Export()`'un yaptığının yalnızca yaklaşıklamasıydı. Bu adım script olarak
commitlenemez; Pencil'in sandbox'lı JS'i içinde çalışır.

**Adım 2 — düzenle (`node scripts/organize-pen-export.mjs`).** `Export()` her
zaman `<nodeId>.png` yazar. Script bunları entity düzenine taşır ve metadata
üretir. Manifest şekli ve doğrulama kuralları script'in baş yorumundadır.

```bash
node scripts/organize-pen-export.mjs <manifest.json> <stagingDir> [outputRoot]
```

`pen_export/` **commit'lenir.** Ara çıktı olması onu tek başına silinebilir
yapmaz: bu çıktı repodan yeniden üretilemez — Pencil uygulamasını, canlı canvas
belgesini ve elle bir MCP `execute` adımını gerektirir. Deterministik bir
script'in ürettiği export'lar (`audio-synth`, `visual-synth`) commit'lenmez;
buradaki fark üretilebilirliktir, katman değil.

Ara çıktı olması şunu söyler: hiçbir oyun `pen_export/`u DOĞRUDAN okumaz. Oyun
kendi ağacındaki gönderilmiş kopyayı okur; ikisi arasındaki köprü `sync-rig`tir.

Script hatada **yarım çıktı bırakmaz**: tüm manifest (partId deseni, tekrar,
staging dosyasının varlığı) tek dosya kopyalanmadan doğrulanır. Çıktı kökü
repo dışına çıkamaz — metadata'daki `file` alanları repo-göreli yazılır.

## Kategoriye Göre Keşif Desenleri

Kaynak gerçeği pen dosyasıdır; aşağıdaki tablo bir anlık görüntüdür. Yeni bir
kategori export etmeden önce ilgili frame'in yapısını `Get` ile doğrula.

| Kategori                    | Export setini bulma yöntemi                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Yer birimi (yürüyen düşman) | `<Unit> Parts Export Sheet` frame'i içinde `name`'i `_export` ile biten her descendant                                         |
| Oyuncu terminal karakteri   | `<arketip>_terminal_character`'ın `type !== "text"` olan direkt çocukları                                                      |
| Turret                      | `/Ground Export$/` ve `/Rotating Head Export$/` ile eşleşen iki container — doğrudan bunlar export edilir, daha fazla bölünmez |
| Konveyör ailesi             | `role__isim` desenli descendant'lar (`ground__`, `belt__`, `vehicle__`, `gauge__`)                                             |
| Düz üretim binası           | Tek kök frame, bölünmez                                                                                                        |

Sorgu deseni (filtreyi kategoriye göre uyarla):

```js
const root = Get("<rootId>", { depth: 1 });
const parts = root.children.filter((c) => /* kategori filtresi */);
Export(parts.map((p) => p.id), "png", stagingDir);
Print(JSON.stringify(parts.map((p) => ({
  id: p.id, name: p.name, type: p.type,
  width: p.width, height: p.height,
  x: p.x, y: p.y, rotation: p.rotation || 0,
}))));
```

Export sheet'lerinde parçalar iç içedir (`row > cells > cell > *_export`), bu
yüzden `{depth:1}` yerine visitor kullan:

```js
const parts = [];
Get('<sheetId>', (n) => {
  if (n.name?.endsWith('_export')) {
    parts.push({ id: n.id, name: n.name, type: n.type, width: n.width, height: n.height });
  }
});
```

**Pozisyon toplama:** rig montajı `x`/`y`/`rotation` ister. Export sheet'teki
hücre pozisyonu gerçek rig yerleşimi DEĞİLDİR — o veri assemble edilmiş
kartın kendisinden okunmalıdır (gerekirse `resolveInstances: true`). Oyuncu
terminal karakterlerinde direkt çocukların kendi `x`/`y`'si zaten doğrudur.

## Export Kanvas Padding Sözleşmesi

Native `Export()` kanvası gölge/blur kapsamına göre pad'ler: texture'ın piksel
boyutu `exportScale × logicalSizePx`'ten **büyüktür** ve padding şeklin bbox
merkezine göre simetriktir (ölçülerek doğrulandı). Bu yüzden CORE'un
`assembleRig`i
sprite'ı `logicalSizePx`'in yarısında ortalar ve `1/exportScale` ile ölçekler.
`setDisplaySize(logicalSizePx)` kullanmak padding'i de kutuya sıkıştırıp
görüntüyü küçültür. Raster boyutunun `exportScale × logicalSizePx`'e eşit
olacağını varsayma.

## `@volstudio/pen.dev` Paketi (`src/rigExport.ts`)

Paketin işi tek cümlede: **ürettiğini doğrula, sonra sahibine ver.**

- `auditRigExport` — metadata ile disk arasındaki farkı TOPLAR (eksik parça,
  yetim dosya). Fırlatmaz; bozuk bir export'ta eksiklerin tamamı bir kerede
  görülsün diye.
- `verifyRigExport` — aynı denetim, ama fark varsa fırlatır. Yayımlanabilirlik
  kapısıdır. **Yetim dosya da hatadır**: silinmiş bir parça diskte kalırsa bir
  sonraki okuyucu onu meşru sanar.
- `syncRigExport` — doğrulanmış export'u tüketicinin sahipliğine kopyalar:
  metadata onun kaynak ağacına, parçalar onun statik asset köküne. Yazılan
  metadata'nın `file` alanları tüketicinin KENDİ yoluna göre yeniden yazılır ve
  `previews` düşürülür (önizleme bir yazarlık referansıdır, çalışma zamanı yükü
  değil). Hedefteki fazlalıklar silinir.
- `auditShippedRig` — gönderilmiş metadata ile statik dizin arasındaki fark.
  Tüketici tarafında koşar; `import.meta.glob`un bıraktığı derleme zamanı
  garantisinin karşılığıdır.

Metadata şeması, doğrulayıcı ve montaj `@volstudio/core/rig`dedir. Buradaki kod
onları TÜKETİR — üretilen verinin sözleşmesini yazan taraf CORE'dur.

### Yeni bir rig eklemek

1. MCP `execute` ile kategori desenine göre parçaları keşfet ve native
   `Export()` ile staging'e bas.
2. `organize-pen-export.mjs`'e `x`/`y`/`rotation`/`rootSizePx` içeren manifest
   ver — bunlar olmadan `positionPx: null` yazılır ve rig montajlanamaz.
   Eklemli bir parça için `parent` alanı verilir; ebeveyn manifestte o
   parçadan ÖNCE tanımlanmalıdır (script ileri referansı ve döngüyü reddeder).
   Bu bir RENDER eklemidir — eklem limiti, kütle, kısıt taşımaz; fizik rig'i
   ayrı bir aşamadır.
3. Tüketen pakete bir `rig:sync` script'i ekle ve çalıştır:

```bash
tsx ../../devtools/pen.dev/scripts/sync-rig.ts <domain> <entityId> \
  src/assets/rig/<entityId>.metadata.json \
  public/assets/rig/<entityId>/parts \
  assets/rig/<entityId>/parts
```

4. Tüketen oyunda metadata'yı `validateRigMetadata`den geçirip
   `buildRigDefinition`a bağla — ikisi de `@volstudio/core`dan gelir.

## Build ve Test

```bash
pnpm --filter @volstudio/pen.dev typecheck
pnpm --filter @volstudio/pen.dev test:coverage
```

Bu paket bir Node aracıdır: kendi `vite.config.ts`'i yoktur, bundle'lanmaz ve
hiçbir oyunun çalışma zamanına girmez. Testleri gerçek bir geçici dizinde koşar
— doğrulanan şey tam olarak "diskte ne var, metadata ne diyor" farkıdır ve
mock'lanan bir disk o farkı tanım gereği üretemez.

## Kapsam Dışı (Bilinçli)

- **Rig animasyonu** bu pakette yoktur ve sıfırdan kurulacaktır. Eski
  girişimin kalıntısı bırakılmamıştır; yeni sistem kurulurken mevcut montaj
  API'si (pivot container'ları) üzerine inşa edilir.
- **Binalar** henüz bu sisteme bağlanmadı.
