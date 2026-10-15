# VOL.STUDIO — iş listesi

Repo geneli işlerin tek kaydıdır. Karar, kanıt ve kapsam
[monorepo denetiminde](docs/monorepo-audit.md); UI alt görevleri
[UI TODO](docs/ui/TODO.md), audio ayrıntıları
[audio TODO](devtools/audio-synth/TODO.md) içindedir. Sahip görev burada
tekrar kopyalanmaz. Açık iş `[ ]`; biten iş tek satırla `## Kapatılanlar`a
taşınır. Eksik kapanış yeni görevdir.

Kullanıcı mimari, kök, belge ve gerekçeli silme/taşıma/birleştirme kararlarını
yetkilendirdi. F01–F03 sonuçları rapor §18, F04 kaynak uygulaması ve açık native kabul rapor §19, F05–F06 kaynak
uygulaması ve kalan işler rapor §20'dedir.
**F01–F03 ve F05–F06 kaynak işleri kapalı; F04/F07–F10 açıktır.**
2026-10-09'da B21–B30 kaynak kusurları ve regresyonları uygulandı.
F04.6/F05.7/F06.5/F08.7/F10.9/F10.10 Kapatılanlar'a taşındı;
UI bulguları kendi sahibinde kapalı, bütün aile matrisi açıktır.
Faz numarası bağımsız işleri gereksiz seri bekletmez; gerçek ön koşul ve
kaynak çakışması korunur. Cihaz bağlılığı kabul değildir.
Yapılmayan insan/görsel/hissiyat değerlendirmesi uydurulmaz.

## Açık

### F04 — Kalıcılık, async sahiplik ve native yaşam döngüsü

Ön koşul: F02 doğrulama zemini; UI yeniden tasarımı beklenmez. VT3/SD8/D2
servis borçları ilgili cihaz kabulüyle birlikte kalır.

- [ ] **[P1] F04.4 — Kapanış protokolü ve Steam callback sahibi.** Gerçek SDK guard/pump/drop ve ACK yarışı düzeltildi; Windows yerel turunda pencere kapatma isteği (WM_CLOSE) sonrası son değer ve temiz çıkış, yazım ortasında sert öldürme (5 tur, onaylanan her yazım kalıcı) kanıtlandı (`games/vol-test/scripts/native-store-tour.mjs`). Kapanır: fiziksel Steam popup/overlay ve text callback yaşamı + drop testi (Steam istemcisi ve cihaz gerekir, F08.6); timedOut kök nedeni/süre gerekçesi (Deck SIGTERM turu, F08.6).

### F07 — UI oyun arayüzü kimliği ve tek VOL.SHOWCASE

Ön koşul: F01/F02 ve ilgili F04 düzeltmesi. Bütün açık alt işin sahibi
[UI TODO](docs/ui/TODO.md) (2026-10-07'de yeniden yazıldı: tema çifti, malzeme, ikon, imleç ve
ses sıfırdan; kimlik önce, aileler sonra); ayrıntı burada tekrar checkbox'a çevrilmez.
Windows geliştirme/ilk native referans önce; Linux/Deck kabulü F08'dir. **F07 kapanır:** UI-13.5.

Aşağıdaki satırlar indekstir; kapanış checkbox'ı ve ölçütleri yalnız UI TODO'dadır.

**Durum (2026-10-11): F07 AÇIK** — 16 UI görevi açık. İlk üç tam `signoff` WebKit'te düştü; ardından **aynı performans değişikliği öncesi çalışma ağacında üç ardışık tam PASS** alındı (48,4 / 47,0 / 48,1 dk; [rapor §25](docs/monorepo-audit.md)). Bu, açık UI/cihaz/insan kabullerini veya sonraki kod değişikliklerini onaylamaz. Gerçek kalan iş [UI TODO "Gerçek kalan iş"](docs/ui/TODO.md) tablosundadır.

- **F07.1 — Dalga 0, zemin ve kanıt (tamam):** UI-06.1, UI-00.1–00.7; registry, iki motor, axe, ölçüm, boyut payı, browser probu.
- **F07.2 — Dalga 1, kimlik:** UI-01.6–01.9 tema çifti/malzeme/ikon/imleç, UI-02.6–02.8 yeni ses, UI-07.2–07.3 i18n/font, UI-06.2–06.4 Windows native vitrin; paralel.
- **F07.3 — Dalga 2, dikey dilim ve aileler:** UI-01.10 + UI-02.9 → UI-03 (Button) → UI-04/05/08/09/10 fan-out, UI-07.4, UI-11.1–11.2, UI-12.2–12.3.
- **F07.4 — Dalga 3, platform ve tam kabul:** UI-11.3–11.4, UI-12.1, UI-12.4, UI-13; cihaz/insan kabulleri ayrı PASS/FAIL/NOT-RUN.

B24 çift kök olayı ve B25 geç restore UI-02.8/UI-13.2'de kaynak/regresyonla kapalı;
B26 scoped mini harita teması ve B28 erişilebilir adın dil geçişi de kapalı.
UI-07/UI-08'in bütün aile/platform işleri bundan türetilmez. Kaynaklı tekrar ve kapanış rapor §4'tedir;
ayrı checkbox defteri açılmaz.

### F08 — Linux builder ve Deck kabulünü yeniden kur

Ön koşul: F02/F04/F06'nın ilgili teknik teslimi. Genel controller/Steam/
kalıcılık mekanizmaları silinmez; frozen lifecycle ile askıya alma taklit edilmez.

- [ ] **[P1] F08.1 — Linux üretim profili ve fail-closed ELF.** Windows'tan ayrı bağımlılık ağacı/builder; AppDir/steamrt4/GStreamer. B08 `readelf` yok/başarısız, okunamayan ELF, ELF içermeyen paket ve geçersiz GLIBC sınırı artık `glibc-cap.mjs` ile reddedilir (`glibcCap.test.mjs` negatifleri); GLIBC/ABI ayrıştırma ve sınır içi fixture da geçer. Kapanır: ayrı Linux builder'da üretilmiş gerçek steamrt4 AppDir'in ELF/GLIBC taraması ve GStreamer/OGG teknik probu; Linux/Deck görünür açılışı F08.3 sahibindedir.
- [ ] **[P2] F08.2 — Paylaşılabilir doğru kanıt.** B09 outcome/requestId/normalize reason ve B10 runtime ortamı korunur. Kapanır: sanitizer roundtrip success/failed/timedOut ayrımı; host/SLR4 yanlış etiketlenmez; gizli adres/seri/kullanıcı yok; schema/runId/stamp zinciri.
- [ ] **[P1] F08.3 — Host ve SLR4 gerçek açılış.** VOL.TEST Linux görünür pencere/screenshot, ayrı SLR4 kısayolu/OGG. Kapanır: VT2/VT5 ve eski D1-codec gerçek paket/commit/runtime kaydı; host kabulü SLR4 yerine sayılmaz.
- [ ] **[P1] F08.4 — Windows'tan devkit uçtan uca.** Keşif/DNS/SSH/transfer/builder açık preflight. Kapanır: eski D1-deck zinciri gerçek build→yükleme→launch→ölçüm→screenshot; mevcut shell-kapalı SSH quoting korunur.
- [ ] **[P1] F08.5 — Gamescope ve ürün yük bütçesi.** Sonda kontrol grubu, UI laboratuvarı ve VOL.TEST ayrı. Kapanır: host/SLR4 1280×800 bütün yüklerde ≥59 FPS/p95≤18 ms; sunum/CPU kök nedeni ve eşli önce/sonra profil; sıcak tek pencere tüm kabul sayılmaz.
- [ ] **[P1] F08.6 — Gerçek Steam/kayıt/uyku ve açık cihaz işleri.** Overlay/QAM/kol/metin/haptik, SD3/SD8/D0/VT-H2 ve terminate/SIGKILL. Kapanır: gerçek olay/son değer/saat/ses/uyanış; libmanette nedeni dump/tekrar veya karşıt kanıtla ayrılır; yapılmayan his/elle işlem açık kalır.

### F09 — Windows/Android ürün kabulü ve yeni oyun

Ön koşul: F04/F06 ve gerekli UI teknik yüzeyi. Bağlı tablet/Deck hazır
erişim sağlar; kurulu uygulamanın mevcut commit olması ayrıca doğrulanır.

- [ ] **[P1] F09.1 — Windows gerçek ürün.** NSIS/WebView2 kurulum/açılış/kaldırma, DPI125/150/200, klavye/kol/metin/clipboard/ekran kipi/ses/kayıt/kapanış. Kapanır: installer ve paketli native profil; B01/K4/store sonuçları gerçek örnekte; konfigürasyon testi fiziksel kabul yerine sayılmaz.
- [ ] **[P1] F09.2 — Android görünür/native profil (KISMİ; açık).** Windows toolchain'den APK, tablet Activity/ActionMode/insets/yön/arka plan dönüşü/geri/titreşim. 2026-10-11 (ikinci tur): `bccd7ac4` temiz ağacından `aarch64` debug APK üretildi (SHA-256 `dec0e1af…`); iki cihaza kuruldu ve cihazdan çekilen `base.apk`ın SHA-256'sı derlenen artifact ile **bayt bayt aynı** (sürüm commit'e bağlandı). `scripts/android/device-tour.mjs` ile kilit aşılmadan adb girdisi ve WebView kanalıyla tur koşuldu (`docs/android.md` → Cihaz turu): **Lenovo (Android 14) 11 PASS / 2 NOT-RUN / 0 FAIL, Samsung (Android 16) 13 PASS / 1 NOT-RUN / 0 FAIL.** PASS: soğuk açılış, yatay görünüm ve dokunmatik işaretçi, güvenli alan (Samsung sol 36 CSS px; HUD payı uyguluyor), geri tuşu (1. basış duraklatma paneli, 2. basış devam; süreç kapanmaz), arka plana gidip dönüş (süreç ve sayfa aynı, kareler akıyor), dört yön isteğinde yatay kilit (Activity yeniden yaratılmaz), ekran klavyesi açılışı ve metin alanının klavye üstünde kalması, Samsung'da titreşim isteği çalındı (`finished`). **Samsung'un yeni APK'daki görünür paneli artık PASS** (kilit açıkken; ekran görüntüsü incelendi). Android 16: yön kilidi hem 384dp telefonda hem yoğunluk benzetimiyle ≈640dp'de yatay kaldı; **benzetim fiziksel ≥600dp cihaz değildir.** İlk iki turun NOT-RUN'ları: Lenovo'da titreşim ayarı kapalı (`mVibrateOn=false`) ve native seçim/ActionMode sınanamadı. **2026-10-12 (üçüncü tur, Lenovo Android 14, `981ace30` temiz ağacından APK, SHA-256 `4194e810…`, kurulu = artifact): 16 PASS / 1 NOT-RUN / 0 FAIL.** Kök neden bulundu: WebView `contextmenu` varsayılanı engellenirse seçim tutamaklarını gösterir ama Kes/Kopyala/Yapıştır çubuğunu AÇMAZ; `suppressNativeMenus` ve kabuk `native_menus.js` düzenlenebilir alanda dokunma kaynaklı olayı artık engellemez (fare/tuval engelli kalır). Cihazda: uzun basış `contextmenu` üretir ve engellenmez, çubukta Kes/Kopyala/Tümünü seç/Yapıştır görünür, Kes alanın değerini siler, Yapıştır geri getirir; tur titreşim anahtarını yalnız o adımda açıp geri yazar, çalınan istek var (`finished`). Elle ölçüldü (turda yok): Gboard kayan modda alan odakta kalır ve giriş kabul edilir, görsel görünüm küçülmez; `am start --windowingMode 3/4` ile bölünmüş ekran kurulamadı (pencere boyutu değişmedi). NOT-RUN: `type=number` alanında seçim aralığı API'si yok (çubuk düğümleri seçimi kanıtlar); bölünmüş ekran; Samsung/Android 16 düzeltme sonrası yeniden tur (cihaz bağlı değildi). Uzun oturum ve insan kabulü açık. Üç tam yeşil `signoff` native cihaz kabulü yerine geçmez. Kapanır: fiziksel ≥600dp Android 16 cihazda yön iddiası ve düzeltme sonrası Samsung turu; gerçek bölünmüş ekran; uzun oturum; insan kabulü.
- [ ] **[P1] F09.3 — Oyun hissi ve uzun oturum.** VT-H3/VT-W/VT-Q/VT4/VT-H2 ve Samsung kısa dış dokunma. Kapanır: gerçek nişan/ateş eşiği/iç-dış bölge/hareket/kar-çoklu tank-atış bütçesi; ses olay/oynatma/uyanış teknik doğrulaması; insan beyanı nişan/dokunma/haptik hissi içindir, ses dinleme kabulü değildir; Samsung olmadan onun kabulü yazılmaz.
- [ ] **[P1] F09.4 — VT7 ilk ürün doğrulaması.** Yeni oyun rehberi/template üretimi. Kapanır: temiz alanda üretilen özgün kimlikli paket ilk signoff'u geçer; Cargo/lifecycle/quality/ikon/port/i18n ve devtools'suz build sözleşmesi; mevcut advisory redi atlanmaz.
- [ ] **[P2] F09.5 — 15 Ekim VOL.TEST görsel/ses turunun insan kabulü.** Örümcek bacak gölgesi, Manta yeniden çizimi, çekirdek nabzı ve yaylı duyargalar, hasar sayıları ve can izi, sıkı çevrimiçi HUD (VersusBar/RankList/ActivityFeed), batış sesi (`sink`) ve Goliath garaj oturtması ajan tarafından ekran görüntüsü ve teknik kapıyla doğrulandı; beğeni ve dinleme kabulü yapılmadı. Kapanır: kullanıcı beyanı (VT-R6 gibi kayda geçer); Samsung bu yapıda kilitli olduğu için cihaz turu NOT-RUN'dır, tekrar koşulur.
- [ ] **[P2] F09.6 — Barracuda, Leviathan ve mech kategorisinin insan kabulü.** İki yeni süzülen ve iki bacaklı üç robot (Warhound, Templar, Juggernaut) bot düellosu ve birim testleriyle dengelendi; çizim oranı, adım hissi, bacak/silah okunurluğu ve telefon garajı insan gözüyle bakılmadı. Kapanır: gerçek oyun turunda araç başına el ile onay ya da düzeltme; botlarla ölçülen denge insan oyunuyla doğrulanır. İlk kullanıcı turu (15 Ekim) duyarga katmanı, Leviathan top yeri, Barracuda pervane yuvası ve mech eklemlerini düzeltti; kalan görsel zayıflıklar (özellikle Warhound'un küçük gövdesi) aynı kapanış ölçütündedir.
- [ ] **[P2] F09.7 — Yeniden yazılan oyun seslerinin insan dinleme kabulü.** UI dışındaki 46 oyun sesi (motor devirleri, 9 silah atışı, palet/bacak/ayak/pervane/servo/kayma/atılım döngüleri, atılım/kopma/batış, top-patlama-isabet-çarpma-fren aileleri) eski teslimlere bakmadan gerçekçi, dolgun ve alçak enerjili programlarla sıfırdan sentezlendi; yalnız ölçüm (seviye, tepe, spektral bant, kenet) ve kanonik doğrulama yapıldı, gerçeklik ya da beğeni iddiası yoktur. Kapanır: kullanıcı dinleme beyanı; kabul edilmeyen ses programı düzeltilip yeniden yayımlanır.

### F10 — Güvenlik, ratchet ve koşullu bakım

Güvenlik F02'den itibaren bağımsız erken yürütülür; bu fazın son sıra numarası
release redini ertelemek için gerekçe değildir.

- [ ] **[P3] F10.2 — S7 majör geçişler.** ESLint/stylelint/jsdom/Vitest/TypeScript hedefleri gerçekten yayımlanmış destek matrisiyle tek tek. Kapanır: her geçiş ilgili paket/test/kapıyla; toplu latest ve ilgisiz mimari göç yok.
- [ ] **[P3] F10.3 — Sıkı indeks ve teknik ratchet.** CORE noUncheckedIndexedAccess varsayımları daraltılır; scaling ortak şemalı okuyucu. WebKit prob kalibrasyonu ilk örnekte −0,05 ms, mevcut retry’da +3,42 ms verdi; ölçüm hassasiyeti açık. Kapanır: A/A gürültü ve desteklenmeyen iz ayrımı tekrarlanabilir fixture/karşıt kontrolle, retry başarı diye saklanmadan; tip kapısı negatif fixture'ı; ölçülen kapsam korunur (eşik düşürme/bozuk config denetimi F11.4 ile kapandı).
- [ ] **[P3] F10.4 — A20 haptik yürütme kararı.** Mevcut scheduler/driver gecikme, eşzamanlılık ve iptal ölçülür. Kapanır: worker gerekliyse tek scheduler geçişi regresyon+önce/sonra ölçüm; gerekmiyorsa kanıtlı koruma kararı; sırf önerilmiş diye worker eklenmez.
- [ ] **[P3] F10.12 — Tauri 2.12 geçişi.** Tauri 2.11.5 → 2.12.2 (tauri-utils 2.10 → urlpattern 0.6) beş `unic-*` bakımsızlık uyarısını kaldırır; wry 0.57, tao 0.37, muda 0.20 ve webview2-com yerel katmanı değiştirir (gtk-rs 0.18 kalır, glib uyarısı sürer). Ön koşul: F09.1/F09.2 yerel temel çizgisi; karşılaştırılacak Windows/Android turu olmadan yerel katman değişimi kanıtsızdır. Kapanır: Cargo/pnpm Tauri sürüm paritesi (`tauriPlugins`), `rust` kapısı, Windows yerel ürün turu (kurulum, kapanış, kurtarma), Android ve Linux yerel kanıtı ayrı ayrı; beş `unic-*` kaydı `securityPolicy.json`dan silinir; toplu `cargo update` yok.
- [ ] **[P1] F10.13 — Kapı ölçek eşikleri ve kabul edilemez E2E maliyeti (AÇIK).** Kapı süresi etki alanıyla büyümeli, repo boyutuyla değil; yalnız `contract`, `format-check`, `coverage`, `coverage-audio` her değişiklikte repo geneli koşar. Tetikler: soğuk `high` 20 dk, CORE düzenlemesinden sonra `high` 15 dk, `coverage` 5 dk, `contract` 90 sn veya vitrin `e2e` **10 dk** aşımı. Vitrin tetiği 2026-10-11'de **21,5 dk** ile tuttu; iki farklı `vite` yük etkeni araştırıldı (rapor §22.2). İlk müdahale olarak zaman ölçen sınamalar `QUIET_SPECS` sessiz şeridine, E2E ise pre-push `high`dan `signoff`a taşındı ve `hostLoad.mjs` ön kontrolü eklendi: **yük ayrıldı, E2E hızlanmadı**. İlk başarısız koşularda vitrin E2E **22,6 / 26,3 dk**; yeni üç tam PASS dizisinde de **yaklaşık 24–26 dk**. Tam `signoff` **48,4 / 47,0 / 48,1 dk** sürdü. Bu süreler **kabul edilemez**, üç yeşil koşu yalnız mevcut doğruluğu kanıtlar. **Kapanır:** zaman dağılımını/motor ve spec maliyetini profil et, kapsam veya gerçek ölçüm kanıtını zayıflatmadan hedefe yönelik performans düzeltmesi yap, `e2e`yi 10 dk eşiğine indir ya da ölçüme dayalı açık yeni bütçe kararı al; gerçek **önce/sonra sürelerini** ve performans değişikliği sonrasında **en az üç ardışık tam yeşil `signoff`** sonucunu [kapı raporuna](docs/gates.md) kaydet. Eski **343 sn** vitrin bütçesi bayattır; maliyet yalnız push yolundan çıkarılarak çözülmüş sayılmaz. Son üç tam PASS performans değişiklikleri **öncesine** aittir, sonraki düzeltmenin kanıtı değildir.
      **İlk hedefli performans kanıtı (2026-10-11; tam kapı değil):** Chromium
      `themeMatrix.spec.ts` içindeki axe skin × yoğunluk matrisi, eski standart
      `scan` ile **5/5 PASS, 2,1 dk**; `scanCached` ile **5/5 PASS, 1,6 dk**
      ölçüldü (bu alt kümede yaklaşık **%24 süre azalması**, 0,5 dk).
      Optimizasyon axe'i sayfa başına bir kez yükler; her profil için `buttons`
      ve `forms` sekmelerinde **iki standart `scan`** ile `violations` ve
      `incomplete` sonuçlarının eşitliğini sınar. Bu, yalnızca ölçülen
      Chromium axe skin matrisi alt kümesinin karşılaştırmasıdır; toplam
      vitrin E2E'ye ya da 48 dakikalık `signoff`a **%24 kazanç**
      atfedilemez. Optimizasyondan sonra tek tam `signoff` koşuldu (`eb81a52c`, 37,7 dk, 18/18 PASS, vitrin E2E 20,5 dk; ön yük %8): **tek koşudur**, nedeni profillenmedi, 10 dk eşiği ve üç ardışık yeşil karşılanmadı;
      F10.13 **AÇIK** ([denetim §25](docs/monorepo-audit.md)).
- [ ] **[P3] F10.5 — Yeni donanım kapsamı.** OLED Deck/Steam Machine. Kapanır: ilgili donanım bulunduğunda ayrı frame/runtime profili; eldeki cihaz kabulü bu işi sahte kapatmaz, Windows devamını bloke etmez.
- [ ] **F10.6 — K3/K5 dal bakımı.** Birleştirme hedefleri ve eski yerel/uzak dalların erişilebilir işi ayrı git operasyonu olarak ele alınır. Kapanır: kayıp commit/çalışma sıfır, açık hedef ve test/snapshot kanıtı; rapor teslimi merge/branch silme yapılmış sayılmaz.

### F11 — Kapı güvencesi, kanıt bütünlüğü ve ölçek (2026-10-11 taze tur)

Kaynak: bütün kapıların taze koşusu, bilerek kusur ekleyen negatif kontroller ve koşucunun tersine mühendisliği;
ölçüm, yöntem ve sınırlar [rapor §22](docs/monorepo-audit.md). Özet (`--fresh`, 8 çekirdek, ön yük ≤%11):
`quick` 87,8 sn, `fast` 6,0 dk, `high` 4,7 dk geçti; **`signoff` DÜŞTÜ** (27,1 dk: vitrin e2e WebKit'te 1 aralıklı
zaman aşımı; koşucu orada durduğu için dört aşama koşulmadı, ayrı koşuldu ve geçti: `coverage-audio` 547 sn,
`audio-verify` 101 sn, `security-js` 3 sn, `security-rust` 4 sn). **İkinci taze `signoff` de DÜŞTÜ** (30,6 dk,
ön yük %4; e2e 26,3 dk): bu kez başka bir WebKit testi, sessiz şeritte tek işçiyle `motionMeasure.spec.ts:124`,
60 sn zaman aşımı. **Sonraki üçüncü `signoff` da DÜŞTÜ** (36,2 dk): WebKit ana şeridinde
`hudStates.spec.ts:248:3` XPBar testi 15 sn `toHaveClass` beklentisinden düştü
(447 geçti / 16 atlandı / 1 düştü; sessiz şerit geçti). Önceki iki turun 0/2 sonucu tarihsel kanıttır;
ilk başarısız dizide **0/3 yeşil `signoff`** vardı. Üçüncü başarısız koşuda dört sonraki aşama `notRun` kaydedildi;
önceki bağımsız aşama PASS sonuçları bu koşuya devredilemez.
**Sonraki tam koşu dizisi (2026-10-11, aynı performans değişikliği öncesi çalışma ağacı): üç ardışık tam `signoff` PASS, 48,4 / 47,0 / 48,1 dk; üçüncü koşu 18/18 PASS.** E2E sonrasındaki `coverage-audio`, `audio-verify`, `security-js`, `security-rust` aşamaları bu dizide gerçekten koşuldu. Üç yeşil sonuç önceki düşüşlerin geçmiş kanıtını silmez; F11.1'de kök neden/gerçek pointer, F11.2'de yeni arşivin gerçek tam kapı hata entegrasyonu açık. Güncel düzen (`eb81a52c`, kapı bekçileri dahil) için tam `signoff` **18/18 PASS, 37,7 dk**; e2e 1058 geçti / 21 atlandı / 0 düştü, atlama bütçesi ve sayaç aynı koşuda denetlendi ([rapor §26](docs/monorepo-audit.md)); bu tek koşu F11.1/F11.2 kök neden kanıtı değildir.
Negatif kontrol: bilerek eklenen 10 kusurun 10'u `quick`te beklenen aşamada yakalandı; kapsam eşiğini düşürmek GEÇTİ;
kısmi sahnelemede kapı commit'e girecek indeksi değil çalışma ağacını sınadı.

- [ ] **[P1] F11.1 — WebKit test kök nedeni / gerçek pointer regresyonu (tarihsel 0/3 FAIL; ardından 3/3 tam PASS, AÇIK).** (a) `dialogPatterns.spec.ts:116`
      (kayıt çakışması, bekleme sırasında iptal; ana şerit): `Cancel` tıklaması 60 sn bekledi — "`.vol-showcase-card__body`
      işaretçiyi örtüyor / öğe kararsız / DOM'dan ayrıldı"; aynı spec izole ve `--repeat-each=5` ile iki motorda 50/50
      geçti. (b) `motionMeasure.spec.ts:124` flaş sınırı, azaltılmış hareket kapalı (sessiz şerit, tek işçi, ön yük %4):
      120 art arda `click()` döngüsü 60 sn'yi aştı; WebKit'te iki varyant birinci koşuda 33,8 / 30,2 sn, ikincide
  > 60 sn (düştü) / 53,0 sn sürdü; Chromium 15,5 / 11,1 sn → 21,2 / 17,4 sn: koşular arası ~2 kat sapma, bütçenin
  > %50–100'ünü kullanıyor, payı yok. (a)/(b) kök nedenleri BİLİNMİYOR; ilk koşuların eski ortak
  > `test-results` izleri sonraki koşuda silinmişti. Yeni E2E çalıştırıcısı sonraki hata izlerini ayrı arşivler (F11.2).
  > Kapanır: (a) için yük altında yeniden üretim ya da iz analiziyle kök neden (zamanlama
  > yarışı mı, katmanın örtüldüğü gerçek istif/odak kusuru mu); (b) için WebKit'te tıklama başına maliyetin ölçümü ve
  > testin süre sınırından bağımsız (döngü sayısı/doğrudan olay) yeniden kurulması;
  > (c) üçüncü tur: `hudStates.spec.ts:248:3`, XPBar çoklu seviye testi; `aria-valuenow=125`,
  > `aria-valuemax=325` ve seviye etiketi doğrulandıktan sonra `vol-xp-bar--level-up` sınıfı
  > 15 sn içinde bulunmadı (`expect(locator).toHaveClass(expected) failed`).
  > **(c) hedefli düzeltme/doğrulama:** `hudStates.spec.ts` geçici (600 ms) `level-up`
  > sınıfını `click()` RPC'sinden SONRA sorguluyordu; sınıf test gözlemine kadar kalkabiliyordu.
  > Tıklamadan ÖNCE kurulan `MutationObserver` sınıf geçişini, normal animasyonu ve hareket azaltmadaki
  > sabit vurguyu yakalar. Hedefli tekrarlar WebKit **6/6**, Chromium **6/6** PASS;
  > bunlar gerçek XPBar davranışının tüm kapıda güvenceye alındığı veya ilk iki farklı
  > WebKit kusurunun giderildiği anlamına gelmez. **Kapanır:** (a)/(b) kök neden/regresyonları
  > ve (c) dahil tam ağaçta üç art arda yeşil `signoff`; retry ya da zaman aşımı
  > büyütmeyle hata gizlenmez. **Üç ardışık tam PASS artık sağlandı (48,4/47,0/48,1 dk); ancak kapanış SAĞLANMADI:**
  > (a) `dialogPatterns` iptali, (b) `motionMeasure` flaş serisi artık sayfa içinden
  > `element.click()` kullanıyor; bu akış eski gerçek Playwright pointer
  > hit-testing/actionability arızalarını tek başına sınamaz. (a)/(b) kök nedenlerinin
  > ayrıştırılması ve gerçek işaretçiyle karşıt/regresyon kanıtı hâlâ gerekli.
  > Son üç PASS **performans değişikliklerinden önceki ağaca aittir**. F11.1 **AÇIK (kısmi)**.
- [ ] **[P1] F11.2 — Kanıt bütünlüğü: koşulmayan ve düşen kanıt.** **Kısmen düzeltildi:** `gateRunner.mjs`
      erken düşüşten sonra koşulmayan aşamaları JSON'da `status: notRun` olarak üretir; regresyonu
      `gateRunner.test.mjs`dedir. Bekleyen birimler de `notRun` raporlanır. `report.mjs`
      Playwright test dosyasını/satırını/başlığını ve hata sebebini çıkarır (`report.test.mjs` fixture).
      **Üçüncü gerçek `signoff` ile doğrulandı:** XPBar hatası `kind: test`,
      `reason: expect(locator).toHaveClass(expected) failed` olarak sınıflandı; dört sonraki
      aşama `notRun` göründü. Önceki iki `signoff` çıktısında bu iyileştirmeler yoktu.
      **Yeni kısmi iyileştirme:** vitrin `e2e.mjs` her motor/şerit için ayrı
      Playwright çıktı dizini kullanır; hata bağlamını ve varsa Playwright'ın
      ürettiği `trace.zip` / `report.json` kanıtını git dışı kalite önbelleğinde
      arşivler, başarılı koşu kendi geçici çıktısını siler. Zorla düşürülen **her iki
      motor** için dosyalar üretildi; ardından gelen başarılı koşu arşivleri silmedi
      (ilk elle hata-yolu doğrulaması). **Otomatik RED→GREEN regresyon artık VAR:**
      `scripts/quality/tests/e2eArchive.test.mjs` **5/5 PASS**,
      `scripts/quality/tests/e2eConfig.test.mjs` **3/3 PASS** (2026-10-11,
      worker-2). Tarayıcı/Vite açmayan gerçek Node sahte Playwright alt süreçleri,
      Chromium/WebKit seçili hata izlerini, JSON `trace.zip` ek yolu yeniden
      bağlamayı, ana şerit hatasında sessiz şeritlerin koşmasını, rapor
      eksikliğinde `error-context.json` ve izi korumayı, sonraki PASS'te
      eski arşivi silmemeyi, 14 gün/10 koşu ve 2 günlük geçici çıktı
      temizliğini sınar. **10→11 hata koşusu regresyonu düzeltildi:**
      `e2e.mjs` hem başlangıçta hem **tüm şeritler tamamlanınca** budar;
      yeni başarısızlık koşu sonunda arşiv sayısını 10'un üstünde bırakmaz.
      Arşiv yalnız **yereldir**, değişmez/uzak kayıt değildir;
      `last-failure.log` ayrı ve geçicidir. Önceki üç tam yeşil `signoff`
      bu son otomatik arşiv düzeltmesinden **önce** koşuldu; hata yolunu
      tetiklemedi. **Kalan kapanış ölçütü:** güncel düzenle gerçek tam
      `signoff`/kapı hata yolunda Playwright izi → motor/şerit arşivi →
      kapı raporu/`notRun` zincirinin uçtan uca kanıtı ve güncel
      değişikliklerden sonra taze tam `signoff` doğrulaması.
      F11.2 **AÇIK (entegrasyon kısmi)**.
- [ ] **[P3] F11.9 — Sabit beklemeler yük altında kırılganlık üretir (KISMİ).** **Yapıldı:** `fixedWaits.mjs`
      bekçisi `waitForTimeout` sayısını test dosyası başına bütçeler (`quality.json` → `fixedWaitBudget`; ölçülen
      56 çağrı / 21 dosya; artış ve unutulmuş bütçe `contract`ta düşer). **Açık:** mevcut 56 bekleme olay/koşul
      ifadesine çevrilmedi (stress.spec 9, visual.spec 5, hudInteraction 6 en büyükleri; yük testlerinin 7 sn ve 1,5 sn
      beklemeleri süre geçirmenin kendisidir). Kapanır: her biri koşula çevrilir ya da gerekçeli bırakılıp bütçe düşer;
      F11.1'in kök nedeniyle birlikte ele alınır.
- [ ] **[P3] F11.10 — Yürütme maliyeti adayları (ölçüldü, benimsenmedi).** CORE testlerinde jsdom ortamı 250
      dosyada 287 işçi-sn, testlerin kendisi 36 işçi-sn; VOL.TEST 105/38, vitrin 45/85. DOM gerektirmeyen dosyaları
      `@vitest-environment node`a ayırmak ve ESLint `--cache` (tip bilgili kural bağımlılık değişimini önbellek
      anahtarında görmez: negatif kontrol şart) adaydır. Kapanır: önce/sonra ölçüm ve en az 3 yeşil koşu; kazanç %10'un
      altındaysa "Ölçülüp benimsenmeyenler"e yazılıp reddedilir. Tetik değil, ölçüm işi; F10.13 tetiği tutana dek açık.

### F13 — Onaylanan backend yönü ve ilk gerçek tüketici

- [ ] **[P1] F13.3 — Ağ sertleştirme (KISMİ).** Teslim: `@volstudio/network` protokol/istemci/sunucu zemini, ayrı derlenen Node odası, 12 kişilik gerçek WS kabulü, dolu oda reddi, hız suistimali regresyonu, Chromium/WebKit E2E ve paketli Windows WebView2 smoke. Hâlâ yok: kimlik/auth ve WSS, origin denetimi, yapılandırılabilir sunucu adresi (Tauri CSP `connect-src`), katılım seli sınırı, süreç keşfi, savaş sisi, Linux/Android/Steam **paketli** ağ kabulü. Kapanır: bu kalemlerin her biri ölçülmüş kabulle geçer; paketli uygulama cihaz kabulü ayrıca yapılır.
- [ ] **[P1] F13.5 — Kapasite ve soak kabulü.** Çok istemcili bot sürücüsüyle N oda × 12 oyuncu yükü, istemci başına bant, adım süresi p50/p95/p99, bellek eğrisi; 1 saat sonra 24 saat açık kalış; Windows ve Steam Deck. Kapanır: oda başına ölçülmüş makine bütçesi (`quality.json`) ve tekrar koşulabilir soak kaydı; ölçülmeyen cihaza kabul yazılmaz.
- [ ] **[P1] F13.6 — Bozuk ağ altında ölçüm ve oturum yaşam döngüsü (KISMİ).** Teslim: gecikme, titreşim ve yeniden iletim bekleyişi (kayıp TCP'de bekleyiş olarak modellenir) ekleyen vekil ve Chromium+WebKit E2E (`impairedNetwork.spec.ts`): en büyük düzeltme, ani sıçrama sayısı ve en büyük gidiş-dönüş `quality.json` → `networkImpairment` bütçesine bağlı, durunca yetkiyle aynı yer. Hâlâ yok: istemci tarafı düzeltme/snap sayaçları (bugün HUD'daki sapma tepesi ve konum örneklemesi), gerçek paket kaybı ölçümü, aşağıdaki maddeler. Yeniden bağlanma matrisi (maç sonu, doğuş anı, çift kopuş, sunucu boşaltma, arka plan/ağ değişimi). Motorlar arası öngörü determinizmi (Node, Chromium, WebKit, Android WebView) manevra, çarpışma ve ateşte. Kötüye kullanım sertleştirmesi (fuzz, bağlantı/IP başına katılım limiti, oda üst sınırı, yavaş tüketici). Gecikme telafisi yalnız ölçüm gerektirirse. Kapanır: her madde `quality.json` bütçesi veya negatif regresyonla; paketli Windows/Android ağ smoke'u ve insan sunum beğenisi NOT-RUN kalır.
- [ ] **[P1] F13.7 — VOL.TEST ajan laboratuvarı ve bot sürücüsü (KISMİ).** Teslim (14 Ekim): `?lab=1` ile açılan `window.volLab` (`state`, `telemetry`, `events`, `input`, `release`, `mark`, `jsonl`; sınırlı halka; komut kaydı ile DESIGN tablosu eşitlik testi, gerçek tarayıcıda doğrulandı), `games/vol-test/scripts/drive.ts` hükmü (`--profile lan --ops`: özet `quality.json` → `fleetBudget`'a karşı `judgeFleet` ile yargılanır, düşerse çıkış 1; sunucu adım/olay döngüsü/atılan istemci `/metrics`'ten). Hâlâ yok: betikli girdi senaryoları (sürücü bugün sabit sürüş/ateş deseni koşar), istemci başına bayt ve uzlaştırma sayaçlarının sunucu `/metrics`'inde yayımı, her senaryo için kayıt dosyası. Kapanır: betikli senaryoların her biri için tekrarlanabilir ölçüm kaydı ve hüküm; sunucuda istemci başına bayt/uzlaştırma sayacı.

## Kapatılanlar

- [x] F13.4 — Backend araştırması kullanıcı kararıyla güncellendi: Colyseus, VOL.TEST ilk tüketici, resmî sunucu ve Windows/Linux/Android/Steam hedefi; web yayını yok. 20 dünya × 8–14 oyuncu karar verilmemiş senaryo, deneyler yerel kanıt; kalıcı entegrasyon F13.3'tür.
- [x] F13.2 — Colyseus lisans/Cloud/VPS/mini PC, çok oyunlu repo yerleşimi ve üretim kabul kapsamı çapraz kaynaklarla genişletildi; 12 sunucu kontrolü ×3, Phaser 4 iki motor/gecikme, kötüye kullanım ve encoder/fizik ölçümleri [raporda](docs/backend-research.md). WebKit temiz kabulü FAIL; test harness'ı üretim entegrasyonu veya tam dünya/cihaz kabulü değildir.
- [x] F13.1 — 24 oyunculu co-op/PvP otomasyon, RTS ve aksiyon backend araştırması kaynaklarla tamamlandı; Colyseus/Talo/Nakama/SpacetimeDB/özel taşıma ayrımı, repo sınırları ve gerçek Node + 24 istemcili simülasyon uyum deneyi [raporda](docs/backend-research.md). Üretim yükü, kalıcılık, prediction ve cihaz kabulü yapılmış sayılmaz; önerilen backend yerleşimi henüz uygulanmadı.
- [x] F12.1 — B31–B51 kalıcılık, olay/ömür, asset, native teslim ve kapı bütünlüğü kusurları başarısız→başarılı regresyonlarla kapatıldı; güncel sözleşmeler ile değişmeyen ağaçta taze `high` (13/13, 8,3 dk) ve `signoff` (18/18, 41,8 dk) geçti; fiziksel cihaz ve insan kabulleri kendi açık işlerinde kaldı.
- [x] F11.7 — Kapı girdileri Git işaretleri ve EOL filtresinden bağımsız ham baytla karmalanır; pre-commit öncesi/sonrası tüm indeks–çalışma ağacı eşitliği şarttır. Kısmi sahneleme, CRLF ve sahne dışı yeni bağımlılık negatifleri geçer; iki kontrolün ölçülen ek maliyeti yaklaşık 1,7 sn'dir. Yerel kancanın bilerek atlanabilmesi ve bulut CI olmaması belgelenmiş güven sınırıdır.
- [x] F11.0 — Ajan uyumu ve bayat sayılar: `CLAUDE.md` kökü `@AGENTS.md` ile içe aktarır (Claude Code `AGENTS.md`yi kendiliğinden okumaz; önceki salt bağlantı oturum bağlamına girmiyordu, tek kaynak `AGENTS.md` kalır); `docs/gates.md` süre ve atlama sayıları taze ölçümle düzeltildi (`high` 13,4 → 4,7 dk, vitrin `e2e` 343 → 1.355 sn, WebKit 2 → 18 atlama).
- [x] F11.3 — Aşama sayımı (`counts.mjs`, Playwright `countsReporter.mjs`) `--json`da ve aşama satırında görünür; `quality.json` → `skipBudget` atlama sayısını sınırlar (aşım, bütçesiz anahtar ve okunamayan sayım düşer; artış `ratchetExceptions` ister); motor boşlukları `docs/gates.md` "e2e motor boşlukları"nda; gerçek e2e koşusunda ölçüldü (vitrin WebKit 16+2, Chromium 1+1, VOL.TEST WebKit 1, node:test 2)
- [x] F11.4 — Kapsam eşikleri ölçümden en çok 2 puan aşağıda (CORE 94/92/86/93, vitrin dal 70, VOL.TEST dal 92, tauri-v2 97/95/91, pen.dev 98/98/95) ve `scripts/quality/thresholdRatchet.mjs` eşik, `floor`, muafiyet ve şekil gevşetmesini taban dala göre `contract`ta reddeder; gerekçeli gevşetme `quality.json` → `ratchetExceptions` (negatif fixture + gerçek ağaçta 94→60 kontrolü)
- [x] F11.8 — 12 bayat `chromium-linux` piksel temeli silindi (51 `win32` temeli kayıtlı kümedir; Linux makinede tam yenilenmeden Linux piksel kanıtı NOT-RUN); `snapshotPlatforms.mjs` bekçisi eksik platform kümesini `contract`ta düşürür (gerçek ağaçta 12/51 ile düştü)
- [x] F11.6 — Kapı kodu (`scripts/**`) `contract` node-test koşusunda Node'un yerleşik kapsamıyla ölçülür (satır %94,2 / dal %88,1 / işlev %95,8; eşik 92/86/94, ratchet'li); hiç yüklenmeyen 15 betik ve yarıdan az kapsanan ikisi `quality.json` → `scriptCoverage.acknowledged` içinde hangi kapının çalıştırdığıyla yazılı, bayat kayıt ve gerekçesiz yeni betik düşer (`scriptCoverage.mjs`)
- [x] F11.5 — `src/**/index.ts` yalnız yeniden dışa aktarım ve tip içerir: `scripts/quality/indexModules.mjs` çalıştırılabilir ifadeyi dosya:satırla reddeder (contract'ta, negatif fixture'lı); audio-synth'in `getPreset`/`callablePresetNames` mantığı `devtools/audio-synth/src/presets/registry.ts`e, `findPresets`/`PRESET_CATALOG` `devtools/audio-synth/src/presets/catalog/catalog.ts`e taşındı ve ölçülür
- [x] F10.1 — braces GHSA-vfj7-8cjw-p6xm için düzeltme yayımlanmadı (upstream durağan, stylelint zinciri başka sürüme geçemez): derinlik sınırı yaması `patches/` altında, `security-js` yama bağı + kurulu davranış sınaması + yayımlanmış düzeltme denetimini koşar, bayat kaydı reddeder. Yanked `yoke-derive` 0.8.4'e yükseltildi; Rust'ta yalnız kayıtlı `unsound`/`unmaintained` uyarı (8 kayıt: zincir, platform, etki alanı, sahip) geçer, zafiyet ve yanked geçmez. Gate seviyesi düşürülmedi; ayrıntı `docs/gates.md` → Güvenlik riski politikası.
- [x] F10.7 — Kare ölçüm aracı kontrollü build'de 2,3 KiB ayrıştırıldı; güncel app 182,4/120,4 KiB bilinçli kapsam gerekçesiyle bütçelendi; vendor/CSS/kapsam eşikleri korunarak bundle ve tam high geçti.
- [x] F10.8 — Vitrin README/DESIGN, headless ve O(N) uzamsal tarama açıklaması güncel; özel kanıt atıfları ve zorunlu beğeni şartı düzeltildi, kullanıcı değişiklikleri korunarak belge/biçim/contract kapıları geçti.
- [x] F10.11 — Kapı hızı: `typecheck`/`lint`/`rust`/`contract` girdisi değişen birimle sınırlı (paket, crate, takım) ve içerik makbuzlu, betik bağımlılığı kaynaktan türer ve bekçilidir; vitrin e2e motor başına 2 işçi (456 → ~340 sn, determinism sekme başına ayrıldı). `coverage --no-sort`, `test` eşzamanlılığı, vol-test 2 işçi, audio-test alt kümesi ve paket başına kapsam makbuzu ölçüldü ve reddedildi (`docs/gates.md` → Ölçülüp benimsenmeyenler).

- [x] F04.6 — Bekleyen native toggle flush kuyruğunda; destroy/generation ve görüntü→ayar son snapshot sırası controller/tüketici regresyonlarıyla kapalı (B22).
- [x] F05.7 — Manifest dışı staging korunur; örtüşme/symlink/junction preflight reddi ve ardışık export gerçek geçici disk testleriyle kapalı (B21).
- [x] F06.5 — İlk dünya çıkışı ortak segment parametresidir; bağımsız konum, duvar ön/arka hedef ve gerçek tank atışı regresyonları kapalı (B27).
- [x] F08.7 — Native Result/reporter reddi ve ölçüm kaybı görünür; eksik/sayaçsız Deck/Android kanıtı fail-closed, gerçek disk ve tüketici bileşimi testli (B23).
- [x] F10.9 — TAP failing blok paket/başlık/yol teşhisi ve belirsizde null; gerçek JSON CLI exit/raw log regresyonu kapalı (B29).
- [x] F10.10 — Preview doğrudan sahip Node çocuğu; gerçek Windows PID/port kapanışı, dolu port korunumu ve erken çıkış testli (B30).

<a id="f01"></a>

- [x] F01.1 — Zorunlu ses dinleme kabulü, API/CLI/rapor bağları ve review dosyaları kaldırıldı; üretim kabulü güncel teknik QA ve gerçek verify'a bağlı.
- [x] F01.2 — V2 rapor geçişi ve eski/bozuk/mutasyona uğramış kabul negatifleri testli; isteğe bağlı dinleme ve mevcut PCM/asset yüzeyi korundu.
- [x] F02.1 — Standart pnpm shim'iyle temiz Unicode/boşluklu klonda install/doctor/quick/high geçti; gerçek MSVC link probu ve Android araç profili doğrulandı.
- [x] F02.2 — Native argv ve cmd/bat adaptörü gerçek yol/argüman/PATH fixture'larıyla testli; audio CLI Node+JS girişini kullanıyor.
- [x] F02.3 — File URL, separator ve gerçek disk/rollback regresyonları Windows'ta; aynı commitFiles kaynakları ayrı WSL Linux ağacında 8/8 geçti.
- [x] F02.4 — Tam audio 129 dosya/2.221 test ve güncel LCOV/shape geçti; süre kusurları eşik/timeout/skip gevşetmeden düzeltildi.
- [x] F03.1 — README/agent rol bütçesi, bağlantı/başlık/komut ve bayat istisna denetimleri mevcut quality/contract'a bağlandı.
- [x] F03.2 — 43 kaynak belgenin sahiplik kararı uygulandı; agent girişleri ve README'ler kısaldı, hukuk/üretilmiş izin kaynakları korundu.
- [x] F03.3 — UI COVERAGE/RESEARCH sahiplerine birleştirilip silindi; 63 açık UI görevi ve kapanış ölçütleri korundu.
- [x] F03.4 — Platform araç/kapı/native/cihaz sınırları ve tek sahipli belge düzeni doğrulandı; yapılmayan cihaz kabulü açık bırakıldı.
- [x] F04.1 — Son telafisiz yazım reddi flush/flushAndDispose ve failed ACK'ye ulaşır; reentrant son snapshot ve başarılı telafi regresyonları ile tam high geçti.
- [x] F04.2 — Geç load/destroy/abort/generation/gerçek dış odak eski kaynak ve commit'i açamaz; Input/TextArea ve Steam oturum regresyonları ile tam high geçti.
- [x] F04.3 — Windows yerel ürün turu 15/15: eski depodan göç (kaynak korunur), ayarın IPC→store→diske yazımı, sert öldürme sonrası geri gelme, ikinci jenerasyonun `.bak` olması, bozuk ana kayıtta yedekten geri yükleme, iki jenerasyon bozukken karantina + korunan eski depodan yeniden göç, oyuncuya görünür kurtarma/sıfırlama bildirimi (önceden yalnız konsola yazılıyordu), WM_CLOSE temiz çıkış ve son değer; atomik yazım Rust regresyonlarıyla.
- [x] F04.5 — Tüketicisiz `core:window:allow-close` izni (hiçbir JS `Window.close/destroy` çağırmaz; kapanış `exit_application` komutundan) VOL.TEST ve vitrin yeteneklerinden kaldırıldı; yerel tur izinsiz sürümde geçti. Kalan tauri-v2 export/komutlarının hepsinin tüketicisi var; fiziksel SD8 sonucu F08.6'dadır.
- [x] F05.1 — Yayın, job kilidinden sonra asset+manifest hedef kilidini sabit sırayla alır; iki gerçek süreç yarışında tek kazanan, kaybeden `locked`/`overwrite`, bayat kilit devralınır.
- [x] F05.2 — Manifest her alanı tip/enum/aralıkta doğrular; PCM betimi kayıt, kodlanmış rapor, yerleşim ve brief ile çelişemez; verify bayt boyutu, bağımsız render ve çözülmüş dosyayı karşılaştırır.
- [x] F05.3 — Pencil düzenleyici parça ve önizlemeyi tek planda doğrular, çakışan düğümü yazımdan önce reddeder, hedef+metadata'yı geri alınabilir yerleştirir; kaynak en son silinir.
- [x] F05.4 — `validateManifest` 20/22/165 (siklomatik/bilişsel/satır) iken 6/5/23'e bölündü; ortak PCM alt şeması render kaydıyla paylaşılır, 69 gerçek manifest ve isteğe bağlı eski alanlar kabul edilir.
- [x] F05.5 — 17 emekli `vt-*` iş kaydı (36 render) kaldırıldı; hedefleri `65d0b1f3`'te silinmiş, yerlerini `vt-hardsteel-*` almıştı. İş envanteri 69/69; 84 seçilmeyen render aktif işlerin aday geçmişi olarak kaldı.
- [x] F05.6 — Atıfsız iki araştırma fit'i (`fit-experiment` yeniden üretir) ve yerel eski vol-ui kalıntısı kaldırıldı; `reference-shell` ve `semantic-demo` arama kayıtları fixture gerekçeli kaldı.
- [x] F06.1 — Mermi, adımın süpürdüğü parçayı gövdenin yönlü ayak iziyle keser (segment–OBB ilk temas); olay/itki/önizleme temas noktasını görür, en erken hedef ve sahip dışlaması deterministik.
- [x] F06.2 — Duvar sert sınırdır: araç teması sonrası duvar yeniden çözülür (en çok 4 geçiş); 4×4000 adım ve köşe yığınında hiçbir gövde köşesi dünya dışında kalmaz, kalan örtüşme ≈0,05 birim.
- [x] F06.3 — Saf simülasyon CORE'a yalnız alt yüzeylerle bağlanır; beş senaryo Node'da DOM/CSS yükleyicisi olmadan seedli koşar ve vitest sonucuyla birebir aynıdır.
- [x] F06.4 — `093e4c8d` commitinde alınan cihaz referansı: Deck host AppImage 10 dk çoklu tank/kar/yüksek + sanal kolla sürekli ateş ve dönüş = 60 FPS medyan, p95 19 ms (hedef 18 ms'nin 1 ms üstünde, F08.5'e devredildi), 5 kare >34 ms; Lenovo tablet 10 dk boş jank %0,04 / çoklu tank jank %3,97, bellek büyümesi yok (`docs/steam-deck.md`, `docs/android.md`).
- [x] Monorepo denetim raporu docs'a yerleştirildi; 20 bulgu, 43 belge kararı ve bütün açık işler F01–F10'a eşlendi.
- [x] Visual Studio C++ Build Tools kuruldu; güncel doctor/bootstrap doğruluğu F02.1 ile tamamlandı.
- [x] Just kabuğu Git kurulumundan seçilir; WSL gölgesi ortam teşhisinde ayrılır.
- [x] Üretilmiş Android eklenti API ağacı ignore sözleşmesine bağlandı.
- [x] Steam Cloud ad ve decoded boyut sınırı regresyonla korundu.
- [x] Audio yükleme iptal/birleşme ve geç decode yaşam döngüsü testli.
- [x] VOL.TEST tanısı kalite/senaryo/seed/hava ve CPU aşamalarını kaydeder.
- [x] Native ses uyanışı kaynak testleri var; fiziksel Deck kabulü F08'de açık.
- [x] Çoklu araç çizimi, namlu ışığı ve yayıcı görünürlüğü sınırlandı.
- [x] Ölçüm seçimleri kalıcı cihaz tercihlerinden ayrıldı.
- [x] E1 — Girdi sunumu tek kol yoklamasını ve kip hakemini tüketir.
- [x] VT6 — Windows NSIS kimlik/ikon/yetenek yapılandırması testli; native kabul F09'da.
- [x] VT-R1 — Kimlikli araç/mermi/olay ve SAT teması var; B17/B18 F06.1/F06.2, B27 ilk duvar teması F06.5 ile kapandı.
- [x] VT-R2 — Fren/sürtünme/drift/aktarma modeli ve hissiyat zarfı testli.
- [x] VT-R3 — Joystick/fren/hızlanma/minimap ve mobil örtüşme E2E'si var.
- [x] VT-R4 — Mermi/patlama/palet izi ve kalite kademeli efektler uygulandı.
- [x] VT-R5 — Önceki oyun ses setinin kullanıcı dinleme beyanı kaydedildi; yeni üretim şartı değildir.
- [x] VT-R6 — VOL.TEST araç sesleri (pervane, yay atışı, atılım, parça kopması ve önceki set) ile Goliath/Manta görsel ve denge beğenisi 2026-10-14'te kullanıcı tarafından onaylandı (kullanıcı beyanı; ajan dinleme ya da beğeni testi yapmadı). Teknik kabul audio-synth kapılarındadır; bot düellosu dengesi insan oyun testi değildir.
- [x] VT-H2 alt kabulü — Kullanıcı dizüstünde görünür pencere ve ekran kilidi sonrası girdi turunu eliyle onayladı; Deck/haptik kalanları F08/F09'da açık.
- [x] VT4 alt kabulü — İki Android cihazda kurulum/açılış/yatay/tam ekran/joystick/ateş/duraklatma/arka plan/kapanış turu kaydedildi; görünür panel, kısa Samsung dokunuşu ve uzun oturum F09'da açık.
- [x] VT-C — Genel camera/math/input/physics/pose mekanizmaları CORE'a taşındı.
- [x] VT-H — Fizik/süspansiyon/renk/ayar/haptik ve oyun sertleştirme uygulandı.
- [x] VT0/VT1 — VOL.TEST kapsamı, ikon ve oyun çekirdeği kuruldu.
- [x] B6 — Push audio seçimi diff/import grafiğiyle; belirsizlikte tam takım.
- [x] Kod yorumu bağlam bekçisi ve bütün kaynaklarda 1000 satır sınırı var.
- [x] Kök girdileri gerekçeli rootEntries sözleşmesiyle kilitli.
- [x] Tek Cargo workspace/kilit/hedef; Rust push kapısında.
- [x] CORE, scripts ve devtools sorumluluk hiyerarşisi kuruldu.
- [x] Audio-synth kernel/kanonik yayın, kaynak aynası test ve veri ayrımı kuruldu.
- [x] Deneysel ürünler freeze etiketleriyle emekliye ayrıldı; mekanizmalar korundu.
- [x] Deck araçları devtools/deck'e taşındı; eski cihaz dağıtım kalıntıları temizlendi.
- [x] Katalog bekçisi, public yüzey ve büyük/düşük kapsamlı kaynak koruması var.
- [x] Ürün kimliği/ikon/port ve native plugin sahipliği kapılara bağlandı.
- [x] Kayıt/kapanış/asset transaction mekanizmaları kuruldu; yeni güvence kusurları F04/F05'te açık.
- [x] Deck girdi/glif/metin/görüntü/Steamworks katmanları var; gerçek kabul F08'de açık.
- [x] Önceki kalite kapanışları kaydedildi; güncel güvenlik/signoff engeli raporda ve F10'da açık.
