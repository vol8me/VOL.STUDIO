# @volstudio/vol-ui

`core/src/ui` altındaki DOM UI kütüphanesinin canlı showcase'i. Saf DOM üzerinde
çalışır; Tauri ya da Phaser oyun döngüsü gerekmez.

```bash
pnpm --filter @volstudio/vol-ui dev     # :5174
```

## Sekmeler

| Sekme                | `core/src/ui/`                          |
| -------------------- | --------------------------------------- |
| BUTTONS, TEXT, FORMS | `primitives/`                           |
| PANELS, YÜKLEME      | `overlays/`                             |
| HUD                  | `feedback/`, `hud/`                     |
| KARTLAR              | `cards/`                                |
| WORKBENCH            | `primitives/`, `layout/`, `quality/`    |
| PALETTE              | `theme.css`                             |
| ADVANCED             | `layout/`, `data/`, `hud/`, `overlays/` |
| SCROLL               | `layout/`                               |
| TOUCH                | `controls/`, `hud/`                     |

## Görsel sözleşme kapısı

```bash
pnpm --filter @volstudio/vol-ui build      # kapı GÖNDERİLEN çıktıyı sınar
pnpm --filter @volstudio/vol-ui test:e2e
```

Üç katman, üç ayrı soru:

| Dosya                 | Soru                                                  |
| --------------------- | ----------------------------------------------------- |
| `determinism.spec.ts` | Kapı güvenilir mi? Rastgelelik ve saat donduruldu mu? |
| `layout.spec.ts`      | Yerleşim doğru mu? Taşma, dokunma hedefi, ezilme.     |
| `visual.spec.ts`      | Görünüm değişti mi? Sekme başına piksel temeli.       |

Karşılaştırma SIFIR toleransladır; bunu mümkün kılan şey `determinism.spec.ts`in
on iki sekmenin ayrı yüklemelerde birebir aynı çizildiğini ÖLÇMESİDİR.

Beklenen bir görsel değişiklikten sonra temeller bilinçli yenilenir:

```bash
pnpm --filter @volstudio/vol-ui test:e2e:update
```

Fark beklenmiyorsa güncellemeden ÖNCE sebebi aranır — kapının değeri tam olarak
o anda ortaya çıkar.

## Dokunmatik hedef politikası

`--vol-hit-target-min` token'ı yalnız `pointer: coarse` altında değer taşır:
masaüstünde hiçbir bileşen değişmez, dokunmatikte kutular gerçekten 44px olur.
`core/tests/ui/hitTargetSync.test.ts` kuralın CSS'te VAR olduğunu doğrular;
kutunun gerçekten o boyutta ÇİZİLDİĞİNİ tarayıcı kapısı doğrular.

## Lisans

[Apache License 2.0](../../LICENSE)
