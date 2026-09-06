# @volstudio/visual-synth

VOL.STUDIO deterministik görsel asset compiler'ı.

Bu paket prosedürel raster sentezi, palet yönetimi, PNG kodlama ve belge doğrulama/QA altyapısını taşır. Çıktı PNG'dir; tarayıcı veya oyun yalnızca üretilmiş asset'i tüketir.

Kardeş paket: `@volstudio/audio-synth`.
Runtime tüketici: `games/vol-hell`, `devtools/vol-asset-studio`.

## Yapı

- `src/` — sentez motoru
- `src/encode/` — PNG yazma (Node-only)
- `tests/` — motor ve CLI testleri
- `scripts/` — asset ve QA CLI'ları
- `export/` — yerel üretim çıktısı (izlenmez).

## Doktrin

- DOM bilinmez.
- `node:fs` / `node:zlib` yalnızca `encode/` alt yolunda bulunur.
- Aynı recipe + aynı tohum aynı pikselleri verir.

Detaylı doktrin ve sözleşme için `DESIGN.md`.
