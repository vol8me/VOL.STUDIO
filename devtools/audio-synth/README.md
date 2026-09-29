# @volstudio/audio-synth

VOL.STUDIO deterministik ses asset compiler'ı.

Bu paket prosedürel ses sentezi, efekt zinciri, WAV/OGG yazma ve ses QA altyapısını taşır. Çıktı WAV/OGG'dir; tarayıcı veya oyun yalnızca üretilmiş asset'i tüketir.

Çalma tarafı `core/src/audio/music/`tedir (stem çalar).

## Yapı

- `src/synthesis/`, `src/engine/`, `src/instruments/`, `src/presets/` —
  sentez çekirdeği (retro araç seti dahil), fiziksel modeller, parametrik
  davul modelleri ve preset kataloğu
- `src/effects/` — efekt ve işleme çekirdekleri: reverb/delay/modülasyon,
  RBJ EQ, kompresör, 4× true-peak sınırlayıcı, doygunluk, konvolüsyon,
  ISO 9613-1 hava soğurması ve orta/yan genişlik
- `src/program/` — kanonik `AudioBriefV1`/`AcousticProgramV1`, yapı taşı
  registry'si ve render'ı; SoundGraph yönlendirmesi (bus/send/sidechain),
  stil ve materyal profilleri, ses ontolojisi ve planlayıcı, sample
  bildirimleri, render yüzeyi kaydı, kısa gerçek preset kökeni
  (`source.instrument@1/@2`); teslim işleme katmanı (`treatment`) ve
  teslim profilleri (uzaklık, engel, ortam, cihaz)
- `src/analysis/` — kanonik ölçüm çekirdeği (BS.1770, true peak, betimleyiciler,
  dikiş, transient/gövde ayrıştırması, stem hizası, stereo görüntü ve
  yerleşim, kodek sonrası sadakat ve opt-in tam süreli spektral karakter
  sınırları, teslim yön ölçüleri, tını zarfı ve durum iddiaları)
- `src/protocol/` — `AudioJobV1`, manifest, TEK publish kapısı, arama/aile/
  müzik/sample protokolleri, kodlama profili ve teslim varyantı türetme
  (Node-only)
- `src/search/` — deterministik aday arama laboratuvarı
- `src/family/` — genel ses ailesi programı, rol ve oyun durumu sözlüğü, bank
  sözleşmesi
- `src/music/` — müzik sözleşmesi: `MusicBriefV1`, `MusicThemeBookV1`,
  `MusicProgramV1` → `MusicScoreV1`, `InstrumentDefinitionV1` (preset,
  sampler, davul kiti, retro, katman), artikülasyon ve velocity, orkestrasyon
  paletleri, tracker desenleri, ayar, armoni/motif/groove, bus'lar, sembolik
  analiz, mastering yolları, stem paketi, bundle segmentleri (giriş, loop,
  bitiş, stinger, geçiş) ve hiyerarşik arama
- `src/writer.ts` — WAV/OGG yazma (Node-only, FFmpeg gerekir)
- `audio-jobs/` — job durumları ve referans işler
- `audio-searches/`, `audio-families/`, `audio-music/`, `audio-themebooks/` —
  arama, aile, müzik ve müzik kitabı kayıtları; her birinde bir referans
  fixture yaşar
- `audio-fits/` — referans-uydurma (inverse synthesis) deney kayıtları:
  `audio:job fit run --file <spec>` | `fit show|list`; hedef betimleyici
  vektörüne deterministik zoom taraması, araştırma kanıtıdır (production
  kaydı değil)
- `audio-samples/` — `SampleAssetV1` kayıtları (sentetik fixture'lar; WAV
  git-dışı üretilir, JSON repodadır)
- `canaries/` — sürümlü canary görevleri ve insan dinleme durumu
- `benchmarks/` — 14 yetenek görevi (canary'nin kardeş şeması; parça,
  kategori, kodek/QA kriterleri ve dinleme rehberi): `audio:job benchmark
list|run [--audition] [--json]|review` — 19 canary + görevler tek raporda
- `audio:capabilities` — ontoloji mekanizmalarının kanıtlanmış kalite
  matrisi (`QualityMatrixV1`): seviye görev/canary kaydından türetilir,
  "primitive mevcut" sayılmaz; `production-ready` üç koşul ister — geçen
  görev + kategoriyi kapsayan doğrulanmış yayımlanmış manifest + güncel
  görev sürümünde insan `heard-acceptable`. `benchmarked` yalnız mekanik
  geçiştir; dinleme durumu ayrı sütundadır
- `audio:job regression run|decide|corpus|decisions` — estetik regresyon
  hafızası: bütün production manifest'lerini güncel motorla yeniden render
  eder; PCM değişen satır `audition-required` olur (otomatik gerileme
  sayılmaz), betimleyici farkı yayımlanmış asset çözümüyle ölçülür; insan
  kararı `regression/decisions.json`'a o PCM hash'ine bağlı yazılır
- `reference/production/` — referans fixture'ların yayımlanan asset'leri,
  manifest'leri, aile bank'ı ve müzik bundle'ları
- `render-surface.lock.json` — registry render yüzeyi kilidi
  (`pnpm audio:surface-lock`; aynı sürümde değişen sözleşmeyi reddeder)
- `encode-profiles.lock.json` — sınıf bazlı kodlama profilinin ölçülmüş taban
  çizgisi (`pnpm audio:encode-baseline`; tablo ölçümden ayrışırsa yazılmaz)
- `tests/` — birim, özellik, yönetişim (`tests/governance/`) ve protokol
  testleri
- `scripts/` — `audio-job` CLI'ı ve alt komutları (`scripts/lib/`), QA
  (`audio-qa`, `audio-reference-check`), ölçüm (`render-budget-bench`,
  `resonator-bench`), sample fixture üreticisi,
  render yüzeyi kilidi, kodlama taban çizgisi ve dinleme paketi
- `scripts/research/` — pakete bağlanmamış karakterizasyon ve mutasyon
  betikleri (`pnpm exec tsx scripts/research/<ad>.ts`); ölçüm sonuçları
  `DESIGN.md`dedir
- `export/` — yerel üretim ve dinleme çıktısı (izlenmez)

## Doktrin

- `writeOgg` FFmpeg ister.
- Aynı parametreler + aynı `seed` aynı örnekleri verir.
- Bozuk parametre ve aşırı kaynak isteği tampon ayrılmadan, adıyla reddedilir
  (`AudioParamError`, `RenderBudgetError`).
- Gönderilen ses kodek SONRASI ölçülür (BS.1770 LUFS, true peak, kanal bazlı
  kırpma; sınıf politikası, kanal/yerleşim ve mono uyumu). Vorbis kalitesi
  asset sınıfının ölçülmüş profilinden gelir.
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

Yineleme hızı için `render --draft` (ve `music check|render`, `family check`
için aynı bayrak) aynı programı daha düşük iç aşırı örneklemeyle işler;
publish yalnız nihai render kabul eder. `audio:job` değişmeyen aşama ve
sesleri deponun render önbelleğinden alır, toplu işleri tahmine göre
worker'larda koşar; PCM ve sonuç sırası değişmez, doğrulama önbellek
kullanmaz. Kurallar context çıktısındaki `protocol.rendering` alanında,
tasarım ve ölçümler DESIGN.md "Render kalitesi, artımlı render ve paralel
toplu iş" bölümündedir.

Tek bir değer tahmin etmek yerine aralık aramak için `search` alt komutları
vardır (spec → plan → run → audition/decide → promote); onaylı aday job
programına terfi eder ve aynı akıştan yayımlanır. `search run --semantic`
isteğe bağlı harici scorer süreci koşturur (`--scorer` ya da
`AUDIO_SYNTH_SEMANTIC_SCORER` bir argv dizisi taşır; kabuk yoktur); skorlar
`semantic.json` danışman
sıralamasıdır, hiçbir kapıyı etkilemez. Sözdizimi context çıktısındaki
`search.commands` ve `search.semantic` alanlarındadır.

İlişkili varyant setleri `family` alt komutlarıyla üretilir: her varyant
aynı akıştan yayımlanır, en son çalışma zamanının yalnız JSON ile okuyacağı
bir bank yazılır. Oyun durumu aileleri (`energy`, `urgency`, `integrity`
sıralı eksenleri) yön iddialarını ve ortak tını kimliğini ölçerek geçer;
`reference-engine-states` örneğidir. Sözdizimi `family.commands` alanındadır.

Aynı yayımlanmış kaynaktan uzaklık, engel, ortam ve cihaz varyantları
`derive` ile türer: program kaynağın kendisi + teslim profilidir, manifest
kaynağa ve profile bağını taşır. `reference-impact` ve yedi varyantı
örneğidir; kurallar ve profiller context çıktısındaki `delivery`
alanındadır.

Müzik `music` alt komutlarıyla üretilir (`plan | analyze | check | render |
publish | status | verify | list | search`): sembolik analiz ses render
etmeden koşar, stem'ler ve cue'lar aynı publish kapısından geçer ve en son
çalışma zamanı sözleşmesini taşıyan `MusicBundleV1` yazılır. Enstrüman
kaynakları, artikülasyon kümeleri, görev bantları, desen dizgisi, segment ve
ayar kuralları `music` bağlamındadır; sözdizimi `music.commands`
alanındadır. `reference-arcade` fixture'ı giriş + dikişsiz loop + bitiş +
stinger bundle'ının uçtan uca örneğidir.

Bir bundle'ın `delivery.files` alanı eski olay yoluna mix teslimini açıkça
bağlayabilir; eksik stem/cue yolları varsayılan dizinden türetilir.
`assetClass: ambience` fiziksel kaynağı sample kimliğiyle bağlanan atmosfer
loop'unu da aynı MusicBundle kapısından geçirir. Bu iki alan opt-in'dir;
eski programların yolu, sınıfı ve PCM'i değişmez. Brief'in isteğe bağlı
`character` sınırları tüm decode edilmiş kanallarda kodek sonrası ölçülür;
insan dinleme kararının yerine geçmez.

Ses tasarımı brief'ten başlayabilir: `plan` brief'in betimleyici
sözcüklerinden mekanizma/stil/materyal planı ve render edilebilir bir
iskelet üretir (sağlayıcısı olmayan mekanizmayı `unsupported` raporlar,
taklit etmez), `graph` programın render etmeden okunan topolojisini verir,
`samples` sample kütüphanesini listeler ve doğrular. Sözdizimi
`soundDesign.planner.commands` ve `soundDesign.samples.commands`
alanlarındadır.
