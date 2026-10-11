# UI fazları — tek yetkili iş listesi

`[ ]` açıktır; `[x]` yalnız kanıtıyla `Kapatılanlar`a tek satır taşınır. Görev kimlikleri
tekildir. Bu liste 2026-10-07'de **yeniden yazıldı**: ilk plan web paneli mekaniğine ve kanıt
altyapısına ağırlık verdi, sunum ve hissiyat sonraya kaldı; sonuç olarak üretilen ikon, imleç,
çerçeve ve ses varlıkları (ve ikinci tema) kabul edilmedi. Burada yön oyun arayüzü kimliğidir;
mekanik kısıtlar görev metninden çıkarıldı, kimlik ve kalite kararları sahibine (CORE UI
uygulayıcısına) bırakıldı.

Üst sıra [kök F01–F10](../../TODO.md); kararlar [monorepo denetimindedir](../monorepo-audit.md).
Tasarım dili ve sözleşme [CONTRACT](CONTRACT.md), canlı yüzey [CATALOG](CATALOG.md), kanıt ve
cihaz kabulü [VERIFICATION](VERIFICATION.md) belgesindedir.

## Yön

| #   | İlke                                                                                                                                                                                                                                                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| K1  | **Oyun arayüzü yapıyoruz, web paneli değil.** Düz kutu, ince çizgi ve gri şerit yok: katmanlı malzeme, derinlik, kalın silüet, tok geri bildirim, hareket "juice"u. Hedef kitle bullet hell ve RTS oyunlarıdır; bileşenler jenerik kalır, kimlik skin'den gelir.                                   |
| K2  | **Skin = tema + malzeme parametresi + ses paleti + imleç aksanı + ikon plakası.** İki skin vardır: `default` (bugünkü renkler aynen) ve `aurum` (premium, bambaşka bir kimlik). Skin değişimi renkten fazlasını değiştirir; birbirinden bir bakışta ve bir dinlemede ayrılır.                      |
| K3  | **Varlıkta kaynak önce, icat sonra.** Glif setimizin yazarı Kenney'nin CC0 paketleri (Input Prompts, Game Icons, Cursor Pack, Crosshair Pack) ve Phosphor Icons Fill (MIT; dolu, minimal, modern) kürate edilir; stile uymayan yer aynı dille özgün çizilir. Lisans/atıf kaydı her varlıkla gelir. |
| K4  | **Ses gövdeli, malzemeli ve ölçülmüş olmalı.** Referans setlerle (Kenney Interface Sounds/UI Audio) spektrum ve yükseklik karşılaştırması yapılır; "küçük hoparlör bası çalamaz" gerekçesiyle gövde kesilmez. Sesler yalnız laboratuvarda değil, uygulamanın her etkileşiminde duyulur.            |
| K5  | **Bir iş "dosya üretildi" ile değil, vitrinde ve oyunda görülüp duyulup kullanıldığında kapanır.** Hiçbir kod tarafından tüketilmeyen çıktı ilerleme sayılmaz. Kapanış satırı neyin nerede göründüğünü söyler.                                                                                     |
| K6  | **Kapılar kanıt içindir, hedef değildir.** Yeni kapı/ratchet yalnız bir ürün kusurunu gerçekten önlüyorsa yazılır; mevcut olanlar korunur, ama kapıyı yeşillendirmek için ürün kararı bozulmaz.                                                                                                    |
| K7  | **İnsan yargısı ayrıdır.** Görsel ve ses beğenisi kullanıcıya aittir; reddedilen iş yeniden açılır. Cihazda ölçülemeyen kabul PASS sayılmaz (NOT-RUN), ama cihaz bağlıysa ölçülür.                                                                                                                 |

Görsel, ses ve imleç beğenisi isteğe bağlı tasarım feedback’idir; teknik kapanış için insan kararı beklenmez. Yapılmayan değerlendirme PASS yazılmaz. Fiziksel erişim/girdi ve cihaz kabulü bu tercihten ayrı kalır.

## Dürüst başlangıç (2026-10-07)

| Alan             | Durum                                                                                                                                                                                                                                           |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Temalar          | `default` (çelik zemin + kor turuncusu) ve `ember` (kahve zemin + biraz farklı turuncu) aynı marka ailesinde; ayırt edilemiyorlar.                                                                                                              |
| Üretilmiş varlık | 26 ince çizgili web ikonu (oyun ikonu yok), 5 düz çerçeve, 2 ok imleci, 3 doku: **hiçbir kod tüketmiyor**; Kenney glif stiliyle uyuşmuyor.                                                                                                      |
| Ses              | 36 OGG, 12 olay (warning/error ağırlıklı). Enerji orta bantta; sub/low −45…−75 dB (gövde yok), yükseklik −20 LUFS (Kenney referansı −10…−25 LUFS, geniş bant). Yalnız vitrin Ses sekmesine bağlı; slider ve diğer bileşenler sessiz. Duyulmadı. |
| Sunum            | Bileşenler düz kutu/şerit; bevel, rim ışığı, doku, segmentli bar, juice yok (vitrin görüntüleri). Buton/Bar/Kart aynı web-panel dili.                                                                                                           |
| Altyapı          | Güçlü: registry, iki motor E2E, axe, geometri, kare ölçümü, i18n yüzey kapısı, tema/hareket kapıları, niyet katmanı, ses kiti (mekanizma), cihaz ölçüm araçları. Ürün kimliği tarafı boş.                                                       |
| Cihaz            | Windows dizüstü, Lenovo Android 14 tablet, Samsung Android 16 (her zaman bağlı değil), Steam Deck (SSH). Yerel vitrin yok; hücreler NOT-RUN.                                                                                                    |
| Ortam            | Node **22.23.1**; kapılar bu sürümle koşar.                                                                                                                                                                                                     |

## Kararlar

| #   | Karar                                                                                                                                                                                     | Gerekçe                                                                                                                                 |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | `ember` silinir. `default` bugünkü `VOL_COLORS` değerleriyle kalır; ikinci tema `aurum` sıfırdan tasarlanır.                                                                              | İkinci tema birincinin yakın akrabasıydı; kullanıcı kimlik farkı ister.                                                                 |
| D2  | Üretilmiş ikon/çerçeve/doku/imleç hattı (eski varlık üretici hattı) ve eski 12 olaylık UI ses seti silinir; yerine kürate varlık ve yeni ses seti gelir.                                  | Tüketicisiz, kabul edilmemiş, stil dışı çıktılar ağırlık ve yanıltıcı "tamam" üretiyordu.                                               |
| D3  | UI ses sınıfı politikası güncellenir: gövde bandı zorunludur, yükseklik aralığı referanslara göre açılır, 200 Hz süzgeç/sub-bastırma kuralı kalkar.                                       | Önceki kural hissiyatı öldürüyordu; ölçüt referans ölçümüne ve gövde/vurgu oranına bağlanır.                                            |
| D4  | Ses kiti uygulama kökünde (UIRoot) bağlanır; bileşen sesi sahiplenmez, niyet bir kez bildirilir (mevcut niyet katmanı korunur).                                                           | Slider/stepper/hover sessizliği "bağlanmamış mekanizma" kusuruydu.                                                                      |
| D5  | İmleç iki taşıyıcıdır: küçük CSS imleci ve büyük/dinamik nişangâh için yazılım imleci. Dokunmatikte devre dışı; kol işaretçisi (mevcut) ile tek sahip.                                    | Tarayıcılar imleç görselini sınırlar (≥128 px yok sayılır, 32 px önerilir); nişangâhın açılıp kapanması ancak çizilen imleçle akıcıdır. |
| D6  | Piksel temeli: `win32` kanonik. Linux temeli bu makineden yenilenmez (WSL'de 6/12 yeniden üretilebildi); görsel kimlik değişiminde Linux hücresi gerekçeli NOT-RUN'dır. Tolerans açılmaz. | Doğrulanmamış temeli sessizce yenilemek sıfır tolerans kapısını anlamsızlaştırır.                                                       |
| D7  | E2E katmanlıdır (`high`: smoke + kritik etkileşim; `ui-check`/`signoff`: tam matris).                                                                                                     | Süre kontrolsüz büyümesin.                                                                                                              |
| D8  | Dilim kuralı: bir dilim tek mantıksal değişiklik + test + belge/katalog güncellemesi; `quick` commit'te, `fast` görev sonunda, `high` dalga sonunda, `signoff` UI-02 ve UI-13'te.         | Geri alınabilirlik.                                                                                                                     |
| D9  | UI-11.1/UI-12.1 F04'ün eski sonuç/odak/sağlayıcı temizliğini tekrarlamaz.                                                                                                                 | İkinci sahip çelişki doğurur.                                                                                                           |
| D10 | Kanıt kayıtları vitrin paketinin git dışı records alanındadır; kimlik/cihaz numarası depoya girmez.                                                                                       | Kök AGENTS.                                                                                                                             |

## Bağımlılık ve dalgalar

| Dalga | Kapsam                                                                                                                | Çıkış (hepsi gerçek, görülür/duyulur kanıt)                                                                                                            |
| ----- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | Kimlik: UI-01.6–01.9, UI-02.6–02.8 (paralel hatlar); UI-07.2–07.3; UI-06.2–06.4 (Windows native)                      | İki skin yan yana; gerçek ikon/imleç; yeni ses seti uygulamada duyulur; native Windows vitrin açılır.                                                  |
| 2     | UI-01.10 + UI-02.9 → **UI-03 dikey dilim (Button)** → UI-04/05/08/09/10 aileleri; UI-07.4; UI-11.1–11.2; UI-12.2–12.3 | Bir bileşen ailesi malzeme+ikon+imleç+ses+juice ile uçtan uca; görsel/ses teknik matrisi; isteğe bağlı tasarım feedback’i; aileler aynı dille yayılır. |
| 3     | UI-11.3–11.4, UI-12.1, UI-12.4, UI-13                                                                                 | Cihaz/insan kabulleri PASS/FAIL/NOT-RUN ayrı raporda; `signoff`; F07 kapanışı.                                                                         |

Sert ön koşullar: UI-01.7 → UI-03; UI-02.8 → UI-03; UI-03.4 → UI-04/05/08/09/10; UI-05.1 → UI-09, UI-11.1;
UI-07.1 (tamam) → UI-08; UI-06.2 → UI-11.3/12.4. Aynı dosyaya dokunan görevler seri, farklı
dizinlere dokunanlar paraleldir. Kritik yol: UI-01.7 + UI-01.8 + UI-02.8 → UI-03.4 → en uzun
aile (UI-05 + UI-09) → UI-13.

**F07 kapanış tanımı:** bütün görevler kapanmış (kod/kapı ve bağlı cihazlarda ölçülebilen kabul), cihazdan bağımsız kalan her NOT-RUN gerekçeli ve kök F08/F09'a devredilmiş,
`pnpm signoff` geçmiş olmalıdır.

## Gerçek kalan iş (2026-10-11)

**F07 KAPALI DEĞİLDİR.** 17 UI görevi açıktır; `pnpm signoff` (UI-13.5) koşulmadı; push yapılmadı. Aşağıdaki tablo ilgili görevlerin kendi
metinlerindeki "Kalan/Açık" notlarından derlenmiştir; kalan "cihaz" satırları Deck/Lenovo bağlı olduğu hâlde henüz çalıştırılmadı (UI-08.3 Lenovo koşusu hariç).

| Görev        | Gerçek kalan iş                                                                                                                                                                                                                       | Tür               |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| UI-03.3      | VOL.TEST duraklatma/ayarlar hit-test'inin Deck host koşusu; Slider adı için gerçek AT                                                                                                                                                 | cihaz + insan     |
| UI-03.4      | İlk yanıt p95<100 ms (WebKit başsız 105–115 ms), CPU/sunum profili, ses kulak kabulü                                                                                                                                                  | cihaz + insan     |
| UI-06.4      | Deck: SLR4 açılış, kare ve canvas yapıldı (2026-10-10); kalan OGG/UI sesi çıkışı, fiziksel kol, ısınmış 10 dk performans/MangoHud, gamescope satır gizleme; Windows tarafı yapıldı                                                    | cihaz             |
| UI-08.4      | Erken tier-1 kapsam kontrolü: ScrollView referans klavye/odak/overscroll kanıtı; UI-03/04/05/08 applicable durumlarının assertion'a bağlanması; kalanlar görünür kalan iş (UI-08.1–08.3 2026-10-11 kapandı)                           | kod               |
| UI-09.1–09.3 | ContextMenu/RadialMenu/Popover/FatalStartupError yayılımı, juice/ses kapsamı, 3 katmanlı yığın, %200/IME odak; dokunmatik tooltip alternatifi; Kanban/KeyBindingList %30/%200/RTL (UI-09.4 tamam: insan/cihaz kabulü UI-13.3/13.4'te) | kod + insan (AT)  |
| UI-11.3–11.4 | **Hiç başlanmadı:** Android Activity/ActionMode/Insets ve Metin Girişi sekmesi + fiziksel APK (Lenovo Android 14 ve Samsung SM-G990B2 / Android 16 bağlı)                                                                             | kod + cihaz       |
| UI-12.2–12.3 | Fiziksel Deck düğmeleri, Steam Input yeniden bağlama, çoklu kol; haptik uyku/odak kaybı/cihaz çıkarma gerçek sondası; hissiyat beyanı                                                                                                 | cihaz + insan     |
| UI-12.4      | NSIS derleme/yükleme/kaldırma/açılış, WebView2, DPI 125/150/200, font/input/clipboard/back; release derleme kare/CPU atfı                                                                                                             | cihaz (Windows)   |
| UI-13.1–13.2 | Tam tier-1/M3 ve katalog kapanışı (ertelenmiş applicable durum ve AA bulgusu sıfır); modal→Select→OSK→IME zinciri, istek beklerken tema değişimi, %200/RTL stres                                                                      | kod + insan (IME) |
| UI-13.3      | Windows/Deck host+SLR4/Android aynı örnekle A/B, 10 dk termal, UI maliyetinin toplam FPS'ten ayrılması                                                                                                                                | cihaz             |
| UI-13.4      | Gerçek AT (NVDA/Narrator/TalkBack), klavye/kol akışı, gri ton, glif yüksekliği, haptik, ses kulak kabulü — **yalnız insan; sahte PASS yazılmaz**                                                                                      | insan             |
| UI-13.5      | `pnpm fast`/`high`/`signoff` yeşil, piksel temelleri incelenmiş, belgeler güncel, push; **F07 yalnız burada kapanır**                                                                                                                 | kapanış           |

Henüz koşulmayanlar: tam `node scripts/e2e.mjs`, `pnpm fast`/`high`/`signoff`, Deck oturumları (tam core vitest 2026-10-11'de koşuldu: 249 dosya / 3394 test geçti;
Lenovo `hudInteraction` dikey/yatay/%200 yazı koşuldu). Cihaz bağımsız her iş bittiğinde sıradaki kapı bunlardır; cihazlar bağlı olduğundan cihaz satırları "NOT-RUN" değil "yapılacak"tır.

### Yapılamayan/NOT-RUN kalacak kabuller

Kod fazını bloklamaz, sürümü bloklar ve PASS sayılmaz: Steam Deck host/SLR4 açılış, kol-only,
glif yüksekliği ve ısınmış performans (UI-06.4, UI-12.2–12.3, UI-13.3; F08), Samsung/Android 16
hücreleri (UI-11.4, UI-13.3), gerçek Steam runtime metin sağlayıcısı (UI-12.1; F04.4/F08.6), gerçek
Safari/iOS Ogg çözümü, Playwright WebKit'in AudioContext sınırı, insan erişilebilirlik/haptik
değerlendirmesi ve yeni UI ses setinin insan dinleme kabulü (UI-13.4; ölçüm setin koyu ve
gövdeli olduğunu gösterdi, VERIFICATION "Referans ölçümü ve kulak"). Bağlı cihazda **yapılabilen** her ölçüm yapılır.

## Açık

### UI-00 — Kabul altyapısı

Tamamlandı (Kapatılanlar). Registry, iki motorlu E2E, axe, geometri, kare ölçümü ve native ölçüm
yolları hazırdır; yeni iş bunları kullanır, çoğaltmaz.

### UI-01 — Görsel kimlik ve malzeme dili

Sahip CORE UI. Tema/yoğunluk/hareket sahipleri (UI-01.1–01.3, 01.5) hazırdır; bu faz o zeminin
üstünde ürün kimliğini kurar.

Faz testi: tema/malzeme/ikon/imleç modül adlı testleri, colorSync/cssConstantSync/publicSurface,
iki motor E2E (geometri, axe, kare ölçümü), piksel temeli (win32).

### UI-02 — Ses kimliği ve geri bildirim

Sahip CORE geri bildirim + audio-synth üreticisi + uygulama adaptörü. Niyet katmanı, ses kiti,
titreşim sağlayıcısı, kısma ve laboratuvar mekanizması hazırdır (Kapatılanlar); **ses setinin
kendisi sıfırdan yeniden yapılır.**

Faz testi: CORE/audio testleri, audio production-check, asset verify, public yüzey kilidi, `signoff`.

### UI-03 — Button dikey dilimi / M1

Ön koşul UI-01.7, UI-01.8, UI-02.8 ve UI-00.6 probu; sahip primitives/buttons. Kimliğin ilk uçtan
uca örneğidir: malzeme + ikon + imleç + ses + juice bir arada. Diğer ailelere kör CSS yayılımı yok.

- [ ] **UI-03.3 — Aktif oyun regresyonları.** VOL.TEST duraklatma/ayarlar tüketicisinde
      Button/IconButton/Hold gerçek yerleşim/geri/Slider adı ve hit-test; yeni menü yok.
      Kapanır: gerçek ayarlar/duraklatma Chromium+WebKit ve eldeki cihazda; eski duraklatma
      sesleri yeni sağlayıcıyla çift çalmaz; oyun SFX/ambiyans değişmez.
      Yapıldı (2026-10-08): `games/vol-test/tests/e2e/pause.spec.ts` (iki motor, 1280×800): her denetim
      adlı, ekrana sığar ve merkezi hit-test ile kendisidir; odak katmanda açılır, Escape kapatır ve
      oyun devam eder; Devam Enter ile kapatır ve yeniden açılır. **Gerçek kusur bulundu ve kapandı:**
      800 px yükseklikte (Deck) panel içeriği taşıyor (757 > 678) ve "Devam et" düğmesi panelin altında
      kırpılıp tuvalin altında kalıyordu → düğme panel içinde sabit (`position: sticky`). Tabletle
      (Android 14, dikey/yatay) aynı ölçüm: tüm denetimler 44 px, "Devam et" görünür. Çift ses
      `GameAudio.test.ts` ile kanıtlı; tüm vol-test e2e 33 geçti. Kalan: Deck host koşusunda (VOL.TEST
      yerel paketi) aynı hit-test, Slider adı için gerçek AT (UI-13.4).
- [ ] **UI-03.4 — Dikey dilim teslimi.** İki skin önce/sonra, %30 uzatılmış etiket, 6 hane,
      hareket kaydı, ses ve imleç örnekleri, fare/kol/dokunma. Kapanır: ilk yanıt p95<100 ms,
      CPU/sunum profili, başlangıç farkları tek tek incelenir; **kullanıcı görsel + ses
      kabulü kayıtlı** (reddedilirse yayılım durur, kimlik düzeltilir).
      Görsel kimlik kabulü 2026-10-07'de kayıtlıdır ([VERIFICATION](VERIFICATION.md)); bu görevde kalan
      kabul ses (kulak) kararı ve cihazda canlı histir.
      Açık ölçüm bulgusu: başsız WebKit'te girdi→kare p95 ≈105–115 ms (`latency.spec.ts` bunu `fail` kararıyla
      rapora yazar, kapı yapmaz; ölçüm kendi harnesinde ≈85 ms çıkar, izleme maliyeti dahil spec'te yüksek).
      İlk bulgudan sonra KİMLİK sekmesi hafifletildi (hücre başına veri URL'li imleç yerine üzerine gelince
      kurulum; ikon galerisi kategori seçicili, DOM'da tek kategori). En ağır sekmeler FORMLAR, KİMLİK, DOKUNMATİK;
      UI-03.4 kapanışında p95<100 ms'ye indirilir.
      Prob kalibrasyonu notu: WebKit'te (iz yok) 20 ms'lik iş farkı büyüklük olarak doğrulanamaz (kare sınırı ve
      olay damgası); `probe.spec.ts` orada yalnız yönü (ağır > hafif) kanıtlar, Chromium'da büyüklüğü (≥12 ms) ve
      ortalama kullanır. İlk eşik makine durumuna göre sınırda oynuyordu.

Faz testi: Button/IconButton/Toolbar modül adlı testleri, interactionContract/valueInteractionContract, gerçek oyun E2E.

### UI-04 — Kartlar / M2

Ön koşul UI-03.4. Sahip `core/src/ui/cards/`. Yeni skin ile; rarity renkleri kimliktir.

Tamamlandı (Kapatılanlar): kart yüzeyi, seçici durumları, deste alternatifleri ve kart kabulü. Kullanıcının
görsel/ses değerlendirmesi, referans-özgün fark incelemesi ve Deck kol hücresi NOT-RUN (UI-13.4/F08).

### UI-05 — Panel, form ve ayarlar

Ön koşul UI-03.4. Sahip primitives/layout/overlays; yeni ayar paneli icat edilmez.

### UI-06 — Tek VOL.SHOWCASE ve Windows native temel / M4

UI-06.1 tamamlandı. UI-06.2–06.4 UI-05'i beklemez. Oyun kaynaklarına bağımlılık kurulmaz.

- [x] **UI-06.3 — Platform ayarı ve görünür kabuk** (teknik; Deck gamescope turu ve Android APK NOT-RUN, sahip UI-06.4/F08/F09). **Vitrin gerçek platform bağına kavuştu** (`PlatformServices`, `devtools/vol-showcase/src/platform.ts`): kabuk türü ve oturum sınıfı `tauri-v2`den okunur, ekran başına tercih (`device.volui:display`) `createScopedStores` ile tutulur, masaüstü native'de `DisplayModeController` Tauri penceresini sürer (başlık düğmesi, F11 ve ayar satırları aynı tercihi paylaşır), gamescope'ta pencere kipi/çözünürlük yetenek tablosundan sunulmaz ve pencere denetleyicisi kurulmaz, Android'de pencere kipi yoktur ve yalnız titreşim sürücüsü kaydolur; web (`pnpm dev`) yedeği localStorage + tarayıcı tam ekranıdır ve ayar kartındaki oturum seçici açıkça simülasyondur. Ayar kartı gerçek özeti gösterir ("Çalışma ortamı … · oturum …"). **Windows yerel turunda (`native-platform-tour.mjs`, WebView2 + CDP, 15/15) bulunan gerçek kusur:** pencereli kipe dönüşte `window.center not allowed` — `center` izni hiçbir uygulamada verilmemişti (VOL.TEST dahil; boyut uygulanır, ortalama sessizce düşerdi) → izin iki masaüstü yeteneğine eklendi ve `validateWindowPermissions` kapısı (`TauriWindowAdapter` çağrıları ↔ pencereyi süren uygulamaların izinleri) yazıldı. Tüketicisiz `vol-orientation` eklentisi vitrinin Android kaydından, bağımlılığından ve yeteneğinden çıkarıldı (ölü yüzey); `tauri-v2` kök barrel'ı Phaser çektiği için tarayıcı sınırı derlemeyi düşürüyordu → üç import `@volstudio/core/platform` ve `/persistence` alt yoluna alındı. Kanıt: `platform.test.ts` (13: web yedeği, native sürücü başlangıç/dinleyici/kalıcılık, bozuk/okunamayan/yazılamayan kayıt, gamescope, Android gözlemcileri, destroy, dil değişiminde abonelik sızıntısı yok, eklenti yüzeyi tüketiciyle sınırlı), `tauriPlugins.test.mjs` (pencere izni, 6), iki motorda `displaySettings`, `formAcceptance`, `pseudoLocale`, `layout`. Kayıt: [VERIFICATION](VERIFICATION.md) "Platform bağı kaydı".
- [x] **UI-06.2 — Native crate ve kapı kapsamı.** vitrinin kendi `src-tauri` dizini ortak
      `tauri-v2` kütüphanesini tüketir; kendi kimliği/ikonu/asgari yetenekleri; kök Cargo
      glob/tek lock. AppIdentity, plugin üçlü kayıt ve productIcons native uygulama keşfi.
      Kapanır: yinelenen/eksik kayıt örneği düşer; bundle.category/desktop Categories Game
      kopyası değildir.
      Yapıldı (2026-10-08): `devtools/vol-showcase/src-tauri` (kimlik `studio.vol.showcase`, ürün adı
      VOL.UI, masaüstü/mobil capability, `tauri.dev.conf.json`, Linux `.desktop`/AppRun şablonu, ikon
      kaynağı) ortak `volstudio_tauri_lib::run_with_context_and` kütüphanesini tüketir; `tauri` betiği
      ve `@tauri-apps/cli` 2.11.4 pakette. Windows'ta derlenir ve açılır (ekran görüntüsü), WSL Ubuntu
      24.04'te Linux AppImage üretilir. Kapı kapsamı: appIdentity, cihaz adayı ve eklenti üçlü kaydı
      yaşam döngüsü/manifest keşfinden vitrini zaten kapsar (`just quick` yeşil); `productIcons` yalnız
      `games/` altına bakıyordu, artık aktif her native kabuğu (vitrin dahil) tarar ve birim testle sınanır;
      `bundle.category` DeveloperTool, masaüstü `Categories=Development` (oyun kopyası değil); `just rust` yeşil.
- [ ] **UI-06.4 — Windows temel ve ayrı Linux/Deck teslim.** İlk native Windows açılışı ve
      WebView2 kare/CPU sondası teknik referanstır; AppImage/steamrt4 AppDir ve `pnpm deck`
      sözleşmesi. Kapanır: laptopta görünür native pencere; Deck host+SLR4 açılış/OGG/UI sesi,
      yalnız kol, ekran görüntüsü ve ısınmış performans (cihaz bağlıysa ölçülür, değilse NOT-RUN);
      compile/devkit stub PASS sayılmaz; desteksiz metrik açık engeldir.
      Yapıldı (2026-10-08): **Deck'te yerel vitrin açıldı** (HOST derlemesi; SLR4 DEĞİL): AppDir `pnpm deck deploy` `appdir` seçeneğiyle
      (+ `compat_tool` kısayol düzeltmesi) ile yüklenir, Game Mode'da 1280×800 çizilir; 14 sekme,
      iki skin, OSK ve katmanlar `gamescopectl` ekran görüntüsüyle incelendi (`docs/ui/VERIFICATION.md`).
      Bulunan ve kapanan: AppImage'a giren Ubuntu libwayland/xcb Deck Mesa'sıyla karışıp WebKitWebProcess'i
      EGL hatasıyla düşürüyor (pencere boş) → `build-appimage.mjs` bu kütüphaneleri pakete koymaz; vitrin
      `lang` özniteliği yerleşimden sonra atandığı için WebKit'te "SETTİNGS" (Türkçe İ) çıkıyordu → atama
      sayfa kurulmadan önce. **Bulgu (2026-10-10'da kapandı):** gamescope kuralındaki DMA-BUF açık yolunda 2D canvas
      boş (Curve Editor), kapalıyken çiziliyor; HOST'ta ve SLR4'te de boş olduğu ölçüldü, küçük arayüz tuvalleri CPU
      tuvaline alındı ve SLR4'te doğrulandı (aşağıdaki 2026-10-10 Deck kaydı).
      Kol: OS düzeyi sanal Xbox kolu (`devtools/deck/scripts/virtual-pad.py`) Steam Input üzerinden D-pad/RB/A ve OSK yazımını sürdü (fiziksel düğme değil).
      Yapıldı (2026-10-10): **Windows yerel kare/CPU sondası** (`devtools/vol-showcase/scripts/native-frame-probe.mjs`, WebView2 + CDP,
      A/A iki koşu; debug derleme, 60 Hz, DPR 1,25): 14 sekmenin 13'ü 60,0 FPS, `cards` 59,7 (her koşuda tek 33 ms kare), A/A farkı 0 FPS /
      0,01 çekirdek; **boşta CPU A/A gürültüsü ±0,3 sn/5 sn**. Boşta atfı: ≈%80'i ekranda görünen yükleme döndürücüsünün 60 Hz kare üretimi
      (animasyon durunca 1,0–1,3 → 0,2–0,3 sn), kusur değil. CPU profilinde tek anlamlı JS maliyeti `querySelectorAll` (162 ms/5 sn) çıktı: gerçek
      kusur — `InputPresentationController` glifleri her karede (oyunda her HUD karesinde) belgeyi tarıyordu, `GamepadPointerController` kol
      yokken modal arıyordu → değişiklik/kol bazlı; ayrıca kapalı `DialogueBox` okunun saydam sonsuz animasyonu yalnız görünürken oynar
      (`idleCost.spec.ts`; boşta CPU'yu ölçülebilir azaltmadı, tasarruf iddia edilmez). Kayıt: [VERIFICATION](VERIFICATION.md) "Windows yerel kare ve CPU kaydı".
      Yapıldı (2026-10-10): **Deck SLR4 derlemesi ve açılışı** (`pnpm build:linux-steamrt4`, docker; 280 ELF'in hepsi ≤ GLIBC_2.41;
      `pnpm deck deploy` + `run`): LCD Deck, gamescope, 1280×800, tek `VOL.UI` süreci. Uygulama içi kare ölçeri (`Shift+B`, sanal
      klavye `devtools/deck/scripts/virtual-keys.py` ile): 15 sekmenin tamamı 57,8–60,6 FPS, ortanca 59,5 (en düşük TEXT 57,8; Tema
      60,0). Gamescope'ta tam ekran düğmesi görünmez, dil düğmesi boşluğu doldurur; Tema sekmesinin oturum satırı "desktop · gamescope ·
      fullscreen: not offered" der. **2D canvas bulgusu SLR4'te de vardı** → `CurveEditor`, `MinimapPanel` ve dokunma sekmesi tuvalleri
      `willReadFrequently` CPU tuvali ister; yama sonrası SLR4'te Curve Editor, HUD'daki Minimap ve Tema sekmesindeki üç kapsamın
      tuvalleri çiziliyor (ekran görüntüsü). Ölçüm tuzakları belgelendi: kalan ikinci `VOL.UI` süreci FPS'i yarıya indirir; Prettier
      `.desktop` şablonunu tek satıra birleştirip boş pencere üretmişti (şablon `.prettierignore`da, testli). Ayrıntı:
      [steam-deck.md](../steam-deck.md).
      **Açık (gerçek iş):** Deck'te OGG/UI sesi çıkışı, fiziksel kol/arka tuş (Steam Input yeniden bağlama UI-12.2), ısınmış 10 dk performans
      ve MangoHud/gamescope sunum istatistiği, gamescope'ta pencere ayar satırlarının gizlenmesi, dokunma sekmesi tuvalinin Deck'te
      doğrulanması; host derleme ile SLR4 aynı örnekle A/B (UI-13.3); Windows release derleme ve DPI 125/150/200 koşuları (UI-12.4).
      Görev bunlar ölçülene kadar AÇIK kalır.

Faz testi: quality/appIdentity/productIcons/catalog/layers/ports/cargo/plugin fixtures, contract/rust/build/bundle, iki motor E2E, gerçek native sonda.

### UI-07 — i18n, font ve tema yayılımı / M5 + M6

UI-07.1 tamamlandı (AST çeviri kapısı). Mevcut i18n motoru yeniden yazılmaz.

- [x] **UI-07.2 — Çoğul/biçim/RTL ve uzunluk.** i18next JSON `count` + Intl; tablo/sayı hizası;
      deterministik %30 uzatılan yapay dil; `lang`/`dir`, logical CSS/ok/picker/swipe; RTL sınaması
      gerçek çeviri iddiası taşımaz. Kapanır: 0/1/çok, tarih/birim/6 hane, Türkçe ı/İ;
      görüntüleme sıralaması manifest/replay sırasına sızmaz; %200/320 px etiketler kırpılmaz.
      Yapıldı (2026-10-08): vitrine `?lang=pseudo` (deterministik %30 uzun, aksanlı sahte dil; gerçek çeviri
      değil) ve `?dir=rtl` eklendi; `pseudoLocale.spec.ts` (iki motor) 14 sekmeyi 1280/360/320 px ve LTR/RTL'de,
      altı açık katmanı (modal, sheet, onay, popup, popover, seviye/mağaza seçici, diyalog, komut paleti, OSK)
      360/1280 px'te kırpılma ve kapsayıcıdan taşma için tarar. Bulunan ve kapanan gerçek kusurlar: telefonda
      sekme paneli 48 px yan boşlukla içeriği ~160 px'e sıkıştırıyordu (dar ekranda 16 px), altı kart 40 px'lik
      sütunlara ezilip harfler dikey diziliyordu (`auto-fit` + 140 px), BuildMenu 10 sabit sütunda etiket ve
      maliyet düğmesinden taşıyordu (`auto-fill` 72 px, dolgu alanı kullanımı), KeyBinding Reset düğmesi,
      kart nadirlik etiketi, diyalog konuşmacı plakası, kart ve sihirbaz alt çubuğu, segmented kontrol ve OSK dil
      tuşu (telefon dikeyinde üst üste) taşıyordu; SlotGrid etiketi ve Select değeri üç nokta ile kısalır ve tam
      metin `title`dadır. İki eski geometri kaydı (BuildMenu, kart eylemi telefon örtülmesi) bayatladığı için
      silindi. Yapıldı (2026-10-10): **çoğul sözleşmesi** — sayıya bağlı cümleler i18next yerel
      `anahtar_one`/`anahtar_other` anahtarlarını kullanır (kategoriler `Intl.PluralRules`tan); çeviri kapısı grubu tek anahtar
      sayar, her dilin kategorilerini ve elle çoğul çiftini (`xOne`/`xMany`) denetler. Bulunan gerçek kusurlar: ayar formu çoğulu kodda
      elle seçiyordu (`unsavedOne`/`unsavedMany`); mini harita okuyucu özeti İngilizcede "1 markers" yazıyordu ve altı hane ayırıcısızdı
      → `{{count, number}}`; `Select` harfle gezinmesi sistem yerelinde küçültüyordu (Türkçe klavyeden `I` → `i`, "Işık" bulunamıyordu; arayüz
      diliyle düzeltildi). Kanıt: `plurals.test.ts`, `settingsModel.test.ts`, `minimapPanel.test.ts`, `selectionControls.test.ts`,
      `i18nSurface.test.mjs` (düzeltme olmadan kırılan testlerle). Yapıldı (2026-10-10, ikinci dilim): **tarih/birim/yüzde** — kit kendi biçimleyicisini yazmaz; i18next `datetime`/`number(unit|percent)` biçimleyicileri etkin arayüz diliyle `Intl`e devredilir (`formats.test.ts`: beklenen değer açık dil koduyla `Intl`den, iki dilin çıktısı farklı). Vitrindeki elle birleştirmeler tüketiciye çevrildi: olay günlüğü saati elle 24 saat idi (İngilizcede `12:00:00 AM` olmalı), sayaç para biçimi `tr-TR`ye sabitti, Zoom yüzdesi ve saniye birimi elle yazılıyordu (`localeFormats.spec.ts`, iki motor, tr-TR/en-US tarayıcı yerelinde; İngilizce saat testi eski kodla kırılır). **%200 yakınlaştırma**: `pseudoLocale.spec.ts` 640×400 CSS görünümünü (1280×800 pencerenin %200'ü) 14 sekme × LTR/RTL + altı açık katman için iki motorda tarar, kırpılma/taşma yok. **RTL açılır pencere yönü**: `Popup` konumlaması fiziksel sola hizalıyordu; RTL'de `Select`/`Popover`/`ColorPicker`/`ContextMenu` penceresi okuma başlangıcından uzak açılıyordu → `start`/`end` mantıksal kenar oldu (`direction.ts`), taşarsa karşı kenara çevrilir; `popupDirection.test.ts` düzeltme olmadan kırılır, `inlineDirection.spec.ts` Select ve Popover'ı iki motor × LTR/RTL ölçer. **NOT-RUN (gerçek çeviriyle uzunluk):** TR/EN dışında gerçek çeviri yok; %30 uzun sahte dil gerçek çeviri iddiası taşımaz. Üçüncü dil getiren ilk ürün (F09.4 VT7 i18n sözleşmesi) o dilin kaynağını aynı `?lang=` kancasıyla taratır; kitte yapılacak kod işi kalmadı.
- [x] **UI-07.3 — Font varlığı.** Mevcut font hattı ve subset manifesti; lisans/kaynak, gerçek
      glif sınırları, Türkçe kapsamı, yedek font tabanı/satır yüksekliği, soğuk önbellek; oyun
      hissine uygun başlık/sayı yazı tipi seçimi gözden geçirilir. Kapanır: font-ready ve yükleme
      hatası örneği; asenkron font yerleşimi kaydırmaz; Deck glif yüksekliği gerçek ekranda;
      Android %200 font ölçeği ayrı native sonda.
      Yapıldı (2026-10-08): **glif kapsamı ölçüldü** (`scripts/quality/fontCoverage.mjs`, TTF `cmap`
      ayrıştırması; `fontCoverage.test.ts` her yerel dosyayı tarar): Jura ve Exo 2'de Türkçe harfler
      (ÇĞİıÖŞÜçğöşü), rakamlar, noktalama, ₺ € $ ve − tam; **ok ve üçgen glifleri (→ ← ↑ ↓ ▸ ▾ ▲ ▼) yok**,
      bunlar arayüzde kullanılıyordu ve sistem yedek fontuna düşüp platforma göre farklı çiziliyordu →
      sıralama göstergesi ve ağaç oku CSS üçgeni, tuş etiketleri sözcük ("Left Arrow"), vitrin metinlerinde ok yerine
      sözcük ve bağlam menüsü tetikleyicisinde ikon. Eksik glif yeni metinde kapıyı düşürür. Lisans dosyaları
      (OFL) pakette.
      Yapıldı (2026-10-10): **boyut/subset kararı**: alt kümeleme ve WOFF2 yok (ölçüm: TTF 865 KB → WOFF2 295 KB → alt kümeli
      144 KB; hedefler yerel paketlerdir, alt küme Kiril/Yunan/Vietnam kapsamını düşürür); `fontCoverage.test.mjs` bütçesi
      toplam ≤ 900 KB, dosya ≤ 320 KB, Exo 2 Kiril ve Jura Yunan korunur. **Yükleme hatası ve asenkron yerleşim**
      (`fontLoad.spec.ts`, iki motor): yavaş yazı tipinde uygulama yüklenmiş yazı tipiyle kurulur, 15 sekme yüksekliği
      kurulumdan sonra birebir aynı, Chromium CLS 0; istek iptal edilince "Font yüklenemedi" uyarısı, sistem yedeğiyle
      açılış, taşma/kırpılma yok. **Yedek yazı tipi tabanı**: yedek/yüklü sekme yüksekliği farkı tarayıcıda en fazla −%3,8
      (eşik %10), Lenovo'da en fazla −%3,5 (eşik %15). Ortak taşma tarayıcısı `devtools/vol-showcase/tests/e2e/support/textFit.ts` (pseudo-locale ve
      cihaz). **Cihaz yazı ölçeği taraması** (Lenovo, `device-ui.mjs --font-scale 2.0`, iki yön, 14 sekme): bulgu 0, ama
      Chrome `font_scale`i CSS px'e uygulamadı (düğme 44, yazı 16, kök 16 px), bu yüzden %200 kanıtı SAYILMAZ.
      **Glif yüksekliği kusuru kapandı:** Jura 12 px büyük harf mürekkep yüksekliği 8 ekran px'ti (Valve alt sınırı 9; Deck'te kart başlığı etiketi 8 px ölçüldü), `geometryExceptions.json`daki üç bilinen kusur (Jura 12 px w400/w600, WebKit `monospace`) bu görev içinde çözüldü: `--vol-text-micro`/`--vol-text-label` 13 px, açık monospace yığını; kayıt listesi boş. Etki: etiketler 1 px büyür, sayfalar 3–65 px uzar, 42 görsel taban çizgisi bilerek yenilendi (+ Tema sekmesi için 1 yeni).
      **Deck glif yüksekliği** gerçek ekranda ölçüldü (gövde Exo 2 16 px büyük harf 11 px = 1,30 mm; küçük etiket düzeltme
      öncesi 8 px = 0,94 mm, **düzeltme sonrası SLR4 derlemesinde 9 px = 1,06 mm**; kare ölçeri 15 sekme ortanca 59,8 FPS).
      Tam tablo: [VERIFICATION](VERIFICATION.md) "Yazı tipi boyutu ve yedek kaydı".
      **NOT-RUN (gerekçeli, devredildi):** Android'de gerçek %200 yazı/WebView ölçeği (APK WebView koşusu → UI-11.3 ve
      F09.2); glif yüksekliğinin ve okunabilirliğin insan kabulü (UI-13.4).
- [x] **UI-07.4 — Tema laboratuvarı ve üst bar (kalan).** Yapıldı: vitrin üst çubuğunda skin
      düğmesi (`ThemeController`, kök `data-vol-theme`, seçim `localStorage`'da kalır, bilinmeyen
      kayıt varsayılana döner; `skin.spec.ts` iki motorda), skin ses paletini ve imleç aksanını
      değiştirir; üst çubuk çekirdek bileşenleriyle yeniden kuruldu (UI-01.7 notuna bakın). Kapanır: 2 skin × 3 yoğunlukta
      kontrast/odak; Chromium CLS ve tüm motor geometrisi; geçiş anlık, durum/kaydırma/odak/seçim
      sabit; önizleme kapsamları/body portalları/canvas sabit renkleri (CurveEditor/Minimap).
      Yapıldı (2026-10-10): **Tema sekmesi** (`devtools/vol-showcase/src/sections/themeTab.ts`): küresel skin/yoğunluk/dil seçici, 44 px dokunma
      hedefi anahtarı, oturum satırı (platform, oturum, tam ekran kontrolünün gerçek karşılığı), küreseli izleyen kutu ve iki
      kendi denetleyicili kapsam; kapsamdaki `Select` listesi `container` ile kutuya bağlanır ve kutunun kaplamasını giyer.
      Ortak **`watchTheme`** (`core/src/ui/themes/themeWatch.ts`, genel API): `CurveEditor` ve `MinimapPanel` kaplamayı
      izler (Minimap'in kendi uzun gözlemci düzeneği buna indi). Bulunan ve düzeltilen çekirdek kusurları: `CurveEditor`
      kaplama değişince eski renkte kalıyordu; `SettingsRow` dar kapsayıcıda etiket sütununu sıfıra sıkıştırıyordu
      (additive `@container` kuralı); `Select` yeni değer seçilince odağı gövdeye düşürüyordu (WCAG 2.4.3); `SegmentedControl`
      ok tuşunda yeniden kuran tüketicide (dil) odağı eski segmentte bırakıyordu (bu ikisinin testi düzeltme olmadan
      KIRILIR); Palette sekmesi skin değişince eski değeri gösteriyordu; dil değişimi kaydırmayı ve odağı kaybettiriyordu;
      açık `Select` listesi varken LB/RB sekmeyi değiştirip listeyi sahipsiz bırakıyordu (Deck'te gözlendi: vitrin omuz
      düğmelerini açık katmanda yutar, `Popup` tetikleyicisi kalkınca kapanır; testler düzeltme olmadan KIRILIR). Kanıt:
      `themeLab.spec.ts` (iki motor, 18/18), `themeMatrix.spec.ts` (axe ihlal 0, 5 kombinasyon × 15 sekme, Chromium; odak
      göstergesi ve geometri iki motor; skin geçişi CLS < 0,0001, Chromium), `themeWatch.test.ts`; gerçek cihazda Deck SLR4
      (Tema sekmesi 60,0 FPS, üç kapsamın tuvalleri kendi kaplamasında çizilir) ve Lenovo dikey+yatay. Tam tablo:
      [VERIFICATION](VERIFICATION.md) "Tema laboratuvarı ve skin × yoğunluk kaydı". **Belgeli sınırlar:** yoğunluk
      değişince WebKit'te görünen içerik birkaç on piksel kayar (çapa yok); dil değişiminde diğer sekmelere girilmiş metin
      korunmaz. **NOT-RUN:** aurum skininin insan göz kabulü (UI-13.4).

### UI-08 — HUD ve erken tier-1 kapsam kontrolü

Ön koşul UI-03.4, UI-07.1. Sahip feedback/hud/tarif; oyun durumunu sunum tutmaz. Bullet hell ve
RTS HUD'ı: bakış sürekliliği, yüksek kontrast, büyük/okunur sayı.

- [x] **UI-08.1 — Bar/XPBar/Counter/ResourceCounter/ResourceBar/TimerBar/RoundCounter/
      FloatingTextManager.** Yeni bar malzemesi (segment, parlak bant, hasar gecikmesi), sayı
      tween/pop, boş/dolu/geçersiz eşik/çoklu kazanım/6 haneli düşüş/meşgul/hata, role/valuetext,
      opt-in applyXPGain. Kapanır: reduced-motion sayı/son durum tam; havuzlama/kaynak
      temizliği; TimerBar işlevsel zamanı hareket tokenı sayılmaz; ekran okuyucuya aşırı duyuru yok;
      ödül/hasar sesleri.
      Yapıldı (2026-10-08): `Counter` okuyucu duyurusu birleştirilir (ilk değişim hemen, sıkışıklar 1 sn
      sonunda SON değerle; skor/süre gibi sık yazılan sayaç okuyucuyu boğmaz), `ResourceCounter` kökü artık
      adlı `group` (rolsüz öğedeki `aria-label` yok sayılıyordu) ve duyuru kaynak adını taşır ("Mermi 12")
      (`counterAnnounce.test.ts`). Bar/TimerBar/RoundCounter semantiği zaten `progressbar`/`status`.
      Yapıldı (2026-10-11): kapanış. **Durumlar:** `Bar` boş/dolu/geçersiz (`NaN`/`Infinity`/negatif yok sayılır, eşik
      sıkıştırılır)/meşgul (`setStatus('busy')`: dolgusuz kayan bant, `aria-busy`, değer yok)/hata (`error`: 135° şerit + "hata"
      metni); `XPBar` çoklu seviye (`MAX_LEVELS_PER_XP_GAIN` = 1000 sınırı, geçersiz miktar 0), 6 haneli sayaç düşüşü.
      **Okuyucu:** `aria-valuetext` hedef değerden ve yalnız DEĞİŞİNCE yazılır ("60 / 100", düşükte "…, düşük"), `ariaLabel`
      varken ad o olur ve görünür etiket değer metnine döner (`aria-hidden`), `TimerBar` `valuenow`/`valuetext` ayrı yazılır.
      **Hareket azaltma:** ortak `prefersReducedMotion` (`core/src/ui/motion/reducedMotion.ts`; Carousel/SwipeableCardStack/
      ScrollView'daki üç kopya buna indi); Bar/Counter/XPBar son durumu ilk karede verir, `TimerBar` işlevsel zamandır:
      azaltılmışta AKAR ve hareket bütçesinden hak almaz. **Havuz/temizlik:** `FloatingTextManager` en çok 24 (`FLOATING_TEXT_MAX_ACTIVE`),
      en eskisi geri dönüşür, 16'lık öğe havuzu, `destroy` her şeyi iptal eder, kap `aria-hidden`. **Ödül/hasar sesi:** ödül ve
      düzey sesi ev sahibi niyeti (`getAppSoundKit()?.play`, vitrin XP kartı çalar), hasar sesi oyun SFX'i (UI ses setinde yok) —
      politika CONTRACT §4'te. **Gerçek kusur bulundu:** yüzen metin CSS'i `--critical` seçicileri taşıyordu ama varyant `emphasis`
      idi; vurgu hiç ölçeklenmiyor (0,4'te kalıyordu) → `--emphasis`e çevrildi, e2e ile doğrulandı (≈1,15 / azaltılmışta 1).
      Vitrin: "Gösterge durumları" kartı (Boş/Dolu/Meşgul/Hata/Geçersiz sayı, 6 haneli skor), XP "çok seviye", yüzen metin
      "yoğun çatışma ×60". Kanıt: `core/tests/ui/feedback/hudStates.test.ts` (48; 7 mutasyon yakalandı), `hudStates.spec.ts` (19, iki
      motor 38/38, gerçek saat + `emulateMedia`), Lenovo `devtools/vol-showcase/tests/device/hud.spec.ts` (5/5 dikey, yatay ve %200 yazı). Tür yüzeyi
      +4 ad (`BarStatus`, `FloatingTextManagerOptions`, iki sabit; 819 sembol). Kayıt: [VERIFICATION](VERIFICATION.md) "HUD gösterge
      durumları ve bilgi panelleri kaydı". **NOT-RUN:** ekran okuyucu duyurusu ve ödül/düzey sesinin kulakla kabulü (UI-13.4).
- [x] **UI-08.2 — FpsMeter/MinimapPanel/SelectionInfoPanel/StatsPanel.** VOL.TEST gerçek örnek;
      boyut/zoom/skin; işaretçi kontrastı, renk dışı işaret, ikon. Kapanır: HUD işaretçi/girdi
      katmanı örtüşmesi doğru; mini harita görünümü tüketici modeli; oyun fiziği/performans bu
      göreve karıştırılmaz.
      **Mini harita yeniden yazımı (2026-10-08, kullanıcı ara geri bildirimi: "yüzeysel; geliştirilmeli
      ve VOL.TEST sağlıklı tüketmeli")**. Analiz: her `setMarker`/`setViewport` tüm tuvali yeniden
      çiziyordu (VOL.TEST kare başına iki tam çizim, hareket olmasa da), tuval cihaz piksel oranını
      bilmiyordu (tablette bulanık), renkler sabit beyazdı (tema/kaplama yok), ızgara tüketicide elle
      üretilen bir görüntüydü, dünya sınırı/ölçek/kuzey/kenar göstergesi/halka dalgası yoktu, etkileşim
      yalnız tıklamaydı (sürükleme, tekerlek, klavye imleci, yakınlaştırma düğmesi yok), okuyucuya
      içerik özeti verilmiyordu ve VOL.TEST yalnız oyuncuyu gösteriyordu. Karar ve uygulama:
      `MinimapPanel` (çizim `minimapDraw.ts`ye ayrıldı; eski API aynen): değişiklikler mikro görevle
      çerçeve başına BİR çizime birleşir (`batch`/`flush`), yarım pikselden küçük değişim ve aynı işaret
      hiç çizim istemez (durağan harita CPU harcamaz), tuval DPR'ye göre (en çok 2) ölçeklenir ve boyutu
      CSS değişkeniyle tüketiciye açıktır; palet tema tokenlarından okunur ve kaplama değişince
      yeniden çizilir; yerleşik ızgara (ince çizgiler 9 px altında bırakılır), dünya sınırı, kamera
      görüş alanı (hafif dolgu + köşe ayraçları), işaret şekilleri (nokta/ok/kare/baklava), koyu kenar,
      öncelik, kenar göstergesi, ölçek çubuğu (1-2-5 dizisi), kuzey, `follow`, `ping` (hareket
      azaltılmışta halka büyümez), sürükleme (`onNavigate`), imleç altında tekerlek yakınlaştırma,
      klavye imleci (ok/Enter/+/−/Home), köşe yakınlaştırma düğmeleri (dokunmatikte 44 px, yan yana),
      okuyucu özeti (`describe`, yalnız değişince yazılır). VOL.TEST `MapPanel` artık tüm araçları
      (oyuncu vurgulu), yerleşik ızgara/ölçek/kuzey, oyuncuyu izleyen yakınlaştırma ve özet kullanır;
      HUD karesi araç listesini tembel verir (yalnız 10 Hz harita güncellemesinde kurulur). Vitrin
      kartı canlı döner düşmanlar, takip, ping, kenar göstergesi ve sürükleme örneğiyle yenilendi.
      Kanıt: `core/tests/ui/hud/minimapPanel.test.ts` (19), `games/vol-test/tests/hud/MapPanel.test.ts`,
      gerçek oyun ekran görüntüsü (çoklu tank, 3 yakınlaştırma düzeyi), vitrin görsel temel çizgisi.
      Açık: fiziksel Deck/tablet görsel kabulü ve dokunma sürükleme hissi (kullanıcı turu).
      Yapıldı (2026-10-11): kapanış. **Okuyucu sözleşmesi:** `SelectionInfoPanel` kökü adlı `region`, gizli `role=status`/`polite`
      YALNIZ seçili adını ya da boş durumu söyler (aynı seçim yeniden yazılmaz), portre `aria-hidden`, can çubuğu adlı ("Can")
      ve değer metinli, istatistikler `list`; `StatsPanel` bölümü `aria-labelledby` ile başlığıyla adlanır, girdiler `list`.
      **Renk dışı işaret:** düşük değer Bar'da 45° çizgi deseni + "…, düşük" metni (renk tek taşıyıcı değil); `FpsMeter` uyarı
      kesikli kenar, tehlike 2 px iç halka (kutu ölçüsü sabit). **İşaretçi kontrastı:** `MinimapPanel` sabit renkleri zemine karşı
      iki skinde ölçüldü (kamera çerçevesi 16,67/17,63; sınır 4,03/8,34; imleç 13,77/16,76; metin 10,63/12,72). **HUD işaretçi/girdi
      katmanı:** VOL.TEST `hudLayer.spec.ts` (iki motor, masaüstü + telefon yatayı, gerçek `elementFromPoint`): pasif plakalar ve boş
      alan tuvale geçer, etkileşimli parçalar kendi merkezini yakalar, kapalı duraklatma katmanı yakalamaz; **çekirdek kusur:**
      `.vol-timer-bar`/`.vol-resource-bar`/`.vol-round-counter` gereksiz `pointer-events: auto` taşıyıp click-through HUD'da tıklamayı
      yutuyordu → miras alır oldu (CONTRACT §4; eski kural geri konunca testler düştü). Vitrin SelectionInfoPanel kartına "Seçiliye hasar"
      düğmesi (düşük can durumu). **Boyut/zoom/skin:** 393 px'te yatay taşma yok ve 44 px hedefler (`layout.spec.ts`), iki skin ×
      üç yoğunlukta axe 0 (`themeMatrix.spec.ts`), Lenovo %200 yazı ölçeğinde `hud.spec.ts` 5/5. Kanıt: `hudPanelsA11y.test.ts` (10),
      `hudPanels.spec.ts` (10, iki motor 20/20), `hudLayer.spec.ts` (5, iki motor 10/10), Lenovo `hud.spec.ts`. Oyun fiziği/performansı
      göreve karıştırılmadı. **NOT-RUN:** fiziksel Deck/tablet görsel kabulü ve mini harita dokunma-sürükleme hissi (kullanıcı turu,
      UI-13.4).
- [x] **UI-08.3 — ActionBar/BuildMenu/SkillTree/SlotGrid.** Gerçek oyun ikonları (UI-01.8),
      seçim/kilitli/kullanılamayan/bekleme/boş/nadirlik; klavye/kol/dokunma; RTS bağlamsal
      imleç (UI-01.9) ile. Kapanır: resolveSkillStates isteğe bağlı kalır; hover/Tooltip ve
      dokunma alternatifi; sunumda altın/yetenek defteri yok; anlamsal olay tekil; uzun 6 haneli fiyat.
      Yapıldı (2026-10-08): **SlotGrid yalnız sürüklemeyle çalışıyordu** (CONTRACT §9: sürükleme tek
      alternatif olamaz; item'lar odaklanamıyordu) → roving tabindex, ok tuşlarıyla item arası gezinme,
      **Space tutar, ok tuşları hedef hücreyi seçer (sürüklemeyle aynı `drag-over`/`drag-rejected`
      işaretleri), Space/Enter bırakır, Escape iptal eder** (tuş yutulur), geçersiz hedefte item tutulmaya
      devam eder, odak dışına çıkınca iptal; Enter ve kol A (`click`, detail 0) `onSlotClick`'i çalıştırır
      (fare tıklaması çift sayılmaz); canlı bölge duyurusu (`core:slotGrid.*`, TR/EN), `pick`/`drop`/`reject`
      niyetleri. Kanıt: `slotGridKeyboard.test.ts` (6). Kalan: kolla tutma/bırakma (A tıklama yoluna ayrılmıştır;
      host `onSlotClick` menüsünde "Taşı" sunar), ActionBar/BuildMenu/SkillTree klavye denetimi, resolveSkillStates.
      Yapıldı (2026-10-08): BuildMenu seçimi (açma-kapama) `aria-pressed` ile, ActionBar mod slotu
      `aria-pressed` ile, soğuyan slot `aria-disabled` ile duyulur (yalnız durum değişince yazılır)
      (`core/tests/ui/hud/hudSemantics.test.ts`).
      Yapıldı (2026-10-11): kapanış. **Kullanılamaz ≠ disabled:** bekleyen (`setCooldown`), nedenli (`ActionBar.setUnavailable(id,
neden)`, `BuildMenu.setUnavailable(id, neden)`; neden ev sahibinden gelir: altın/mana/puan sunumda tutulmaz) ve kilitli
      (`SkillTree`) öğe `disabled` DEĞİL `aria-disabled`dır: odaklanabilir kalır, `aria-describedby` balonu nedeni söyler (kalan
      süre, "Yetersiz Altın", "Gerekli: Kılıç Ustalığı"), basış tek `reject` niyeti verir (hedef bileşen kökü: disabled hedef niyet
      yaymaz) ve ev sahibine `onBlocked(id, neden)` bildirir; kullanılabilir öğe tek `press`/`select`/`cancel` üretir.
      **ActionBar** `toolbar` (tek sekme durağı, ok tuşları, kısayol 1/2/3 bekleyen slotu çalıştırmaz); **BuildMenu** tek sekme durağı + uzamsal ok gezinmesi (`pickDirectionalTarget`), balon ad+kısayol+maliyet+neden, **altı haneli ve boşluksuz fiyat kutuyu
      taşırmaz ve kısayol rozetiyle çakışmaz** (`overflow-wrap`, kutu sınırlı); seçim RTS bağlamsal imlecini değiştirir (vitrin
      `hudBuildCard.ts`: seçimsiz boşta, seçiliyken inşa, suda engelli; UI-01.9). **SkillTree** baştan yazıldı: kilitli düğüm
      odaklanır, roving tabindex (tek durak = ilk açılabilir düğüm), uzamsal ok gezinmesi, basış `reject` + eksik önkoşul notlu
      `RichTooltip` (`note`; balon ALTTA açılır ki adını verdiği önkoşulu örtmesin), görünüm yakınlaştırma 1×–2× (klavye + / − / 0, IconButton
      düğmeleri 44 px, sınırda `aria-disabled`, tekerlek sınırda sayfaya bırakılır → kaydırma tuzağı yok), ilk birincil
      işaretçiyle kaydırma, odak görünüme kaydırılır, `skillTree.css` ayrıldı; `resolveSkillStates` isteğe bağlı kaldı.
      **SlotGrid** taşıma akışı: `beginMove(index?)`/`cancelMove()`/`isMoving` (kol A / "Taşı" düğmesi / Space), oklar ve D-pad hedefi seçer
      (`data-vol-arrows`), Enter/A bırakır, Escape/B vazgeçer; **dokun-yerleştir:** tutulan öğe varken bir hücreye dokunmak
      yerleştirir; sürükleme sonrası gelen uyumluluk `click` bir kez yutulur (fareyle sürükle-bırak önceden `pick, drop, press:auto`
      veriyordu, artık yalnız `pick, drop`). **Dokunma alternatifi (hover yok):** `bindBubble` dokunma/kalemde 450 ms uzun basışla balonu açar ve o
      basışın tıklamasını yutar (10 px kayma sınırı; kısa dokunuş etkilenmez), balon başka yere dokunana/Escape'e kadar kalır;
      kilitli düğümün nedeni `show()` ile verilir.
      **Gerçek kusurlar (cihazda ve gerçek tarayıcıda bulundu, kökünden giderildi):** (1) SlotGrid öğesi `touch-action: none`
      taşımıyordu: parmakla dikey sürükleme tarayıcı kaydırmasına çevrilip `pointercancel` oluyor ve bırakma SESSİZCE kayboluyordu
      (`pick` var `drop` yok); (2) bırakma hücresi hayalet öğenin köşesinden `floor` ile hesaplanıyordu: hücre merkezine bırakınca
      köşe tam sınırda kalır, gerçek parmağın alt-piksel sapması bir önceki (çoğu kez dolu) hücreye düşürüp bırakmayı REDDEDİYORDU
      (fare tamsayı koordinatla şans eseri geçiyordu) → en yakın hücreye yuvarlanır; (3) dokunmada açılan neden balonu hemen
      üstündeki komşu denetimi örtüyor ve balona dokunmak onu kapatmıyordu (ActionBar nedeni, hemen üstündeki Mana seçicisine
      ulaşılmasını engelliyordu) → `@media (pointer: coarse)`'ta görünür balon dokunuşu geçirir (fare "hoverable" kalır); (4) SkillTree
      balonu önkoşul düğümünü örtüyordu → alta; (5) önceki UI-08.1/08.2 commit'inden kalan, `pnpm quick`'in koşmadığı ama `pnpm high`'ın
      yakalayacağı gizli kusur: `publicSurface.test.ts` iki yeni adı (`FLOATING_TEXT_MAX_ACTIVE`, `MAX_LEVELS_PER_XP_GAIN`) listede
      yoktu (tam core vitest ile bulundu). **Ölçüm notu:** CDP `Input.dispatchTouchEvent` dokunuşunun uyumluluk `click`i `pointerup`tan
      250–300 ms sonra gelir (gerçek çekirdek dokunuşu `adb input tap` ile 3–5 ms: ürün gecikmesi DEĞİL, koşum artefaktı); bu aralıkta
      sayfa kayarsa gecikmiş tıklama başka öğeye düşerdi → cihaz `tap()`i tıklamayı bekler.
      Kanıt: `core/tests/ui/hud/hudBlockedActions.test.ts` (18), `skillTreeView.test.ts` (15), `slotGridMove.test.ts` (16, alt-piksel
      sapma testi hata varken kırılıyor), `tooltipBehavior.test.ts` (+8 → 14: 450 ms uzun basış, tıklama yutma ve süre dolumu, kayma iptali, fare/ikinci parmak, dışa dokunma, `show`/`hide`, söküm),
      `cssConstantSync.test.ts` (+2: `touch-action`, kaba işaretçide balon), `hudInteraction.spec.ts` (13, iki motor 26/26; mutasyonla
      sınandı: tıklama yutma, kilitli düğüm reject, BuildMenu reject, ActionBar reject, 6 haneli fiyat), Lenovo
      `devtools/vol-showcase/tests/device/hudInteraction.spec.ts` (4: ActionBar/BuildMenu/SlotGrid/SkillTree gerçek dokunuş, uzun basış,
      parmakla sürükleme, 44 px hedefler; dikey 4/4, yatay 4/4, %200 yazı ölçeğinde 8/8). Tür yüzeyi +1 ad (`ActionBarBlockReason`;
      820 sembol; 95 sınıf, 165 runtime, 284 type-only). Kayıt: [VERIFICATION](VERIFICATION.md) "ActionBar/BuildMenu/SkillTree/SlotGrid
      kaydı". **NOT-RUN:** fiziksel kolla SlotGrid taşıma ve ActionBar kısayolu hissi, ekran okuyucunun kullanılamaz nedenini
      okuması, uzun basışın insan hissi (UI-13.4); Samsung SM-G990B2 (UI-13.3).
- [ ] **UI-08.4 — Erken tier-1 kapsam kontrolü.** ScrollView referans klavye/odak/overscroll
      kanıtı; UI-10 ileri pan ayrı. Kapanır: UI-03/04/05/08 applicable durumları assertion'a bağlı;
      kalanlar görünür kalan iş; tam tier-1/M3 kapanışı yalnız UI-13.1'de.

### UI-09 — Overlay, bildirim ve veri yüzeyleri

Ön koşul UI-03.4, UI-05.1. Sahip overlays/data/layout.

- [ ] **UI-09.1 — Modal/Sheet/Popup/Popover/ContextMenu/CommandPalette/RadialMenu/DialogueBox/
      showConfirm/showFatalStartupError.** Panel giriş/çıkış juice'u ve ses; katman ilk odağı/
      odak sınırı/etkileşimsizlik/adı/odak geri yükleme/tek geri olayı. Kapanır: 3 katmanlı yığın
      LIFO; iptalde kaynak temizliği; %200/IME'de odak örtülmez; fatal klavye/AT bağımsız;
      destroy sonrası body katmanı/dinleyici kalmaz.
      Yapıldı (2026-10-08): **DialogueBox sayfa içeriğinin arkasında kalıyordu** (z-index'siz mutlak
      konum; gerçek ekran görüntüsüyle bulundu) → `--vol-z-float`; konuşmacı isim plakası, portre
      çerçevesi, plaka seçimler; seçim glifi bozuk karakterdi (`â–¸`) → `B8` + elmas işareti.
      **Modal/Sheet/OSK kapanınca odak gövdeye düşüyordu** (düğme tıklama sırasında `disabled`
      olur, tarayıcı odağı gövdeye atar; katman o anki `activeElement`e baktığı için tetikleyiciyi
      kaybediyordu) → `previousFocusTarget()`; `stateFixtures.json`taki UI-09.1 Chromium ve UI-11.1
      OSK bilinen-kusur kayıtları silindi (26/26 iki motor). **`FOCUSABLE_SELECTOR` çıplak `[href]`
      içeriyordu**: sprite ikon `<use href>` öğeleri kol gezinmesine ve modal odak tuzağına aday
      oluyordu → `a[href], area[href]`. Toast: varyant ikonu (renk tek taşıyıcı değil) + vurgu çubuğu.
      Katman piksel temeli (`visual.spec.ts`, Chromium win32): modal, sheet, popup, popover, select, ekran
      klavyesi, diyalog kutusu (başka yüzeyin arkasında kalmadığı `elementFromPoint` ile de iddia
      edilir), bildirim ve komut paleti iki kaplamada (varsayılan, aurum) 1280×720 tam görüntüyle +
      aurum için buttons/cards/panels/forms sekmeleri (20 görüntü; yalnız katman görüntülerine ≤24
      piksel payı: arka sayfanın alt piksel kayması). Önceden diyalogun arkada kalması hiçbir temelde
      görünmüyordu.
      Kalan: ContextMenu/RadialMenu/Popover/FatalStartupError aynı dile yayılım ve ince ayar;
      giriş/çıkış juice'u ve sesin tam kapsamı; 3 katmanlı yığın kanıtı.
      Yapıldı: Popup'ın Escape yolu açılış sırasını ve ortak LIFO geri yığınını kullanır;
      iç Popup/Popover kapanırken dış katman açık ve odak tetikleyicide kalır, eski Popup üzerine
      açılan Modal önce kapanır. ContextMenu yerel Escape'i dış katmana sızdırmaz
      (`core/tests/ui/overlays/popupKeyboardStack.test.ts`).
- [ ] **UI-09.2 — Tooltip/RichTooltip ve ToastManager.** Hover/odak kalıcılığı, Esc, balona geçiş,
      dokunma/kol alternatifi; 3 bildirimlik kuyruk, kritik öncelik/eylem; bildirim sesleri.
      Kapanır: 3 s zorunlu gizleme yok; acil bildirim sessizce düşmez; AT dinler; HUD üstüne
      kontrol kapatılmaz.
      Yapıldı (2026-10-08): **RadialMenu yalnız "basılı tut → sürükle → bırak" ile çalışıyordu** (klavye/kol
      ile seçim imkânsız, rol/ad yoktu) → `openFocused`: ilk etkin item'a odak, ok/D-pad döner (devre dışı
      atlanır), Enter/Space/A seçer, Escape/Tab/dışarı tıklama seçmeden kapatır, odak açan öğeye döner;
      `role=menu`/`menuitem` + `label`; işaretçi akışı (`open`, vitrin HoldButton demosu) değişmedi. Kanıt:
      `radialMenuKeyboard.test.ts` (7).
      Yapıldı (2026-10-08): **Tooltip/RichTooltip ortak çekirdek** (`tooltipBehavior.ts`, WCAG 1.4.13):
      Escape işaretçiyi oynatmadan kapatır ve tuşu yutar (üstteki katman aynı basışla kapanmaz), balon
      üzerine gelinebilir (120 ms hoşgörü), RichTooltip `aria-describedby` taşımıyordu (ekran okuyucu hiç
      okumuyordu) ve yalnız soldan sınırlıydı → iki eksende sınır + dikey çevirme, kaydırma/yeniden
      boyutlanmada yeniden konum; kol/klavye yolu odak olayıdır. **ToastManager yeniden tasarlandı:** en
      çok 3 görünür, fazlası kaybolmadan sırada (önceden 4'ü aşan en eski bildirim — kritik dahil —
      SESSİZCE siliniyordu); kritik (varsayılan `danger`) `role="alert"`, sırada öne geçer ve görünen geçici
      bildirimin yerine geçer, kalıcıdır, sıra sınırında yalnız kritik olmayan düşer; eylemli bildirim
      kalıcıdır (eylem çalışınca kapanır); kalıcı bildirimde adlı kapatma düğmesi (`core:toast.dismiss`);
      fare/odak üzerindeyken süre durur (3 sn zorunlu gizleme kalktı). Kanıt: `tooltipBehavior.test.ts`
      (7), `toastQueue.test.ts` (7), vitrinde eylemli/kritik örnek. Kalan: dokunmatik tooltip alternatifi
      (hover yok; uzun basma kararı UI-10), bildirim sesleri kulakla (UI-13.4), AT ile gerçek duyuru
      (UI-13.4), HUD üstü yerleşim ölçümü Deck/tablette.
- [ ] **UI-09.3 — DataTable/Kanban/EventLog/KeyBindingList.** Hizalama/zebra/sıralama/sayfalama/
      sanal öğe; Kanban sürükleme + tıklayarak taşıma; tuş bağlama çakışması/boş durum. Kapanır:
      Tab/yön tuşu semantiği mantıksal; %30/%200/RTL; sanal öğe odağı kaybolmaz; pointercancel.
      Yapıldı (2026-10-08): **DataTable seçilebilir satırlar yalnız fareyle çalışıyordu** (`tabindex`,
      klavye ve `aria-selected` yoktu; seçim/sıralama/pencereleme satırları yeniden yarattığı için odak
      gövdeye düşüyordu; sanal tabloda satır sayısı AT'ye bildirilmiyordu) → tek `tabindex=0` satırı
      (roving), ok/Home/End gezinmesi (pencerede hedefi görünür kılıp hemen yeniden kurar), Enter/Space
      seçimi, `aria-selected`, yeniden çizimde odak aynı satırda, `aria-rowcount`/`aria-rowindex`, onay
      kutusu görsel işaret (`aria-hidden`). Kanıt: `dataTableKeyboard.test.ts` (6). Kalan: Kanban/EventLog/
      KeyBindingList için aynı denetim, %30/%200/RTL ölçümleri, gerçek AT.
      İkinci tur (2026-10-08): EventLog liste her push'ta yeniden kurulduğundan canlı bölge bütün satırları
      yeniden okurdu → liste `aria-live=off`, yeni kayıt ayrı sr-only `status`tan duyulur (süzgeçle
      eşleşmeyen susar, yinelenen ×N ile); süzgeç düğmeleri `aria-pressed`; kaydırma alanı klavyeyle
      odaklanır; klavyeyle sabitleyince odak aynı kaydın yeni düğmesinde kalır. KeyBindingList dinlemeyi
      başlatan/Esc/atama yeniden çizimlerinde odağı yitiriyordu → aynı denetime geri verilir; dinleme
      durumu `aria-pressed` + `aria-label`dadır. **`pointercancel` bırakma sayılıyordu**: Kanban iptali
      tıklama/taşıma, SwipeableCardStack eşik üstünde kabul/ret, SwipeGestureZone jest, SlotGrid tıklama/
      bırakma, RadialMenu hover'daki öğeyi seçme, Carousel sayfa değiştirme üretiyordu → hepsinde iptal
      sessiz (`pointerCancelContract.test.ts`, `kanban.test.ts`; eski test iptalde kabulü sabitliyordu,
      düzeltildi). Kanban/SlotGrid tıklayarak taşıma ve klavye yolu önceki turlarda kanıtlı.
- [x] **UI-09.4 — Diyalog deseni/yönlendirici işaret/yasal metin.** Mevcut Modal/Panel/Button/
      Text bileşimi ile yıkıcı işlem/çıkış/izin/yerel-uzak çakışma/ilk kullanım yönlendirmesi/
      kredi ve yasal metin (ikon atıf ekranı dahil). Kapanır: çakışmada niyet/hata/bekleme/
      yeniden deneme/iptal açık; gerçek Steam AutoCloud diye sunulmaz.
      Yapıldı (2026-10-10): **diyalog kalıbı yoktu**; `Confirm` yalnız iki düğmeli evet/hayırdı, bekleme/hata/yeniden deneme, ek eylem,
      ad/açıklama bağı (`aria-labelledby`/`describedby`) ve `alertdialog` yoktu. `Modal` yalnız eklemeyle genişledi (`role`, `labelledBy`,
      `describedBy`, `initialFocus`; mevcut çağrılar değişmedi) ve üstüne `openActionDialog`/`showDialog` kuruldu: eylem başına `onAction`
      (söz ya da düz değer), bekleme sırasında `role="status"` duyurusu + `aria-busy`, diğer eylemler kilitli, **odak iptale geçer (çıkış
      yolu)**; hata `role="alert"` ayrı bölgede, eylemler açılır, odak hatalı eyleme döner (yeniden deneme), iptal bekleyen işi
      `AbortSignal` ile keser ve sonuç sözü asla reddedilmez; Escape/scrim/geri/sahne sinyali iptal sonucudur. Kalıplar: `showDestructiveConfirm`
      (danger, ilk odak İPTAL, sonuç açık), `showExitPrompt` (kaydet/kaydetme/vazgeç; kaydet iş yaparsa bekleme–hata–yeniden deneme),
      `showPermissionPrompt` (gerekçe zorunlu, Escape = deny, ilk odak "şimdi değil"), `showSyncConflict` (yerel/uzak özet, her seçeneğin
      sonucu not olarak yazılı, bekleme/hata/yeniden deneme/iptal, ilk odak iptal). **`showSyncConflict` bir bulut hizmetinin ekranı
      değildir**: kopya adı nötr "uzak kopya"dır, hizmet adını çağıran verir; vitrin kartı benzetimi açıkça etiketler ve Steam AutoCloud
      diye sunmaz. `startGuidedTour`: engelleyici DEĞİL (scrim/odak tuzağı yok), `Popup` üstünde hedefi `vol-tour-target` ile işaretler
      (hedefi örtmez, görünür alanda), adım sayacı + Geri/İleri/Atla/Bitti, her adımda odak İleri'de, hedef kaybolursa adım atlanır, Escape/
      geri/sinyal `skipped`, bitince odak tetikleyiciye döner. **Hata (e2e yakaladı, kökten düzeltildi):** `Button` işleyici sürerken
      kendini `disabled` yapıp odağı gövdeye düşürdüğünden turun Escape'i odağı tetikleyiciye geri veremiyordu → `previousFocusTarget()`
      (Modal ile aynı yol); vitrin tetikleyicileri işleyiciden hemen döner. `showLegalDocument`: `Sheet` içinde klavyeyle kaydırılan bölümler
      ve atıf listesi (ad/sürüm/yazar/lisans/kaynak/not); yalnız `textContent`, adresler bağlantı değil seçilebilir metindir.
      Vitrin kredileri depo kayıtlarından gelir (`credits.ts`) ve `credits.test.ts` her satırı `core/public/assets/icons/CREDITS.md`,
      `core/public/assets/glyphs/SOURCES.md`, `core/public/assets/cursors/SOURCES.md`, `core/public/assets/fonts/OFL-Jura.txt`,
      `core/public/assets/fonts/OFL-Exo2.txt` ve kök `NOTICE` ile karşılaştırır (kayıttan ayrışamaz). Çekirdek çeviri anahtarları `core:dialog.*`
      (tr/en eşit). Kanıt: birim 53 (`actionDialog` 18, `dialogPatterns` 15, `guidedTour` 14, `legalSheet` 6; odak geri verme mutasyonla
      öldürüldü), `credits.test.ts` 4, vitrinde `dialogPatterns.spec.ts` 10 senaryo × iki motor (akışlar, bekleme/hata/yeniden deneme/iptal,
      odak tuzağı, tur hedef kaybı, atıf listesi + klavyeyle kaydırma), 4 yeni katman (`panels/dialog|conflict|legal|tour`) axe,
      odak halkası, yerleşim, malzeme bütçesi ve durum matrisi (264 geçti, iki motor) ve Chromium piksel temeli (8 yeni, 10 mevcut panels
      temeli arka plandaki kart düzeni değiştiği için yenilendi; modal/toast/sheet'in kendisi gözle karşılaştırıldı, değişmedi).
      **NOT-RUN (gerekçeli, devredildi):** gerçek ekran okuyucuyla (NVDA/Narrator/TalkBack) duyuru ve odak sırası, gerçek IME ile diyalog içi
      giriş, kolla Deck'te ve dokunmayla Android'de diyalog/tur akışı ve ilk kullanım turunun kullanıcıya anlaşılırlığı → UI-13.4 (insan) ve
      UI-13.3 (cihaz); vitrin kartları yerel kabukta değil tarayıcıda koşuldu. **Uygulanmadı (kapsam dışı):** gerçek Steam AutoCloud
      çakışma akışı (Steamworks çakışma geri çağrısı yok; F08.6), tur durumunun kalıcılığı ("bir daha gösterme") uygulama sahibine aittir.

### UI-10 — Dokunma, yükleme, kaydırma ve çalışma alanı

Ön koşul UI-03.4; UI-10.1 ayrıca UI-03.2. Sahip touch/camera/layout/text.

- [x] **UI-10.1 — DirectionButton/DPad/Joystick/SquareJoystick/SwipeGestureZone/MultiTouchZone/
      PullToRefresh.** Birinci/ikinci işaretçi sahipliği, iptal/capture kaybı/görünürlük;
      deadzone/smooth tüketici politikası. Kapanır: VOL.TEST joystick/hold; yalnız dokunma ve
      klavye/kol eşdeğer; gesture süresi reduced-motion'da bozulmaz.
      Yapıldı (2026-10-08): **DirectionButton ve Joystick yalnız işaretçiyle çalışıyordu** → DirectionButton
      Space/Enter/kol A basış-bırakış (ortak `holdInput`, `aria-pressed`); Joystick odaklanabilir (`role=group`,
      adlı, `core:joystick.label`), ok tuşları basılı tutuldukça birim uzunlukta vektör üretir, son tuş
      bırakılınca/odak kaybında `onRelease`, işaretçi basılıyken tuşlar yok sayılır. Kanıt: `holdInput.test.ts`.
      PullToRefresh'in klavye yolu bileşende yoktu (yalnız çekme jesti): vitrin demosuna `refresh()`'i çağıran
      düğme eklendi (host sorumluluğu: jest tek yol olamaz). RadialMenu için `openFocused` ve vitrinde
      "Tuşla Aç" düğmesi (`holdInput.spec.ts` iki motor). Kalan: SquareJoystick/SwipeGestureZone/MultiTouchZone
      klavye karşılığı kararı, gesture süresi reduced-motion, VOL.TEST joystick/hold cihaz koşusu.
      Yapıldı: PullToRefresh hazır eşiğini aşmış olsa da pointercancel yenileme çağırmaz;
      görünümü ve yakalamayı sıfırlar, tıklama yutma zamanlayıcısı bırakmaz
      (`core/tests/ui/touch/pullToRefreshCancel.test.ts`).
      Yapıldı (2026-10-10): **SquareJoystick klavyeyle sürülemiyordu** (yalnız işaretçi; odaklanamıyordu). Ok tuşu
      mantığı `Joystick`ten ortak `ArrowKeyHold`a çıkarıldı (karşıt tuş sıfırlar, `repeat` yeni değişim üretmez,
      son tuş/odak kaybı `onRelease`, işaretçi basılıyken tuşlar yok sayılır ve YUTULMAZ); daire birim uzunluğa
      normalize eder, kare ham ekseni (-1/0/1, çapraz √2) verir. İkisi de adlı (`label` seçeneği ya da
      `core:joystick.label`), `aria-keyshortcuts` bildirir ve `:focus-visible` halkası vardır. **Karar: SwipeGestureZone
      ve MultiTouchZone denetim değil jest ALGILAYICIDIR** — klavye eşdeğerini bileşen değil sahibi verir (neyin
      kaydırıldığını yalnız o bilir); bileşen odak tuzağı/sahte tuş icat etmez, `CONTRACT.md` §9'a yazıldı. Vitrin Dokunma
      sekmesinde kaydırma demosu dört yön düğmesiyle (`KEYBOARD_SWIPE_PX` = 40, eşiği aşan gerçek `onSwipe`) ve ipucu metniyle
      eşdeğeri gösterir. **Jest süresi hareket azaltmada bozulmaz:** uzun bas/şarj/kaydırma/çekip-yenile zaman
      damgasından ve zamanlayıcıdan çalışır, CSS animasyon/geçiş olayı beklemez; `gestureReducedMotion.test.ts`
      hareket azaltma AÇIKKEN dört jestin aynı süre ve eşikle tamamlandığını ve kaynağın `animationend`/`transitionend`/
      `matchMedia` okumadığını kilitler. Kanıt: birim `squareJoystickKeyboard.test.ts` (10) +
      `gestureReducedMotion.test.ts` (17), vitrinde `touchEquivalents.spec.ts` (çubuk/kaydırma senaryoları × iki motor).
      Yapıldı (2026-10-11): **gerçek cihaz kapanışı** (Lenovo TB350FU, Android 14, Chrome; dikey ve yatay; ham
      `Input.dispatchTouchEvent`, pointerType touch; `devtools/vol-showcase/tests/device/touchInput.spec.ts` ve
      `volTest.spec.ts`; üç tam koşu, her yönde 4/4 geçti). Vitrinde Joystick ve SquareJoystick gerçek dokunuşla
      sürüldü (basılıyken vektör x 0,71 / y −0,54, bırakınca 0,00 / 0,00), HoldButton basılıyken `aria-pressed=true`, bırakınca
      `false`, gerçek kaydırma jesti yön ve mesafe üretti, yön düğmesi aynı olayı verdi. **VOL.TEST** (oyunun kendi HUD'u,
      gerçek Phaser döngüsü; `device-ui.mjs --game` oyunu derler, ayrı yerel sunucu ve `adb reverse` kurar): sol çubuk tankı
      sürdü (64→72 m, bırakınca durdu), hızlanma düğmesi çubukla birlikte (iki parmak; oyun kuralı gereği hızlanma yalnız
      ileri giderken sürer) `vt-hud--boosting`i açıp bıraktığında kapattı. **Not (test altyapısı):** ilk yatay koşuda iki
      senaryo düğmeye dokunamadı; ham CDP dokunuşu örtülmeyi/yerleşim oturmasını denetlemez. Nedeni KANITLANAMADI (tanı koşusunda
      hedefi örten görünür öğe bulunmadı); hedef görünüm ortasına getirilip oturması bekleniyor ve merkezde hedefin durduğu
      doğrulanıyor (`devtools/vol-showcase/tests/device/touch.ts`) — sonra üç tam koşuda her yönde 4/4 geçti. **NOT-RUN (gerekçeli):** fiziksel kolla çubuk hissi ve ekran
      okuyucuyla çubuk duyurusu → UI-13.4; Samsung SM-G990B2 bağlı değil → UI-13.3.
- [x] **UI-10.2 — DualAxisScrollPanel/ScrollView/VirtualList/KeyedVirtualList/SplitPane.**
      Etkileşimli alt öğe istisnası, sürükleme eşiği, birincil işaretçi, sanal öğeler, resize.
      Kapanır: pointerdown anında alt düğme niyeti alınmaz; iptal edilen sürükleme tıklama üretmez;
      %200 dış panel kaydırması; 24/44 kaydırma tutamağı.
      Yapıldı (2026-10-08): `DualAxisScrollPanel` ve `PullToRefresh` işaretçiyi artık basış anında değil
      `UI_THRESHOLD.DRAG_START_PX` eşiği aşılınca yakalar (önceden içerikteki düğmenin tıklaması
      viewport'a çalınıyordu), yalnız birincil işaretçi/ana düğme başlatır, gerçek sürüklemeyi bitiren
      bırakma altındaki öğeye tıklama üretmez, iptal (`pointercancel`) tıklama yutmaz; Carousel slayt
      içi denetime basınca sürükleme başlatmaz; SkillTree zaten düğümü hariç tutar. Testler:
      `touchControls.test.ts`.
      Yapıldı (2026-10-11): **gerçek kusurlar bulundu ve düzeltildi.** (1) **SplitPane tutamağı 5 px'ti** (kaba işaretçide
      `@media (pointer: coarse)` ile 12 px; token'ı eziyordu): gerçek kutu artık `max(24px, --vol-hit-target-min)` →
      ince işaretçide 24 px (WCAG 2.5.8), kaba işaretçide ve `large` hedef tabanında 44 px; görünmez overlay değil (komşu
      bölmenin kaydırma çubuğunu örtmez), çizgi ve kavrama işareti ortada. Tutamak kalınlığı en büyük boyuta da girer
      (bölme en küçük ikinci boyutunun altına inmez). (2) **Sürükleme sahipliği:** sürüklerken gelen ikinci parmak sürüklemeyi
      devralıyordu; artık tek sahip (ilk birincil işaretçi), birincil olmayan ve fare ikincil düğmesi başlatmaz. (3)
      **İptal:** `pointercancel` ve Escape sürüklemeyi iptal eder (boyut başlangıca döner, `onCommit` çağrılmaz; önceden
      sistem kesintisi yarım boyutu kalıcı kılıyordu). (4) **En küçük bölme boyutları yerleşimde de geçerli:** kap dar
      kalırsa ikinci bölme ezilmiyor (320 px'te 97 px'e iniyordu), dış panel yatay kayıyor. (5) **DualAxisScrollPanel**
      `overflow: hidden` olduğundan tekerlek ve klavye hiçbir şey yapmıyordu (yalnız sürükleme): artık odaklanabilir adlı
      grup; oklar/Page/Home/End (Shift yatay), tekerlek ve Shift+tekerlek; yalnız yüzeyin kendisi odaktayken, uçta olay
      iptal edilmez (ata kaydırıcı devralır). (6) **ScrollView** `scrollToTop/Bottom` hareket azaltmada da `smooth` kayıyordu
      (tarayıcı kısmaz): artık anında. (7) **Kaydırma çubuğu kalınlığı:** `scrollbar-width: thin` ve `::-webkit-scrollbar`
      kalınlığı çubuğu 8–10 px'e indiriyordu (Windows Chromium ölçümü: varsayılan 15 px, `thin` 10 px, `::-webkit-scrollbar`
      8 px); kullanıcı aracısı denetimi küçültülmediği sürece WCAG 2.5.8 istisnasındadır, bu yüzden ScrollView, VirtualList,
      KeyedVirtualList ve yatay sekme şeridinden kalınlık kuralları kaldırıldı (yalnız renk). **Kanıt:** birim
      `splitPaneInput.test.ts` (12), `scrollSurfaces.test.ts` (10: ScrollView hareket azaltma, VirtualList 5000 satır
      pencereleme, CSS politikası), `dualAxisScrollInput.test.ts` (14), `hitTargetSync.test.ts` (ayırıcı politikaya girdi);
      mutasyonla öldürüldü (sahiplik koruması kalkınca 3, iptal eski davranışa dönünce 3, tutamak kalınlığı hesaba
      katılmayınca 2 test düştü). Gerçek tarayıcıda iki motor: `devtools/vol-showcase/tests/e2e/scrollSplit.spec.ts` (tutamak
      24 → large'da 44 px, vuruş alanı ±11/±21 px, komşu boşluğu 0, fare sürükleme/Escape/kalıcı, telefon koşulunda 44 px, %200
      (640×400) ve %400 (320×568) sayfa yatay taşmaz ve ikinci bölme ezilmez, %400'de bölme kayar ve odak ayırıcıyı görünür
      kılar, iç alan sona ulaşınca kaydırma dış panele geçer, ScrollView/VirtualList klavye ve tekerlek, 5000 satırda DOM < 30,
      DualAxisScrollPanel klavye/tekerlek); Chromium'da ayrıca gerçek dokunma (CDP): ikinci parmak devralmaz, `touchCancel`
      geri alır. **Gerçek cihaz** (Lenovo TB350FU, Android 14, Chrome; dikey ve yatay;
      `devtools/vol-showcase/tests/device/scrollSplit.spec.ts`, 4/4 her yönde): tutamak 43,99 px, parmakla sürüldü ve
      bıraktığında kaldı, ikinci parmak devralmadı, `touchCancel` boyutu geri aldı, ScrollView ve VirtualList parmakla kaydı
      (DOM 20 satır), iç alan sona ulaşınca kaydırma dış panele geçti, DualAxisScrollPanel iki eksende kaydı. Cihaz koşusu
      ayrıca gösterim demosunun hatasını buldu: `minPrimary 150 + tutamak + minSecondary 280` tablet dikeyinde (473 px kart)
      sürme payını sıfıra indiriyordu → demo en küçükleri 120/200 yapıldı. Workbench piksel temeli yenilendi (tutamak
      24 px + kavrama işareti; gözle karşılaştırıldı, yalnız beklenen değişiklik). **NOT-RUN (gerekçeli, devredildi):**
      Windows/Deck'te gerçek klasik kaydırma çubuğu tutamağının fiziksel kabulü (UA denetimi) ve fiziksel kolla bölme
      sürükleme → UI-13.3/13.4; gerçek AT'de ayırıcı değer duyurusu → UI-13.4. Not: başsız Chromium kaydırma çubuklarını
      varsayılanda gizler (`--hide-scrollbars`); çubuk kalınlığı ayrı bir betikle bu bayrak kapatılarak ölçüldü ve kayda
      geçirilmedi (e2e'ye girmedi).
- [x] **UI-10.3 — PauseResumeButton sunum/tarif ayrımı.** Constructor ve callback bildiren
      `setRunning` korunur; yeni additive sessiz senkron ve ayrı kullanıcı niyet yolu; opt-in sayaç
      tarifi. Kapanır: legacy setter/callback, sessiz sync, user toggle, counter completion,
      freeze, pointercancel, destroy ayrı regresyon; public sınıf silinmez.
      Yapıldı (2026-10-08): `syncRunning` (sessiz, `onToggle`/niyet yok), kullanıcı tıklaması `toggle`
      niyeti yayar (programatik değişim yaymaz), `pointercancel` basılı görünümü temizler; `setRunning`
      ve constructor/callback sözleşmesi aynen (`touchControls.test.ts`). Sayaç tamamlanma yolu ve
      destroy önceki testlerle kapsanır; tarif ayrımı (opt-in sayaç tarifi) açık.
      Yapıldı (2026-10-11): **sayaç tarifi düğmeden ayrıldı**: `core/src/ui/buttons/pauseCounter.ts` DOM'suz `PauseCounter`
      (düğme ona yetki verir; `counter` verilmezse hiçbir zamanlayıcı kurulmaz; genel yüzeye eklenmedi, public sınıf ve
      `counter` seçeneği aynen). **Gerçek kusur:** düğmenin `setInterval(1000)` sayacı süreyi tik sayısından türetiyordu:
      her duraklat/devam döngüsü kesirli saniyeyi yutuyor (0,9 sn'de duraklatıp devam edince tam bir saniye daha bekleniyor)
      ve arka planda kısılan zamanlayıcı sayacı geri bırakıyordu. Tarif artık geçen gerçek zamandan (tek yönlü saat)
      türetir: duraklatma kesri dondurur (10 × 500 ms duraklat/devam = 5 sn), geç tetiklenen zamanlayıcı geçen süre kadar
      ilerler (ara saniyeler tek `onTick`te atlanır), erken tetiklenme sahte saniye üretmez, `down` tamamlanınca bir kez
      `onComplete` ve durur, `onTick` içinde duraklatan sahip yeniden kurdurmaz, `dispose` zamanlayıcıyı bırakır.
      Tamamlanmış sayaç sürdürülürse eski sözleşme korunur (sıradaki saniyede yeniden tamamlanır). **Kanıt:** birim
      `core/tests/ui/touch/pauseCounter.test.ts` (16: 12 tarif + 4 düğme birleşimi), `touchControls.test.ts` (eski legacy
      setter/callback, sessiz sync, kullanıcı toggle, tamamlanma, freeze, pointercancel, destroy regresyonları aynen geçti;
      destroy testi `clearInterval` ayrıntısından davranışa çevrildi); mutasyonla öldürüldü (duraklatma kesri atınca 3, süre tik
      sayısından türetilince 2 test düştü). Tarif zamanı `performance.now`dan alır; determinism yardımcısı onu dondurduğundan
      vitrin demosunda sayaç e2e'de 0:00'da deterministik kalır. **NOT-RUN:** yok (saf mantık; gerçek cihaz/AT davranışı sayaç
      için ayrı bir kabul gerektirmiyor).
- [x] **UI-10.4 — LoadingScreen/Text/AnimatedLabel/Icon/Toolbar/PropertyField/CanvasViewportController/
      WorldCameraController/PinchZoomController.** Hazır/hata/yeniden deneme/iptal ve ilerleme;
      yüklemede yeni malzeme. Kapanır: asgari yükleme süresi 500 ms isteğe bağlı, meşgul durum
      <100 ms, iptal güvenli; yüklemede sürekli ses varsayılan değil; parmakla büyütmeye alternatif;
      destroy temiz.
      Yapıldı (2026-10-08): `LoadingScreen` varsayılan asgari süre 2000→0 ms (500 önerilen seçenek);
      ilerleme `role=progressbar` + yalnız hedef değerle `aria-valuenow` (yüzde metni `aria-hidden`,
      kare kare okuyucuya yağmaz); yeni `fail({message,onRetry,onCancel})`/`clearFailure()`: hata
      `role=alert`, odak Tekrar dene düğmesinde, bekleyen gizleme iptal, Tekrar dene ilerlemeyi sıfırlar
      ve `onRetry` çağırır, Vazgeç yalnız `onCancel` (karar tüketicide), göstergeler durur, dil değişince
      metin güncellenir. Vitrin Loading sekmesine hata kartı; kanıt `loadingScreen.test.ts` +
      `devtools/vol-showcase/tests/e2e/loadingFailure.spec.ts` (Chromium+WebKit). CanvasViewport/WorldCamera/PinchZoom
      alternatifi, Toolbar/PropertyField ve meşgul <100 ms ölçümü açık.
      **Yükleme yeniden tasarımı (2026-10-08, kullanıcı ara geri bildirimi: "sağlamlaştır; his, sunum,
      sorumluluk, performans; temalarla aynı estetik")**. Analiz: eski ekran tema dilinden bağımsız neon
      bir döndürücüydü (indigo/eflatun vurgu, `drop-shadow` parlaması, maske ve ilerlemeye bağlı
      `conic-gradient`, kare başına kök değişken yazımı), aşama/ipucu/takılma/hata yolu, arka plan
      kilidi ve odak yönetimi yoktu, VOL.TEST açılışta boş ekranla açılıyordu. Karar ve uygulama:
      `LoadingScreen` artık çekirdeğin çerçeve (`vol-frame`) ve HUD barı (`vol-bar`) malzemesiyle çelik
      plaka (başlık şeridi + segmentli çubuk; steel/aurum tokenlarından, ayrı bir yükleme dili yok);
      çubuk tek elemanın genişliği (belirsiz başlar, ilk `update` ile kesinleşir), yüzde yalnız tam sayı
      değişince yazılır; süs göstergeler (`loadingEmblems.ts`) yalnız transform/opacity ile (parlama,
      maske, conic yok — `loadingPerformance.test.ts` yasaklar), hareket azaltılmışta durur;
      `setStage` (okuyucuya duyulur), dönen ipuçları, `stallMs` takılma bildirimi + `onStall`,
      `showDelayMs` (kısa yükleme hiç görünmez; asgari süre görünür olduktan sonra), `blockBackground`
      (arka sayfa `inert`, odak ekrana, kapanınca geri). **Gerçek tüketici:** VOL.TEST açılışı
      (`games/vol-test/src/app/bootLoading.ts`; 200 ms gecikme, 400 ms asgari, hizmetler → Phaser varlık oranı →
      dünya) ve vitrin Loading sekmesinde aşama/ipucu/takılma ve hata kartları. Kanıt:
      `loadingScreen.test.ts` (72), `bootLoading.test.ts`, VOL.TEST e2e 17/17 Chromium, vitrin
      görsel temel çizgisi. Cihazda (Deck/tablet) görsel kabul kullanıcı turuna bırakıldı.
      Yapıldı (2026-10-11): **parmakla büyütme tek yoldu** (PinchZoom: tekerlek/sıkıştırma/sürükleme; CanvasViewport: tekerlek +
      Space/orta tuş; WorldCamera: tekerlek/sıkıştırma/sürükleme) → üç denetleyici aynı eşdeğeri alır (`core/src/ui/camera/viewportKeys.ts`):
      `+`/`-` yakınlaştırır, `0` sıfırlar/gerçek boyut, `Home` sığdırır, oklar GÖRÜNÜMÜ kaydırma kuralıyla taşır; Ctrl/Meta/Alt'li
      tuş (tarayıcının kendi yakınlaştırması) ve IME bileşimi işlenmez, tuş yalnız yüzeyin KENDİSİ odaktayken çalışır (içerideki alan
      `+`/`-`/oklarını kendi işi için kullanır). **PinchZoomController:** `keyboard` (varsayılan açık) → odaklanır (`role=group`,
      adlı, `aria-keyshortcuts`, `:focus-visible` halkası); `zoomBy(delta)` görünüm ortasını sabit tutar, `panBy(dx,dy)`,
      `reset()`; klavye/programatik değişiklik `role="status"` bölgesinde "Yakınlaştırma %125" diye duyurulur (sürükleme ve
      sıkıştırma duyurulmaz); geçiş animasyonu hareket azaltmada kapanır. **CanvasViewportController:** `keyboard` (varsayılan
      KAPALI: editör kısayolları sahibine aittir) + `label`; `panBy`/`zoomBy` programatik (`onChange('programmatic')`, commit yok),
      klavye kullanıcı eylemidir (`onChange` + `onCommit` `zoom`/`pan`, sınırda sahte commit yok); `tabindex`/`role` varsa korunur.
      **WorldCameraController:** `keyboard` (varsayılan KAPALI) + `label`, `zoomBy(çarpan)` (hedef zoom, `update` yumuşatır),
      `panByScreen(dx,dy)` (ivmeyi keser, sınır direnci aynı). **Hata (e2e/cihaz hazırlığında bulundu):** vitrin dünya kamerası
      demosu `update`i hiç çağırmıyordu → tekerlek zoom'u (hedefi değiştirir, kareyi yumuşatma uygular) demoda HİÇ görünmüyordu;
      demo artık yalnız hareket sürerken kare döngüsü çalıştırır (yerleşince durur; boşta maliyet yok) ve düğmelerle de sürülür.
      Vitrin: Dokunma sekmesinde PinchZoom ve WorldCamera demolarına Yakınlaştır/Uzaklaştır/Sıfırla düğmeleri ve klavye ipucu,
      İş tezgâhı görünümüne Yakınlaştır/Uzaklaştır düğmeleri (CanvasViewport artık dokunmatikte de yakınlaşır) ve `keyboard`.
      **Meşgul durum <100 ms:** `Button` meşgul durumu işleyiciden ÖNCE açar (`runButtonClick`: `setLoading(true)` → handler;
      sıralama birim testiyle kilitli); gerçek tarayıcıda çıkış istemindeki "Kaydet ve çık" tıklamasından, `aria-busy`nin DOM'da
      olduğu kareye kadar `click.timeStamp` → rAF + mesaj turu 20 örnekle ölçülür (`busyFeedback.spec.ts`; sunulan kare DEĞİL,
      başsız yaklaşım): **Chromium p95 26,4 ms, WebKit p95 60,0 ms** (ortam tabanı p95 22,3 / 81,0 ms; kapı: meşgul durum tabana en çok
      bir kare ekler (iki motor); mutlak p95 < 100 ms yalnız Chromium'da kapıdır, başsız WebKit'in kendi tabanı 81 ms olduğundan
      orada mutlak sınır konmaz). **Yüklemede sürekli ses yok:** `LoadingScreen` kaynağında ses
      yolu yok, video arka plan sessiz (birim test). **Toolbar/PropertyField gerçek tarayıcıda** (`toolbarField.spec.ts`, 5 senaryo × iki
      motor): araç çubuğu TEK sekme durağı (oklar/Home/End gezer ve sarar), seçim `aria-pressed` taşır ve aksiyon düğmesi seçimi
      değiştirmez, her araç adlı ve odak halkası görünür; özellik alanının etiketi denetimin adı, açıklaması denetimin açıklaması,
      Enter işler, sıfırlama değeri ve durumu geri alır. **Gerçek cihaz** (Lenovo, dikey+yatay, `touchInput.spec.ts`): gerçek iki
      parmak sıkıştırma PinchZoom'u 250%'e (demo sınırı) çıkardı, aynı kamera dokunulan düğmelerle 125/75'e gitti; dünya
      kamerası sıkıştırmayla ve düğmeyle değişti, Sıfırla dünyayı sığdırdı. Kanıt: birim `cameraKeyboard.test.ts` (25; yön işareti ve
      değiştirici koruması bozulunca sırasıyla 8 ve 4 test düşer), `buttonBehavior.test.ts` (+1), `loadingScreen.test.ts` (+1), vitrinde
      `touchEquivalents.spec.ts` kamera senaryoları, `busyFeedback.spec.ts`, `toolbarField.spec.ts`; Dokunma ve İş tezgâhı piksel
      temelleri yenilendi (yeni düğme/ipucu; gözle karşılaştırıldı, yalnız beklenen eklemeler). **NOT-RUN (gerekçeli, devredildi):**
      gerçek ekran okuyucuyla yakınlaştırma duyurusu → UI-13.4; yükleme ekranının Deck/tablet görsel kabulü ve sunulan kare
      gecikmesi → UI-13.3/13.4; Deck'te fiziksel kolla kamera → UI-13.4.
- [x] **UI-10.5 — Palette ve ileri katalog kanıtı.** Her aile durum örneği, public yardımcılar,
      grid ARIA gerekçesi. Kapanır: registry başlangıç sınıfları + yeni exportlar tam; palet
      okunabilirliği; tier-2 erişilebilir.
      Yapıldı (2026-10-10): **Palet sekmesi kaç oranla okunur sorusuna cevap vermiyordu** (yalnız çip + ad + onaltılık değer) ve
      Türkçe grup başlıkları ("Surface", "Semantic: Success"…) çevrilmemişti → Karşıtlık çizelgesi (`paletteContrast.ts`): metin ×
      4 yüzey (12), `on-*` × `*-solid` (7), ikon/odak halkası/kenarlık (5) = 24 çift; oran etkin kaplamanın ÇÖZÜMLENMİŞ token'larından
      canlı hesaplanır (saydam renk önce zemine, zemin sayfa tabanına bileşilir; `scripts/quality/uiTheme.mjs` ile aynı WCAG yöntemi),
      sonuç yazıyla ("Geçer (≥ 4,5:1)" / "Kalır"; renk tek taşıyıcı değil), çözülemeyen token sahte oran yazmaz ("Ölçülemedi"),
      kaplama değişince yenilenir. Gerçek `<table>` (sütun/satır başlığı), örnek kutusu `aria-hidden`. Token grupları adlı **liste**
      (`ul[role=list]`, `aria-label`); palet salt okunur olduğundan `grid` değildir. **Görsel inceleme bir hata yakaladı:** tam genişlik
      kart 12 birimlik palet ızgarasında `flex` kuralı işlemediği için 150 px'e sıkışmıştı (e2e ilk koşuda geçmişti çünkü taşma
      ölçüyordu, genişliği değil) → `grid-column: 1 / -1` ve karta ızgara genişliği + satır yüksekliği ölçümü eklendi (kural
      kaldırılınca 150 ≠ 954 px ile düşer, mutasyonla doğrulandı). **ARIA gerekçesi** `CONTRACT.md` §9'dadır; sonuç: seçilebilir
      DataTable `aria-selected` taşıyan satırları düz `table`da bırakıyordu → `role="grid"` (+ `aria-multiselectable`, yeni
      `ariaLabel` seçeneği; gezinme satır düzeyinde, hücre gezinmesi yok), seçilemeyen tablo yerel kalır, SlotGrid `group` + `button`
      kalır (gerekçeli). **Registry:** 95 sınıf + 68 yardımcı = 163 kayıt, kapı eksik/fazla/bayat kaydı ve vitrin/test bağını reddeder;
      tek açık `gap` (`requestGamepadTextEntry`, UI-11.1) doğrudan teste bağlandı (6 test), registry'de açık gap kalmadı; `CATALOG.md`
      başlık sayıları bayattı (94/148/241, 17 doğrudan) → gerçek 95/163/281, 20 doğrudan ve yeni kapı testi bunu yüzeyle karşılaştırır.
      Kanıt: `paletteTab.test.ts` (13; eşik kapsayıcı, alfa, çözülemeyen değer, canlı yenileme; üç mutasyon öldürüldü),
      `dataTableGrid.test.ts` (4), `requestGamepadTextEntry.test.ts` (6), e2e `paletteReadability.spec.ts` 7 senaryo × iki motor (her
      oran tarayıcının ÇİZDİĞİ renklerden bağımsız yeniden hesaplanır: iki kaplamada 24 çift, fark < 0,005; hiçbir çift kalmaz; çalışırken
      kaplama değişimi; 320 px'te taşma yok; 1280'de tam genişlik), tier-2 (Gelişmiş/Palet dahil her sekme) axe 0 ihlal 2 kaplama × 3
      yoğunluk (`themeMatrix.spec.ts`, kayıtlı `incomplete` incelemeleri aynen). **NOT-RUN (gerekçeli, devredildi):** gerçek ekran
      okuyucuda tablo/liste/grid duyurusu (özellikle NVDA'nın grid'de odak kipi) → UI-13.4; her ailenin HER uygulanabilir durumunun
      ayrı kanıtı katalog kapanışıdır → UI-13.1 (registry arketip durumları bildirir, durum başına kanıtı henüz zorlamaz).
      Not: vitrin bileşen/varyant adlarının büyük bölümü (106 değer: "Popup", "Primary", "Small"…) Türkçede İngilizce bırakılmıştır;
      bu bilinçli katalog adlandırması gibi duruyor, ürün kararı beklenir (çevrilmedi).

### UI-11 — Metin oturumu ve Android / M7 alt faz

Ön koşul: UI-11.1–11.2 için UI-05.1; UI-11.3–11.4 için UI-06.2 ve Android cihazı. F04.2 tekrarlanmaz (D9).

- [x] **UI-11.1 — Sahip/oturum/IME bileşimi.** `core/src/ui/textEntry/textEntry.ts` sağlayıcı/kip
      sondası yeniden kullanılır; oturum sınıfı ve abort/selection gruplama. OSK Türkçe/İngilizce
      düzen, Unicode grafem/silme ve maxLength, multiline/password/readOnly/disabled; sahibin
      public iptal yolu.
      Yapıldı (2026-10-08): **OSK baştan kuruldu** (`OnScreenKeyboard.ts`, `keyboard.css`): çerçeve
      başlık şeridi + karakter sayacı, kuyu değer alanı ve gerçek imleç (← → ile hareket; yazma ve
      silme imleç konumunda), basılabilir plaka tuşlar (Bitti marka rengi), sembol katmanı (`@ # ₺ € / \`
      …), dile bağlı düzen (tr: Türkçe Q, diğer: QWERTY) ve TR⇄EN dil tuşu (arayüz dilinden bağımsız;
      elle seçim dil değişiminde korunur), Vazgeç tuşu, erişilebilir adlar (diyalog başlığa bağlı,
      ikon tuşların adı, değer alanı salt okunur metin kutusu), UI köküne takılır (ses ve niyet
      kapsamı), niyetler `type`/`erase`/`reject` (+ `toggle`/`select`/`confirm`/`cancel`), iki yeni ses
      `keyTap`/`keyDelete` (iki palet), alçak ekranda sıkılaşma ve `100dvh` sınırı, kolda son satır
      (Vazgeç·Bitti) uzamsal gezinme düzeltmesi. Kanıt: `keyboard.test.ts` (13), `osk.spec.ts`
      (dikey/yatay telefon, dikey/yatay tablet, işaretçi, klavye; iki motor).
      Yapıldı (2026-10-10): **grafem, IME ve alan sahipliği.** İmleç `value` içinde UTF-16 konumudur ve her zaman grafem
      sınırındadır (`core/src/ui/textEntry/graphemes.ts`: `Intl.Segmenter`, yoksa kod noktası + bağlanan parça/bayrak/ZWJ/CRLF
      yedeği); geri silme ve ← → TEK kümeyi geçer (aile emojisi, bayrak, ayrışık vurgu bölünmez); parola grafem başına bir
      nokta gösterir; `maxLength` HTML gibi UTF-16 kod birimi sayar (düzenleme menüsü ve TextArea ile aynı, sayaç de öyle).
      `requestTextEntryForElement` salt okunur alan için de klavye açmaz. IME: tek iç `isComposingKey` (`isComposing` veya
      `keyCode 229`); `Input`/`TextArea`/`ColorPicker` bunu zaten sayıyordu, `CommandPalette` (Enter/Escape/oklar +
      belge Escape'i) ve `NumberStepper` (Escape) saymıyordu — bileşimde komut çalıştırıp paleti kapatıyordu, düzeltildi.
      **Gerçek cihaz bulgusu (Lenovo TB350FU, Android 14, Chrome, Gboard):** ipucu yokken Gboard tek alanda "Sonraki"
      gösterir ve Chrome bunu odak gezintisi sayar — sayfaya HİÇ `Enter` gelmez, komut paleti klavyeden çalıştırılamıyordu.
      `enterkeyhint` eklendi (`setEnterKeyHint`): `CommandPalette` `go`, `NumberStepper`/renk hex `done`, `Input` için
      açık `enterKeyHint` seçeneği (varsayılan: `onEnter` → `done`, `type: 'search'` → `search`). Cihazda "Git" tuşu gerçek
      `keydown Enter` (keyCode 13, bileşim dışı) üretir ve komutu çalıştırır. Gboard harfleri `keydown Unidentified`
      keyCode 229, isComposing false olarak gelir (bileşim olayı yok): `isComposingKey` bunların hepsini tanır.
      Kanıt: `graphemes.test.ts` (23; Segmenter + yedek yol), `keyboardGraphemes.test.ts` (6), `imeComposition.test.ts` (16:
      iki IME sinyali × palet/stepper/renk/Input/TextArea + enterkeyhint), `textEntry.test.ts` (+salt okunur/devre dışı),
      mutasyonla doğrulandı (IME tanıma ve grafem bölme kapatılınca 25 test düştü); gerçek cihaz:
      `devtools/vol-showcase/tests/device/textEntry.spec.ts` (2 senaryo, dikey ve yatay: gerçek Gboard'a `adb input tap`,
      palet, dokunmatik kipte ekran klavyesi açılmaması, salt okunur alanın klavye açmaması).
      **NOT-RUN (gerekçeli, devredildi):** Deck'te fiziksel kolla ekran klavyesi ve gerçek Steam klavyesi → UI-13.4/F08.6;
      Samsung Klavye/Japonca-Korece IME ve insan yazım hissi → UI-13.4; Android WebView'de (Chrome değil) Gboard → UI-11.4/F09.2.

- [x] **UI-11.2 — Native menü ve pano.** `core/src/ui/nativeMenus.ts` + `tauri-v2/src-tauri/src/native_menus.js`
      düzenlenebilir alan istisnası; ClipboardAdapter (web/native). Kapanır: yapıştırmayı kullanıcı
      başlatır; salt okunurda Kopyala/Tümünü Seç var, Kes/Yapıştır yok; parolada Kopyala/Kes kapalı;
      izin reddi/yetenek yokluğu akışı bozmaz; pano içeriği günlüğü yok.
      Yapıldı (2026-10-10): **düzenlenebilir alan menüsü** `installEditMenu` (`core/src/ui/textEntry/editMenu.ts`): yerel menü
      `suppressNativeMenus` ile kapalı kalır, yerine çekirdeğin kendi `ContextMenu`'sü (Kes/Kopyala/Yapıştır/Tümünü seç) açılır;
      fare sağ tık ve klavye (Shift+F10/Menü tuşu, koordinatsız olay alanın altına) aynı yoldan; dokunmada yerel seçim çubuğuna
      dokunulmaz (UI-11.3). Pano `ClipboardAdapter` sözleşmesinin ardındadır (`clipboard.ts`; web: `navigator.clipboard` +
      `execCommand('copy')` yedeği, kabuk kendi bağdaştırıcısını verir; asla fırlatmaz). Kurallar saf `planEditMenu`'da: devre dışı → menü
      yok; salt okunur → yalnız Kopyala + Tümünü Seç; parola → Kes/Kopyala kapalı; seçim/yetenek yoksa kapalı. Yapıştırma yalnız menü
      tıklamasıyla panoyu okur; Kes yazma başarısızsa metni silmez; izin reddi ve yetenek yokluğu alanı/odağı bozmaz ve `onResult` ile
      nedeni bildirir (vitrin uyarı bildirimi gösterir); menü açıldıktan sonra değer değişmiş ya da alan sökülmüşse eylem uygulanmaz;
      `maxLength` ve vekil çift korunur; tek satırlı alanda satır sonu boşluk olur; pano içeriği hiçbir yere yazılmaz (test konsolu
      izler). `ContextMenu`'ye additive `onClose`. Tüketiciler: vitrin (Formlar sekmesi "Düzenleme menüsü" kartı) ve VOL.TEST (senaryo paneli
      alanı). Kanıt: `core/tests/ui/textEntry/clipboard.test.ts` (6), `editMenu.test.ts` (32), `games/vol-test/tests/main.test.ts`,
      `devtools/vol-showcase/tests/e2e/editMenu.spec.ts` (iki motor, 15 geçti; WebKit'te gerçek sistem panosu testi atlanır: Playwright pano izni
      veremez, bellekte pano ile aynı akış iki motorda koşar). **NOT-RUN (gerekçeli, devredildi):** yerel pencerelerde gerçek pano izin
      davranışı: WebView2 → UI-12.4/F09.1, WebKitGTK → F08.6, Android WebView → UI-11.3/F09.2; hiçbir yerel pano eklentisi eklenmedi (web
      bağdaştırıcısı yeterli olmazsa o koşu gösterir).
- [ ] **UI-11.3 — Android Activity/ActionMode/Insets.** İzlenen MainActivity `onWebViewCreate`
      kancası; üretilmiş Activity düzenlenmez; standart WebView seçim menüsü önce, gerekirse dar
      Kotlin Plugin ve WindowInsets sağlayıcısı. Kapanır: gerçek cihazda kes/kopyala/yapıştır/
      seçim tutamaçları/uzun basış; bar/cutout/rotation/adjustResize/fullscreen/bölünmüş/yüzen
      IME; hayalet iç boşluk yok; OS geri olayı ikinci geri olayı üretmez.
- [ ] **UI-11.4 — Metin Girişi sekmesi + APK.** Yetenek/taklit/native ayrımı; sağlayıcı var/yok,
      hata/yarış/güvenli giriş/dil. Kapanır: fiziksel Android son build APK açılır; OS/WebView/
      Tauri bilgisi, %200 sistem fontu ve %200 web ayrı; kendi vitrin ekran görüntüsü; erişilmeyen
      Samsung NOT-RUN; WebView ölçüm sondası kalibre edilir.

### UI-12 — Deck metin/glif ve Windows / M7

Ön koşul: UI-12.1 için UI-11.1; UI-12.2–12.3 için UI-03 (12.3 ayrıca UI-02.8); UI-12.4 için UI-06.2 ve UI-11.2.

- [x] **UI-12.1 — Steam metin sağlayıcısı.** `tauri-v2/src/platform/steamworks.ts` ve plugin
      `service.rs`: parola isteği→Password modu, yüzen tek/çok satırlı giriş, sahibin iptali.
      Kapanır: diyalog sonucu ile yüzen klavye tuş olayı ayrı testli; gerçek Steam runtime sondası
      (AppID 480/başarılı IPC ürün kabulü değildir); OSK yedeği korunur.
      Yapıldı (2026-10-10): **diyalog** (`createSteamworksTextEntryProvider`) zaten parolayı `Password`, diğerlerini `Normal` kipine
      çeviriyor ve sahibin iptalinde native girişi kapatıyordu; **yüzen klavye** için JS yüzü yoktu, çok satır kipi yoktu ve iptal SDK'dan
      kapatmıyordu. Şimdi: Rust `show_floating_input` `mode` (`singleLine`/`multiLine`; IPC başka kipi kabul etmez, SDK eşlemesi
      `steamworks` özelliği altında testli) ve alan dikdörtgenini (pozitif boyut) IPC sınırında doğruluyor; `cancel_text_input` etkin istek
      yüzen klavyeyse `DismissFloatingGamepadTextInput` çağırıp sahipliği boşaltıyor (diyaloğun SDK iptali yok; yalnız sonucu yok sayılır).
      JS: `showSteamFloatingKeyboard(anchor, {multiline, password, signal, scale})` ve alandan türeten `showSteamFloatingKeyboardFor(field, signal)`
      — sonuç metni taşımaz, yalnız `dismissed | unavailable | busy | canceled` (tuşlar doğrudan odaklı alana yazılır; diyalog
      `text-input` olayına abone değildir). Parola alanı, salt okunur/devre dışı alan, geçersiz dikdörtgen ve Steam'in `false` yanıtı
      `unavailable` döner (native çağrısız ya da aboneliği bırakarak); çağıran core OSK'ya ya da diyalogun `Password` kipine düşer — yüzen
      klavyenin maskesi yoktur, o yüzden parola ona verilmez. Kanıt: `tauri-v2/tests/platform/steamworksFloating.test.ts` (21; abonelik
      show'dan önce, ölçekli dikdörtgen, kapanış olayı kimlik eşlemesi, show'dan önce gelen kapanış, busy, abort/geç show/üst süre/iptal
      reddi, OSK yedeği; beş mutasyonla öldürülme denetimi), Rust: `cargo test` 12 (stub) ve `--features steamworks` 18 geçti, clippy
      `-D warnings` iki yapılandırmada temiz. **NOT-RUN (gerekçeli, devredildi):** gerçek Steam runtime'ında yüzen klavyenin alanı örtmeden
      açılması, CSS→pencere pikseli çarpanının (`devicePixelRatio`) Steam'in beklediği koordinatla uyumu ve `FloatingGamepadTextInputDismissed`
      geri çağrısı → F08.6/F04.4; AppID 480 veya başarılı IPC ürün kabulü sayılmaz. Core'a `blur` eden sağlayıcı sözleşmesi eklenmedi:
      yüzen klavye odaklı alanı gerektirir, bu yüzden `TextEntryProvider`'a karıştırılmadı.
- [ ] **UI-12.2 — Eylem glifi ve kol geçişi.** InputPresentationController/Glyph ile etkin eylem
      kaynağı; remap, hotplug/çoklu kol/Steam Input kapalı/trackpad/fare/klavye. Kapanır: gerçek
      bağlama glifi ile aile yedeği ayrı; çift işaretçi sahibi yok; Deck ekran klavyesi/menü/diyaloglar
      yalnız kolla erişilir; kol modunda imleç davranışı UI-01.9 ile uyumlu.
      Kısmi kanıt (2026-10-08, Deck host derlemesi, OS düzeyi sanal Xbox kolu): vitrinde Touch → Gamepad
      demosu kol bağlanınca "Input mode: gamepad" ve eylem glifini fare/Space'ten RT/A'ya çevirir, fare
      hareketi "pc" glifine geri döndürür. Fiziksel Deck düğmeleri, Steam Input yeniden bağlaması ve çoklu
      kol önceliği ölçülmedi (NOT-RUN).
      **Seçili durum (2026-10-08, kullanıcı ara geri bildirimi: "kolla gezerken yalnız kenarlık olmasın")**:
      eski `.vol-focusnav-current` düğmeyi `accent-subtle` (lacivert) bir bloğa çeviriyor, satır/ağaç/
      tablo/akordeon/girdide yalnız ince halka bırakıyordu. Yeni `core/src/ui/material/selection.css`:
      düğme ailesi kendi rengini koruyup hover'dan parlak, altın tonlu yanık yüzey + altın kenar + hale
      alır; satır benzeri öğeler (ağaç satırı, tablo satırı, akordeon başlığı, seçenek, menü satırı,
      komut paleti, kısayol düğmesi) marka tonlu seçim plakası + 4 px sol şerit; sekme/segment alt şerit;
      girdi kuyuları aydınlanır; klavye (`:focus-visible`) ve kol aynı görünür. **Kutu kımıldamaz**
      (transform yok): uzamsal kol gezintisi odaklı öğenin dikdörtgenini okur, 1 px kaldırma ekran
      klavyesi turunu bozdu (e2e yakaladı, kaldırıldı). **Gerçek Deck'te (host AppImage, xdotool ok tuşları;
      sanal kol bu turda `sudo` parolası olmadığından kurulamadı) görülen hata:** yan menünün `Tabs` ok
      tuşu odağı kendisi taşıdığı için `FocusNavController` halkası önceki öğede asılı kalıyordu (eski
      hata, yeni seçim plakasıyla görünür oldu) → halka yalnız onu taşıyan eleman odaktayken geçerli
      (`focusin` temizliği, `focusRingHandoff.test.ts`). Aynı turda seçili+odaklı sekme satırı yalnız halka
      gösteriyordu (kabuğun `[aria-selected]` kuralı daha özgüldü) → sekme seçicisi güçlendirildi.
      Yükleme ekranı `hide()` anında arka sayfayı hemen açar (asgari gösterim boyunca klavye ölü
      kalıyordu; VOL.TEST WebKit duraklatma e2e'si yakaladı). Fiziksel Deck'te görsel kabul kullanıcı turunda.
- [ ] **UI-12.3 — Haptik/native yaşam döngüsü.** Mevcut hidraw/evdev/Steam/Android sürücüleri;
      açık Test düğmesi/durum; yanlış yetenek bildirimi. Kapanır: sıfır/kapalı sessiz, tek sürücü;
      uyku/odak kaybı/cihaz çıkarma/çıkışta durma gerçek sonda; hissiyat kullanıcı beyanı ayrı.
- [ ] **UI-12.4 — Windows yükleyicisi ve metin laboratuvarı.** NSIS derleme/yükleme/kaldırma/açılış,
      WebView2, DPI 125/150/200, font/input/clipboard/back. Kapanır: asgari eklenti izinleri ve
      özgün kimlik; ekran görüntüsü + build özeti; WebView2 kare/CPU atfı A/A ile kalibre.

### UI-13 — Tam kalite, çapraz kabul ve teslim

Ön koşul: bütün önceki fazlar. Sahip bağımsız kalite incelemesi.

- [ ] **UI-13.1 — Tam tier-1 / M3 ve katalog kapanışı.** CATALOG'daki tüm sınıf ve yardımcılar yeni
      exportlarla yeniden çıkar; Tier-1 tam durum, Tier-2 gerekçeli N/A. Kapanır: ertelenmiş
      applicable durum ve açık AA bulgusu sıfır; registry gerçek test bağlantısı tam; public yüzey
      kilidi/belgeler/README/i18n uyumlu; kullanılmayan bağımlılık/anahtar/varlık yok; döngü ve
      1000 satır sınırı korunur.
- [ ] **UI-13.2 — Etkileşim stresleri.** İç içe modal→Select→OSK→IME, istek beklerken tema/dil
      değişimi, hızlı tekrar/yükleme iptali, %200/RTL/multidokunma/kol↔dokunma/hotplug,
      askıya alma/devam, sessizleştirme/ses erişimi. Kapanır: kayıp odak/yinelenen kalıcı
      değişiklik/kalan kaynak/eski sonuç yok; iki motor testleri başarılı.
      Kısmi kanıt (2026-10-08): `stress.spec.ts` (iki motor): OSK açıkken dil ve tema değişimi, Modal/Sheet
      açıkken sistem kaynaklı dil değişimi, altı kez art arda modal aç/kapat → konsol hatası yok, yetim
      katman/gövde kilidi/inert kalmaz, açık kalan klavye çalışır. Kalan: modal→Select→OSK→IME zinciri
      (gerçek IME gerekir), istek beklerken tema değişimi, %200/RTL altında aynı akışlar.
- [ ] **UI-13.3 — Gerçek cihaz/performans.** Windows, Deck host/SLR4, Android profilleri aynı
      örnekle A/B; VOL.TEST yükleri sabit tohumla. Kapanır: CPU gürültü sınırı ve ekrana sunum
      ayrı; UI maliyeti toplam FPS'ten ayrı kök neden; 10 dk termal; bilinmeyen NOT-RUN.
      **Gerçek cihaz turu (2026-10-08, kullanıcı: "Samsung bağlandı; dikey ve yatay, tek tek tüm sekmeler";
      "Deck'te neden 60 FPS sabit değil / 30–40"; "APK'larda FPS")**. Yeni araç: vitrinde kare ölçer
      (`Shift+B`/`?bench`, `frameBench.ts`; sekme sekme kaydırarak SUNULAN kareyi ölçer, yavaş sekmede kart kart
      gizleme + CSS özelliği kapatma/ekleme ayrıştırması, `window.__volFrameBench`). **Samsung S21 FE** (Android 16, Chrome
      137; ilk açılışta hesapsız devam seçildi): dikey 384×725, yatay 796×283 CSS px; 14 sekmenin 14'ü iki yönde de
      **59,9–60 FPS kilitli, 0 yavaş kare**; cihaz kabulü dikey 6/6, yatay 5/6 → yatayda **ekran klavyesinin Vazgeç/Bitti
      satırı kırpılıyordu** (tuş 34 px, <40): ≤420 px yükseklikte son iki satır birleşir, başlık gizlenir, tuş 40 px
      (`OnScreenKeyboard`, `keyboard.test.ts`). Sekme sekme kaydırma incelemesi (dikey tam, yatay örnek) yeni bulgular:
      Workbench bölünebilir panelinde görüntü çubuğu kart kırpmasının arkasında kalıyordu (flex-wrap), Kimlik ikon galerisi
      `align-self: flex-start` yüzünden tek dar sütuna düşüyordu (masaüstünde de), SlotGrid 6×56 px telefon dikeyinde sağdan
      kırpılıyordu (44 px hücre). **Lenovo tablet**: iki yönde ≈60 FPS (Text sekmesi 57,7–58,3). **Steam Deck**: ölçüm ve
      kök neden `docs/steam-deck.md`'dedir (Forms 42,9 / Touch 46,5 → kart başına bileşik katman ile 60,0 / 59,4; 14 sekme
      57–60,6, ortanca 60,2; kök neden CPU boyama, GPU %0). Bir de gerçek hata: Tabs'in kendi ok tuşu odağı taşıyınca
      `FocusNavController` halkası eski öğede kalıyordu (düzeltildi).
      **Kullanıcı görsel onay paketi (F07 yeniden açılış öncesi, yerel ve git dışı):**
      `node devtools/vol-showcase/scripts/gallery.mjs --tag <ad>` (sabit `en-US` dil) 294 kart şeridini (çelik + aurum;
      varsayılan/hover/odak/basılı) ve 58 açık katmanı (modal, sheet, onay, popup, popover, bağlam menüsü, bildirimler,
      diyalog, komut paleti, ekran klavyesi, zengin ipucu, radyal menü, seviye/mağaza, yükleme) üretir; gerçek cihaz
      görüntüleri (Steam Deck çelik+aurum 14 sekme, Samsung ve Lenovo dikey+yatay 14 sekme) aynı yerel kaydın cihaz alt alanında
      altındadır, sıra `INDEX.md`'dedir. Deck'te kol sanal girdisi (sudo parolası yok) yerine `xdotool` ok/Enter tuşları
      kullanıldı; fiziksel kol ile gezinme bu pakette yoktur. Android'de yerel kare ölçümü Samsung jank %0,36–0,44,
      Lenovo %1,9–2,3 (`docs/android.md`; Lenovo farkı açıklanmadı).
- [ ] **UI-13.4 — İnsan erişim/görsel/haptik/ses.** Yalnız klavye/kol gerçek akış, seçilen AT +
      TalkBack + NVDA/Narrator, TR/EN/%200/gri ton, glif yüksekliği, haptik; kullanıcının
      görsel/ses/imleç feedback’i isteğe bağlıdır (ses: `pnpm --filter @volstudio/audio-synth audio:listen` paketi + laboratuvar palet A/B). Kapanır: gerçek erişim/girdi ve profil kaydı; eksik cihaz profili açık kabul, beğeni bekleme kapısı değildir.
- [ ] **UI-13.5 — Sürüm adayı teslimi.** `pnpm signoff`, public yüzey/paket boyutu/ölçekleme;
      piksel temelleri incelenmiş; belgeler güncel. Kapanır: high/signoff ve gerçek kabul ayrı
      PASS/FAIL/NOT-RUN raporu; kalan her iş kök/paket TODO'da gerçek ölçütle açık; **F07 kapanır.**

## Kapatılanlar

- [x] B24/B25 — İç içe kök olay sahibi, Ses sekmesi dinletim ayrımı ve geç restore alan/snapshot korunumu gerçek tüketici regresyonlarıyla düzeltildi; UI-02/UI-13 bütün matrisi açık.
- [x] B26/B28 — Mini harita scoped tema, geç mount/remount ve canlı erişilebilir ad CORE/MapPanel/HUD regresyonlarıyla düzeltildi; UI-07/UI-08 bütün aile kabulü açık.

Planın hazırlanmış olması bir üretim görevini kapatmaz; yalnız kapıdan geçmiş ve vitrinde/oyunda görünür iş buraya taşınır. Kabul edilmeyen kapanışlar işaretlidir.

- [x] UI-01.10 — Juice ve hareket ilkelleri: `MOTION_JUICE` adlı ilkeller (basma squash'ı, kaldırma, odak nabzı, sayı patlaması, vuruş flaşı, panel girişi, sınırlı sarsıntı, hasar şeridi gecikmesi), `playJuice` (hareket azaltılmışta ölçek ve sarsıntı yok, flaş kalır), Bar hasar şeridi ve vuruş flaşı, düğme hata sarsıntısı. Tamamlanan: `Counter` `overshoot` seçeneği (`Easing.easeOutOvershoot`, hedefi en çok %3,7 aşıp oturur; varsayılan kapalı, azaltılmışta yok, duyuru/`getValue()` hedef; vitrin altın sayacı); `playJuiceSequence` (40 ms basamak, en çok 6 basamak, dizi tek bütçe hakkı) ve `Modal` çok parçalı giriş; **eşzamanlı grup bütçesi gerçekten uygulanıyor**: `playJuice` belge başına `MotionController` hakkı ister (3 eşzamanlı grup, kullanıcı eylemi dekoru keser, hak bitişte/kesintide döner; bütçe doluysa dekor oynamaz); **WCAG flaşı**: pencere içinde en çok 3 flaş (1 sn + 100 ms emniyet) ve 341×256 CSS px alan sınırı (`JUICE_FLASH_LIMIT`), gerçek tarayıcıda art arda 60 vuruşla iki motorda ve azaltılmış harekette ölçüldü (`motionMeasure.spec.ts`); **maliyet**: Chromium izinde 5 eşzamanlı etkinin etkisiz tıklamaya göre ek CPU'su ortanca ≈0,5–0,8 ms, p95 ≈2,2 ms (A/A gürültü 0,2–0,8 ms), gerilememe bekçisi 1,5/4 ms; GPU ve ekrana sunum başsızda yok, **kare süresinin %5'i kabulü cihaz A/B'sinde NOT-RUN (F09)**. Düzeltilen belge hatası: `data-vol-motion="reduced"` hiç uygulanmamıştı, yorumdan çıkarıldı. Public yüzey +1 (`playJuiceSequence`). Kanıt: `juice.test.ts` (13), `counterOvershoot.test.ts` (4), `modalEntry.test.ts` (2), `motionMeasure.spec.ts` (iki motor).
- [x] UI-01.7 — Malzeme ve çerçeve dili: tek ışık yönü, skin parametreleri, basılabilir yüzey, girinti/panel/basılı yüzey, çerçeve dili v2 (plaka çerçevesi, ikinci hat, başlık şeridi), HUD barı (segment çentikleri, parlak üst bant, kenar ışığı), vitrin kabuğu ve KİMLİK malzeme bölümü. Tamamlanan: **son renk kontrast ölçümü** (`finalContrast.spec.ts`, iki motor × iki skin × 15 kayıt: metin silinip çizilmiş zemin pikselleri okunur, metin rengi her pikselin üstüne bindirilir, en kötü piksel eşiği geçmeli; negatif sabitler gradyan/alfa/büyük metni sınar) — **gerçek kusur bulundu**: bar etiketleri (12 px) son renkte 2,3–2,9:1 çıktı ("elle okunur" kaydı yanlıştı) → `Bar`/`TimerBar` etiketi kendi `--vol-ui-scrim` plakasını taşır, ölçüm 11,8–12,0:1 (default) / 11,5–12,3:1 (aurum); diğer 13 metin ≥5,0:1 (en düşük "Pressed" 5,04 default, 6,84 aurum); axe'in hesaplayamadığı `color-contrast` kayıtları sahip görev istemez (piksel ölçümü kapsar, `uiEvidence` kuralı); **hasar gecikme şeridi** gerçek saatle iki motorda ölçüldü (eski seviyede 420 ms kalır, 380 ms'de erir, dolgunun altına inmez; azaltılmışta gecikmesiz aynı son durum); **gölge/blur bütçesi** (`materialBudget.spec.ts`): 14 sekme + 6 açık katman × 2 skin'de etkin blur yüzeyi 0, bulanık dış gölge 0, en çok 6 gölge katmanı (sözleşme: 1 blur yüzeyi), tavanlar kapıda, dedektör bulanık/sert/iç gölge ve backdrop-filter sabitleriyle sınanır. Piksel temelleri bilinçli yenilendi (bar/zamanlayıcı etiket plakası; touch: slot ızgarası ipucu metni). Kayıtlı kalan axe `incomplete` kayıtları UI-05.2/09.1/12.2 sahibindedir.
- [x] UI-05.5 — Form kabulü (teknik; gerçek Deck kolu, gerçek AT ve isteğe bağlı kullanıcı değerlendirmesi NOT-RUN): **Her form denetimi yalnız klavye, yalnız kol, dokunma, %30 uzun metin ve altı hane ile gerçek tarayıcıda sınandı** (`formAcceptance.spec.ts`, Chromium + WebKit). Yalnız klavye: Tab ile formlar panelindeki bütün denetimler tekrarsız sırayla gezilir, her durak görünür pencerede, üstü örtülmemiş (işaretçiye kapalı eğri noktası vekilleri hariç) ve odak göstergesi taşır. Yalnız kol: panelin her denetimine odaklanıp dört yönde de gerçek `FocusNavController` ile basılır; her denetime D-pad ile ulaşılır ve ilk denetime D-pad ile dönülür (ölü uç/tuzak yok), iniş halkası her durumda görünür; A onay kutusunu değiştirir, seçimi açar, B kapatır. Dokunma: onay kutusu, bölümlü denetim, artır düğmesi, kaydırıcı, seçim parmakla çalışır. Altı hane: 999 999 adım girdisinde, kaydırıcıda ve aralıkta 1280/360/320 px'te kırpılmaz ve karttan taşmaz. **Ölçümle bulunan gerçek kusur:** NumberStepper girdisi 56 px sabit genişlikteydi ve 6 haneyi kırpıyordu (içerik 84 px, görünür 54 px) → genişlik aralığın en geniş yazımından (`--vol-stepper-chars`: işaret ve ondalık dahil) gelir, küçük aralıklar eski 56 px'te kalır. Ayrıca `FOCUSABLE_SELECTOR` doğrudan kanıt kazandı (`focusable.test.ts`) ve kayıt boşluğu kapandı. Bileşik denetim yön sahipliği UI-05.2/05.3'te, durum matrisi/axe/%30 metin/katman örtüşmesi `stateMatrix`/`accessibility`/`pseudoLocale`/`focusVisible` tarafında zaten bütün sekmeleri kapsar. Vitrinde "Six-digit values" kartı; `forms` + aurum temelleri yenilendi ve incelendi. Kayıt: [VERIFICATION](VERIFICATION.md) "Form kabul kaydı".
- [x] UI-05.4 — SettingsForm/SettingsRow (teknik; gerçek AT duyurusu, Tauri diskte yazım hatası ve Steam Cloud eşzamanı NOT-RUN): **Model ve tarif ayrıldı.** `SettingsModel` (DOM yok) değeri, taslağı, hatayı ve kaydı tutar: `set`/`reset`/`resetAll`/`revert`, alan doğrulaması (geçersiz alan uygulanmaz), `apply` kapsam (`device`/`synced`) başına TEK atomik yazım yapar — bilinmeyen alanlar korunur, bir kapsam yazılamazsa onun taslağı kirli kalır ve diğer kapsam bağımsız işlenir, yazım sürerken ikinci uygulama `busy` döner ve yazım sırasındaki yeni düzenleme kaybolmaz/yanlış işlenmez; bozuk/tür uyumsuz/geçersiz kayıtlı alan varsayılana iner. `SettingsForm({ model })` tarifi çizer: `addField` (denetim ↔ taslak çift yönlü, satırda hata ve "Varsayılan" düğmesi yalnız sapmada), Uygula/Geri al/Varsayılana dön çubuğu (temizken ve kaydederken kapalı, `aria-busy`, `role=status` duyurusu: kaydedilmemiş sayı, Kaydediliyor, Kaydedildi, hata). **Escape/geri kararı tüketicide:** `requestClose(decide)` kirli değişiklikte `apply`/`discard`/`stay` kararını tüketiciden alır; kaydedilirken kapanma yoktur. **Ses/müzik satırları ses sistemine bağlı:** `createAudioSettingsRows(port)` (`UiSoundKit` yapısal olarak karşılar) ana seviye + arayüz/efekt/müzik/konuşma kaydırıcıları ve sessize alma anahtarını canlı yazar (taslak yok; kalıcılığı kit kendi cihaz kapsamlı anahtarıyla yapar), `refresh()` dış değişimi sessizce yansıtır. Vitrinde "Uygula / Geri al’lı ayarlar" ve "Ses ayarları (canlı)". Ölçümle bulunan gerçek kusur: etiketsiz kaydırıcı ayar satırında (max-content sütunu) tutamağa çöküyordu ve değer yazmıyordu → satırda genişlik + yüzde okuması. Kanıt: `settingsModel.test.ts` (23), `settingsModel.spec.ts` (iki motor), `forms` temelleri. Kayıt: [VERIFICATION](VERIFICATION.md) "Ayar formu kaydı".
- [x] UI-05.3 — Panel/yerleşim (teknik; gerçek AT duyurusu ve Android %200 NOT-RUN): Carousel pasif slaytları `inert`+`aria-hidden`, noktalar gezici odaklı sekme, otomatik geçiş odakla durur, aynı sayfa `onSlideChange` üretmez; Wizard `goToStep`/destroy bekleyen doğrulamayı geçersiz kılar; UIRoot paylaşılan kökü referans sayar (son sahip kaldırır). **Yeni:** Tabs gizli paneli `inert`; tekli Accordion `defaultOpen` verilse de yalnız ilk geçerli bölümü açar, bilinmeyen kimlik yok sayılır; Tree kapalı dalı `inert` + `visibility: hidden` (yüksekliği 0 olan satırlar AT ağacında, Tab’da ve ölçümde kalmaz) ve kapanan dalın içindeki odak/gezici sekme durağı sahibi satıra taşınır. **Yön sözleşmesi** (`core/src/ui/direction.ts`, `isRtl`/`inlineSign`, en yakın `dir`): sırası okuma yönünü izleyen yapılar (Tabs, Toolbar, SegmentedControl, Tree, Carousel, SlotGrid, Kanban) RTL’de aynalanır ve sağ ok geri gider; fiziksel denetimler (Slider, RangeSlider, kart destesi, mini harita, joystick) aynalanmaz. Carousel RTL’de izi ters yöne kaydırır, sürükleme eşiği yönü izler, sol düğme “Sonraki” adını alır ve kenar kilidi (`aria-disabled`) okuma yönüyle yer değiştirir (yön öğe belgeye eklenince okunur: ilk yerleşim, odak ve dil değişiminde yenilenir). **Ölçümle bulunan gerçek kusurlar:** RTL’de Carousel sayfa 1 ekran dışında kalıyordu ve “Sonraki” düğmesi ilk sayfada kilitliydi; kapalı Tree dalı satırları 98×0 px olarak çizili kalıp AT’ye ve Tab’a açıktı (eski “telefonda 220 px sekme şeridi” gerekçesi yanlış atfediliyordu; kayıt silindi); `aria-modal` olan ekran klavyesi Tab’ı arkadaki sayfaya sızdırıyordu (Tab artık klavyede döner); soluk metin (`uiTextMuted`) `uiSurface3`/seçili/basılı dolguda 4,5:1 altındaydı (3,72–4,46) → `#83919d`→`#96a4b0` (4,71–5,65:1; üç bilinen kontrast kaydı silindi). Genişlik/yakınlaştırma kanıtı: `pseudoLocale.spec.ts` (1280×800, 360×740, 320×568, LTR/RTL), `readability.spec.ts` (×1,5 ve ×3), `focusVisible.spec.ts` (modal/sheet/OSK katmanında Tab ile gezilen her denetim görünür pencerede ve örtülmeden, 1280/360/320). Kanıt: `inlineDirection.test.ts`, `layoutStructures.test.ts`, `keyboard.test.ts`, `inlineDirection.spec.ts` (iki motor), `focusVisible.spec.ts` (iki motor). Kayıt: [VERIFICATION](VERIFICATION.md) “Panel ve yerleşim kaydı”.
- [x] UI-05.2 — Seçim denetimleri (teknik; Deck kol hissi ve gerçek AT NOT-RUN): Select seçenek `disabled`/boş liste satırı/`invalid` (önceki: aynı değer sessiz, açıkken devre dışı kapatır, harfle gezinme); Checkbox/switch kararı = anlam `variant` ile (`checkbox` varsayılan, `switch` → `role=switch`), `ariaLabel`/`invalid`; ColorPicker pasif kutucuk `inert`, yarım hex `aria-invalid`, taslak Escape, `valueCommit` niyeti; RadioGroup/SegmentedControl önceden aynı değeri yutuyordu. **CurveEditor** tuvali yalnız çizimdir: her nokta adlı gerçek düğme, ok taşır (Shift ×10, komşuyu geçmez), Delete siler, Enter/A tutar-bırakır (tutulu noktada oklar D-pad'e verilir), Escape geri alır, "Nokta ekle"/"Noktayı sil" düğmeleri (çift tık/Alt+tık yalnız fare kısayolu), canlı bölge, dokunmada 24 px yakalama, ikinci işaretçi devralmaz, iptal sessiz, çizim renkleri temadan. **Yeni sözleşme:** `data-vol-arrows="horizontal|vertical|both"` — odaktaki bileşik denetim D-pad yönünü klavye olayı olarak alır (tüketirse gezinme olmaz); `RangeSlider` tutamağı yatay eksenini alır (kol artık aralığı ayarlayabilir). Popup/katman geri önceliği `popupKeyboardStack` ile korunur; Escape taslağı geri alıp katmanı kapatmaz. Kanıt: `selectionControls.test.ts`, `valueEditors.spec.ts` (iki motor), `forms`/aurum/kart katmanı temelleri. Kayıt: [VERIFICATION](VERIFICATION.md) "Seçim ve eğri denetimleri kaydı".
- [x] UI-05.1 — Adlandırılmış editör ve değer niyeti (teknik; gerçek IME/AT NOT-RUN): `Input`/`TextArea`/`NumberStepper`/`Slider`/`RangeSlider` `readOnly` (değer/niyet/geri çağrım yok), `invalid` → `aria-invalid`, `ariaLabel`; IME bileşiminde Enter göndermez (`isComposing`/`keyCode 229`); kaydedilmemiş taslakta ilk Escape son kalıcı değere döner ve katmanı kapatmaz; `NumberStepper` boş/geçersiz metni değer saymaz, yazılan değeri aralığa ve adım ızgarasına oturtur, düğme adımı perdeli tick + kalıcı değişiklik niyeti taşır, sayı girdisi perdeyi aralıktan alır; sürüklerken devre dışı kalan `Slider` önizlemeyi geri alır; `RangeSlider` tutamak adları dilden (sabit Türkçe metin kaldırıldı), `aria-valuetext`, `aria-disabled`, PageUp/PageDown; dikey `Slider` `aria-orientation`; `TextArea` yazma/commit niyeti. **Gerçek kusur:** RTL'de yatay `Slider`'ın yerel girdisi aynalanıp çizilen tutamak aynalanmadığı için tıklama tutamağı çubuğun öbür ucuna atıyordu (%25 → %77) → kaydırıcı fiziksel (`direction: ltr`, RangeSlider ve deste yönleriyle aynı kural). Etiket→denetim bağı `PropertyField`/`SettingsRow`'da (`for`/`aria-labelledby`/`aria-describedby`) önceki işlerle kapalıdır. **NOT-RUN:** gerçek IME ile bileşim ve ekran okuyucu duyurusu (UI-13.4/F09). `RangeSlider` yalnız jesti başlatan işaretçiyi izler (`rangeSliderPointerOwnership.test.ts`). Kanıt: `editorContract.test.ts`, `uiSliderSound.test.ts` (stepper), `valueEditors.spec.ts` (iki motor). Kayıt: [VERIFICATION](VERIFICATION.md) "Değer editörü kaydı".
- [x] UI-04.4 — Kart kabulü (teknik; insan değerlendirmesi NOT-RUN): `cardMatrix.spec.ts` iki motorda nadirlik × normal/devre dışı/kilitli + salt sunum/kompakt/ikincil/sürüklenebilir/sürüklenen + uzun başlık/açıklama/`999999 Flux` stres kartları; iki skin × 1280×800/360×740 × metin ×1/×2 (eylem kart içinde, taşma/kırpılma yok); +%30 sahte dil ve RTL `pseudoLocale.spec.ts`; piksel temelleri `cards`, `aurum-cards` ve 6 kart katmanı (iki skin × seviye atlama/hata/dükkan); axe sekme + 3 kart katmanı ihlal 0, yeni kayıt yok. **NOT-RUN:** kullanıcı görsel/ses değerlendirmesi ve referans-özgün fark insan incelemesi (UI-13.4), Deck kol-only seçim (F08), gerçek AT duyurusu (UI-13.4/F09). Kayıt: [VERIFICATION](VERIFICATION.md) "Kart ailesi kaydı".
- [x] UI-04.3 — SwipeableCardStack: düğmesiz modda yığın odaklanabilir ve sol/sağ okla yönetilir (klavye), düğmeler kol/dokunma yolu; yönler fiziksel (RTL'de de ret solda, sürükleme ve ipuçlarıyla aynı); opt-in `announce` (karar + kalan sayı, odaktan bağımsız canlı bölge); kabul `confirm`, ret `cancel`, sürükleme başlangıcı `pick` niyeti (programatik karar sessiz); yakalama kaybı/ikinci parmak/fare ek düğmesi sağlam; azaltılmış harekette uçuş yok, son durum aynı. **Gerçek kusurlar:** uçuş sırasında düğmenin `disabled` olması odağı her kararda kaybettiriyordu (jsdom yakalamaz) → `aria-disabled`; uçuş zamanlayıcısı 180 ms iken CSS geçişi 350 ms'ti, kart yarı yolda siliniyordu → 240 ms ortak (`cssConstantSync` bağlar). Kanıt: `swipeableCardStack.test.ts` (birim), `swipeStack.spec.ts` (iki motor).
- [x] UI-04.2 — Picker ailesi: `CardPicker.setNotice` (yükleniyor `status` + `aria-busy`, hata `alert`; eski bildirim yeni sunumda/kapanışta temizlenir), seçici paneli başlığıyla adlı, LevelUpPicker seçimi 1,04 ölçekli `markPicked`; reroll/kilit/yetersiz/boş durumları ShopPicker'da mevcut. **Son seçimin tek niyeti:** kapanış animasyonunda (240 ms) ikinci tıklama/geri `onSelect`/`onClose`u tekrar çağırıyordu (gerçek kusur) → korundu. Vitrinde seviye atlama "yükleniyor" (1,2 sn sonra teklifler) ve "hata" demoları; axe 3 kart katmanında ihlal 0. Modal/geri/odak geri yükleme, hover-kol-dokunma eşdeğerliği ve host `levelUp`/`purchase` sesleri önceki testlerle (`cardPickerIntent`, `cardTile`, `shopPicker*`) korunur. Kanıt: `cardPickerStates.test.ts`, `cardMatrix.spec.ts`.
- [x] UI-04.1 — Kart yüzeyi ve CardTile: kart `group` + başlık adı, eylem düğmeleri "etiket + kart adı" (aynı etiketli düğmeler ayrışır), nadirlik renk dışı işareti (1/2/3 SVG baklava, `aria-hidden`; ◆ karakteri axe'in metin dışı saydığı için çizgi), kilitli kart kesikli çerçeve, `markPicked` seçim vurgusu (`--vol-motion-card-select-scale` 1,04; azaltılmış harekette ölçek yok, çerçeve kalır), kart eylemi `select` ve sürükleme `pick` niyeti (kök düğme yedeği yinelenmez). Kademeli giriş gecikmesi ham ms yerine `--vol-motion-preset-card-stagger` (40 ms; `CARD_ENTER_ANIMATION_MS` 540→480, `cssConstantSync` bağlar; `cards.css` ham süre sayacı 7→2). Rozet satırı artık nadirlik işaretini daima taşır (eski "etiket yoksa satır yok" sözleşmesi bilinçle değişti). Kanıt: `cardSurface.test.ts`, `cardMatrix.spec.ts`.
- [x] UI-03.2 — Hold/Charge/LongPress: aynı yüzey malzemesi (kabartma, gömülü basılı durum, devre dışı); iptal sözleşmesi (`holdButtons.test.ts`: pointercancel, yakalama kaybı, sayfa gizlenmesi, devre dışı ve söküm basışı bırakır, iptal ASLA eylem sayılmaz; uzun bas ve şarj düğmelerindeki iptal kusurları düzeltildi; ikinci işaretçi yok sayılır; söküm belge dinleyicisini kaldırır); **klavye ve kol eşdeğeri** (ortak `holdInput.ts`: Space/Enter ve kol A aynı basış/bırakış çifti, native `click` yutulur, odak kaybı iptal eder, `FocusNavController` A'yı `data-vol-hold` denetimine `vol:focuspress/focusrelease` iletir, basılı durum `aria-pressed`; `holdInput.test.ts` 7, `holdInput.spec.ts` iki motor + azaltılmış hareket + sanal kol). Karar: şarj/ateş/yön sesi oyunun SFX'idir (denetimler bilinçli sessiz). **Şarj yüzdesi okuyucu duyurusu kararı: çekirdek opt-in sunar** — `ChargeButton` `announce: true` ile kibar, atomik bir canlı bölge (`role="status"`, `aria-live="polite"`) taşır: dolum başlayınca "Doluyor", yüzde 25/50/75 ve tam dolumda "Tamamen doldu" (kare başına değil; metin `core:chargeButton.*` TR/EN), bırakış ve iptalde bölge temizlenir (eski duyuru yeniden okunmaz); `label` varsa düğme adı `aria-labelledby` ile etikettir (bölge adı kirletmez); varsayılan kapalıdır (host kendi HUD'ında duyuruyorsa çift okunmasın) ve DOM'a hiçbir şey eklemez. Vitrin şarj düğmesi açık kullanır. Kanıt: `chargeAnnounce.test.ts` (5: kapalıyken sıfır DOM, ad bağı, tam 5 duyuru sırası, temizlik, dolum sözleşmesi bozulmaz), `holdInput.spec.ts` (iki motor: 5 farklı duyuru, ad etiket kalır, bırakışta boş). Kalan/NOT-RUN: gerçek ekran okuyucuyla (NVDA/Narrator/TalkBack) dinleme doğrulaması (UI-13.4; bu makinede AT yok ve Playwright okuyucu çıktısını ölçmez).
- [x] UI-03.1 — Button/IconButton/ToolButton: malzeme ve juice (kaldırma, bastırma, odak nabzı), varyant×boyut×durum (normal/hover/basılı/odak/devre dışı/yükleme/hata); hata durumu (danger kenarı, sarsıntı, `data-state="error"`, sonraki tıklamada temizlenir); yükleme sırasında etiket erişilebilirlik ağacında kalır; async bitişinde dışarıdan verilmiş `disabled` korunur; Toolbar gezici tabindex uç durumları (`buttonDisabledContract.test.ts`); Enter/Space tek niyet (`ses.spec.ts`) ve sessiz kitle eşdeğer işlev (`uiSoundMuted.test.ts`). **Kayıtlı kontrast kusurları kapandı** (varsayılan temada 7 → 3; kalan 3 kayıt `uiTextMuted` UI-05.3 sahibinde): (1) `onBrand/brandHover` 3,07 — `brandHover` hem açık vurgu/bağlantı metni (12 CSS yeri, koyu yüzeyde okunur) hem dolgu hover'ıydı; iki rol bölündü: dolgu hover'ı yeni anlamsal rol `brandFillHover` (varsayılan `#ac5017` → onBrand ile 5,03:1, dolgu solid `#b85518` ile pressed `#a04a18` arasında; aurum `#dcb560` = eski hover), birincil/OSK düğmesi, sihirbaz sonraki ve mağaza kapat hover'ı bu rolden okur; kapı artık `onBrand/brandFillHover` ister; (2) `uiBorderStrong` 2,59/2,25/1,99 — `#495865` → `#68788a` (uiBg 4,19, surface1 3,64, surface2 3,22:1; bileşen sınırı ≥3:1; aurum zaten geçiyordu). Anlamsal rol sayısı 39 → 40, public `VOL_COLORS` 60 aynen. **Düğme içi ikon ölçeği**: `1,3 em` kesirli kutu (14 px yazıda 18,2 px; dolu siluetin kenarı bulanıyordu) yerine tamsayı ölçek `--vol-icon-sm/md/lg` = 16/20/24 px düğme boyutunu (sm/md/lg, Button ve IconButton) izler; kanıt `iconScale.spec.ts` (iki motor: kutu tam 16/20/24, ikon/ikon düğmesi oranı 0,45–0,65, etiketli düğmede ikon/yazı 1,0–1,7). Karar: kataloğun dolu siluetleri tek ağırlıktır, boyuta göre ağırlık değişmez (ağırlık ölçek + oranla ifade edilir); eski çizgi ikonların sabit 1,75 kalınlığı UI-10.4/10.5'te eşlemeyle ikonlardan çıkar. Piksel temelleri bilinçli yenilendi (24 Chromium temeli: açık güçlü kenarlık ve 2 px kısalan etiketli düğmeler). Kanıt: `uiTheme.test.mjs` (8), `aurum.test.ts`, `themeCss.test.ts`, `iconScale.spec.ts`.
- [x] UI-02.9 — Laboratuvar ve kulak notları (teknik kapanış; insan dinlemesi NOT-RUN, UI-13.4). **Referans ölçümü**: yeni `ui-reference-compare.ts` (`pnpm --filter @volstudio/audio-synth audio:ui-reference <klasör>`) Kenney Interface Sounds (100) ve UI Audio (51) CC0 referanslarını (yalnız yerel, depoya girmez) ve gönderilen 150 UI OGG'sini aynı yöntemle ölçer (tepe anlık LUFS, true peak, sub/low/mid/high bant dBFS, gövde/vurgu, ağırlık merkezi); tablo ve yöntem `VERIFICATION.md`'de. **Dürüst bulgu**: gönderilen set referansa göre çok gövdeli ve koyu (low +22…29 dB, high −22…37 dB, gövde/vurgu +27…37 dB, merkez 207–333 Hz, referans 2,2–3,8 kHz; mid ve tepe anlık yükseklik aynı aralıkta; true peak −5 dBTP). Sık olaylar (`press`, `toggle*`, `select`, `sliderTick`, `hover`…) koyu uçta: cihaz hoparlöründe "tok ama donuk" riski var, ölçülmedi. Körlemesine ayar yapılmadı (set dinlenmedi, önceki ret gövde eksikliğiydi); "boğuk/donuk" notu gelirse ölçülebilir hedef VERIFICATION'dadır (sık olaylarda high ≥ −45 dBFS, gövde korunur). **Dinleme paketi**: `listening.ts` artık gönderilen UI paletlerini (`core/audio-manifests/ui`) olay başına palet × varyant grubu olarak, kodek sonrası WAV'larla ve rehberle sunar (`counts.ui`; 150 öğe; birim testi). **Laboratuvar**: Ses sekmesine "Palet A/B" düğmesi (aynı olay ve varyant çelik sonra aurum, bağlam saatinde art arda, kuru); olay/palet/kuru-kit/indirme zaten vardı. "Eski/yeni A/B" uygulanamaz (eski 12 olaylık set D2 ile silindi, yeniden üretilemez; yerine referans tablosu + palet A/B). Kanıt: `listening.test.ts` (8), `ses.spec.ts` (iki motor; WebKit Windows'ta Web Audio yok → zincir atlanır), görsel temel bilinçli yenilendi (yeni düğme). UI-02 yayın kilometre taşı `signoff`u ayrı koşulmadı: signoff her zaman taze ve tüm ağacı kapsar, nihai UI-13.5 koşusu bunu içerir (ara koşu ek kanıt üretmez; her dilim `quick`/`high` ile geçti). Kalan/NOT-RUN: yeni setin insan dinleme kabulü (kulaklık + cihaz hoparlörü) ve cihaz hoparlöründe duyulan spektrum (UI-13.4, `pnpm --filter @volstudio/audio-synth audio:listen` paketi ve laboratuvar hazır).
- [x] UI-02.8 — Uygulama genelinde bağlama: kit 25 olay × 2 palet (çelik/aurum) ile vitrin kökünde ve VOL.TEST HUD kökünde (oyun bağlamı ve ana otobüsü üstünde; oyun SFX'i değişmedi, duraklatma paneli kitin `panelOpen`/`panelClose` sesiyle çalar, eski ses yalnız kit yokken yedek). Niyet türleri `navigate/pick/drop/notify/alert/type/erase/reject` + `open/close/confirm/cancel`: `Tabs`, `Modal`/`Sheet`/`Confirm`, `Accordion`, `Popover`/`ContextMenu`/`CommandPalette` (ortak `overlaySignal.ts`), `DialogueBox`, `SlotGrid`, `ToastManager`, ekran klavyesi, `Slider`/`RangeSlider` yayar; bileşen yaymadıysa kök düğme/sekme/menü/seçenek tıklamasını yedek olarak duyurur (`claim` yinelemez, `data-vol-silent` susturur). Kararlar: (1) kaydırıcı sürüklemesi (işaretçi/dokunma) `UI_SLIDER_DRAG_GAIN` 0,55 ile kısıktır, klavye ve düğme adımı tam seviye; yerel `input` olayı sürüklemeyi klavyeden ayıramadığı için `Slider` basılı işaretçiyi niyetin `source` alanında bildirir, `RangeSlider` önizleme + bırakışta tek `valueCommit`; (2) `release` bileşene bağlı değil (basılı tutma oyun SFX'idir, tıklama sesi `press`); (3) katman açılışı tetikleyici kayıtlı kökteyse sesli, kodla/tetikleyicisiz açılış ve söküm sessiz, seçimi izleyen kapanış çiftlenmez; (4) host olayları vitrinde bağlı: `reward`/`levelUp` (XP kazanımı), `equip` (envanterden kısayol çubuğuna taşıma), `purchase`; (5) VOL.TEST tek ana ses tercihi (`device.voltest.preferences.volume`, kalıcı) kitin kullandığı ana otobüse uygulanır — ayrı arayüz seviyesi/palet/sessiz denetimi oyunda yoktur, ses 0 = tam sessiz; kitin seviye/sessiz kalıcılığı vitrindedir (`localAudioStore`), palet temayı izler. Kanıt: `soundCoverage.test.ts` (olay→bileşen tablosu), `uiSliderSound.test.ts` (8), `overlaySignals.test.ts` (9), `slotGridIntent.test.ts` (gerçek işaretçi akışı, 4), vitrin `hostSounds.test.ts` (2), `uiSoundMuted.test.ts` (Button/Checkbox/Slider/Tabs sessiz kitle birebir aynı geri çağrı, durum, DOM ve sıfır ses), `GameAudio.test.ts` (kit ana otobüse bağlı). Paket payı: VOL.TEST app +5,8 KiB. Kalan insan dinlemesi UI-13.4'tedir (NOT-RUN).
- [x] UI-02.7 — Sentez ve ölçüt: audio-synth ile iki palet (`steel`, `aurum`) × 23 olay × 3 varyant sıfırdan üretildi (138 OGG; eski 12 olaylık `ui-*` aileleri, bank ve manifestleri silindi). Her olay üç katman ailesinden kurulur: gövde (düşen perdeli sinüs + doygunluk), ayrı süzülmüş temas tıkı, gerektiğinde modal çınlama/melodik katman; varyasyon boyutları gövde süresi, tık parlaklığı, çınlama perdesi ve gövde sıcaklığıdır. UI politikası güncellendi (yükseklik −42…−8 LUFS; eski yüksek geçiren ve sub kuralı kalktı); testler gövde+tık katmanı ve gövde bandının üst bantlardan zayıf olmamasını doğrular. `denied` ve `toggle-off` ailelerinde ortanca çeşitlilik eşiği düşürüldü (0,015/0,02): kısa kuru sesler, kasıtlı.
- [x] UI-02.6 — Ses brief'i ve olay sözlüğü v2: 23 olay (`hover`, `focus`, `press`, `release`, `back`, `confirm`, `toggleOn/Off`, `select`, `tabSwitch`, `sliderTick`, `valueCommit`, `panelOpen/Close`, `dragPick/Drop`, `equip`, `purchase`, `reward`, `levelUp`, `notify`, `denied`, `alert`); niyet→olay eşlemesi `UI_INTENT_SOUND`, ürün sonucu `UI_OUTCOME_SOUND` (başarı→`confirm`, uyarı→`alert`, hata→`denied`); mikro olaylar `hover`/`focus` 70 ms, `sliderTick` 45 ms; kritikler `alert`/`denied`. Paletler `steel` (çelik donanım) ve `aurum` (yaldızlı cam ve lake). Belge: `core/docs/sfx.md`.
- [x] UI-00.1 — `core/src/ui/index.ts` yüzeyi (89 sınıf, 29 yardımcı, 205 tip) AST'den çıkarılır; her sınıf/yardımcı `registry.json`'da tekil kayıtlıdır ve kapı kaydı yüzeyle, VOL.TEST tüketimiyle (17 sınıf doğrudan), vitrin kullanımıyla ve gerçek `it`+`expect` kanıtıyla karşılaştırır. Eski isim-geçişi bekçisinin yorum/metin mention'ını gösterim saydığı 9 yer ve kanıtsız 5 öğe (sahip görevli gap) ortaya çıktı.
- [x] UI-00.2 — Vitrinin 7 E2E dosyası Chromium ve WebKit'te koşar (40 → 68 test, 2,1 dk); tek istisna Chromium piksel temelidir ve `e2eConfig` bekçisi dosya listesini raporlar, gerekçesiz asimetriyi ve ölü istisnayı reddeder. WebKit'te çıkan tek kusur (`user-select` hesaplı stili yalnız ön ekli) testin motor farkıydı, CSS doğruydu. Linux temelleri WSL'de 6/12 yeniden üretildi: Linux hücresi doğrulanmamış.
- [x] UI-00.6 — Çalışan tarayıcı probu ve profil uygulanabilirliği: `devtools/vol-showcase/tests/e2e/support/frameProbe.ts` aynı kare atfını (CDP izinden JS, stil, yerleşim, boyama, commit, zorlanan yerleşim; `BeginMainThreadFrame.frameId`), girdi→görünür bağını (olay damgası, iz saati hizalaması) ve A/A/iz maliyeti kalibrasyonunu küçük fixture ile kurar (`probe.spec.ts`: bilinen 5 ms ve 25 ms yük bulunur, boşta kare medyanı <1 ms, araç olayları sayılmaz); WebKit'te iz `unsupported`. Native: Android 14 tablette VOL.TEST için resmi `dumpsys gfxinfo framestats` yolu GERÇEKTEN çalıştı (530 kare, 120 Hz, sunum p50 32,2 ms, işleme p95 8,8 ms, girdi işleme→sunum p50 31,4 ms) ve `scripts/android/frame-stats.mjs` olarak kalıcılaştı; Windows WebView2 (PresentMon eksik, UI-06.4), Steam Deck (cihaz yok, sunulan kare aracı eksik, UI-12.4) ve Android 16/Samsung (cihaz yok, UI-11.4) için eksik araç/sahip [doğrulama planında](VERIFICATION.md) yazılı. UI-03 pilotunun bağımlı olduğu çalışan browser probu hazır; desteksiz toplam CPU/GPU/sunum hücresi açık sürüm engeli olarak kalır.
- [x] UI-00.5 — İlk referans alındı ve kayıt yöntemi kuruldu: `node scripts/quality/cli/ui-baseline.mjs record <etiket>` (tarif `just ui-baseline`) vitrini ve VOL.TEST'i derler, iki motorda 12 sekmenin dondurulmuş ekran özetini (sha256) ve hareket azaltma kapalı/açık sürekli animasyon kümesini toplar, gönderilen gzip baytlarını ve `ui-perf` özetini ekler ve vitrin paketinin git dışı records alanına yazar; `compare <önceki> <sonraki> [--strict]` bundle büyümesini, ekran değişimini, yeni sürekli animasyonu ve ölçü yitimini kötüleşme sayar. Yeniden sayım: 12 sekme (E2E listesiyle aynı), 17 doğrudan sınıf tüketicisi (+4 yardımcı), vitrin anahtarı **830** (EN=TR; plandaki "821" yeniden üretilemedi, geri alındı), CORE 63. Tekrarlanabilirlik kanıtı: art arda iki kayıt 0 fark verir (24 ekran özeti, bundle baytları dahil). İlk kayıt: vitrin app 141979, css 20241 B; VOL.TEST app 103266, vendor 353881, css 18662 B; hareket azaltma açıkken iki motorun hiçbir sekmesinde sürekli animasyon yok, kapalıyken `vol-dialogue-bounce` her sekmede, `vol-spin` (buttons) ve altı glif animasyonu (text) sürüyor. Cihaz hücreleri: Steam Deck bağlı değil, Samsung ve Android 16 cihaz yok, Android tablet için yerel vitrin ölçümü henüz yok → hepsi NOT-RUN gerekçeli; kök F08/F09 ve VOL.TEST kabul işleri açık kalır.
- [x] UI-01.9 — İmleç sistemi: Kenney Cursor Pack (CC0) ve Crosshair Pack (CC0) paketlerinden kürate 19 arayüz + 20 RTS imleci (iki katman: koyu dış çizgi + gövde; etkin nokta yoldan çıkarılır) ve 20 nişangâh (nokta, artı, halka, çift halka, köşe ayracı, keskin nişancı…), `core/scripts/cursors/curate.mjs` ile `cursors.json` (71 KB) olarak (`--check` kaynakla sapmayı bildirir). `CursorController`: arayüz imleçleri kökte `--vol-cursor-*` değişkenleri (96 CSS `cursor` bildirimi artık değişkenden okur, kök varsayılanı sistem imleci); RTS bağlamı (`setContext`: dost/düşman/kaynak/ağaç/engel/inşa/onar/toplanma/devriye/garnizon/kenar kaydırma/…) hedef yüzeyin imlecini ŞEKİL ve gövde TONU (dost yeşil, düşman kırmızı, belirsiz sarı, komut vurgu) ile değiştirir, renk tek taşıyıcı değildir; nişangâh kipinde yerel imleç gizlenir ve çizilen nişangâh işaretçiyi AYNI olayda izler (açılım ölçeği, atış büyümesi, vuruş işareti, hareket azaltılmışta durağan). Dokunmatikte ve ince işaretçi yokken etkisiz, kayıt yüklenemezse sistem imleci kalır, `setVisible` kol işaretçisi için. Vitrinde KİMLİK sekmesi: 3 galeri (üzerine gelince gerçek imleç) + canlı RTS arenası (8 bağlam, kenar kaydırma) + nişangâh arenası (atış/isabet sayacı). Kanıt: 21 birim + 4 e2e (Chromium + WebKit): her bağlam ayrı imleç görseli, nişangâh merkezi işaretçiye ≤1 CSS piksel yakın, yerel imleç `none`, düğme eli değişkenden. Public yüzey +18 ad. Kalan/NOT-RUN: WebView2, Android ve Deck'te gerçek imleç davranışı ölçülmedi (headless imleç görüntüsünü çizmez; hesaplanmış `cursor` değeri ve nişangâh konumu ölçüldü); kol işaretçisiyle tek sahiplik UI-12.2'de; skin vurgu rengine bağlama UI-07.4'te (`setPalette` hazır).
- [x] UI-01.8 — İkon sistemi (**ikinci sürüm; ilki kabul edilmedi**: game-icons.net setinin ortaçağ temalı, süslü siluetleri oyun arayüzüne yakışmadı, kullanıcı minimal dolgulu ve modern istedi). Tek stil: dolu, yuvarlak, minimal, tek renk siluet. Kaynak: Phosphor Icons Fill (MIT, sürüm 2.1.1) seçkisi 173 ikon + Phosphor'da karşılığı olmayan 18 RTS/bullet hell nesnesi aynı 256 ızgarasında özgün çizildi (kule ailesi, mancınık, top, tank, helikopter, okçu yayı, kazma, külçe vb.; görsel incelemeyle düzeltildi). Kimlikler aynı kaldı (191: komut, yapı, birim, kaynak, mermi/bullet hell, durum, eşya, genel, kabuk), bileşen ve vitrin tüketicileri değişmedi. Üretim `core/scripts/icons/curate.mjs` (yerel Phosphor paketinden, `--check` kaynakla sapmayı bildirir; seçim `core/scripts/icons/icons.curation.json`, özgün çizimler `core/scripts/icons/authored.mjs`); atıf ve lisans her ikon için manifestte ve `CREDITS.md`'de. Çıktı iki sprite (`chrome.svg`, `game.svg`), ilk `Icon` kullanımında yüklenir. `Icon` boyut ağırlığı ve buton içi ikon ölçekleri UI-03.1'de kapandı. Kalan: eşlemesiz eski editör çizgi ikonları UI-10.4/10.5'te, uygulama içi kredi ekranı UI-09.4'te (yapıldı: `showLegalDocument`), sprite alt kümesi gönderimi ölçülen ihtiyaçla; kullanıcının ikon kabulü UI-03 görsel kabulünde.
- [x] UI-01.6 — Tema çifti: `default` bugünkü `VOL_COLORS` değerleriyle aynen kaldı; `ember` silindi (varsayılandan ayırt edilemeyen ikinci turuncu temaydı). İkinci tema `aurum` (`core/src/ui/themes/aurum.ts`, `pnpm gen:theme` ile `theme.css`e üretilir, 99 token): mor-siyah mürekkep yüzeyler, fildişi metin, şampanya altını marka, yeşim destek, orkide vurgu, yakut tehlike, altın odak halkası; rarity kimliği sabit. Ölçüm: `default`a OKLab uzaklığı marka 0,19, destek 0,14, vurgu ≥0,12, kenarlık 0,13 (eski ikinci tema bu eşiklerin çok altındaydı); marka tonu altında (38–52°), varsayılan turuncuda (<28°) değil; bütün final metin/zemin, ikon, odak, kenarlık ve dolgu çiftlerinde tema kontrast kapısı 0 kusur (default'taki 7 kayıtlı kusur değişmedi, aurum 0). Bu işle birlikte kabul edilmeyen üretilmiş ikon/çerçeve/doku/imleç hattı ve çıktıları silindi (üretici, 21 dosya, testler); yerine UI-01.7–01.9. Kayıtlı eski `ember` değeri varsayılana döner (mevcut çözümleme). Not: bileşen malzemesi (UI-01.7) henüz uygulanmadı; aurum şimdilik renkle ayrışır, derinlik/çerçeve/ses/imleç skin parçaları sonraki işlerdedir.
- [x] UI-07.1 — Görünen metin sıfır açık: yeni AST bekçisi `scripts/quality/i18nSurface.mjs` (eski metin aramalı `deadI18n` kapısının yerine; sözleşme kapısına bağlı, 15 fixture testi) TR/EN paritesini, camelCase adlandırmayı, kullanılmayan anahtarı (yalnız gerçek dizge sabiti kanıttır; test dosyası, yorum ve alt dizge kanıt değildir), eksik `ad:anahtar` sabitini, modül düzeyi `i18next.t`/`tDynamic` çağrısını ve DOM yuvası/UI seçeneği/işlev sonucundaki kodlanmış harfli metni denetler. Dinamik önek gerekçesi: şablonla kurulan anahtarlar önek+sonek AİLESİYLE (vitrin 9, vol-test 7; hepsi gerekçeli) bildirilir, üreten şablon kodda doğrulanır, bir anahtara denk gelmeyen aile reddedilir; dizge sabiti olmayan tek doğrudan okuma (`voltest:app.fatal`, i18next hazır olmadan) kanıt dosyasıyla bildirildi. Yeniden tarama bulguları ve düzeltmeler: XPBar varsayılan etiketi kodlanmış `Lv.` idi → `core:xp.progress` ("Sv./Lv. n — x / y"; erişilebilir ad etiketten gelir ve dil değişince güncellenir), vitrin RangeSlider `Lv.` biçimi → `volui:forms.enemyLevelValue`, DialogueBox'ın iki Türkçe kodlanmış `aria-label`ı → `core:dialogue.fastForward/skipLine` (açıkken dil değişince güncellenir, destroy'da abonelik bırakılır), `touch.dir_*` → `touch.directions.*` (adlandırma). Kalıcı istisna listesi 5 gerekçeli girdidir (yazı tipi adı Jura, denetleyici/klavye etiketleri RT/LMB/Space, ürün adı VOL.TEST); bayat istisna reddedilir. Modül düzeyi çeviri çağrısı yoktu; kapı yenisini engeller. `languageChanged` yaşam döngüsü (`core/tests/i18n/languageLifecycle.test.ts`, 21 test): 13 bileşende oluştur+destroy dinleyici sayısını geri getirir; açık Select popup'ı, açık CommandPalette, yanıtlanan Confirm modalı ve açık ekran klavyesi abonelik bırakır; ekran klavyesi dil değişince işlev tuşlarını odağı bozmadan çevirir (önceden bayat kalıyordu). Eksik anahtar örneği görünür başarısızlık üretir: kapı fixture'ı `eksik çeviri anahtarı` sorunu verir, çalışma zamanında bilinmeyen anahtar anahtarın kendisini gösterir (boş etiket olmaz) ve `tDynamic` `console.error` yazar. Sayım (başlangıç tabanı 830/63 altına düşmez, test taban olarak sınar): vitrin 882, CORE 66, EN=TR. Mevcut motor ve kalıcılık davranışı değişmedi (`I18n.ts` dokunulmadı).
- [x] UI-02.5 — **(Laboratuvar mekanizması kalır; olay sözlüğü UI-02.6 ve bağlama UI-02.8/02.9'da yenilenir.)** Ses laboratuvarı ve yayın kabulü: vitrine 13. sekme `SES` eklendi (`devtools/vol-showcase/src/sections/sesTab.ts`). Olay düğmeleri (12 olay), gerçek bileşenler (düğme/onay kutusu/seçici/kaydırıcı + ürün sonucu bildirimi), ana/arayüz/efekt/müzik/konuşma seviyeleri ve sessizleştirme, titreşim açma/şiddet, ses sayısı (`UI_MAX_VOICES`)/başlayan/düşen istek (`UiSoundKit.metrics`, `SoundBank.activeVoices`), bağlam durumu/örnekleme hızı/gecikme/titreşim yeteneği, niyet türü başına sonda, kuru (işlenmemiş örnek) ve kit (±%5 perde, kanal kazancı, bütçe) kıyası, örnek indirme. Niyet kökü yalnız "Gerçek bileşenler" kartıdır (çift ses/çift sayım yok); bağlam ve örnekler ilk jestte kurulur. Kanıt: 8 birim + 10 e2e (Chromium+WebKit; WebKit Windows'ta Web Audio yok → zincir testleri gerekçeyle SKIP), `just audio-verify` geçti (36 UI manifesti PCM `identical`, politika ihlali 0/33), Android 14 tablette Chrome ile bağlam `running` 48 kHz ve AAudio oynatıcısı `started` (yeni araç `scripts/android/audio-players.mjs`; cihaz medya seviyesi 0 olduğundan duyulabilirlik KANITSIZ). `UiIntentBus`/`UiHapticProvider` artık vitrinde gösterilir (SHOWN_VIA kalktı). Public yüzey +1 (`UiSoundMetrics`). axe: 6 kaydırıcı etiketi UI-05.1'e, 2 incomplete UI-07.4/UI-05.2'ye kaydedildi. Açık: gerçek Safari/iOS Ogg çözümü, Samsung/Deck/titreşim cihazı NOT-RUN; ses temeli yalnız `win32` (Linux temeli üretilmedi, `docs/windows.md`); insan dinleme onayı yayın şartı değildir. `pnpm signoff` UI-02 yayın kilometre taşı ayrıca koşulur.
- [x] UI-02.4 — Duck/haptik sözleşmesi: kritik olay (`error`/`warning`) isteğe bağlı kısma (`UI_CRITICAL_DUCK`: −6 dB, 120 ms iniş/80 ms bekleme/450 ms çıkış; yalnız kit bir `SidechainDucker` ile kurulduysa, kit ducker'a sahip değil) uygular; örtüşmede en güçlü kısma korunur (mevcut ducker sözleşmesi), iptal (`stopAll`), askıya alma, sessizlik ve söküm kısmayı `reset` ile geri alır ve ducker'ı sökmez. `UiHapticProvider` merkezî titreşim sağlayıcısıdır: niyet veriyoluna titreşim sahibi olarak abone olur (bileşenlerin eski yolu susar → niyet başına TEK darbe), `haptic:false` bastırır, ürün sonucu host bildirince `success`/`warning`/`error` darbesi üretir (Promise çözülmesi üretmez), aynı veriyolunda tek abonelik; desen tablosu, varsayılan KAPALI durum, kapasite, sıfır şiddet, desen başına sıklık sınırı ve tek sürücü kuralı `platform/haptics`te tek kaynak kalır. Sıfırlama: sayfa gizlenince, pencere odağı kaybolunca, cihaz yeteneği kaybolunca (sürücü/kol çıkarıldı; geri gelince sürer) ve `dispose`da süren titreşim kesilir, dinleyiciler sökülür. Sürücü yokluğu normal sonuçtur (hata yok, niyet ve eylem yine işlenir); ses erişimi kilitli ve `resume` reddedilse bile düğme işlevi, `aria-busy` ve görsel durum aynen gerçekleşir. 18 test (17 + kilitli bağlam). Not: tarayıcıda uçtan uca E2E bu sağlayıcıların vitrin laboratuvarına bağlanmasıyla (UI-02.5) eklenir; burada birim düzeyinde kanıtlıdır. Public yüzey +3 (kök barrel, tip ve isim kilitleri yenilendi, registry/katalog 93/41/227).
- [x] UI-02.3 — **(Kabul edilmedi; ses seti UI-02.6–02.7'de sıfırdan yeniden yapılır. Kalıcı kısmı: audio-synth `library` hedef türü ve CORE ses hedefi.)** Sıfırdan varsayılan UI ses seti: audio-synth'e yeni `library` hedef türü (D8) eklendi (`@volstudio/core` + `core/audio-target.json`; `kind: 'library'`, manifest `integration.targetKind` enum'u, context `undeclaredActiveLibraries`); ihlal örnekleri: beyansız kütüphane hedef olamaz, asset kök dışına/`.ogg` dışına yazılamaz. 12 olay ailesi (`ui-press/toggle/select/tick/commit/confirm/cancel/open/close/success/warning/error`) × 3 varyant = 36 mono 48 kHz özgün OGG, `core/public/assets/audio/ui/` altında (296 KB), bankalar `core/audio-banks/`, manifestler `core/audio-manifests/ui/`, aile ve iş kayıtları `devtools/audio-synth/records/families/ui-*` (rol ekseni `weight`: light/medium/heavy). Her aile kalite kapısını (kimlik, çeşitlilik, tutarlılık) geçti; çeşitliliği çökenler (confirm/success/toggle) ikinci perde boyutu ve daha geniş rol aralığıyla düzeltildi. `audio-verify` yeşil: 3 aktif ses ağacı, 36 UI dosyasında kodek sonrası sınıf politikası ihlali 0, PCM yeniden render özdeş (`identical`). Test (28): olay sözlüğü ↔ banka ↔ dosya ↔ manifest paritesi, `OggS` başlığı, boyut/süre, kütüphane hedefi + ui sınıfı + geçen politika, kodlama SONRASI ölçüler (gerçek tepe ≤ −1 dBTP, maxMomentary −28…−14 LUFS, DC <0,001, kırpma/tık 0, sonluluk, süre brief aralığında), bas/gövde ayrı filtre (her katman ≥200 Hz yüksek geçiren, geçici tık gövdeden daha yüksek kesimli, sub bandı mid'den ≥20 dB aşağıda, enerji merkezi ≥420 Hz). Ölçümle bulunan ve düzeltilen: ilk tasarımdaki `error` (300/260 Hz) ve `commit` gövde tonu küçük hoparlör için fazla alçaktı (merkez ≈290 Hz) → 540/450 Hz; `open`/`close` hışırtı katmanında bas süzgeci yoktu → eklendi (aile sürümü 2). **Üretilen sesler insan dinlenmiş sayılmaz** (UI-02.5/UI-03.4'te isteğe bağlı dinleme paketi). `uiSoundAssets(baseUrl)` çalışma zamanı URL'lerini verir.
- [x] UI-02.2 — UiSoundKit ve ayarlar: `core/src/audio/ui/` (yeni public alt yol `@volstudio/core/audio/ui`, package exports + alias + kök barrel + tip/isim kilitleri + 24 yeni sembol) anlamsal niyet ve host sonuçlarını sese çevirir; `SoundBank`in destination/gain yolunu ve ses bütçesini tüketir, `SidechainDucker` profilini yapılandırılırsa kritik olayda çağırır (profil tablosu UI-02.4); UI için yeni mixer/MusicEngine yok. `SoundBank` geriye uyumlu `priority` (`normal`/`critical`) kazandı ve `play` artık başladı mı döndürür: yalnız normal seslerde davranış eskisiyle aynı (en eski düşer), kritik en eski normali düşürür, normal kritiği düşüremez (6 test). Kit: toplam 4 eşzamanlı ses, mikro `tick` 120 ms sınırı (kritik muaf), olay başına en çok 3 varyant SIRAYLA ve ±%5 perde, kitin kendi tohumlu RNG akışı (`Math.random` hiç çağrılmaz, aynı tohum aynı dizi). Ayarlar cihaz kapsamlı (`device.volui:audio`): ana/UI/SFX/müzik/konuşma seviyesi + sessizlik (seviyeler korunur), bozuk kayıt varsayılana iner, kanal kazancı `master × kanal`, UI otobüsüne yalnız `master × ui` uygulanır. Kapanış testleri: bağlam yokluğu ve kurulum hatası (etkisiz kit, hata bir kez bildirilir), ön yükleme hatası (olay sessiz, rapor `loaded/failed`), ses başlatma hatası, kilitli bağlam (jestten önce çalmaz; ilk jestin sesi açılma sürerken çalar), arka plan (sesler kesilir, bağlam askıya, gizliyken gelenler geri dönüşte TOPLUCA ÇALMAZ), sessizlik, iptal (`stopAll`), `dispose` (sahip olunan bağlam kapanır, dışarıdan verilen kapanmaz, dinleyici söner), aynı veriyoluna ikinci `attach` ses çoğaltmaz, Promise çözülmesi başarı sesi değildir. Phaser'sız public erişim gerçek paketlemeyle doğrulanır (vite build: Phaser, `Diagnostics`, `MusicEngine` yok; 60 KB altı) ve vitrin ile VOL.TEST aynı alias kaynağını kullanır. Genel 24 ses ve varsayılan RNG varyant sözleşmesi değişmedi; müzik olmayan ürüne müzik eklenmedi. Varsayılan UI ses seti UI-02.3'tedir; kit bugün asset listesini seçeneklerden alır.
- [x] UI-02.1 — Tek niyet / tek olay: `core/src/ui/feedback/uiIntent.ts` tipli anlamsal niyet (`press`/`toggle`/`select`/`valuePreview`/`valueCommit`/…) ve kök başına paylaşılan `UiIntentBus` tanımlar; `Button`, `IconButton`, `Checkbox`, `Select`, `SegmentedControl`, `Slider`, `Input`, `NumberStepper` yalnız KULLANICI etkinleştirmesinde `emitUiIntent` çağırır. Aynı yerel olay iki kez niyete dönüşmez (`claim`: içteki bileşen sahiplenir, kart gibi dış katman sessiz kalır), pointerdown/pointerup/click dizisi tek niyettir; olaysız programatik çağrılar (`setValue`, `setChecked`, `setDisabled`, olaysız `…AndNotify`) kök varken niyet ve titreşim üretmez; devre dışı (`disabled`, `aria-disabled`, `inert`) hedef niyet üretmez; önizleme (`persistent: false`) ile kalıcı değişiklik ayrı; girdi yolu pointer/touch/keyboard/synthetic ayrımı; ürün sonucunu host `reportOutcome` ile bildirir, Promise çözülmesi başarı sayılmaz; bozuk dinleyici diğerlerini engellemez. Titreşim sahibi tektir: kök yoksa eski primitif yol birebir (mevcut 107 primitif testi aynen yeşil), kök var ve sağlayıcı titreşimi üstlenmediyse primitif bir darbe, sağlayıcı üstlendiyse yalnız sağlayıcı (çift darbe yok); `haptic: false` her durumda kapatır. `UIRoot.intents` aynı elemanı paylaşan iki köke tek veriyolu verir, son sahip gidene kadar yaşar. Kök barrel (`core/src/index.ts`) UI barrel'ıyla eşitlendi (ThemeController/MotionController/UiIntentBus vb. oyunlara açık); public tip yüzeyi kilidi (+35 sembol, 0 silinen) ve çalışma zamanı isim kilidi bilinçli yenilendi; registry/katalog 92/41/226. 19 test.
- [x] UI-01.5 — İlk planlanan kapılar `contract`'a bağlandı (`scripts/quality/uiTheme.mjs`, `quick`'te koşar): (1) `theme.css` üretilen bölgeleri (token, tema, hareket) ve (silinen) varlık çıktısı kaynaktan (`colors.ts`, `semanticColors.ts`, `ember.ts`, `presets.ts`, AST ile okunur) bayt bayt sapmamış, eksik/fazla varlık düşer; (2) kontrast SON renk üzerinden ölçülür (alfalı ön renk ve alfalı zemin opak tabana birleştirilir; yalnız hex çifti değil): 62 çift iki temada, ember 0 kusur, varsayılan 7 ölçülmüş kusur sahip göreve bağlı kayıtlı (`scripts/quality/uiThemeKnown.json`: `uiTextMuted` surface3/selectedFill/pressedFill için 3,87/3,72/4,46 → UI-05.3; `onBrand/brandHover` 3,07 ve `uiBorderStrong` 2,59/2,25/1,99 → UI-03.1), kayıtsız yeni kusur, bayat kayıt ve kapanmış sahip düşer; (3) UI CSS'inde ham (`var()` dışı) `transition`/`animation` süresi dosya başına artamaz ve (ratchet) azalış kayda indirilmedikçe düşer (bugün 12 dosyada 59, yeni bileşen ham süreyle düşer); `animateValue`, domain zaman aşımı ve işlevsel zamanlayıcılar kapsam dışıdır. Her kural kırmızı ihlal örneğiyle sınanır (8 düğüm testi: ham süre sayacı/ratchet, alfa kontrastı, kayıt kuralları, AST okuyucu ve gerçek dosya kopyasında kasıtlı bozma). `docs/gates.md` güncel.
- [x] UI-01.4 — **(Kabul edilmedi; ikon/imleç/çerçeve/doku UI-01.7–01.9'da yeniden yapılır, çıktı hiçbir kodda tüketilmiyordu.)** Çerçeve, ikon, doku ve imleç üreticisi: eski üretici dizini (eski üretici komutu, `--check`) saf üretimle (`buildUiAssets(tokens, seed)`) eski çıktı dizini altına 23 vektör dosya yazar (44,7 KB toplam, tek dosya ≤16 KB, raster/video/betik/dış bağ yok): dört ölçüde (16/24/32/48) 26 özgün çizgi ikon sprite'ı (24 ızgara, `currentColor`, optik çizgi kalınlığı 1,5/2/2,5/3 px), tema başına 9-dilimli panel/plate/well + başlık şeridi + ayraç (dilim 12/8, token renkli), tohumlu `grain` (160 leke) ile durağan `scanlines`/`dots` dokuları, tema başına ok/vurgulu ok imleçleri (etkin nokta ok ucunda; sistem metin imleci taklit edilmez). `manifest.json` dosya başına bayt/sha256, ikon adları, dilim, etkin nokta, piksel yoğunluğu (vektör, 1x tasarım) ve yedekleri (bulanıklık → `--vol-ui-scrim` düz scrim, hareket → varlıklar durağan) taşır; `SOURCES.md` özgün kökeni, üreticiyi ve tohumu kaydeder (mevcut glif varlık doktrini). Aynı tohum aynı baytları verir, farklı tohum yalnız `grain`'i değiştirir; token değişimi çerçeve/imlece yansır; eksik/geçersiz token ve eksik default tema açık hata verir; depo çıktısı üreticiyle bayt bayt aynıdır ve fazla dosya reddedilir (12 test). İkon tüketimi ve `VOL_ICONS` tipli yüzeyi UI-10.4'tedir (Icon bileşeni); imleç/çerçeve CSS bağlaması UI-03+ ile bileşen bileşen gelir.
- [x] UI-01.3 — Hareket politikası ve bütçe: `core/src/ui/motion/presets.ts` süreleri (120/200/320/480), eğrileri, sözleşmedeki dokuz adlı koreografiyi (scrim 120, diyalog 200, modal çıkış 140, kart kademesi 40, HUD artış/azalış 200/80, sekme 160 + 6 px, sahne 200/320), etkileşim ölçeklerini (1,02/0,96/1,04), loading 500 ms ve bütçe sınırlarını tek kaynakta tutar; `gen:theme` bunlardan `--vol-motion-*` değişkenlerini üretir (CSS ↔ TS parite ve sapma testli, geçersiz süre/eğri/ölçek ihlal örnekleri kırmızı). `MotionController` bütçeyi uygular: en çok 3 eşzamanlı geçiş grubu, toplam 64 dekor parçacığı (fazlası kısılır), 1 blur (ikincisi `null` → düz scrim); öncelik kritik/odak > kullanıcı eylemi > dekor (dekor dekoru kesemez, kritik her zaman hak alır); hak her koşulda temizlenir (bitiş, iptal, kesinti, `visibilitychange` gizlenme, `dispose`, animasyon olayı gelmese de süre + 100 ms emniyet) ve `onFinal` tam bir kez çağrılır, fırlatan geri çağrı kalan temizliği engellemez. Hareket azaltmada dekor süresi 0 ve temizlik SENKRON, anlamsal süre korunur, işlevsel (basılı tutma/şarj/oyun sayacı) süre HİÇ değişmez; sıfır sürede zamanlayıcı bırakılmaz. 30 olaylık salkım örneğinde tepe değerler 3 grup/64 parçacık/1 blur'u aşmaz ve tüm hakların hepsi bir kez temizlenir. Mevcut `animateValue`/`Easing` ve `--vol-transition-*` değişmedi (geçiş UI-03+ ile bileşen bileşen). Public yüzey: 1 sınıf, 6 sabit, 7 tür (registry/katalog 91/39/218). Ham süre lint'i UI-01.5'tedir.
- [x] UI-01.2 — Tema ve yoğunluk sahibi: `core/src/ui/themes/ThemeController.ts` tema (`default`/`ember`), yoğunluk (`compact`/`comfortable`/`spacious`) ve hedef tabanını (`data-vol-target='large'`) tek sahip olarak niteliklerle uygular; `attach(el)` yalnız o alt ağacı etkiler (kapsamlı önizleme), aynı eleman ref-sayımlı tek kayıttır (paylaşılan `UIRoot` parent'ı iki sağlayıcı kurmaz), son bırakışta önceki nitelikler geri yazılır, bilinmeyen/bozuk değer (kalıcı kayıt dahil) varsayılana döner, `restore()` arada yapılan kullanıcı seçimini ezmez, okuma/yazma hatası bildirilir ve arayüz geri alınmaz, `readColor` Canvas için hesaplanmış token'ı okur ve okunamazsa sabit renge düşmeden hata verir. Kalıcılık `device.volui:theme|density|large-targets` anahtarlarıdır. Değişim yalnız nitelik yazar: odak, kaydırma, seçim ve DOM ağacı birebir korunur (jsdom), ember bloğu geometriyi 12 sekmede iki motorda kaydırmaz, yoğunluk yalnız boşluk ölçeğini değiştirir (yazı boyu sabit, geri dönünce kutular birebir aynı), büyük hedef tabanı ince işaretçide de 44 px verir (E2E). `theme.css` artık `default` bloğunu da üretir (ember içindeki varsayılan önizleme token'ları geri alabilsin) ve her seçici `:root[...]` + yalın `[...]` taşır. Public yüzey: 1 sınıf, 4 yardımcı, 6 tür (registry/katalog/test sayıları 90/33/211 ile güncel). Maliyet (ölçülmüş, gzip): vitrin css 19,8 → 20,7/24, VOL.TEST css 18,2 → 19,1/21 KiB; app değişmedi. Vitrin üst bar seçicisi ve Canvas sabit renk taraması UI-07.4'tedir.
- [x] UI-01.1 — Tipli anlamsal token ve tema kaynağı: 60 genel `VOL_COLORS` tokenı aynen kaldı (public yüzey değişmedi); `core/src/ui/themes/semanticColors.ts` 39 anlamsal rol ekler (page/well/panel/plate + üst ışık/iç gölge, `frame*` ailesi, 5 emissive ışıma, dört nadirlik × solid/hover/selected/disabled/border/glow) ve `ember.ts` temanın 44 renk geçersiz kılmasını taşır; nadirlik temayla değişmez. `gen:theme` artık kaynak metni regex'le okumaz: Node tür soyma ile gerçek nesneleri yükler, `themeSource.mjs` doğrular (biçim, yinelenen anahtar, kebab çakışması, desteklenmeyen/boş tema) ve yalnız `@generated` işaretli iki bölgeyi yeniden yazar (font/boşluk/katman elle kalır); idempotent, `--check` sapmayı bildirir. `theme.css` varsayılan bölgesi ve ember bloğu kaynakla birebir test edilir (sapma testi), ihlal örnekleri (bilinmeyen token, kötü renk, çift ad, işaretsiz dosya) kırmızı kanıtlıdır. Hiçbir bileşen yeni tokenı tüketmez: varsayılan piksel temeli değişmedi (Chromium 12/12 sıfır tolerans). Ember kontrast tabanı 29 çift ölçümle geçer (metin ≥4,5, onBrand dolguları ≥4,5, ikon/odak/güçlü kenarlık ≥3). Ölçümle bulunan VARSAYILAN tema kusurları (UI-01.5/UI-03'te çözülür, renkler bu dilimde değiştirilmedi): `textMuted/surface3` 3,87, `onBrand/brandHover` 3,07 (<4,5); `borderStrong` 2,25 ve `borderSoft` 1,57 yüzeylere karşı (<3, tek ayırt edici ise).
- [x] UI-00.7 — Gönderilen boyut payı açıldı. Oyuna giden ses bank'ları `scripts/vite/audioBankRuntime.mjs` ile çalışma zamanı görünümüne indirgenir (anahtar, rol, etiket, süre, varlık yolu); hash, manifest, program/PCM özeti, ölçüm ve kalite kaydı yalnız kanonik dosyada kalır, `SoundFamilyBank`, `verifyFamily` ve üretici hattı değişmedi. Ölçülmüş kazanç (VOL.TEST app, gzip, dosya başına ayrı sıkıştırma): 108840 → 103266 bayt, −5574 B ≈ 5,4 KiB (hedef ≥4 KiB); ölçülen app 106,3 → 100,8 KiB. Bütçe 106,3'te bırakıldı: ≈5,5 KiB pay UI-02/UI-03 tüketicisi için ayrıldı (`quality.json` gerekçesi güncel). Sözleşme iki testle korunur: görünüm yalnız çalışma zamanının okuduğu alanları taşır ve provenance sızdırmaz (düğüm testi, her kanonik bank için), `parse(kanonik)` ile `parse(görünüm)` aynı aileyi, filtreyi ve 96 jetonluk deterministik seçimi verir (vitest). Vitrin için iş başına boyut notu UI-02'de vitrin ses bank'ları geldiğinde tutulur; bugün vitrin bank göndermez.
- [x] UI-00.4 — Ölçüm kör noktaları kapandı. Dokunma hedefi ölçümü (`devtools/vol-showcase/tests/e2e/support/geometry.ts`) saydam ama tıklanabilir yerel girişi (kaydırıcı) dışlamaz, gerçek vuruş noktasını `elementFromPoint` ile sınar, `overflow` atasının kırpmasını ve örtüşmeyi ölçer; çizilmediği için ölçülemeyen örnekler ayrı sayılır ve açık altı katman ayrıca ölçülür. Düzeneğin kendisi saydam/örtülü/kırpılan/hayalet hedef fixture'ıyla sınanır. İlk gerçek ölçümde iki motorda aynı 10 kusur çıktı (telefonda sekme şeridi içeriğe 173 px bırakır; kart/BuildMenu/Slider/OSK/EventLog/SplitPane) ve `geometryExceptions.json`'a sahip görevle bağlandı; bayat kayıt testi düşürür. Okunabilirlik: CSS 12 px alt sınırı ile çizilmiş glif yüksekliği ayrı kapıdır; büyük harf mürekkep yüksekliği (tarayıcı kestirimi, Deck ölçümü değildir) Jura 12 px normal/yarı kalın ağırlıkta 9 ekran px altında (UI-07.3). Rapor şeması (`devtools/vol-showcase/tests/e2e/support/perfReport.ts`, `performance.spec.ts`, `latency.spec.ts`): kapsamlar ayrı durumlu (ölçüldü/desteklenmiyor/çalışmadı), `basis` ekrana sunulan kare değilse PASS yok, A/A gürültü ve zamanlayıcı çözünürlüğü 0.05F eşiğini aşarsa yetersiz, NaN 0 sayılmaz. Başsız ölçüm: işaretçi/klavye p95 Chromium ≈31/44 ms, WebKit ≈96/73 ms (olay→sonraki kare yaklaşımı, kabul değil); GPU/sunum/atıflı iz desteklenmiyor; WebKit zamanlayıcı çözünürlüğü 1 ms, Hz bilinen hızlara uymuyor. Tema geometri kayma sondası A/A ve kasıtlı kayma kontrolleriyle hazır; renk tokenı değişimi iki motorda 12 sekmede geometriyi kaydırmaz.
- [x] UI-00.3 — axe (`@axe-core/playwright`, yalnız vitrin devDependency) 5 WCAG etiketiyle 12 sekmede ve 6 açık katmanda (Modal, Sheet, Popup, Popover, Select, OSK) iki motorda koşar; sonuç `axeExceptions.json` ile birebir eşleşmek zorundadır (yeni ve bayat bulgu düşer), her kayıt açık UI görevine bağlı: 50 ihlal ve 39 incomplete. Düzenek bilerek adsız bırakılan girişi ve örtülen odağı yakalar (negatif testler). Durum fixture'ları (`stateFixtures.json`, registry'ye bağlı) 6 katmanda odak ve Escape/odak geri dönüşünü sınar; bilinen kusurlar motor bazında `test.fail` ile izlenir (Modal/Sheet Chromium odak geri yüklemesi UI-09.1, OSK UI-11.1). `ui-check` tarifi eklendi.
- [x] UI-06.1 — Eski vol-ui paketi tek atomik göçle `devtools/vol-showcase` / `@volstudio/vol-showcase` oldu; lifecycle, quality (paket ve bütçe), kilit importer'ı, `justfile`, katalog yolu, testler ve belgeler birlikte taşındı. Eski yol ve paket başvurusu sıfır; CSS `.vol-ui-root` ve `--vol-ui-*` tokenları değişmedi; 24 piksel temeli yalnız taşındı; bütçe 150/1/24 aynı.
