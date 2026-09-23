# @volstudio/audio-synth

VOL.STUDIO deterministik ses asset compiler'ı.

Bu paket prosedürel ses sentezi, efekt zinciri, WAV/OGG yazma ve ses QA altyapısını taşır. Çıktı WAV/OGG'dir; tarayıcı veya oyun yalnızca üretilmiş asset'i tüketir.

Aktif bir oyun paketi bugün bu paketi tüketmiyor. Frozen `games/vol-hell` ve
`games/vol-arachnid` sesleri bu motorla üretildi; o kanıt freeze
etiketlerindedir. Çalma tarafı `core/src/audio/music/`tedir (stem çalar).

## Yapı

- `src/synthesis/`, `src/engine/`, `src/instruments/`, `src/presets/` —
  sentez çekirdeği, fiziksel modeller ve preset kataloğu
- `src/effects/` — efekt ve işleme çekirdekleri: reverb/delay/modülasyon,
  RBJ EQ, kompresör, 4× true-peak sınırlayıcı, doygunluk, konvolüsyon
- `src/program/` — kanonik `AudioBriefV1`/`AcousticProgramV1`, yapı taşı
  registry'si ve render'ı; SoundGraph yönlendirmesi (bus/send/sidechain),
  stil ve materyal profilleri, ses ontolojisi ve planlayıcı, sample
  bildirimleri, render yüzeyi kaydı
- `src/analysis/` — kanonik ölçüm çekirdeği (BS.1770, true peak, betimleyiciler,
  dikiş, transient/gövde ayrıştırması, stem hizası)
- `src/protocol/` — `AudioJobV1`, manifest, TEK publish kapısı, arama/aile/
  müzik/sample protokolleri (Node-only)
- `src/search/` — deterministik aday arama laboratuvarı
- `src/family/` — genel ses ailesi programı, rol sözlüğü ve bank sözleşmesi
- `src/music/` — müzik sözleşmesi: `MusicBriefV1`, `MusicThemeBookV1`,
  `MusicProgramV1` → `MusicScoreV1`, armoni/motif/groove, bus'lar, sembolik
  analiz, mastering yolları, stem paketi ve hiyerarşik arama
- `src/writer.ts` — WAV/OGG yazma (Node-only, FFmpeg gerekir)
- `audio-jobs/` — job durumları ve referans işler
- `audio-searches/`, `audio-families/`, `audio-music/`, `audio-themebooks/` —
  arama, aile, müzik ve müzik kitabı kayıtları; her birinde bir referans
  fixture yaşar
- `audio-samples/` — `SampleAssetV1` kayıtları (sentetik fixture'lar; WAV
  git-dışı üretilir, JSON repodadır)
- `canaries/` — sürümlü canary görevleri ve insan dinleme durumu
- `reference/production/` — referans fixture'ların yayımlanan asset'leri,
  manifest'leri, aile bank'ı ve müzik bundle'ları
- `render-surface.lock.json` — registry render yüzeyi kilidi
  (`pnpm audio:surface-lock`; aynı sürümde değişen sözleşmeyi reddeder)
- `tests/` — birim, özellik, yönetişim (`tests/governance/`) ve protokol
  testleri
- `scripts/` — `audio-job` CLI'ı ve alt komutları (`scripts/lib/`), QA
  (`audio-qa`, `audio-reference-check`), karakterizasyon (`fm-alias-report`,
  `render-budget-bench`, `resonator-bench`), sample fixture üreticisi,
  render yüzeyi kilidi, dinleme paketi ve dönüştürücü
- `export/` — yerel üretim ve dinleme çıktısı (izlenmez)

## Doktrin

- `writeOgg` FFmpeg ister.
- Aynı parametreler + aynı `seed` aynı örnekleri verir.
- Bozuk parametre ve aşırı kaynak isteği tampon ayrılmadan, adıyla reddedilir
  (`AudioParamError`, `RenderBudgetError`).
- Gönderilen ses kodek SONRASI ölçülür (BS.1770 LUFS, true peak, kanal bazlı
  kırpma; sınıf politikası).
- Runtime playback bu pakette değil, `@volstudio/core/audio/music`'te yapılır.
  Müzik asset'inin çalma sözleşmesi (`MusicAssetSpecV1`) da orada yaşar: ölçü→kare
  dönüşümü ve `toMusicTrack` tek kaynaktır, üretim ile runtime ayrışamaz.

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

İlişkili varyant setleri `family` alt komutlarıyla üretilir: her varyant
aynı akıştan yayımlanır, en son çalışma zamanının yalnız JSON ile okuyacağı
bir bank yazılır. Sözdizimi `family.commands` alanındadır.

Müzik `music` alt komutlarıyla üretilir (`plan | analyze | check | render |
publish | status | verify | list | search`): sembolik analiz ses render
etmeden koşar, stem'ler aynı publish kapısından geçer ve en son çalışma
zamanı sözleşmesini taşıyan `MusicBundleV1` yazılır. Sözdizimi
`music.commands` alanındadır.

Ses tasarımı brief'ten başlayabilir: `plan` brief'in betimleyici
sözcüklerinden mekanizma/stil/materyal planı ve render edilebilir bir
iskelet üretir (sağlayıcısı olmayan mekanizmayı `unsupported` raporlar,
taklit etmez), `graph` programın render etmeden okunan topolojisini verir,
`samples` sample kütüphanesini listeler ve doğrular. Sözdizimi
`soundDesign.planner.commands` ve `soundDesign.samples.commands`
alanlarındadır.
