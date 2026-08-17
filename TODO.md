# VOL.STUDIO — Denetim Kaydı

`dev` dalı. Bu dosya bir görev listesi değil, **tarih sıralı denetim/çalışma
kaydıdır**: her bölüm tamamlanmış bir turu ve o turun kalite kapısı sonucunu
belgeler. En güncel durum en alttaki bölümdedir; aşağıdaki tablo yalnızca
son turun özetidir.

## Son durum (2026-08-17)

| Kapı                                    | Durum | Not                                                                  |
| --------------------------------------- | ----- | -------------------------------------------------------------------- |
| `pnpm -r typecheck`                     | ✓     | 5 paket (core, vol-hell, vol-ui, design, tauri-v2)                   |
| `pnpm -r --if-present test:coverage`    | ✓     | 1252 test (core 822, vol-hell 375, tauri-v2 26, design 24, vol-ui 5) |
| `pnpm lint`                             | ✓     | 0 hata, 0 uyarı                                                      |
| `pnpm format:check`                     | ✓     |                                                                      |
| `pnpm lint:css`                         | ✓     |                                                                      |
| `pnpm build:game`                       | ✓     | `vol-hell` prod build                                                |
| `pnpm --filter @volstudio/vol-ui build` | ✓     | showcase prod build                                                  |
| `cargo check/fmt/clippy`                | ✓     |                                                                      |
| CI                                      | ✓     | `.github/workflows/ci.yml` — web + rust işleri                       |

### Dükkan kilit persistence hatası

- `CardScreens.openIntermission()` artık `lockedOfferIds`'i wave geçişinde sıfırlamıyor; kilitli teklif sonraki wave'ye taşınıyor.
- `openShop()` baştan teklif çekmek yerine `refreshShopOffers()` ile kilitli kartları koruyarak açılıyor.
- `refreshShopOffers()` wave/level-up sonrası sahip olunan yetenek kartlarının kilitli olarak kalmasını engelliyor.
- `tests/runtime/ui/cardScreens.test.ts`'e "kilitli teklif sonraki wave'de korunur" regresyon testi eklendi.

### Audio sistemi yenilemesi

- Eski müzik ve SFX asset'leri kaldırıldı; "Dark Synthetic / Void" temalı yeni üretim altyapısı ve asset'leri eklendi.
- Yeni track'ler: `hollow-signal`, `event-horizon`, `surge-protocol`, `sovereign`, `terminal-echo`, `first-light`, `null-drift`, `deep-current`.
- Yeni SFX olayları `sounds.ts`/`audio.ts`'te tanımlandı; `GameAudioDirector`, `SfxBank`, `GameScene` ve ilgili entity/manager'larla bağlandı.
- `core/docs/music-engine.md`, `core/docs/sound-synth.md` ve `games/vol-hell/README.md` yeni mimariye göre güncellendi.
- Kalite kapıları ve `audio:qa` ölçümü 0 click, 0 clip ile tamamlandı.

---

## Genel denetim — 74/74 çözüldü

10 kritik, 18 yüksek, 22 orta, 24 düşük.

### Kritik

- **K1** — `PlayerController.move()` çağıranın `Vector2`'sini yerinde normalize ediyordu; analog hareket ölüydü.
- **K2** — `ViewportManager.attachResize()` `maxDpr` kelepçesini yok sayıyordu; canvas resize sonrası pencereyi taşıyordu.
- **K3** — `animateValue()` iptali `onUpdate` içinden çalışmıyordu (zaten ateşlenmiş `rafId` iptal ediliyordu).
- **K4** — `TouchController` son parmak kalkınca `graphics.clear()` çağırmıyordu; hayalet joystick ekranda kalıyordu.
- **K5** — `SaveManager`/`GameStats`/`AudioSettings` kayıtlı veriyi tip/aralık doğrulamadan kullanıyordu; NaN skor ve kalıcı sessizlik riski.
- **K6** — `AudioContext` yoksa `new undefined()` TypeError'ı top-level'da patlıyor, hata ekranı devreye girmiyordu.
- **K7** — Açılış zincirinin ilk üç `await`'i (`i18n.init`, `audioSettings.load`, `gameStats.load`) try/catch dışındaydı.
- **K8** — `Slider` `input` olayında her adımda persist + SFX tetikliyordu (debounce yok, `menuBlip` voice limitsizdi).
- **K9** — `Wizard` boş `steps` dizisiyle guard'sız indeksleme yapıp çöküyordu.
- **K10** — `GameStateDb.init()` yarış koşuluydu; paralel çağrılar veritabanını iki kez kuruyordu.

### Yüksek

- **Y1** — `schema_version` tablosu `version` PK olduğu için migration'da çakışma yerine çoklu satır riski taşıyordu.
- **Y2** — `crossfadeTo()` `bars` verilmeden `duration` kadar hiçbir şey yapmadan bekliyordu.
- **Y3** — Ducking hold `setTimeout` (duvar saati), gain `AudioContext` saatiyle sürülüyordu — sekme arka plana alınca senkron bozuluyordu.
- **Y4** — `Slider.setValue()` programatik çağrıda da `onChange` tetikliyordu (geri besleme döngüsü riski).
- **Y5** — Kullanılmayan `dialog:*` Tauri izinleri ve `shell`/`dialog` plugin'leri fazla yetki riski taşıyordu.
- **Y6** — `Joystick`/`SquareJoystick` global `pointermove` listener'ını ömür boyu bağlı tutuyordu.
- **Y7** — `Modal` global kilit sayacı, sahne `destroy()` çağrılmadan yıkılırsa sayfayı kalıcı kilitleyebiliyordu.
- **Y8** — `Popup` yalnızca `show()`'da konumlanıyordu; resize/scroll sonrası çapasından kopuyordu.
- **Y9** — `MainMenuScene.nextScene` `create()`'te sıfırlanmıyordu; sahne yeniden başlatıldığında eski değer taşınıyordu.
- **Y10** — `GameScene.isAmbientLoaded` yeniden başlatmada sıfırlanmıyordu (aynı kural, aynı sorun).
- **Y11** — SFX'ler açılışta paralel `load()` çağrılarıyla iki kez indirilip decode ediliyordu.
- **Y12** — CI yoktu; kalite kapılarının çürümesinin kök nedeniydi.
- **Y13** — `pnpm lint` 19 hatayla kırmızıydı (bir `no-floating-promises` gerçek kusurdu).
- **Y14** — `pnpm format:check` 15 dosyayla kırmızıydı.
- **Y15** — Kalite kontrol listesi `pnpm lint`'i içermiyordu.
- **Y16** — `AudioManager` hem ölü kod hem `noAudio: true` yüzünden tasarımı gereği çalışamaz durumdaydı; 9 testi yeşildi.
- **Y17** — `I18n`'de üç lifecycle hatası: eşzamanlı `init()`, i18next'i sıfırlamayan `reset()`, kaynaksız dil ekleyen `changeLanguage()`.
- **Y18** — `bootstrap` ile sahneler/entity'ler arası dairesel bağımlılık + korumasız top-level `await`.

### Orta

- **O1** — Sekiz bileşende temizlenmeyen timer/rAF (gerçek sızıntı beş bileşende).
- **O2** — CSS değerlerini JS'te kopyalayan altı sabit için parity testi yoktu.
- **O3** — `UIRoot` paylaşılan DOM elementini referans sayacı olmadan `destroy()`'da kaldırıyordu.
- **O4** — `Player.getPosition()` paylaşılan mutable buffer döndürüyordu, sözleşme belgelenmemişti.
- **O5** — `GameScene` her frame'de `getState()`'i iki kez çağırıp gereksiz `Vector2` üretiyordu.
- **O6** — `GameScene`'de config dışı sihirli sayılar (ambiyans eşiği, SFX kazançları).
- **O7** — `DifficultyCalculator`'da config dışı sabitler.
- **O8** — Düşman sayısı ve skor çarpanı üst sınırsız büyüyordu.
- **O9** — `SpatialGrid.key()` taşma matematiği yanlıştı (pratikte ulaşılamaz).
- **O10** — Can barı `setSize()` yerine `.width` atıyordu; yorum gerçek davranışın tersini anlatıyordu.
- **O11** — `bounceDamping` yorumu anlamın tam tersini söylüyordu.
- **O12** — `Diagnostics` min/max hesabı için her örnekte spread kullanıp ölçtüğü şeyi kendi maliyetiyle bozuyordu.
- **O13** — `Diagnostics.endStage()` ikinci çağrıda çöp değer üretiyordu.
- **O14** — Debug sunucusu Tauri dev CSP'sinde de engelliydi; bu kısıtlama belgelenmemişti.
- **O15** — `getState()` ve `getDebugSnapshot()` farklı input provider seçiyordu.
- **O16** — Boş `providers` dizisi `InputManager`'ı çökertiyordu.
- **O17** — `Wizard`'da yeniden giriş koruması yoktu; constructor callback'i erken tetikliyordu.
- **O18** — `SkillTree` yerleşimi yalnızca constructor'da hesaplanıyordu; geç font yüklemesi bayat bırakıyordu.
- **O19** — `AudioSettings.notify()` dinleyicilere canlı (kopyasız) nesne veriyordu.
- **O20** — Dar pencerede saha sınırı ters dönüyordu.
- **O21** — Satır içi `style.cssText` tasarım sistemini bypass edip CSP'yi zayıflatıyordu.
- **O22** — Dev CSP'de joker host websocket izni, production CSP'de eksik direktifler.

### Düşük

- **D1** — Beş config anahtarı hiç okunmuyordu.
- **D2** — `config.test.ts`'te 17 tautoloji testi.
- **D3** — Hiçbir pakette coverage eşiği yapılandırılmamıştı.
- **D4** — Ölü export: `soundLoadList`.
- **D5** — Ölü ses dosyası: `confirm-0.wav`.
- **D6** — `MainMenuScene` kullanılmayan bir `ToastManager` kurup yok ediyordu.
- **D7** — Yalnızca testlerin kullandığı public API yüzeyi.
- **D8** — Ayarlar ekranında ambiyans ses seviyesi kontrolü yoktu.
- **D9** — Dil listesi hardcode; `i18n.getLocales()` kullanılmıyordu.
- **D10** — `updateAmbientState()` kelepçelenmemiş delta alıyordu.
- **D11** — Açılışta gereksiz seri (paralel olabilecek) bekleme.
- **D12** — `GameAudio.dispose()` hiç çağrılmıyor, `AudioContext`'i kapatmıyordu.
- **D13** — `SfxBank` voice limiti geçici olarak aşılabiliyordu.
- **D14** — README test/lint komutlarını hiç anmıyordu.
- **D15** — Ürün kimliği üç yerde üç farklıydı.
- **D16** — `tauri-plugin-log` seviye filtresi yoktu.
- **D17** — Tutarsız null kontrolü: `this.input.keyboard!`.
- **D18** — `MainMenuScene`'de güvensiz tip cast'i.
- **D19** — vol-ui showcase'i oyunun 14 katı çeviri anahtarı taşıyor — **kullanıcı kararıyla kapsam dışı**, olduğu gibi bırakıldı.
- **D20** — `renderConnections()` gereksiz O(n²) arama yapıyordu.
- **D21** — Ölü CSS geçişi: `.vol-skill-tree__node`.
- **D22** — `Diagnostics` duraklamada sayaçları siliyordu.
- **D23** — Loading ekranı `document.body`'ye, geri kalanı `UIRoot`'a mount ediliyordu (tutarsız kök).
- **D24** — `animateValue()` iki farklı zaman tabanını karıştırıyordu.

---

## Ses/müzik motoru denetimi — 38/38 çözüldü

Kapsam: `core/src/audio/**` (synth + music), `sidechain.ts`, `GameAudio.ts`, üretim
script'leri. Mimari ayrım (`synth` = offline üretim, `music` = runtime çalma) doğruydu;
temel hatalar DSP matematiğindeydi (osilatör fazı, filtre Q'su, limiter monotonluğu).
Kritik/yüksek bulgular ölçümle (önce/sonra değer) doğrulandı, 30 regresyon testiyle
kilitlendi, tüm asset'ler düzeltilmiş motorla yeniden üretildi.

### Kritik

- **S1** — Osilatör fazı `f(t)·t` ile hesaplanıyordu; slide, vibrato, pitchJump, FM'in hepsi yanlış çıkıyordu.
- **S2** — Anti-aliasing filtresi yanlışlıkla Q≈14 rezonanslıydı (cutoff'ta +23 dB tepe).
- **S3** — `square` PolyBLEP'inde işaret hatası; çıktı ±2'ye taşıyordu.
- **S4** — Her ses tepe-normalize ediliyordu; mix'te dinamik aralık kalmıyordu (`normalize: false` opsiyonu eklendi).

### Yüksek

- **S5** — `StereoWidener` kazancı bozuktu: width=0'da +6 dB, width=2'de mono kaynak sessizdi.
- **S6** — `limitBuffer` monoton değildi; yüksek girdi bazen daha sessiz çıkıyordu.
- **S7** — `foldback` distortion tek kez katlıyordu; çıktı ±3'e taşıyordu.
- **S8** — `applyGlobalEffects` girdi buffer'ını mutasyona uğratıyordu.
- **S9** — `MusicMixer.mute(false)` masteri her zaman 1.0'a çekiyordu, ayarlanan seviyeye değil.
- **S10** — Fade-out `setTargetAtTime` ile yapılıyordu; gain hedefe hiç varmıyor, `stop()` tık sesi bırakıyordu.
- **S11** — Sequencer her notayı ayrı normalize ediyordu; müzikal dinamik yok oluyordu.
- **S12** — Sequencer kuyruk süresi hesabında birim karışıklığı.
- **S13** — WAV yazımında çift gain düşümü (0.95 × 0.95 ≈ −0.9 dB istenmeyen kayıp).
- **S14** — Gürültü kaynakları seed'siz `Math.random()` kullanıyordu; üretim tekrarlanamazdı.

### Orta

- **S15** — `timeSignature` paydası tamamen yok sayılıyordu.
- **S16** — `Cascade4Filter` erişilemez ölü kod.
- **S17** — `createFilter` içinde iç içe aynı koşul.
- **S18** — `Reverb.roomSize`, `decay` verildiğinde hiçbir etki yaratmıyordu.
- **S19** — `TRIANGLE_TABLE` modül yüklenirken 819.200 `Math.sin()` çağrısı yapıyordu.
- **S20** — `BiquadFilter` modüle edilen cutoff'ta her örnekte katsayı yeniden hesaplıyordu.
- **S21** — Kullanılmayan `sampleRate` alanları.
- **S22** — `getNextBarTime`/`getNextBeatTime` tam sınırda "şu anki"ni döndürüyordu, "sonraki"ni değil.
- **S23** — `bpm = 0` doğrulanmıyordu; `beatDuration = Infinity` oluyordu.
- **S24** — Slide/vibrato yukarı yönde Nyquist'e karşı korunmuyordu.
- **S25** — `MusicEngine.dispose()` buffer ve track cache'ini bırakmıyordu.
- **S26** — `GameAudio` motorun iç yapısını dışarıdan yeniden kabluyordu.
- **S27** — `play()` aynı track çalarken yeni `state`/`fadeIn`'i sessizce yok sayıyordu.
- **S28** — `startStem` `loopStart`'ı `loopEnd`'e kelepçelemiyordu.
- **S29** — `MusicMixer.clear()` iterasyon sırasında Map'ten siliyordu.

### Düşük

- **S30** — `exponential` zarf uçlara tam ulaşmıyordu.
- **S31** — `exponential` eğrisinin adı yanıltıcıydı.
- **S32** — 16-bit dönüşümde `Math.floor` kullanılıyordu, dither yoktu.
- **S33** — `decodeWav` yalnızca 8/16-bit PCM destekliyordu.
- **S34** — `resampleLinear` anti-aliasing yapmıyordu.
- **S35** — `Phaser` tüm allpass kademelerinde aynı frekansı kullanıyordu.
- **S36** — `StemLoader` timeout/abort desteklemiyordu.
- **S37** — İçerik tipi sezgisi kırılgandı (`application/x-wav` gibi geçerli tipleri reddediyordu).
- **S38** — `music-engine.md`, kodda hiç var olmayan bir API'yi (`ProceduralStemGenerator`, `playStinger()` vb.) belgeliyordu.

---

## OGG/MP3 migration — 2026-08-12

WAV tabanlı asset pipeline'ı OGG'ye (shipped format) taşındı, iOS için MP3 fallback
eklendi. Amaç: production build boyutunu küçültmek.

**Mimari:** WAV master dosyaları `public/` dışına, `games/vol-hell/audio-src/`'e taşındı
(source-of-truth, git'te, ama build çıktısına girmiyor). `public/assets/audio/` artık
yalnızca shipped OGG (+ iOS için MP3) barındırıyor.

**Yapılanlar:**

- `core/src/audio/synth/writer.ts` — `writeOgg()`, `writeAudio()`, `ensureFfmpeg()` eklendi. OGG, ara WAV dosyası olmadan `SynthesisResult`'tan doğrudan FFmpeg'e pipe'lanıyor (`spawnSync`, shell yok, array argüman).
- 5 generate script'i (`generate-volhell-sounds.ts`, `generate-iron-vein.ts`, `generate-black-tide.ts`, `generate-crimson-horizon.ts`, `generate-ambient-tracks.ts`) artık hem `audio-src/*.wav` hem `public/assets/audio/*.ogg` üretiyor.
- `core/scripts/convert-audio.mjs` — `public/`'teki tüm `.ogg`'yi `.mp3`'e çeviriyor (`pnpm convert:ios`).
- `core/src/audio/music/loader.ts` — `.ogg` decode başarısız olursa `.mp3` dener (iOS WKWebView Ogg Vorbis desteklemiyor); mevcut timeout/abort/content-type mantığı korundu.
- `music.ts` (6) ve `sounds.ts` (18) referansı `.ogg`'ye çevrildi.
- Gerçek üretim çalıştırıldı (FFmpeg `winget` ile kuruldu): 18 SFX + 6 müzik parçası, WAV+OGG+MP3 üçlüsü olarak.

**Doğrulama:** typecheck/test/lint/format/build hepsi yeşil (779 test, 10 yeni test loader

- writer için). `dist/` incelendi: **0 `.wav`, 24 `.ogg`, 24 `.mp3`**. `iron-vein.wav`
  7.97 MB → `iron-vein.ogg` 735 KB (~11x küçülme). Dinleme kontrolü kullanıcı tarafından
  yapıldı.

**Bilinçli tercih:** OGG'nin WAV gibi byte-identical determinizm garantisi yok
(FFmpeg/libvorbis sürüm farkları farklı çıktı üretebilir) — WAV (`audio-src/`) tek
deterministik/diff'lenebilir kaynak olarak kalıyor.

---

## ADIM 4: Kompozisyon Primitifleri ve Refaktör — 2026-08-13

**Kapsam:** `core/scripts/composition/`, `core/scripts/audio-mix.ts`,
`core/scripts/generate-iron-vein.ts`, `core/src/audio/synth/presets/instruments.ts`.

**Yapılanlar:**

- `core/scripts/composition/harmony.ts` — deterministik akor dizisi üretimi.
  - `generateProgression()`: ölçek, kök, akor tipi, seed bazlı ilerleme.
  - `generateProgressionFromPool()`: var olan akor havuzundan ilerleme seçimi.
- `core/scripts/composition/motif.ts` — kısa motif/melodi primitifleri.
  - `generateMotif()`: frekanslar veya ölçek derecelerinden motif üretimi.
  - `transposeMotif()`, `invertMotif()`, `reverseMotif()` varyasyonlar.
- `core/scripts/composition/arrangement.ts` — katman zamanlaması ve yoğunluk eğrisi.
  - `generateArrangement()`: layer start/end beat'leri ve `intensityCurve`.
- `core/src/audio/synth/presets/instruments.ts` — yeni enstrüman seti ve rol taksonomisi.
  - Enstrümanlere `role` ve `tag` eklendi.
  - `Presets.findPresets({ role, tags })` filtrelemesi `core/src/audio/synth/presets/catalog.ts`'e eklendi.
- `generate-iron-vein.ts`: `CHORDS` artık `generateProgressionFromPool()` ile,
  katman aktifliği `generateArrangement()` ve `isLayerActive()` ile kontrol ediliyor.
  `iron-vein.wav` orijinal `.bak` ile byte-identical doğrulandı (hash eşleşti).
- `generate-composition-demo.ts`: yeni bir demo track; `generateProgression()`,
  `generateMotif()` ve `generateArrangement()`'ın üçü de bir arada kullanılıyor.
  Demo iki defa üretilip hash eşleşmesi doğrulandı.
- `core/tests/audio/composition.test.ts` eklendi.
- `core/docs/music-engine.md` ve `core/docs/sound-synth.md` güncellendi.

**Kalite kapıları:**

- `pnpm -r typecheck` ✓
- `pnpm -r test` ✓ (653 test, önceki 648'den 5 yeni)
- `pnpm lint` ✓
- `pnpm format:check` ✓
- `pnpm --filter @volstudio/vol-hell build` ✓

**Bilinçli tercih:** `generate-iron-vein.ts` içinde `generateMotif()` doğrudan
kullanılmadı; `signalTone()` sesinin byte-identical çıktısını etkileyecek kadar
V8 heap/JIT belirleyiciliği oluşturdu (motif değerleri aynı olmasına rağmen
son `dither` yuvarlama noktasında farklı bitler çıktı). `generateMotif()`
primitifi `generate-composition-demo.ts`'de gösterildi ve tekrarlanabilirliği
doğrulandı.

---

## Ses asset pipeline'ı — tek format (2026-08-13)

**Sorun:** Aynı ses üç formatta (wav+ogg+mp3) repoda duruyordu. Git'te 72 ses
dosyası / 66 MB. MP3'ler hiç kullanılmayan bir iOS hedefi için üretilmişti
(`src-tauri/gen/` boş).

**Karar:** Tek format — OGG. Oyun asset'i olduğu için repoda TUTULUR (font ve
texture gibi). Klonlayan `pnpm install && pnpm dev` ile sesli oynayabilmeli.
Repoda tutulmayan tek şey ara formatlardır: kayıpsız WAV kopyası (üretim
deterministik, gerekirse script'ten alınır) ve MP3 (yalnızca iOS build'inde).

```
core/scripts/generate-*.ts          ÜRETİM SCRIPT'İ (git'te)
games/*/public/assets/audio/**.ogg  OYUN ASSET'İ (git'te)
games/*/dist/                       BUILD ÇIKTISI (gitignore)
```

**Yapılanlar:**

- Üretim yalnızca OGG verir; `writeWav` çağrıları script'lerden kaldırıldı.
  CLI'lar tek argümana indi (`<out.ogg>` / `<out-dir>`).
- `games/vol-hell/audio-src/` (24 WAV, 55 MB) silindi.
- `public/**/*.mp3` (24 dosya) silindi. MP3 **altyapısı duruyor**: iOS hedefi
  geldiğinde `pnpm convert:ios` OGG'den üretir, `StemLoader` fallback'i yerinde.
- `generate:audio` toplu komut eklendi.
- `audio-qa.ts` artık shipped OGG'yi FFmpeg ile decode edip ölçüyor — encode
  sonrası artefaktlar da kapsama girdi.

**Doğrulama:** `pnpm audio:qa`: 0 click, 0 clip. Build çıktısında 24 ogg,
0 wav, 0 mp3.

**Düzeltilen hata:** İlk uygulamada OGG'ler de gitignore'lanmış, klon sonrası
otomatik üretim için `ensure-audio.mjs` + `predev`/`prebuild` hook'u
eklenmişti. Yanlış karardı: oyun asset'ini repodan çıkarmak, oyunu çalıştırmak
için FFmpeg kurulumunu ve dakikalarca üretim beklemeyi zorunlu kılıyordu.
Geri alındı, hook silindi.

---

## Son kontrol — UI/Audio runtime hataları

Kapsam: Vite build font uyarıları, `GameScene.onPlayerDeath` hata yutma,
`LoadingScreen` video play senkron hata, SFX temizliği ve benzer UI/Audio
promise hata kalıpları.

### Yapılanlar

- `games/vol-hell/index.html`, `games/vol-ui/index.html` — ölü `@font-face`
  tanımları kaldırıldı; build font URL uyarısı geçti.
- `core/src/ui/overlays/LoadingScreen.ts` — `video.play()` senkron
  `NotAllowedError` yakalanıp CSS fallback uygulanıyor.
- `core/tests/setup.ts` — jsdom `HTMLMediaElement.prototype.play` no-op mock
  eklendi; test gürültüsü kesildi.
- `core/tests/ui/loadingScreen.test.ts` — senkron play hatası için test eklendi.
- `games/vol-hell/src/runtime/scene/GameScene.ts` — `onPlayerDeath`
  `try/catch/finally` ile güvenli kapanış; hata durumunda `MainMenu`'ye yönlendirme.
- `games/vol-hell/src/app/SfxBank.ts` — `stopAll()` eklendi; `release()` aktif
  sesleri durduruyor.
- `games/vol-hell/src/app/GameAudio.ts` — `stopAllSfx()` eklendi;
  `AudioContext.resume()`/`suspend()` reddedilen promise'ları yakalıyor.
- `games/vol-hell/src/runtime/scene/{Game,MainMenu,Settings}Scene.ts` —
  shutdown'ta `stopAllSfx()` çağrılıyor.
- `games/vol-hell/tests/app/SfxBank.test.ts`, `tests/mocks/audio.ts` —
  `SfxBank` davranış testleri eklendi.
- `core/src/ui/primitives/Button.ts` — `onClick` hataları yutuluyor, loading
  durumu takılı kalmıyor.
- `core/src/ui/layout/Wizard.ts` — `handleNext` hata durumunda ilerleme
  kilitlenmiyor.
- `core/src/ui/controls/PullToRefresh.ts` — `onRefresh` reddederse gösterge
  `refreshing` fazında kalmıyor.

### Bilinçli tercih

- iOS/WKWebView MP3 fallback otomatik üretilmiyor (`convert:ios` manuel);
  kullanıcı şu an iOS hedeflemiyor.

### Kalite kapıları

| Kapı                                      | Durum | Not             |
| ----------------------------------------- | ----- | --------------- |
| `pnpm -r typecheck`                       | geçti | 4 paket         |
| `pnpm test`                               | geçti | 793 test        |
| `pnpm lint`                               | geçti | 0 hata, 0 uyarı |
| `pnpm format:check`                       | geçti |                 |
| `pnpm lint:css`                           | geçti |                 |
| `pnpm --filter @volstudio/vol-hell build` | geçti | 0 font uyarısı  |
| `pnpm --filter @volstudio/vol-ui build`   | geçti | 0 font uyarısı  |
| `cargo check/fmt/clippy`                  | geçti |                 |

---

## AŞAMA 1/3 — Temel Altyapı (taktiksel arena-survival dönüşümü) — 2026-08-13

Üç aşamalı jenre dönüşümünün ilk parçası: Aşama 2 (ability + kart sistemi) ve
Aşama 3 (elite/boss + cila) bu altyapının üstüne oturacak. Bu aşamada YENİ
OYNANIŞ İÇERİĞİ eklenmedi; kule, zincir yıldırım, kart seçimi, elite ve boss
YOK — yalnızca onları taşıyacak zemin kuruldu.

### A — İki bilinen hata

- **A1** `core/tests/setup.ts` — `document.fonts` stub'ı KOŞULSUZ hale getirildi
  (`Object.defineProperty`). Yeni jsdom sürümleri native `document.fonts`
  sağlıyor ama `ready` promise'i hiç resolve olmuyordu; koşullu stub devreye
  girmediği için `createVolGame` her testte 5 sn (`TECH.FONT_READY_FALLBACK`)
  bekleyip vitest timeout'una çarpıyor, yarım kalan promise zinciri sonraki
  teste sızıyordu. `tests/game.test.ts` 5/5, üç ardışık koşuda stabil.
- **A2** `core/scripts/composition/harmony.ts` — `generateProgressionFromPool`
  ardışık tekrar koruması, havuz İNDEKSİNİ frekansla (`result[i-1].root`)
  kıyaslıyordu; koruma fiilen hiç çalışmıyordu. Ayrı bir `previousIndex` ile
  düzeltildi, tek elemanlı havuz için guard eklendi. `composition.test.ts`'e
  yüksek `tonicWeight` regresyon testi eklendi. `generate-iron-vein.ts`
  çıktısı ETKİLENMİYOR (indeksler zaten farklıydı, doğrulandı).

### B — Stat/modifier sistemi (Player + Enemy ortak)

- `core/src/stats/StatBlock.ts` — dört stat (`damage`, `speed`, `health`,
  `fireRate`), `add`/`multiply` modifier, kalıcı/koşullu (`condition`) ayrımı,
  dinamik değer (`() => number`) desteği. Hesap sırası:
  `(taban + Σ add) × Π multiply`. `@volstudio/core`'dan export edilir.
- `Player` düz config okumayı bıraktı; stat bloğu kurup hız/can/hasar/ateş
  temposunu oradan okuyor. `BulletManager` mermi hasarını ve cooldown'u
  oyuncunun stat bloğundan alıyor.
- `Enemy`'deki eski `EnemyStats` arayüzü KALDIRILDI, yerini `StatBlock` aldı.
  `DifficultyCalculator` artık mutlak değer değil ÇARPAN üretiyor; çarpanlar
  `createEnemyStats()` içinde spawn anında `multiply` modifier olarak stat
  bloğuna giriyor. Üç paralel sistem (config → EnemyStats → Difficulty) tek
  zincire indi.
- Regresyon testi (`tests/runtime/entity/enemyStatsRegression.test.ts`) eski
  formülün birebir kopyasını 8 farklı `elapsedMs` değerinde yeni zincirle
  karşılaştırıyor — can ve hız birebir aynı.

### C — Düşman kataloğu (data-driven, elite/boss hariç)

- `src/config/enemies/` — ses preset kataloğuyla aynı desen: `types.ts` +
  `catalog/{base,rusher,swarmer}.ts` + `catalog/index.ts` (`ENEMY_CATALOG`,
  `findEnemies`, `getEnemyDefinition`, `pickEnemyDefinition`,
  `getMaxEnemyRadius`).
- Üç arketip: `grunt` (base, bugünkü düşman), `lancer` (rusher),
  `brooder` (swarmer) + `swarmling` (brooder'ın minion'u, dalga havuzunda yok).
- Davranışlar `src/runtime/entity/behaviors/` altında BAĞIMSIZ fonksiyonlar:
  `applySeekBehavior`, `applyStandoffBehavior`, `applyRusherBehavior`,
  `applySwarmerBehavior`. `Enemy` sınıfına gömülü değiller; kendi durum
  nesneleriyle çalışırlar, böylece Aşama 3'te Elite ikisini de kompoze
  edebilecek.
- `EnemyManager` katalogdan dalga-kapılı ağırlıklı seçim yapıyor, swarmer'ın
  doğurma isteklerini karşılıyor; spawn rastgeleliği artık seed'li PRNG.

### D — Görsel katman (Phaser-native)

- Elle yazılmış `ParticlePool` (Arc + tween zinciri) SİLİNDİ. Yerine
  `EffectManager` geldi: Phaser'ın kendi `ParticleEmitter`'ını kullanır,
  havuzlamayı motora bırakır.
- `src/config/effects.ts` — hangi olayın hangi partikül/renk/süre/sarsıntı
  kombinasyonuna karşılık geldiği tek merkezde. Mevcut olaylara bağlandı:
  ateş, mermi izi, sekme, düşman vuruşu/ölümü, rusher atılımı, oyuncu dash'i,
  oyuncu hasarı, Flux toplama.
- Kamera sarsıntısı da efekt tanımının parçası (efekt başına cooldown +
  ayarlardan gelen şiddet ölçeği). `gameConfig.shake` kaldırıldı,
  `GameScene`'deki iki ayrı sarsıntı bloğu tek katmana indi.
- Partikül dokusu bir kez üretilir (`Graphics.generateTexture`), renk emitter
  `tint`'i ile verilir.

### E — Ekonomi iskeleti ve koşu yapısı

- `RunEconomy` — Flux (kalıcı) ve Spark (koşu içi) sayaçları, Spark seviye
  eşikleri (`onLevelUp` olayı; kart ekranı Aşama 2'de bağlanacak).
- **Flux gerçekten yere düşer**: `FluxPickup` + `FluxPickupManager` —
  saçılma, mıknatıs çekimi, temasla toplama, süre dolumu + yanıp sönme.
  **Spark pickup değildir**; düşman ölünce doğrudan sayaca eklenir.
- `WaveManager` — 20 dalga × 40 sn. Olaylar: `onWaveStart`, `onWaveEnd`
  (dükkan tetikleyicisi), `onEliteWave` (dalga 10), `onBossWave` (dalga 20),
  `onRunComplete`. Hepsi şu an Diagnostics'e olay yazıyor; UI Aşama 2/3'te.
- Zorluk eğrisi 800 sn'lik koşuya göre yeniden ayarlandı: hız büyümesi
  %15/dk → %7/dk, can %18/dk → %14/dk. Eski oranlarla koşu sonunda düşman
  hızı 265 px/sn oluyordu (oyuncu 220) — kaçış imkânsızdı. Yeni tavan ~173
  px/sn. Testle kilitlendi.

### Yapılan varsayımlar

- **`fireRate` = cooldown (ms), düşük değer hızlı saldırı.** Dört stat adı
  sabit olduğu için ters yönlü bir stat kaçınılmazdı; JSDoc'ta ve testte
  açıkça belgelendi. "Ateş hızı +%25" veren bir kart `multiply 0.8` verir.
- **Düşman `damage`/`fireRate`** temas hasarı ve temas hasarı bekleme süresi
  olarak yorumlandı; böylece dört stat düşmanlar için de anlamlı.
- **Dash hızı, hız stat'ının tabana oranıyla ölçeklenir** — "hız +%20" kartı
  dash'i de aynı oranda hızlandırır. Modifier yokken davranış değişmez.
- **Zorluk çarpanları spawn anında sabitlenir** (fonksiyon değil sabit değer):
  bir düşman doğduğu andaki zorlukla yaşar, zamanla kendiliğinden güçlenmez.
  Eski davranış buydu.
- **Maks. can, mermi hasarının katına yuvarlanır** (`quantizeEnemyHealth`);
  eski koddaki kural korundu, ek olarak "en az bir vuruşluk can" guard'ı
  eklendi (eski kodda 12.5 canın altı 0'a yuvarlanabiliyordu).
- **`displayName` teşhis/log amaçlıdır**, oyuncuya gösterilmez — bu yüzden
  i18n anahtarı açılmadı. Düşman adları UI'da görünürse (Aşama 3) i18n'e taşınır.
- **Koşu seed'i** `Date.now()` ile üretilir ve Diagnostics'e yazılır; her koşu
  farklı, ama seed verilirse birebir tekrarlanabilir. `Math.random()` kullanan
  yeni kod yok.
- **Flux/Spark için HUD elemanı eklenmedi** — sayaçlar Diagnostics'e yazılıyor.
  HUD/dükkan gösterimi Aşama 2'nin kart/dükkan UI'ıyla birlikte gelecek.
- **Flux toplama sesi yok** — mevcut SFX kataloğunda uygun bir olay yok, yeni
  ses asset'i üretmek bu aşamanın kapsamı dışında.
- **`separationRadius` → `separationGap`**: ayrılma mesafesi artık
  `r1 + r2 + gap`. Sabit 30 px, katalogdaki farklı boyutlu düşmanlarda iri
  olanları iç içe geçiriyordu. İki temel düşman için sonuç aynı (14+14+2 = 30).
- **Can barı ölçüsü yarıçaptan türetilir** (`healthBarWidthRatio`,
  `healthBarGap`); temel düşman için eski değerlerle birebir aynı (28 px / 22 px).
- **`CollisionResolver.onPlayerDamaged` kaldırıldı** — sarsıntı efekt katmanına
  taşınınca callback'in tüketicisi kalmadı; boş gövdeli bir kanca bırakmak
  yerine silindi (gerektiğinde üç satırla geri gelir).
- **`vol-ui` showcase'ine dokunulmadı**: bu aşamanın görsel katmanı tamamen
  Phaser canvas tarafında kaldı, `core/src/ui` altında yeni DOM component
  doğmadı. Aşama 2'nin kart UI'ı için kritik olacak.

### Aşama 2 bu altyapıyı nasıl kullanacak

- **Kartlar** `player.getStats().addModifier({...})` çağırır; kalıcı kartlar
  `condition` vermez, takas kartları `condition: () => durum` verir.
  `removeModifier(kartId)` tek çağrıda kartın tüm stat etkilerini geri alır.
- **Level-up ekranı** `RunEconomy` `onLevelUp` olayına bağlanır;
  **dükkan ekranı** `WaveManager` `onWaveEnd` olayına, bakiye
  `economy.getFlux()` / `economy.spendFlux()` ile.
- **Yeni efektler** `effectsConfig`'e bir satır eklenip
  `effects.play('id', x, y)` ile tetiklenir — motor tarafında değişiklik gerekmez.
- **Aşama 3'te Elite**, `applyRusherBehavior` + `applySwarmerBehavior`
  fonksiyonlarını kendi durum nesneleriyle üst üste çağırarak kompoze eder;
  `WaveManager.onEliteWave` / `onBossWave` tetikleyicileri hazır.
- **HUD**: `player.getMaxHealth()` artık modifier'lara duyarlı; can barının
  `max` değeri sahne kurulumunda bir kez okunuyor. Maks. canı değiştiren bir
  kart eklendiğinde bar `max`'ı da güncellenmeli.

### Kalite kapıları

| Kapı                                      | Durum | Not                                                      |
| ----------------------------------------- | ----- | -------------------------------------------------------- |
| `pnpm -r typecheck`                       | geçti | 4 paket                                                  |
| `pnpm -r test`                            | geçti | 917 test (core 675, vol-hell 212, tauri-v2 25, vol-ui 5) |
| `pnpm lint`                               | geçti | 0 hata, 0 uyarı                                          |
| `pnpm format:check`                       | geçti |                                                          |
| `pnpm lint:css`                           | geçti |                                                          |
| `pnpm --filter @volstudio/vol-hell build` | geçti |                                                          |

**Doğrulanmayan:** tarayıcıda görsel/oynanış kontrolü yapılmadı (ortamda
tarayıcı otomasyonu yok; Phaser HEADLESS jsdom'da boot etmiyor — bu yüzden
`core/tests/game.test.ts` zaten `Phaser.Game`'i mock'luyor). Efekt katmanının
Phaser API kullanımı Phaser'ın kendi tip tanımlarıyla derleme zamanında
doğrulandı; partikül/dalga akışının GÖRSEL kontrolü `pnpm dev` ile
yapılmalıdır.

---

## Aşama 1 devamı — katmanlama, Flux düşüşü ve ekonomi HUD'u — 2026-08-13

Oyun içi ilk görsel geri bildirim turu. Kullanıcı gözlemleri: Flux parçaları
düşmanların üstünde çiziliyordu, düşme animasyonu yoktu, Spark'ın hiçbir
göstergesi yoktu.

### Render katmanları (kök sorun)

`src/config/layers.ts` — `RENDER_DEPTH` tek kaynak. Önceden HİÇBİR entity'de
`setDepth` yoktu; Phaser yaratılma sırasına göre çiziyordu, yani sonradan doğan
her düşman oyuncunun ve yerdeki Flux'un üstüne biniyor, sıralama koşudan koşuya
değişiyordu.

```
border -100 < groundEffect -60 < fluxPickup -50 < enemy 0
       < enemyHealthBar 5 < player 10 < bullet 20 < impactEffect 30
```

- `Border`, `Enemy`, `EnemyHealthBar`, `Player`, `Bullet`, `FluxPickup` artık
  katmanını açıkça veriyor; `effectsConfig`'teki eski `-1/1/2` değerleri de bu
  ölçeğe taşındı (iki ayrı derinlik ölçeği kalmadı).
- Yan fayda: oyuncu artık düşman kalabalığının altında kaybolmuyor, düşman can
  barları başka bir düşmanın gövdesi altında kalmıyor.
- `tests/config/renderDepth.test.ts` sıralama İLİŞKİLERİNİ kilitliyor.

### Flux düşme animasyonu

- Parça ölüm noktasında doğar, `easeOutCubic` ile saçılma noktasına giderken
  bir yay çizer, fırlama anındaki büyüme (`popScale`) inişte sönümlenir.
- İniş bitene kadar **toplanmaz ve mıknatıs çalışmaz** — "birden altında
  belirme" hissi kalktı.
- İniş sonrası hafif süzülme (bob): `economyConfig.flux.bob.enabled` ile
  kapatılabilir. Mıknatıs parçayı taşıdıkça salınım merkezi güncelleniyor,
  oyuncu menzilden çıkınca parça eski yerine ışınlanmıyor.
- Tween yerine `update()` içinde elle yürütülüyor: delta tabanlı, deterministik
  ve mevcut sahte sahne testleriyle doğrulanabilir.

### Flux ömrü kaldırıldı

Parçaların 12 sn ömrü ve son 3 sn'de yanıp sönmesi **silindi**; Flux toplanana
kadar yerde durur. Bunun yerine sahne tavanı (`maxActive`) dolduğunda yeni
düşen miktar en eski parçanın üzerine eklenir — sahne şişmez, hiçbir Flux
kaybolmaz.

### Ekonomi HUD'u

- **Spark = deneyim**: sol sütunda can ve dash barlarının altında `XPBar`
  (`vol-hud__slot--spark`). Bar `RunEconomy`'nin GÖRÜNTÜSÜDÜR; seviye defterini
  ekonomi tutar. Bunun için core'a `XPBar.setState(level, xp)` eklendi
  (`addXP()` kendi defterini tutuyor, iki sayaç kaçınılmaz olarak kayardı).
  Seviye atlayınca XPBar'ın hazır `--level-up` vurgusu oynuyor.
- **Flux = para birimi**: sağ üst blokta `ResourceCounter` (kristal ikonu +
  sayı), toplandıkça `pulse` vurgusu.
- `RunEconomy.getSparkInLevel()` / `getLevelSpan(level)` eklendi.
- i18n: `hud.spark`, `hud.flux`, `hud.level` (tr + en).
- `src/runtime/ui/icons.ts` — HUD ikonları `currentColor` ile çizilir, renk
  CSS'ten gelir (tema token'ı dışına çıkan sabit renk yok).
- Yeni component YAZILMADI; `XPBar`, `ResourceCounter` ve `Counter` zaten
  `core/src/ui` içinde ve vol-ui showcase'inin HUD sekmesinde — README tablosu
  değişmedi.

### Ödül dengesi (kullanıcı kararı)

| Düşman             | Flux | Spark |
| ------------------ | ---- | ----- |
| grunt              | 1    | 3     |
| lancer             | 1    | 4     |
| brooder            | 2    | 6     |
| swarmling (minion) | 0    | 1     |

Spark seviye eşikleri değişmedi: 12 → 28 → 50 → 80 → 119 (kümülatif).

### Bilinçli tercihler

- Ölüm başına "+3 Spark" floating text'i EKLENMEDİ: kalabalık dövüşte ekranı
  doldururdu. Geri bildirim barın dolması ve seviye vurgusu.
- Flux sayısı dilden bağımsız (yalnız ikon + rakam); çeviri yalnızca ekran
  okuyucu etiketinde.
- Bar dolumu animasyonlu olduğu için testler anlık değeri `aria-valuenow`
  üzerinden doğruluyor; metin animasyonla akıyor.

### Kalite kapıları

| Kapı                                      | Durum | Not                                                      |
| ----------------------------------------- | ----- | -------------------------------------------------------- |
| `pnpm -r typecheck`                       | geçti | 4 paket                                                  |
| `pnpm -r test`                            | geçti | 944 test (core 679, vol-hell 235, tauri-v2 25, vol-ui 5) |
| `pnpm lint`                               | geçti | 0 hata, 0 uyarı                                          |
| `pnpm format:check`                       | geçti |                                                          |
| `pnpm lint:css`                           | geçti |                                                          |
| `pnpm --filter @volstudio/vol-hell build` | geçti |                                                          |

**Doğrulanmayan:** görsel kontrol hâlâ tarayıcıda yapılmalı (`pnpm dev`) —
ortamda tarayıcı otomasyonu yok.

---

## Aşama 1 kapanış — hata avı ve sağlamlaştırma — 2026-08-13

Çalışma ağacının tamamı gözden geçirildi; bulunanlar:

### Düzeltilen hatalar

- **CSS token hatası:** Flux satırı `var(--vol-ui-accent)` kullanıyordu — böyle
  bir token YOK (`--vol-ui-accent-solid/-hover/-pressed/-subtle/-border` var).
  Renk sessizce uygulanmıyordu. `--vol-ui-text`'e çevrildi; bu aynı zamanda
  `Counter` pulse animasyonunun bitiş rengi, yani vurgu bitince renk zıplamıyor.
- **Kesirli Flux:** `FluxPickupManager.drop()` miktarı parçalara bölerken
  tamsayı varsayıyordu; ileride bir çarpan kartı kesirli miktar üretirse
  toplam bozulurdu. Girişte `Math.floor` ile tamsayıya iniliyor.

### Sağlamlaştırma (Aşama 2 kartlarına karşı)

Kartlar stat'ları serbestçe değiştirecek; uç değerlerin oyunu saçma bir duruma
sokamayacağı `tests/runtime/entity/statHardening.test.ts` ile kilitlendi:

- `bulletConfig.minFireCooldownMs` (40 ms) eklendi — ateş hızını artıran bir
  modifier cooldown'u sıfıra indirse bile mermi üretimi FPS'e bağlanmaz.
- Negatif `damage` artık iyileştirmiyor: mermi hasarı ve düşman temas hasarı
  sıfıra kelepçeleniyor.
- Negatif `speed` oyuncuyu/düşmanı ters yöne sürüklemiyor.
- `quantizeEnemyHealth` zaten en az bir vuruşluk can garantiliyordu; test edildi.

### Ölü kod temizliği

- `bulletConfig.trailSpread`, `playerConfig.dashGhostStrokeWidth`,
  `dashGhostStrokeAlphaFactor` — partikül geçişinden sonra hiçbir yerde
  okunmuyordu, silindi.
- `RunEconomy.getLevelProgress()` ve `getNextThreshold()` —
  `getSparkInLevel()` + `getLevelSpan()` ile aynı bilgiyi iki kez hesaplıyordu
  (kayma riski), silindi.
- `RunEconomy.onFluxChanged` callback'i — HUD zaten her frame sayacı okuyor,
  ikinci bir sinyal yolu gereksizdi.
- `FluxPickup.isActive/hasLanded/amount` getter'ları — dışarıdan çağıran yok.

### Yeni entegrasyon testi

`tests/runtime/runSimulation.test.ts` — sahte sahnede tam koşu simülasyonu
(dalga + spawn + ölüm + Flux düşüşü/toplama + seviye atlama). Doğruladıkları:
sayıların sınır içinde kalması, konumların sonlu ve saha içinde kalması, 20
dalganın olaylarını doğru sırada üretmesi, aynı seed'in aynı koşuyu vermesi.

### Doğrulandı, sorun çıkmadı

- Ölüm anında `enemy.x/y` okunması: Phaser `destroy()` yalnızca
  `active/scene/parentContainer` alanlarını temizliyor, koordinatlar duruyor.
- Sahne yeniden başlatmada yeni alanların hepsi (`effects`, `economy`,
  `waveManager`, `fluxPickups`, `sparkBar`, `runRandom`) `create()` içinde
  yeniden kuruluyor; `SHUTDOWN`'da temizleniyor.
- `UIRoot.mount()` sadece `appendChild`; SparkBar'ın doğrudan append etmesi
  aynı davranış.
- Yeni kodda `Math.random()` yok; kalan kullanımlar oynanış dışı (menü müziği
  seçimi, SFX varyantı, yükleme animasyonu).

### Bilinen borç (Aşama 2'ye taşınıyor)

- `GameScene.ts` 636 satır. Çarpışma zaten `CollisionResolver`'a ayrılmıştı ama
  sahne koşu yaşam döngüsü + ses + HUD + duraklama/ölüm akışını birlikte
  taşıyor. Aşama 2'de dükkan/kart ekranları eklenmeden ÖNCE bölünmeli
  (öneri: koşu yaşam döngüsü ve ses yönetimi ayrı birer sınıfa).
- Can barının `max` değeri sahne kurulumunda bir kez okunuyor; maks. canı
  değiştiren bir kart geldiğinde barın `max`'ı da güncellenmeli.

### Kalite kapıları

| Kapı                                      | Durum | Not                                                      |
| ----------------------------------------- | ----- | -------------------------------------------------------- |
| `pnpm -r typecheck`                       | geçti | 4 paket                                                  |
| `pnpm -r test`                            | geçti | 954 test (core 679, vol-hell 245, tauri-v2 25, vol-ui 5) |
| `pnpm lint`                               | geçti | 0 hata, 0 uyarı                                          |
| `pnpm format:check`                       | geçti |                                                          |
| `pnpm lint:css`                           | geçti |                                                          |
| `pnpm --filter @volstudio/vol-hell build` | geçti |                                                          |
| `pnpm --filter @volstudio/vol-ui build`   | geçti |                                                          |

### XPBar uyarı durumu (kullanıcı geri bildirimi)

`Bar`'ın "düşük değer = kırmızı" uyarısı TÜM barlara uygulanıyordu; XP barı
seviye başında boş olduğu için kritik/kırmızı görünüyor ve yanlış algı
yaratıyordu. `BarOptions.lowThreshold` artık `number | null`: `null` verilince
uyarı durumu hiç oluşmaz. `XPBar` bunu kullanıyor — dolan bir bar tek renk.

Can, mana ve dash barları değişmedi: orada düşük değer gerçekten uyarıdır.

---

## AŞAMA 2/3 — Ability sistemi, kart sistemi, level-up/dükkan UI — 2026-08-14

Aşama 1'in altyapısı üzerine oynanış içeriği: dört ability mekaniği, 31 kartlık
havuz, level-up ve dükkan akışları, kart UI component'leri.

### Ön işler (Bölüm A/B/C/D'den önce)

- **`GameScene.ts` bölündü.** 636 satırdı; koşu yaşam döngüsü `RunDirector`'a,
  ses yönetimi `GameAudioDirector`'a, HUD kurulumu/tazelemesi `GameHud`'a
  taşındı. Aşama 2'nin tüm eklemelerinden SONRA sahne **559 satır** — yani
  büyümek yerine küçüldü.
- **Can barı artık reaktif.** `Player.syncMaxHealth()` maks. can değişimini her
  frame yakalıyor: artışta kazanılan can hemen veriliyor (yoksa "+60 can" kartı
  o an hiçbir şey yapmazdı), azalışta mevcut can tavana kelepçeleniyor. HUD
  tarafında `Bar.setMax()` değişimi izliyor.
- **`core/tests/game.test.ts` 5/5 yeşil.** Kalan sorun font değil, `vi.mock`
  içindeki `vi.importActual('phaser')` yüzünden gerçek Phaser modülünün
  transform maliyetiydi; dosya bazında `testTimeout` 20 sn'ye çıkarıldı
  (mock'u daraltmak Game.ts'in dokunduğu `Phaser.Game`/`Core.Events`/`Scale`
  yüzeyini elle taklit etmeyi gerektirirdi — testi gerçeğe uzaklaştırırdı).
  `--no-file-parallelism` dahil üç koşuda doğrulandı.

### Bölüm A — Kart veri modeli

- `src/config/cards/` — tip başına ayrı dosya + `CARD_CATALOG` + `findCards` +
  `drawCards` (ses preset kataloğuyla aynı desen).
- **31 kart**: 12 ability, 13 buff, 6 takas. Nadirlik dağılımı 11/10/10.
- Rarity kartın kendi tasarımına GÖMÜLÜ; RNG yalnızca hangi kartın çekileceğini
  belirler (`DEFAULT_RARITY_WEIGHTS`: rare 62 / epic 28 / legendary 10).
- Fiyatlar Flux ölçeğiyle hizalı: rare 10, epic 18, legendary 32. Geri satışta
  fiyatın %50'si iade edilir (`getCardSellValue`).
- **Koşullar veri olarak taşınır.** Katalogda closure yok; `conditionId`
  (`turretActive` / `lowHealth` / `bothSlotsFilled`) kart uygulanırken
  `CardInventoryManager`'daki predicate tablosundan çözülür.

### Bölüm B — Ability sistemi

- 2 slot (Q/E). Boş slotta tuş sessizce hiçbir şey yapmaz.
- Ortak taban `Ability` (cooldown muhasebesi + aktivasyon sözleşmesi); her
  mekanik KENDİ dosyasında: `TurretAbility`, `ChainLightningAbility`,
  `FireZoneAbility`, `MultiShotAbility`.
- Ürettikleri varlıklar ayrı entity'ler: `Turret`, `FireZone`,
  `ChainLightningStrike`. Ability sınıfları sahneyi tanımaz; her şeyi
  `AbilityWorld` üzerinden `AbilityRuntime`'a verir — "aynı anda tek kule"
  gibi ability'ler ARASI kurallar bu yüzden tek yerde durur.
- **Kule**: hitscan ateş, canı var, düşmanlar hedefler ve temasla yıkar
  (`EnemyManager` kuleye daha yakın düşmanları ona yönlendirir,
  `CollisionResolver` temas hasarını uygular).
- **Zincir yıldırım**: zamanlı sıçrama (`hopIntervalMs`), hasar sıçradıkça
  AZALMAZ, sıçrama sayısı karta bağlı olarak artar.
- **Ateş alanı**: nişan yönüne serilir, tick başına hasar, sönerek kaybolur.
- **Çoklu mermi**: silah cooldown'unu atlayarak yelpaze mermi doğurur
  (`BulletManager.spawnBullet`); mermi başına hasar `damageScale` ile düşer.
- Ability cooldown'ları oyuncunun `fireRate` stat'ının tabana ORANIYLA
  ölçeklenir; `MIN_ABILITY_COOLDOWN_MS` (250 ms) alt sınırı var.
- **Ability'e özel parametreler** (`AbilityUpgrades`): sıçrama sayısı, kule
  hasarı, alan süresi, mermi sayısı. Dört temel stat'a zorlanmadı; koşu
  seviyesinde tutuluyor ki ability henüz alınmamışken de kart satın alınabilsin.
- 12 ability tanımı = 4 mekanik × 3 kademe (`ABILITY_CATALOG`).

### Bölüm C — Level-up ve dükkan mantığı

- `CardInventoryManager` — UI'DAN TAMAMEN BAĞIMSIZ: teklif çekme, edinme,
  satın alma, satma, slot atama ve kart etkilerini uygulama/geri alma.
- Aynı kartın ikinci kopyası ÜST ÜSTE BİNER: modifier kimliği alım başına
  benzersizdir (`keskinUc#2`), satışta yalnızca o kopya geri alınır.
- Sahip olunan ability kartı tekrar teklif edilmez; buff/takas tekrar çıkabilir.
- Level-up: 2 kart, ücretsiz, biri seçilir. Dükkan: 2 kart fiyatlı, 0/1/2
  alınabilir, envanterden kart satılabilir, panel elle kapatılır.
- Yeni alınan ability boş slot varsa OTOMATİK yerleşir; iki slot da doluysa
  envanterde bekler ve dükkandaki loadout panelinden atanır.

### Bölüm D — Kart UI component'leri

- `core/src/ui/cards/`: `CardTile` (ortak taban), `CardPicker` (soyut panel),
  `LevelUpPicker`, `ShopPicker` + `cards.css`.
- **Modal'a bağlı DEĞİL**: kendi panelini çizer; karartma isteyen çağıran onu
  kendi katmanına yerleştirir (oyun tarafında `vol-card-layer`).
- Kartlar metin-only; nadirlik farkı yalnızca renk/kenarlık/arka planla verilir.
- Kartın TAMAMI tek bir `<button>` — tıklama alanı belirsiz kalmaz, klavye ve
  ekran okuyucu doğal çalışır.
- Oyun tarafı: `CardScreens` (orkestrasyon + i18n çözümü), `AbilityLoadout`
  (sürükle-bırak + tıklama ile slot atama), `AbilityHud` (Q/E göstergesi).
- **vol-ui showcase**: yeni `KARTLAR` sekmesi — üç nadirlik yan yana, canlı
  LevelUpPicker ve gerçekten alım/satım yapılabilen ShopPicker demosu.
  README tablosu güncellendi.

### Yapılan varsayımlar

- **Kart metinleri i18n anahtarı olarak saklanır** (`titleKey`/`descriptionKey`);
  katalog çeviri taşımaz, `toCardTileData()` çözer. 31 kart × 2 metin, tr+en.
- **Ability kartı oranı %39** (12/31). Prompt "kabaca yarısı" diyordu; 4 mekanik
  × 3 kademe doğal bir sınır, buff/takas havuzunu daraltmak yerine bu oranda
  bırakıldı.
- **Kule hitscan vurur** (mermi değil). Mermili kule `BulletManager`'a düşman
  mermisi kavramı eklemeyi gerektirirdi; bu Aşama 3'ün Boss işine daha yakın.
- **`olumeYakin` kartına kalıcı bir bedel eklendi** (maks. can −%15). Test
  "takas kartı hem kazanç hem kayıp taşır" kuralını yakaladı: kart yalnızca
  koşullu kazanç veriyordu, yani takas değil saf buff'tı.
- **Sürükle-bırak yanına tıklama yolu kondu**: HTML5 drag dokunmatikte ve
  klavyede çalışmaz; kart seç → slota tıkla aynı sonucu verir.
- **Kart ekranları oyunu duraklatır** (`scene.pause()`), duraklatma MENÜSÜNÜ
  açmadan. ESC kart ekranı açıkken devre dışıdır.
- **Dükkan 20. dalgadan sonra da açılabilir** — `WaveManager` son dalganın
  bitiminde `onWaveEnd` yayar; ekran normal çalışır, zafer akışı Aşama 3'e ait.

### Aşama 3 için bırakılanlar

- `WaveManager.onEliteWave` (dalga 10) ve `onBossWave` (dalga 20) hâlâ yalnızca
  Diagnostics'e yazıyor — Elite/Boss implementasyonu Aşama 3.
- Koşu bitişi (`onRunComplete`) zafer ekranı yok.
- Dokunmatik cihazlarda ability tetikleme yok (Q/E yalnızca klavye);
  `TouchController`'a iki ability butonu eklenmeli.

### Kullanıcının `pnpm dev` ile ELLE test etmesi gerekenler

Bu ortamda tarayıcı yok; aşağıdakiler testlerle değil ancak gözle doğrulanır:

1. **Katmanlama** (`RENDER_DEPTH`): kule düşmanların üstünde/oyuncunun altında,
   ateş alanı zeminde, yıldırım kolları mermilerin üstünde okunuyor mu.
2. **Kart ekranları**: level-up ve dükkan panelleri ortalanıyor mu, kart metni
   taşıyor mu, dükkanda envanter listesi kaydırılabiliyor mu.
3. **Sürükle-bırak**: ability kartını Q/E kutusuna sürükleme hissi; tıklama
   yolunun da çalıştığı.
4. **Bar güncellemeleri**: maks. can artıran kart alındığında can barının
   tavanının ve dolumunun birlikte büyümesi.
5. **Ability efektleri**: kule kurulumu/yıkımı, zincir sıçraması, ateş alanı
   tick'leri ve çoklu atış yelpazesi yeterince belirgin mi.
6. **Cooldown göstergesi**: sol alttaki Q/E kutularının dolum çizgisi.

### Kalite kapıları

| Kapı                                      | Durum | Not                                                       |
| ----------------------------------------- | ----- | --------------------------------------------------------- |
| `pnpm -r typecheck`                       | geçti | 4 paket                                                   |
| `pnpm -r test`                            | geçti | 1045 test (core 702, vol-hell 313, tauri-v2 25, vol-ui 5) |
| `pnpm lint`                               | geçti | 0 hata, 0 uyarı                                           |
| `pnpm format:check`                       | geçti |                                                           |
| `pnpm lint:css`                           | geçti |                                                           |
| `pnpm --filter @volstudio/vol-hell build` | geçti |                                                           |
| `pnpm --filter @volstudio/vol-ui build`   | geçti |                                                           |

### Kural: yeni UI component'i → showcase'e de eklenmeli

`core/src/ui` altına eklenen HER yeni component `games/vol-ui` showcase'inde
canlı bir demoyla gösterilmeli ve `games/vol-ui/README.md` tablosuna
işlenmelidir. Aşama 2'de `cards/` klasörü ve `KARTLAR` sekmesi bu kuralla
eklendi; sonraki aşamalar da aynı şekilde ilerlemeli.

---

## Aşama 2 revizyonu — denge, akış, dükkan UI ve ability görselleri — 2026-08-14

Kullanıcının oyun içi ekran görüntüsü ve geri bildirimi üzerine yapılan tur.

### Seviye/dalga dengesi (Brotato ritmi)

Sorun: 2. dalgada oyuncu 6. seviyedeydi; eşik (12, ×1.35) bir dalgada 4-5 kart
veriyordu. Eşik ölçeği bir dalgada toplanan Spark'a göre yeniden kuruldu:
`baseThreshold` 12 → **30**, `thresholdGrowth` 1.35 → **1.28**.

- İlk dalga (~25 grunt = 75 Spark) tam **iki** seviye verir.
- Aynı öldürme sayısıyla ilerleyen dalgalar giderek daha az verir; bir noktada
  seviyesiz dalga gelir.
- `progressionBalance.test.ts` bunu SABİT SAYIYLA değil İLİŞKİYLE kilitler:
  eşikler yeniden ayarlansa da eğrinin şekli korunur.

### Level-up akışı dalga sonuna taşındı

Seviye atlaması artık dövüşün ortasında ekran açmıyor. `RunEconomy.onLevelUp`
→ `CardScreens.queueLevelUp()` ile **kuyruğa** alınıyor; dalga bitince
`openIntermission()` bekleyen hakları **sırayla** sunuyor, sonuncusundan sonra
dükkan geliyor. İki seviye atlanan bir dalgada oyuncu iki kart seçiyor.

HUD: Spark barının etiketinde "N kart bekliyor" görünür — oyuncu dalga sonunda
kendisini ne beklediğini bilir.

### Dükkan UI yeniden tasarlandı

Ekran görüntüsündeki sorunların hepsi karşılandı:

- **Kaza tıklaması kalktı.** Kart gövdesine tıklamak artık hiçbir şey yapmıyor;
  her eylem açık bir butonda: `SEÇ`, `SATIN AL`, `SAT +N`, `TAK`.
- **"Pasif ne bilmiyoruz" giderildi.** Envanter iki bölüme ayrıldı —
  **Yeteneklerin** (slota takılır) ve **Pasiflerin** — ve envanter kartlarında
  açıklama artık gizlenmiyor. Kartlarda ayrıca tip rozeti var (YETENEK/PASİF/TAKAS).
- **Slot atama çalışıyor.** Yetenek slotları dükkan panelinin İÇİNE alındı;
  kart slota sürüklenebiliyor, sürüklemeyi kullanamayan için kartın kendi
  **TAK** butonu aynı işi yapıyor. Slotu boşaltmak ayrı bir "×" butonunda —
  slota değerek yetenek sökülemiyor.
- Takılı yetenekte "TAKILI" rozeti; dükkan teklifi ekran AÇILIRKEN çekiliyor
  (seviye ekranında alınan yetenek vitrinde tekrar çıkmıyor).

### Ability'ler tek tek elden geçirildi

**Kule** — en zayıf haldeydi (tek daire, hitscan):

- Hedefe **dönen namlu**, atışta **geri tepme** (5 px, 110 ms'de sönümlenir).
- **Gerçek mermi** (`TurretShot`): hedefi takip eder, çarpınca hasar verir,
  hedefini kaybederse ömrü dolunca söner. Hitscan hasarı görünmüyordu.
- **Menzil halkası**: normalde soluk (%12), kurulum anında belirgin (%55).
- **Kurulum animasyonu**: gövde 1.6x'ten oturur, namlu açılır.
- Hasar alma (`turretHit`) ve yıkım (`turretDestroy`) efektleri.

**Zincir yıldırım** — düz ince çizgi ekranda kayboluyordu:

- Kol artık **zikzak** (5 segment, uçlara doğru sönen sapma) ve **iki katman**
  çiziliyor: kalın parıltı + ince çekirdek.
- Zikzak, gameplay PRNG'sini kaydırmamak için AYRI bir görsel PRNG'den besleniyor.

**Ateş alanı** — "çok basit ucuz bir şey"di:

- **Nabız** (dolgu saydamlığı + halka ölçeği), sürekli yükselen **kıvılcımlar**
  (hasar tick'inden bağımsız, 140 ms'de bir), yanan düşmanın üstünde ayrı
  `fireZoneBurn` efekti, ömrün sonunda sönümlenme.

**Çoklu atış**: salvo tek patlama gibi okunsun diye namlu parlaması
(`multiShotCast`) + hafif sarsıntı eklendi.

### Temel saldırı dengesi

Taban tempo kartların katkısını yutuyordu: `fireCooldownMs` 180 → **260**,
`damage` 25 → **22**, `minFireCooldownMs` 40 → **90**. Düşman canı hasarın tam
katı kalsın diye `enemyConfig.health` 50 → **44** (yine iki vuruş). Böylece
%40'lık legendary ateş hızı kartı gerçekten hissediliyor, üst üste binen
kartlar bile FPS'e bağlı mermi seli üretemiyor.

### Bug avı — bulunan ve düzeltilenler

- **Sızıntı (gerçek):** Kule yıkıldığında `AbilityRuntime` yalnızca referansı
  düşürüyordu; kulenin havadaki mermileri sahnede DONMUŞ Arc olarak kalıyordu.
  Hem yıkımda hem "yeni kule eskisini kaldırır" yolunda `destroy()` çağrılıyor.
  `abilityLifecycle.test.ts` sahnedeki şekilleri sayarak bunu kilitliyor.
- **Determinizm kayması:** Yıldırımın zikzak sapması koşu PRNG'sinden çekiliyor,
  yani bir GÖRSEL detay spawn/kart sırasını kaydırıyordu. Ability katmanı artık
  ayrı bir görsel PRNG kullanıyor (koşu PRNG'sinden bir kez tohumlanır).
- **Dükkan tekrarı:** Dükkan teklifi dalga sonunda, level-up seçimlerinden ÖNCE
  çekiliyordu; seviye ekranında alınan yetenek kartı vitrinde tekrar
  görünebiliyordu. Teklif artık dükkan açılırken çekiliyor.
- **Ölü kod:** `AbilityRuntime.isEquipped`, `ChainLightningStrike.hitCount`,
  `GameScene.abilityKeys` (yalnızca yazılıyordu), `AbilityLoadout`'un tıklama-seçim
  yolu (TAK butonu gelince gereksizleşti) — hepsi silindi.
- **Savunmacı guard:** Q/E tuşları duraklamada ve kart ekranı açıkken sessiz
  kalıyor (Phaser sahne duraklayınca input'u zaten kapatıyor; bağ açık dursun).

### Kalite kapıları

| Kapı                                      | Durum | Not                                                       |
| ----------------------------------------- | ----- | --------------------------------------------------------- |
| `pnpm -r typecheck`                       | geçti | 4 paket                                                   |
| `pnpm -r test`                            | geçti | 1076 test (core 708, vol-hell 338, tauri-v2 25, vol-ui 5) |
| `pnpm lint`                               | geçti | 0 hata, 0 uyarı                                           |
| `pnpm format:check`                       | geçti |                                                           |
| `pnpm lint:css`                           | geçti |                                                           |
| `pnpm --filter @volstudio/vol-hell build` | geçti |                                                           |
| `pnpm --filter @volstudio/vol-ui build`   | geçti |                                                           |

### Hâlâ elle doğrulanması gerekenler (`pnpm dev`)

1. Kule: namlunun düşmana dönüşü, geri tepme hissi, menzil halkasının
   rahatsız etmeden okunması, mermilerin görünürlüğü.
2. Ateş alanının nabzı ve kıvılcım yoğunluğu — fazla mı, az mı?
3. Zincirin zikzak kalınlığı ve parıltısı.
4. Dükkanda sürükle-bırak hissi (TAK butonu yedek yol olarak var).
5. Yeni ateş temposunun oyun hissi: taban artık belirgin şekilde yavaş.

---

## AŞAMA 3/3 — Elite/Boss, telegraph, görsel cila ve bitiş ekranı

### B1 — Zorunlu engel dalgaları

- `WaveManager` artık dalga 10 (Elite) ve 20 (Boss) için saf zamanla
  ilerlemiyor. Süre dolduğunda engel hâlâ hayattaysa dalga `isAwaitingBlocker`
  durumunda bekler; engel öldüğünde `notifyBlockerDefeated()` ile o an biter.
- Engel dalgalarında `onWaveClear` çağrılmaz; normal dalgalarda `clearArena`
  (`RunDirector`) kalan düşmanlar, mermiler, yerdeki Flux ve bekleyen
  telegraph'ları temizler.
- `EnemyManager.clearRegularEnemies()` dışarıdan sürülen Elite/Boss'u
  korur; yalnızca normal düşmanları `waveClear` efektiyle kaldırır.
- `WaveManager.test.ts` ve `RunDirector.test.ts` ile engel mantığı
  kilitlendi: erken öldürme ve süre dolduktan sonra öldürme senaryoları.

### B1b — Arena temizliği

- `RunDirector.clearArena()` `WaveManager.onWaveClear` üzerinden çağrılır.
- `BulletManager.clearAll()`, `FluxPickupManager.clearAll()`,
  `TelegraphManager.cancelAll()` sırayla çalışır; normal dalga geçişi
  temiz bir sahne ile başlar.
- `tests/runtime/systems/RunDirector.test.ts` normal dalga sonunda mermi
  ve telegraph temizliğini doğrular.

### B2 — Elite/Boss AI

- `SpecialEnemyDirector` Elite ve Boss'un yaşam döngüsünü tek elden yönetir;
  `WaveManager.onEliteWave` / `onBossWave` ile doğurur, ölüm sinyalini
  `onBlockerDefeated` ile verir.
- `EliteController` (`warden`): rusher + swarmer kompozisyonu; atılım
  öncesi çizgi telegraph, periyodik minion doğurma telegraph'lı.
- `BossController` (`sovereign`): üç telegraph'lı saldırı paterni
  (slam/volley/summon); döngüsel sıra, öfke fazında daha sık saldırı.
- `bossScaling.ts` Boss'un stat'larını spawn anında oyuncu gücüne göre
  ölçekler ve sabit bir `StatBlock` üretir; sonradan alınan kartlar boss'u
  güçlendirmez.
- `bossScaling.test.ts` ölçekleme ilişkilerini ve dondurulmuş stat
  davranışını kilitler.

### Telegraph sistemi

- `TelegraphManager` Elite/Boss saldırıları ve Elite minion doğurma için
  ortak telegraph katmanı; süre dolunca Promise resolve olur, saldırı o an
  uygulanır.
- Sahne durakladığında telegraph da donar (delta tabanlı güncelleme).
- `TelegraphManager.test.ts` resolve, iptal, çoklu eşzamanlı telegraph ve
  `destroy` davranışlarını doğrular.

### B3 — Ölüm/zafer ekranı

- `DeathScreen` tek ekranda hem yenilgi hem zafer gösterir; `runStats`
  (süre, dalga, öldürülen, toplanan Flux/Spark, neden) ile doldurulur.
- `GameScene.finishRun()` koşu sonu akışını tek yerden yönetir.

### Görsel/HUD katmanı

- `GameHud` ve `WaveBanner` Elite/Boss dalgalarında "Warden'i yen" /
  "Sovereign'i yen" göstergeleri sunar.
- `effects.ts` Elite/Boss efektleri (`eliteSpawn`, `bossSpawn`, `bossSlam`,
  `bossSummon`, `bossVolley`, `bossDefeat`) eklendi.
- i18n: `tr.json` ve `en.json` engel adları, "wave blocked", ölüm/zafer
  ekranı metinleriyle güncellendi.

### Kalite kapıları

| Kapı                                      | Durum | Not                                                       |
| ----------------------------------------- | ----- | --------------------------------------------------------- |
| `pnpm -r typecheck`                       | geçti | 4 paket                                                   |
| `pnpm test`                               | geçti | 1100 test (core 708, vol-hell 362, tauri-v2 25, vol-ui 5) |
| `pnpm lint`                               | geçti | 0 hata, 0 uyarı                                           |
| `pnpm format:check`                       | geçti |                                                           |
| `pnpm lint:css`                           | geçti |                                                           |
| `pnpm --filter @volstudio/vol-hell build` | geçti |                                                           |
| `pnpm --filter @volstudio/vol-ui build`   | geçti |                                                           |
| `cargo check/fmt/clippy`                  | geçti |                                                           |

### Hâlâ elle doğrulanması gerekenler (`pnpm dev`)

1. Elite atılım telegraph'ının okunabilirliği ve kaçış penceresi.
2. Boss üç paterni (slam çemberi, volley koridorları, summon konisi).
3. Öfke fazında tempo artışı hissediliyor mu.
4. Engel öldükten sonra dalga geçişi ve dükkan açılışı.
5. Ölüm/zafer ekranında istatistiklerin doğru görünmesi.

---

## Aşama 3 sonrası — repo çapında defansif bug avı

2026-08-15. Kodda değişiklik yapılmadan yalnızca tarama ve raporlama.

### Yöntem

- 4 paralel subagent (core math/systems, game runtime, UI/input, audio/storage/config).
- Statik desen taraması: `setTimeout`/`setInterval`/`requestAnimationFrame`, `addEventListener`/`removeEventListener`, `Math.random()`, `as unknown as`, `!` non-null assertion, `NaN`/Infinity, `void` ile bırakılan promise'ler.
- Manuel doğrulama ve çakışan/yanlış pozitif filtreleme.

### Kalite kapıları (değişiklik yok)

| Kapı                | Durum | Not                                     |
| ------------------- | ----- | --------------------------------------- |
| `pnpm -r typecheck` | geçti | 4 paket                                 |
| `pnpm -r test`      | geçti | 1100 test (core 708, vol-hell 362, ...) |
| `pnpm lint`         | geçti | 0 hata, 0 uyarı                         |
| `pnpm format:check` | geçti |                                         |

### Onaylanmış/gerçek bulgular (düzeltilmesi bekleniyor)

| #   | Şiddet | Alan           | Dosya                                                                                           | Kısa açıklama                                                                                                                                |
| --- | ------ | -------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Kritik | core/stats     | `core/src/stats/StatBlock.ts`                                                                   | Koşul closure'ı başka `StatBlock.getValue()` çağırırsa sonsuz özyineleme potansiyeli.                                                        |
| 2   | Kritik | game/telegraph | `games/vol-hell/src/runtime/systems/TelegraphManager.ts` + `BossController.ts`                  | `cancelAll()` pending promise'leri çözmüyor; boss saldırısı asılı kalabiliyor ve sahnede ölü boss'un telegraph'ı çizilmeye devam edebiliyor. |
| 3   | Yüksek | game/run       | `games/vol-hell/src/runtime/scene/GameScene.ts`                                                 | `finishRun()` ateş ve unut (`void`) çağrılıyor; guard'lar var ama `async` akış izleme zayıf.                                                 |
| 4   | Yüksek | UI/DOM         | `core/src/ui/cards/CardTile.ts`, `core/src/ui/primitives/RangeSlider.ts`                        | `dragstart`/`dragend` ve `keydown` listener'ları `destroy()`'da kaldırılmıyor.                                                               |
| 5   | Yüksek | storage        | `core/src/systems/SaveManager.ts`, `tauri-v2/src/storage/GameStateDb.ts`                        | `JSON.parse` hatası ve `QuotaExceededError` sessizce geçiliyor; `GameStateDb.clear()` onaysız silme.                                         |
| 6   | Yüksek | core/math      | `core/src/math/Vector2.ts`, `core/src/math/physics.ts`, `core/src/systems/ViewportManager.ts`   | `NaN`/`Infinity` ve negatif/yanlış argümanlar sessizce sıfırlanabiliyor.                                                                     |
| 7   | Orta   | game/wave      | `games/vol-hell/src/runtime/systems/WaveManager.ts`                                             | `while` döngüsünde maksimum adım sınırı yok (uzun frame/config hatası riski).                                                                |
| 8   | Orta   | game/entity    | `games/vol-hell/src/runtime/entity/Enemy.ts`, `games/vol-hell/src/runtime/entity/FluxPickup.ts` | Çok küçük mesafelerde `dx/d`, `dy/d` ve magnet kuvveti kararsızlaşabilir.                                                                    |
| 9   | Orta   | game/spatial   | `games/vol-hell/src/runtime/systems/SpatialGrid.ts`                                             | `queryNearby()` reusable buffer; iç içe çağrı riski.                                                                                         |
| 10  | Orta   | core/audio     | `core/src/audio/music/engine.ts`                                                                | `loopEnd` `buffer.duration`dan büyükse sessizce kısılıyor.                                                                                   |
| 11  | Düşük  | core/UI        | `core/src/ui/feedback/FloatingText.ts`                                                          | `Math.random()` jitter için kullanıyor; deterministik alternatif eklenebilir.                                                                |

### Yanlış pozitif / tasarım kararı / zaten korunuyor

- Constructor içi `i18next.t()` çağrıları (mevcut boot order'da güvenli; modül-seviyesi değil).
- `GameAudio` dispose: singleton olarak kullanılıyor, `dispose()` mevcut ama sahne başına çağrılmıyor.
- `GameScene` `stopAllSfx`: `GameAudioDirector.stopAll()` zaten `onSceneShutdown()`'da çağrılıyor.
- `AbilityRuntime.replaceTurret()` çift `destroy()`: `destroyWithEffect()` + `destroy()` güvenli (`teardown()` `alive` guard'lı).
- `SfxBank` / `MainMenuScene` / `LoadingTransition` `Math.random()` kullanımları oynanış dışı (SFX varyantı, menü müziği, loading animasyonu).
- `CARD_CATALOG` price sistemi tek kaynak (`CARD_PRICES`); çift sistem yok.

### Sonraki adım

Kritik/yüksek bulgular için onay alındıktan sonra tek tek düzeltilecek; her düzeltme önce testle kırılıp sonra yeşillenecek.

---

## 2026-08-15 — Kritik/yüksek/orta/düşük bulgular düzeltildi

Tüm bulgular defansif hale getirildi, her biri için regresyon testi eklendi.

| #   | Durum   | Açıklama                                                                                                                                                                                       |
| --- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | çözüldü | `StatBlock.getValue()` çağrı yığını ile döngüsel koşul özyinelemesini kırıyor.                                                                                                                 |
| 2   | çözüldü | `TelegraphManager.play()` artık `TelegraphHandle` + `promise` dönüyor; `cancelAll()` promise'leri çözüyor. Boss/Elite `destroy()` bekleyen telegraph'ları iptal ediyor.                        |
| 3   | çözüldü | `GameScene.finishRun()` sahne aktiflik kontrolü, guard ve `try/finally` ile sağlamlaştırıldı; `onPlayerDeath`/`onRunComplete` senkron wrapper oldu.                                            |
| 4   | çözüldü | `CardTile` ve `RangeSlider` `destroy()`'da tüm listener'ları kaldırıyor.                                                                                                                       |
| 5   | çözüldü | `LocalStorageAdapter` bozuk JSON'i logluyor; `QuotaExceededError` artık `StorageError` fırlatıyor. `GameStateDb.clear({ confirm: true })` zorunlu hale geldi.                                  |
| 6   | çözüldü | `Vector2.normalize()` NaN/Infinity'de (0,0) dönüyor. `toStepVelocity()` geçersiz/negatif deltaMs'de 0 dönüyor. `ViewportManager.resolveDpr()` pozitif-sonlu DPR ve maxDpr kelepçesi uyguluyor. |
| 7   | çözüldü | `WaveManager.update()` maksimum dalga adımı sınırı ve modüler geri sarma ile sonsuz döngüden korunuyor.                                                                                        |
| 8   | çözüldü | `Enemy.applySeparation()` ve `FluxPickup.applyMagnet()` NaN/Infinity mesafe ve adım değerlerine karşı korumalı.                                                                                |
| 9   | çözüldü | `SpatialGrid.queryNearby()` halka tampon (4'lü) ile iç içe çağrılarda sonuç ezilmiyor.                                                                                                         |
| 10  | çözüldü | `MusicEngine.startStem()` `loopStart`/`loopEnd` sonsuz, negatif veya `loopStart >= loopEnd` durumlarına karşı pozitif-sonlu aralığa çekiliyor.                                                 |
| 11  | çözüldü | `FloatingTextManager` opsiyonel deterministik `Random` desteğiyle jitter üretebiliyor.                                                                                                         |

### Kalite kapıları (değişiklik sonrası)

| Kapı                | Durum | Not                                             |
| ------------------- | ----- | ----------------------------------------------- |
| `pnpm -r typecheck` | geçti | 4 paket                                         |
| `pnpm -r test`      | geçti | 1114 test (core 723, vol-hell 365, tauri-v2 26) |
| `pnpm lint`         | geçti | 0 hata, 0 uyarı                                 |
| `pnpm format:check` | geçti |                                                 |
| `pnpm lint:css`     | geçti |                                                 |
| `pnpm build:game`   | geçti | `games/vol-hell` prod build                     |

---

## CORE capability yol haritası — taslak doğrulama ve Faz 0 — 2026-08-15

`core/docs/targed-core.txt` (düşük maliyetli bir modelin ürettiği, koda hiç
bakmadan yazılmış bir CORE-mimarisi taslağı) doğrulandı: her iddia gerçek
koda karşı kontrol edildi, yanlış/aşırı genellenmiş kısımlar (madde 33'ün
saf substring tabanlı governance kuralı `waveforms.ts` gibi meşru DSP
dosyalarını kırardı; `Diagnostics`/`vol-ui` gibi zaten var olan altyapı
sıfırdan öneriliyordu; taslağın kendi "en az iki tüketici" kuralı kendi
önerilerine uygulanmamıştı) düzeltildi. Taslak silindi (git'te hiç takip
edilmiyordu), yerine iki doğrulanmış/önceliklendirilmiş belge yazıldı:
`core/docs/core-capability-roadmap.md` ve `core/docs/adaptive-ui-components.md`.

Ardından roadmap'in "Faz 0 — düşük risk, hemen yapılabilir" bölümü uygulandı.

### Yapılanlar

- **`StatBlock<TStat extends string = StatKey>` jenerikleştirildi**
  (`core/src/stats/StatBlock.ts`). Mekanizma zaten domain-nötrdü; sızıntı
  yalnızca `StatKey` literal union'ındaydı. Varsayılan type parametresi
  sayesinde mevcut `new StatBlock(baseStats)` çağrıları (VOL.HELL'de 10+
  dosya) HİÇ değişmeden derlenmeye devam ediyor — additive bir değişiklik,
  breaking refactor değil. `computationStack` artık `unknown`/`string` ile
  tipli (birden fazla `TStat` örneğini aynı özyineleme-koruma yığınında
  güvenle karşılaştırabilmek için); `snapshot()` artık dört stat'ı elle
  saymak yerine `Object.keys(base)` ile jenerik iterasyon yapıyor.
- **`createRandom` `core/src/random/random.ts`'e taşındı.** `audio/synth/random.ts`
  artık yalnızca ses motoru içi göreli importları (`./random`) kırmamak için
  bırakılan bir re-export shim'i. `core/src/index.ts` yeni konumdan import
  ediyor.
- **Governance testi eklendi** (`core/tests/governance/publicApi.test.ts`):
  (1) `core/src/index.ts`'in export ettiği İSİMLERİN (dosya içerikleri değil)
  VOL.HELL terminolojisi (`enemy`/`boss`/`flux`/`spark`/`volhell`) taşımadığını
  doğruluyor — `wave`/`card` bilinçli olarak dışarıda çünkü `WaveCounter`/
  `CardTile` gibi meşru, domain-nötr export'larla çakışıyorlar; (2) `core/src`
  ağacının hiçbir dosyasının `games/*` veya `@volstudio/vol-*` import
  etmediğini statik olarak tarıyor.

### Ertelenenler (roadmap'te bilinçli olarak, madde 37 kuralına göre)

`Disposable`/`Scope`, `Scheduler`, `StateMachine`, geometry/collision
primitifleri, `ObjectPool<T>` — hiçbiri bu turda yapılmadı; hepsi ya ikinci
bir somut kullanım bekliyor ya da mevcut lifecycle bulgularından (Y6/Y7/O1)
geriye türetilecek ayrı bir faz.

### Kalite kapıları

| Kapı                | Durum | Not                                                       |
| ------------------- | ----- | --------------------------------------------------------- |
| `pnpm -r typecheck` | geçti | 4 paket                                                   |
| `pnpm -r test`      | geçti | 1121 test (core 725, vol-hell 365, tauri-v2 26, vol-ui 5) |
| `pnpm lint`         | geçti | 0 hata, 0 uyarı                                           |
| `pnpm format:check` | geçti |                                                           |
| `pnpm lint:css`     | geçti |                                                           |
| `pnpm build:game`   | geçti | `games/vol-hell` prod build                               |
| `cargo check`       | geçti | Rust'a dokunulmadı, yine de doğrulandı                    |

---

## CORE capability yol haritası — Faz 1 (DisposableScope) ve adaptive UI hit-target — 2026-08-15

Roadmap'in Faz 1'i uygulandı: `core/src/lifecycle/DisposableScope.ts` —
`Disposable` arayüzü + `add()`/`addListener()`/ters-sırada-ve-hataya-dayanıklı
`dispose()`. İlk gerçek tüketiciler: `Joystick`, `SquareJoystick` (sürükleme
oturumu başına yeni `dragScope`, `destroy()`'da tek çağrı) ve `Modal`
(açık-oturum scope'u — yığın üyeliği + `document` keydown dinleyicisi tek
`dispose()` ile kapanıyor). Bu sırada iki mevcut testin ("hiç sürüklenmemiş
joystick'in destroy()'u yine de 3 kez removeEventListener çağırır") eskiden
geçerli ama anlamsız bir implementasyon detayını kilitlediği görüldü —
"sürükleme ortasında destroy()" senaryosuna düzeltildi. `addListener`'ın
`options` verilmediğinde add/removeEventListener'ı üç değil iki argümanla
çağırması gerektiği ayrıca bir spy testinde ortaya çıktı, düzeltildi.

Ardından `adaptive-ui-components.md`'nin Button hit-area kısmı uygulandı:
`--vol-hit-target-min` token'ı (yalnızca `@media (pointer: coarse)` içinde
44px — `--vol-ui-` prefiksi YASAK, o yalnızca `colors.ts` üretimi renkler
için, `colorSync.test.ts` zorluyor). İlk tasarım (`::before` overlay +
`max(100%, token)`) terk edildi: matematiksel hatası vardı (CSS `inset`'te
`%` kendi kutusuna değil containing block'a göre çözülür) VE sıkı gruplu
component'lerde (button-group 16px gap, tab-list 4px gap) görünmez overlay
komşularla çakışabilirdi. Yerine `min-height`/`min-width: var(--vol-hit-target-min, auto)`
kondu — gerçek kutu büyür, flex/gap içindeki komşular otomatik aralanır.
Uygulandığı yerler: `Button`, `Checkbox`, `Tabs`. Bilinçli atlanan:
`RangeSlider` (iki handle birbirine yaklaştırılabiliyor, büyütme dokunmatikte
ayırt etmeyi zorlaştırabilir), `CardTile` (zaten `min-height:150px`).

vol-ui'ye denendi/geri alındı: roadmap'in Faz 3'ü ("validation ortamının
genişletilmesi") gereği StatBlock/createRandom/DisposableScope'u gösteren bir
"CORE" sekmesi eklendi, sonra kullanıcıyla birlikte KALDIRILDI — vol-ui'nin
kendi kimliği "DOM UI kütüphanesinin showcase'i", bu üç capability zaten
unit testlerle ve gerçek tüketicilerle (StatBlock→vol-hell,
DisposableScope→Modal/Joystick) kanıtlanmış, bir demo sekmesi ölçülebilir bir
doğrulama katmanı eklemiyordu. Tamamen temizlendi.

### Ertelenenler (bilinçli, madde 37 kuralına göre)

Faz 2 (Scheduler/StateMachine), geometry/collision, `ObjectPool<T>`,
resource lifecycle — ikinci somut tüketici çıkmadan yapılmayacak.

### Kalite kapıları

| Kapı                | Durum | Not                                                       |
| ------------------- | ----- | --------------------------------------------------------- |
| `pnpm -r typecheck` | geçti | 4 paket                                                   |
| `pnpm -r test`      | geçti | 1141 test (core 741, vol-hell 365, tauri-v2 26, vol-ui 5) |
| `pnpm lint`         | geçti | 0 hata, 0 uyarı                                           |
| `pnpm format:check` | geçti |                                                           |
| `pnpm lint:css`     | geçti |                                                           |
| `pnpm build:game`   | geçti |                                                           |
| `cargo check`       | geçti |                                                           |

---

## vol-ui KARTLAR sekmesi düzeni ve ShopPicker reroll/kilit — 2026-08-15

Kullanıcının `pnpm dev` ile canlı testinden gelen geri bildirim üzerine.

### Düzen

CardTile demo kartı tam genişliğe çıkarıldı (içindeki örnek kartlar artık
yan yana sığıyor, dikey istiflenmiyor); LevelUpPicker/ShopPicker altta
yüzde-elli bölünmüş ayrı bir satırda yan yana durur
(`vol-showcase-cards-bottom-row`, `align-items: flex-start` — ShopPicker
LevelUpPicker'dan çok daha uzun içerik taşıdığı için `stretch` olsaydı kısa
kart ortasında büyük boşluk bırakırdı).

### CORE: `ShopPicker`'a reroll + kilit (opsiyonel, geriye uyumlu)

`ShopPickerOptions.reroll?: { label, onReroll }` ve
`ShopPickerOptions.lock?: { lockLabel, unlockLabel, onToggle }` eklendi —
ikisi de verilmezse hiçbir yeni buton render edilmez, mevcut tüketiciler
(vol-hell) değişiklik yapmadan çalışmaya devam eder. Mimari ilke korundu:
`ShopPicker` bir kart havuzu/RNG bilmez — hangi kartların reroll'da
korunacağı tamamen çağıranın sorumluluğu (`onBuy`/`onSell` ile aynı desen).
`games/vol-hell`'in kendi `CardInventoryManager`'ı bu özelliği henüz
kullanmıyor; vol-ui'nin showcase demosunda gerçek mantıkla (7→14 kartlık
havuz, artan maliyetli reroll, kilitliler korunur) sergileniyor.

### Kalite kapıları

| Kapı                | Durum | Not                                                       |
| ------------------- | ----- | --------------------------------------------------------- |
| `pnpm -r typecheck` | geçti | 4 paket                                                   |
| `pnpm -r test`      | geçti | 1157 test (core 749, vol-hell 365, tauri-v2 26, vol-ui 5) |
| `pnpm lint`         | geçti | 0 hata, 0 uyarı                                           |
| `pnpm format:check` | geçti |                                                           |
| `pnpm lint:css`     | geçti |                                                           |

---

## Repo çapında bug avı — zoom/z-index/kart animasyonları — 2026-08-15

Kullanıcının "bug avına çık" talimatıyla, canlı testte gözlemlenen üç ayrı
bulgu derinlemesine araştırılıp kök nedenlerinden düzeltildi.

### K1 — Tarayıcı yakınlaştırmasında büyüyüp küçülen gri kutu

**Kök neden:** `ViewportManager.attachResize()`'ın resize handler'ı
`game.scale.resize(w, h)` çağırıyordu ama `game.scale.zoom`'u HİÇ
güncellemiyordu. Phaser'ın `resize()`'ı canvas'ın CSS boyutunu
`bufferSize × zoom` olarak hesaplıyor; `zoom` Game kurulduğu andaki DPR'de
sonsuza dek sabit kalıyordu. Tarayıcı yakınlaştırması `devicePixelRatio`'yu
değiştirir (ve `resize` event'i tetikler) — `zoom` güncellenmediği için
canvas'ın CSS boyutu pencereyle uyuşmaz hale geliyor, ekranda pencereyi takip
etmeyen, yakınlaştırma oranıyla büyüyüp küçülen bir kutu olarak görünüyordu.
**Düzeltme:** `game.scale.setZoom(1 / dpr)` artık `resize()`'dan önce, TAZE
dpr ile çağrılıyor. Mevcut K2 regresyon testi (`config.zoom` ile inşa-anı
zoom'unu kullanıyordu) düzeltildi + yeni bir "tarayıcı yakınlaştırması" testi
eklendi (DPR değişimi sonrası `setZoom`'un taze değerle çağrıldığını
kilitliyor).

### K2 — Dialog'lar tutarsız katmanlanıyor

**Kök neden:** Hiçbir koordineli z-index ölçeği yoktu — her floating/overlay
component kendi sabit sayısını seçmişti: `Modal:30` ama `RadialMenu:50` (bir
Modal'dan bile YÜKSEK), `Tooltip`/`CommandPalette`/`Popup` üçü de `40`'ta
çakışıyordu, kendi eklediğim `.vol-showcase-card-layer` ise `100` (neredeyse
her şeyin üstünde) idi. **Düzeltme:** `theme.css`'e tek doğruluk kaynağı bir
ölçek eklendi (`--vol-z-root/float/toast/dialog/dialog-content/loading/debug`,
gerekçesi dosya içi yorumda) ve tüm sayfa-seviyesi component'ler (`Modal`,
`CommandPalette`, `Tooltip`, `Popup`, `RichTooltip`, `RadialMenu`,
`LoadingScreen`, `Diagnostics`, vol-hell'in `.vol-card-layer`'ı, vol-ui'nin
`.vol-showcase-card-layer`'ı) buna bağlandı. 11 yeni regresyon testi
(`core/tests/ui/zIndexScale.test.ts`) hem ölçeğin artan sırada olduğunu hem
her component'in hardcoded sayı yerine token kullandığını kilitliyor.

### K3 — ShopPicker: reroll'da 3 kart gelme, envanter büyüdükçe "görüntü bozulması", zayıf satın alma hissi

**Kök neden (çoklu):**

1. Demo kart havuzu (7) `SHOP_SIZE`'a (4) göre çok küçüktü — birkaç satın
   alma + kilitleme sonrası reroll'un çekebileceği havuz 4'ün altına
   düşüyordu, ekranda 4 yerine 3 (veya daha az) teklif görünüyordu.
2. `ShopPicker.render()` HER çağrıda (satın alma, satış, kilit değişimi,
   reroll — hangisi olursa olsun) TÜM teklif ve envanter kartlarını
   `destroy()` edip yeniden kuruyordu. CSS giriş animasyonu yeni DOM
   düğümünde tetiklenir — ilgisiz bir kilitleme tıklaması bile tüm envanteri
   yeniden animasyonla titretiyordu, envanter büyüdükçe daha görünür/rahatsız
   edici hale geliyordu. Aynı zamanda satın alma "birden oluyor" hissi
   veriyordu çünkü hiçbir geçiş/vurgu yoktu.

**Düzeltme:**

- Demo havuzu 14 karta çıkarıldı (`games/vol-ui/src/sections/cardsTab.ts`).
- `ShopPicker.render()` DIFF tabanlı hale getirildi: yalnızca gerçekten YENİ
  kartlar oluşturuluyor, yalnızca listede artık OLMAYAN kartlar (çıkış
  animasyonuyla, `LEAVE_ANIMATION_MS=240ms`) kaldırılıyor, VAR OLAN kartlar
  `CardTile.setDisabled()` ile YERİNDE güncelleniyor (yapısal değişiklik —
  kilit durumu — hâlâ yeniden kurulmayı gerektiriyor, `CardTile` var olan bir
  butonu sonradan ekleyip çıkaramadığı için).
- Bir teklif İLK KEZ satın alındığında kısa bir "başarı" vurgusu
  (`vol-card--just-purchased`, `prefers-reduced-motion`'da devre dışı,
  `animationend` VE zamanlayıcı ile temizleniyor — reduced-motion'da
  `animationend` hiç ateşlenmeyeceği için).
- `CardPicker.hide()` artık `HIDE_ANIMATION_MS` (240ms) kadar erteleyip
  `--leaving` class'ıyla yumuşak çıkış yapıyor (`isVisible()` senkron kalır,
  yalnızca DOM `hidden` niteliği gecikmeli); `show()` bekleyen bir hide'ı
  iptal ediyor. `hideImmediately()` eklendi — `games/vol-hell`'in
  `CardScreens.ts`'i AYNI paylaşılan `.vol-card-layer` içinde level-up↔dükkan
  arası anlık takas yaptığı üç yerde (`advanceIntermission`, `openShop`,
  `closeIntermission`) bunu kullanıyor: animasyonlu `hide()` orada iki panelin
  flex konteynerde bir an üst üste binmesine yol açıyordu (gerçek bir
  regresyon — `cardScreens.test.ts` bunu yakaladı, düzeltildi).
- `ShopPicker.slotArea` (çağıranın kendi içeriğini koyabileceği, önceden hiç
  kullanılmayan alan) artık vol-ui demosunda da dolduruluyor — 2 yetenek
  slotu, gerçek oyundaki gibi yeni alınan yetenek otomatik boş slota yerleşir.
- Reroll'da tüm ızgaraya kısa bir vurgu (`vol-showcase-shop-grid--rerolled`,
  yalnızca vol-ui'de) — "teklif yenilendi" hissi.

### Diğer

- Phaser `node_modules` kontrolü: pnpm'in content-addressable yapısı gereği
  `.pnpm/phaser@4.2.1/` altında saklanıp her pakete symlink'leniyor — kök
  `node_modules/`de doğrudan görünmemesi normal, bug değil.
- Git sağlığı doğrulandı: `git fsck --full` temiz, remote/branch tracking
  doğru, gizli bilgi sızıntısı yok.

### Kalite kapıları

| Kapı                                      | Durum | Not                                                       |
| ----------------------------------------- | ----- | --------------------------------------------------------- |
| `pnpm -r typecheck`                       | geçti | 4 paket                                                   |
| `pnpm -r test`                            | geçti | 1171 test (core 775, vol-hell 365, tauri-v2 26, vol-ui 5) |
| `pnpm lint`                               | geçti | 0 hata, 0 uyarı                                           |
| `pnpm format:check`                       | geçti |                                                           |
| `pnpm lint:css`                           | geçti |                                                           |
| `pnpm --filter @volstudio/vol-hell build` | geçti |                                                           |
| `pnpm --filter @volstudio/vol-ui build`   | geçti |                                                           |
| `cargo check/fmt/clippy`                  | geçti |                                                           |

### Hâlâ elle doğrulanması gerekenler (`pnpm dev`)

1. Tarayıcı yakınlaştırması (Ctrl+scroll) sonrası canvas'ın pencereyle
   eşleştiği — otomasyonda gerçek `Phaser.Game`/tarayıcı DPR'si yok, düzeltme
   yalnızca birim testle (sahte Game + sahte DPR) doğrulandı.
2. Modal/Tooltip/CommandPalette/RadialMenu aynı anda tetiklendiğinde yeni
   katmanlamanın görsel olarak beklenen sırada olduğu.
3. Dükkanda reroll/kilit/çoklu satın alma akışının hissi — animasyonların
   göze rahatsız gelip gelmediği, `prefers-reduced-motion` açıkken hiçbir
   şeyin takılı kalmadığı.

---

## Kart animasyon sağlamlaştırma — 2026-08-18

Devam eden oturumda "reroll'da animasyon yok / kartlar sert değişiyor" ve
"envanterde kart yığılması" geri bildirimleri kök nedenlerine inilerek
cözüldü; tüm kalite kapıları yeniden koşuldu.

### Yapılanlar

- **Envanter yığılması giderildi.** `.vol-card-shop__list`'e
  `align-content: start` ve `grid-auto-rows: min-content` eklendi. Kart sayısı
  arttıkça satırlar boşluğa yayılıyor, eğer pencere sınırlı ise en dış panel
  (`vol-card-picker`) kendi `overflow-y: auto`'sıyla kaydırıyor — kartlar
  birbirinin üstüne binmiyor.
- **Reroll giriş animasyonu profesyonelleştirildi.**
  - Eski `vol-card-in` yalnızca `translateY(8px)` ve opaklık 0 → 1'di; yeni
    girişte kart aşağıdan `translateY(16px)` + `scale(0.78)` + `opacity: 0`
    halden beliriyor, 360 ms'de büyüyüp yerine oturuyor.
  - **Dükkan reroll'larında stagger kaldırıldı.** Açık kartlar artık aynı
    anda belirir; böylece kartlar birbirinden bağımsız "pat pat" patlamak
    yerine tek bir deste hareketi gibi davranır.
  - **Level-up'ta stagger korundu.** `.vol-card-picker:not(.vol-card-picker--shop)`
    altında 2./3./4. kart gecikmeleri (60/120/180 ms) sürer.
  - `CardTile.CARD_ENTER_ANIMATION_MS` en uzun stagger'ı da kapsayacak şekilde
    540 ms yapıldı; `cssConstantSync.test.ts` CSS'deki gerçek `animation`
    süresini okuyup JS sabitiyle karşılaştırıyor.
  - `prefers-reduced-motion` medya sorgusu shop / level-up ayrımına göre
    güncellendi.
- **Reroll'da ızgara vurgusu eklendi.** Açık panelde teklif seti değişirse
  `vol-card-picker--rerolling` class'ı 240 ms'lik bir 'kapanıp açılma'
  animasyonu tetikliyor. Böylece tek kart girişi gözden kaçsa bile reroll
  hissiyatı kaçınılmaz oluyor.
- **Reroll'da kilitli olmayan kartlar her zaman yeni düğüm olarak kuruluyor.**
  `ShopPicker` artık aynı id'nin tekrar gelmesi durumunda bile kilitli
  olmayan teklifleri yeniden oluşturup `vol-card--entering` atıyor; kilitli
  kartlar yerinde kalıyor.
- **LevelUp/Shop panel açılış ve kapanış animasyonları yumuşatıldı.**
  - `vol-card-picker-in/out` `translateY(24px) scale(0.92)`'den
    `translateY(12px) scale(0.97)` / `translateY(-8px) scale(0.98)`'e
    çekildi; aşırı büyüme ve parlama hissi azaltıldı, daha profesyonel
    bir "fade + settle" karakteri kazandı.
  - Reroll ızgara vurgusu (`vol-card-grid-reroll`) opaklık oynamasından
    arındırıldı; yalnızca hafif `translateY(2px) scale(0.985)` ile
    "yere oturma" hissi veriyor.
  - Kart giriş (`vol-card-in`) ve çıkış (`vol-card-out`) animasyonları
    `scale(0.78)`/`scale(0.97)` gibi keskin değerlerden
    `scale(0.96)`/`scale(0.98)`'e indirildi; parlak patlama etkisi
    kalktı.
  - `vol-ui` showcase'inde panel `show()` / `present()` çağrıları katman
    görünür olduktan sonra yapılıyor; aksi halde animasyon gizli ağaçta
    koşup bitiyordu.
  - `vol-hell` `CardScreens.closeIntermission()` artık `hideImmediately()`
    değil `hide()` + `HIDE_ANIMATION_MS` kadar bekleyip katmanı gizliyor;
    kapanış efekti görülebiliyor. Zamanlayıcı `destroy()`'da temizleniyor.
  - `cardScreens.test.ts` kapanışın async olmasına göre güncellendi.
- **Teklif ızgarası kart yükseklikleri eşitlendi.**
  `.vol-card-picker__grid > .vol-card { height: 100%; }` ile aynı satırdaki
  kartlar eşit yükseklikte duruyor; `box-sizing: border-box` sayesinde
  padding sınırları içinde kalıyor.
- **Animasyon mekanizması testlere kilitlendi.**
  - `CardTile.startEnterAnimation()` için regresyon testi eklendi.
  - `LevelUpPicker.present()` sonrası kartlara `vol-card--entering` atandığı
    test edildi.
  - `ShopPicker` açılış ve reroll'da yeni tekliflere `vol-card--entering`
    atandığı ve süre sonunda kalktığı test edildi.
  - Reroll sonrası panelin `vol-card-picker--rerolling` aldığı ve süre sonunda
    kalktığı test edildi.
- **Kod ağacı temizlendi.** `testcss.mjs` artık yok; `prettier-ignore` ile
  `prefers-reduced-motion` bloğu düzgün biçimlendi; `format:check` ve
  `lint:css` geçti.

### Kalite kapıları

| Kapı                                    | Durum | Not                                   |
| --------------------------------------- | ----- | ------------------------------------- |
| `pnpm -r typecheck`                     | geçti | 5 paket                               |
| `pnpm -r --if-present test:coverage`    | geçti | 1234 test (core 829, vol-hell 374, …) |
| `pnpm lint`                             | geçti | 0 hata, 0 uyarı                       |
| `pnpm format:check`                     | geçti |                                       |
| `pnpm lint:css`                         | geçti |                                       |
| `pnpm build:game`                       | geçti | `vol-hell` prod build                 |
| `pnpm --filter @volstudio/vol-ui build` | geçti | showcase prod build                   |
| `cargo check --locked`                  | geçti |                                       |
| `cargo fmt --check`                     | geçti |                                       |
| `cargo clippy --locked -- -D warnings`  | geçti |                                       |

### Bilinçli tercih / kalan risk

- **"Sert değişim" hissi:** Eski kartlar çıkış animasyonu olmadan anında
  yok ediliyor (yeni kartların aynı hücreye girmesini engellememek için).
  Yeni kartlar aynı anda, aynı gecikmeyle beliriyor; ızgara flash'i ile
  birlikte bu kaçınılmaz bir reroll hissi yaratıyor.
- **Panel açılış/kapanış animasyonları:** `vol-card-picker-in/out`
  keyframe'leri güçlendirildi; `vol-ui`'de panel `show()`'u katman
  görünür olduktan SONRA çağrılıyor; `vol-hell`'de kapanış
  `closeIntermission` animasyonu bitirdikten sonra katmanı gizliyor.
- **Havuz daralınca yetersiz teklif:** `vol-ui` demosunda havuz 14 karttan
  4'ü teklif eder. Çok satın alma sonrası havuz daralırsa `pickRandom` 4
  farklı kart bulamayabilir; bu durumda az sayıda teklif gösterilir.
  `vol-hell`'de `drawShopOffers` satın alınanları hariç tutar, aynı risk
  daha geç yaşanır.
