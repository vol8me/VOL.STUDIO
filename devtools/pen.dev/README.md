# pen.dev

VOL.STUDIO'nun tasarım kaynağı ve **export/gönderim** hattı: bir Pencil canvas
dosyası (`pen/entities.pen`), ondan çıkan parça görselleri (`pen_export/`) ve
bu çıktıyı doğrulayıp tüketicisine gönderen araç.

**Build-time bir araçtır.** Hiçbir oyunun bundle'ına girmez, Phaser'a bağımlı
değildir ve tüketen paketlerde `devDependencies` altında durur. Rig'i çalışma
zamanında okuyan katman burada değil, `@volstudio/core/rig`dedir: bu paket
ÜRETİR ve GÖNDERİR, CORE tüketir.

[English](README.en.md)

## Akış

```bash
# 1. Pencil'den çıkan staging'i entity düzenine taşı ve metadata yaz
node scripts/organize-pen-export.mjs <manifest.json> <stagingDir> [outputRoot]

# 2. Doğrula ve tüketicinin sahipliğine gönder
pnpm --filter @volstudio/vol-arachnid rig:sync
```

`pen_export/` bir ARA çıktıdır ve oyunun build'i onu doğrudan okumaz — ama
silinebilir değildir: repodan yeniden üretilemez, bu yüzden commit'lenir.

Gönderim **doğrulanmamış bir export'u kopyalamaz**: metadata'da yazılı ama
diskte olmayan bir parça da, diskte olup metadata'da geçmeyen bir dosya da
hatadır. Hedefte kalan fazlalıklar silinir.

Oyunda tüketimi ve eklem şeması sözleşmesi için [DESIGN.md](DESIGN.md).

## Paket yüzeyi

| Fonksiyon               | İş                                                               |
| ----------------------- | ---------------------------------------------------------------- |
| `auditRigExport`        | Metadata ↔ disk farkını **toplar** (eksik parça, yetim dosya)   |
| `verifyRigExport`       | Aynı denetim; fark varsa **fırlatır** — yayımlanabilirlik kapısı |
| `syncRigExport`         | Doğrulanmış export'u tüketicinin sahipliğine kopyalar            |
| `auditShippedRig`       | Gönderilmiş metadata ↔ statik dizin farkı                       |
| `resolveRigExportPaths` | Export referansını mutlak dosya yollarına çevirir                |

`auditRigExport` bilinçli olarak fırlatmaz: bozuk bir export'ta eksiklerin
tamamı tek turda görülsün diye. `verifyRigExport` bir kapıdır ve ilk farkta durur.

## Test

```bash
pnpm --filter @volstudio/pen.dev test:coverage
```

Testler gerçek bir geçici dizinde koşar; `fs` mock'lamak burada yanlış olurdu —
doğrulanan şey tam olarak "diskte ne var, metadata ne diyor" farkıdır.

## Lisans

[Apache License 2.0](../../LICENSE)
