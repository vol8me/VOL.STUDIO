# @volstudio/audio-synth

VOL.STUDIO deterministik ses asset compiler'ı.

Bu paket prosedürel ses sentezi, efekt zinciri, WAV/OGG yazma ve ses QA altyapısını taşır. Çıktı WAV/OGG'dir; tarayıcı veya oyun yalnızca üretilmiş asset'i tüketir.

Kardeş paket: `@volstudio/visual-synth`.
Runtime tüketici: `games/vol-hell` (`public/assets/audio`), `core/src/audio/music/` (stem çalar).

## Yapı

- `src/` — sentez motoru
- `src/writer.ts` — WAV/OGG yazma (Node-only, FFmpeg gerekir)
- `tests/` — motor, writer ve preset testleri
- `scripts/` — QA ve dönüştürücü CLI'ları
- `export/` — yerel üretim çıktısı (izlenmez).

## Doktrin

- `writeOgg` FFmpeg ister.
- Aynı parametreler + aynı `seed` aynı örnekleri verir.
- Runtime playback bu pakette değil, `@volstudio/core/audio/music`'te yapılır.

Detaylı doktrin ve sözleşme için `DESIGN.md`.
