# @volstudio/audio-synth — iş listesi

> **TODO disiplini:** Açık iş `[ ]`, biten iş `[x]` olur. Biten madde silinmez;
> kısa hâliyle dosyanın sonundaki `## Kapatılanlar` bölümüne taşınır. Eksik
> çıkan bir kapanış yeni bir `[ ]` maddeyle yeniden açılır.

Mimari, sınırlar ve doğrulama komutları için [DESIGN.md](DESIGN.md); repo
geneli işler kök [TODO.md](../../TODO.md)'de.

## Açık

- [ ] **[P1] OGG üretiminin araç zinciri manifest'e alınmıyor.** ~~[P3]~~ →
      **P1**: aşağıdaki Dalga 1'deki `AudioAssetManifestV1` maddesinin
      toolchain/PCM-hash alanları bunu ZATEN kapsıyor; iki madde ÇAKIŞMASIN
      diye bu madde KAPATILMAZ, `AudioAssetManifestV1` implementasyonu onu
      absorbe edebilir (o zaman bu satır tek cümleyle kapanıp Kapatılanlar'a
      geçer). `writeOgg` (`src/writer.ts:189-261`) `-bitexact` ile PCM'den
      türeyen baytları SABİT tutuyor (kendi yorumu bunu açıkça belgeliyor)
      ama hangi FFmpeg/libvorbis sürümüyle üretildiği hiçbir yerde
      saklanmıyor; "PCM değişmedi, container baytı araç sürümü yüzünden
      değişti" durumu ile gerçek bir ses değişikliği bu yüzden otomatik
      ayırt edilemiyor. Kapanır: PCM hash'i canonical bir kimlik olur;
      FFmpeg/libvorbis sürümü build manifest'inde saklanır ya da release
      araç zinciri pinlenir.
      _Dalga 0 notu (2026-09-22): bilinçli olarak açık bırakıldı — sahibi
      Dalga 1 `AudioAssetManifestV1`. QA raporu (`audio-qa --json`) bugün
      FFmpeg sürüm satırını yazıyor; bu bir ölçüm yardımcısıdır, provenance
      sözleşmesi değildir._
- [ ] **[P3] Kenarlı osilatörlerin (PolyBLEP) kendi alias'ı ölçüldü; üst
      notalarda duyulabilir bölgede.** Dalga 0 FM karakterizasyonu sırasında
      FM'siz testere/kare de kafes yöntemiyle ölçüldü (halfband decimator
      sonrası, 44.1 kHz): 233 Hz ≈ −69 dB, 917 Hz −54 dB, 3.6 kHz −47 dB
      alias/sinyal. Decimator artık iç Nyquist altını katlamıyor; kalan pay
      2 örneklik PolyBLEP düzeltmesinin iç örnek oranında bıraktığı
      katlanmadır. Kapanır: kenarlı dalgalarda daha yüksek dereceli bant
      sınırlama (ör. minBLEP/BLAMP ya da osilatör düzeyinde yerel aşırı
      örnekleme) ölçülerek seçilir; 3.6 kHz testere alias'ı −70 dB altına
      iner ve `scripts/fm-alias-report.ts` benzeri bir ızgarayla kilitlenir.

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

- [ ] **[P1] Sürümlü `AudioJob` çalışma protokolü kurulsun.** Bir audio işi
      yalnız chat bağlamında yaşamaz; `jobId`, hedef oyun/paket, `kind`,
      protocol sürümü, aktif aşama, brief/program/analysis/selection/manifest
      yolları ve production durumu machine-readable bir job state'te yaşar.
      Agent değişse bile işin durumu kaybolmaz. Kapanır: process/agent A işi
      yarıda bırakır; bağımsız process/agent B önceki chat'i görmeden yalnız
      `audio:job status` ve repo dosyalarıyla doğru sonraki aşamayı
      belirleyebilir.
- [ ] **[P1] `AudioBriefV1` ortak brief zarfı ve discriminated-union sözleşmesi
      olsun.** Ortak kimlik/intent/provenance alanlarını taşır; ses tasarımı
      tarafında `AcousticBriefV1` (`sfx | organic | ambience`) Dalga 1'de
      tanımlanır, müzik kolu ise Dalga 6'nın `MusicBriefV1` sözleşmesine
      referans verir. `AudioBriefV1` müziğe özgü ikinci bir alan kümesi
      TANIMLAMAZ — role/BPM/meter/tonal dil gibi müzik alanları yalnız
      `MusicBriefV1`de yaşar. Serbest doğal dil açıklama korunur fakat
      programın tek machine-readable kaynağı değildir. Kapanır:
      `AudioBriefV1 = AcousticBriefV1 | MusicBriefV1` benzeri tek
      discriminated union vardır; aynı müzik isteğinin iki farklı geçerli
      brief şeması oluşamaz; unknown kind ve subtype alanı render başlamadan
      named validation error verir; brief sürümü production manifest'e
      yazılır.
- [ ] **[P1] `AcousticProgramV1` non-music ses tasarımının kanonik program
      formatı olsun.** Program JSON-serializable ve deterministic olur;
      source / exciter / resonator / gesture / effect / semantic control
      referanslarını registry kimlikleriyle taşır. Agent doğrudan rastgele
      TypeScript `SynthParams` script'i yazmak zorunda kalmaz. Kapanır: aynı
      program + seed + engine sürümü aynı PCM'i verir; unknown
      primitive/control program validation sırasında reddedilir.
- [ ] **[P1] Primitive/archetype/control registry agent-facing metadata'nın
      tek kaynağı olsun.** Her kayıt stable id, sürüm, açıklama, geçerli
      parametre aralıkları, birimler, causal/semantic etkiler,
      determinism/resource metadata'sı ve capability tag'leri taşır. Kapanır:
      registry'deki metadata eksikse governance testi kırılır; README/agent
      dosyasındaki elle tutulmuş ikinci primitive kataloğu kanonik kaynak
      sayılmaz.
- [ ] **[P1] `audio:job context --json` gerçek registry ve hedef runtime
      capability'lerinden üretilsin.** Agent desteklenen primitive,
      archetype/control, known limitation, production policy ve hedef
      oyunun runtime audio kabiliyetlerini tek komuttan öğrenir. Kapanır:
      yeni registry primitive'i eklendiğinde context çıktısında otomatik
      görünür; agent adapter dosyası ayrıca güncellenmek zorunda kalmaz.
- [ ] **[P1] Job state; brief, program, render, analysis ve selection
      artifact'lerini birbirine hash ile bağlasın.** Eski programdan kalmış
      analysis veya başka candidate'a ait selection sessizce production'a
      taşınamaz. Kapanır: program değiştirildikten sonra eski
      analysis/selection `stale` kabul edilir ve `audio:job status` bunu
      açıkça raporlar.
- [ ] **[P1] `AudioAnalysisReportV1` ve reusable `analyzeAudio()` yüzeyi
      oluşturulsun.** QA ölçümleri yalnız `scripts/audio-qa.ts` CLI
      implementasyonu içinde yaşamaz; PCM ve final encoded/decoded asset
      üzerinde çalışan kanonik library API en az duration, channel/sample
      peak, true peak, RMS/LUFS, DC, clip/click, crest, stereo
      correlation/width ve temel spectral/temporal descriptor'ları
      machine-readable ve sürümlü bir rapora dönüştürür. CLI,
      candidate-search, `SoundFamily` QA, audition, reference regression ve
      production publish AYNI analiz çekirdeğini tüketir. Kapanır: library
      API ile `audio-verify` aynı fixture için ortak alanlarda birebir aynı
      sonucu verir; final production raporunun encoded dosyadan mı yoksa
      source PCM'den mi ölçüldüğü metadata'da açıktır; analyzer schema
      sürümü `AudioAssetManifestV1`e yazılır.
- [ ] **[P1] `AudioAssetManifestV1` production provenance'ın kanonik
      sözleşmesi olsun.** En az asset id, job/brief/program sürüm ve
      hash'leri, seed, engine sürümü/commit, canonical PCM hash,
      encoder/toolchain bilgisi (bkz. yukarıdaki OGG araç zinciri maddesi —
      bu madde onu absorbe edebilir), `AudioAnalysisReportV1` sonucu, encoded
      asset hash'i ve integration/playback metadata'sını taşır. Kapanır:
      yalnız repo manifest'inden bir asset'in hangi program ve toolchain ile
      üretildiği belirlenebilir; PCM değişikliği ile yalnız container/encoder
      değişikliği birbirinden ayrılır.
- [ ] **[P1] Production publish tek kanonik kapıdan geçsin.** Production
      asset yalnız `writeOgg()` çağrısıyla oluşturulmuş sahipsiz bir dosya
      olamaz; publish brief/program/seed/PCM hash/`AudioAnalysisReportV1`/
      toolchain ve integration metadata'sını `AudioAssetManifestV1` üzerinden
      doğrular. Oyun script'lerinde yeni paralel publish yolu governance
      testinde reddedilir. Kapanır: en az bir mevcut production asset yeni
      yol üzerinden yeniden üretilip decoded çıktı açısından doğrulanır.
- [ ] **[P2] Agent/vendor talimatları ince adapter olarak kalsın.**
      `AGENTS.md`, skill veya başka modele özel dosya bütün DSP bilgisini
      tekrar etmez; yalnız kanonik `context`→`brief`→`program`→
      `render/search`→`analyze`→`select`→`publish` protokolüne yönlendirir.
      Kapanır: registry/schema değiştiğinde model-adapter metninin parametre
      tablosu güncellenmez; gerçek davranış executable context'ten gelir.

### Dalga 2 — organiklik çekirdeği

- [ ] **[P1] Genel Gesture/automation sistemi kurulsun.** Pitch/gain ile
      sınırlı olmayan, JSON-serializable zaman eğrileri (linear, cosine/smooth,
      exponential ve gerekirse spline) fiziksel/makro kontrollere bağlanır;
      sample-accurate ve deterministiktir. Kapanır: aynı oscillator üzerinde
      pitch+pressure+resonance üç ayrı gesture ile sürülebilir; boundary ve
      tekrar determinism testleri vardır.
- [ ] **[P1] Korelasyonlu stochastic modulation primitive'leri gelsin.**
      Smooth drift, bounded random walk/mean-reverting drift, sample-and-glide,
      jitter ve shimmer eklenir. Her subsystem isimden türeyen bağımsız PRNG
      substream kullanır; yeni bir stochastic modül eklemek eski modüllerin
      random dizisini kaydırmaz. Kapanır: pitch stream'ine dokunmadan bubble
      stream'i eklenince pitch örnekleri birebir aynı kalır.
- [ ] **[P1] Sentez mimarisine genel Exciter → Resonator → Articulator
      programı eklensin.** Mevcut instrument modelleri mümkün olduğu yerde bu
      primitive'leri tüketir; agent yeni organik ses için ayrı monolitik synth
      yazmak zorunda kalmaz. Kapanır: en az impact/membrane/noise exciter ve
      modal/cavity/formant resonator aynı program yüzeyinde yeniden
      kombine edilebilir.
- [ ] **[P2] Zamanla değişebilen genel modal-resonator bankası gelsin.** Mod
      frekansı, gain'i ve decay/Q'su Gesture tarafından güvenli şekilde
      değişebilir; katsayı/state geçişleri artefakt üretmeyecek biçimde
      yumuşatılır. Kapanır: "body size küçülüyor" senaryosunda modların
      ölçülen frekansı beklenen yönde sürekli hareket eder, click/NaN oluşmaz.
- [ ] **[P2] Agent-facing makro akustik kontroller eklensin.** `bodySize`,
      `tension`, `pressure`, `wetness`, `viscosity`, `roughness`, `cavitySize`,
      `airiness`, `instability` gibi kontrollere causal mapping yazılır;
      yalnız isim değişikliği yapılmaz. Kapanır: her control registry'de
      etkilediği DSP boyutlarını ve geçerli aralığını açıklar; kritik yön
      ilişkileri property testlerle kilitlenir.

### Dalga 3 — biyolojik yapı taşları

- [ ] **[P2] Deterministik micro-event engine eklensin.** Bubble/click/
      droplet/surface-pop gibi olaylar rate + distribution + seed ile
      zamanlanır; yüzlerce mikro olay tek bir ses programına katılabilir.
      Kapanır: event schedule aynı seed'de birebir; rate arttıkça ölçülen
      event yoğunluğu beklenen aralıkta monoton artar.
- [ ] **[P2] Fluid/bubble sentez ailesi eklensin.** Tek bubble + bubble
      population + fluid pulse/gurgle yapı taşları; bubble boyutu,
      damping/viscosity-benzeri kontroller ve mikro olay dağılımı içerir.
      Kapanır: bubble size büyüdükçe temel rezonansın beklenen yönde düştüğü
      spektral testle, viscosity/damping arttıkça kuyruğun kısaldığı impulse
      testiyle kilitlenir.
- [ ] **[P2] Organik vokal kaynağı geliştirilsin.** Formant rezonatörü ayrı
      kalsın; voiced/glottal-benzeri exciter, pitch gesture, dynamic formants,
      breath/turbulence, jitter/shimmer ve kontrollü subharmonic/irregularity
      eklenir. Kapanır: aynı kaynakla en az cat-like, bark-like ve yabancı
      air-sac gesture'ı yalnız program değiştirerek üretilebilir; otomatik
      test fiziksel/spektral özellikleri sınar, "gerçek kedi gibi" iddiası
      insan/audio-capable audition olmadan yapılmaz.
- [ ] **[P2] Genel cavity/tube waveguide araştırılıp primitive olarak
      eklensin.** Mevcut `airColumn`ı kopyalamak yerine reusable
      delay-line/reflection yüzeyi oluşturulur. Kapanır: açık/kapalı tüp mod
      ilişkileri ve length↑ → resonance↓ davranışı testte ölçülür; performans
      mevcut modal yaklaşım ile karşılaştırılır.
- [ ] **[P2] Preset'in üstüne AcousticArchetype katmanı gelsin.**
      `FluidCreature`, `MembraneCreature`, `AirSacCreature`, `ChitinClicker`,
      `ResonantShell`, `VocalTube` gibi archetype'lar ham preset değil;
      exciter/resonator/gesture/topology + macro control space tanımlar.
      Kapanır: bir archetype'tan en az sekiz farklı ama aynı ailede kalan
      deterministic varyasyon üretilebilir.

### Dalga 4 — agent search laboratuvarı ve kalite

- [ ] **[P1] Deterministik candidate-search motoru `AcousticProgram`
      search-space'ini tarayabilsin.** Agent tek bir "mükemmel" sayı tahmin
      etmek yerine semantic/DSP kontroller için geçerli aralıklar ve
      gerektiğinde discrete seçenekler verebilir. Search bounded ve
      seed'lidir; combinatorial grid'i körlemesine patlatmak yerine
      deterministic sampling strategy kullanır. Candidate kimliği program +
      search seed + strategy + engine sürümünden türetilir. Kapanır: iki
      bağımsız koşu aynı candidate program sırasını ve PCM hash'lerini
      üretir; candidate/time/RAM budget aşıldığında render başlamadan named
      error verir; search raporu hangi adayların neden QA/filter aşamasında
      elendiğini saklar.
- [ ] **[P2] `SoundFamily` kalite ölçüsü eklensin.** Tek asset QA'sına ek
      olarak bir varyasyon ailesinde exact duplicate, duration/pitch/centroid
      aşırı sapması ve "hiç varyasyon yok" durumları ölçülür. Kapanır: family
      coherence/diversity için sayısal rapor çıkar; aynı PCM iki kez gelirse
      gate kırılır.
- [ ] **[P2] Organik canary benchmark paketi oluşturulsun.** Breath, bubble,
      droplet, membrane pulse, wet squish, insect-like chirp, cat-like gesture
      ve alien-fluid-call gibi küçük görevler sürümlenir. Kapanır: her görev
      deterministic/mekanik test + kayıtlı audition notu taşır; otomatik skor
      "organik" diye tek başına karar vermez.
- [ ] **[P2] Candidate audition aracı kurulsun.** Search sonucundan yerel
      HTML/benzeri rapor üretilir; play, seed, macro değerleri, descriptor'lar
      ve approve/reject/etiketleme vardır. Kapanır: seçim makine-okunur
      `selection.json`/manifest'e geri yazılır ve sonraki üretim seçimi yeniden
      oluşturabilir.

### Dalga 5 — generic SoundFamily üretimi

- [ ] **[P1] `SoundFamilyProgram`/eşdeğer family tanımı aynı akustik
      kimlikten ilişkili asset varyantları üretebilsin.** Family tek bir
      preset'in random kopyaları değildir; ortak AcousticProgram/archetype
      kimliğini, izin verilen varyasyon boyutlarını, family seed'ini ve her
      varyantın semantik rolünü tanımlar. Kapanır: aynı family en az sekiz
      deterministic varyant üretir; exact duplicate oluşmaz ve her
      varyantın program/seed/provenance'ı manifest'te izlenebilir.
- [ ] **[P1] Offline `SoundFamilyBank` publish formatı oluşturulsun.**
      Family render sonucunda asset dosyalarıyla birlikte stable variant id,
      semantic tags/state, program hash, duration/loudness/descriptor özeti ve
      seçim metadata'sı taşıyan machine-readable bank manifest'i üretir.
      Runtime'ın `audio-synth` kodunu çalıştırmasına gerek kalmaz. Kapanır:
      tamamen offline üretilmiş bir bank yalnız manifest kullanılarak
      deterministic variant lookup yapabilecek yeterli metadata taşır.
- [ ] **[P2] Family varyasyon alanı kontrollü ve yeniden üretilebilir olsun.**
      Varyasyonlar pitch/gain randomizasyonuna indirgenmez; AcousticProgram'ın
      izin verdiği gesture, timbre, micro-event, timing ve başka semantic
      boyutlardan türetilir. Family'nin "aynı kimlik ama aynı dosya değil"
      davranışı `SoundFamily` coherence/diversity analiziyle birlikte
      doğrulanır. Kapanır: family generation seed'i değişmeden yeni bağımsız
      random subsystem eklenmesi stable substream sözleşmesini bozmaz.
- [ ] **[P2] Family bankası runtime/game kavramlarından bağımsız kalsın.**
      `audio-synth` phenotype, organism, enemy, weapon state machine veya
      belirli oyun sınıflarını bilmez; yalnız generic semantic variant
      metadata üretir. Domain nesnesini varyanta bağlayan resolver tüketici
      paketinde yaşar. Kapanır: package kodunda organism phenotype veya başka
      oyun domain tipi import edilmeden SoundFamilyBank üretilebilir.

### Dalga 6 — müzik authoring temeli ve adaptive production sözleşmesi

> Bu dalga tamamlandığında `## Sonraki aşamalar` girişindeki "MusicProgram/
> ThemeBook, stem/adaptive music kuruldu" varsayımı gerçek olur — bugün
> yalnız bir varsayımdır. Bu dalganın "tek düzenleme/mastering yolu"
> prerequisite'i Dalga 0'da `[P1]` olarak kapandı (`## Kapatılanlar`);
> burada İKİNCİ bir kapanış maddesi olarak — çelişkili source-of-truth
> yaratmamak için — tekrarlanmıyor.

- [ ] **[P1] `MusicBriefV1` müzik isteğinin machine-readable sözleşmesi
      olsun.** Role/context, narrative/affect, kaçınılacak estetikler,
      playback modeli, BPM/meter alanı, tonal dil, melodic salience, rhythmic
      density, form, tahmini süre/bars, SFX için spectral-space önceliği ve
      adaptive ihtiyacı tanımlanabilir. Kapanır: "seamless arcade menu loop"
      ile "tek seferlik cinematic cue" aynı belirsiz brief'e düşmez;
      playback/form gibi zorunlu karar eksikse validator explicit hata veya
      karar isteği üretir.
- [ ] **[P1] Oyun/proje başına makine-okunur `ThemeBook`/music bible
      desteklensin.** Tonal/rhythmic language, signature intervals/motifs,
      instrument/palette tercihleri, register/spektral kimlik, ortak stil
      özellikleri ve bilinçli kaçınılacak klişeler tanımlanabilir. Kapanır:
      farklı agent'ların iki ayrı MusicProgram'ı aynı ThemeBook'u
      programatik tüketebilir; override edilmek istenen kural explicit ve
      provenance'lıdır.
- [ ] **[P1] `MusicProgramV1` sembolik score/arrangement'ın kanonik,
      JSON-serializable kaynağı olsun.** Tempo, meter, tonal system, sections,
      harmony, motifs, patterns/events, instrument assignments, lanes/stems,
      automation ve transition marker'ları programda yaşar; beste yalnız
      ad-hoc TypeScript döngülerinde kaybolmaz. Kapanır: program audio render
      edilmeden validate/analyze edilebilir ve sabit engine sürümünde
      deterministic render edilir.
- [ ] **[P1] `Section`/form birinci sınıf müzik kavramı olsun.** Intro/build/
      climax/release veya A/B/C/D yalnız comment değildir; bar range, narrative
      role, target energy, aktif lanes/stems, harmony/motif planı ve transition
      davranışı taşır. Kapanır: symbolic analyzer section bazında yoğunluk,
      register ve başka ölçümleri raporlayabilir.
- [ ] **[P2] Harmony/voicing toolkit MusicProgram'ın ortak primitive'i
      olsun.** Scale/mode/degree/chord function yanında inversion, spread,
      register, voice count ve max movement gibi kontrollü voicing seçenekleri
      taşır. Chromatic/borrowed nota yasaklanmaz. Kapanır: aynı progression
      farklı voicing/register ile deterministic üretilebilir; range veya
      voice-count ihlali sessizce bozuk score üretmez.
- [ ] **[P2] Motif birinci sınıf veri ve provenance taşıyan transform
      kaynağı olsun.** Relative pitch/degree + rhythm ile motif; transpose,
      register shift, rotate, fragment, sequence, augment/diminish ve uygun
      inversion dönüşümlerinden geçebilir. Kapanır: aynı motifin en az üç
      farklı arrangement varyasyonu ortak source id'sine geri izlenebilir.
- [ ] **[P2] Rhythm/Groove/Humanization profilleri instrument/role bağımlı
      olsun.** Bütün notalara aynı random timing yüzdesi uygulanmaz; kick,
      percussion, bass, pad ve lead için ayrı timing/velocity/accent davranışı
      tanımlanabilir. Kapanır: humanize=0 tam grid parity verir; aynı profile +
      seed aynı event zamanlarını üretir.
- [ ] **[P2] Instrument/palette metadata bestecilik için genişlesin.**
      Preferred register, pitch range, role, transient/sustain karakteri,
      polyphony, spektral occupancy ve articulation suitability agent
      context'e çıkar. Kapanır: MusicProgram range dışı veya desteklenmeyen
      kullanımda explicit validation/uyarı üretir.
- [ ] **[P1] `MusicAssetSpec` playback ve üretim metadata'sının tek kaynağı
      olsun.** `id`, path/output identity, BPM, meter, bars/beats, playback
      mode, loop bilgisi, runtime gain, mastering target, stem seti ve
      transition metadata'sı generator ile runtime arasında tekrar edilmez.
      Kapanır: generator ve runtime aynı saf spec'ten türetilir ve drift
      testi ikinci elle yazılmış gerçeği yakalar.
- [ ] **[P1] `loop`, `playlistOneShot` ve `adaptiveLoop` semantiği
      mastering stratejisini de belirlesin.** One-shot doğal outro/reverb
      tail bırakabilir; seamless loop tail wrapping/seam QA ister; adaptive
      loop bütün stemlerde ortak boundary ister. Kapanır: üç playback tipi
      ayrı regression fixture'a sahiptir ve yanlış mastering yolu publish'te
      reddedilir.
- [ ] **[P1] Müzik mastering hedefi yalnız `MusicAssetSpec`/ortak
      production renderer tarafından uygulansın.** Track builder'ın içinde
      ikinci `masterize(... rmsTargetDb ...)` gerçeği kalmaz. Kapanır:
      mastering target spec'te değiştirilince final render ölçümü değişir;
      builder literal'i ile metadata drift'i mümkün değildir.
- [ ] **[P1] `StemBundle` renderer MusicProgram'dan sample-grid hizalı
      stemler ve reference mix üretebilsin.** Foundation/bass/rhythm/harmony/
      motif/texture gibi roller programda tanımlanabilir; bütün stemler aynı
      MusicAssetSpec zaman/loop sözleşmesini paylaşır. Kapanır: en az üç
      stemli bir adaptive fixture runtime'da track restart etmeden vertical
      gain/intensity değişimiyle çalışır.
- [ ] **[P1] Stem-safe mastering bağımsız stem normalizasyonunu
      yasaklasın.** Her stem kendi başına target peak/RMS'e vurulmaz;
      reference/full mix üzerinden belirlenen balance ve ortak scaling
      ilişkisi export'ta korunur. Kapanır: export edilen stemlerin offline
      toplamı reference mix ile tolerans içinde eşleşir ve maksimum
      kombinasyonda clipping oluşmaz.
- [ ] **[P1] Adaptive-state mix kombinasyonları publish öncesi offline
      QA'dan geçsin.** Runtime'ın representative intensity/state noktaları
      stem formülüyle yeniden mixlenir; true peak, loudness, stereo ve stem
      contribution raporlanır. Kapanır: tanımlı minimum/orta/maksimum state
      kombinasyonları policy sınırlarını aşarsa publish başarısız olur.
- [ ] **[P2] Stem synchronization encoded/decoded çıktı üzerinde
      doğrulansın.** Source buffer uzunluğunun eşit olması yeterli değildir;
      final decoded sample rate, süre ve loop boundaries tolerans içinde aynı
      olmalıdır. Kapanır: kasıtlı stem duration/boundary drift fixture'ı
      `audio-verify`i kırar.
- [ ] **[P2] Music transition contract runtime kapasitesini aşan varsayımı
      engellesin.** Track çifti için BPM/meter ilişkisi, crossfade/bar
      alignment, tonal ilişki ve gerekiyorsa stinger/transition asset'i açık
      veridir. Runtime realtime beatmatching veya reharmonization yapmıyorsa
      MusicProgram bunu varsayamaz. Kapanır: unsupported transition
      validator/context tarafından görünür şekilde reddedilir veya explicit
      offline transition çözümü ister.
- [ ] **[P2] Symbolic music analyzer full audio render'dan önce
      çalışsın.** Note/onset density, polyphony, melodic range, register
      occupancy, pitch-class dağılımı, motif recurrence, section contrast ve
      harmonic rhythm gibi mekanik descriptor'lar çıkar. Bu skor "iyi müzik"
      hakemi değildir. Kapanır: brief'te `sparse` denilen kasıtlı aşırı
      yoğun fixture deterministic bir mismatch raporu üretir.
- [ ] **[P2] `MusicProgram` candidate-search'i tam-track brute force yerine
      hiyerarşik çalışsın.** Agent form/harmony/motif/groove gibi kontrollü
      alanlar için birden fazla sembolik aday üretebilir; symbolic analyzer
      düşük maliyetli eleme/raporlama yapar, yalnız finalistler orchestration
      ve full audio render aşamasına geçer. `AcousticProgram` candidate-search
      ile aynı job/seed/provenance sözleşmesini paylaşır fakat onlarca uzun
      parçayı körlemesine render etmez. Kapanır: örnek bir `MusicBriefV1` için
      en az birkaç deterministic sembolik aday full audio üretmeden
      karşılaştırılabilir; finalist seçimi ve elenme nedenleri job
      manifest'inde izlenir; aynı search seed'i aynı sembolik aday sırasını
      verir.

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

> **Prerequisite:** `AcousticProgramV1`, registry/context, candidate-search
> ve production publish (Dalga 1, Dalga 4) hazırdır.

- [ ] **[P1] Tek bir sesi `transient → body → detail → tail → space`
      katmanlarına ayırabilen genel `SoundGraph` oluşturulsun.** Mevcut
      Exciter/Resonator/Articulator organik/fiziksel modele hizmet etmeye
      devam eder fakat bütün SFX'lerin yalnız bu topolojiye zorlanması
      gerekmez. `SoundGraph` birden fazla procedural/sample/hybrid source'u,
      zaman yerleşimini, layer gain'ini, bus/send ilişkisini ve final output'u
      ifade eder. Kapanır: tank ateşi gibi bir asset transient + pressure
      body + mechanical layer + environmental tail olarak; yılan tıslaması
      ise turbulence source + articulation + resonator olarak AYNI graph
      altyapısıyla fakat farklı topology ile ifade edilebilir.
- [ ] **[P1] Genel bir `SoundOntology` ve capability matrix oluşturulsun.**
      Agent her yeni istekte yüzlerce DSP primitive'ini baştan keşfetmez;
      motor `impact`, `pressure`, `explosion`, `airflow`, `hiss`, `friction`,
      `scrape`, `rolling`, `mechanical`, `motor`, `electrical`, `fluid`,
      `vocal`, `tonal`, `noise`, `UI`, `retro`, `musical` gibi mekanizma
      ailelerinin hangi primitive/backend'lerle üretilebildiğini bildirir.
      Kapanır: `audio:job context` "snake hiss" benzeri bir brief'te
      airflow / turbulence / sibilant-resonance kabiliyetlerini; "tank fire"
      brief'inde impact / pressure / mechanism / tail kabiliyetlerini
      machine-readable biçimde gösterebilir.
- [ ] **[P1] Agent için açıklanabilir `ProgramPlanner`/capability recommender
      katmanı kurulsun.** Planner yaratıcı kararı LLM'den almak zorunda
      değildir fakat brief'in hangi ses mekanizmalarına ayrılabileceğini
      registry'den önerir; seçim gerekçesi programda saklanır. Kapanır: aynı
      `AcousticBriefV1` için önerilen topology deterministic/stable registry
      verisinden gelir; desteklenmeyen mekanizma uydurulmaz ve
      `unsupported capability` açıkça raporlanır.
- [ ] **[P2] Genel `StyleProfile` katmanı eklenir.** "arcade", "industrial",
      "minimal", "clean sci-fi", "lo-fi", "cinematic", "organic", "toy-like",
      "brutal", "soft", "retro-digital" gibi estetikler ham preset adına
      indirgenmez; transient sertliği, bandwidth, saturation, pitch language,
      dynamic range, stereo ve processing eğilimleri gibi kontrol alanlarına
      dönüşür. Named oyun/sanatçı referansı verilirse kalıcı profile isim
      olarak kopyalanmak yerine ayırt edici genel niteliklere çözülür.
      Kapanır: aynı tank-fire `SoundProgram` `realistic-heavy`,
      `arcade-industrial` ve `minimal-synthetic` `StyleProfile` ile
      topology'yi koruyup ölçülebilir farklı karakterler üretebilir.
- [ ] **[P2] `MaterialProfile` reusable fiziksel/algısal kavram olsun.**
      Metal, wood, glass, stone, ceramic, hard-plastic, soft-plastic, cloth,
      rubber, flesh/soft-tissue, fluid vb. materyaller impact dışında
      damping, modal distribution, brightness, contact-noise ve tail
      davranışını etkileyen machine-readable parametreler taşır. Kapanır:
      aynı impact excitation farklı material profile'larda ölçülebilir ayrı
      modal/damping davranışı gösterir; material adı yalnız EQ preset'ine
      dönüşmez.

### Dalga 8 — Genel SFX mekanizmaları

- [ ] **[P1] Physically-informed `Impact/Contact` sentez ailesi eklensin.**
      Impact velocity/force, mass, hardness, contact duration, material pair,
      resonant body ve debris/micro-impact katmanlarını ayırır. Stilize
      seslerde fiziksel parametrelerden bilinçli sapmaya izin verir. Kapanır:
      metal-metal, stone-stone ve soft-hard fixture'ları aynı motor üzerinden
      üretilir; velocity arttıkça excitation energy/transient ölçüsü beklenen
      yönde değişir.
- [ ] **[P1] `Pressure/Explosion/Discharge` ailesi kurulsun.** Tek broadband
      noise burst "patlama motoru" sayılmaz; shock/transient, low-frequency
      pressure body, turbulent blast, debris/detail, mechanical action ve
      environment tail ayrı katmanlardır. Kapanır: stilize tank/mortar shot,
      büyük explosion ve kısa energy-discharge aynı reusable aileyi farklı
      programlarla kullanabilir; low-end body ve transient kontrolleri
      bağımsızdır.
- [ ] **[P1] `Weapon/Launcher` üst-seviye archetype'ı genel katmanları
      birleştirsin.** Weapon sesi firearm taklidiyle sınırlı değildir; charge /
      trigger / muzzle-discharge / resonant body / bolt-mechanism /
      shell-debris / tail katmanlarını isteğe bağlı graph olarak kurar.
      Kapanır: tank cannon, arcade turret ve sci-fi launcher için üç ayrı
      program aynı archetype'tan farklı StyleProfile/MaterialProfile ile
      üretilebilir; hiçbirine game-specific DSP yazılmaz.
- [ ] **[P1] `Airflow/Turbulence/Hiss` sentez ailesi eklensin.**
      White-noise + lowpass yaklaşımından ileri gidilerek pressure, aperture,
      flow speed, turbulence scale, spectral tilt, sibilance, cavity/resonance
      ve Gesture kontrollü hava/gaz akışı modellenir. Kapanır: snake-like
      hiss, steam leak, pneumatic release, wind whistle ve breath texture
      aynı primitive ailesi üzerinden belirgin ama ilişkili davranışlarla
      üretilebilir.
- [ ] **[P2] `Friction/Scrape/Rolling` contact synthesis ailesi eklensin.**
      Relative speed, roughness, pressure, surface granularity ve material
      pair continuous noise yanında stochastic micro-contact event'lerini
      kontrol eder. Kapanır: metal scrape, stone drag ve rolling debris
      yalnız sample loop'u tekrarlamadan hareket hızına göre doğal
      zaman/spektrum değişimi gösterir.
- [ ] **[P2] `Machine/Motor/Rotor` procedural ailesi eklensin.**
      RPM/fundamental, cylinder/blade/tooth count, harmonic structure, load,
      mechanical noise, imbalance, bearing/friction ve
      acceleration/deceleration Gesture parametreleri taşıyabilir. Kapanır:
      motor, fan/rotor ve gear mechanism aynı cyclic-mechanical temelden
      üretilir; RPM iki katına çıktığında beklenen dominant cyclic
      bileşenler ölçümde kayar.
- [ ] **[P2] `Electrical/Energy` ailesi eklensin.** Hum, buzz, pulse train,
      arc/crackle event'leri, charge/discharge envelope, instability,
      ring/FM-like components ve noise birlikte reusable şekilde ifade
      edilir. Kapanır: electric hum, charge-up, arcade energy shot ve
      unstable arc aynı sistemden farklı programlarla üretilebilir; yalnız
      "distorted sine" preset'i değildir.
- [ ] **[P2] Çevresel procedural texture ailesi genişletilsin.** Wind, rain,
      fire/combustion, distant machinery, debris-bed ve benzeri sürekli
      ambience'lar event population + stochastic texture + spectral motion
      kullanabilir. Kapanır: en az wind/rain/fire uzun render'larda belirgin
      kısa-loop tekrar izi göstermeden deterministic üretilebilir ve loop
      versiyonları seam QA'dan geçer.

### Dalga 9 — Hybrid/sample/resynthesis altyapısı

> **Prerequisite:** sample resampler kalitesi (`## Açık`) ve render resource
> budget (`## Açık`) kapanmıştır.

- [ ] **[P1] Procedure/sample/hybrid source aynı `SoundGraph` altında
      birinci sınıf olsun.** Gerçekçi ses gerektiğinde sample kullanmak
      mimari başarısızlık sayılmaz; agent sample transient'i procedural body
      ile veya procedural source'u gerçek IR/material response ile
      birleştirebilir. Kapanır: tamamen procedural, tamamen sample ve hybrid
      üç asset aynı publish/QA/provenance yolundan geçer ve oyun tarafı
      kaynak türünü bilmek zorunda kalmaz.
- [ ] **[P1] Sample engine production seviyesinde articulation ve bölge
      desteği kazansın.** Tek WAV'ı pitch etmek dışında velocity layer,
      round-robin, key/range mapping, start-offset, loop region ve
      deterministic variation desteklenir. Kapanır: gerçek enstrüman veya
      mekanik sample bankası agent tarafından kod içi özel loader yazmadan
      kullanılabilir; hangi sample'ın neden seçildiği manifest'e girer.
- [ ] **[P2] Pitch-shift ve time-stretch birbirinden bağımsız yüksek
      kaliteli offline işlemler olsun.** Resample ile pitch+duration'ın
      birlikte değişmesi tek yöntem değildir; transient ağırlıklı ve tonal
      materyal için uygun algorithm/profile seçilebilir. Kapanır: tonal
      fixture ±12 semitone shift'te süreyi; stretch fixture 0.5×/2×'de
      pitch'i tolerans içinde korur ve artefakt ölçümü/işitsel canary ile
      kıyaslanır.
- [ ] **[P2] Granular/sample-cloud motoru eklensin.** Grain position,
      duration, density, pitch distribution, envelope ve stereo placement
      deterministik kontrol edilir; ambience, texture ve hybrid
      creature/mechanical seslerde kullanılabilir. Kapanır: aynı source'tan
      static freeze, moving texture ve dense cloud üç farklı use-case'te
      repeatable render edilir; click ve runaway allocation yoktur.
- [ ] **[P2] Offline convolution/IR desteği eklensin.** Room IR yanında
      material body/resonance ve özel sound-design IR'ları kullanılabilir;
      tail/resource hesabı explicit olur. Kapanır: mono/stereo IR doğru
      channel routing ve deterministic output verir; uzun IR resource
      budget'a tabidir ve publish manifest IR provenance/hash'ini taşır.
- [ ] **[P2] Transient/body decomposition aracı hybrid sound-design için
      değerlendirilsin.** Sample transient'ini koruyup tonal/noise body'yi
      procedural değiştirmek gibi iş akışlarını destekler. Kapanır: kontrollü
      fixture'da transient timing/peak korunurken body spektrumu ayrı
      değiştirilebilir; başarısız ayrıştırmada araç sessizce kötü sonuç
      vermez.
- [ ] **[P3] Genel spectral/STFT işlem katmanı araştırılıp yalnız gerçek
      ihtiyaçla eklensin.** Spectral freeze, morph, envelope transfer veya
      resynthesis gibi işlemler granular/procedural çözümlerin
      karşılayamadığı use-case'te ölçülür. Kapanır: en az iki somut
      production görevi mevcut motorla belirgin yetersiz kalmadan yalnız
      "profesyonel DAW'larda var" gerekçesiyle eklenmez.

### Dalga 10 — Mix, processing ve mastering kapasitesi

> **Prerequisite:** ortak arrangement/mastering yolu (`## Açık`, P1) kapanmıştır
> — yeni bus/send graph DÖRDÜNCÜ paralel mixer oluşturmaz.

- [ ] **[P1] Genel audio bus/send graph üretim sisteminin parçası olsun.**
      Voice/layer → group bus → send/return → master ilişkisi SFX ve
      müzikte aynı altyapıyı kullanır; time-based FX nota/layer içine
      rastgele gömülmez. Kapanır: tank ateşinin mechanism/body katmanları
      ortak room send'ine; müziğin drum/music stemleri ayrı bus'lara
      yönlenebilir ve graph deterministic serialize edilir.
- [ ] **[P1] Production-grade parametric EQ ve shelf filtreleri eklensin.**
      Sound design ve mastering yalnız mevcut synth filter'larıyla
      yapılmaz; bell/low-shelf/high-shelf/high-pass/low-pass processing EQ
      güvenli gain/Q/frequency kontrolleriyle gelir. Kapanır: standard
      frequency-response fixture'larında beklenen gain ve center/cutoff
      davranışı ölçülür.
- [ ] **[P1] Compressor/limiter/transient-shaper ailesi eklensin.**
      Threshold, ratio, attack, release, knee/makeup ve gerekiyorsa
      lookahead limiter ayrı ve açık semantik taşır; dynamics effect ile
      mastering safety limiter birbirine karıştırılmaz. Kapanır: compressor
      static/dynamic curve testleri vardır; limiter defined ceiling/true-peak
      policy'ye uygun fixture üzerinde doğrulanır.
- [ ] **[P2] Sidechain/ducking offline arrangement primitive'i olsun.**
      Müzikte kick/bass veya SFX-preview mix'te music ducking gibi üretim
      ihtiyaçları oyun script'ine özel DSP yazmadan ifade edilir. Kapanır:
      sidechain source aktifken target gain-reduction envelope ölçülür;
      sıfır sidechain'de output parity korunur.
- [ ] **[P2] Multiband processing yalnız ölçülmüş ihtiyaçla eklensin.**
      Multiband compressor/exciter vb. varsayılan mastering zinciri
      değildir; tek-band EQ/dynamics ile çözülemeyen production canary
      kaydedildiğinde crossover phase/latency maliyetiyle birlikte
      değerlendirilir.

### Dalga 11 — Profesyonel müzik üretim kapsamı

> **Prerequisite:** `MusicProgramV1`, `MusicAssetSpec`,
> `InstrumentDefinition`e bağlanabilecek instrument registry ve temel
> MusicProgram renderer (Dalga 6) hazırdır.

- [ ] **[P1] Percussion/drum synthesis genel instrument ailesi olsun.**
      Kick, tom, snare, clap, hat/cymbal/noise-percussion temel modelleri
      pitch/noise/transient/body bileşenleriyle parametrik olarak
      üretilebilir. Kapanır: en az kick/snare/hat family'leri velocity ve
      timbral macro'larla varyasyon üretir; müzik agentı oyun başına özel
      drum synth yazmaz.
- [ ] **[P1] `InstrumentDefinition` standardı synth ve sample instrument'ları
      aynı bestecilik yüzeyine bağlasın.** Range, preferred register,
      articulation, velocity response, polyphony, release behavior,
      transposition ve spectral role ortak contract'tır. Kapanır: procedural
      piano ve sampled/hybrid instrument aynı `MusicProgram` Note/Event
      verisini tüketebilir; composer backend farkını bilmek zorunda değildir.
- [ ] **[P1] Retro/arcade synthesis ailesi eklensin.** Pulse duty, triangle,
      saw, noise/LFSR, simple wavetable, hard sync/bit-depth/sample-rate
      karakterleri agent-facing primitive olur; yalnız generic square preset
      değildir. Kapanır: 8/16-bit esintili lead, bass, percussion/noise ve
      UI voice'ları aynı retro toolkit'ten üretilebilir; exact console
      emulation iddiası yapılacaksa ayrıca donanım doğrulaması gerekir.
- [ ] **[P1] Müzik asset'i yalnız tek `.ogg` değil `MusicBundle`
      üretebilsin.** Bundle isteğe göre intro, loop body, outro, stinger,
      transition ve stemleri tek program/provenance altında üretir. Kapanır:
      arcade theme için `intro + seamless loop`; boss müziği için
      `loop + transition stinger`; adaptive müzik için `stem bundle` aynı
      publish sistemini kullanır.
- [ ] **[P2] Note/event ifade modeli velocity dışında articulation
      taşısın.** Accent, staccato, legato/tie, sustain/release, mute, ghost,
      slide/glide ve instrument'ın desteklediği articulation'lar açık
      veridir. Kapanır: unsupported articulation sessizce yok sayılmaz;
      `InstrumentDefinition` destek listesinden validation/uyarı çıkar.
- [ ] **[P2] Tracker/step-pattern authoring yüzeyi arcade ve ritmik oyun
      müziği için eklensin.** Pattern rows/steps, repeat, variation, fill,
      probability ve pattern chaining `MusicProgram`ın section/form yapısına
      bağlanır. Kapanır: kısa arcade jenerik intro → seamless loop →
      optional ending pattern olarak üretilebilir; loop bar/sample sınırı
      encoded QA'dan geçer.
- [ ] **[P2] Orchestration/role katmanı `MusicProgram`a eklensin.** Bass,
      foundation, rhythm, harmony, counterline, lead, texture, accent/stinger
      rolleri instrument seçimi, register ve density kararlarında
      kullanılabilir; instrument adı doğrudan rol değildir. Kapanır: aynı
      score iki farklı palette/orchestration ile `MusicProgram`ın
      nota/harmoni kimliği değişmeden render edilebilir.
- [ ] **[P3] Tuning sistemi 12-TET'e gömülü kalmasın.** Standart kullanım
      kolay kalırken custom tuning/microtonal scale gerektiğinde pitch
      resolver'ın temelden yeniden yazılması gerekmez. Kapanır: 12-TET
      mevcut output'u değiştirmez; en az bir custom cents/ratio scale
      deterministic note→frequency dönüşümüyle test edilir.

### Dalga 12 — Oyun için teslim biçimleri

- [ ] **[P2] Aynı source programdan near/mid/far ses varyantı
      üretilebilsin.** Distance profile yalnız gain düşürmez; high-frequency
      absorption, transient softening, direct/reverb relation ve
      mono/stereo davranışını değiştirebilir. Kapanır: weapon/impact
      fixture'ın near ve far varyantları aynı source kimliğini taşır fakat
      ölçülen centroid/transient/directness beklenen yönde değişir.
- [ ] **[P2] Occluded/behind-wall/underwater/radio vb. delivery
      profile'ları kaynak sesten ayrı processing katmanı olsun.** Sound
      designer her variantı elle baştan üretmez. Kapanır: aynı published
      source'tan deterministic delivery variants çıkabilir ve provenance
      source→profile ilişkisini tutar.
- [ ] **[P2] Channel/layout policy asset türüne göre açık olsun.** UI ve
      positional SFX mono source tercih edebilir; ambience/music stereo
      olabilir; stereo widening mono compatibility'yi bozuyorsa QA görür.
      Kapanır: publish profile mono/stereo beklentisini belirtir ve yanlış
      channel count validation'da yakalanır.
- [ ] **[P2] Encode profili asset sınıfına göre seçilsin.** Kısa UI/SFX,
      ambience, music ve stem için aynı bitrate/quality körlemesine
      kullanılmaz; decoded kalite ve paket boyutu birlikte baseline edilir.
      Kapanır: encode quality policy machine-readable olur; değişiklik
      boyut + decoded QA ölçümü olmadan yapılmaz.
- [ ] **[P2] Gameplay-state ses aileleri tek programdan üretilebilsin.**
      Weapon `normal/charged/damaged`, engine `idle/load/highRPM`, creature
      `calm/alert/hurt`, UI `normal/warning/critical` gibi ilişkili
      assetler ayrı rastgele presetler değil aynı family/program
      identity'sinden türetilebilir. Kapanır: family varyantları ortak
      timbral identity raporunu geçer ve her varyantın explicit gameplay
      semantic'i manifest'te bulunur.

### Dalga 13 — Agent üretim hızını ve güvenilirliğini artırma

> **Prerequisite:** canonical program hash'leri ve manifest/provenance
> sistemi (Dalga 1) vardır — aksi hâlde graph-cache anahtarları güvenilir
> değildir.

- [ ] **[P1] Draft ve final render quality modları ayrı olsun.** Agent
      onlarca iterasyonda pahalı final oversampling/IR/mastering çalıştırmak
      zorunda değildir; draft hızlı ama semantik olarak aynı graph'ı işler,
      final production-quality path'tir. Kapanır: draft/final program aynı
      kalır; yalnız render quality profile değişir ve publish draft
      çıktısını kabul etmez.
- [ ] **[P1] Graph-hash tabanlı incremental render/cache eklensin.** Agent
      yalnız snare veya tank mekanizma katmanını değiştirince bütün uzun
      müzik/asset yeniden hesaplanmaz; değişmeyen deterministic node
      çıktıları cache'den gelir. Kapanır: tek leaf parametresi değiştiğinde
      yalnız dependency descendants yeniden render edilir; cache on/off
      final PCM birebir aynıdır.
- [ ] **[P1] Genel audio benchmark/canary korpusu genişletilsin.** En az:
      stylized tank fire, heavy realistic-ish impact, snake-like hiss,
      steam, metal scrape, motor acceleration, electrical charge,
      water/fluid event, creature vocal, UI confirm/error, retro arcade
      SFX, seamless arcade theme, ambience loop ve çok-bölümlü müzik cue
      sürümlü görevler olur. Kapanır: her görev mekanik/QA kriterleri ve
      gerekiyorsa audition kaydı taşır; yeni motor sürümü bütün canary'lerin
      durumunu tek raporda gösterir.
- [ ] **[P2] Batch render paralelleşmesi determinism'i bozmadan
      eklensin.** Candidate search, `SoundFamily` ve stem render işleri
      worker/process paralelliği kullanabilir; sonuç sırası scheduler'a
      bağlı değildir. Kapanır: serial ve parallel koşu candidate/program/PCM
      hash sırasını birebir verir; peak RAM için concurrency limiti resource
      budget'a bağlıdır.
- [ ] **[P2] `audio:capabilities` kalite matrisi oluşsun.** Motor yalnız
      "primitive mevcut" demez; sürümlü benchmark görevlerinde hangi ses
      ailelerinin production-ready/canary/research seviyesinde olduğunu
      gösterir. Kapanır: capability statüsü test/benchmark kaydından
      türetilir; README'de elle "her sesi yapar" iddiası yazılmaz.
- [ ] **[P2] Reference/audition korpusu motorun estetik regresyon
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

### Araştırma kuyruğu — isteğe bağlı AI değerlendirmesi

> Bu bölüm core authoring/publish sisteminin prerequisite'i değildir.
> Hiçbir production workflow bu araçlar olmadan eksik sayılmaz.

- [ ] **[P3] Semantic audio scorer isteğe bağlı laboratuvar aracı olsun.**
      Text-audio embedding veya audio-capable model core `audio-synth`
      bağımlılığı yapılmaz; pozitif ve negatif brief terimleriyle candidate
      ranking için yalnız yardımcı sinyal olur. Kapanır: scorer devre
      dışıyken bütün üretim pipeline'ı eksiksiz çalışır; semantic skor
      hiçbir production asset'i tek başına kabul/reddetmez.
- [ ] **[P3] Reference fitting / inverse synthesis araştırma kapısı
      açılsın.** Bir referans sesin pitch-envelope/spectral-envelope/temporal
      descriptor hedeflerine göre macro parametrelerini arayan offline
      optimizer prototipi yapılır. Kapanır: bilinen sentetik bir "gizli hedef"
      render'ından parametrelerin veya descriptor sonucunun tekrar
      yaklaştırılabildiği kontrollü deney vardır; neural bağımlılık zorunlu
      değildir.

## Kapatılanlar

- [x] **[P1] `Reverb.decay` RT60 saniyesi oldu.** Comb kazancı g = 10^(−3·D/T60)
      (her comb kendi gecikmesinden); gerçek allpass difüzörler, wet enerji
      normalizasyonu, 20 Hz DC engelleyici; `tailSeconds` = ön gecikme +
      taşıma gecikmesi + RT60. Ölçülen T30: istenen 0.8/1.4/2.2/3.5 sn →
      0.800/1.400/2.200/3.500 sn (eski kod 0.467/0.687/0.687/0.687 sn).
      Uzlaştırma: frozen VOL.HELL'in dokuz reverb parçası yeniden üretilmedi
      (ağaç değiştirilemez); VOL.HELL'in reverb setleri salt-okur kanarya
      olarak `tests/reverbDecay.test.ts`te ölçülüyor. Paket presetleri eski
      uygulamanın gerçekte ürettiği RT60'a taşındı. (dd44c07)
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
      kullanır. Uzlaştırma: frozen VOL.HELL `lib/mix.ts` tarihsel kopyadır,
      aktif paralel yol değildir; yönlendirilmedi (ağaç değiştirilemez).
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
      politikasını raporlar. Uzlaştırma: VOL.HELL kataloğu salt-okur taban
      çizgisi (43/46 geçer; 3 müzik parçası −1 dBTP üstü) DESIGN'da; frozen
      ağaca politika uygulanmaz.
- [x] **[P2] Filtre `poles`/`type` birleşimi sessizce değişmiyor.** 1 kutup +
      bandpass/notch `combination` hatası; 1 kutupta `type` yuvayı ezer.
      (dd44c07)
- [x] **[P3] FM spektral alias regresyon paketi.** Kafes yöntemli ölçüm, 1200
      noktalı ızgaradan makine-okunur `FM_ALIAS_LIMITS` ve
      `Analysis.assessFmAlias`; paket "yanlış güvenli yok" sözleşmesini her
      koşuda ölçer. Ölçülmüş motor iyileştirmesi: halfband decimator (sinüs
      modülatör + feedback 0 tüm ızgarada ≤ −82 dB). (4d12cb1)
