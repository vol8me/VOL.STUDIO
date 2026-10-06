# @volstudio/vol-showcase

CORE DOM UI kataloğunun canlı vitrini. Bileşen, girdi, erişilebilirlik ve
piksel sözleşmesini gerçek tarayıcıda gösterir. Phaser veya native kabuk
kurulumu gerektirmez; bileşen uygulamaları CORE'da kalır.

## Geliştirme

```bash
pnpm --filter @volstudio/vol-showcase dev
```

## Sekmeler

| Sekme           | CORE kaynağı                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------- |
| BUTTONS, TEXT   | `core/src/ui/primitives/`                                                                                     |
| FORMS           | `core/src/ui/primitives/`, `core/src/ui/layout/`, `core/src/ui/textEntry/`                                    |
| PANELS, YÜKLEME | `core/src/ui/overlays/`                                                                                       |
| HUD             | `core/src/ui/feedback/`, `core/src/ui/hud/`                                                                   |
| KARTLAR         | `core/src/ui/cards/`                                                                                          |
| WORKBENCH       | `core/src/ui/primitives/`, `core/src/ui/layout/`, `core/src/graphics/`                                        |
| PALETTE         | `core/src/ui/theme.css`                                                                                       |
| ADVANCED        | `core/src/ui/layout/`, `core/src/ui/data/`, `core/src/ui/hud/`, `core/src/ui/overlays/`                       |
| SCROLL          | `core/src/ui/layout/`                                                                                         |
| TOUCH           | `core/src/ui/touch/`, `core/src/ui/camera/`, `core/src/ui/buttons/`, `core/src/ui/hud/`, `core/src/ui/focus/` |

Kataloğa eklenen tüketicisiz CORE bileşeni aynı değişiklikte burada gösterilir
ve CORE testinde adıyla sınanır. Sekme tablosu vitrin yönlendirmesidir; canlı public envanter
[CATALOG](../../docs/ui/CATALOG.md) sahibindedir.

## Doğrulama

```bash
pnpm --filter @volstudio/vol-showcase build
pnpm --filter @volstudio/vol-showcase test:e2e
```

E2E gönderilen build'i sınar. Determinizm, yerleşim ve piksel karşılaştırması
ayrı testlerdir. `accessibility.spec.ts` axe sonucunu `tests/e2e/support/axeExceptions.json` ile,
`stateMatrix.spec.ts` katman durumlarını `tests/e2e/support/stateFixtures.json` ile eşleştirir;
`layout.spec.ts` dokunma hedefi geometrisini (saydam yerel giriş, örtüşme, kırpma, açık katmanlar)
`tests/e2e/support/geometryExceptions.json` ile, `readability.spec.ts` çizilmiş glif yüksekliğini aynı
dosyadaki `glyphHeights` ile eşleştirir; `latency.spec.ts` ve `performance.spec.ts` ölçüm raporunu
paketin git dışı records alanına yazar ve ekrana sunulan kare ölçülmedikçe PASS üretmez; kayıtlar
sahip UI görevine bağlıdır ve düzelen bulgu kaydı bayatlatıp testi düşürür. Her E2E dosyası Chromium ve WebKit'te koşar; tek istisna piksel
temelidir (yalnız Chromium) ve `e2eConfig` bekçisi bunu gerekçeli tutar. WebKit
piksel temeli bilinçli kalibrasyon olmadan kurulmaz. Piksel farkı bilinçli görsel
değişiklikte temel güncellemesiyle kabul edilir; Linux Chromium temelleri
[Windows belgesindeki](../../docs/windows.md) sınırla doğrulanmamıştır.

```bash
pnpm --filter @volstudio/vol-showcase test:e2e:update
```

Beklenmeyen farkta önce neden çözülür. Güncelleme komutunun geçmesi görünüm
beğenisi ya da insan kabulü değildir.

## Dokunma ve erişilebilirlik

`--vol-hit-target-min` yalnız pointer coarse altında değer taşır. Hedef kutu
44 px olur; yalnız geniş padding alanı ilan edilmez. CORE CSS sözleşme testi
kuralı, tarayıcı yerleşim testi seçilen çizilmiş kutuları doğrular. Saydam
native range hedefinin mevcut turda atlanması UI-00/UI-03 kapsamında
düzeltilecek bir ölçüm açığıdır. Odak, geri
yığını ve azaltılmış hareket altında temizlik örneklerin parçasıdır.

[Tasarım sözleşmesi](DESIGN.md)

[Nihai UI sözleşmesi ve fazlar](../../docs/ui/README.md) bu vitrinin
gelecekte tek VOL.SHOWCASE web/native laboratuvarına dönüşmesini tanımlar.
Paket göçü, tema/ses/metin laboratuvarları ve yeni kapılar henüz uygulanmadı.
