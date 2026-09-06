# VOL.ARACHNID

Eklemli bir örümcek rig'inin ters kinematikle sürüldüğü, sabit arenalı hareket
deneyi. Oyun döngüsü yoktur: uzuv çözümü, yürüyüş, ağırlık hissi ve sunum
efektlerinin (iz, gölge, toz) çalışıldığı yüzeydir.

Phaser 4 · TypeScript · Vite · `@volstudio/core`. `@volstudio/pen.dev` yalnız
BUILD-TIME bir araçtır (`rig:sync`); çalışma zamanı ona bağlı değildir.

Monorepo geneli için [kök README](../../README.md).

## Çalıştırma

```bash
pnpm --filter @volstudio/vol-arachnid dev     # :5178
pnpm build:arachnid                            # web üretim derlemesi
```

Android ve masaüstü paketleri için [docs/android.md](../../docs/android.md);
tüm tarifler `pnpm exec just --list`.

## Kontroller

| Girdi   | Etki                                 |
| ------- | ------------------------------------ |
| `WASD`  | Hareket (ivmeli, dönüş hızı tavanlı) |
| `Space` | Atılım                               |
| `F11`   | Tam ekran                            |

Dokunmatikte hareket çubuğu yalnız sol-alt başparmak bölgesinde doğar; sağ-alt
düğme atılımdır. Ekranın sağ tarafı görünmez joystick DEĞİLDİR. Android geri
hareketi oyunu kapatmaz, çıkış onayını açar.

Grafik profili sabit YÜKSEK'tir; kalite ayarı sunulmaz.

## Yapı

```
src/config/    Ölçüler ve denge — VERİ. Runtime'da sihirli sayı yoktur.
src/runtime/   Çalışan sistemler.
src/app/       Boot (i18n, font, Phaser).
src-tauri/     Bu pakete ait native kabuk.
```

Dosya dosya sorumluluk dağılımı, uzuv çözümü, Pencil export hattı ve denge
modeli için [DESIGN.md](DESIGN.md).

## Lisans

[Apache License 2.0](../../LICENSE)
