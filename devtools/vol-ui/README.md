# @volstudio/vol-ui

CORE DOM UI kataloğunun canlı vitrini. Bileşen, girdi, erişilebilirlik ve
piksel sözleşmesini gerçek tarayıcıda gösterir. Phaser veya native kabuk
kurulumu gerektirmez; bileşen uygulamaları CORE'da kalır.

## Geliştirme

```bash
pnpm --filter @volstudio/vol-ui dev
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
ve CORE testinde adıyla sınanır. Sekme tablosu katalog envanteridir.

## Doğrulama

```bash
pnpm --filter @volstudio/vol-ui build
pnpm --filter @volstudio/vol-ui test:e2e
```

E2E gönderilen build'i sınar. Determinizm, yerleşim ve piksel karşılaştırması
ayrı testlerdir. Chromium ve WebKit çalışır; piksel farkı bilinçli görsel
değişiklikte temel güncellemesiyle kabul edilir.

```bash
pnpm --filter @volstudio/vol-ui test:e2e:update
```

Beklenmeyen farkta önce neden çözülür. Güncelleme komutunun geçmesi görünüm
beğenisi ya da insan kabulü değildir.

## Dokunma ve erişilebilirlik

`--vol-hit-target-min` yalnız pointer coarse altında değer taşır. Hedef kutu
44 px olur; yalnız geniş padding alanı ilan edilmez. CORE CSS sözleşme testi
kuralı, tarayıcı yerleşim testi gerçek çizilen kutuyu doğrular. Odak, geri
yığını ve azaltılmış hareket altında temizlik örneklerin parçasıdır.

[Tasarım sözleşmesi](DESIGN.md)
