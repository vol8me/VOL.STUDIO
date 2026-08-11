# VOL.STUDIO — Kod Denetimi TODO

Kaynak: `dev` dalı, commit `495e497`, 374 dosya, ~43.000 satır TypeScript.
Denetim yöntemi: tüm kaynak dosyalar okundu; typecheck/test/lint/format/stylelint repoda çalıştırıldı;
K1, K2 ve K3 geçici bir vitest dosyasıyla repo içinde koşturularak doğrulandı.

**74 bulgu — hepsi çözüldü.** 10 kritik, 18 yüksek, 22 orta, 24 düşük.

**+ Ses/müzik motoru denetimi: 38 bulgu (S1–S38) — hepsi çözüldü.** Ölçümle doğrulandı, 30 yeni regresyon testiyle kilitlendi, WAV asset'leri yeni motorla yeniden üretildi.

**Durum:** 74/74 kalem çözüldü ve kod üzerinde tek tek doğrulandı. Test sayısı 700 → 739. Altı web kapısı + `cargo check`/`fmt`/`clippy` yeşil. Commit atılmadı.

## Doğrulama kapılarının anlık durumu

| Kapı                | Durum   | Not                                              |
| ------------------- | ------- | ------------------------------------------------ |
| `pnpm -r typecheck` | Geçti   | 4 paket                                          |
| `pnpm -r test`      | Geçti   | 58 dosya / 739 test                              |
| `pnpm lint`         | Geçti   | 0 hata, 0 uyarı                                  |
| `pnpm format:check` | Geçti   | tüm dosyalar Prettier uyumlu                     |
| `pnpm lint:css`     | Geçti   | stylelint temiz                                  |
| CI                  | Kuruldu | `.github/workflows/ci.yml` — 6 web kapısı + Rust |

## Kapanış

Tüm bulgular giderildi. Denetim sırasında yapılan **dürüstlük düzeltmeleri** (ilk raporda
yanlış veya fazla geniş yazdığım kalemler):

- **O1** — Sekiz bileşen saymıştım; `FloatingText`, `Toast` ve `PauseResumeButton` zaten
  doğru temizlik yapıyordu. İlk tespit `setTimeout` vs `clearTimeout` metin sayımına
  dayanıyordu ve bu yanıltıcıydı (döngü içindeki tek `clearTimeout` birden fazla id'yi
  kapatıyor). Gerçekten sızdıran beş bileşen düzeltildi.
- **O18** — "Container yeniden boyutlanınca yerleşim bayat kalıyor" kısmı yanlıştı;
  `recomputeLayout()` container genişliğini hiç okumuyor. Gerçek geçersizleştirici yalnızca
  geç font yüklemesi; ResizeObserver eklenmedi.
- **D24** — İlk çözümüm (zaman tabanlarını birleştirme) animasyonu bir kare kaydırıp
  `TimerBar`'ın "start()'tan itibaren N saniye" semantiğini bozuyordu. Geri alındı; asıl
  kusur olan negatif `elapsed` kelepçelendi.
- **O2** — Denetimde "şu an değerler doğru" demiştim; parity testi yazılınca `EventLog`
  sabiti (220 ms) ile CSS animasyonunun (200 ms) zaten ayrışmış olduğu ortaya çıktı.

**Kullanıcı kararıyla kapsam dışı bırakılanlar:** D19 (vol-ui 613 çeviri anahtarı olduğu
gibi bırakıldı).

---

# KRİTİK

Oynanışı, veriyi veya açılışı bozan bulgular.

## - [x] K1 — Analog hareket tamamen ölü: `move()` çağıranın vektörünü eziyor

**Doğrulandı.** Dosya: `core/src/entities/PlayerController.ts:32-37`

`move()` ilk satırda gelen argümanı yerinde normalize ediyor. Bu kendi kopyasını değil
**çağıranın nesnesini** mutasyona uğratıyor.

```ts
// core/src/entities/PlayerController.ts:32
protected move(direction: Vector2, speed: number, delta: number): void {
  direction.normalizeInPlace();   // <-- çağıranın Vector2'sini bozuyor
  this.velocity.set(direction.x * speed, direction.y * speed);
  ...
}
```

`Player.update()` buraya kendi kalıcı alanını geçiyor (`core/src/../Player.ts:113`):

```ts
this.move(this.moveDirection, speed, delta);
```

Sonuç: `this.moveDirection` her frame birim uzunluğa zorlanıyor. Joystick %10 itilse de
%100 itilse de oyuncu 220 px/s ile hareket ediyor. `InputUtils.normalizeAnalog()`
(`core/src/input/InputUtils.ts:24-41`) dead-zone sonrası büyüklüğü 0–1 aralığına yeniden
eşliyor — o hesabın tamamı boşa gidiyor.

Repo içinde koşturulan kanıt:

```
normalizeAnalog(Vector2(32,0), 0.15, 64).length()  -> 0.412   analog büyüklük
probe.move(moveDirection, 220, 1000)
  velocity.length()      -> 220     tam hız uygulandı
  moveDirection.length() -> 1       çağıranın vektörü ezildi
```

**Düzeltme:** `move()` içinde yerel bir kopya üzerinde normalize et, ya da normalizasyonu
tamamen kaldırıp gelen vektörün büyüklüğüne saygı duy. Analog davranış için ikincisi doğru —
`normalizeAnalog` zaten 0–1 aralığında bir vektör döndürüyor.

## - [x] K2 — `attachResize()` maxDpr kelepçesini yok sayıyor, canvas pencereyi taşıyor

**Doğrulandı.** Dosya: `core/src/systems/ViewportManager.ts:53` ve `:93-95`

`getConfig()` DPR'yi kelepçeliyor ve `zoom`'u ona göre ayarlıyor:

```ts
// :53
const dpr = this.config.maxDpr ? Math.min(rawDpr, this.config.maxDpr) : rawDpr;
...
zoom: 1 / dpr,
```

`attachResize()` ise ham değeri kullanıyor ve `maxDpr`'a hiç erişimi yok (statik metot):

```ts
// :93-95
static attachResize(game: Phaser.Game): () => void {
  const handler = (): void => {
    const dpr = window.devicePixelRatio || TECH.DPR_FALLBACK;   // <-- kelepçe yok
```

vol-hell `maxDpr: 1.5` kullanıyor (`games/vol-hell/src/config/game.ts`). DPR 3 olan bir
ekranda:

```
ilk açılış    1000px pencere -> canvas 1500px, zoom 1/1.5 = 1000px görünür  (doğru)
resize sonra  1000px pencere -> canvas 3000px, zoom 1/1.5 = 2000px görünür  (2x taşma)
```

**Düzeltme:** `maxDpr`'ı örnek alanında sakla, `attachResize`'ı örnek metoduna çevir ve aynı
`Math.min` kelepçesini orada da uygula.

## - [x] K3 — `animateValue()` iptali `onUpdate` içinden çalışmıyor

**Doğrulandı.** Dosya: `core/src/ui/animation.ts:35-49`

```ts
const step = (now: number): void => {
  ...
  onUpdate(value);                            // <-- burada cancel() çağrılırsa
  if (t < 1) {
    rafId = requestAnimationFrame(step);      // <-- yine de yeni frame zamanlanıyor
  }
};
rafId = requestAnimationFrame(step);
return () => cancelAnimationFrame(rafId);     // <-- zaten ateşlenmiş id'yi iptal ediyor
```

`onUpdate` içinden iptal edildiğinde `rafId` hâlâ o an çalışan (dolayısıyla ateşlenmiş)
frame'in id'si. İptal hiçbir şey yapmıyor, hemen ardından yeni frame zamanlanıyor.

Etkilenen tüketiciler: `core/src/ui/feedback/Bar.ts:120`, `Counter.ts:56`,
`TimerBar.ts:96` ve `:126`.

**Düzeltme:** Kapanışta bir `cancelled` bayrağı tut, iptalde `true` yap, `step()`'in ilk
satırında kontrol edip çık.

## - [x] K4 — Parmak kalkınca ekranda hayalet joystick kalıyor

Dosya: `core/src/input/TouchController.ts:68-71`

```ts
update(_delta: number): void {
  if (!this.sticks.isActive) return;   // <-- son parmak kalkınca buradan dönüyor
  this.drawSticks();
}
```

`graphics.clear()` yalnızca `drawSticks()` içinde (`:108`). Son parmak kalktığında
`isActive` false oluyor ve `drawSticks()` bir daha hiç çağrılmıyor — son çizilen halkalar
ekranda kalıcı olarak asılı kalıyor.

**Düzeltme:** Aktif değilken bir kez `graphics.clear()` çalıştırıp dön; temizlendiğini bir
bayrakla takip et ki her frame boşuna clear çağrılmasın.

## - [x] K5 — Kayıtlı veri hiç doğrulanmıyor: NaN skor ve kalıcı sessizlik

Dosyalar: `core/src/systems/SaveManager.ts:13`, `games/vol-hell/src/app/GameStats.ts:38,69`,
`games/vol-hell/src/app/AudioSettings.ts:18-28`

Depolama katmanı şema doğrulaması yapmıyor:

```ts
// SaveManager.ts:13
return value ?? defaultValue; // yalnızca null/undefined yakalanıyor
```

`GameStats` gelen nesneyi olduğu gibi spread ediyor:

```ts
// GameStats.ts:38
this.data = { ...(await this.saveManager.load(STORAGE_KEY, DEFAULTS)) };
// GameStats.ts:69
nextData.totalKills += safeKills;
```

localStorage'da kısmi bir kayıt varsa (`{"bestScore":5}`), `totalKills` `undefined` kalıyor
ve `undefined += 5` **NaN** üretiyor. Bu NaN sonra `saveManager.save()` ile diske yazılıyor
ve kalıcı hale geliyor.

`AudioSettings.mergeWithDefaults()` aynı hatayı yapıyor — `??` tip veya aralık kontrolü
değil:

```ts
// AudioSettings.ts:20
masterVolume: stored?.masterVolume ?? audioConfig.masterVolume,
```

Bozuk bir kayıttaki `masterVolume: "yüksek"` doğrudan
`masterGain.gain.setTargetAtTime()`'a gidip gain'i NaN yapıyor. **Ses bir daha hiç
açılmıyor** ve kullanıcı arayüzünde bunu sıfırlamanın yolu yok.

**Düzeltme:** Her iki yükleyicide alan başına tip + aralık doğrulaması yap
(`Number.isFinite(v) && v >= 0 && v <= 1`), geçersizi varsayılana düşür. Doğrulamayı
`SaveManager.load()`'a opsiyonel bir `validate` parametresi olarak da taşıyabilirsin.

## - [x] K6 — AudioContext yoksa tüm oyun ölüyor ve hata ekranı devreye girmiyor

Dosya: `games/vol-hell/src/app/GameAudio.ts:215-218`

```ts
const Ctx =
  globalThis.AudioContext ??
  (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
this.context = new Ctx(); // <-- ikisi de yoksa `new undefined()` TypeError
```

`GameAudio` `bootstrap.ts:19`'da modül gövdesinde kuruluyor, yani hata top-level'da patlıyor.
`bootstrap.ts`'teki hata ekranı (`:37-43`) yalnızca `createVolGame(...)`'i sarıyor ve bu
hata ondan önce gerçekleşiyor — kullanıcı hiçbir mesaj görmeden beyaz ekranla kalıyor.

**Düzeltme:** `Ctx` undefined ise anlamlı bir `Error` at ve K7'deki genel try/catch ile
yakala.

## - [x] K7 — Açılış zincirinin ilk üç adımı korumasız

Dosya: `games/vol-hell/src/app/bootstrap.ts:24-26`

```ts
await i18n.init({ saveManager });
await audioSettings.load();
await gameStats.load();
```

Üçü de try/catch dışında. Tauri store dosyası bozuksa veya i18next init'i patlarsa oyun
sessizce ölüyor. Hata UI'si yalnızca sonraki satırdaki `createVolGame` için var.

**Düzeltme:** Hata ekranını bir `showFatalError(error)` fonksiyonuna çıkar ve tüm açılış
zincirini tek bir `try/catch` içine al.

## - [x] K8 — Ses ayarını sürüklerken her adımda diske yazılıyor ve sınırsız SFX tetikleniyor

Dosyalar: `core/src/ui/primitives/Slider.ts:117`,
`games/vol-hell/src/runtime/scene/SettingsScene.ts:69-124`,
`games/vol-hell/src/app/GameAudio.ts:27-34`

`Slider` `input` olayını dinliyor, yani `onChange` sürükleme boyunca her adımda ateşleniyor:

```ts
// Slider.ts:117
this.input.addEventListener('input', this.boundInput);
```

`SettingsScene`'in her `onChange`'i iki iş yapıyor:

```ts
onChange: (value) => {
  void audioSettings.setMasterVolume(value);   // -> persist -> localStorage / Tauri store.save()
  void gameAudio.playSfx('menuBlip', { volume: 0.4 });
},
```

Slider'ı 0'dan 1'e sürüklemek (step 0.05) **20 disk yazma + 20 üst üste blip sesi** demek.
`menuBlip`, `SfxBank.voiceLimits` tablosunda (`GameAudio.ts:27-34`) hiç yok — yani
`maxVoices: 0, minInterval: 0`, sınırsız eşzamanlı ses.

**Düzeltme:** `Slider`'a `onCommit` (native `change` olayı) ayrımı ekle ve persist'i oraya
bağla, ya da `AudioSettings.persist()`'i debounce et. Ayrıca `menuBlip` için voice limit
tanımla (`{ maxVoices: 2, minInterval: 0.06 }` gibi).

## - [x] K9 — `Wizard` boş `steps` dizisiyle çöküyor

Dosya: `core/src/ui/layout/Wizard.ts:89, 144, 164, 205`

```ts
// :89 (constructor)
this.contentSlot.replaceChildren(this.steps[this.currentIndex].content.element);
```

`steps: []` geçilirse TypeError. Aynı guard'sız indeksleme `handleNext():144`,
`renderStep():164` ve `updateChrome():205`'te tekrarlanıyor. `tsconfig.base.json`'da
`noUncheckedIndexedAccess` kapalı olduğu için TypeScript bunu yakalamıyor.

**Düzeltme:** Constructor'da `if (options.steps.length === 0) throw new Error(...)` ile erken
ve anlaşılır bir hata ver.

## - [x] K10 — `GameStateDb.init()` yarış koşulu, veritabanı iki kez kuruluyor

Dosya: `tauri-v2/src/storage/GameStateDb.ts:30-52`

```ts
async init(): Promise<void> {
  if (this.initialized) return;
  try {
    this.db = await Database.load(`sqlite:${this.path}`);   // <-- await noktası
    await this.db.execute(`CREATE TABLE IF NOT EXISTS schema_version ...`);
    await this.db.execute(`CREATE TABLE IF NOT EXISTS saves ...`);
    await this.migrate();
    this.initialized = true;   // <-- :52, tüm await'lerden SONRA
  }
```

Devam eden bir promise saklanmıyor. Her public metot başında `await this.init()` çağırdığı
için eşzamanlılık istisna değil normal durum: `Promise.all([saveGame(a), saveGame(b)])` iki
kez `Database.load`, iki kez `CREATE TABLE`, iki kez `migrate()` çalıştırır.

**Düzeltme:** `private initPromise?: Promise<void>` tut; `init()` varsa onu döndürsün.

---

# YÜKSEK

Davranış hatası, kaynak sızıntısı, güvenlik ve süreç bulguları.

## - [x] Y1 — Şema versiyon tasarımı ilk migration'da bozulacak

Dosya: `tauri-v2/src/storage/GameStateDb.ts:38, 62, 67, 72`

```sql
-- :38
version INTEGER PRIMARY KEY
```

```ts
// :62
'SELECT version FROM schema_version LIMIT 1', // <-- ORDER BY yok
  // :67
  await this.db!.execute('INSERT OR REPLACE INTO schema_version (version) VALUES (?)', [1]);
// :72 (yorumdaki gelecek migration şablonu)
// await this.db!.execute('INSERT OR REPLACE INTO schema_version (version) VALUES (?)', [2]);
```

`version` PK olduğu için `VALUES (2)` versiyon 1 ile **çakışmaz** — tabloda iki satır birden
durur. `LIMIT 1` + `ORDER BY` yokluğu hangi satırın geleceğini belirsiz bırakır. Koddaki
gelecek-migration şablonu bu tuzağı doğrudan tetikliyor.

**Düzeltme:** Tek satır garantisi ver — `id INTEGER PRIMARY KEY CHECK (id = 1)` +
`version INTEGER NOT NULL`, ya da en azından `ORDER BY version DESC LIMIT 1`.

## - [x] Y2 — `crossfadeTo()` geçişten önce `duration` kadar hiçbir şey yapmıyor

Dosya: `core/src/audio/music/engine.ts:145-193`

```ts
// :160 — options.bars verilmediğinde
transitionTime = now + duration;
```

Hem eski stem'lerin fade'i (`:166`) hem yeni track'in başlangıcı (`:189`) bu ana zamanlanıyor.
Yani `playAmbient(id, { crossfade: true, fadeIn: 2 })`:

```
0s - 2s : hiçbir şey olmuyor (eski track tam sesle çalıyor)
2s - 4s : crossfade
```

vol-hell düşman yoğunluğuna göre ambiyans değiştirirken bunu kullanıyor
(`GameScene.ts:366`); geçiş oyuncuya gecikmiş hissettiriyor.

**Düzeltme:** `bars` yokken `transitionTime = now` olmalı.

## - [x] Y3 — Ducking hold'u `setTimeout` ile, gain'i AudioContext saatiyle sürülüyor

Dosya: `core/src/audio/sidechain.ts:39, 46, 66`

```ts
this.gain.gain.setTargetAtTime(this.currentTarget, now, attackTimeConst);  // :39 audio saati
...
this.releaseTimer = window.setTimeout(                                     // :46 duvar saati
  () => this.release(profile.release),
  Math.max(0, (profile.attack + profile.hold) * 1000),
);
```

İki saat aynı değil. Sekme arka plana alındığında `setTimeout` ≥1 s'e throttle edilir **ve**
`GameAudio.setupResume()` (`GameAudio.ts:272-280`) context'i `suspend()` ettiği için
`context.currentTime` tamamen durur. Sekmeye geri dönüldüğünde müzik kısık takılı
kalabiliyor.

**Düzeltme:** Release'i de audio zaman çizelgesine zamanla
(`setTargetAtTime(1, now + attack + hold, release / 3)`), `setTimeout`'u kaldır.

## - [x] Y4 — `Slider.setValue()` programatik çağrıda `onChange` tetikliyor

Dosya: `core/src/ui/primitives/Slider.ts:126-131`

```ts
setValue(value: number): void {
  const clamped = this.clamp(value);
  this.input.value = String(clamped);
  this.render(clamped);
  this.onChangeHandler?.(clamped);   // <-- programatik atamada da ateşleniyor
}
```

Klasik geri besleme döngüsü tuzağı: `onChange` -> state -> `setValue` -> `onChange`.
Aynı repodaki `Bar.setValue()` (`core/src/ui/feedback/Bar.ts:107`) bunu yapmıyor — kendi
içinde tutarsız.

**Düzeltme:** Programatik atamayı sessiz yap; olay gerektiğinde ayrı bir
`setValueAndNotify()` sun.

## - [x] Y5 — Kullanılmayan Tauri izinleri ve native plugin'ler

**AGENTS.md ihlali** ("capabilities/\*.json permissions genişletmeden önce onay al").
Dosyalar: `tauri-v2/src-tauri/capabilities/desktop.json`, `capabilities/mobile.json`,
`src-tauri/Cargo.toml`, `src-tauri/src/lib.rs:14-15`

Her iki capability dosyası da veriyor:

```json
"dialog:allow-open", "dialog:allow-save", "dialog:allow-message", "dialog:allow-ask"
```

`Cargo.toml` `tauri-plugin-shell` ve `tauri-plugin-dialog`'u derliyor, `lib.rs` ikisini de
kaydediyor. Frontend taraması:

```
tauri-v2/src/adapters/TauriStoreAdapter.ts:1:  import { LazyStore } from '@tauri-apps/plugin-store';
tauri-v2/src/storage/GameStateDb.ts:1:         import Database from '@tauri-apps/plugin-sql';
```

**Hiçbir dialog veya shell kullanımı yok.** Boşuna saldırı yüzeyi ve binary şişmesi.

**Düzeltme:** Dört `dialog:*` iznini iki capability dosyasından da kaldır;
`tauri-plugin-shell` ve `tauri-plugin-dialog`'u `Cargo.toml` ve `lib.rs`'ten çıkar.

## - [x] Y6 — `Joystick` ve `SquareJoystick` global listener'ları ömür boyu bağlı tutuyor

Dosyalar: `core/src/ui/controls/Joystick.ts:68-70`,
`core/src/ui/controls/SquareJoystick.ts:71-73`

Her ikisi de constructor'da bağlıyor ve `destroy()`'a kadar bırakmıyor:

```ts
window.addEventListener('pointermove', this.boundPointerMove);
window.addEventListener('pointerup', this.boundPointerUp);
window.addEventListener('pointercancel', this.boundPointerUp);
```

Sürükleme olmasa bile sayfadaki her fare hareketi bu handler'ları çağırıyor.

Aynı repodaki iki bileşen aynı problemi **doğru** çözüyor:

- `core/src/ui/controls/RadialMenu.ts:101-104` — `open()` içinde bağlıyor, `close()`'da çözüyor
- `core/src/ui/data/Kanban.ts:376-378` — `pointerdown` içinde bağlıyor, `pointerup`'ta çözüyor

Tek kod tabanında iki farklı standart var ve zayıf olan iki bileşen sızdırıyor.

**Düzeltme:** `onPointerDown` içinde bağla, `onPointerUp`/`onPointerCancel` içinde çöz;
`destroy()` güvenlik ağı olarak kalsın.

## - [x] Y7 — `Modal` global sayacı sayfayı kalıcı kilitleyebiliyor

Dosya: `core/src/ui/overlays/Modal.ts:13, 84, 124`

```ts
let bodyLockCount = 0;                                  // :13 modül düzeyinde global
...
if (bodyLockCount++ === 0) document.body.classList.add(BODY_LOCK_CLASS);   // :84
...
if (bodyLockCount > 0 && --bodyLockCount === 0) ...                        // :124
```

Bir modal açıkken sahne `destroy()` çağrılmadan yıkılırsa sayaç hiç azalmıyor ve
`vol-modal__body-locked` class'ı `document.body` üzerinde kalıcı kalıyor — kullanıcı sayfayı
yenilemeden kaydırma yapamıyor.

**Düzeltme:** Kilidi sayaç yerine `openModals.length > 0` üzerinden türet; tek doğruluk
kaynağı zaten o dizi (`:21`).

## - [x] Y8 — `Popup` açıkken çapasından kopuyor

Dosya: `core/src/ui/overlays/Popup.ts:78, 123`

`reposition()` yalnızca `show()` içinde bir kez çağrılıyor (`:78`). Pencere yeniden
boyutlandırılırsa veya sayfa kaydırılırsa popup hedef elementten ayrılıp havada kalıyor.
`Select` ve `ContextMenu` bunun üzerine kurulu, yani etki alanı geniş.

**Düzeltme:** Açıkken `resize` ve `scroll` (capture: true) dinle, `close()`/`destroy()`'da
çöz.

## - [x] Y9 — `MainMenuScene.nextScene` `create()`'te sıfırlanmıyor

**AGENTS.md ihlali.** "Bilinen Tuzaklar" bölümü açıkça yazıyor:
_"Sahne yeniden başlatıldığında aynı örnek kullanılır: create()'te durumu sıfırla."_

Dosya: `games/vol-hell/src/runtime/scene/MainMenuScene.ts:20, 75, 124, 145`

```ts
private nextScene: string | null = null;   // :20 yalnızca alan başlatıcısında
...
this.nextScene = 'Settings';               // :75
...
if (this.nextScene !== 'Settings') {       // :145 onShutdown — müziği durdurup durdurmama kararı
  gameAudio.stopMusic(1);
}
```

Phaser sahne örneğini yeniden kullandığı için Ayarlar'a gidip dönünce değer `'Settings'`
olarak asılı kalıyor. Sonraki çıkışta müzik yanlışlıkla çalmaya devam ediyor.

**Düzeltme:** `create()` başında `this.nextScene = null`.

## - [x] Y10 — `GameScene.isAmbientLoaded` yeniden başlatmada sıfırlanmıyor

**AGENTS.md ihlali** (Y9 ile aynı kural).
Dosya: `games/vol-hell/src/runtime/scene/GameScene.ts:66, 88, 348`

```ts
private isAmbientLoaded = false;   // :66 yalnızca alan başlatıcısında
```

`create()` yalnızca `isPaused`'u sıfırlıyor (`:77`), `resetRun()` (`:335-345`) birkaç alan
daha topluyor — `isAmbientLoaded` ikisinde de yok.

**Düzeltme:** Sıfırlanması gereken tüm alanları tek bir `resetSceneState()` altında topla ve
`create()` başında çağır. Şu an sorumluluk `create()` ile `resetRun()` arasında dağınık.

## - [x] Y11 — SFX'ler açılışta iki kez indiriliyor ve iki kez decode ediliyor

Dosya: `games/vol-hell/src/app/GameAudio.ts:52-82`

```ts
async load(event: SoundEvent): Promise<void> {
  const key = soundKeys[event];
  if (this.buffers.has(key)) return;    // <-- cache yalnızca sonda doluyor
  ...
  const results = await Promise.allSettled(tasks);
  ...
  this.buffers.set(key, buffers);       // :82
}
```

Devam eden promise saklanmıyor. `GameScene.create():94` `loadAllSfx()` çağırıyor; ilk
`play()` de (`:100`) aynı anda `load()` tetikliyor. İkisi de cache'i boş görüp aynı dosyaları
paralel indiriyor.

**Düzeltme:** `Map<string, Promise<AudioBuffer[]>>` ile in-flight dedup.

## - [x] Y12 — CI yok; kalite kapılarının çürümesinin kök nedeni

Dosya: `.github/`

Altında yalnızca logo görselleri var; `workflows/` dizini hiç yok. Hiçbir push veya PR
doğrulanmıyor. Y13, Y14 ve Y15 bunun doğrudan sonucu.

**Düzeltme:** Minimum kapı — hepsi `package.json`'da zaten tanımlı, sadece koşturulmuyor:

```
pnpm -r typecheck
pnpm -r --if-present test
pnpm lint
pnpm format:check
pnpm lint:css
```

## - [x] Y13 — `pnpm lint` 19 hatayla kırmızı

Repoda çalıştırıldı, çıktı:

```
13x  no-unnecessary-type-assertion   synth/engine.ts, physical.ts, waveforms.ts, MainMenuScene.ts
 1x  no-unused-vars                  MusicContext        core/src/audio/music/engine.ts:4
 1x  no-unused-vars                  ctx                 core/src/audio/music/gain-resolver.ts:51
 1x  consistent-type-imports                             core/src/audio/music/instrument.ts:4
 1x  prefer-const                    effected            core/src/audio/synth/engine.ts:503
 1x  no-floating-promises (uyarı)                        GameScene.ts:85

19 hata + 1 uyarı; 16'sı --fix ile otomatik düzelir.
```

GameScene:85'teki floating promise gerçek bir kusur — `Promise.all(...).then(...)` zincirinin
`catch`'i yok, bir ambiyans dosyası yüklenemezse unhandled rejection oluyor.

**Düzeltme:** `pnpm lint:fix` çalıştır, kalan 3 hatayı elle düzelt, GameScene:85'e `.catch()`
ekle.

## - [x] Y14 — `pnpm format:check` 15 dosyayla kırmızı

Repoda çalıştırıldı:

```
core/docs/music-engine.md
core/scripts/generate-ambient-tracks.ts
core/scripts/generate-black-tide.ts
core/scripts/generate-crimson-horizon.ts
core/scripts/generate-iron-vein.ts
core/scripts/generate-volhell-sounds.ts
core/scripts/menu-music-instruments.ts
core/scripts/music-utils.ts
core/src/audio/synth/effects.ts
core/src/audio/synth/engine.ts
core/src/audio/synth/filter.ts
core/src/audio/synth/index.ts
core/src/audio/synth/physical.ts
core/tests/audio/music/music.test.ts
games/vol-hell/src/runtime/scene/MainMenuScene.ts
```

**Düzeltme:** `pnpm format` — tek komut. Asıl mesele Y12'nin bunu bir daha bozulmasın diye
tutmaması.

## - [x] Y15 — AGENTS.md "Doğrulama" bölümü `pnpm lint`'i hiç listelemiyor

**Kural boşluğu.** Dosya: `AGENTS.md:59-66`

Bölüm `pnpm -r typecheck`, `pnpm --filter ... test`, `pnpm --filter ... build`,
`pnpm lint:css` ve `cargo check` sayıyor — **`pnpm lint` yok**. Kuralı harfiyen uygulayan bir
agent ESLint'i hiç çalıştırmaz. Y13'teki 19 hatanın nasıl biriktiğinin cevabı burada.

Aynı bölümdeki _"Sadece typecheck/test/build geçen kodu sağlıklı olarak rapor et"_ cümlesi de
bu yüzden yanlış güven veriyor.

**Düzeltme:** Bölüme `pnpm lint` ve `pnpm format:check` ekle; "sağlıklı" tanımını beş kapıyı
da kapsayacak şekilde güncelle.

## - [x] Y16 — `AudioManager` hem ölü hem tasarımı gereği çalışamaz, 9 testi yeşil

Dosyalar: `core/src/systems/AudioManager.ts`, `core/src/Game.ts:85`,
`core/tests/systems/audioManager.test.ts`

`core/src/index.ts:34`'ten export ediliyor, 9 testi geçiyor, ve hiçbir oyun kullanmıyor
(tarama sonucu: yalnızca kendi tanımı, export satırı ve testi).

Dahası çalışması imkânsız:

```ts
// core/src/Game.ts:85 — her Phaser config'ine ekleniyor
audio: { noAudio: true },
```

`noAudio: true` ile `scene.sound` her zaman `NoAudioSoundManager` oluyor; `AudioManager.play()`
asla ses çıkaramaz. Testler mock'lanmış bir `scene.sound`'a karşı doğrulama yapıyor.

**Düzeltme:** Sil (oyunlar zaten kendi `GameAudio`'sunu Web Audio üzerine kuruyor), veya
`noAudio` kararıyla uzlaştır. Test paketine duyulan güveni doğrudan zedeleyen en net örnek.

## - [x] Y17 — `I18n` sınıfında üç ayrı lifecycle hatası

Dosya: `core/src/systems/I18n.ts:38-86, 90-102, 120-129`

**a) `init()` eşzamanlı çağrıya açık** — `this.initialized = true` (`:86`) fonksiyonun
sonunda; iki paralel `init()` ikisi de guard'ı geçip `i18next.init()`'i iki kez çağırır.

**b) `reset()` i18next'i sıfırlamıyor** (`:90`) — yalnızca kendi bayrağını ve resource
bundle'larını temizliyor. Sonraki `init()` zaten başlatılmış bir i18next üzerine ikinci kez
init çağırıyor.

**c) `changeLanguage()` kaynaksız dil ekliyor** (`:125`):

```ts
await i18next.changeLanguage(locale);
this.locales.add(locale); // <-- çeviri yüklü mü diye bakmıyor
```

`detectLocale()` (`:187-190`) sonradan bu listeye baktığı için hiç çevirisi olmayan bir dili
seçebiliyor.

**Düzeltme:** (a) devam eden `initPromise` sakla; (b) `reset()`'te dokümante et ki i18next
durumu korunuyor veya gerçekten sıfırla; (c) yalnızca resource'u olan dilleri `locales`'e ekle.

## - [x] Y18 — Dairesel bağımlılık: `bootstrap` ile sahneler/entity'ler

Dosyalar:

```
games/vol-hell/src/app/bootstrap.ts:7          -> import { GameScene } from '@/runtime/scene/GameScene'
games/vol-hell/src/runtime/scene/GameScene.ts:15  -> import { gameAudio, audioSettings, gameStats } from '@/app/bootstrap'
games/vol-hell/src/runtime/entity/Bullet.ts:4     -> import { gameAudio } from '@/app/bootstrap'
games/vol-hell/src/runtime/systems/CollisionResolver.ts:4 -> import { gameAudio } from '@/app/bootstrap'
```

Üstelik `bootstrap.ts`'te top-level `await` var (`:24-26`).

Şu an çalışıyor çünkü `gameAudio`'ya yalnızca çağrı anında erişiliyor. Ama kırılgan ve test
edilemez: tek bir `Bullet`'ı izole test etmek tüm ses altyapısını, i18n'i ve storage'ı ayağa
kaldırmayı gerektiriyor.

**Düzeltme:** Ses servisini constructor parametresi olarak enjekte et (`BulletManager` zaten
`scene` ve `particles` alıyor), ya da modül düzeyinde bir servis registry'si kur.

---

# ORTA

Kırılganlık, tutarsızlık ve mimari borç.

## - [x] O1 — Sekiz bileşende temizlenmeyen timer ve rAF

Dosyalar ve sayımlar (`setTimeout|setInterval` vs `clearTimeout|clearInterval`,
`requestAnimationFrame` vs `cancelAnimationFrame`):

```
core/src/ui/hud/SkillTree.ts              set=2 clear=0   raf=3 cancel=0
core/src/ui/layout/Wizard.ts              set=1 clear=0   raf=1 cancel=0
core/src/ui/overlays/Confirm.ts           set=1 clear=0
core/src/ui/controls/PinchZoomController  set=1 clear=0
core/src/ui/primitives/SegmentedControl                   raf=1 cancel=0
core/src/ui/controls/PauseResumeButton    set=2 clear=1
core/src/ui/feedback/FloatingText.ts      set=2 clear=1   raf=2 cancel=1
core/src/ui/overlays/Toast.ts             set=2 clear=1   raf=2 cancel=1
```

En belirginleri: `SkillTree.resetView():225` (420 ms) ve `animateConnectionFill():469-478`
(500 ms + iki iç içe rAF) hiç takip edilmiyor; `Wizard.renderStep():178-198` (150 ms + rAF)
`destroy()`'da temizlenmiyor.

Tek başına çökme yaratmıyor ama `destroy()` sonrası DOM'dan kopmuş elementler üzerinde
callback çalışıyor.

**Düzeltme:** Her bileşende `cleanups: (() => void)[]` deseni zaten `SkillTree`'de var —
timer'ları da o listeye kaydet.

## - [x] O2 — CSS değerlerini JS'te kopyalayan altı sabit, tek bir parity testi yok

Dosyalar:

```
core/src/ui/overlays/Confirm.ts:19       MODAL_TRANSITION_MS = 240   <- --vol-transition-medium: 0.24s
core/src/ui/overlays/Toast.ts:4          TOAST_FADE_OUT_MS   = 240   <- aynı değişken
core/src/ui/hud/SkillTree.ts:65          MIN_NODE_WIDTH      = 88    <- hud.css:183 min-width: 88px
core/src/ui/hud/SkillTree.ts:72          NODE_LABEL_FONT "600 12px 'Jura', sans-serif"
                                                                     <- theme.css:72 + hud.css:248-249
core/src/ui/primitives/RangeSlider.ts:6  handle genişliği 18px
core/src/ui/data/EventLog.ts:29          leave animasyon süresi
```

Hepsini kontrol ettim, **şu an doğrular**. Ama `theme.css`'te bir değer değişirse hiçbir test
uyarmaz; senkron kalması yalnızca bir yoruma emanet.

**Düzeltme:** `pnpm gen:theme` script'i (`core/scripts/gen-theme.mjs`) zaten var — bu
sabitleri de oradan üret, ya da CSS'i parse edip karşılaştıran bir parity testi yaz
(`core/tests/ui/colorSync.test.ts` benzer bir işi renkler için zaten yapıyor).

## - [x] O3 — `UIRoot` DOM elementini paylaşıyor ama `destroy()` onu kaldırıyor

Dosya: `core/src/ui/layout/UIRoot.ts:22-26, 43-45`

```ts
const existing = target.querySelector<HTMLDivElement>(`:scope > .${ROOT_CLASS}`);
if (existing) { this.element = existing; return; }   // bilinçli paylaşım
...
destroy(): void { this.element.remove(); }           // koşulsuz kaldırma
```

Aynı parent için iki `UIRoot` örneği varsa birinin `destroy()`'u diğerinin altındaki zemini
de siliyor.

**Düzeltme:** Paylaşılan element için referans sayacı tut (`dataset.refCount`), sıfıra inince
kaldır.

## - [x] O4 — `getPosition()` paylaşılan mutable buffer döndürüyor

Dosya: `games/vol-hell/src/runtime/entity/Player.ts:197-200`

```ts
getPosition(): Vector2 {
  this.positionBuf.set(this.arc.x, this.arc.y);
  return this.positionBuf;   // her çağrıda aynı nesne
}
```

GC baskısını azaltmak için mantıklı ama tehlikeli bir sözleşme. `GameScene.update():239-250`
bu referansı `fire()`'a ve `enemyManager.update()`'e geçiriyor; aynı frame içinde
`CollisionResolver:79` ve `:107` de `getPosition()` çağırıp buffer'ı yeniden yazıyor.

Şu an sıralama şansa bağlı olarak doğru. Sözleşme hiçbir yerde belgelenmemiş — oysa
`SpatialGrid.queryNearby()` (`SpatialGrid.ts:68-70`) aynı deseni kullanırken yorumunda açıkça
uyarıyor: _"Dönen array reusable'dır... Sonucu hemen tüket, saklama."_

**Düzeltme:** Aynı uyarıyı buraya da yaz, ya da `getPosition(out?: Vector2)` imzasıyla
çağırana hedef vektörü verme imkânı sun.

## - [x] O5 — Her frame'de iki kez `getState()` çağrılıyor

Dosya: `games/vol-hell/src/runtime/scene/GameScene.ts:276, 292`

```ts
// updatePlayer():276
const state = this.inputManager.getState(playerPos);
// fire():292
const state = this.inputManager.getState(playerPos);
```

Her çağrı yeni `Vector2`'ler üretiyor — repo'nun geri kalanı buffer kullanarak allocation'dan
kaçınırken burada frame başına gereksiz nesne yaratılıyor.

Ayrıca `fire()` kendi aldığı `state.aim`'i yok sayıp `this.aimDirBuf`'ı kullanıyor (`:293`);
iki kaynak arasındaki bu sessiz tutarsızlık ileride hata üretir.

**Düzeltme:** State'i `update()` içinde bir kez al, `updatePlayer()` ve `fire()`'a parametre
olarak geçir.

## - [x] O6 — GameScene sihirli sayılarla dolu

**AGENTS.md ihlali** (_"Sihirli sayı yazma; oyun parametreleri games/vol-hell/src/config/_
içinde."\*). Dosya: `games/vol-hell/src/runtime/scene/GameScene.ts`

```ts
:351  const desired = enemyCount >= 8 ? 'tense' : 'calm';            // eşik config'de yok
:360  const thresholdMs = desired === 'calm' ? 5000 : 1000;          // bekleme süreleri
:365  const trackId = desired === 'tense' ? 'iron-tide' : 'void-whisper';
:90   musicTracks['void-whisper'].id, { fadeIn: 2 }
```

`ambientTrackKeys` (`config/music.ts`) zaten var ama track id'leri yine de string literal
olarak yazılmış. Ses seviyeleri sekiz ayrı çağrıda dağınık: `0.45, 0.5, 0.6, 0.65, 0.7,
0.85, 0.9` — `audioConfig` mevcutken per-event kazançlar oraya ait.

**Düzeltme:** Ambiyans eşiği/süreleri `config/music.ts`'e, SFX kazançları `config/audio.ts`'e
taşı.

## - [x] O7 — DifficultyCalculator'da config dışı sabitler

Dosya: `games/vol-hell/src/runtime/systems/DifficultyCalculator.ts:19, 21, 32`

```ts
const MIN_SPAWN_MULTIPLIER = 0.15; // :19
const MIN_SPAWN_INTERVAL_MS = 200; // :21
const rampedFactor = ramped * 0.5; // :32 — hiç isimlendirilmemiş
```

Üçü de zorluk eğrisini doğrudan belirleyen ayar değerleri; `difficultyConfig`'e ait.

**Düzeltme:** `difficultyConfig`'e `minSpawnMultiplier`, `minSpawnIntervalMs` ve
`rampSlowdownFactor` olarak taşı.

## - [x] O8 — Düşman sayısı ve skor çarpanı üst sınırsız büyüyor

Dosya: `games/vol-hell/src/runtime/systems/DifficultyCalculator.ts:57, 63`

```ts
maxEnemies: enemyConfig.maxCount + extraEnemies,   // :63 tavan yok
scoreMultiplier,                                    // :57 tavan yok
```

`extraEnemies` dakikada +4 artıyor (`maxEnemiesGrowthPerMinute: 4`). `spawnIntervalMs` 200 ms'de
tabanlanmış ama düşman sayısında böyle bir koruma yok:

```
10 dakika -> ~24 + 40 =  64 eşzamanlı düşman
30 dakika -> ~24 + 120 = 144 eşzamanlı düşman
```

Her düşman bir Arc + iki Rectangle + her frame separation sorgusu demek.

**Düzeltme:** `difficultyConfig`'e `maxEnemiesCap` ekle ve `Math.min` ile kelepçele.

## - [x] O9 — `SpatialGrid.key()` taşma matematiği yanlış

Dosya: `games/vol-hell/src/runtime/systems/SpatialGrid.ts:18-20`

```ts
/** Base 1_000_000 yeterince büyük; oyun alanı sınırlı olduğu için çakışma yok. */
return (cx + 1_000_000) * 1_000_000 + (cy + 1_000_000);
```

`cy >= 0` iken `cy + 1_000_000 >= 1_000_000`, yani ikinci terim çarpanı aşıp `cx` hanesine
taşıyor. Matematiksel olarak `key(cx, cy) === key(cx + 1, cy - 1_000_000)`.

Oyun alanı sınırlı olduğu için pratikte ulaşılmaz ve yorum bunu kabul ediyor. Yine de doğru
çarpan `2_000_000` ve düzeltmenin maliyeti sıfır.

**Düzeltme:** `(cx + 1_000_000) * 2_000_000 + (cy + 1_000_000)`.

## - [x] O10 — Can barı Phaser'ın belgelenmemiş iç davranışına yaslanıyor, yorum gerçeği anlatmıyor

Dosya: `games/vol-hell/src/runtime/entity/Enemy.ts:183-186`

```ts
// Fill merkezde kalır, genişlikten küçülür — kayma hissi oluşmaz.
this.healthBarFill.width = Math.max(2, enemyConfig.healthBarWidth * ratio);
this.healthBarFill.x = this.arc.x;
```

`setSize()` yerine `.width` doğrudan atanıyor. Phaser kaynağı (`Rectangle.js:133-142`)
`setSize()`'ın ayrıca `geom.setSize()` ve `updateDisplayOrigin()` çağırdığını gösteriyor —
bunlar atlanıyor. WebGL renderer'ı (`RectangleWebGLRenderer.js`) `src.width`'i okuduğu için
tesadüfen çalışıyor.

Yan etki: `_displayOriginX` eski genişliğin yarısında kaldığı için bar **soldan sabit,
sağdan kısalıyor** — yorumun anlattığının tersi. Görsel sonuç kabul edilebilir ama hem API
hem yorum yanlış.

**Düzeltme:** `setSize(w, h)` kullan ve barı sola yaslamak istiyorsan `setOrigin(0, 0.5)` ile
açıkça yap; yorumu gerçek davranışa göre düzelt.

## - [x] O11 — `bounceDamping` yorumu tam ters

Dosya: `games/vol-hell/src/config/bullet.ts`

```ts
/** Border duvarından sekme hız kaybı (0-1, 0=kayıp yok, 1=tam dur). */
bounceDamping: 0.8,
```

Kod ise (`runtime/entity/Bullet.ts:113`):

```ts
this.velocity.x = -this.velocity.x * bulletConfig.bounceDamping;
```

Yani **0 = tam dur, 1 = kayıp yok** — yorumun tam tersi. Değeri ayarlamak isteyen biri yanlış
yöne çeker.

**Düzeltme:** Yorumu düzelt (veya adı `bounceRetention` yapıp anlamı netleştir).

## - [x] O12 — Diagnostics ölçtüğü metriği kendi maliyetiyle bozuyor

Dosya: `core/src/debug/Diagnostics.ts:185-193`

```ts
stats.min = Math.min(...stats.values); // :192 — 60 elemanlı spread
stats.max = Math.max(...stats.values); // :193 — 60 elemanlı spread
```

Her örnekte çalışıyor. Üç istatistik nesnesi (frame, update, render) için frame başına
6 spread + ~360 eleman kopyalaması. Bir performans ölçüm aracının gürültüsü ölçtüğü şeyin
mertebesinde olmamalı.

**Düzeltme:** min/max'ı artımlı güncelle, ya da yalnızca `buildSnapshot()` anında hesapla
(frame başına değil, 10 frame'de bir).

## - [x] O13 — `endStage()` ikinci çağrıda çöp değer üretiyor

Dosya: `core/src/debug/Diagnostics.ts:130-139`

```ts
startStage(name) { this.stageTimes.set(name, performance.now()); }
endStage(name) {
  const start = this.stageTimes.get(name);
  if (start !== undefined) this.stageTimes.set(name, performance.now() - start);   // :137
}
```

Aynı `Map` hem başlangıç zaman damgasını hem süreyi tutuyor. Bir aşama için `endStage()` iki
kez çağrılırsa ikinci çağrı `now - süre` hesaplayıp devasa bir sayı yazıyor ve overlay'de
sessizce yanlış veri gösteriyor.

**Düzeltme:** Ayrı bir `stageStarts` map'i kullan.

## - [x] O14 — Debug sunucusu Tauri dev'de de CSP tarafından engelleniyor

**Belge çelişkisi.** Dosyalar: `core/src/debug/Diagnostics.ts:52`,
`tauri-v2/src-tauri/tauri.dev.conf.json`

Diagnostics `http://127.0.0.1:9876/debug`'a POST atıyor. Dev CSP:

```json
"connect-src": "'self' ipc: http://ipc.localhost ws://*:1421"
```

Debug sunucusu adresi yok. AGENTS.md ise (`:163`) sistemin geliştirme ortamı için olduğunu ve
yalnızca production'da engellendiğini söylüyor. Gerçekte Tauri dev'de de çalışmıyor; sadece
tarayıcı dev server'ında çalışıyor.

**Düzeltme:** Ya dev CSP'ye `http://127.0.0.1:9876` ekle, ya AGENTS.md'yi düzelt.

## - [x] O15 — `getState()` ve `getDebugSnapshot()` farklı provider seçiyor

Dosya: `core/src/input/InputManager.ts:32-44, 47-53`

```ts
getState(playerPosition) {
  if (this.touch.isActive) return this.touch.getState(playerPosition);   // touch önceliği
  ...
}
getDebugSnapshot() {
  const active = this.providers.find((p) => p.isActive);                 // :48 ilk aktif
  ...
}
```

İkisi aynı anda aktifken debug overlay `'pc'` gösterirken oyun aslında touch state'i
kullanıyor — hata ayıklama aracı yanlış bilgi veriyor.

**Düzeltme:** `getDebugSnapshot()` de aynı önceliklendirmeyi uygulasın; seçim mantığını tek
bir `private resolveActiveProvider()` metoduna çıkar.

## - [x] O16 — Boş `providers` dizisi `InputManager`'ı çökertiyor

Dosya: `core/src/input/InputManager.ts:18-19`

```ts
this.providers = providers ?? [new TouchController(scene), new PCController(scene)];
this.touch = this.providers[0]; // <-- boş dizi guard'ı yok
```

Enjeksiyon noktası testler için açık bırakılmış. `getState()` ilk satırda `this.touch.isActive`
okuyup TypeError atıyor. `tsconfig.base.json`'da `noUncheckedIndexedAccess` kapalı olduğu için
TypeScript sessiz kalıyor.

**Düzeltme:** Constructor'da boş dizi kontrolü, ya da `noUncheckedIndexedAccess: true` aç
(repo genelinde etki yaratır ama bu sınıf hatayı toptan kapatır).

## - [x] O17 — `Wizard`: yeniden giriş koruması yok, constructor callback tetikliyor

Dosya: `core/src/ui/layout/Wizard.ts:143-156, 200, 216`

```ts
private async handleNext(): Promise<void> {
  const current = this.steps[this.currentIndex];
  if (current.validate) {
    const valid = await current.validate();   // <-- buton devre dışı bırakılmıyor
```

Yavaş bir async validate sırasında çift tıklama iki geçiş kuyruğa alabiliyor.

Ayrıca constructor `updateChrome()` çağırıyor (`:90`) ve o da `onStepChange?.()` tetikliyor
(`:216`) — tüketici henüz `Wizard` referansına sahip değilken callback çalışıyor.

**Düzeltme:** `handleNext()` başında `this.nextButton.disabled = true`, `finally` içinde geri
aç. `onStepChange`'i constructor'dan tetikleme, ya da bunu dokümante et.

## - [x] O18 — `SkillTree` yerleşimi yalnızca constructor'da hesaplanıyor

Dosya: `core/src/ui/hud/SkillTree.ts:199`

`recomputeLayout()` canvas `measureText()` ile DOM'a bağlı olmadan doğru ölçüyor — iyi
düşünülmüş ve uzun bir yorumla gerekçelendirilmiş (`:82-95`). Ama bir kez çalışıyor.

'Jura' fontu `createVolGame` tarafından yükleniyor (`core/src/Game.ts:50-51`); SkillTree font
hazır olmadan kurulursa ölçümler sistem fontuna göre çıkıyor ve bir daha düzelmiyor. Container
yeniden boyutlansa da yerleşim bayat kalıyor.

**Düzeltme:** `document.fonts.ready` sonrası bir kez daha `recomputeLayout()` çağır; container
için `ResizeObserver` ekle.

## - [x] O19 — `AudioSettings.notify()` dinleyicilere canlı nesneyi veriyor

Dosya: `games/vol-hell/src/app/AudioSettings.ts:77-79, 130-134`

```ts
getData(): AudioSettingsData { return { ...this.data }; }   // :78 kopya
...
private notify(): void {
  for (const listener of this.listeners) listener(this.data);   // :132 canlı referans
}
```

Aynı sınıfta iki farklı sözleşme. Bir dinleyici ayarları farkında olmadan mutasyona
uğratabilir.

**Düzeltme:** `notify()` de `this.getData()` geçsin.

## - [x] O20 — Dar pencerede saha sınırı ters dönüyor

Dosya: `games/vol-hell/src/runtime/entity/Border.ts:25-37`

```ts
private computeBounds(width: number, height: number): BorderBounds {
  const margin = borderConfig.margin;   // 60
  return { left: margin, right: width - margin, ... };   // guard yok
}
```

Pencere genişliği 120 px'in altına inerse `right < left` ve `width` negatif oluyor.
`Phaser.Math.Clamp(v, min, max)` min > max durumunda min döndürdüğü için her şey sol kenara
yapışıyor ve oyun oynanamaz hale geliyor. `strategy: 'resize'` ile pencere serbestçe
küçültülebiliyor.

**Düzeltme:** `margin`'i `Math.min(borderConfig.margin, width / 4, height / 4)` ile kelepçele.

## - [x] O21 — Satır içi `style.cssText` tasarım sistemini bypass ediyor ve CSP'yi zayıflatıyor

**AGENTS.md gerilimi** (_"Renk: yalnızca theme.css içindeki --vol-ui-_ custom property'leri
kullanılır. CSS'te çıplak hex/rgb/hsl yasak."\*)

```
games/vol-hell/src/runtime/ui/HUDStats.ts:23     container.style.cssText = `...`
games/vol-hell/src/runtime/scene/GameScene.ts:136-139, 154-157  bar konteynerleri
games/vol-hell/src/app/bootstrap.ts:40           hata ekranı
core/src/debug/Diagnostics.ts:57-70              çıplak '#0f0' ve 'rgba(0,0,0,0.75)'
```

Bedeli Tauri CSP'sinde görünüyor — `style-src`'de `'unsafe-inline'` tutulmak zorunda
(`tauri.conf.json:26`).

**Düzeltme:** Bu stilleri BEM class'larına taşı (`vol-hud-stats`, `vol-hud__bar-slot`,
`vol-fatal-error`, `vol-diagnostics-panel`); sonra `style-src`'den `'unsafe-inline'`
kaldırılabilir.

## - [x] O22 — Dev CSP'de joker host websocket izni, production CSP'de eksik direktifler

Dosyalar: `tauri-v2/src-tauri/tauri.dev.conf.json`, `tauri.conf.json:22-33`

```json
"connect-src": "'self' ipc: http://ipc.localhost ws://*:1421"
```

`ws://*:1421` — 1421 portunda **herhangi bir host**'a websocket izni. Bu port yalnızca
`TAURI_DEV_HOST` ayarlıyken (mobil dev) kullanılıyor
(`games/vol-hell/vite.config.ts:hmr`), yani joker gereksiz.

Production CSP'de `base-uri`, `form-action` ve `frame-ancestors` direktifleri hiç tanımlı
değil.

**Düzeltme:** `ws://localhost:1421` + gerekiyorsa açık LAN adresi. Production CSP'ye
`"base-uri": "'self'"`, `"form-action": "'none'"`, `"frame-ancestors": "'none'"` ekle.

---

# DÜŞÜK

Ölü kod, test tiyatrosu, doküman ve kozmetik.

## - [x] D1 — Ölü config anahtarları: beşi hiç okunmuyor

```
games/vol-hell/src/config/player.ts:18   invulnerabilityMs: 500
    -> yorumu bile "şu an kullanılmıyor, dash i-frame ayrı yönetilir" diyor
games/vol-hell/src/config/enemy.ts:52    healthBarFillAlpha: 1
    -> Enemy.ts:70 alpha'yı literal 1 olarak yazıyor
games/vol-hell/src/config/ui.ts:6        toastDurationMs: 3000
    -> hiçbir yerde okunmuyor
games/vol-hell/src/config/ui.ts:4        hudPadding: 16
    -> yalnızca tests/config/config.test.ts:61
games/vol-hell/src/config/physics.ts:4   gravity: { x: 0, y: 0 }
    -> yalnızca tests/config/config.test.ts:35; Phaser physics hiç kurulmuyor
```

**Düzeltme:** Beşini de sil (D2'deki testlerle birlikte).

## - [x] D2 — `config.test.ts`: 17 tautoloji testi

Dosya: `games/vol-hell/tests/config/config.test.ts`

```ts
it('moveSpeed pozitif', () => expect(playerConfig.moveSpeed).toBeGreaterThan(0));
it('maxHealth pozitif', () => expect(playerConfig.maxHealth).toBeGreaterThan(0));
it('gravity sıfır (top-down)', () => expect(physicsConfig.gravity.x).toBe(0));
it('hudPadding pozitif', () => expect(uiConfig.hudPadding).toBeGreaterThan(0));
```

Sabitlerin sabit olduğunu doğruluyorlar. Davranışsal değeri yok ve D1'deki ölü anahtarların
silinmesini de engelliyorlar.

Değerli azınlık korunmalı — bunlar gerçek invaryant ifade ediyor:

```ts
it('dashSpeed > moveSpeed (dash daha hızlı)', ...)
it('dashDurationMs < dashChargeMs', ...)
```

**Düzeltme:** İlişki testlerini tut, değer testlerini sil.

## - [x] D3 — Hiçbir pakette coverage yapılandırması yok

Dosyalar: `core/vitest.config.ts`, `games/vol-hell/vitest.config.ts`,
`games/vol-ui/vitest.config.ts`, `tauri-v2/vitest.config.ts`

Dördünde de coverage provider'ı veya eşiği yok. "700 test geçti" cümlesinin arkasında
ölçülebilir bir kapsam yok — nitekim K1 ve Y16 bu yüzden görünmüyor.

**Düzeltme:** `test.coverage: { provider: 'v8', thresholds: { ... } }` ekle ve CI'da (Y12)
raporla.

## - [x] D4 — Ölü export: `soundLoadList`

Dosya: `games/vol-hell/src/config/sounds.ts:54-60`

`Object.entries().flatMap()` ile ön yükleme listesi üretiliyor, hiçbir yerde tüketilmiyor.
`GameAudio` doğrudan `soundAssets` kullanıyor. Muhtemelen Phaser loader tabanlı eski bir
tasarımdan kalma.

## - [x] D5 — Ölü ses dosyası: `confirm-0.wav`

Dosyalar: `games/vol-hell/src/config/sounds.ts` (`confirm` anahtarı),
`public/assets/audio/sfx/ui/confirm-0.wav`

`playSfx('confirm')` hiçbir yerde çağrılmıyor. Ayrıca `loadAllSfx()` her açılışta bu dosyayı
boşuna indirip decode ediyor.

**Düzeltme:** Ya bir onay etkileşimine bağla (`showConfirm` akışı doğal aday), ya sil.

## - [x] D6 — `MainMenuScene` kullanılmayan bir `ToastManager` kurup yok ediyor

Dosya: `games/vol-hell/src/runtime/scene/MainMenuScene.ts:13, 41, 160`

```ts
private toasts!: ToastManager;               // :13
this.toasts = new ToastManager(container);   // :41  DOM'a konteyner ekliyor
this.toasts.destroy();                       // :160
```

Arada tek bir `show()` çağrısı yok.

## - [x] D7 — Yalnızca testlerin kullandığı public API

Dosya: `games/vol-hell/src/runtime/entity/Player.ts:164, 189, 208`

```
canDash()          :164  -> yalnızca tests/runtime/entity/Player.test.ts:260
getHealthRatio()   :189  -> yalnızca Player.test.ts:194, :203
getY()             :208  -> hiçbir yerde (getX()'in testte 2 kullanımı var, getY()'nin 0)
```

Üretim kodunun gerektirmediği yüzey, test için tutulan yüzeydir.

**Düzeltme:** `getY()`'yi sil; diğer ikisini ya HUD'a bağla ya sil.

## - [x] D8 — Ayarlar ekranında ambiyans ses seviyesi kontrolü yok

Dosyalar: `games/vol-hell/src/runtime/scene/SettingsScene.ts`,
`games/vol-hell/src/app/AudioSettings.ts:61-63`

`audioSettings.ambientVolume` mevcut, persist ediliyor ve `GameAudio.apply():401` tarafından
kullanılıyor — ama `SettingsScene`'de karşılık gelen slider yok (dosyada `ambientVolume` geçmiyor).
Master/SFX/Müzik var, Ambiyans eksik. Kullanıcı bu ayara hiç erişemiyor.

## - [x] D9 — Dil listesi hardcode, `i18n.getLocales()` kullanılmıyor

Dosya: `games/vol-hell/src/runtime/scene/SettingsScene.ts:55-58`

```ts
options: [
  { value: 'tr', label: 'Türkçe' },
  { value: 'en', label: 'English' },
],
```

`I18n` sınıfı `getLocales()` sağlıyor (`core/src/systems/I18n.ts:110`) ve `preloadLocales` ile
üçüncü dil eklenebiliyor; o durumda Select mevcut dili gösteremeyip boş değere düşer.

## - [x] D10 — `updateAmbientState()` kelepçelenmemiş delta alıyor

Dosya: `games/vol-hell/src/runtime/scene/GameScene.ts:227, 269`

```ts
const dt = Math.min(delta, gameConfig.maxDeltaMs);   // :227 — her şey bunu kullanıyor
...
this.updateAmbientState(delta);                      // :269 — ham delta
```

Uzun bir frame duraklamasından sonra ambiyans geçiş sayacı olması gerekenden fazla ilerliyor.

## - [x] D11 — Açılışta gereksiz seri bekleme

Dosya: `games/vol-hell/src/app/bootstrap.ts:25-26`

```ts
await audioSettings.load();
await gameStats.load();
```

Birbirinden bağımsız iki storage okuması. Tauri store'da her okuma bir IPC turu olduğu için
ölçülebilir fark.

**Düzeltme:** `await Promise.all([audioSettings.load(), gameStats.load()]);`

## - [x] D12 — `GameAudio.dispose()` hiç çağrılmıyor ve context'i kapatmıyor

Dosya: `games/vol-hell/src/app/GameAudio.ts:404-414`

Metot özenle yazılmış (unsubscribe, engine dispose, ducker dispose) ama repoda tek bir
çağıranı yok. Ayrıca `this.context.close()` içermiyor, yani çağrılsa bile AudioContext açık
kalır. Tarayıcıda eşzamanlı AudioContext sayısı sınırlı.

**Düzeltme:** `close()` ekle; `beforeunload` veya Tauri kapanış olayına bağla.

## - [x] D13 — `SfxBank` voice limiti geçici olarak aşılıyor

Dosya: `games/vol-hell/src/app/GameAudio.ts:113-123, 143`

```ts
if (limit.maxVoices > 0 && state.active.size >= limit.maxVoices) {
  const oldest = state.active.values().next().value;
  if (oldest) oldest.stop(now);      // Set'ten silinmiyor
}
...
state.active.add(source);            // :143 — hemen ekleniyor
```

Silme `onended`'e bırakılmış ve o asenkron. Set kısa süreliğine `maxVoices`'ı aşıyor. Kendini
düzeltiyor ama sayaç anlık olarak yalan söylüyor.

**Düzeltme:** `stop()` sonrası `state.active.delete(oldest)` da çağır.

## - [x] D14 — README test ve lint komutlarını hiç anmıyor

Dosyalar: `README.md`, `README.en.md`

"Komutlar" bölümü `install`, `dev`, `tauri:dev`, `build:game`, `build:tauri`, `typecheck`
listeliyor. `pnpm test`, `pnpm lint`, `pnpm lint:css`, `pnpm format` yok. Repoya yeni gelen
biri kalite kapılarının varlığını öğrenemiyor — Y12/Y15 ile aynı çürümenin parçası.

## - [x] D15 — Ürün kimliği üç yerde üç farklı

Dosyalar: `tauri-v2/src-tauri/tauri.conf.json:2, 15`,
`games/vol-hell/src/config/game.ts`

```
productName    "VOL.STUDIO Game"
pencere başlığı "VOL.STUDIO Game"
gameConfig.title "VOL.HELL"        -> bootstrap.ts:28 document.title'ı bununla değiştiriyor
```

Kurulum dosyası ve görev çubuğu "VOL.STUDIO Game", oyunun kendisi "VOL.HELL" diyor.

## - [x] D16 — `tauri-plugin-log` seviye filtresi yok

Dosya: `tauri-v2/src-tauri/src/lib.rs:13`

```rust
.plugin(tauri_plugin_log::Builder::new().build())
```

`level()` veya `targets()` ayarı yok — release build'de de tüm log seviyeleri yazılıyor.

## - [x] D17 — Tutarsız null kontrolü: `this.input.keyboard!`

Dosya: `games/vol-hell/src/runtime/scene/GameScene.ts:200`

```ts
this.escKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
```

`PCController` (`core/src/input/PCController.ts:28-30`) aynı durumda düzgün bir
`Error('Keyboard plugin etkin değil')` atıyor. Burada non-null assertion var — klavye
eklentisi kapalıysa anlamsız bir TypeError. AGENTS.md `any`'yi yasaklıyor; aynı gerekçe `!`
için de geçerli.

## - [x] D18 — `MainMenuScene`'de güvensiz tip cast'i

Dosya: `games/vol-hell/src/runtime/scene/MainMenuScene.ts:46`

```ts
const menuTrackId = currentMusic.trackId as (typeof menuTrackKeys)[number] | undefined;
```

Düz bir `string`, doğrulama olmadan literal union'a cast ediliyor. ESLint bunu zaten
`no-unnecessary-type-assertion` ile işaretliyor (Y13, `:50:24`).

**Düzeltme:** `includes()` tabanlı bir type guard yaz, cast'i sil.

## - [x] D19 — Showcase, oyunun 14 katı çeviri anahtarı taşıyor

```
core/src/i18n/            50 anahtar   (tr/en parite tam)
games/vol-hell/src/i18n/  42 anahtar   (tr/en parite tam)
games/vol-ui/src/i18n/   613 anahtar   (tr/en parite tam)
```

Parite hatasız — bu iyi. Ama bir demo uygulamasının iki dilde 1226 satır çeviri taşıması ciddi
bakım yükü. Showcase metinleri için tek dil yeterli olabilir.

## - [x] D20 — `renderConnections()` gereksiz O(n²) arama yapıyor

Dosya: `core/src/ui/hud/SkillTree.ts:384-387`

```ts
const from = this.nodes.find((n) => n.id === reqId); // :384
const fromPos = this.layout.get(reqId);
const toPos = this.layout.get(node.id);
if (!from || !fromPos || !toPos) continue; // `from` sadece burada kullanılıyor
```

`fromPos` kontrolü zaten aynı işi yapıyor. Her bağlantı için tüm düğüm listesi taranıyor.

**Düzeltme:** `:384` satırını ve `!from ||` kontrolünü sil.

## - [x] D21 — Ölü CSS geçişi: `.vol-skill-tree__node`

Dosya: `core/src/ui/hud.css:190-196`

```css
transition:
  background-color var(--vol-transition-fast),
  ... left 0.3s ease,
  top 0.3s ease,
  width 0.3s ease;
```

Yerleşim yalnızca constructor'da, element DOM'a eklenmeden önce bir kez hesaplanıyor (O18) —
geçiş yapacak bir değişiklik hiç olmuyor. O18 düzeltilirse anlamlı hale gelir.

## - [x] D22 — Diagnostics duraklamada sayaçları siliyor

Dosyalar: `games/vol-hell/src/runtime/scene/GameScene.ts:220-225`,
`core/src/debug/Diagnostics.ts:126`

```ts
// GameScene.update()
this.diagnostics?.beginFrame();
if (this.isPaused) {
  this.diagnostics?.endFrame();
  return;
}
```

`beginFrame()` ilk işi `this.counts.clear()` (`Diagnostics.ts:126`). Duraklatma anında
overlay'deki tüm sayaçlar (düşman, mermi, partikül) kayboluyor — tam da incelemek isteyeceğin
an.

**Düzeltme:** Duraklamada `beginFrame()`/`endFrame()` çağırma, ya da `counts.clear()`'ı
`beginFrame()`'den çıkar.

## - [x] D23 — Loading ekranı `document.body`'ye, geri kalan her şey `UIRoot`'a mount ediliyor

Dosya: `games/vol-hell/src/runtime/scene/LoadingTransition.ts:32`

```ts
document.body.appendChild(this.loadingScreen.element);
```

Repo'daki diğer tüm UI `UIRoot` içine giriyor — `GameScene:175` ve `:188` yorumlarında
gerekçesi bile yazılı: _"UIRoot içine mount et, böylece box-sizing ve temel UI stilleri
uygulanır."_ Loading ekranı bu kuralın dışında.

Ayrıca element `hide()` edildikten sonra (`GameScene:210`) tüm oyun oturumu boyunca DOM'da
kalıyor; ancak `GameScene` kapanınca yok ediliyor (`:514-517`).

## - [x] D24 — `animateValue()` iki farklı zaman tabanını karıştırıyor

Dosya: `core/src/ui/animation.ts:34, 40`

```ts
const startTime = performance.now();   // :34 — zaman tabanı A
const step = (now: number): void => {  // rAF zaman damgası — zaman tabanı B
  const elapsed = now - startTime;     // :40
```

Tarayıcıda ikisi aynı time origin'i paylaştığı için sorun görünmüyor. Ama rAF zaman damgası
**kare başlangıcını** taşır; callback zaten kuyruğa girmiş bir kareye denk gelirse `elapsed`
küçük bir negatif değer olur, `t` negatife düşer ve `easeOutCubic(t) = 1 - (1-t)^3` ilk karede
hedefin tersine taşar.

K3 düzeltilirken keşfedildi: jsdom'da iki zaman tabanı farklı origin taşıdığı için fark
büyüyor ve `elapsed` yaklaşık -1970 ms çıkıyor, `t` -98'e düşüyor, üretilen değer
`-49.299.870` oluyor. Bu yüzden `core/tests/ui/animation.test.ts` hedefe ulaşmayı
doğrulayamıyor, yalnızca kare üretimini sınıyor.

**Düzeltme:** Başlangıcı ilk karede rAF'ın kendi damgasından al (`startTime ??= now`) ve `t`'yi
`[0,1]` aralığına kelepçele. Bu değişiklik animasyonu bir kare kaydırdığı için
`core/tests/ui/feedback.test.ts`'teki dört TimerBar testinin beklentileri de güncellenmeli —
kritik düzeltme kapsamı dışında tutuldu.

---

# SES / MÜZİK MOTORU DENETİMİ

Ayrı bir tam denetim: `core/src/audio/**` (synth + music), `core/src/audio/sidechain.ts`,
`games/vol-hell/src/app/GameAudio.ts` ve üretim script'leri — ~8.000 satır.

**38 bulgu — hepsi çözüldü.** Aşağıdaki 10 kalem repo içinde ölçülerek doğrulandı (geçici bir vitest probe
dosyasıyla; dosya sonra silindi). Ölçüm çıktıları ilgili maddede aynen yer alıyor.

> Bu denetim, oturumun başındaki düzeltmelerden SONRAKİ kod üzerinde yapıldı. Daha önce
> giderilen Y2 (crossfade ölü bekleme), Y3 (ducker zaman tabanı), Y11 (SFX dedup),
> K6/K8, D12/D13 burada tekrar sayılmadı.

## Genel değerlendirme

Mimari ayrım temiz: `synth` (offline üretim) ile `music` (runtime çalma) doğru şekilde
ayrılmış, WAV'lar build-time üretilip runtime'da yalnızca çalınıyor — doğru karar.
Freeverb/PolyBLEP/Kellet pink noise gibi bilinen algoritmalar seçilmiş, bu bilinçli bir
tasarım. **Ama DSP matematiğinde temel hatalar var**: osilatör fazı yanlış hesaplanıyor,
anti-aliasing filtresi yanlışlıkla rezonanslı, limiter monoton değil, birkaç efekt
[-1,1] aralığının dışına taşıyor. Bunlar "çalışıyor gibi görünen ama yanlış ses üreten"
sınıfından hatalar.

## Ses denetimi — tamamlandı

Çözülen 19 kalemin her biri düzeltmeden ÖNCE ve SONRA ölçüldü:

| Bulgu                                     | Önce                           | Sonra                                       |
| ----------------------------------------- | ------------------------------ | ------------------------------------------- |
| S1 slide (200→400 Hz, nota sonu)          | 580 Hz                         | **390 Hz** (doğru)                          |
| S1 vibrato sapması (baş / son)            | 280 / 820 Hz                   | **40 / 40 Hz** (sabit)                      |
| S2 AA filtresi cutoff tepesi              | +23.1 dB (Q=14.35)             | **Butterworth Q 0.541/1.307**               |
| S3 `square(0.5)`                          | −2.0000                        | **0.0000** (pulse ile birebir)              |
| S5 StereoWidener width=0 (mono giriş 0.5) | 1.000 (+6 dB)                  | **0.500** (seviye korunur)                  |
| S6 limiter monotonluğu                    | hayır (0.90→0.875, 0.94→0.859) | **evet**, tavan 0.85 → **0.95**             |
| S7 foldback max çıktı                     | 3.000                          | **1.000**                                   |
| S8 `applyGlobalEffects` girdisi           | eziliyordu                     | **değişmiyor**                              |
| S14 aynı parametre + seed                 | her çalıştırmada farklı        | **birebir aynı**                            |
| S30 zarf attack/release ucu               | 0.998993 / 0.001007            | **0.999993 / 0.000007**                     |
| S4 normalize opsiyonu                     | yok (hep açık)                 | `normalize: false` → doğal seviye korunuyor |

Ek olarak S1 düzeltilirken **sawtooth PolyBLEP'inin de işaret hatası taşıdığı** görüldü
(`+=` olması gereken yerde `-=`); `square` ile birlikte düzeltildi. Artık `square`,
`pulse`'ın `pulseWidth = 0.5` özel hali — tek doğru uygulama var.

**Kapılar:** typecheck 4/4, **769 test**, lint 0, format temiz, css temiz, build ok.

### İkinci turda çözülenler (S9–S13, S15, S22, S23, S25–S29, S32–S34, S36–S38)

| Bulgu | Düzeltme                                                                               |
| ----- | -------------------------------------------------------------------------------------- |
| S9    | `mixer.mute(false)` artık ayarlanan seviyeye döner; `unmutedGain` saklanıyor           |
| S10   | Tüm gain geçişleri lineer rampa — hedefe TAM varıyor, fade-out tıkı bitti              |
| S11   | `compose()` notaları `normalize: false` ile üretiyor; normalize final mix'te bir kez   |
| S12   | Kuyruk süresi −60 dB sönümden hesaplanıyor (`estimateDelayTail`, `Reverb.tailSeconds`) |
| S13   | `writeWav` varsayılanı `targetGain: 1` — çift 0.95 kayboldu                            |
| S15   | `beatDuration = (60/bpm)·(4/payda)` — 6/8 artık doğru                                  |
| S22   | Tam sınırda `getNextBar/BeatTime` bir SONRAKİ'ni döndürüyor                            |
| S23   | Geçersiz bpm/ölçü kurulumda hata fırlatıyor                                            |
| S25   | `dispose()` buffer ve track cache'ini bırakıyor                                        |
| S26   | `MusicEngineOptions.destination` — dışarıdan rewire gerekmiyor                         |
| S27   | `play()` çalan parçada verilen `state`'i uyguluyor                                     |
| S28   | `loopStart` `loopEnd`'e kelepçeleniyor                                                 |
| S29   | `clear()` tek `channels.clear()` çağrısı                                               |
| S32   | 16-bit dönüşümde `Math.round` + deterministik TPDF dither                              |
| S33   | 24-bit ve 32/64-bit float WAV decode ediliyor (WAVE_FORMAT_EXTENSIBLE dahil)           |
| S34   | Aşağı örneklemede ön filtre — aliasing azaldı                                          |
| S36   | `StemLoader` timeout + `AbortSignal` destekliyor                                       |
| S37   | Content-type kontrolü yalnızca AÇIKÇA ses olmayanı reddediyor                          |
| S38   | Doküman gerçek API ile hizalandı                                                       |

**S38 beklediğimden büyüktü.** `music-engine.md` var olmayan iki dosya
(`procedural.ts`, `procedural-presets.ts`) ve üç metot (`playStinger()`,
`setTension()`, `setBossPhase()`) belgeliyordu — planlanmış ama hiç yazılmamış
bir API. Doküman gerçek yüzeye göre yeniden yazıldı ve neyin kaldırıldığı not
olarak bırakıldı.

### Asset'ler yeniden üretildi

```
pnpm --filter @volstudio/vol-hell generate:sounds   # 13 SFX
pnpm --filter @volstudio/vol-hell generate:music    # 6 müzik parçası
```

Determinizm doğrulandı: aynı script iki kez çalıştırıldı, `fire-0.wav` md5'i
birebir aynı çıktı (`393df1cb...`). Artık üretilen asset'ler diff'lenebilir.

**Dinleme kontrolü hâlâ yapılmadı** — dosyalar doğru üretildi ve testler geçiyor,
ama karakterlerinin beklendiği gibi olup olmadığı kulakla doğrulanmalı.

---

## KRİTİK (ses)

## - [x] S1 — Osilatör fazı `f(t)·t` ile hesaplanıyor: slide, vibrato, pitchJump ve FM'in hepsi yanlış

**ÖLÇÜLDÜ.** Dosyalar: `core/src/audio/synth/waveforms.ts:117`,
`core/src/audio/synth/engine.ts:240, 271`, `engine.ts:131, 138` (FM)

```ts
// waveforms.ts:117 — getWaveSample()
const phase = (freq * t) % 1;
```

`freq` sabit olduğunda doğru. Ama `engine.ts:271` buraya `frequencyAtTime(...)` çıktısını
geçiyor — yani **zamanla değişen** bir frekans. Zamanla değişen frekansta faz, frekansın
**integrali** olmalı: `φ(t) = ∫f(τ)dτ`. `f(t)·t` kullanmak duyulan frekansı bozar.

Lineer slide için türev: `dφ/dt = f₀ + 2(f₁-f₀)·t/D` → notanın sonunda duyulan frekans
`f₁` değil **`2f₁ - f₀`** oluyor.

Repo içinde ölçüldü (200 Hz → 400 Hz lineer slide, 1 sn, son %10'luk pencere):

```
SLIDE: beklenen ~400 Hz, olculen = 580.0 Hz
```

Vibrato'da sapma **zamanla büyüyor** (`f₀ + A·sin(ωt) + A·ωt·cos(ωt)` — ikinci terim t ile
lineer artıyor). 440 Hz, ±20 Hz vibrato, 2 saniye:

```
VIBRATO: bastaki sapma = 280.0 Hz | sondaki sapma = 820.0 Hz
```

Yani 2 saniyelik bir notada vibrato genişliği 3 katına çıkıyor. Aynı hata additive
sentezde (`engine.ts:240`) ve FM'de (`engine.ts:131, 138`) da var.

Oyun SFX'lerinin neredeyse tamamı slide/pitchJump kullanıyor — bu hata üretilen her
sweep'li sesi etkiliyor.

**Düzeltme:** Örnek döngüsünde faz biriktir (`phase += freq / sampleRate` her adımda,
`% 1`), `getWaveSampleWithPhase()` zaten faz kabul ediyor. `getWaveSample(wave, freq, t)`
imzası sabit frekans dışında kullanılmamalı — ya kaldırılmalı ya da adı
`getWaveSampleConstantFreq` olmalı.

## - [x] S2 — Anti-aliasing filtresi yanlışlıkla Q≈14 rezonanslı: cutoff'ta +23 dB tepe

**ÖLÇÜLDÜ.** Dosyalar: `core/src/audio/synth/engine.ts:330-339`,
`core/src/audio/synth/filter.ts:218`

`downsample2x()` Butterworth (Q=0.707) bir alçak geçiren istiyor ve şunu yazıyor:

```ts
createFilter({ cutoff, resonance: 0.707, poles: 2, type: 'lowpass' }, internalRate, 'lowpass');
```

Ama `createFilter` `resonance`'ı 0-1 normalize bir değer sanıp Q'ya haritalıyor:

```ts
const q = resonance > 0 ? 0.707 + resonance * 19.293 : 0.707; // filter.ts:218
```

`resonance: 0.707` → **Q = 14.35**. `0.707` Butterworth Q değeri olarak yazılmış ama
normalize rezonans olarak yorumlanmış — klasik birim karışıklığı.

```
DOWNSAMPLE FILTRE Q = 14.35 (Butterworth olmali: 0.707)
CUTOFF TEPESI = 23.1 dB (Butterworth: -3 dB)
```

İki tane kaskad Q=14.35 filtre, 19.845 kHz'de **+23 dB rezonans tepesi** yaratıyor.
Aliasing'i temizlemesi gereken filtre, spektrumun tepesine devasa bir tepe ekliyor —
üretilen HER sesi etkiliyor.

**Düzeltme:** `downsample2x` içinde `resonance` yerine doğrudan Q veren bir yol kullan
(ör. `createFilter`'a `q` parametresi ekle), veya `resonance: 0` geç (0 → Q=0.707).

## - [x] S3 — `square` PolyBLEP'inde işaret hatası ve eksik kapsama: çıktı ±2'ye taşıyor

**ÖLÇÜLDÜ.** Dosya: `core/src/audio/synth/waveforms.ts:80-91`

```ts
case 'square': {
  let sample = phase < 0.5 ? 1 : -1;
  if (phaseInc > 0) {
    if (Math.abs(phase - 0.5) < phaseInc || phase < phaseInc) {
      const blep = polyblep(phase, phaseInc);
      const blepHalf = polyblep((phase - 0.5 + 1) % 1, phaseInc);
      sample += blep + blepHalf;      // <-- iki hata birden
    }
  }
  return sample;
}
```

**Hata 1 — işaret:** 0'da yükselen kenar (+2 sıçrama, BLEP eklenmeli), 0.5'te düşen kenar
(-2 sıçrama, BLEP **çıkarılmalı**). Kod ikisini de ekliyor.
**Hata 2 — kapsama:** `phase > 1 - phaseInc` bölgesi guard'a girmiyor, oysa `polyblep()`
o bölgeyi de düzeltiyor.

Hemen altındaki `pulse` dalgası aynı işi **doğru** yapıyor (`blep0 - blepPw`) — ve
`pulseWidth = 0.5` iken pulse matematiksel olarak square'in aynısı. Ölçüm:

```
square(0.995) = -1.0000 | pulse(0.995, pw=0.5) = -0.7500     <- duzeltme uygulanmamis
square(0.5)   = -2.0000 | pulse(0.5)           =  0.0000     <- cikti [-1,1] disinda
```

`square(0.5) = -2.0` — dalga şekli genlik sınırının iki katına taşıyor.

**Düzeltme:** `square`'i sil, `pulse`'a `pulseWidth = 0.5` ile delege et. Tek bir doğru
uygulama kalsın.

## - [x] S4 — Her ses tepe-normalize ediliyor: mix'te dinamik aralık diye bir şey kalmıyor

**ÖLÇÜLDÜ.** Dosya: `core/src/audio/synth/engine.ts:616-629`

```ts
const scale = (0.95 * gain) / peak; // her sesi 0.95'e cikarir
```

`applyGlobalEffects` üretilen her buffer'ı tepe değerine göre 0.95'e ölçekliyor. Sonuç:
fısıltı gibi bir UI blip'i ile patlama sesi **aynı tepe seviyesinde** çıkıyor. Sesin doğal
yüksekliği kayboluyor; `gain` parametresi göreli seviye kontrolü olmaktan çıkıp yalnızca
son ölçek çarpanına dönüşüyor.

```
NORMALIZE: 1 sesli tepe = 0.9500
           2 sesli tepe = 0.9500      <- iki osilator eklendi, seviye ayni
```

Ayrıca tepe (peak) normalizasyonu kullanılıyor, RMS/LUFS değil: tek bir transient sivri
uç tüm sesin gövdesini aşağı bastırıyor.

Bu, oyunun mix dengesini tamamen `sfxVolumes` tablosuna yüklüyor — ses tasarımının
kendisi hiçbir şey ifade etmiyor.

**Düzeltme:** Normalizasyonu opsiyonel yap (`normalize?: boolean`, varsayılan false) ve
yalnızca clipping'i önleyecek bir limiter uygula. Presetlerin doğal seviyeleri korunmalı.

---

## YÜKSEK (ses)

## - [x] S5 — `StereoWidener` kazancı bozuk: width=0'da +6 dB, width=2'de mono kaynak sessiz

**ÖLÇÜLDÜ.** Dosya: `core/src/audio/synth/effects.ts:480-486`

```ts
const midAmp = 2 * (1 - this.width * 0.5);
const sideAmp = 2 * (this.width * 0.5);
```

Mono bir kaynak (L=R=0.5) için ölçüm:

```
width=0   -> L=1.000 R=1.000     <- +6 dB (mono'ya toplarken seviye iki katina cikiyor)
width=0.5 -> L=0.750 R=0.750
width=1   -> L=0.500 R=0.500     <- dogru (notr gecis)
width=1.5 -> L=0.250 R=0.250
width=2   -> L=0.000 R=0.000     <- mono kaynak TAMAMEN kayboluyor
```

Yalnızca `width=1` doğru. `width=0` sesi 2× yükseltiyor, `width=2` mono içeriği tamamen
siliyor (side sinyali yok çünkü kaynak mono).

**Düzeltme:** `midAmp = 1 - width * 0.5`, `sideAmp = width * 0.5` (2× çarpanı kaldır) veya
mid/side dönüşümünü `mid = (L+R)/2, side = (L-R)/2` → `L = mid + side*w, R = mid - side*w`
şeklinde sadeleştir.

## - [x] S6 — `limitBuffer` monoton değil: yüksek girdi daha sessiz çıktı veriyor

**ÖLÇÜLDÜ.** Dosya: `core/src/audio/synth/engine.ts:651-668`

```ts
const over = abs - (threshold - knee);
const ratio = over > knee ? 0 : 1 - over / knee;
const limited = threshold - knee + over * ratio;
```

`over * (1 - over/knee)` bir **parabol** — `over = knee/2`'de tepe yapıp geri iniyor.
Transfer eğrisi ölçümü:

```
LIMITER:
   0.85 -> 0.8500
   0.88 -> 0.8710
   0.90 -> 0.8750     <- tepe
   0.92 -> 0.8710
   0.94 -> 0.8590     <- girdi artti, cikti DUSTU
   0.95 -> 0.8500
   1.00 -> 0.8500
  monoton = false
```

Bu bir limiter değil, **fold-back distortion**. Ayrıca `threshold = 0.95` verilse bile
tavan `threshold - knee = 0.85`'te kalıyor — parametre söylediğini yapmıyor.

İyi haber: fonksiyon hiçbir yerden çağrılmıyor (`index.ts`'ten export ediliyor, kullanan
yok). Yani bugün sessizce yanlış ses üretmiyor — ama bozuk bir API public yüzeyde duruyor.

**Düzeltme:** Ya sil, ya doğru bir soft-knee ile değiştir:
`over < knee` bölgesinde `y = t - knee + over²/(4·knee)` gibi monoton bir eğri kullan.

## - [x] S7 — `foldback` distortion tek kez katlıyor: çıktı ±3'e taşıyor

**ÖLÇÜLDÜ.** Dosya: `core/src/audio/synth/effects.ts:446-455`

```ts
if (driven > threshold) shaped = threshold - (driven - threshold);
```

`driven = 5` için `shaped = 1 - 4 = -3`. Gerçek foldback distortion sinyal aralığa girene
kadar **tekrar tekrar** katlar. Ölçüm (amount=1 → driven = input × 5):

```
FOLDBACK max |cikti| = 3.000 (beklenen <= 1)
```

Aralık dışı çıktı S4'teki normalize adımıyla birleşince tüm sesi aşağı bastırıyor.

**Düzeltme:** `while` ile aralığa girene kadar katla, veya üçgen dalga eşlemesi kullan:
`shaped = 4*(x/4 - Math.floor(x/4 + 0.5))` gibi kapalı formda.

## - [x] S8 — `applyGlobalEffects` girdi buffer'ını mutasyona uğratıyor

**ÖLÇÜLDÜ.** Dosya: `core/src/audio/synth/engine.ts:537`

```ts
const effected = dryBuffer; // kopya degil — ayni referans
```

Tüm efekt zinciri (`delay`, `flanger`, `phaser`, `chorus`) ve normalize adımı bu diziyi
**yerinde** değiştiriyor. Fonksiyon `export` edildiği için dışarıdan bir buffer verildiğinde
çağıranın verisi sessizce yok ediliyor:

```
MUTASYON: once  = [0.1, 0.2, 0.3, 0.4]
          sonra = [0.2375, 0.475, 0.7125, 0.95]
```

Bu, oturumun başında düzelttiğim **K1 (`PlayerController.move`) ile aynı sınıf hata** —
argümanı sessizce ezmek.

**Düzeltme:** `const effected = dryBuffer.slice();` (veya sözleşmeyi `@param` ile açıkça
"bu buffer tüketilir" diye belgele ve adı `applyGlobalEffectsInPlace` yap).

## - [x] S9 — `MusicMixer.mute(false)` master seviyeyi 1.0'a çekiyor, ayarlanan değere değil

Dosya: `core/src/audio/music/mixer.ts:111-113`

```ts
mute(muted: boolean, fadeTime = 0.05): void {
  this.setMasterGain(muted ? 0 : 1, fadeTime);   // <-- 1, masterVolume degil
}
```

Kullanıcı müziği %30'a çekip sonra sustur/aç yaparsa ses **%100**'e fırlıyor.
`MusicEngine.mute()` bu metodu kullanmıyor (kendi `masterVolume`'ünü doğru uyguluyor), ama
`MusicMixer` public bir sınıf ve `mute()` public bir API.

**Düzeltme:** Mixer'a `unmutedGain` alanı ekle, `setMasterGain` onu güncellesin, `mute(false)`
o değere dönsün.

## - [x] S10 — Fade-out `setTargetAtTime` ile yapılıyor: gain asla 0'a ulaşmıyor, `stop()` tık sesi bırakıyor

Dosyalar: `core/src/audio/music/mixer.ts:94`, `core/src/audio/music/engine.ts:126-133`

```ts
channel.gain.gain.setTargetAtTime(clamped, now, fadeTime / 3);   // ustel — hedefe asla varmaz
...
active.source.stop(stopTime);                                     // stopTime = now + fadeOut
```

`setTargetAtTime` üstel yaklaşır: `fadeTime` sonunda hedefin %95'ine gelinir, yani gain
**%5'te** kesiliyor (-26 dB). Kaynak o anda `stop()` ile aniden kesildiği için duyulabilir
bir tık kalıyor.

**Düzeltme:** Fade-out'u `cancelScheduledValues` + `setValueAtTime(current)` +
`linearRampToValueAtTime(0, stopTime)` ile yap — rampa hedefe **tam** varır.

## - [x] S11 — Sequencer her notayı ayrı ayrı normalize ediyor: müzikal dinamik yok oluyor

Dosya: `core/src/audio/synth/sequencer.ts:82`

```ts
const result = synth(noteDuration, noteParams); // her nota kendi icinde 0.95'e normalize
```

`compose()` her notayı `synth()` ile üretiyor, `synth()` de S4'teki normalize'ı uyguluyor.
Sonuç: bir melodideki **her nota aynı tepe seviyesinde**. Crescendo/decrescendo, vurgulu
nota, sönümlenen kuyruk — hiçbiri mümkün değil.

Üstelik `stripGlobalParams` nota parametrelerinden `gain`'i siliyor (`GLOBAL_PARAM_KEYS`),
yani nota içi seviye kontrolü de devre dışı; geriye yalnızca `note.params.gain` çarpanı
kalıyor.

**Düzeltme:** S4 ile birlikte çözülür — `synth()`'e `normalize: false` geçilebilmeli ve
`compose()` bunu kullanmalı; normalize yalnızca final mix'te bir kez uygulanmalı.

## - [x] S12 — Sequencer kuyruk süresi hesabında birim karışıklığı

Dosya: `core/src/audio/synth/sequencer.ts:55-57`

```ts
const reverbTail = baseParams.reverb?.decay ?? 0;
const delayTail = baseParams.delay ? baseParams.delay.time + (baseParams.delay.feedback ?? 0) : 0;
```

- `reverb.decay` **0-1 normalize** bir değer (`effects.ts:376`'da `feedback = decay*0.55+0.15`
  olarak kullanılıyor), saniye değil. `decay: 0.5` → 0.5 saniye kuyruk varsayılıyor;
  gerçek reverb kuyruğuyla ilgisi yok.
- `delay.time` (saniye) ile `delay.feedback` (0-1 oran) **toplanıyor**. Boyutsal olarak
  anlamsız; `0.25 + 0.3 = 0.55 saniye` gibi bir sayı üretiyor.

Sonuç: reverb/delay kuyrukları buffer bitmeden kesiliyor veya gereksiz sessizlik ekleniyor.

**Düzeltme:** Kuyruğu gerçek sönüm süresinden türet — feedback'li delay için
`time * ln(0.001)/ln(feedback)` (−60 dB'ye düşme süresi), reverb için comb feedback'inden
benzer bir hesap.

## - [x] S13 — WAV yazımında çift gain düşümü (0.95 × 0.95)

Dosya: `core/src/audio/synth/writer.ts:12, 42`

```ts
export function writeWav(filePath, result, targetGain = 0.95) { ... }
const clamped = Math.max(-1, Math.min(1, raw * targetGain));
```

`result` zaten `applyGlobalEffects` tarafından `0.95 * gain`'e normalize edilmiş durumda.
`writeWav` bunun üzerine bir 0.95 daha uyguluyor → dosyaya yazılan tepe **0.9025 × gain**.
Yaklaşık 0.9 dB'lik istenmeyen kayıp ve aynı "0.95" sabiti iki farklı anlamda iki yerde.

**Düzeltme:** `writeWav`'ın varsayılanını `1.0` yap; headroom kararı tek yerde (normalize)
kalsın.

## - [x] S14 — Gürültü seed'siz: SFX üretimi tekrarlanabilir değil

Dosya: `core/src/audio/synth/noise.ts:13, 32, 55`

Üç gürültü kaynağı da `Math.random()` kullanıyor. `pnpm generate:sounds` her çalıştırıldığında
**farklı WAV dosyaları** üretiyor. Bu bir build-time asset pipeline'ı için ciddi bir sorun:

- Üretilen asset'ler diff'lenemiyor, "değişti mi?" sorusu yanıtlanamıyor.
- Bir sesi yeniden üretmek onu değiştiriyor; git geçmişi gürültüyle doluyor.
- Bir hata raporunu tekrar üretmek imkânsız.

**Düzeltme:** Seed'lenebilir bir PRNG (mulberry32/xorshift) ekle, `SynthParams.seed`
parametresi tanımla, script'ler sabit seed geçsin.

---

## ORTA (ses)

## - [x] S15 — `timeSignature` paydası tamamen yok sayılıyor

Dosya: `core/src/audio/music/scheduler.ts:12-13`

```ts
this.beatDuration = 60 / bpm; // her zaman dortluk nota varsayimi
this.barDuration = this.beatDuration * timeSignature[0];
```

`timeSignature[1]` (payda) hiç okunmuyor. `[6, 8]` verildiğinde bar süresi 6 dörtlük nota
kadar hesaplanıyor — olması gerekenin iki katı. Tip imzası desteklemediği bir özelliği
vaat ediyor.

**Düzeltme:** `beatDuration = (60 / bpm) * (4 / timeSignature[1])`.

## - [x] S16 — `Cascade4Filter` erişilemez ölü kod

Dosyalar: `core/src/audio/synth/filter.ts:120`, `types.ts:52`, `index.ts:18`

Sınıf tanımlı ve export ediliyor ama **hiçbir yerden örneklenmiyor**. `createFilter` yalnızca
`poles === 2` için biquad döndürüyor; 4-kutuplu dal hiç yok. Üstelik `FilterParams.poles`
tipi `1 | 2` — yani 4 kutup talep etmek tip düzeyinde bile imkânsız.

Ayrıca ikinci stage `q * 0.6` kullanıyor; gerçek 4-kutuplu Butterworth için Q değerleri
0.541 ve 1.307 olmalı.

**Düzeltme:** Ya sil, ya `poles: 4`'ü tipe ekleyip `createFilter`'da bağla ve Q değerlerini
düzelt.

## - [x] S17 — `createFilter` içinde iç içe aynı koşul

Dosya: `core/src/audio/synth/filter.ts:216-222`

```ts
if (poles === 2) {
  const q = ...;
  if (poles === 2) {          // <-- ayni kosul, ic ice
    return new BiquadFilter(sampleRate, filterType, q);
  }
}
```

İç `if` her zaman doğru. Muhtemelen `poles === 4` dalı için yer açılmış, sonra unutulmuş
(S16 ile ilişkili).

## - [x] S18 — `Reverb.roomSize` açıkça `decay` verildiğinde hiçbir etkisi yok

Dosya: `core/src/audio/synth/effects.ts:373-376`

```ts
const roomSize = Math.max(0, Math.min(1, params.roomSize ?? 0.5));
const decay = params.decay ?? 0.5 + roomSize * 0.5;
```

`roomSize` yalnızca `decay`'in **varsayılanını** üretmek için kullanılıyor. `decay` açıkça
verilirse `roomSize` tamamen ölü. Gerçek Freeverb'de roomSize comb feedback'ini ölçekler.
Parametre adı yaptığı işi anlatmıyor.

## - [x] S19 — `TRIANGLE_TABLE` modül yüklenirken 819.200 `Math.sin()` çağrısı yapıyor

Dosya: `core/src/audio/synth/waveforms.ts:14-23`

```ts
for (let i = 0; i < 4096; i++) {
  for (let n = 1; n <= 200; n += 2) { s += Math.sin(...); }   // 4096 x 100 = 819.200
}
```

Modül import edilir edilmez, triangle dalgası hiç kullanılmasa bile çalışıyor. Tarayıcıda
oyun açılışına doğrudan gecikme ekliyor.

Ayrıca yorumdaki **"aliasing yok" iddiası yanlış**: sabit 200 harmonikli bir tablo yalnızca
tabloya göre bant sınırlı; yüksek f0'da 200. harmonik yine katlanıyor.

**Düzeltme:** Tabloyu tembel (lazy) üret — ilk triangle isteğinde. Yorumu da gerçeğe çek.

## - [x] S20 — `BiquadFilter` modüle edilen cutoff'ta her örnek katsayı yeniden hesaplıyor

Dosya: `core/src/audio/synth/filter.ts:89-93`

```ts
if (cutoff !== this.lastCutoff) this.computeCoeffs(cutoff); // sin/cos + 5 bolme
```

Filtre zarfı veya LFO cutoff'u sürekli değiştirdiğinde cache **hiç tutmuyor**; her örnekte
tam trigonometrik hesap yapılıyor. Dahası, durum değişkenleri (`x1,x2,y1,y2`) korunurken
katsayıları anlık değiştirmek yüksek Q'da zipper gürültüsü ve kararsızlık üretir.

**Düzeltme:** Katsayıları blok bazlı (ör. 32 örnek) güncelle veya hedef katsayılara doğru
yumuşat.

## - [x] S21 — Kullanılmayan `sampleRate` alanları

Dosyalar: `effects.ts` — `Chorus:69`, `Flanger:121`, `Reverb:362`

Üç sınıf da `this.sampleRate`'i constructor'da atıyor ve **bir daha hiç okumuyor**.

## - [x] S22 — `getNextBarTime` / `getNextBeatTime` tam sınırda "sonraki"yi değil "şu anki"ni döndürüyor

Dosya: `core/src/audio/music/scheduler.ts:38-50`

`currentTime` tam bir bar/beat sınırındayken `Math.ceil` aynı barı döndürüyor, yani dönen
değer `currentTime`'ın kendisi oluyor. Doküman "verilen andan **sonraki** ilk vuruş" diyor.
Bar sınırında crossfade planlarken sıfır gecikmeli geçişe yol açar.

## - [x] S23 — `bpm = 0` doğrulanmıyor: `beatDuration = Infinity`

Dosya: `core/src/audio/music/scheduler.ts:12`

`MusicScheduler` bpm'i doğrulamıyor. `bpm: 0` → `beatDuration = Infinity` → tüm bar/beat
hesapları `NaN`/`Infinity`. `MusicTrack.bpm` zorunlu alan ama sınır kontrolü yok.

## - [x] S24 — Slide/vibrato yukarı yönde Nyquist'e karşı korunmuyor

Dosya: `core/src/audio/synth/engine.ts:191`

```ts
return Math.max(1, baseFreq); // yalnizca ALT sinir var
```

Yukarı doğru bir slide veya derin vibrato frekansı Nyquist'in üzerine çıkarabiliyor; S1'deki
faz hatası bunu ~2× daha da kötüleştiriyor. 2× oversampling bir miktar pay bırakıyor ama
garanti yok.

**Düzeltme:** `Math.min(sampleRate * 0.45, ...)` üst kelepçesi ekle.

## - [x] S25 — `MusicEngine.dispose()` buffer ve track cache'ini bırakmıyor

Dosya: `core/src/audio/music/engine.ts:236-254`

`dispose()` kaynakları durduruyor ve mixer'ı temizliyor ama `this.buffers` (decode edilmiş
`AudioBuffer`'lar — parça başına megabaytlar) ve `this.tracks` map'leri dolu kalıyor.

**Düzeltme:** `this.buffers.clear(); this.tracks.clear();` ekle.

## - [x] S26 — `GameAudio` motorun iç yapısını dışarıdan yeniden kabluyor

Dosya: `games/vol-hell/src/app/GameAudio.ts:253-254`

```ts
engine.mixer.output.disconnect();
engine.mixer.output.connect(destination);
```

`MusicEngine` constructor'ında kendini `context.destination`'a bağlıyor; `GameAudio` sonra
bu bağlantıyı koparıp kendi ducker zincirine yönlendiriyor. Motorun kapsüllemesini dışarıdan
delen bir çözüm.

**Düzeltme:** `MusicEngineOptions`'a `destination?: AudioNode` ekle; motor doğru yere
bağlansın.

## - [x] S27 — `play()` aynı track çalarken yeni `state` ve `fadeIn`'i sessizce yok sayıyor

Dosya: `core/src/audio/music/engine.ts:84`

```ts
if (this.isPlaying && this.currentTrackId === trackId) return;
```

`play('combat', { state: { intensity: 1 } })` çalan parça zaten 'combat' ise **hiçbir şey
yapmıyor** — yoğunluk güncellenmiyor. Çağıranın `setState()` kullanması gerektiği hiçbir
yerde yazmıyor.

**Düzeltme:** Erken dönmeden önce `options.state` verilmişse `this.setState(options.state)`
uygula.

## - [x] S28 — `startStem` `loopStart`'ı kelepçelemiyor

Dosya: `core/src/audio/music/engine.ts:265-270`

`loopEnd` buffer süresine kelepçeleniyor ama `loopStart` ham geçiliyor. `loopStart >= loopEnd`
olduğunda Web Audio spesifikasyonu loop'u tüm buffer'a düşürüyor — sessiz bir yanlış davranış.

## - [x] S29 — `MusicMixer.clear()` iterasyon sırasında Map'ten siliyor

Dosya: `core/src/audio/music/mixer.ts:117-129`

`for (const [id] of this.channels) { ... this.channels.delete(id); }` — JS'te Map için
güvenli ama gereksiz; döngü sonunda tek `this.channels.clear()` daha net.

---

## DÜŞÜK (ses)

## - [x] S30 — `exponential` zarf uçlara ulaşmıyor

**ÖLÇÜLDÜ.** Dosya: `core/src/audio/synth/envelope.ts:13` — `1 - Math.pow(10, -3 * t)`

```
ENV attack sonu  (t=0.1) = 0.998993  (beklenen 1.0)
ENV release sonu (t=0.3) = 0.001007  (beklenen 0.0)
```

−60 dB'de kesildiği için duyulmuyor, ama release sonunda tam sessizlik yok.

## - [x] S31 — `exponential` eğrisinin adı yanıltıcı

Aynı dosya. `1 - 10^(-3t)` üstel değil, **doygun (logaritmik)** bir eğri: başta hızlı, sonda
yavaş. Attack için "exponential" seçen biri tersini bekler. Ad `saturating` veya
`logarithmic` olmalı.

## - [x] S32 — 16-bit dönüşümde `Math.floor` ve dither yok

Dosya: `core/src/audio/synth/writer.ts:43`

`Math.floor` pozitif değerleri aşağı yuvarlıyor (yarım LSB sistematik sapma); `Math.round`
olmalı. Sönümlenen kuyruklarda dither yokluğu kuantizasyon bozulması bırakıyor.

## - [x] S33 — `decodeWav` yalnızca 8/16-bit PCM destekliyor

Dosya: `core/src/audio/synth/sample.ts:59-67` — 24-bit ve 32-bit float WAV'da fırlatıyor.
Hata mesajı net, ama sample layer'a dışarıdan dosya verecek biri için sınırlayıcı.

## - [x] S34 — `resampleLinear` anti-aliasing yapmıyor

Dosya: `core/src/audio/synth/sample.ts:76` — aşağı örneklerken (factor > 1) ön filtreleme
yok; katlanma (aliasing) oluşuyor. Lineer enterpolasyon yukarı örneklemede de yumuşak.

## - [x] S35 — `Phaser` tüm allpass kademelerinde aynı frekansı kullanıyor

Dosya: `core/src/audio/synth/effects.ts:227-230` — gerçek phaser'lar kademeleri kaydırır;
aynı frekans daha zayıf ve tek boyutlu bir çentik deseni verir. Ayrıca her kademe her örnekte
`Math.tan()` çağırıyor.

## - [x] S36 — `StemLoader` timeout/abort desteklemiyor

Dosya: `core/src/audio/music/loader.ts:6` — asılı kalan bir `fetch` sonsuza kadar bekliyor;
`AbortSignal` yok. Sahne kapanırken devam eden yükleme iptal edilemiyor.

## - [x] S37 — İçerik tipi sezgisi kırılgan

Dosyalar: `core/src/audio/music/loader.ts:12`, `games/vol-hell/src/app/GameAudio.ts:80`

`contentType.includes('audio') || includes('octet-stream')` — `application/x-wav` gibi geçerli
bir tip **reddediliyor**. Sunucu yapılandırmasına aşırı bağımlı bir kontrol.

## - [x] S38 — Dokümanda gerçekle uyuşmayan iddialar

Dosyalar: `core/docs/sound-synth.md`, `core/docs/music-engine.md`

En az iki iddia kodla çelişiyor:

- "aliasing yok" (`waveforms.ts` yorumu ve docs) — S1, S2, S3, S19 aksini gösteriyor.
- Anti-aliasing filtresinin Butterworth olduğu ima ediliyor — gerçekte Q=14.35 rezonanslı (S2).

Doküman düzeltmeleri S1–S3 çözüldükten sonra yapılmalı.

---

## Ses denetimi — önerilen sıra

1. **S1** (faz birikimi) — üretilen her sweep'li sesi etkiliyor, tek noktada çözülüyor.
2. **S2** (rezonanslı AA filtresi) — tek satırlık düzeltme, tüm spektrumu etkiliyor.
3. **S3** (square BLEP) — `pulse`'a delege ederek çöz.
4. **S4 + S11** (normalize) — birlikte çözülmeli; mix mimarisi kararı.
5. **S5, S7, S8** — efekt zincirindeki aralık/mutasyon hataları.
6. **S14** (seed) — asset pipeline'ı tekrarlanabilir hale getirir; S1–S4 düzeldikten SONRA
   tüm WAV'lar yeniden üretilmeli, o yüzden seed önce girmeli.
7. Kalan yüksek → orta → düşük.

**Not:** S1–S5 ve S7 düzeltildikten sonra `games/vol-hell/public/assets/audio/` altındaki
**tüm WAV'lar yeniden üretilmeli** (`pnpm --filter @volstudio/vol-hell generate:sounds` ve
`generate:music`). Mevcut asset'ler bu hatalarla üretilmiş durumda.

---

## Notlar

- Bu denetimde hiçbir kaynak dosya değiştirilmedi ve commit atılmadı.
- Doğrulanmış bulgular (K1, K2, K3) geçici bir `core/tests/__verify.test.ts` dosyasıyla
  koşturuldu; dosya sonrasında silindi.
- Pozitif bulgular: i18n anahtar paritesi üç pakette de tam, `pnpm lint:css` temiz,
  `Text` bileşeni `textContent` kullanıyor (XSS yüzeyi yok), `RadialMenu`/`Kanban` listener
  yaşam döngüsünü doğru yönetiyor, `FontManager` geç rejection'ı bilinçli yutuyor.
