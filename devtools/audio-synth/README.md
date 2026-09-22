# @volstudio/audio-synth

VOL.STUDIO deterministik ses asset compiler'ı.

Bu paket prosedürel ses sentezi, efekt zinciri, WAV/OGG yazma ve ses QA altyapısını taşır. Çıktı WAV/OGG'dir; tarayıcı veya oyun yalnızca üretilmiş asset'i tüketir.

Aktif bir oyun paketi bugün bu paketi tüketmiyor. Frozen `games/vol-hell` ve
`games/vol-arachnid` sesleri bu motorla üretildi; o kanıt freeze
etiketlerindedir. Çalma tarafı `core/src/audio/music/`tedir (stem çalar).

## Yapı

- `src/` — sentez motoru
- `src/program/` — kanonik `AudioBriefV1`/`AcousticProgramV1`, registry, program render'ı,
  organik yapı taşları ve archetype genişletmesi
- `src/protocol/` — `AudioJobV1`, manifest ve TEK publish kapısı (Node-only)
- `src/search/` — deterministik aday arama laboratuvarı (spec, strateji, plan, rapor, arama seçimi)
- `src/writer.ts` — WAV/OGG yazma (Node-only, FFmpeg gerekir)
- `audio-jobs/` — job durumları; `platform-reference` üretim-referans işidir
- `audio-searches/` — arama kayıtları; `reference-shell` referans aramasıdır
- `canaries/` — organik canary görevleri ve insan dinleme durumu
- `reference/production/` — referans fixture'ın yayımlanan asset'i ve manifest'i
- `tests/` — motor, writer ve preset testleri
- `scripts/` — QA (`audio-qa`, `audio-reference-check`), karakterizasyon
  (`fm-alias-report`, `render-budget-bench`, `resonator-bench`), dinleme paketi
  (`archetype-audition`), demo ve dönüştürücü CLI'ları
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

## Agent protokolü

Bu bölüm bilerek incedir: yapı taşı, parametre, aralık, politika ya da
sınırlama burada LİSTELENMEZ. Hepsi çalışan koddan üretilir:

```sh
pnpm --filter @volstudio/audio-synth audio:job context --json
```

Akış `context → brief → program → render → analyze → select → publish`tir;
her adımın sözdizimi context çıktısındaki `protocol.commands` alanında, işin
bulunduğu yer ve sonraki geçerli adım `audio:job status <jobId> --json`
çıktısındaki `next` alanındadır. Yayımlanmış bir asset
`audio:job verify <manifest>` ile yalnız manifest'inden doğrulanır.

Tek bir değer tahmin etmek yerine aralık aramak için `search` alt komutları
vardır (spec → plan → run → audition/decide → promote); onaylı aday job
programına terfi eder ve aynı akıştan yayımlanır. Sözdizimi context
çıktısındaki `search.commands` alanındadır.
