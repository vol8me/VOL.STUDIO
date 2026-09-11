# VOL.STUDIO — iş listesi

> **TODO disiplini:** Açık iş `[ ]`, biten iş `[x]` olur. Biten madde silinmez;
> kısa hâliyle dosyanın sonundaki `## Kapatılanlar` bölümüne taşınır. Eksik
> çıkan bir kapanış yeni bir `[ ]` maddeyle yeniden açılır.

Repo geneli işler; paket işleri paketin kendi `TODO.md`sinde.
Aktif iş: VOL.LIFE — [games/vol-life/TODO.md](games/vol-life/TODO.md).

## Açık

- [ ] **[P2] Android 16 geniş ekranda yön kilidini yok saymasın.** Android 16,
      en dar kenarı 600dp ve üstü ekranlarda `screenOrientation`ı ve
      `setRequestedOrientation()`ı yok sayar; oyun kategorisi
      (`android:appCategory="game"`) muaftır. Kod tarafı bitti: üç manifestin
      `<application>`ında kategori var ve drift testleri kilitliyor. Kalan tek
      şart geniş ekran ölçümü. Telefonda `wm size` / `wm density` ile büyük ekran
      taklidi kuralı üretmedi (kategorisiz kontrol uygulaması da döndü), kanıt
      sayılmadı. `vol-tablet-36` AVD'si (Android 16, pixel_tablet, sw800) bu
      makinede başsız açılışta sessizce kapanıyor (`swiftshader_indirect`, üç
      deneme). Kapanır: 600dp ve üstü emülatörde ya da tablette, kategori varken
      yön isteğinin uygulandığı ve kategori geçici kaldırılınca yok sayıldığı
      ölçülür.
- [ ] **[P2] vol-hell AppImage'ı Linux çizim kuralına girmiyor.** `linux.AppRun`
      `WEBKIT_DISABLE_DMABUF_RENDERER`ı başlatıcı düzeyinde `1` yapıyor; kabuk
      dışarıdan verilen değişkeni ezmediği için AppImage NVIDIA + yerel Wayland'da
      da DMA-BUF'suz yolda kalır. Aynı yol `tauri dev`de 18 FPS ölçüldü (kök
      Kapatılanlar, 2026-09-11); AppImage ayrıca ölçülmedi. Başlatıcının bu
      satırı kabuğun alt süreçleri kapsamadığı gerekçesiyle eklenmişti; kabuk
      değişkenleri WebView yaratılmadan önce koyduğu için gerekçe artık
      geçerli olmayabilir. Kapanır: satır kaldırılıp AppImage derlenir; NVIDIA +
      Wayland'da 60 FPS ve XWayland'da çizim ölçülür.
- [ ] **[P3] Paylaşılan Tauri kabuğu `sql` eklentisini her oyuna koşulsuz
      gömüyor — "en az yetki" yalnız çağrı katmanında doğru.**
      `tauri-v2/src-tauri/src/lib.rs`deki `run_with_context_and`, `store` ve
      `log` yanında `tauri_plugin_sql::Builder::default().build()`i HER oyun
      için koşulsuz kaydediyor; her üç oyunun kendi `Cargo.toml`u da
      `tauri-plugin-sql`i doğrudan bağımlılık olarak listeliyor. Hiçbir oyunun
      `src/`i şu an `@tauri-apps/plugin-sql` ya da `GameStateDb`yi (tauri-v2'de
      hazır ama tüketilmeyen bir sarmalayıcı) İÇE AKTARMIYOR — üçü de SQL
      kullanmıyor (doğrulandı: `rg` taraması). VOL.LIFE'ın capability
      dosyalarından `sql:default`/`sql:allow-execute` kalktı (bu TODO'nun
      önceki bir turda kapatılan "en az yetki" maddesi) ama bu yalnız JS→native
      ÇAĞRI iznini (ACL) kapatıyor; eklentinin kendisi — komut işleyicileri,
      SQLite sürücüsü, native durumu — VOL.LIFE'ın gönderilen ikili dosyasına
      hâlâ gömülü giriyor (vol-hell ve vol-arachnid'in capability dosyalarında
      `sql:default` hâlâ VAR, onlar da kullanmıyor). Kapanır: eklenti kaydı
      `vol-orientation`ın izlediği desende (`run_with_context_and`in
      `configure` parametresi) kullanan oyunun kendi çağrısına taşınır ve
      Cargo bağımlılığı da yalnız onu isteyen oyunda kalır; hiçbir oyun SQL
      kullanmıyorsa üçünden de kaldırılır; VOL.LIFE'ın gönderilen ikilisinin
      SQL sembolleri TAŞIMADIĞI doğrulanır.
- [ ] **[P1] `Reverb` `decay`i saniye gibi belgeliyor ama 0-1'e kelepçeliyor
      — VOL.HELL'in gönderilen parçalarının çoğu bundan etkileniyor.**
      `ReverbParams.decay`nin tip belgesi `/** Süre boyunca sönüm (saniye). */`
      der (`devtools/audio-synth/src/types.ts:178`), ama `Reverb`in kurucusu
      `const decay = Math.max(0, Math.min(1, params.decay ?? …))`
      (`devtools/audio-synth/src/effects/reverb.ts:137`) ile onu SESSİZCE
      [0,1]'e kelepçeliyor ve doğrudan `feedback = min(0.82, decay*0.55+0.15)`
      formülüne besliyor — gerçek bir RT60 hesabı YOK. VOL.HELL'in palet
      dosyaları `decay`i saniye niyetiyle veriyor: `ambience.ts:35,60,98`
      (3.4 / 2.8 / 3.8), `fx.ts:49` (1.6), `pads.ts:33,62,91` (2.2 / 1.8 /
      1.6), `keys.ts:105` (1.1) — dokuz reverb bloğunun SEKİZİ 1'in üstünde.
      Hepsi aynı `decay=1` değerine, dolayısıyla aynı `feedback=0.70`'e
      kelepçeleniyor; palet yazarının amaçladığı 1.1 sn'lik kısa oda ile
      3.8 sn'lik geniş salon arasındaki fark ÜRETİMDE kayboluyor (yalnız
      `keys.ts:43`teki 0.9 gerçek aralıkta). Bu, `Reverb.tailSeconds`
      üzerinden `compose()`nin ve VOL.HELL'in kendi `lib/mix.ts`inin arabellek
      boyutu hesabını da etkiliyor — `synth()` yolu (`lib/mix.ts` →
      `applyGlobalEffects` → `new Reverb`) VOL.HELL'in ASIL kullandığı yol.
      Kapanır: `decay` gerçek RT60 saniyeye çevrilir (comb feedback'leri asıl
      delay sürelerinden hesaplanır, `Math.min(1, …)` kelepçesi kalkar);
      `tailSeconds` pre-delay + en uzun decay'i temsil eder; 0.8/1.4/2.2/3.5
      saniyelik regresyon impulse testleri eklenir; VOL.HELL'in dokuz reverb
      parçası yeniden üretilip `just audio-verify` ile doğrulanır.
- [ ] **[P2] İç içe efekt parametreleri NaN-güvenli `clamp()`i atlıyor —
      üretimin geçtiği kod yolunda.** `synthesize()`nin kendi yorumu NEDENİ
      açıkça yazıyor: `Math.max`/`Math.min` NaN karşısında NaN döner, `clamp()`
      NaN'ı alt sınıra sabitler (`devtools/audio-synth/src/engine/synthesize.ts:17-20`).
      Bu ilke yalnız `synthesize()`nin KENDİ üst düzey alanlarına uygulanıyor.
      `src/effects/`teki HİÇBİR dosya (`reverb.ts`, `delay.ts`, `distortion.ts`,
      `modulation.ts`, `stereo.ts`) ya da `src/synthesis/`teki `envelope.ts`,
      `filter.ts`, `sample.ts` `clamp()`i import ETMİYOR; hepsi kendi ham
      `Math.max(0, Math.min(1, …))` desenini kullanıyor (doğrulandı: `clamp(`
      için 0 eşleşme, `Math.max(0, Math.min` için 8 dosya). Bozuk bir iç içe
      değer (`reverb.decay: NaN`, `flanger.rate: Infinity`) bu yüzden NAMED bir
      hatayla SINIRDA değil, `writer.ts`nin `validateAudioInput`ı örnekleri tek
      tek tarayıp "sonlu değil" diyene kadar DSP zincirinin içinde sessizce
      yayılır — hangi parametrenin bozuk olduğu son hatadan anlaşılmaz. Bu,
      VOL.HELL'in her render'ının geçtiği AYNI kod yoludur (`synth()` →
      `applyGlobalEffects`); bugün hiçbir palet NaN vermiyor, ama bekçi yok.
      Kapanır: nested `SynthParams` için merkezi bir doğrulama/çözümleme
      katmanı kurulur (`clamp()` her iç içe efekt parametresine de uygulanır);
      NaN/Infinity/negatif değerler render başlamadan İSİMLİ bir hatayla
      reddedilir; her efekt sınıfı için en az bir NaN-girdi regresyon testi
      eklenir.
- [ ] **[P2] `downsample2x` her render'da fazladan tam boy tampon ayırıyor;
      `repeat` döngüsü arabellek dışına düşen tekrarları hesaplamaya devam
      ediyor.** `downsample2x` (`devtools/audio-synth/src/engine/render.ts:147-167`)
      filtrelenmiş sinyali AYRI bir `filtered = new Float32Array(buffer.length)`
      tamponuna yazıp SONRA `out`a decimate ediyor; biquad zinciri örnek
      başına sıralı IIR olduğu için bu YERİNDE (in-place) yapılabilir —
      bugünkü hâliyle her `synthesize()` çağrısı 2× oversample'lı tamponun
      TAMAMINI bir kez daha kopyalıyor. Ayrıca `synthesize()`nin `repeat`
      döngüsü (`devtools/audio-synth/src/engine/synthesize.ts:97-181`) her
      tekrar için tam maliyetli kurulum (ses/zarf/filtre yeniden inşası, 1 ms
      pre-warm, `durationSamples` uzunluğunda tam iç örnek döngüsü) yapıyor ve
      sonunda `dryBufferInternal[startOffset + i] += sample` ile yazıyor;
      `startOffset` `internalSampleCount`u aştığında bu yazma SESSİZCE
      hiçbir şeye dokunmuyor (Float32Array sınır dışı yazması no-op'tur) ama
      döngü yine de TAM çalışıyor — `totalDuration` 600 sn'de kelepçelenirken
      `repeat` 1000'e kadar izin veriyor, ikisi arasında bağ yok. İlki HER
      VOL.HELL render'ında aktif (bellek/süre), ikincisi bugün VOL.HELL
      paletinde `repeat` kullanılmadığı için tetiklenmiyor ama paylaşılan
      motorun genel API'sinde açık bir risk. Kapanır: `downsample2x` biquad
      zincirini `buffer`e yerinde uygular, ayrı `filtered` tamponu kalkar;
      `repeat` döngüsü `startOffset >= internalSampleCount` olduğunda `break`
      eder; uzun/yüksek-rate render'da ayırma sayısı ve süre ölçülüp
      DESIGN'a yazılır.
- [ ] **[P3] Piyano gövde rezonansı stereo değil — `phaseR` hesaplanıp
      kullanılmıyor.** `piano()`nin kısmi ton döngüsü (`devtools/audio-synth/src/instruments/keyboard/piano.ts:136-153`)
      `phaseL`/`phaseR`i doğru şekilde AYRI kanallara yazıyor; hemen altındaki
      gövde rezonansı bloğu (`piano.ts:158-176`) aynı deseni taklit ederek
      `phaseR`i kurup her örnekte ilerletiyor (satır 164, 173-174) ama
      `const s = Math.sin(2*Math.PI*phaseL) * bodyAmp * env` yalnız `phaseL`
      kullanıyor ve `left[i] += s; right[i] += s;` AYNI değeri iki kanala da
      yazıyor (satır 168-170) — `phaseR` ölü koddur. Sonuç: `bodyResonance`
      açıkken gövde modu iki kanalda BİREBİR aynı, kısmi tonların taşıdığı
      stereo genişlik gövdede kayboluyor. Bugün VOL.HELL paleti `piano`
      preset'ini hiç kullanmıyor (doğrulandı, `rg` taraması boş) — yalnızca
      paketin kendi preset kataloğu ve olası gelecekteki tüketiciler etkilenir.
      Kapanır: gövde bloğu `phaseR`i `sampleR` hesabında kullanır (kısmi ton
      döngüsündeki desenle aynı); `bodyResonance` açıkken L/R'nin AYNI
      olmadığını sınayan bir regresyon testi eklenir.
- [ ] **[P3] Yaylı model kazancı (`gain`) tını/gürültü oranını da
      değiştiriyor, yalnızca sesi değil.** `bowedString()`de her osilatörün
      kazancı kurulumda `gain: sawtoothGain(n) * gain` ile `gain` parametresini
      İÇİNE alıyor (`devtools/audio-synth/src/instruments/strings/bowed.ts:157`),
      ama yay gürültüsü `noiseAmp = bowNoise * 0.2 * env` HİÇ `gain`
      almıyor (`bowed.ts:195`). Tampon sonunda TEPEYE göre
      `target = 0.95 * gain` ölçeğine normalize ediliyor (`bowed.ts:213-220`)
      — final ses seviyesi doğru kalıyor, ama normalizasyon öncesi ton/gürültü
      ORANI `gain`e bağlı: `gain` düşürüldükçe osilatörlerin ham genliği
      küçülürken gürültü taban SABİT kalıyor, tampon yeniden aynı tepeye
      normalize edildiğinde yay gürültüsü orantısız BÜYÜR. `gain` böylece
      fiziksel karşılığı olmayan bir "gürültü/ton karışımı" düğmesine
      dönüşüyor. Bugün VOL.HELL paleti `bowedString` preset'ini kullanmıyor
      (doğrulandı) — yalnızca paketin API'si etkilenir. Kapanır: `noiseAmp`
      da `gain`e bağlanır (ya da gürültü kazancı ayrı, `gain`den bağımsız bir
      parametre olarak belgelenir); farklı `gain` değerlerinde ton/gürültü
      oranının sabit kaldığını sınayan bir test eklenir.
- [ ] **[P3] `compose()` `flanger`/`phaser`i hem nota başına hem final mix'te
      iki kez uyguluyor — bugün hiçbir çağıranı yok.**
      `GLOBAL_PARAM_KEYS` (`devtools/audio-synth/src/sequencer.ts:9-17`)
      `delay`/`chorus`/`reverb`i nota parametrelerinden ayıklıyor ama
      `flanger`/`phaser`i LİSTEDE UNUTUYOR; bu yüzden `stripGlobalParams`
      onları `noteBase`de bırakıyor (`sequencer.ts:65,78-89`). Her nota
      `synth()` → `synthesize()` çağırıyor ve `synthesize()` KENDİ
      `applyGlobalEffects`ini çağırıp `params.flanger`/`params.phaser`i
      uyguluyor (`devtools/audio-synth/src/engine/synthesize.ts:199`,
      `devtools/audio-synth/src/engine/effects-chain.ts:37-49`); `compose()`
      SONRA aynı `baseParams`la `applyGlobalEffects`i final mix üzerinde
      TEKRAR çağırıyor (`sequencer.ts:116`) — flanger/phaser iki kez
      işleniyor, delay/chorus/reverb işlenmiyor (doğru davranış). `compose()`
      repo genelinde başka HİÇBİR yerden çağrılmıyor (doğrulandı: yalnız
      kendi testinde) — VOL.HELL kendi `lib/mix.ts`ini kullanıyor, bu yüzden
      bugün hiçbir gönderilen ses etkilenmiyor. Kapanır: `flanger`/`phaser`
      `GLOBAL_PARAM_KEYS`e eklenir; nota parametrelerinden efekt sızmadığını
      sınayan bir regresyon testi eklenir.
- [ ] **[P3] `Timeline.render()` sessiz kuyruk payını RMS'e katıyor —
      bugün hiçbir çağıranı yok.** `matchLoudness` (`devtools/audio-synth/src/arrange/timeline.ts:208`)
      `total = ceil((end+tail)*sampleRate)` uzunluğundaki TAM tampon üzerinde
      çalışıyor; `trimSilence` bu çağrıdan SONRA kuyruğu kesiyor
      (`timeline.ts:210-221`). `tailSeconds` varsayılanı 3 sn
      (`timeline.ts:169`) ve `trimSilence`in kendi yorumu "pay çoğu zaman
      tümüyle boş kalır (ölçüldü: bir parçada sonda 4 saniye tam sessizlik)"
      diyor (`timeline.ts:63-65`) — yani `measureRms` (`loudness.ts:11-22`)
      genellikle SANİYELERCE sıfır örneği paydaya katıyor, ölçülen RMS'i
      gerçek içerikten daha düşük gösteriyor ve `gain = targetRms/rms`
      (`loudness.ts:88`) gereğinden FAZLA yükseltme uyguluyor — büyüklük
      kuyruk/içerik oranına bağlı (10 sn içerikte 4 sn sessiz kuyruk ≈ %18
      fazla kazanç). `Timeline` repo genelinde yalnız
      `devtools/audio-synth/scripts/music-demo.ts` ve kendi testinde
      kullanılıyor (doğrulandı) — VOL.HELL müziği bunu KULLANMIYOR. Kapanır:
      `matchLoudness` `trimSilence`den SONRA, yalnız tutulan aralık üzerinde
      çağrılır (ya da RMS penceresi kesilecek kuyruğu dışlar); bir kayda
      değer sessiz kuyruklu örnekle regresyon testi eklenir.
- [ ] **[P3] Aynı `Timeline` örneğinde ikinci `render()` çağrısı birinciyle
      aynı sonucu vermiyor — bugün hiçbir çağıranı yok.** `this.random`
      (`devtools/audio-synth/src/arrange/timeline.ts:87,104`) kurucuda BİR
      KEZ oluşturulan durumlu bir kapanıştır; `render()` onu zamanlama/şiddet
      insanlaştırması için tüketir (`timeline.ts:173-175`) ve kapanışın
      durumunu KALICI olarak ilerletir. Aynı `Timeline` nesnesinde `render()`
      iki kez çağrılırsa ikinci çağrı PRNG akışının kaldığı yerden devam eder
      — humanize sapmaları ilk çağrıdakiyle AYNI olmaz, yani "aynı düzenleme
      her koşuda aynı örnekleri verir" sözü (`timeline.ts:47-48`) yalnız İLK
      render için doğrudur. `Timeline` bugün yalnız demo script'inde ve kendi
      testinde kullanılıyor (doğrulandı). Kapanır: `render()` ya PRNG'yi
      kendi başına sıfırlar (her çağrı bağımsız ve deterministik) ya da API
      bunun tek seferlik olduğunu açıkça belgeler ve ikinci çağrıyı reddeder;
      iki ardışık `render()` çağrısının davranışını sınayan bir test eklenir.
- [ ] **[P3] WAV okuyucu `WAVE_FORMAT_EXTENSIBLE`in alt alanlarını
      atlıyor — yalnız harici karmaşık girdilerde.** `decodeWav`
      (`devtools/audio-synth/src/synthesis/sample.ts:71-79`) `0xfffe` alt
      biçim GUID'inin yalnız İLK 2 baytını (gerçek format etiketi) okuyor;
      standart `WAVEFORMATEXTENSIBLE` yerleşimindeki `wValidBitsPerSample`
      (konteynerden daha dar gerçek çözünürlük, ör. 24-bit konteynerde
      20-bit veri) ve `dwChannelMask`i (kanal sırası/düzeni) HİÇ okumuyor;
      tüm kanalları sabit soldan-sağa toplayıp mono'ya indiriyor
      (`sample.ts:110-144`). Standart olmayan bir kanal düzeninde ya da
      dar-geçerli-bit derinlikli dışarıdan gelen bir WAV bu yüzden sessizce
      yanlış yorumlanabilir. Bugün hiçbir oyun `sample:` parametresiyle WAV
      dosyası tüketmiyor (doğrulandı) — yalnızca gelecekteki harici örnek
      girdisi etkilenir. Kapanır: `wValidBitsPerSample` okunup düşük
      geçersiz bitler maskelenir; `dwChannelMask` ya en azından okunup
      standart-dışı düzende açık bir hata fırlatır ya da uygulanır; gerçekçi
      bir extensible WAV fixture'ıyla test eklenir.
- [ ] **[P3] Loop crossfade doğrusal kazançla karışıyor, equal-power
      değil.** `loopSamples` (`devtools/audio-synth/src/synthesis/sample.ts:238-251`)
      HER iç loop sınırında crossfade uyguluyor (kod yorumu bunun daha önceki
      "yalnız ilk sınırda" hatasının düzeltmesi olduğunu belgeliyor,
      `sample.ts:240-243`) — yani "her tekrarda tık" bulgusu bugünkü kodda
      ZATEN kapalı. Kalan gerçek fark: geçiş `ratio`/`1-ratio` DOĞRUSAL
      kazançla karışıyor (`sample.ts:249`); ilintisiz döngü içeriğinde
      doğrusal crossfade geçiş noktasında algısal bir ses DÜŞÜŞÜ üretebilir
      (equal-power/sabit-güç eğrisi bunu önler). Kapanır: crossfade eğrisi
      equal-power'a (ör. `sin`/`cos` çeyrek periyot) çevrilir; geçiş
      noktasındaki RMS'in düz kaldığını ölçen bir test eklenir.
- [ ] **[P3] QA script'inin `clip` sayacı kanal-toplu, kanal başına değil.**
      `analyze()` (`devtools/audio-synth/scripts/audio-qa.ts:198-217`)
      `monoAbs = Math.max(Math.abs(l), Math.abs(r))` hesaplayıp TEK bir
      `clip` sayacını `monoAbs >= 0.999` olduğunda artırıyor — aynı örnekte
      HEM sol HEM sağ kırparsa bu bir olay, ayrı örneklerde yalnız sağ
      kırparsa da bir olay sayılıyor; hangi kanalın kırptığı ve kaç kanal
      örneğinin toplam kırptığı rapordan ANLAŞILMIYOR. Yalnız QA özet
      çıktısını etkiliyor, gönderilen ses dosyasını değiştirmiyor. Kapanır:
      `leftClip`/`rightClip` ayrı sayılır (ya da toplam kanal-örneği kırpma
      sayısı raporlanır); özet çıktısı ikisini de gösterir.
- [ ] **[P3] Üç ayrı düzenleme/mastering yolu paralel yaşıyor —
      hiçbiri diğerinin düzeltmesini miras almıyor.**
      `devtools/audio-synth` içinde `compose()`
      (`src/sequencer.ts`, kullanılmıyor) ve `Timeline`
      (`src/arrange/timeline.ts`, yalnız demo script'inde) iki AYRI
      orkestrasyon/yükseklik-eşitleme uygulaması taşıyor; VOL.HELL'in gerçek
      gönderilen müziği ise `games/vol-hell/scripts/audio/lib/mix.ts`teki
      ÜÇÜNCÜ, bağımsız `createMix`/`addVoice`/`masterize`/`edgeGuard`
      uyguluyor (voice'lar normalize edilmez, yalnız final mix'te BİR KEZ
      normalize edilir; loop kuyruğu sarılır; transient insanlaştırma —
      `lib/mix.ts:1-17`). Üçü de aynı sorunu (birden çok sesi zamanlarda
      birleştirip yükseklik eşitlemek) farklı ve BİRBİRİNDEN BAĞIMSIZ
      çözüyor; `lib/mix.ts`teki üç kural (yukarıdaki) `compose()`de ve
      `Timeline`de YOK. Kapanır: `lib/mix.ts`teki kanıtlanmış kurallar
      `devtools/audio-synth`in paylaşılan `arrange` katmanına taşınır;
      VOL.HELL kendi kopyasını o katmana yönlendirir; `compose()` kullanımdan
      kaldırılır ya da `Timeline`e birleştirilir — tek bir düzenleme/mastering
      yolu kalır.

## Kapatılanlar

### 2026-09-11 — platform yüklemi, Android yönü, görüntü kipi, vol-hell HUD, CORE `Sheet`

- [x] **[P1] Oyunlar Android'i tek yüklemle tanıyor.** `@volstudio/tauri-v2`
      `getRuntimePlatform()` (`web` / `desktop` / `android`) testle yazıldı;
      vol-arachnid tam ekran düğmesini ve çıkış onayını, vol-hell native pencere
      ve görüntü ayarlarını, VOL.LIFE düğme kümesini ve çıkış onayını ona bağladı.
      Ekran üstü kontroller işaretçi türüne bağlı kaldı. Telefonda (SM-G990B2):
      vol-arachnid'de tam ekran düğmesi yok, geri tuşu onayı açıyor, ikinci geri
      onayı kapatıyor. Madde metnindeki "vol-hell oyun içi geri işleyicisini
      yalnız dokunmatikte kuruyor" okuması yanlıştı: `GameMobileControls` onu
      zaten koşulsuz kuruyordu.
- [x] **[P1] tauri-v2 Android'de ekran yönünü uyguluyor.**
      `tauri-v2/plugins/vol-orientation`: Kotlin `setRequestedOrientation`,
      `user*` ve `sensor*` aileleri, uygulanan gerçek yön ve Activity açılışında
      kayıtlı yönü uygulayan `OrientationStore.applySaved`. İzin `mobile.json`da
      ve üretilen şemada; masaüstünde komutlar hata döner. Telefonda yatay seçimi
      `ROTATION_90`, sistem tersini isterken kilit tutuyor, yeniden açılışta
      tercih geliyor; açılış dönüşü VOL.LIFE odak almadan bitiyor (541 ms /
      728 ms, odaklıyken 66 örneğin hiçbiri dikey değil).
- [x] **[P1] Görüntü kipi uygulayıcısı `@volstudio/tauri-v2`de.**
      `DisplayModeController` native pencereyi ya da DOM tam ekranını uygular,
      F11'i yönlendirir, dış değişimi tercihe yazar ve yalnız en son isteği
      uygular (11 test); vol-hell `VideoSettingsController`ı ve VOL.LIFE
      masaüstü onu kullanıyor. Linux'ta pencere yöneticisinin değişimi
      görünmüyordu: tao 0.35 `is_fullscreen()` yalnız uygulamanın kendi
      isteğini hatırlıyor. Paylaşılan kabuğa GDK durumunu okuyan
      `window_fullscreen_state` komutu girdi, `TauriWindowAdapter` onu okuyor.
      KDE Plasma'da girdisiz ölçüldü: KWin pencereyi pencere / tam ekran /
      pencere yapınca tercih `windowed` / `fullscreen` / `windowed` oldu
      (düzeltmeden önce üçünde de `fullscreen` kalıyordu); tercih tam ekranken
      uygulama tam ekran açıldı. Çekmeceden seçim ve F11 kullanıcı tarafından
      elle doğrulandı.
- [x] **[P2] `tauri dev` üç oyunda dev sunucusu yerine son derlemeyi
      gösteriyordu.** Oyun crate'leri paylaşılan kabuğu
      `features = ["custom-protocol"]` ile bağlıyordu; `tauri dev`in
      `--no-default-features`ı bağımlılığın özelliğini kapatamadığı için pencere
      son `vite build` çıktısını yüklüyordu (ölçüldü: yeni komut `dist`te yoktu
      ve hiç çağrılmıyordu).
      Özellik artık oyunun `custom-protocol`una bağlı. Üretim yolu değişmedi:
      üç APK yeniden derlenip telefonda `http://tauri.localhost/` üzerinden
      tuvaliyle açıldı. Aynı turda VOL.LIFE ve vol-arachnid vite ayarı
      `src-tauri`yi izleme dışı bıraktı (Android derlemesi açık dev penceresini
      defalarca yeniden yüklüyordu) ve VOL.LIFE'ın dev sunucusu izin listesine
      tükettiği `tauri-v2` girdi.
- [x] **[P1] Linux masaüstünde kare hızı NVIDIA + Wayland'da 18'e kilitliydi
      (kullanıcı bildirdi).** Paylaşılan kabuk WebKit'in DMA-BUF çizicisini
      koşulsuz kapatıyordu; o yolda her kare CPU üzerinden kopyalanıyor. Ölçüldü
      (RTX 3050 / sürücü 610.57, KDE Plasma 6.7, WebKitGTK 2.52, 1920×1080, boş
      sahne, arka plan boşta): çizici kapalıyken 18 FPS ve web işlemi %89;
      açıkken yerel Wayland'da explicit sync protokol hatasıyla (Gdk Error 71)
      açılışta çöküş, XWayland'da boş pencere; açık ve
      `__NV_DISABLE_EXPLICIT_SYNC=1` ile sabit 60 FPS ve %12. GBM'siz yol 36–40,
      SHM zorlama 24–25, vblank zamanlayıcısı 17–18 FPS'te kaldı. Kabuk artık
      yalnız ekranı tek başına NVIDIA sürücüsünün sürdüğü yerel Wayland
      oturumunda çiziciyi açık bırakıp explicit sync'i kapatıyor; XWayland'da
      ve diğer sürücülerde güvenli yol sürüyor, dışarıdan verilen değişken
      ezilmiyor. Hiçbir değişken verilmeden ölçüldü: yerel Wayland 60 FPS / %12,
      XWayland çiziliyor (44 FPS). Ölçümlerin kaynağı `FpsMeter` tarayıcıda
      bağımsız bir kare sayacıyla karşılaştırıldı: yüksüz, 25 ms, 45 ms ve 8/40 ms
      dalgalı yükte sayım 60,0 / 33,9 / 20,2 / 34,4, gösterge 60 / 34 / 20 / 34.
- [x] **[P3] vol-hell HUD arenayı örtmüyor.** HUD tek üst şerit: can ve dash
      yan yana, altlarında Spark; ortada dalga; sağda 2×2 istatistik (44 px).
      `GameHud.measureReserve` şeridin ve masaüstü yetenek satırının gerçek
      yüksekliğini ölçüyor, `Border` sahayı bu bantların dışında kuruyor (toplam
      rezerv en çok ekranın %70'i). Telefonda (832×384): şerit ve duraklatma
      28–72 px, arena çizgisi 83 px'ten başlıyor, arena 241 px (HUD'u hesaba
      katmayan kenarla 264 px'ti ve HUD sahaya biniyordu). Web: 1280×720'de 577,
      640×360 dokunmatikte 218 px; hiçbir HUD dikdörtgeni arenayla kesişmiyor.
- [x] **[P3] vol-hell dokunmatikte yetenekleri tek yerde gösteriyor.**
      Dokunmatik kararı sahne açılışında bir kez alınıyor; `TouchControls`
      düğmeleri tek temsil, `GameHud` masaüstü Q/E satırını kurmuyor ve karar
      kurucuda yazılı. Mobil kopya CSS'i ve kullanılmayan simge dalı silindi.
      Telefonda `.vol-ability-hud` yok, iki dokunmatik yetenek düğmesi var.
- [x] **[P3] iOS/WKWebView MP3 fallback'i karar olarak kapatıldı.** iOS cihaz
      erişimi yok; kullanıcı yeniden açana kadar kilitli. Dönüşüm elle koşuyor
      (`pnpm convert:ios`).
- [x] **[P2] CORE `Sheet` girdi.** Sağdan açılan, başlıklı ve kendi içinde
      kayan çekmece; en az yarım genişlik, 480 px ve altında tam genişlik. Scrim,
      odak, Escape ve Android geri sözleşmesi `Modal`dan gelir; açık `Modal`
      artık geri hareketini de tüketiyor, `Select` ve `Popup` Escape'i önce
      kendileri tüketiyor. `StatsPanel` bu kabuğa taşındı; vol-ui PANELS
      sekmesi, layout e2e'si ve `core/docs/public-surface.md` (227 → 228; kayda
      geçmemiş 223 → 227 girdisi de eklendi) güncellendi.
- [x] **[P2] Dokunsal yetenek masaüstü Chromium'da yanlış pozitifti.**
      `navigator.vibrate` tanımlı ama motorsuz; VOL.LIFE seçeneklerinde işe
      yaramayan bir anahtar olarak görüldü. Titreşim katmanı artık yalnız mobil
      cihazda sayılıyor (UA-CH `mobile`, yoksa kullanıcı ajanı); telefonda satır
      görünür kaldı.

### 2026-09-10 — CORE önkoşulları: rastgelelik, simge, SegmentedControl, geri tuşu

- [x] **[P1] `SegmentedControl` genel eksikleri kapandı:** `setOptions` ile
      etiket yenileme, `ariaLabel` / `setAriaLabel`, WAI-ARIA radyo grubu
      klavyesi (tek sekme durağı, oklar, Home/End, sağdan sola) ve pasif görünüm
      (`vol-segmented--disabled`); 12 test, vol-ui forms sekmesinde pasif örnek.
- [x] **[P1] CORE simge setine `settings` girdi;** vol-ui'deki `ICON_GEAR`
      kopyası kalktı, buttons sekmesi CORE simgesini kullanıyor.
- [x] **[P1] Açılır katmanlar Android geri tuşunda kapanıyor:** `Popup` açıkken
      `pushBackHandler` kaydı tutuyor (Popover, Select, ContextMenu da); yığın
      sırası ve kayıt sızıntısı testle sınandı.
- [x] **[P3] `createRandom(0)` ayrı bir dizi üretiyor;** varsayılan tohumun ve
      0'ın dizisi testle kilitli, sonlu olmayan tohum `RangeError` veriyor. İki
      oyunun sesi yeniden üretildi; varlıklarda fark yok.

### 2026-09-10 — denetim düzeltmeleri (`6b82b2d`)

- [x] **CORE headless alt yolları:** `@volstudio/core/math`, `grid` ve
      `collections` açıldı; saf Node'da Phaser ve `window` olmadan yükleniyor.
- [x] **`ViewportManager` serbest kamera koruması:** `preserveCameraState`
      seçeneği ve kamera `data` bayrağı; resize dünya kamerasını sıfırlamıyor.
- [x] **VOL.LIFE çalışma zamanı bulguları:** ayrıntı ve yeniden açılan maddeler
      [games/vol-life/TODO.md](games/vol-life/TODO.md)'de.

### 2026-09-10 — kalite ve altyapı (`064de4e`)

- [x] **Kapsam şekli gerekçeleri koda dayanıyor:** BossController, GameAudio,
      PCController ve TouchController tabanın üstünde; GameScene ve
      MainMenuScene gerçek tarayıcı kanıtıyla.
- [x] **`quick` kapsam artığına bağlı değil;** temiz klonda yeşil.
- [x] **Kapsam şekli yalnız o koşunun lcov'unu okuyor** (`coverageRun.mjs`).
- [x] **Rust `high` kapısında.**
- [x] **`sourceSize`, `commentDensity` ve `deadI18n` çalışma ağacını görüyor.**
- [x] **Her oyun kendi ikonunu taşıyor;** `tauri-v2/src-tauri/icons` kalktı,
      `productIcons` bekçisi eklendi.
- [x] **`just tauri-ios` tarifi silindi.**
- [x] **`validateDeviceApps` `workspace-contract`a bağlandı.**
- [x] **Bundle ölçüsü dosya başına gzip.**
- [x] **Vendor sınıflaması yol ayırıcısından bağımsız.**
- [x] **Satır sınırı `.mjs`, `.js`, `.css`, `.rs` ve `.kt`'yi kapsıyor;** 1000
      satırı aşan beş CSS dosyası bölündü.
- [x] **`docs/gates.md` yeni kapıları anlatıyor.**
- [x] **`pnpm dev` vol-life'ı da açıyor.**
- [x] **Cargo kilitlerinde Tauri sürüm eşitliği kapılı;** tauri-v2 kilidi
      hizalandı.
- [x] **vol-hell drift testi açıklamasındaki yol düzeltildi.**
- [x] **`memoryEstimateAccuracy` test yorumu kararı söylüyor.**

### 2026-09-09 — dokunmatik/klavye ve kapılar (`a38fe22`)

- [x] **God-object sınırı:** sınır 1000 satıra çekildi (karar); `advancedTab`
      ve kart testleri bölündü.
- [x] **`SpatialIndex` rebuild ve artımlı yol denkliği testle kilitli.**
- [x] **CORE yüzeyi isim listesiyle korunuyor.**
- [x] **`PlayerController` takma adı kaldırıldı.**
- [x] **Tuş atama oyuncuya açık:** `KeyBindingList` ve vol-hell ayarları.
- [x] **`TouchButton` → `HoldButton`.**
- [x] **Görsel doğrulama iki uçlu değil:** vol-hell e2e kapısı kuruldu.
- [x] **Phaser sahnelerinin düşük kapsamı kapsam şekli kapısına bağlandı.**
- [x] **20 dalgalık elle smoke testi headless dalga zarfı testiyle değişti.**
- [x] **Bazı CORE primitiflerinin ikinci tüketicisi yok** — karar: iş değil.
- [x] **Bellek tahmini modeli sapıyor** — karar: iş değil (visual-synth test
      ortamı).
- [x] **Bulut CI** — karar: kapılar yerelde kalır.
- [x] **`ShopPicker` reroll çıkış animasyonu** — karar: flaş bilinçli,
      gerekçe kodda.
