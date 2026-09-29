# @volstudio/audio-synth — iş listesi

> **TODO disiplini:** Açık iş `[ ]`, biten iş `[x]` olur. Biten madde silinmez;
> kısa hâliyle dosyanın sonundaki `## Kapatılanlar` bölümüne taşınır. Eksik
> çıkan bir kapanış yeni bir `[ ]` maddeyle yeniden açılır.

Mimari, sınırlar ve doğrulama komutları için [DESIGN.md](DESIGN.md); repo
geneli işler kök [TODO.md](../../TODO.md)'de.

## Açık

## Yol haritası — agent-first genel amaçlı audio-authoring platformu

> **Dalga 0**, yukarıdaki `## Açık` bölümündeki mevcut motor doğruluğu ve
> üretim borçlarıdır (kapananlar `## Kapatılanlar`da). Yeni authoring
> katmanları; yanlış DSP semantiği (ör. eski `Reverb.decay` kelepçesi), birden
> fazla mastering yolu veya doğrulanmamış resource davranışı üzerine kurulmaz.
>
> Nihai hedef yalnız organik ses üretmek değildir. `@volstudio/audio-synth`;
> SFX, organik/fiziksel ses, ambience ve müzik için farklı agent'ların aynı
> sürümlü ve doğrulanabilir repo sözleşmesini kullanabildiği deterministik
> OFFLINE audio-authoring platformuna dönüşür — organik sentez (Dalga 2-3)
> bu platformun bir ALT ALANIdır, nihai amaç değil.
>
> Agent bilgisi yalnız prose belgeye emanet edilmez. Kanonik gerçek:
> TypeScript tipleri/şemaları, registry, validator, CLI context çıktısı,
> program/manifest dosyaları, testler ve publish gate'lerinde yaşar.
>
> **Bağımlılık kapıları:**
>
> - Dalga 1 başlamadan `Reverb` semantiği ve nested-param doğrulaması
>   (Dalga 0) kapanır.
> - Candidate search (Dalga 4) başlamadan render resource budget (Dalga 0)
>   uygulanır.
> - Production music/program katmanı (Dalga 6) kullanılmadan ortak
>   arrangement/mastering yolu (Dalga 0) tekleştirilir.
> - Production publish (Dalga 1) kullanılmadan final encoded-audio QA
>   (`## Açık`, Dalga 0) kapanır; `AudioAnalysisReportV1` ve
>   `AudioAssetManifestV1` aynı Dalga 1 içinde publish kapısından ÖNCE kurulur.
> - Dalga 7+; Dalga 1-6'nın kanonik program/publish sözleşmelerini tüketir,
>   onların yerine ikinci bir paralel sistem oluşturmaz.

### Dalga 1 — agent protokolü, program sözleşmesi ve production izi

Dalga 1'in on maddesi kapandı; kısa kanıtları `## Kapatılanlar`da. Kanonik
yüzey `src/program/` + `src/protocol/` + `audio:job` CLI'ıdır; gerekçe
DESIGN "Authoring protokolü".

### Dalga 2 — organiklik çekirdeği

Dalga 2'nin beş maddesi kapandı; kısa kanıtları `## Kapatılanlar`da, gerekçe
DESIGN "Organiklik çekirdeği".

### Dalga 3 — biyolojik yapı taşları

Dalga 3'ün beş maddesi kapandı; kısa kanıtları `## Kapatılanlar`da, gerekçe
DESIGN "Biyolojik yapı taşları".

### Dalga 4 — agent search laboratuvarı ve kalite

Dalga 4'ün dört mühendislik maddesi kapandı; kısa kanıtları
`## Kapatılanlar`da, gerekçe DESIGN "Arama laboratuvarı". Algısal doğrulama
ayrı ve açıktır:

- [ ] **[P3] Organik canary'lerin insan dinlemesi.** 19 canary'nin
      mekanik beklentileri geçiyor; `canaries/reviews.json`da 13 kabul,
      6 sorun beyanı var. Bayat sürüm beyanları etkin `pending-human`dır.
      Kapanır: bir insan her güncel canary'yi
      canary'yi dinleme rehberine göre dinler ve
      `audio:job canary review <id> --status … --note … --by human` ile
      beyanını yazar; `heard-problem` çıkan canary için ayrı bir motor maddesi
      açılır. Dalga 11'in davul, retro ve `reference-arcade` sesleri de bu
      dinlemeye girer; yön iddiaları ölçüldü, beğeni ölçülmedi.

### Dalga 5 — generic SoundFamily üretimi

Dalga 5'in dört maddesi kapandı; kısa kanıtları `## Kapatılanlar`da, gerekçe
DESIGN "SoundFamily üretimi".

### Dalga 6 — müzik authoring temeli ve adaptive production sözleşmesi

Dalga 6'nın on sekiz maddesi kapandı; kısa kanıtları `## Kapatılanlar`da,
gerekçe DESIGN "Müzik authoring". `## Sonraki aşamalar` girişindeki
"MusicProgram/ThemeBook, stem/adaptive music kuruldu" varsayımı artık
gerçektir.

## Sonraki aşamalar — genel amaçlı audio-authoring platformu

> Bu bölüm **Dalga 0-6'nın kapanışından sonra** başlar. Özellikle kanonik
> AudioJob/Brief/Program/Manifest/Publish sözleşmesi, ortak arrangement/
> mastering yolu, candidate-search altyapısı, generic SoundFamily bankası ve
> MusicProgram/ThemeBook/StemBundle temeli hazır olmadan aşağıdaki generic
> mekanizmalar ikinci bir paralel authoring sistemi oluşturmaz.
>
> Bundan sonraki hedef belirli bir oyun veya ses ailesi değildir:
> `@volstudio/audio-synth`; silah, mekanik, çevre, canlı, UI, arcade,
> bilimkurgu, gerçekçi/stilize SFX, ambience ve profesyonel müziğin aynı
> kanonik offline authoring/publish sistemiyle üretilebildiği genel amaçlı
> platforma genişler.
>
> Saf procedural synthesis tek zorunlu çözüm değildir. Procedure, sample ve
> hybrid yöntemler aynı üretim/program/QA/provenance sözleşmesinin farklı
> kaynaklarıdır. Motorun ifade edemediği bir ses oyun script'inde gizli ikinci
> bir synth yazılarak çözülmez; eksik genel primitive ya da backend açıkça
> geliştirilir.
>
> Mevcut `DESIGN.md` §Sınırlar "çalışma zamanında canlı sentez" ve "real-time
> MIDI/DAW/VST entegrasyonu"nu bilinçli kapsam dışı sayıyor; aşağıdaki
> dalgaların hiçbiri bunu değiştirmeyi önermiyor — hepsi OFFLINE render
> hattının (kod → render → OGG → MusicEngine) içinde kalıyor.

### Dalga 7 — Genel ses dili ve üretim grafiği

Dalga 7'nin beş maddesi kapandı; kısa kanıtları `## Kapatılanlar`da, gerekçe
DESIGN "Genel ses tasarımı ve üretim grafiği".

### Dalga 8 — Genel SFX mekanizmaları

Dalga 8'in sekiz maddesi kapandı; kısa kanıtları `## Kapatılanlar`da, gerekçe
DESIGN "Genel ses tasarımı ve üretim grafiği".

### Dalga 9 — Hybrid/sample/resynthesis altyapısı

Dalga 9'un yedi maddesi kapandı; kısa kanıtları `## Kapatılanlar`da, gerekçe
DESIGN "Genel ses tasarımı ve üretim grafiği". Spectral/STFT katmanı bilinçli
kararla eklenmedi (`no-spectral-layer`).

### Dalga 10 — Mix, processing ve mastering kapasitesi

Dalga 10'un beş maddesi kapandı; kısa kanıtları `## Kapatılanlar`da, gerekçe
DESIGN "Genel ses tasarımı ve üretim grafiği". Multiband bilinçli kararla
eklenmedi (`no-multiband`).

### Dalga 11 — Profesyonel müzik üretim kapsamı

Dalga 11'in sekiz maddesi kapandı; kısa kanıtları `## Kapatılanlar`da,
gerekçe DESIGN "Enstrüman sözleşmesi ve üretim kapsamı (Dalga 11)". Uçtan uca
yayın kanıtı `audio-music/reference-arcade`.

### Dalga 12 — Oyun için teslim biçimleri

Dalga 12'nin beş maddesi kapandı; kısa kanıtları `## Kapatılanlar`da,
gerekçe ve ölçümler DESIGN "Teslim biçimleri (Dalga 12)". Uçtan uca yayın
kanıtı `audio-jobs/reference-impact` + yedi teslim varyantı ve
`audio-families/reference-engine-states`.

### Dalga 13 — Agent üretim hızını ve güvenilirliğini artırma

> **Prerequisite:** canonical program hash'leri ve manifest/provenance
> sistemi (Dalga 1) vardır — aksi hâlde graph-cache anahtarları güvenilir
> değildir.

- [x] **[P1] Genel audio benchmark/canary korpusu genişletilsin.** En az:
      stylized tank fire, heavy realistic-ish impact, snake-like hiss,
      steam, metal scrape, motor acceleration, electrical charge,
      water/fluid event, creature vocal, UI confirm/error, retro arcade
      SFX, seamless arcade theme, ambience loop ve çok-bölümlü müzik cue
      sürümlü görevler olur. Kapanır: her görev mekanik/QA kriterleri ve
      gerekiyorsa audition kaydı taşır; yeni motor sürümü bütün canary'lerin
      durumunu tek raporda gösterir.
      **Kapandı (F5a):** `benchmarks/` altında 14 `BenchmarkTaskV1` görevi
      (13 akustik/archetype + 2 gömülü müzik; ui-feedback iki parçalı).
      `audio:job benchmark list|run|review` 19 canary + 14 görevi tek
      `BenchmarkReportV1`'de döker; kodek-sonrası dikiş/hiza, müzik QA ve
      bar hizası kriterleri ölçülür, seri/worker eşitliği ve mutasyon
      ayırt ediciliği `tests/benchmark/` ile kilitli. Dinleme durumları
      benchmark `reviews.json`unda dinleme `pending-human`.
- [x] **[P2] `audio:capabilities` kalite matrisi oluşsun.** Motor yalnız
      "primitive mevcut" demez; sürümlü benchmark görevlerinde hangi ses
      ailelerinin production-ready/canary/research seviyesinde olduğunu
      gösterir. Kapanır: capability statüsü test/benchmark kaydından
      türetilir; README'de elle "her sesi yapar" iddiası yazılmaz.
      **Kapandı (F5b):** `audio:job capabilities` 31 ontoloji mekanizmasını
      `QualityMatrixV1` satırlarına döker; kanıt, fixture kaynaklarındaki
      gerçek `providers`/pipeline kullanımı ile `BenchmarkReportV1` geçiş
      kayıtlarının birleşiminden türetilir (elle tablo yok). Seviyeler:
      production-ready/benchmarked/canary/regressed/research/pipeline/
      unsupported; `production-ready` üç kanıt ister — geçen görev +
      kategoriyi kapsayan doğrulanmış yayımlanmış manifest + güncel görev
      sürümünde insan `heard-acceptable` (R3). `--from-report` kayıtlı
      raporu render'sız okur; `regressed` satırı çıkış kodu 1 verir.
      `tests/governance/capabilities.test.ts` seviye kurallarını ve kanıt
      dürüstlüğünü kilitler.
- [x] **[P2] Reference/audition korpusu motorun estetik regresyon
      hafızası olsun.** Otomatik unit/spectral testlerin yakalayamadığı
      fakat kullanıcı tarafından daha önce kabul edilmiş ses karakterindeki
      büyük değişimler görünür hale gelsin. Referans kayıt "PCM sonsuza dek
      değişemez" golden file'ı değildir; source program/hash, engine
      sürümü, analysis descriptor'ları ve audition sonucu birlikte saklanır.
      Reverb, resampler, dynamics, oscillator veya mastering gibi büyük DSP
      değişikliğinde hangi accepted asset'lerin etkilendiği otomatik
      raporlanır. Kapanır: en az bir SFX, bir ambience/texture ve bir müzik
      reference fixture'ı korpusa alınır; DSP değişikliğinde yeniden render
      sonucu eski/yeni PCM identity, descriptor delta ve `audition required`
      durumunu raporlar; bilinçli ses iyileştirmesi sırf PCM hash değişti
      diye otomatik regression sayılmaz ve insan audition kararı chat
      metninde değil machine-readable kayıtla saklanır.
      **Kapandı (F5c):** korpus = `reference/production/manifests/**`
      tamamı (36 manifest: 25 sfx, 1 ambience — canonical publish ile
      `reference-ambience` eklendi — 10 music/stem); `audio:job regression
run|decide|corpus|decisions` eski/yeni PCM kimliği, betimleyici delta
      (yayımlanmış asset FFmpeg çözümüyle) ve `audition-required` durumunu
      raporlar; insan kararı `regression/decisions.json`'a tam o PCM
      hash'ine bağlı yazılır, yeni hash kararı bayatlatır; `regression-part`
      görevi paralel koşar; `tests/regression/` 6 test (mutasyon zinciri
      dâhil). (Dalga F5)

## Kapatılanlar

- [x] **[P2] Referans yayınları kanonik yoldan tazelendi (F7a).** 12
      akustik job `render → analyze → select → publish`, 4 müzik
      lokasyonu `music publish`, 2 aile `family publish` — hepsi
      renderer v2 ile yeniden yayımlandı; `regression run` 36/36
      `unchanged` (yeni manifestler güncel motorla bit-eşit).
      `audio-searches/reference-shell` arama kanıtı da v1 PCM'leriyle
      bayatlamıştı; aynı spec'ten v2 motoruyla yeniden koşuldu
      (`search verify reference-shell` → `ok`).
- [x] **[P3] Tek-komut dinleme paketi (F7b + R7).** `pnpm audio:listen`
      (`scripts/listening-package.ts` → `src/protocol/listening.ts`):
      `export/listening/` altında dört bölüm — 19 canary (kanonik render +
      rehber + `reviews.json` durumu), 36 benchmark öğesi (parça başına
      `source` + kodek çözümü `delivery`, loop taşıyanlara `loop2x`,
      stinger'lara yatak üstü `overlay`; karar `benchmark review`),
      79 referans öğesi (kaynak render + gönderilen OGG çözümü +
      `integration.loop`'a göre `loop2x`; `decisions.json` PCM-hash
      bağlı, yoksa `undecided`), 4 v1/v2 anti-aliasing karşılaştırması.
      Varyantlar `group` ile yan yana; karar komutu öğede görünür.
      `listening.json` envanteri + statik `index.html`. Kanıt:
      `tests/protocol/listening.test.ts` (4). Beğeni beyanı yalnız
      insan komutuyla yazılır.
- [x] **[P2] Temizlik ve sağlamlaştırma denetimi (F7c+F8).** `verify --all`
      tam yeşil (36 manifest, 2 arama, 2 bank, 4 bundle, 8 sample).
      Denetim bulguları: semantic skor publish/select yoluna girmiyor;
      bütün yazmalar `resolveInside`+atomik+kilit altında; fit/search
      tamamlanmış dizin üzerine yazmayı reddeder; scorer hataları
      `toolchain`; dinleme sunucusu yalnız loopback + Host/Origin
      allowlist; dinleme sayfası bütün alanları HTML-escape eder; yeni
      runtime bağımlılığı ve sır/PII yok; kaynak dosyalar <1000 satır;
      frozen oyun ağaçları temiz. Kapsam altında ~4.5× yavaşlayan iki
      korpus süpürme testi 120 sn'lik `PIPELINE_TIMEOUT`'u aşıyordu —
      ayrı `CORPUS_TIMEOUT` (480 sn) eklendi, iki dosya coverage
      altında doğrulandı.
      R8 sağlamlaştırması: tohumlu sınır fuzz'ı
      (`tests/protocol/fuzz.test.ts` — `validate*`/`resolve*` bozuk
      girdileri yalnız `AudioParamError`/`ProtocolError`/
      `CanonicalJsonError` fırlatır, `TypeError` yok); mutasyon
      kampanyası `scripts/mutation-campaign.ts` — 12 kritik iddia
      bilerek bozuldu, 12/12 testler öldürdü (kanonik sıralama,
      sürüm çözümü, encode kalitesi, BLEP, manifest şeması, worker
      önbelleği/sırası, canary varsayılanı, yüzey pinleme, fit
      seçimi, scorer argv, bellek bütçesi); korpus PCM eşitliği
      önbellek± × 1/4 işçi süpürmesiyle kilitli
      (`tests/regression/regression.test.ts`); maliyet modeli
      ölçümle kalibre edildi — `treatmentCost` tabanı (loop ikinci
      turu, ~10× küçümsemeydi), `effect.reverb` 8→14,
      `source.wind` 24→36 birim/kare (`bench:budget` `prog-*`
      senaryoları, DESIGN'daki tablo).
- [x] **[P3] Semantic audio scorer isteğe bağlı laboratuvar aracı olsun.**
      `search run --semantic` harici scorer süreci koşturur
      (`--scorer '["<exe>",…]'` ya da `AUDIO_SYNTH_SEMANTIC_SCORER`; terimler
      `--positive`/`--negative`): aday WAV'ları `export/` altına düşer,
      `SemanticScoreRequestV1` stdin'e, `SemanticScoreResponseV1`
      stdout'tan; bilinmeyen kimlik, JSON dışı çıktı ya da sıfır-olmayan
      çıkış `toolchain` hatasıdır (`src/search/semantic.ts`,
      `src/protocol/semantic.ts`). Sonuç `<search>/semantic.json`
      (`SearchSemanticV1` skorlar + `ranked`) ve CLI sıralaması —
      danışmandır; aynı spec'in skorlu/skorsuz raporu birebir aynıdır
      (test kilitli), skorer yokken bütün pipeline eksiksiz çalışır,
      skor hiçbir kapıyı açmaz. Kanıt:
      `tests/protocol/semantic.test.ts` (13) +
      `audio-searches/semantic-demo/semantic.json`. (Dalga F6)
- [x] **[P3] Reference fitting / inverse synthesis araştırma kapısı.**
      `AcousticFitSpecV1` + `audio:job fit run|show|list`
      (`src/search/fit.ts`, `src/protocol/fit.ts`): hedef betimleyici
      vektörüne (perde/spektral/zamansal alanlar, genişlik tablosuyla
      normalize, ağırlıklı RMS) deterministik zoom taraması — tam küp
      Halton + görev sahibi etrafında `shrink` oranında daralan kutu,
      elit taşıma ve program-özeti önbelleğiyle. `target.manifest`
      manifest `analysis.encoded`'ından değer okur. Kapanış kanıtı
      `audio-fits/`: gizli hedef `hidden-tone-660` 3 turda `converged`
      (uzaklık 0.071 ≤ 0.2; frekans 660→644.99 Hz, %2.3 hata; waveform
      sine doğru) ve aynı hedefe perdesiz taban `exhausted`
      (uzaklık 4.04 — yanlış topoloji başarı sayılmaz). Testler
      `tests/protocol/fit.test.ts` (12): determinizm, overwrite reddi,
      manifest hedefi, uzaklık matematiği. Sinirsel bağımlılık yok;
      `converged` kalite yargısı değildir, publish kapısı açmaz. (Dalga F6)
- [x] **[P1] Percussion/drum synthesis genel instrument ailesi.** Yedi
      parametrik model (kick, tom, snare, clap, hat, cymbal, perc); gövde,
      gürültü, tık ve metalik bileşenler; velocity tınıyı açar. Müzikte
      `drum-kit`, akustik programda `source.drum`. Kanıt:
      `tests/percussion.test.ts` (yön iddiaları yedi modelde ölçülür),
      `tests/program/chip.test.ts` (kick/snare/hat aileleri aile kalite
      kapısını geçer). (Dalga 11)
- [x] **[P1] `InstrumentDefinition` standardı.** Aralık, tercih edilen
      register, transpozisyon, polifoni, velocity tepkisi, bırakma,
      artikülasyon ve rol ortak sözleşme; kaynak preset, sampler, kit, retro
      ya da katman. Kanıt: `tests/music/instrumentDefinition.test.ts` —
      prosedürel piyano ve sampler aynı olayları tüketir, ikisi de çalar;
      eski programlar bit-eşit (production-check). (Dalga 11)
- [x] **[P1] Retro/arcade synthesis ailesi.** Darbe (duty/süpürme), düz ve
      4-bit üçgen, testere, uzun/kısa LFSR, wavetable, hard sync, arpej,
      bit/tutma; her süreksizlik PolyBLEP'li. Kanıt: `tests/retro.test.ts`
      (perde, duty harmonikleri, LFSR 93 adım, alias ölçülerek kilitli),
      `tests/program/chip.test.ts` (UI arpeji, arcade gürültüsü, bas aynı
      araç setinden). Konsol öykünmesi iddiası yok. (Dalga 11)
- [x] **[P1] `MusicBundle`.** Segmentler: loop + giriş, bitiş, stinger,
      geçiş; ortak mastering kazancı, cue asset'leri, stinger/giriş bindirme
      QA'sı, kodlanmış loop dikişi. Core motoru cue'ları örnek-doğru zamanlar
      (`playStinger`, `playOutro`, `transitionTo`). Kanıt:
      `tests/music/segments.test.ts`, `core/tests/audio/music/cues.test.ts`,
      yayımlanmış `reference-arcade` bundle'ı (hiza 0/0, dikiş sürekli).
      (Dalga 11)
- [x] **[P2] Note/event ifade modeli artikülasyon taşır.** Uzunluk, dinamik
      ve teknik kümeleri; desteklenmeyen artikülasyon adıyla reddedilir.
      Kanıt: `tests/music/articulation.test.ts` (staccato, legato, tie,
      let-ring, mute, accent, ghost, slide/glide ölçülerek). (Dalga 11)
- [x] **[P2] Tracker/step-pattern yüzeyi.** Satır dizgisi, melodik adımlar,
      zincir, tekrar, varyasyon, dolgu, olay kimliğine bağlı olasılık. Kanıt:
      `tests/music/pattern.test.ts`; `reference-arcade` giriş → loop → bitiş
      desen zincirleriyle yayımlandı. (Dalga 11)
- [x] **[P2] Orchestration/role katmanı.** Görev → enstrüman paletleri,
      `auto` register kararı, yönlendirici görev bantları. Kanıt:
      `tests/music/orchestration.test.ts` — iki palette yazılı nota/armoni
      kimliği aynı, PCM farklı. (Dalga 11)
- [x] **[P2] Kanal/yerleşim politikası asset türüne göre açık.**
      `placement` (positional, screen, bed) sınıf başına izinli kanal
      sayısını belirler; yanlış sayı brief doğrulamasında düşer. Stereo kodek
      sonrası mono katlamaya dayanır (tavan 4 LU; referanslar 0.004–1.40 LU),
      mono'ya izin verilen yerde dual-mono ihlaldir; manifest `layout`
      kaydeder, verify yeniden sınar. Kanıt: `tests/protocol/layout.test.ts`.
      (Dalga 12)
- [x] **[P2] Encode profili asset sınıfına göre.** Vorbis kalitesi ölçülerek
      seçildi (ui q6, sfx q7, ambience q6, music/stem q4; taban q4, düşürmek
      dinleme ister); 22 öğelik korpusta q0–q10 bayt + kodek sonrası sadakat
      taraması `encode-profiles.lock.json`da. Tablo ölçümden ayrışırsa
      `audio:encode-baseline` kilidi yazmaz. Kanıt:
      `tests/governance/encodeProfiles.test.ts` (seçilen kalitelerde ölçüm
      yeniden üretilir). (Dalga 12)
- [x] **[P2] Aynı kaynaktan near/mid/far varyantı.** Program `treatment`
      katmanı + ISO 9613-1 hava soğurması (`effect.air-absorption`, ISO
      9613-2 Tablo 2 ile doğrulandı) + atak, yansıma, genişlik; seviye
      kaynağa göreli. Kanıt: `reference-impact` near/mid/far aynı kaynak
      kimliğini taşır; centroid 1442/1368/1016 Hz, atak oranı
      −7.22/−7.78/−9.20 dB, doğrudanlık −4.87/−7.46/−21.63 dB kodek sonrası
      (`tests/protocol/deliveryReference.test.ts`). (Dalga 12)
- [x] **[P2] Teslim profilleri kaynaktan ayrı işleme katmanı.** occluded,
      behind-wall, underwater, radio (+ üç mesafe) `audio:job derive` ile
      aynı yayımlanmış kaynaktan deterministik türer; manifest `derivation`
      kaynağın program/PCM özetini ve profil kimliğini taşır, verify bağı
      yeniden sınar. Kanıt: `tests/protocol/treatments.test.ts`,
      `tests/program/treatment.test.ts`. (Dalga 12)
- [x] **[P2] Oyun durumu aileleri tek programdan.** Sıralı genel eksenler
      (`energy`, `urgency`, `integrity`); aile yön iddialarını kontrollü
      çiftlerde ve ortak tını kimliğini (`timbre-envelope-v1`) ölçer;
      varyant manifest'i yapılandırılmış `state` taşır. Kanıt:
      `reference-engine-states` (kimlik 12.27 ≤ 13, yedi yabancı ses ≥ 13.9;
      üç iddia ihlalsiz), `tests/family/states.test.ts`. (Dalga 12)
- [x] **[P3] Tuning sistemi 12-TET'e gömülü değil.** `equal`, `cents`,
      `ratios` ve nota başına cent sapması. Kanıt:
      `tests/music/tuning.test.ts` — ayarsız yol `midiToHz` ile birebir, saf
      ses oranları ve ortalama ses cent tablosu deterministik. (Dalga 11)

- [x] **[P1] Draft ve final render kalite modları.** Program, düğüm ve
      tohum iki kalitede aynı; yalnız iç aşırı örnekleme (ses sentezi 2×→1×,
      doygunluk ve true-peak 4×→1×) değişir. Taslak kayıt `quality: "draft"`
      ve ayrı `renderId` taşır; publish onu `policy` ile reddeder. Kanıt:
      `tests/protocol/quality.test.ts`, `tests/engine/renderCache.test.ts`;
      müzik kontrolü 9,35 → 4,79 sn (DESIGN.md "Render kalitesi…"). (Dalga 13)
- [x] **[P1] Graf özeti tabanlı artımlı render ve önbellek.** Katman
      aşamaları, modülatörler ve program kökü Merkle anahtarlarıyla; müzikte
      ses düzeyinde. Disk katmanı kod parmak izine bağlı; doğrulama önbelleği
      kullanmaz. Kanıt: `tests/program/incremental.test.ts` (yaprak değişince
      3, modülatör değişince 6 aşama; önbellek açık/kapalı PCM bütün
      külliyatta aynı), `tests/music/incremental.test.ts` (şerit kazancı 0
      ses, enstrüman yalnız o şeridin sesleri),
      `tests/protocol/renderCacheStore.test.ts`. (Dalga 13)
- [x] **[P2] Deterministik paralel toplu render.** Arama adayları, aile
      üyeleri ve müzik stem'leri aynı görev işleviyle worker'larda; sonuç
      girdi sırasında. Worker sayısı render bütçesinden türeyen eşzamanlı
      bellek tavanına ve tahmini işe bağlı. Kanıt:
      `tests/protocol/parallel.test.ts` — seri ve paralel arama raporu ve
      dinleme kopyaları, aile ve müzik kontrolü birebir aynı. (Dalga 13)

- [x] **[P1] `SoundGraph` tek bir sesi katmanlarına ayırır.** `SoundGraphV1`
      transient→body→detail→tail→space katmanlarını, bus/send/sidechain
      ilişkisini ve zaman yerleşimini taşır; parametre değerleri topolojiye
      girmez. Kanıt: `tests/program/graph.test.ts` — tank ateşi (impact +
      pressure + mechanical + kuyruk bus'ı) ve yılan tıslaması (airflow +
      articulation + resonator) aynı render yolundan FARKLI topolojiyle
      geçer; izdüşüm deterministik. (Dalga 7)
- [x] **[P1] `SoundOntology` ve capability matrix.** Brief'in
      betimleyicisinden mekanizmaya giden deterministik sözlük (TR+EN);
      belirsiz sözcük (`fire`, `et`) bilerek eşlenmez. Kanıt:
      `tests/program/planner.test.ts` — her mekanizma/tarif/materyal/stil
      kimliği registry'de; capabilityMatrix `speech`/`doppler-motion`u
      `unsupported`, `musical`i `pipeline` raporlar; `audio:job context`
      soundDesign bölümü bunları makine-okunur verir. (Dalga 7)
- [x] **[P1] `ProgramPlanner`/capability recommender.** Brief'ten
      mekanizma/stil/materyal önerisi registry verisinden deterministik;
      gerekçe planda (`term:`/`declared`). Kanıt:
      `tests/program/planner.test.ts` — desteklenmeyen mekanizma iskelet
      üretmez (`unsupported` açıkça raporlanır), plan deterministik, iskelet
      `AcousticProgramV1` olarak render edilebilir. (Dalga 7)
- [x] **[P2] `StyleProfile` kontrol alanlarına çözer.** Transient sertliği,
      bant, doygunluk, perde dili, dinamik, stereo; oyun/sanatçı adı kalıcı
      profile kopyalanmaz. Kanıt: `tests/program/styleMaterial.test.ts` —
      realistic-heavy / arcade-industrial / minimal-synthetic tank
      topolojisini korur (düğüm/kenar aynı) ve ölçülebilir farklı karakter
      verir (doygunluk basamağı > 0.5 ↔ < 0.2); nötr stil bit-eşit; mono
      programda genişlik uygulanmaz ve raporlanır. (Dalga 7)
- [x] **[P2] `MaterialProfile` fiziksel türetim taşır.** η, E, ρ ve
      yerleşim mod frekansı, mod başına T60, temas süresi ve pürüzü
      belirler; materyal adı EQ preset'i değildir. Kanıt:
      `tests/program/styleMaterial.test.ts` — aynı uyarımda ölçülen −40 dB
      sönüm sırası ve mod ARALIĞI materyal verisinin öngördüğü yönde;
      kayıp çarpanı çınlamayı kısaltır; tablo fiziksel türetmeleri taşır ve
      kimlikler tekildir. (Dalga 7)
- [x] **[P1] `Impact/Contact` sentez ailesi.** Hız/mass/sertlik/temas
      süresi/materyal çifti ayrı katman; stilize sapma açık. Kanıt:
      `tests/program/sfx.test.ts` — hız arttıkça uyarım enerjisi ve atak
      parlaklığı monoton artar (t_c ∝ v^(−1/5)); metal-metal, taş-taş,
      yumuşak-sert aynı motordan ayrışır (sönüm ve renk); temas pürüzü temas
      süresiyle süzülür (ölçülen düzeltme: kauçuk metalden parlak
      çıkıyordu); `contact-metal`/`contact-rubber` canary'leri, mutasyon
      (metal→lastik) beklentiyi düşürür. (Dalga 8)
- [x] **[P1] `Pressure/Explosion/Discharge` ailesi.** Şok/low-end
      gövde/türbülans/döküntü/mekanizma/kuyruk bağımsız katmanlar; tek
      broadband burst motor sayılmaz. Kanıt: `tests/program/sfx.test.ts` —
      tank/havan atışı, büyük patlama, enerji deşarjı aynı
      `archetype.pressure-event` ailesinden farklı programlardır; transient
      ile low-end bağımsız ölçülür; ölçekli kısa süre render'dan önce
      reddedilir; `pressure-blast` canary. (Dalga 8)
- [x] **[P1] `Weapon/Launcher` archetype'ı.** charge/trigger/discharge/gövde/
      mekanizma/döküntü/kuyruk isteğe bağlı graph. Kanıt:
      `tests/program/sfx.test.ts` — tank topu, arcade taret ve bilimkurgu
      fırlatıcı aynı `archetype.launcher` + farklı stil/materyal;
      profil kabul etmeyen archetype'a materyal verilemez. (Dalga 8)
- [x] **[P1] `Airflow/Turbulence/Hiss` ailesi.** Pressure/aperture/akış
      hızı/türbülans ölçeği/spectral tilt/sibilance/kavite. Kanıt:
      `tests/program/sfx.test.ts` — tıslama, buhar, pnömatik, ıslık, nefes
      aynı yapı taşından belirgin ama ilişkili davranış verir; Strouhal:
      ağız çapı yarıya inince jet bandı oktav yukarı, basınç U³ ile
      yükselir. (Dalga 8)
- [x] **[P2] `Friction/Scrape/Rolling` ailesi.** Bağıl hız/pürüz/basınç/
      yüzey taneliliği + stokastik mikro temas olayları. Kanıt:
      `tests/program/sfx.test.ts` — yuvarlanma darbesi v/(2πr) ile izlenir
      (hız ×2 → periyodik oran ×2), kayma hızlandıkça bant merkezi yükselir;
      metal kazıma, taş sürükleme, yuvarlanan döküntü aynı aileden ayrışır;
      `friction-rolling`/`friction-scrape` canary'leri. (Dalga 8)
- [x] **[P2] `Machine/Motor/Rotor` ailesi.** RPM/kanat sayısı/harmonik
      yapı/yük/ivme gesture'ı. Kanıt: `tests/program/sfx.test.ts` — RPM iki
      katına çıkınca baskın döngüsel bileşenler ölçümde kayar; ivmelenme
      gesture'ı baskın bileşeni zamanla yükseltir. (Dalga 8)
- [x] **[P2] `Electrical/Energy` ailesi.** Hum/buzz/arc olayları/şarj
      zarfı/kararsızlık. Kanıt: `tests/program/sfx.test.ts` — hum şebeke
      harmoniği taşır, kararsız ark gürültülü ve olay yoğundur, şarj perdesi
      yükselirken enerji atışı düşer (YIN); yalnız "distorted sine"
      preset'i değildir. (Dalga 8)
- [x] **[P2] Çevresel procedural texture ailesi.** Wind/rain/fire event
      population + stokastik doku + spectral motion. Kanıt:
      `tests/program/sfx.test.ts` — wind/rain/fire uzun render'larda
      deterministik; tekrar ölçüsü DİŞLİDİR (2 sn'lik döngüyle tekrarlanan
      doku yakalanır); loop sürümleri `master.loop` dikiş QA'sından geçer
      (`tests/program/graph.test.ts`); `wind-gusts`/`rain`/`campfire`
      canary'leri. (Dalga 8)
- [x] **[P1] Prosedürel/sample/hybrid aynı `SoundGraph` altında.** Kanıt:
      `reference-sampled` (velocity katmanı, round-robin, anahtar bölgesi,
      loop) ve `reference-hybrid` (HPSS transient + prosedürel gövde + IR)
      aynı publish/QA/provenance kapısından geçer; oyun tarafı kaynak
      türünü bilmez (`tests/program/sampling.test.ts`). (Dalga 9)
- [x] **[P1] Sample engine articulation ve bölge desteği.** Velocity layer,
      round-robin, key/range mapping, start-offset, loop region,
      deterministik variation. Kanıt: `tests/program/sampling.test.ts` —
      velocity/round-robin/anahtar bölgesi seçimi gerekçeli ve
      deterministik, bölge perdesi kök notadan kayar, bölgesiz nota
      render'dan önce reddedilir, loop bölgesi kaydı aşan notayı tıksız
      sürdürür; hangi sample'ın neden seçildiği manifest'e girer. (Dalga 9)
- [x] **[P2] Bağımsız perde kaydırma ve zaman germe.** Resample bağlı
      değişimden ayrı olarak WSOLA ve faz vokoderi offline işlemlerdir. Kanıt:
      `tests/program/sampling.test.ts` — ±12 semitone shift süreyi korur,
      0.5×/2× germe perdeyi korur; artefakt ölçümü tonalde faz vokoderi
      uyumlu, 2× germede WSOLA atağı daha iyi (ölçümlü karşılaştırma
      `stretch-method-choice` kaydında); `shifted-note`/`stretched-note`
      canary'leri (bağlı germe resample'a dönünce beklenti düşürür).
      (Dalga 9)
- [x] **[P2] Granular/sample-cloud motoru.** Grain position/duration/
      density/pitch/envelope/stereo deterministik. Kanıt:
      `tests/program/sampling.test.ts` — donmuş, hareketli ve yoğun bulut
      tekrarlanabilir, ayrışık, tıksız; stereo yerleşim iki kanalı ayırır,
      aşırı yoğunluk tanecik tavanında durur (kaçak ayırma yok);
      `granular-breath` canary. (Dalga 9)
- [x] **[P2] Offline konvolüsyon/IR.** Room/materyal/özel IR'lar sample
      kütüphanesinden; tail/resource hesabı explicit. Kanıt:
      `tests/program/sampling.test.ts` — birim IR girişi korur, UPOLS
      doğrudan konvolüsyona eşit, stereo IR kanal kanal yönlendirir; IR
      uzunluğu maliyete girer, zamana yayılan efekt insert olamaz;
      manifest IR provenance/hash'ini taşır. (Dalga 9)
- [x] **[P2] Transient/gövde ayrıştırması (HPSS).** Sample transient'i
      koruyup gövdeyi prosedürel değiştirir. Kanıt:
      `tests/program/sampling.test.ts` — kontrollü fixture'da transient
      zamanı ±2 ms ve tepesi korunur, toplam yeniden kurulur; araç sessizce
      kötü sonuç vermez (başarısız ayrışmada `failed` + adlı gerekçe; atak
      için enerji payı değil TEPE oranı — ölçüldü: metal temasta %0.06).
      (Dalga 9)
- [x] **[P3] Spectral/STFT katmanı yalnız gerçek ihtiyaçla.** Bilinçli
      karar: eklenmedi; STFT yalnız germe ve HPSS'in içinde kullanılır.
      Kanıt: `KNOWN_LIMITATIONS` `no-spectral-layer` — iki somut production
      görevi mevcut motorla belirgin yetersiz kalmadan "profesyonel
      DAW'larda var" gerekçesiyle eklenmez. (Dalga 9)
- [x] **[P1] Bus/send graph SFX ve müzikte aynı altyapı.** Kanıt:
      `tests/music/mix.test.ts` — drum/music stemleri ayrı bus'lara
      yönlenir, stem toplamı mix'e eşit (≤ −90 dBFS), doğrusal olmayan bus
      tek stem'den beslenemez, adaptive'de stem'ler arası sidechain
      reddedilir; `tests/program/graph.test.ts` — send/return kuyruğu
      taşır, insert'ler katman üzerinde, graph deterministic serialize
      edilir; time-based FX nota/layer içine rastgele gömülmez. (Dalga 10)
- [x] **[P1] Parametrik EQ ve shelf filtreleri.** Kanıt:
      `tests/effects/processing.test.ts` — RBJ biquad'ları: bell uzak bantta
      etkisiz, shelf karşı uçta etkisiz; pass kaskadı aşama başına
      12 dB/oktav, Q son aşamada rezonans; standard frequency-response
      fixture'larında beklenen gain ve cutoff davranışı ölçülür. (Dalga 10)
- [x] **[P1] Compressor/limiter/transient-shaper ailesi.** Ayrı ve açık
      semantik; dynamics effect ile mastering limiter karışmaz. Kanıt:
      `tests/effects/processing.test.ts` — statik eğri (eşik altı 1:1,
      üstü 1:ratio; yumuşak diz sürekli), kararlı durum kazancı ±0.3 dB,
      atak/bırakma τ ±%15; true-peak sınırlayıcı örnekler arası tepeyi
      tavan altına çeker, tavan altındaki sinyale dokunmaz; `master.limiter`
      OPT-İNDİR ve varsayılan zincir bit-eşit kalır
      (`true-peak-limiter-opt-in`); transient şekillendiricide atak/gövde
      bırakması AYRI (ölçülen düzeltme). (Dalga 10)
- [x] **[P2] Sidechain/ducking offline primitive.** Kanıt:
      `tests/effects/processing.test.ts` — sessiz sidechain çıktıyı bit-eşit
      bırakır, aktif sidechain ölçülen bir ducking zarfı üretir, bağlı mod
      iki kanala aynı zarfı verir; `tests/music/mix.test.ts` — müzikte
      sidechain kaynağı yalnız şerittir (bus değil,
      `music-sidechain-lane-only`). (Dalga 10)
- [x] **[P2] Multiband processing yalnız ölçülmüş ihtiyaçla.** Bilinçli
      karar: eklenmedi. Kanıt: `KNOWN_LIMITATIONS` `no-multiband` —
      tek-band EQ/dynamics ile çözülemeyen production canary kaydedilince
      crossover faz/gecikme maliyetiyle değerlendirilir. (Dalga 10)
- [x] **[P1] `MusicBriefV1` müzik isteğinin machine-readable sözleşmesi.**
      Kullanım, çalma modeli, duygulanım, tempo/ölçü, tonal dil, melodik öne
      çıkma, ritmik yoğunluk, form, uzunluk, SFX spektral önceliği ve adaptive
      state'ler; çalma modeli/kullanım/form/tempo/ölçü/uzunluk ZORUNLU karar.
      Kanıt: `tests/music/contracts.test.ts` — "seamless loop" ile "tek
      seferlik cue" aynı brief'e düşmüyor, eksik karar `MusicDecisionError` ile
      alan listesi veriyor, adaptive state yalnız `adaptiveLoop`ta. (Dalga 6)
- [x] **[P1] Proje başına makine-okunur `MusicThemeBookV1`.** Tonal/ritmik
      dil, imza aralık ve motifleri, palet, register ve spektral kimlik,
      kapalı kaçınma sözlüğü; override kuralın KİMLİĞİNE ve gerekçeye bağlı.
      Kanıt: üç referans program (`reference-loop`, `reference-cue`,
      `reference-adaptive`) aynı `reference-theme` kitabını programatik
      tüketiyor; ihlal kapıyı düşürüyor, `themeOverrides` ile geçiyor ve
      provenance raporda; serbest `notes` "denetlenmedi" diye sayılıyor
      (`tests/music/analysis.test.ts`). (Dalga 6)
- [x] **[P1] `MusicProgramV1` sembolik score'un kanonik JSON kaynağı.**
      Tempo, ölçü, tonal sistem, bölümler, armoni, motifler, şeritler/stem'ler,
      otomasyon, işaretler ve geçişler programda; enstrüman `preset:<ad>`
      kimliğiyle çözülür. Kanıt: `music analyze` ses RENDER ETMEDEN rapor
      üretir; `expandProgram` aynı programdan aynı score özetini verir
      (`tests/music/composition.test.ts`). (Dalga 6)
- [x] **[P1] `Section`/form birinci sınıf.** Bar aralığı, narrative rol, hedef
      enerji, aktif şeritler, armoni planı ve geçiş davranışı; bölümler
      boşluksuz ve tam kapsamalı. Kanıt: analizör bölüm başına yoğunluk,
      register, armonik ritim ve ÖLÇÜLEN enerji verir; hedef sırayla uyum
      referans cue'da 1.0 (`tests/music/analysis.test.ts`). (Dalga 6)
- [x] **[P2] Harmony/voicing toolkit.** Derece + nitelik, inversion, yayılım,
      register, ses sayısı, en büyük hareket; kromatik ses `alter` ile açık.
      Kanıt: aynı progresyon farklı yayılımla deterministik; register'a
      sığmayan ses ve hareket sınırı ihlali akorun yeriyle reddediliyor
      (`tests/music/composition.test.ts`). (Dalga 6)
- [x] **[P2] Motif birinci sınıf ve provenance taşıyor.** Sekiz dönüşüm
      (transpose, register-shift, rotate, fragment, sequence, augment,
      diminish, invert), her örnek `variationId` ve zinciriyle kaynağına
      izlenir. Kanıt: üç varyasyon ayrı kimlik, aynı motif kökü; analizör
      motif tekrarını kök başına sayıyor. (Dalga 6)
- [x] **[P2] Groove/insanlaştırma profilleri.** Swing, zamanlama/hız sapması,
      vurgu tablosu; şerit başına profil. Kanıt: sıfır sapmada score tam
      ızgara (`beat === gridBeat`); aynı profil + tohum + olay kimliği aynı
      sonucu veriyor; rastgelelik olay KİMLİĞİNE bağlı olduğu için stem'lere
      bölmek zamanlamayı değiştirmiyor. (Dalga 6)
- [x] **[P2] Bestecilik için enstrüman metadata'sı.** 47 enstrüman preseti
      kayıtta; aralık ve rol beyandan, zarf sınıfı ve spektral doluluk
      ÖLÇÜLEREK. Kanıt: aralık dışı nota ve desteklenmeyen artikülasyon adıyla
      reddediliyor; eşzamanlılık rol önerisini aşamıyor; kayıt özeti ölçüm
      içermediği için manifest'te kararlı. (Dalga 6)
- [x] **[P1] `MusicAssetSpecV1` playback ve üretim metadata'sının tek
      kaynağı.** Core'da yaşar; `barsToFrames` ölçü→kare dönüşümünün TEK yeri,
      `toMusicTrack` runtime parçasını üretir. Kanıt:
      `core/tests/audio/music/spec.test.ts` — loop kare sayısı ölçüden birebir,
      cue kuyruk taşıyabilir, loop taşıyamaz; üretilen asset'in kare sayısı
      spec ile aynı (`tests/music/publication.test.ts`). (Dalga 6)
- [x] **[P1] Üç çalma semantiği mastering yolunu belirliyor.** `loop` →
      `loop-cyclic`, `playlistOneShot` → `one-shot-limited`, `adaptiveLoop` →
      `stem-linear`. Kanıt: üç referans fixture yayımlandı; belgede yanlış yol
      beyan eden program şema düzeyinde reddediliyor
      (`tests/music/production.test.ts`). (Dalga 6)
- [x] **[P1] Müzik mastering hedefi tek yoldan.** Müzik için `masterMix`i
      çağıran tek yer `music/mastering.ts`; ikinci bir masterize yok.
      `scripts/music-demo.ts` ve `demo:music` kaldırıldı, yerini referans
      fixture'lar ve `audio:job music render` aldı. Kanıt:
      `tests/governance/publishPath.test.ts` yazıcı listesi demo olmadan
      geçiyor. (Dalga 6)
- [x] **[P1] `StemBundle` renderer: hizalı stem'ler + referans mix.** Kanıt:
      referans adaptive üç stem + mix yayımladı, dördü de aynı kare sayısında;
      core motoru mock AudioContext'te yoğunluk değişince stem'leri YENİDEN
      BAŞLATMIYOR (aynı `source` ve `startTime`, yalnız gain değişiyor —
      `core/tests/audio/music/spec.test.ts`). (Dalga 6)
- [x] **[P1] Stem-safe mastering.** Stem başına normalizasyon ve sınırlayıcı
      yok; ortak doğrusal kazanç. Kanıt: stem toplamı ile referans mix farkı
      −148.6 dBFS (eşik −90); tepe payı kazancı düşürerek açılıyor
      (`tests/music/production.test.ts`). (Dalga 6)
- [x] **[P1] Adaptive-state kombinasyonları publish öncesi ölçülüyor.**
      Beyan edilen state'ler + gain haritası eşik köşeleri; gain'ler runtime'ın
      `resolveStemGain`i ile. Kanıt: referans adaptive'de 7 kombinasyon
      ölçüldü, en kısık state −17.4 LUFS (duyulur), en yüksek −16.0 LUFS ve
      −4.06 dBTP; QA düşerse hiçbir şey yayımlanmıyor. (Dalga 6)
- [x] **[P2] Stem hizası kodlanmış çıktıda doğrulanıyor.** Çözülen her stem
      kaynak PCM ile çapraz korelasyona sokulur; gecikme ve kare farkı 0
      olmalı. Kanıt: bir örneklik kayma ve kare farkı testte yakalanıyor;
      bundle hiza kaydını taşıyor ve `verify --all` onu okuyor. (Dalga 6)
- [x] **[P2] Geçiş sözleşmesi runtime kapasitesine bağlı.** Desteklenen:
      bar hizalı crossfade, sönümlü durdurma, playlist boşluğu; stinger,
      bölüm atlama ve farklı tempoda bar hizası `unsupported-by-runtime` ile
      reddediliyor. Tonal ilişki beyanı "motor uygulamıyor" diye işaretleniyor.
      Kabiliyet listesi core'da tek yerde. (Dalga 6)
- [x] **[P2] Sembolik analizör render'dan ÖNCE.** Yoğunluk, anlık polifoni,
      register, perde sınıfı, motif tekrarı, bölüm kontrastı, armonik ritim,
      kural ve brief uyumu. Kanıt: "sparse" brief + yoğun score uyumsuzluğu
      bulgu üretiyor ve kapıyı düşürüyor; eşikler `music/policy.ts` verisinde.
      (Dalga 6)
- [x] **[P2] Hiyerarşik `MusicProgram` araması.** Adaylar sembolik açılıp
      süzülüyor, yalnız finalistler render ediliyor; strateji ve aday kimliği
      akustik aramayla aynı sözleşmede. Kanıt: referans aramada 24 aday
      açıldı, 12'si süzgeci geçti, 3'ü render edildi; aynı tohum aynı sırayı
      veriyor; terfi sürüm artırıp `provenance` yazıyor. (Dalga 6)

- [x] **[P1] `SoundFamilyProgramV1` ilişkili varyant üretir.** Ortak taban
      (archetype/program), arama ile ortak boyut sözlüğü, kapalı genel rol
      sözlüğü (intensity/weight/length/speed/wetness/rarity/onset), rol →
      alt aralık, `role-subrange-v1` politikası, aile tohumu, teslim bloğu.
      Kanıt: `tests/family/program.test.ts` — iki mekanik olarak farklı aile
      (archetype kabuk, program damla) sekizer deterministik varyant, tekil
      program ve PCM; referans `reference-shell-hits` 8 varyant yayımlandı,
      duplicate yok; her varyantın programı/tohumu/kökeni job `origin.json` +
      manifest'te. (Dalga 5)
- [x] **[P1] Offline `SoundFamilyBankV1` publish formatı.** Varyant başına
      kanonik job akışı (aynı `publishJob`), kalite kapısı ve bütçe yazımdan
      önce, bank en son; yarım yayın bank'sız ve `incomplete`, aynı komutla
      sürer. Kanıt: `tests/family/publish.test.ts` (idempotent tekrar, engelli
      varyantla yarım yayın → sürdürme, eksik/bozuk varyant bank'ı tamam
      saydırmaz, sürüm artmadan içerik değişmez);
      `tests/family/bankLookup.test.ts` audio-synth import etmeden tam
      anahtar, rol/etiket süzme ve FNV-1a seçimini yalnız bank ile yapar;
      `audio:production-check` bank'ı da doğrular. (Dalga 5)
- [x] **[P2] Family varyasyon alanı kontrollü ve yeniden üretilebilir.**
      Değerler `family:<id>/variant:<key>/<boyut>` adlı alt akışlarından;
      varyasyon sertlik/boyut/sönüm/yerleşim ve olay hızı/düzenlilik/perde
      çarpanı gibi anlamsal boyutlardan, tohum/perde/kazanç ezmesinden değil.
      Kanıt: varyant sırası, yeni rol + yalnız o rolle kapsanan yeni boyut +
      yeni varyant eski varyantların program/kimlik/PCM'ini değiştirmez; aile
      kalitesi `assessFamily` ile kapıda. (Dalga 5)
- [x] **[P2] Family bankası runtime/game kavramlarından bağımsız.** Kanıt:
      `tests/governance/familyDomain.test.ts` — aile/arama/bank kodu yalnız
      paket `src/`, `node:` ve `@volstudio/core/random` import eder; rol
      sözlüğü kapalı, alan ekseni (`enemyType`) adıyla reddedilir; bank şeması
      bilinmeyen alanı reddeder. (Dalga 5)
- [x] **[P1] Deterministik candidate-search motoru.** `AcousticSearchSpecV1`
      (archetype/program tabanı, adlı `archetype-param`/`control`/`node-param`
      boyutları, aralık/seçenek, `exclude` kuralı, mekanik filtre, toplu
      bütçe), `scrambled-halton` v1 (önek kararlı, tabakalı), iki aşama:
      render'sız plan/ön-denetim → seri yürütme; aday kimliği program özeti +
      tohum + strateji + render sürümünden. Kanıt:
      `tests/search/crossProcess.test.ts` iki taze süreçte (biri anahtarları ve
      boyut sırasını ters) aynı sıra/kimlik/program/PCM ve bayt bayt aynı
      rapor; bütçe aşımı `BatchBudgetError` + sıfır dosya
      (`tests/protocol/search.test.ts`); render öncesi geçersizler ve
      filtrelenen adaylar gerekçesiyle raporda (`tests/search/plan.test.ts`).
      Referans: `audio-searches/reference-shell` (4 boyut, 16 aday; 13 passed,
      2 filtered, 1 invalid), `audio:production-check` her koşuda yeniden
      üretir. Terfi (`promote`) onaylı adayın TAM programını `origin.json` ile
      job'a yazar; publish yalnız kanonik akıştan. (Dalga 4)
- [x] **[P2] `SoundFamily` kalite ölçüsü.** `assessFamily` →
      `SoundFamilyQualityReportV1`: exact duplicate PCM sert hata, çift uzaklığı
      dağılımı + yakın-özdeş çift + aile çökmesi (çeşitlilik), sağlam z-skoru
      aykırıları + beyanlı oran sınırları (tutarlılık); perde yalnız YIN
      güvenilirse; tek skor yok. Kanıt: `tests/analysis/family.test.ts` —
      kopya FAIL, yakın-özdeş çeşitlilik sorunu, çökmüş aile, aşırı aykırı
      raporlanır, sağlıklı 8 üyeli aile geçer. Üretim akışına bağlanması
      Dalga 5'in aile kapısıdır. (Dalga 4)
- [x] **[P2] Organik canary benchmark paketi (mühendislik).** Sekiz sürümlü
      görev (`canaries/*.json`): deterministik kaynak + mekanik beklenti +
      dinleme rehberi; `audio:job canary run`. Kanıt:
      `tests/canary/canaries.test.ts` — sekizi geçer, deterministik, beklenti
      mutasyonla düşer; o turun dinleme incelemeleri `pending-human` idi.
      İnsan dinlemesi ayrı açık madde. (Dalga 4)
- [x] **[P2] Candidate audition aracı.** `search audition <id> [--serve]`:
      git-dışı WAV + bağımlılıksız sayfa; 127.0.0.1 sunucusu yalnız
      `selection.json` (`SearchSelectionV1`) yazar. Kanıt:
      `tests/protocol/auditionServer.test.ts` — loopback, Host/Origin/JSON/
      gövde sınırı, gezinme 404, `</script>` kaçışı, karar taze süreçte
      yeniden kurulur; terfi aynı kararı okur. Gerçek bir insan seçimi henüz
      yapılmadı. (Dalga 4)
- [x] **[P2] Deterministik micro-event engine.** Zaman-yeniden-ölçekleme
      ile örnek-doğru, zamanla değişen oranlı zamanlama; `regularity`
      (Poisson ↔ periyodik) ve `clustering` sürekli eksenler; zamanlama ve
      varyasyon ayrı alt akışlar; katman başına 20000 olay tavanı + render
      öncesi bütçe. Kanıt: `tests/program/events.test.ts` — aynı tohumda
      çizelge birebir; 24 tohumluk korpusta sayım ortalaması λ = oran·süre
      etrafında ve oranla kesin monoton; Poisson varyans/ortalama ≈ 1,
      periyodik ≈ 0; sıfır oran/kısa süre/yüksek oran/sınır kenarları. (Dalga 3)
- [x] **[P2] Fluid/bubble sentez ailesi.** `source.bubble`, `source.bubbles`,
      `source.gurgle`: Minnaert rezonansı + van den Doel (2005) sönüm/
      yükselme; yaklaşım ve geçerlik alanı (0.1–20 mm, yüzey gerilimi yok)
      registry'de ve DESIGN'da. Kanıt: yarıçap 1→8 mm'de ölçülen tepe
      Minnaert'in ±%5'inde ve kesin azalan; sönüm çarpanı 0.5→4'te −40 dB
      süresi kesin kısalır; büyük nüfus bütçede reddedilir. (Dalga 3)
- [x] **[P2] Organik vokal kaynağı.** `source.glottal`: BLIT darbe dizisi
      (alias yok), gerilim eğimi, döngü eşzamanlı jitter/shimmer,
      alt-harmonik, açılma fazına kilitli nefes; formant ayrı düğüm. Aynı
      kaynakla cat-like / bark-like / alien air-sac aileleri YALNIZ program
      değiştirerek (`tests/fixtures/vocalFamilies.ts`); testler perde
      konturunu, formant hareketini, atak süresini, alt-harmonik oranını,
      spektral düzlüğü ve kese rezonansını ölçer. "Gerçek kedi gibi" iddiası
      yok — dinleme yapılmadı; dinleme dosyaları `audio:audition` ile
      git-dışı `export/audition/`e yazılır. (Dalga 3)
- [x] **[P2] Genel cavity/tube waveguide.** `resonator.tube`: gidiş-dönüş
      gecikme hattı + uç yansıma işareti + uç kaybı; `airColumn` kopyası
      değil. Kanıt: açık/kapalı (2n−1)·c/4L ve açık/açık n·c/2L modları
      ±%2'de, çift harmonik konumları > 20 dB zayıf; uzunluk↑ → temel↓;
      uzunluk taraması kararlı ve tıksız. Maliyet kıyası
      (`bench:resonators`): tüp ~218 harmoniği 3.3 ms/sn, modal 32 mod
      3.8 ms/sn, aynı 218 harmonik modal ile ≈ 26 ms/sn. (Dalga 3)
- [x] **[P2] AcousticArchetype katmanı.** Altı aile (fluid-creature,
      membrane-creature, air-sac-creature, chitin-clicker, resonant-shell,
      vocal-tube): topoloji + makro uzayı + varyasyon politikası registry'de;
      `Acoustic.expandArchetype` saf ve deterministik program belgesi üretir.
      Kanıt: `tests/program/archetypes.test.ts` — her aile için 8 varyasyon
      geçerli, deterministik, topolojisi sözleşmeyle aynı, PCM'leri ikişer
      ikişer farklı; aile değişmezleri sekizinde de tutar; 27 archetype yön
      iddiasının hepsi ölçümle kesin monoton; aralık dışı/bilinmeyen/yapısal
      olarak geçersiz istek render'dan önce reddedilir. (Dalga 3)

- [x] **[P1] Genel Gesture/automation sistemi.** `curve.linear`,
      `curve.cosine` (C1), `curve.exponential` (geometrik), `curve.spline`
      (PCHIP; aşımsız C1 — gerekçesi aralık denetiminin noktalarda yeterli
      olması). Bağlama dilbilgisi `{ value?, gesture?, modulate }`, makro
      çarpanları ve aralık kırpma tek sırayla. Kanıt:
      `tests/program/gestures.test.ts` — aynı testere kaynağında perde +
      basınç + rezonans üç ayrı gesture ile sürülür, ölçülen perde/seviye/
      ağırlık merkezi kesin monoton, tık adayı sıfır, render deterministik;
      basamak 48 kHz'te tam 24000. örnekte; 64 rastgele kümede spline aşımı yok.
      (7641e22)
- [x] **[P1] Korelasyonlu stokastik modülasyon.** `modulator.drift`, `walk`
      (Ornstein–Uhlenbeck), `sample-glide`, `jitter`, `shimmer`; her biri
      `modulator:<ad>/<etiket>` alt akışında. Kanıt: alfabetik olarak önce
      gelen bir bubble akışı + katman eklendiğinde perde katmanı bit-eşit;
      32 tohumluk korpusta sınırlılık, sıfır ortalama, OU sapması ve
      korelasyon süresi, drift eğim sınırı, jitter döngü sayımı. (7641e22)
- [x] **[P1] Exciter → Resonator → Articulator.** `exciter.impact`,
      `exciter.membrane` (burkulan zar/tık dizisi), `exciter.turbulence`;
      `resonator.modal`, `resonator.cavity`, `resonator.formant`;
      `articulation.amplitude`. Dokuz exciter×rezonatör birleşimi aynı
      program yüzeyinde, rezonans tepesi beklenenin ±%8'inde. Eski enstrüman
      modelleri yeniden yazılmadı (program yüzeyi onları sarmaz; ikisi yan
      yana yaşar). (7641e22)
- [x] **[P2] Zamanla değişen modal banka.** Karmaşık faz döndürücü modlar:
      frekans/T60 örnek başına değişir, durum büyüklüğü korunur, r < 1.
      Kanıt: body-size gesture'ı ile mod frekansı 220 → 440 Hz monoton
      yükselir; gürültü uyarımında linear/cosine/spline taramalarında tık
      adayı 0; 20 Hz↔11 kHz / T60 5 ms↔30 sn taraması sonlu ve sınırlı. (7641e22)
- [x] **[P2] Makro akustik kontroller.** `body-size`, `tension`, `pressure`,
      `wetness`, `viscosity`, `roughness`, `cavity-size`, `airiness`,
      `instability` — registry'de hedef (`primitive.param`, yasa, açıklık),
      aralık/birim ve yön; `context` hedefleri açar. Kanıt:
      `tests/program/macros.test.ts` — dokuz makronun yazılı yönü beş
      konumda kesin monoton; 0.5 nötr (bit-eşit); etkisiz/tekrarlanan/
      otomasyonsuz hedefe gesture'lı makro reddedilir. (7641e22)

- [x] **[P1] OGG üretiminin araç zinciri manifest'e alınıyor** (Dalga 1
      `AudioAssetManifestV1` absorbe etti). Kanonik kimlik PCM özetidir
      (kodlayıcıya giden kelepçeli float32 + biçim başlığı); manifest FFmpeg
      sürüm satırını, libavcodec/libavformat/libavutil sürümlerini,
      kodlayıcı argümanlarını ve bunların parmak izini taşır. `verify`
      `identical`/`encoder-only`/`encoder-nondeterministic`/`pcm-changed`
      ayırır; kalite 5 ile üretilmiş bir kayıt gerçek yeniden kodlamayla
      `encoder-only` sınıflanır (PCM aynı). libvorbis sürümü FFmpeg
      tarafından raporlanmaz — manifest'te `unreported` olarak yazılı. (b471e1d)
- [x] **[P1] Sürümlü `AudioJob` protokolü.** `AudioJobV1` ve durum
      komutu (`audio:job status`): etkin aşama ve `next.action` yalnız dosyalardan hesaplanır;
      atomik yazım, pid'li tek yazıcı kilidi, `modified`/`corrupt`/`stale`
      durumları. Kanıt: `tests/protocol/cli.test.ts` — süreç A işi render'da
      bırakır, AYRI süreç B `status --json` ile `analyze` adımını bulur ve işi
      bitirir. (b471e1d)
- [x] **[P1] `AudioBriefV1` discriminated union.** `kind: 'acoustic'`
      (`sfx | organic | ambience`) tanımlı; `kind: 'music'` Dalga 6
      `MusicBriefV1`e ayrılmış uzatma noktasıdır ve `unsupported` ile
      reddedilir — müzik alanı akustik brief'e `unknown-key` ile sızamaz.
      Bilinmeyen kind/subtype render'dan önce adlı hata verir; brief şeması,
      özeti ve belgesi manifest'e yazılır. (b471e1d)
- [x] **[P1] `AcousticProgramV1` kanonik program.** Registry kimliği +
      sürümüyle anılan düğümler, sınırlı topoloji, gesture bağları;
      bilinmeyen alan/kimlik/sürüm/tür render'dan önce reddedilir. Aynı
      program + tohum + render sürümü aynı PCM (test + referans fixture'ın
      her `audio-verify` koşusunda yeniden render'ı). (b471e1d)
- [x] **[P1] Registry tek kaynak.** Kayıt: birim/aralık/varsayılan,
      parametre başına yön ilişkisi, determinizm, maliyet modeli, yetenek
      etiketi. `tests/governance/registry.test.ts` eksik metadata'yı VE
      değiştirildiğinde PCM'i değiştirmeyen (implementasyona bağlı olmayan)
      parametreyi düşürür. (b471e1d)
- [x] **[P1] `audio:job context --json`.** Registry izdüşümü, şemalar,
      politika, bütçe, bilinen sınırlamalar ve publish hedefleri çalışan
      koddan; zaman damgasız ve sıralı. Registry kaydı eklenince context'te
      otomatik görünür (test eşitliği). Aktif oyun hedefi olmadığını açıkça
      söyler; oyun hedefi `AudioTargetV1` beyanıyla açılır. (b471e1d)
- [x] **[P1] Özet zinciri.** brief → program → render → analiz → seçim →
      yayın kenarları kanonik JSON SHA-256'sıyla bağlı. Program değişince
      eski analiz/seçim `stale`, publish `stale` ile reddedilir; başka
      render'ın analizine işaret eden seçim de reddedilir. (b471e1d)
- [x] **[P1] `AudioAnalysisReportV1` + `analyzeAudio()`.** Süre, kanal/örnek
      tepe, true peak, RMS/LUFS, DC, kırpma, tık adayı, crest, stereo
      ilinti/genişlik, spektral (ağırlık merkezi, rolloff, düzlük, tepe, bant
      seviyeleri) ve zamansal tanımlayıcılar; `measuredFrom` kaynağı söyler.
      `audio-qa` artık aynı çekirdeği tüketir; CLI ile kütüphane aynı
      kodlanmış fixture'da BİREBİR aynı raporu verir
      (`tests/analysis/qaParity.test.ts`); analizör sürümü manifest'te. (b471e1d)
- [x] **[P1] `AudioAssetManifestV1`.** Gömülü brief/program, tohum,
      renderId, PCM özeti, kodlanmış bayt özeti, araç zinciri, kodek sonrası
      analiz, politika ve entegrasyon; job dizini silinse bile asset
      yalnız manifest'ten yeniden üretilip doğrulanır. (b471e1d)
- [x] **[P1] Tek kanonik publish kapısı.** `publishJob`: özet zinciri →
      hedef/yol/sınıf → yeniden render + PCM kimliği → staging kodlama →
      kodek sonrası politika → manifest → atomik rename. Politika düşerse
      hiçbir dosya yazılmaz; manifest'siz/başka işe ait dosyanın üzerine
      yazılmaz; frozen hedef reddedilir. `publishPath.test.ts` aktif
      ağaçlarda yeni yazıcı yolunu düşürür. Kapanış sapması (dürüst): aktif
      bir oyunun production asset'i YOK ve frozen asset'ler değiştirilemez;
      kapı audio-synth'in kendi üretim-referans işiyle
      (`audio-jobs/platform-reference`) uçtan uca çalıştırıldı ve
      `just audio-verify` onu her koşuda manifest'inden yeniden üretip
      kodek sonrası doğrular. (b471e1d)
- [x] **[P2] Agent/vendor adapter ince.** README "Agent protokolü" bölümü
      yalnız `audio:job context --json`a yönlendirir; governance testi
      adapter metninde herhangi bir registry kimliği geçmesini reddeder.
      (b471e1d)

- [x] **[P1] `Reverb.decay` RT60 saniyesi oldu.** Comb kazancı g = 10^(−3·D/T60)
      (her comb kendi gecikmesinden); gerçek allpass difüzörler, wet enerji
      normalizasyonu, 20 Hz DC engelleyici; `tailSeconds` = ön gecikme +
      taşıma gecikmesi + RT60. Ölçülen T30: istenen 0.8/1.4/2.2/3.5 sn →
      0.800/1.400/2.200/3.500 sn; `tests/reverbDecay.test.ts`. (dd44c07)
- [x] **[P1] İç içe parametreler tek sınırdan geçiyor (`src/guard/`).**
      NaN/Infinity, yanlış tip, bilinmeyen alan, eksik zorunlu alan ve
      belgelenmiş aralık dışı değer tampon ayrılmadan `AudioParamError` ile
      tam yoluyla reddedilir (`reverb.decay`, `lfos[1].rate`,
      `lowpass.envelope.release`); NaN aralık tabanına sabitlenmez. Kelepçe
      yalnız belgelenmiş Nyquist/kararlılık tavanlarında ve model
      şekillendirme alanlarında kalır. Her efekt sınıfı NaN testli. (dd44c07)
- [x] **[P2] `downsample2x` ara tamponu kalktı; `repeat` görünmez iş yapmıyor.**
      Decimator yalnız çıkış tamponu ayırır (sonra halfband FIR'a geçti);
      tampon tam `duration + (repeat − 1)·repeatTime` sürer (600 sn kelepçesi
      kalktı), aşırı istek bütçede düşer. Ölçülen: 600 sn / 48 kHz stereo
      tepe RSS 740 → 632 MiB. (dd44c07, 4d12cb1)
- [x] **[P3] Piyano gövde rezonansı stereo.** Sağ kanal `phaseR` kullanır;
      gövde bileşeni L/R'de eşit enerjili ama farklı. (dd44c07)
- [x] **[P3] Yaylı `gain` yalnız çıkış seviyesi.** Osilatörlerden çıkarıldı;
      out(g) = g·out(1) değişmezi 6e-9 hassasiyetle tutar (eski 1.8e-2). (dd44c07)
- [x] **[P3] `compose()` flanger/phaser'ı bir kez uygular.** `compose` kanonik
      mix veriyolu üzerinde ince adaptör; bus anahtarları tek listeden
      (`BUS_EFFECT_KEYS`) ayıklanır, nota başına bus efekti reddedilir. Test:
      5 ms'lik saf gecikme flanger çıktıyı 5 ms kaydırır (eski 10 ms).
- [x] **[P3] `Timeline` yüksekliği yalnız tutulan aralıkta ölçer.** Kırpma
      ölçümden önce; `tailSeconds` 0.5 ile 8 aynı RMS'i verir.
- [x] **[P3] Aynı `Timeline`'da ardışık `render()` birebir aynı.**
      İnsanlaştırma durumsuz (`stableJitter(tohum, olay)`).
- [x] **[P3] WAV `WAVE_FORMAT_EXTENSIBLE` alt alanları okunuyor.** cbSize, tam
      SubFormat GUID, `wValidBitsPerSample` maskesi, `dwChannelMask`; belirsiz
      düzen (5.1, LFE'li çift, konumsuz 2+ kanal) reddedilir. (4d12cb1)
- [x] **[P3] Loop crossfade güç tamamlayıcı ve sürekli.** İlintiye uyarlı
      eğri (Fink/Holters/Zölzer); sınırdan sonra `samples[F]`. Geçiş ortası
      −2.82 → −0.07 dB; tur sıçraması 0.996 → yok. (4d12cb1)
- [x] **[P3] QA kırpması kanal örneği cinsinden.** Kanal başına sayı, toplam
      kanal örneği ve etkilenen çerçeve ayrı raporlanır.
- [x] **[P1] Tek aktif düzenleme/mastering yolu.** `arrange/mix.ts` (veriyolu:
      normalize etmez, loop kuyruğu sarar, durumsuz insanlaştırma) +
      `engine/master.ts` (tek seviye çekirdeği: DC → kazanç → sınırlayıcı →
      tavan → sönüm); `synthesize` çıkışı, `compose` ve `Timeline` onu
      kullanır.
- [x] **[P2] `resampleLinear` → `resample` (Kaiser sinc, A = 96 dB).** 2× aşağı
      örneklemede alias −3.3…−16.7 dB → ≤ −101 dB; yukarı görüntü −18 → −115
      dB; bütçe −90 dB. (4d12cb1)
- [x] **[P1] Render kaynak bütçesi.** Bellek (canlı tampon üst sınırı) + iş
      (≈10 ns'ye kalibre birim) ayırmadan önce denetlenir; `synthesize`,
      modeller, mix, `processSample` ve writer. Varsayılan 1.5 GiB / 6e9;
      `bench:budget` referans ölçümü DESIGN'da. `writeOgg` tek tampon tepeyi
      yükseltmiyor (ölçülen), akış gerekmedi. (dd44c07, 4d12cb1)
- [x] **[P1] Kodek sonrası sınıf bazlı true-peak/loudness QA.** BS.1770-5
      LUFS (integrated / en yüksek momentary), 4× true peak, makine-okunur
      `ASSET_CLASS_POLICIES` (ui/sfx/ambience/music, −1 dBTP). EBU Tech 3341
      testleri geçer; FFmpeg ebur128 ile fark ≤ 0.052 LU / 0.049 dB.
      `just audio-verify` referans denetimini ve aktif ses ağaçlarının
      politikasını raporlar.
- [x] **[P2] Filtre `poles`/`type` birleşimi sessizce değişmiyor.** 1 kutup +
      bandpass/notch `combination` hatası; 1 kutupta `type` yuvayı ezer.
      (dd44c07)
- [x] **[P3] FM spektral alias regresyon paketi.** Kafes yöntemli ölçüm, 1200
      noktalı ızgaradan makine-okunur `FM_ALIAS_LIMITS` ve
      `Analysis.assessFmAlias`; paket "yanlış güvenli yok" sözleşmesini her
      koşuda ölçer. Ölçülmüş motor iyileştirmesi: halfband decimator (sinüs
      modülatör + feedback 0 tüm ızgarada ≤ −82 dB). (4d12cb1)
- [x] **[P3] Kenarlı osilatörlerin (PolyBLEP) kendi alias'ı.** İki örneklik
      PolyBLEP yerine durumsuz bant sınırlı basamak rezidüeli
      (`waveforms.ts` `blepResidual`: ±16 örneklik Kaiser pencereli sinc
      integrali) hem motor osilatörüne hem retro çekirdeğe uygulandı;
      retro tarafında kenar-zamanı semantiği düzeltildi. Ölçüm ızgarası
      `scripts/polyblep-alias-report.ts`: 3.6 kHz testere motor ve retro
      −88.3 dB (F6a hedefi −70; eski çekirdek −47 idi), bütün ızgara
      ≤ −87 dB. Kilitler `tests/oscillatorAlias.test.ts` (motor) ve
      `tests/retro.test.ts` (retro), ölçülenin 2 dB üstünde.
      `polyblep-alias` sınırlaması ve `limitationRisks` emekliye ayrıldı — >1 kHz risk bayrağı ölçülen değerlerle yanlış pozitif üretiyordu.
      Bilinçli retro kırıntısı (`bits`/`holdHz`, çıkış oranında) korunuyor.
      PM altında rezidüel kenar-zamanı hatası FM alias'ını kenarlı
      taşıyıcıda ~3 dB kötüleştirdi; `FM_ALIAS_LIMITS`'e ölçülmüş
      `carrier-edge`/`carrier-triangle` sınıfları eklendi. FM ızgarası
      4800 noktaya (dört taşıyıcı dalga) genişletildi: üçgen taşıyıcı +
      kenarlı modülatör sınıfı `carrier-triangle-feedback`'e ayrıldı,
      `carrier-triangle` dikkat sınırı ölçülen ilk kırılıma (Δf=10 kHz)
      indirildi; korumada Δf=0'a sıkışan noktalar taşıyıcı tabanı olarak
      ayrı raporlanır (değerlendirme yalnız FM kaynaklı katlanmayı iddia
      eder). Son ızgara: 4500 FM noktasında yanlış "güvenli" 0, iyimser
      "dikkat" 0. `PROGRAM_RENDERER_VERSION`/`MUSIC_RENDERER_VERSION`
      1→2; `reference-loop/mix` ve `reference-arcade` (mix, intro, ending,
      power-up) kanonik `music publish` ile yeniden yayımlandı,
      `encode-profiles.lock.json` yeniden ölçüldü; kalan 31 manifest
      bit-eşit. (Dalga F6)
