# VOL.STUDIO — Denetim Kaydı

`dev` dalı. Kapsam: ~43.000 satır TypeScript (core + games + tauri-v2) ve ayrıca
ses/müzik motoru (`core/src/audio/**`, ~8.000 satır) için ayrı bir tam denetim.

## Durum

Tüm bulgular (112/112) çözüldü ve doğrulandı.

| Kapı                     | Durum | Not                                                      |
| ------------------------ | ----- | -------------------------------------------------------- |
| `pnpm -r typecheck`      | ✓     | 4 paket                                                  |
| `pnpm -r test`           | ✓     | 793 test (core 654, vol-hell 109, tauri-v2 25, vol-ui 5) |
| `pnpm lint`              | ✓     | 0 hata, 0 uyarı                                          |
| `pnpm format:check`      | ✓     |                                                          |
| `pnpm lint:css`          | ✓     |                                                          |
| `pnpm build:game`        | ✓     | `dist/`'te 0 `.wav` sızıntısı                            |
| `cargo check/fmt/clippy` | ✓     |                                                          |
| CI                       | ✓     | `.github/workflows/ci.yml`                               |

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
