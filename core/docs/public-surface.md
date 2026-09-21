# CORE public API yüzeyi — tarihçe

`core/tests/governance/publicSurface.test.ts` runtime isimlerini exact listeyle,
`scripts/quality/publicTypeSurface.mjs` ise type-only export'lar dahil TypeScript yüzeyini
kilitler. Bu belge yalnızca bilinçli genişlemelerin tarihçesidir; güncel sayıyı
ayrı bir sözleşme gibi tekrar etmez.

Her giriş bir kapı kırılmasının cevabıdır: yüzey büyüdüğünde "bu dışarıya
açılmalı mı?" sorusuna verilen gerekçe.

### 185 → 192

Android taşımasının açtığı yedi giriş. `VirtualActionSource` ekran üstü düğmelerin eylemlerini dokunmatik sağlayıcının kare durumuna katar; `observeAppVisibility`/`getAppVisibility` arka plana alınmayı tek sözleşmede toplar (ses, duraklatma ve teşhis aynı soruyu ayrı ayrı soruyordu); `isTouchPrimary`/`hasTouchInput`/`canHover`/`shouldUseTouchControls` ise "ekran üstü kontrol kurulmalı mı?" sorusunun ÖNCÜL cevabıdır — girdi katmanının reaktif `pointer.wasTouch` ayrımı ilk kareden önce karar vermeye yetmiyordu.

### 192 → 197

Dokunsal geri bildirim yüzeyi (`vibrate`, `setHapticsEnabled`, `isHapticsEnabled`, `isHapticsSupported`, `cancelHaptics`). Phaser'ın titreşim yüzeyi yok; Vibration API tek yerde anlamlandırılmış desenlere bağlanır ki aynı etkileşim her ekranda aynı hissetsin.

### 196 → 198

`FullscreenController` ve generic `StatsPanel` CORE UI sözleşmesine alındı. Her iki bileşen de oyun/devtool bağımsızdır ve showcase'te gösterilir.

### 198 → 199

`segmentCircleEntryT`, süpürülmüş çarpışmada "en yakın vuruş"u dizi sırasından bağımsız kılan geometri primitifi.

### 199 → 202

Grafik kalitesi sözleşmesi — üç ÇALIŞMA ZAMANI export'u. `GraphicsQuality` kademe kaydını jenerik tutar (CORE hangi knob'ların var olduğunu bilmez); `applyVolViewport` + `VIEWPORT_REGISTRY_KEY` ise render çözünürlüğünü dünya boyutundan ayıran viewport sözleşmesidir. Bu turda eklenen tipler (`ViewportScaleSetting`, `GraphicsQualityOptions`…) derleme zamanında silindiği için bu sayıya girmez.

### 202 → 204

`getHapticsCapability` + `observeHapticsCapability`. Titreşim artık YETENEĞE bağlı: `navigator.vibrate` yoksa bağlı bir oyun kolunun rumble motoru kullanılır ve kol takılıp çıkarıldıkça yetenek canlı bildirilir — tüketici ayarı buna göre etkinleştirir.

### 204 → 208

Eklemli uzuv alanı — dört ÇALIŞMA ZAMANI export'u. `Spring1D` (`core/src/math/Spring.ts`) hız taşıyan genel yay-damper integratörüdür; `solveTwoBoneIk` (`core/src/math/ik.ts`) iki kemikli düzlemsel ters kinematik; `RigMotionModel` sürekli hareket sinyalleri; `LegGait` ayak-sabitleyen yürüyüş döngüsüdür. Uzuv sözlüğü bilinçli olarak tüketicide kalır (bkz. `core/src/index.ts`daki not).

### 208 → 212

Bakış ve poz-türevi sunum efektleri — dört ÇALIŞMA ZAMANI export'u. `GazeDriver` (`core/src/rig/GazeDriver.ts`) sıçramalı bakışı bir yuvanın içinde tutan sürücüdür; `samplePose` bir görüntü ağacını dünya uzayına düzleştirir ve `GhostTrail`/`PoseShadow` o pozdan ikinci bir görüntü çizer (art-görüntü, gölge). Hepsi mekanizma katmanıdır: hangi parçanın gövde, hangisinin uzuv olduğunu bilmezler. Ortak sprite havuzu (`PoseSpriteSet`) bu ikisinin İÇ aracıdır ve bilinçli olarak yüzeye çıkmaz.

### 212 → 215

Iki oyunun ortak Android geri-yönlendirme yığını (`pushBackHandler`, `getBackHandlerCount`) ve varyant/bütçe taşıyan tek-atış `SoundBank`. Oyunlar yalnız olay kimliklerini ve asset'lerini tanımlar.

### 215 → 220

Rig VARLIK katmanı CORE'a alındı (+6) ve ölü `toStepVelocity` düştü (−1). Altı çalışma zamanı girişi — `validateRigMetadata`, `buildRigDefinition`, `articulateRigDefinition`, `computePartLayout`, `preloadRigTextures`, `assembleRig` — üretilmiş bir parça ağacını doğrulayıp sahnede kurar. Bunlar bir tasarım aracının API'si DEĞİL, üretilmiş verinin sözleşmesidir: bir oyunun çalışma zamanı asset'ini üreten araca bağlanmamalı — sınır PAKET değil ZAMANDIR. `toStepVelocity` ise Matter.js'e hız çeviren, repoda hiç tüketicisi olmayan bir kalıntıydı; sildiği yer (`math/physics`) gerçek bir temas/destek katmanına açık kaldı.

### 220 → 221

`clampSimulationStep`. Kare süresini simülasyona vermeden önce kelepçeleyen tek sözleşme. Alt sistemler bunu ayrı ayrı yaptığında sistem hızlanmıyor, TUTARSIZLAŞIYORDU: 500 ms'lik bir karede gövde 100 ms yol alırken yürüyüş döngüsü 500 ms ilerliyor ve ayaklar gövdenin gitmediği yere basıyordu. Tavanın kendisi `TECH.MAX_SIM_STEP_MS`tir ve `Spring1D` de artık kendi özel sabiti yerine onu okur.

### 221 → 222

`measureSupport`. Basılı ayakların dışbükey zarfını kurar ve gövdenin ona göre denge payını ölçer. Yürüyüş döngüsünün sıra disiplini "gövde her an desteklidir" güvencesini DOLAYLI olarak veriyordu ama kimse ölçemiyordu; acil adım sırayı deldiğinde güvencenin hâlâ geçerli olup olmadığı görünmüyordu. Bir fizik motoru değil, tek bir soruyu cevaplayan bir ölçüm: merkez destek alanının içinde mi?

### 222 → 223

`SimulationClock`. VOL.HELL'in içinde yaşıyordu ama hiçbir oyun kavramı bilmiyor — sıfır import, sıfır alan terimi. Yani jenerik bir zaman primitifi, ATILACAK bir test oyununun içinde duruyordu; vol-hell silindiğinde desen de gidecekti ve gerçek oyun yalnız `clampSimulationStep` ile başlardı.
İkisi aynı sorunu çözer ama farklı güçte: kelepçe fazla zamanı SESSİZCE yutar, biriktirici onu sabit adımlara böler, catch-up'ı sınırlar ve atılanı `droppedMs` olarak RAPORLAR. Daha iyi olanın framework dışında kalması, "yanlış pakette yaşayan kod" sorusunun somut cevabıydı.
Yeni yetenek DEĞİL, yer değişikliği: kod, testi ve dokümanıyla olduğu gibi taşındı; "en az iki tüketici" kuralı yeni soyutlama için geçerlidir.

### 223 → 224

`FpsMeter`. `Diagnostics` zaten FPS hesaplıyordu ama yanında kare min/max'ı, render/update sürelerini ve renderer bilgisini taşıyor; istenen ürünün üstünde sürekli durabilen TEK bir sayıydı. Ayrı bileşen olmasının koşulu ölçümü paylaşmasıydı: `time/FrameRateSampler` bu turda çıkarıldı, `Diagnostics` ona bağlandı ve kendi kayan-pencere kopyasından 58 satır silindi. İki ayrı FPS hesabının aynı anda 58 ve 60 göstermesi artık yapısal olarak mümkün değil.

`FrameRateSampler` ve `RollingWindow` yüzeye ÇIKMAZ: ikisi de `time/index.ts` barrel'ında listelenmez. Sayının bire artması bunun kanıtıdır.

### 224 → 223

`PlayerController` takma adı kaldırıldı ve `TouchButton` → `HoldButton` olarak yeniden adlandırıldı; sayı net bir azalır. İkisi de ADLANDIRMA sözleşmesinin uygulanmasıdır: CORE'un yüzeyi oyun kelimesi taşımaz ("player" bir oyun kavramıdır, hareket eden şey mekanizmadır) ve bir bileşenin adı GİRDİ CİHAZINI değil davranışını anlatır — `HoldButton` fare, kalem ve klavyeyle de aynı press/hold semantiğini verir.

Takma adın hiçbir tüketicisi yoktu; yeniden adlandırmanın bedeli public API + showcase + i18n + CSS sınıfıydı ve bir kerede ödendi.

### 223 → 227

`KeyBindingList`, `describePCBinding`, `findBindingConflicts`, `isSameBinding`. Tuş atama arayüzü ve üç yardımcı, yukarıdaki yeniden adlandırmayla aynı turda (`a38fe22`) yüzeye girdi ama kayda geçmemişti; sayının 223'ten 227'ye atlaması bundandır. Liste yakaladığı girdiyi yalnız bildirir: çakışmayı çözmez, hiçbir şey kaydetmez. Yardımcılar bir bağı ekran metnine çevirir, iki bağın aynı fiziksel girdi olup olmadığını söyler ve çakışan eylemleri listeler. Çakışmanın ne anlama geldiğine oyun karar verir; bu yüzden `findBindingConflicts` tarif katmanıdır.

### 227 → 228

`Sheet`. Sağdan açılan, başlıklı ve kendi içinde kayan çekmece. Scrim, odak,
Escape ve Android geri sözleşmesi `Modal`dan gelir. `StatsPanel` kendi başlık,
kapatma, kaydırma ve kayma CSS'ini bırakıp bunun üstüne kuruldu. Aynı turda açık
`Modal`, Escape'teki gibi Android geri hareketini de tüketip kapanır hâle geldi;
bu bir davranış değişikliğidir, yeni ad değildir.

### 228 → 229

`WorldCameraController`. Phaser sınıfına bağlanmadan dikdörtgen fiziksel dünyayı
görüntü alanına boşluk bırakmadan kaplar; delta-mode normalize tekerlek,
trackpad pan, coalesced pointer örnekleri ve mutlak başlangıçlı pinch sağlar.
Mutlak `maxZoom` dünya boyu değişse de inspection ölçeğini korur; yoksa önceki
`maxZoomFactor` davranışı sürer. Dokunma ve fare momentumu ayrı ayarlanır (fare
varsayılanı sıfırdır), aktif sürükleme sınıra yaklaşırken dirençlenir ve kamera
merkezi görünür alanı dünya sınırından çıkarmayacak biçimde kelepçelenir.

### 229 → 230

`setHapticsDriver`. Native kabuk kendi sürücüsünü CORE'un niyet tablosuna
kaydeder; mobilde UA/Vibration tahmini yerine doğrulanmış Tauri backend'i
kullanılır. Web Vibration API ve oyun kolu fallback'leri korunur.

### 230 → 232

`SettingsForm`, `SettingsRow`. Ayar ekranlarının etiket/kontrol hizasını,
intrinsic kontrol genişliğini, sağdaki switch düzenini ve dar görünümde seçici
istiflemeyi ortaklaştırır. Değer ve kalıcılık kuralları tüketicide kalır.

### 232 → 236

Dört çalışma zamanı yeteneği eklendi. `createStatefulRandom`, mevcut
`createRandom` dizisini değiştirmeden durum yakalama/geri yükleme açar.
`AutosaveCoordinator`, interval ve arka plan sinyallerini seri, son-değer-kazanır
bir kuyruğa toplar; kapanışta `flushAndDispose()` ile son yazımı bekletir.
`PersistedObservableState`, yükleme/doğrulama/clone politikasını tüketicide
bırakırken abonelik, debounce ve seri yazımı ortaklaştırır.
`showFatalStartupError`, i18n kurulumu da başarısız olabildiği açılış sınırında
metni tüketiciden alıp erişilebilir bir hata yüzeyi kurar.
