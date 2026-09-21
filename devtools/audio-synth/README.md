# @volstudio/audio-synth

VOL.STUDIO deterministik ses asset compiler'ı.

Bu paket prosedürel ses sentezi, efekt zinciri, WAV/OGG yazma ve ses QA altyapısını taşır. Çıktı WAV/OGG'dir; tarayıcı veya oyun yalnızca üretilmiş asset'i tüketir.

Aktif bir oyun paketi bugün bu paketi tüketmiyor. Frozen `games/vol-hell` ve
`games/vol-arachnid` sesleri bu motorla üretildi; o kanıt freeze
etiketlerindedir. Çalma tarafı `core/src/audio/music/`tedir (stem çalar).

## Yapı

- `src/` — sentez motoru
- `src/writer.ts` — WAV/OGG yazma (Node-only, FFmpeg gerekir)
- `tests/` — motor, writer ve preset testleri
- `scripts/` — QA (`audio-qa`, `audio-reference-check`), karakterizasyon
  (`fm-alias-report`, `render-budget-bench`), demo ve dönüştürücü CLI'ları
- `export/` — yerel üretim çıktısı (izlenmez).

## Doktrin

- `writeOgg` FFmpeg ister.
- Aynı parametreler + aynı `seed` aynı örnekleri verir.
- Bozuk parametre ve aşırı kaynak isteği tampon ayrılmadan, adıyla reddedilir
  (`AudioParamError`, `RenderBudgetError`).
- Gönderilen ses kodek SONRASI ölçülür (BS.1770 LUFS, true peak, kanal bazlı
  kırpma; sınıf politikası).
- Runtime playback bu pakette değil, `@volstudio/core/audio/music`'te yapılır.

Detaylı doktrin ve sözleşme için `DESIGN.md`.
