# VOL.STUDIO — Denetim Kaydı

`dev` dalı. Kapsam: ~43.000 satır TypeScript (core + games + tauri-v2) ve ayrıca
ses/müzik motoru (`core/src/audio/**`, ~8.000 satır) için ayrı bir tam denetim.

## Durum

Tüm bulgular (112/112) çözüldü ve doğrulandı.

| Kapı                     | Durum | Not                                                      |
| ------------------------ | ----- | -------------------------------------------------------- |
| `pnpm -r typecheck`      | ✓     | 4 paket                                                  |
| `pnpm -r test`           | ✓     | 779 test (core 643, vol-hell 106, tauri-v2 25, vol-ui 5) |
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
