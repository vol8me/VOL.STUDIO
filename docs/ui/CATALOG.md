# CORE UI yüzeyi

Bu belge katalogda nasıl gezinileceğini ve bir bileşenin nasıl ekleneceğini
anlatır. Canlı export/tier/tüketici/durum/test verisi
[registry](../../devtools/vol-showcase/src/catalog/registry.json) sahibindedir;
ayrı elle export veya test defteri tutulmaz. [Sözleşme](CONTRACT.md) davranışı,
[doğrulama](VERIFICATION.md) kabul yöntemini, [TODO](TODO.md) kalan işleri tutar.

## Tek yüzey kaydı

[scripts/quality/uiRegistry.mjs](../../scripts/quality/uiRegistry.mjs), public
UI sınıf/yardımcılarını TypeScript AST'den, doğrudan oyun tüketimini gerçek
importlardan çıkarır. Registry bunlarla birebir eşleşir. Type-only yüzey
[public tip kilidiyle](../../scripts/quality/coreTypeSurface.snapshot.json) korunur;
bir tipe sahte runtime widget üretilmez.

```bash
node scripts/quality/cli/ui-registry.mjs --check
node scripts/quality/cli/ui-registry.mjs --summary
node scripts/quality/cli/ui-registry.mjs --states UI-03 UI-04 UI-05 UI-08 UI-09 UI-10 UI-11 UI-12 UI-13
node scripts/quality/cli/ui-registry.mjs --suggest Button
```

Sayılar ve boşluklar komuttan türetilir; belgeye elle kopyalanmaz. İsim geçmesi
assertion değildir: bağlı test tanımlayıcıyı kullanır ve beklenen davranışı sınar.
Uygulanabilir durum gerçek test bağı taşır; N/A kaynak gerekçeli olur.

## Aile haritası

| Aile                          | Kaynak                                      | Vitrin                   |
| ----------------------------- | ------------------------------------------- | ------------------------ |
| Kök, malzeme, hareket ve odak | core/src/ui/layout, material, motion, focus | bütün sekmeler           |
| Düğme ve niyet                | core/src/ui/buttons, feedback               | temel kontroller         |
| Kart ve picker                | core/src/ui/cards                           | kartlar                  |
| Değer ve seçim                | core/src/ui/primitives                      | formlar, çalışma tezgâhı |
| Panel, ayar ve sanallaştırma  | core/src/ui/layout                          | formlar, düzen           |
| Katman, menü ve diyalog       | core/src/ui/overlays                        | paneller                 |
| HUD, veri ve gösterge         | core/src/ui/hud, data, feedback             | HUD, tablolar            |
| Dokunma, kamera ve jest       | core/src/ui/touch, camera                   | dokunma                  |
| Metin, yerel sağlayıcı ve OSK | core/src/ui/textEntry                       | metin laboratuvarı       |
| Tema, glif, ikon ve imleç     | core/src/ui/themes, glyphs, icons, cursors  | tema, palet              |

Tam dosya yolu ve vitrin bağlantısı registry'den gelir. Sınıfın tek başına
çizilmediği bilinçli istisnalar [katalog bekçisinde](../../scripts/quality/catalog.mjs)
gerekçelidir. ToolButton Toolbar, Glyph createGlyph üzerinden gösterilir;
UIRoot/MotionController görsel varyant yerine kaynak/girdi davranışıyla sınanır.

## Tier ve ekleme sözleşmesi

Tier-1 aktif oyun tüketimindeki veya ortak temel olarak seçilmiş bileşendir;
tier-2 bilinçli katalogdur. Yeni üretim tüketimi aynı commit'te tier/durum
bağını günceller. Gizli veya görünmez mekanizmaya sahte hover/loading durumu eklenmez.

Yeni public öğe için kaynak, mirrored test, vitrin, registry, i18n paritesi
ve public tip kilidi birlikte güncellenir. Durum eksenleri normal, hover,
press, focusVisible, disabled, loading, error, empty, keyboard, gamepad,
touch, reducedMotion, long30 ve digits6'dır. Test başlığı/veri yolu somut
assertion'a gider; gap yalnız sahibi açık TODO olan kalan işe verilir.

Anchor kodları özgün tasarım gerekçesidir; başka üründen asset kopyalama
izni veya teknik kabul değildir. Bütün aileler aynı malzeme, semantik olay,
ses ve kaynak ömrü sözleşmesini tüketir.
