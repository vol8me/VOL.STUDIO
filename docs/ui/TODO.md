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

| Dalga | Kapsam                                                                                                                | Çıkış (hepsi gerçek, görülür/duyulur kanıt)                                                                                |
| ----- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 1     | Kimlik: UI-01.6–01.9, UI-02.6–02.8 (paralel hatlar); UI-07.2–07.3; UI-06.2–06.4 (Windows native)                      | İki skin yan yana; gerçek ikon/imleç; yeni ses seti uygulamada duyulur; native Windows vitrin açılır.                      |
| 2     | UI-01.10 + UI-02.9 → **UI-03 dikey dilim (Button)** → UI-04/05/08/09/10 aileleri; UI-07.4; UI-11.1–11.2; UI-12.2–12.3 | Bir bileşen ailesi malzeme+ikon+imleç+ses+juice ile uçtan uca; kullanıcı görsel ve ses kabulü; aileler aynı dille yayılır. |
| 3     | UI-11.3–11.4, UI-12.1, UI-12.4, UI-13                                                                                 | Cihaz/insan kabulleri PASS/FAIL/NOT-RUN ayrı raporda; `signoff`; F07 kapanışı.                                             |

Sert ön koşullar: UI-01.7 → UI-03; UI-02.8 → UI-03; UI-03.4 → UI-04/05/08/09/10; UI-05.1 → UI-09, UI-11.1;
UI-07.1 (tamam) → UI-08; UI-06.2 → UI-11.3/12.4. Aynı dosyaya dokunan görevler seri, farklı
dizinlere dokunanlar paraleldir. Kritik yol: UI-01.7 + UI-01.8 + UI-02.8 → UI-03.4 → en uzun
aile (UI-05 + UI-09) → UI-13.

**F07 kapanış tanımı:** bütün görevler kapanmış (kod/kapı ve bağlı cihazlarda ölçülebilen kabul), kullanıcı
görsel/ses kabulü kayıtlı, cihazdan bağımsız kalan her NOT-RUN gerekçeli ve kök F08/F09'a devredilmiş,
`pnpm signoff` geçmiş olmalıdır.

### Yapılamayan/NOT-RUN kalacak kabuller

Kod fazını bloklamaz, sürümü bloklar ve PASS sayılmaz: Steam Deck host/SLR4 açılış, kol-only,
glif yüksekliği ve ısınmış performans (UI-06.4, UI-12.2–12.3, UI-13.3; F08), Samsung/Android 16
hücreleri (UI-11.4, UI-13.3), gerçek Steam runtime metin sağlayıcısı (UI-12.1; F04.4/F08.6), gerçek
Safari/iOS Ogg çözümü, Playwright WebKit'in AudioContext sınırı, insan erişilebilirlik/haptik
değerlendirmesi (UI-13.4). Bağlı cihazda **yapılabilen** her ölçüm yapılır.

## Açık

### UI-00 — Kabul altyapısı

Tamamlandı (Kapatılanlar). Registry, iki motorlu E2E, axe, geometri, kare ölçümü ve native ölçüm
yolları hazırdır; yeni iş bunları kullanır, çoğaltmaz.

### UI-01 — Görsel kimlik ve malzeme dili

Sahip CORE UI. Tema/yoğunluk/hareket sahipleri (UI-01.1–01.3, 01.5) hazırdır; bu faz o zeminin
üstünde ürün kimliğini kurar.

- [ ] **UI-01.7 — Malzeme ve çerçeve dili (kalan).** Yapıldı: `core/src/ui/material/material.css`
      tek ışık yönü (üstten), skin parametreleri (`--vol-mat-*`: parıltı, grain, kenar,
      kaldırma/bastırma), basılabilir yüzey (Button/IconButton: iç gölgeyle üst bant ışığı ve alt
      kenar, sert dış gölge, düz arka plan renkli: kontrast araçla ölçülebilir), girinti/panel/basılı
      yüzey sınıfları, çerçeve (köşe aksanları, başlık şeridi, ayraç), HUD barı (segment
      çentikleri, parlak üst bant, kenar ışığı); vitrinde KİMLİK sekmesinde "Malzeme" bölümü.
      **Çerçeve dili v2 (2026-10-08):** panel, kart, modal, sheet, popup, açıklamalı ipucu,
      komut paleti, diyalog kutusu, toast ve kart seçici aynı "plaka çerçevesi" dilini konuşur:
      düz panel rengi + üst ışık + alt kenar + 4 px içeride ikinci hat (`--vol-mat-keyline`; aurum'da
      altın) + sert dış gölge; başlıklar çerçeve şeridi (marka elması + display büyük harf);
      sekmeler plaka (seçili: üst ışık + marka çubuğu, dikeyde sol çubuk); kaydırıcı ve aralık
      kaydırıcı kuyu çubuk + kesikli dolgu + çelik tutamaç; ağaç/günlük/zaman çubuğu/sayı girişi/
      radyo kuyu; tablo başlığı çerçeve şeridi + zebra; beceri ağacı düğümleri plaka (kilitli kuyu,
      açılabilir halka, açılmış dolu). Katman kuralları `core/src/ui/material/overlays.css`te; yığın sırası
      (kök 10 < float 15 diyalog kutusu < toast 20 < dialog 30 < içerik 40 < yükleme 50) belgelenir.
      Vitrin kabuğu yeniden kuruldu: marka bloğu, çekirdeğin gerçek `Button`/`IconButton` bileşenleri
      (skin, dil, tam ekran), sekme ikonları, sayfa başlığı şeridi (ad + açıklama), vitrinin kendi
      demo yüzeyleri plaka/kuyu; 720 px altında üst şerit + yatay kayan sekme şeridi (kenar çubuğu
      telefonda içeriğe 173 px bırakıyordu; `tab/panels`, `tab/workbench`, Accordion, EventLog
      kırpma kayıtları bu yüzden silindi). İkon: "kapat" çarpısı inceltilmiş yuvarlak uçlu özgün
      çizim (Phosphor `x` düğme içinde kaba duruyordu), sessiz ikon düğmesi (`vol-sheet__close`,
      `vol-icon-button--quiet`).
      Kalan: bar hasar gecikme şeridi ölçümü, bulanık gölge ve gölge katmanı bütçesinin ölçümü, metin
      backplate'li karmaşık yüzeyler, axe'in hesaplayamadığı bar etiketi ve malzeme örneği
      kontrastlarının son renk ölçümü (kayıtlı: `axeExceptions.json`, sahip UI-01.7).
- [ ] **UI-01.10 — Juice ve hareket ilkelleri (kalan).** Yapıldı: `MOTION_JUICE` adlı ilkeller
      (basma squash'ı, kaldırma, odak nabzı, sayı patlaması, vuruş flaşı, panel girişi, sınırlı
      sarsıntı, hasar şeridi gecikmesi; `--vol-motion-juice-*`), düğmelerde kaldırma/bastırma/odak
      nabzı, `playJuice` (pop/flash/shake/enter; hareket azaltılmışta ölçek ve sarsıntı yok, flaş
      kalır); Bar hasar gecikme şeridi (düşüşte eski seviye kısa süre kalır, sonra erir) ve vuruş
      flaşı (`health`/`stamina` varsayılan, `trail` seçeneği); düğme hata durumu sarsıntısı.
      Kalan: Counter sayı patlaması/değer tween'i (overshoot), panel giriş stagger'ı, eşzamanlı
      grup bütçesi, WCAG flaş sınırının ölçümü ve CPU/GPU maliyeti.

Faz testi: tema/malzeme/ikon/imleç modül adlı testleri, colorSync/cssConstantSync/publicSurface,
iki motor E2E (geometri, axe, kare ölçümü), piksel temeli (win32).

### UI-02 — Ses kimliği ve geri bildirim

Sahip CORE geri bildirim + audio-synth üreticisi + uygulama adaptörü. Niyet katmanı, ses kiti,
titreşim sağlayıcısı, kısma ve laboratuvar mekanizması hazırdır (Kapatılanlar); **ses setinin
kendisi sıfırdan yeniden yapılır.**

- [ ] **UI-02.8 — Uygulama genelinde bağlama (kalan).** Yapıldı: kit yeni sözlükle (23 olay; 2026-10-08'de ekran klavyesi için `keyTap`/`keyDelete` ile 25,
      iki palet), `toggleOn/Off`, kaydırıcıda değere bağlı perde, hover/focus gözlemcisi,
      `setAssets`/`followTheme`, vitrin kökünde uygulama geneli bağlama; vitrin üst çubuğundaki skin
      düğmesi ses paletini (çelik ↔ aurum) ve imleç vurgusunu değiştirir; VOL.TEST HUD kökünde kit
      (oyunun ses bağlamı ve ana otobüsü üstünde; oyun SFX'i değişmedi) ve duraklatma/sürdürme paneli
      kitin `panelOpen`/`panelClose` sesiyle çalar, eski duraklatma sesi yalnız kit yokken yedektir
      (çift çalmaz). Paket payı ölçüldü: VOL.TEST app +5,8 KiB (bütçe 107,0).
      **Olay→bileşen kapsamı (2026-10-08):** önceden `open`/`close`/`confirm`/`cancel` niyetlerini
      hiçbir bileşen yaymıyordu (`panelOpen`/`panelClose`/`back`/`confirm` vitrinde hiç duyulmuyordu,
      `tabSwitch`/`dragPick`/`dragDrop`/`notify`/`alert` için niyet bile yoktu). Eklendi: niyet türleri
      `navigate`→`tabSwitch`, `pick`→`dragPick`, `drop`→`dragDrop`, `notify`→`notify`, `alert`→`alert`
      (+ `type`/`erase`/`reject`); `Tabs` (tıklama, ok tuşları, LB/RB), `Modal`/`Sheet`/`Confirm`
      (tetikleyiciden açılış ve kapanış; söküm ve tetikleyicisiz oyun açışı sessiz), `Accordion`,
      `DialogueBox` (satır ilerletme `select`, seçim `confirm`), `SlotGrid` (kaldırma/bırakma/geri
      çevirme), `ToastManager` (varyanta göre `notify`/`alert`) ve ekran klavyesi niyet yayar. **Yedek
      katman:** kök, bileşenin kendisi niyet yaymadıysa (`claim` ile yinelenmez) her düğme/sekme/menü/
      seçenek tıklamasını `press`/`navigate`/`select` olarak duyurur; `data-vol-silent` ile susturulur.
      Oynanış denetimleri (Hold/LongPress/Charge/DirectionButton) bilinçli sessizdir: ateş/şarj/yön sesi
      oyunun SFX'idir. Host olayları vitrinde bağlandı: seviye atlama (`levelUp`), satın alma
      (`purchase`). Kanıt: `soundCoverage.test.ts` (25 olayın sahibi tablosu + 9 bileşen davranışı).
      Kalan: stepper/slider detent (adım başına tık) ve kaydırıcı sürüklemesinde kısık ses ayarı;
      `equip`/`reward` host bağlaması ve `release` (basılı tutmada bırakış), SlotGrid sürükleme niyeti
      için gerçek işaretçi testi; ContextMenu/CommandPalette/Popup açılış sesi (tetikleyicisiz tuş
      kısayolu açılışı için sahipsiz-niyet kararı); seviyeler,
      sessiz ve palet seçiminin mevcut kalıcılığa bağlanması (VOL.TEST ayar paneli). Kapanır:
      vitrinde her etkileşim duyulur (olay→bileşen tablosu testli); ses yokken/kapalıyken işlev ve
      görsel durum aynı; oyun SFX/ambiyans değişmez.
- [ ] **UI-02.9 — Laboratuvar ve kulak notları.** Ses laboratuvarı yeni sözlüğe göre
      güncellenir: her olay, palet, kuru/kit, eski/yeni A/B, dinleme paketi dışa aktarımı.
      Kullanıcının dinleme notları tarihli olarak VERIFICATION'a işlenir; reddedilen ses
      yeniden tasarlanır. Kapanır: kullanıcı dinleme kararı kayıtlı (kabul ya da yeniden
      yapım); `pnpm signoff` UI-02 yayını için koşar. Ek: Kenney Interface Sounds/UI Audio
      (CC0, yalnız yerel ölçüm referansı) ile bant ve yükseklik karşılaştırma tablosu
      VERIFICATION'a eklenir.

Faz testi: CORE/audio testleri, audio production-check, asset verify, public yüzey kilidi, `signoff`.

### UI-03 — Button dikey dilimi / M1

Ön koşul UI-01.7, UI-01.8, UI-02.8 ve UI-00.6 probu; sahip primitives/buttons. Kimliğin ilk uçtan
uca örneğidir: malzeme + ikon + imleç + ses + juice bir arada. Diğer ailelere kör CSS yayılımı yok.

- [ ] **UI-03.1 — Button/IconButton/ToolButton (kalan).** Yapıldı: yeni malzeme ve juice (kaldırma,
      bastırma, odak nabzı), varyant×boyut×durum (normal/hover/basılı/odak/devre dışı/yükleme/hata);
      hata durumu (handler hata fırlatınca danger kenarı, sarsıntı, `data-state="error"`, düğme
      yeniden kullanılabilir, sonraki tıklamada temizlenir); yükleme sırasında etiket erişilebilirlik
      ağacında kalır (axe `button-name` kaydı kapandı). Yapıldı (2026-10-08): async bitişinde
      dışarıdan verilmiş `disabled` korunur (handler sürerken kapatılan düğme bitişte açılmaz;
      sürerken açılan, bitene kadar kapalı kalır; Button ve IconButton), Toolbar gezici tabindex uç
      durumları testli (tümü devre dışı → durak yok, biri açılınca durak o; dikey çoklu seçimde
      yalnız etkin düğmeler dolaşılır, yatay ok dikeyde gezinmez; odaklı düğme kapanınca durak
      komşuya geçer) — `buttonDisabledContract.test.ts`; yerel button Enter ve Space tek niyet
      kanıtı `ses.spec.ts`te iki motorda var. Kalan: sesin açık/kapalı eşdeğer işlevi (UI-02.8 ile).
- [ ] **UI-03.2 — Hold/Charge/LongPress (kalan).** Yapıldı: aynı yüzey malzemesi (kabartma, gömülü
      basılı durum, devre dışı); iptal sözleşmesi kanıtlı (`holdButtons.test.ts`): pointercancel,
      yakalama kaybı, sayfa gizlenmesi, devre dışı ve söküm basışı bırakır, iptal ASLA eylem sayılmaz
      (düzeltilen kusur: uzun bas düğmesinde pointercancel dokunma sayılıyordu; şarj düğmesinde
      pointercancel şarjlı bırakış üretiyordu → `onCancel`), ikinci işaretçi yok sayılır (ikinci
      zamanlayıcı sızıntısı kapandı), söküm belge dinleyicisini kaldırır. Yapıldı (2026-10-08): **klavye ve
      kol eşdeğeri** — ChargeButton ve LongPressButton'da klavye hiç yoktu (yalnız işaretçi), HoldButton'da
      Space/Enter vardı ama kol A `click` gönderdiği için (bilinçli yutulur) kolla basılı tutmak
      imkânsızdı. Ortak `holdInput.ts`: Space/Enter ve kol A aynı basış/bırakış çifti, native `click`
      yutulur, odak kaybı iptal eder; `FocusNavController` A'yı basılı-tutma denetimine (`data-vol-hold`)
      `vol:focuspress`/`vol:focusrelease` olarak iletir (A bırakılınca, kol çıkınca, gezinme kapanınca,
      söküm anında bırakılır; sıradan düğme `click` yolunda kalır); basılı durum `aria-pressed`. Kanıt:
      `holdInput.test.ts` (7), `holdInput.spec.ts` (iki motor: Space/Enter dolum ve bırakış, **azaltılmış
      hareket altında aynı işlev**, sanal kolda A basılı tutma). Karar: şarj/ateş/yön sesi oyunun SFX'idir
      (denetimler bilinçli sessiz). Kalan: şarj yüzdesinin ekran okuyucuya duyurulması (çekirdekte yalnız
      `onChargeProgress` geri çağrısı var; metin ve canlı bölge host'tadır) ve gerçek AT ile doğrulama
      (UI-13.4).
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

- [ ] **UI-04.1 — Kart yüzeyi ve CardTile.** Rarity bağımsız nötr kart mevcut Panel/Text/Button
      bileşimi ve ortak card skin'iyle; CardTile aynı yüzeye rarity katmanı ekler (rare/epic/
      legendary, SlotGrid common/rare/epic ayrı kalır). `disabled` primary-action anlamını
      korur; ikincil eylem ve drag kendi durumlarında sınanır. Rarity için renk dışında işaret
      (çerçeve/ikon). Kapanır: nadirlik×4 durum, kilitli/kompakt/salt sunum/birincil/ikincil/
      sürükleme matrisi; uzun başlık/açıklama/6 haneli fiyat eylemi gizlemez; kart seçme/
      çevirme sesleri ve juice'u.
- [ ] **UI-04.2 — Picker ailesi.** CardPicker/LevelUpPicker/ShopPicker: 40 ms kademeli giriş,
      1.04 seçili ölçek, reroll/lock/insufficient/empty/error/loading; ürün kuralı opt-in
      tarifte. Kapanır: son seçimin tek niyeti; modal/geri/odak geri yükleme; hızlı yeniden
      giriş/kaynak temizliği; hover, kol, dokunma eşdeğer; ödül/satın alma sesleri.
- [ ] **UI-04.3 — SwipeableCardStack ve drag alternatifleri.** Eşik/alt düğme niyeti, iptal/
      capture kaybı, yön/RTL; klavye/kol/dokunma önce-sonra-seç. Kapanır: sürükleme tek yol
      değil; yerleşim kayması yok; azaltılmış harekette son seçim aynı; ARIA seçimi odaktan ayrı.
- [ ] **UI-04.4 — Kart kabulü.** Üç nadirlik × iki skin; açık/boş/disabled/ayrılma durumları iki
      motorda; %30/%200/6 hane. Kapanır: kullanıcı görsel kabulü; referans ve özgün fark incelenir.

### UI-05 — Panel, form ve ayarlar

Ön koşul UI-03.4. Sahip primitives/layout/overlays; yeni ayar paneli icat edilmez.

- [ ] **UI-05.1 — Adlandırılmış editör ve değer niyeti.** Input/TextArea/NumberStepper/Slider/
      RangeSlider etiket→denetim bağı, açıklama/hata kimliği, min/max/clamp/disabled/readOnly,
      klavye. Slider/stepper yeni malzeme ve değer perdesi sesiyle. Kapanır: canlı önizleme/
      tek kalıcı değişiklik/iptalde geri alma/sessiz programatik ayar; dikey range geometrisi/
      AT, saydam hit-test; IME bileşiminde Enter göndermez.
- [ ] **UI-05.2 — Seçim denetimleri.** Select açıkken devre dışı bırakma kapatır ve odağı geri
      yükler; aynı değer seçimi tekrar kalıcı değişiklik üretmez; Checkbox/switch kararı;
      RadioGroup/SegmentedControl; ColorPicker/CurveEditor klavye/tap karşılığı. Kapanır:
      popup/layer geri önceliği; boş/hata/devre dışı/i18n; iptal edilen sürükleme sessiz.
      Yapıldı (2026-10-08): Select aynı değeri yeniden seçince değişiklik üretmez, açıkken
      devre dışı bırakılınca listeyi kapatır, harf yazınca eşleşen etikete gider
      (`core/tests/ui/primitives/selectContract.test.ts`); SegmentedControl/RadioGroup zaten aynı
      değeri yutuyordu. ColorPicker/CurveEditor klavye karşılığı, popup geri önceliği açık.
- [ ] **UI-05.3 — Panel/yerleşim.** Panel/Tabs/Accordion/Tree/Wizard/Carousel, UIRoot; yeni
      çerçeve dili; gezici odak/seçim ayrı; gizli içerik etkileşimsiz. Kapanır: çift kök kaynak
      temizliği, sekme değişiminde temizlik, 320 px/ultra geniş/%200/RTL; uzun panelde odak
      sheet/modal altında kalmaz. Yapıldı (2026-10-08): Carousel pasif slaytları `inert`+`aria-hidden`
      yapar (gizli slaytın düğmesine Tab ulaşmaz), noktalar gezici odaklı sekme olur (ok/Home/End,
      sekme↔slayt `aria-controls`/`aria-labelledby`), slayt içi denetime basmak sürükleme yakalamasını
      başlatmaz, otomatik geçiş odakla da durur ve azaltılmış harekette başlamaz, aynı sayfaya geçiş
      `onSlideChange` üretmez (`core/tests/ui/layout/carouselKeyboard.test.ts`). Tabs/Tree zaten APG
      klavyesindedir; Wizard/Accordion/UIRoot ve genişlik/RTL kanıtı açık.
- [ ] **UI-05.4 — SettingsForm/SettingsRow.** Bölüm/satır/açıklama/reset/uygula/geri al/hata/
      meşgul deseni model ve tarif olarak ayrılır; ses/müzik ayarı satırları ses sistemine bağlı.
      Kapanır: Escape/geri sırasında kaydedilmemiş değişim kararı tüketicide; kaydediliyor
      sırasında tekrar commit yok; device/synced kapsamlı atomik kalıcılık.
      Yapıldı (2026-10-08): `SettingsRow` görünür etiketi/açıklamayı denetime bağlar
      (`aria-labelledby`/`aria-describedby`; düğmede değer adın parçası kalır, kendi adı olana
      dokunmaz), `setError` satırda `role=alert` hata + `aria-invalid` verir, `SettingsForm.runExclusive`
      kaydederken `aria-busy` yapar ve ikinci commit'i başlatmaz. Reset/uygula/geri al modeli ve
      sese bağlı satırlar açık.
- [ ] **UI-05.5 — Form kabulü.** Her kontrol yalnız kol, yalnız klavye, dokunma, %30, 6 hane.
      Kapanır: bileşik denetimin yön tuşu FocusNav tarafından alınmaz; durum matrisi + axe;
      modal örtüşme; kullanıcı görsel kabulü.

### UI-06 — Tek VOL.SHOWCASE ve Windows native temel / M4

UI-06.1 tamamlandı. UI-06.2–06.4 UI-05'i beklemez. Oyun kaynaklarına bağımlılık kurulmaz.

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
- [ ] **UI-06.3 — Platform ayarı ve görünür kabuk.** Mevcut oturum/DisplayModeController/
      scopedStores/haptik adaptörleri; gamescope etkisiz seçenekler capability'den; web yedeği.
      Kapanır: native kaynak taşıyan plugin yalnız gereken uygulamada; `pnpm dev` web bakışı;
      başlatma/kaynak temizliği/dil değişimi sızıntı üretmez.
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
      sayfa kurulmadan önce. **Açık bulgu:** gamescope kuralındaki DMA-BUF açık yolunda HOST derlemesinde 2D
      canvas boş (Curve Editor), kapalıyken çiziliyor; SLR4 derlemesinde yeniden ölçülecek (UI-12 / F08).
      Kol: OS düzeyi sanal Xbox kolu (`devtools/deck/scripts/virtual-pad.py`) Steam Input üzerinden D-pad/RB/A ve OSK yazımını sürdü (fiziksel düğme değil). Kalan: SLR4 (steamrt4) derlemesi, fiziksel kol/arka tuş ve glif, OGG/UI sesi çıkışı, ısınmış
      performans/MangoHud, Windows kare sondası → NOT-RUN, sahip UI-12.4/F08.

Faz testi: quality/appIdentity/productIcons/catalog/layers/ports/cargo/plugin fixtures, contract/rust/build/bundle, iki motor E2E, gerçek native sonda.

### UI-07 — i18n, font ve tema yayılımı / M5 + M6

UI-07.1 tamamlandı (AST çeviri kapısı). Mevcut i18n motoru yeniden yazılmaz.

- [ ] **UI-07.2 — Çoğul/biçim/RTL ve uzunluk.** i18next JSON `count` + Intl; tablo/sayı hizası;
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
      silindi. Kalan: `ı/İ` ve 0/1/çok çoğul biçim testleri, tarih/birim biçimi, gerçek çeviriyle uzunluk,
      %200 yakınlaştırma ölçümü, RTL'de ok/picker/swipe yönü.
- [ ] **UI-07.3 — Font varlığı.** Mevcut font hattı ve subset manifesti; lisans/kaynak, gerçek
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
      (OFL) pakette. Kalan: değişken TTF'lerin boyutu/subset kararı, yedek font tabanı/satır yüksekliği ölçümü,
      font yükleme hatası örneği, asenkron font yerleşimi kaydırmaz kanıtı, Deck glif yüksekliği ve Android %200
      ölçek.
- [ ] **UI-07.4 — Tema laboratuvarı ve üst bar (kalan).** Yapıldı: vitrin üst çubuğunda skin
      düğmesi (`ThemeController`, kök `data-vol-theme`, seçim `localStorage`'da kalır, bilinmeyen
      kayıt varsayılana döner; `skin.spec.ts` iki motorda), skin ses paletini ve imleç aksanını
      değiştirir; üst çubuk çekirdek bileşenleriyle yeniden kuruldu (UI-01.7 notuna bakın). Kalan: Tema sekmesi ve genel tema/dil/yoğunluk seçici; önizleme kapsamları/body
      portalları/canvas sabit renkleri (CurveEditor/Minimap). Kapanır: 2 skin × 3 yoğunlukta
      kontrast/odak; Chromium CLS ve tüm motor geometrisi; geçiş anlık, durum/kaydırma/odak/seçim
      sabit.

### UI-08 — HUD ve erken tier-1 kapsam kontrolü

Ön koşul UI-03.4, UI-07.1. Sahip feedback/hud/tarif; oyun durumunu sunum tutmaz. Bullet hell ve
RTS HUD'ı: bakış sürekliliği, yüksek kontrast, büyük/okunur sayı.

- [ ] **UI-08.1 — Bar/XPBar/Counter/ResourceCounter/ResourceBar/TimerBar/RoundCounter/
      FloatingTextManager.** Yeni bar malzemesi (segment, parlak bant, hasar gecikmesi), sayı
      tween/pop, boş/dolu/geçersiz eşik/çoklu kazanım/6 haneli düşüş/meşgul/hata, role/valuetext,
      opt-in applyXPGain. Kapanır: reduced-motion sayı/son durum tam; havuzlama/kaynak
      temizliği; TimerBar işlevsel zamanı hareket tokenı sayılmaz; ekran okuyucuya aşırı duyuru yok;
      ödül/hasar sesleri.
- [ ] **UI-08.2 — FpsMeter/MinimapPanel/SelectionInfoPanel/StatsPanel.** VOL.TEST gerçek örnek;
      boyut/zoom/skin; işaretçi kontrastı, renk dışı işaret, ikon. Kapanır: HUD işaretçi/girdi
      katmanı örtüşmesi doğru; mini harita görünümü tüketici modeli; oyun fiziği/performans bu
      göreve karıştırılmaz.
- [ ] **UI-08.3 — ActionBar/BuildMenu/SkillTree/SlotGrid.** Gerçek oyun ikonları (UI-01.8),
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
      (hover yok; uzun basma kararı UI-10), bildirim sesleri kulakla (UI-02.9), AT ile gerçek duyuru
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
- [ ] **UI-09.4 — Diyalog deseni/yönlendirici işaret/yasal metin.** Mevcut Modal/Panel/Button/
      Text bileşimi ile yıkıcı işlem/çıkış/izin/yerel-uzak çakışma/ilk kullanım yönlendirmesi/
      kredi ve yasal metin (ikon atıf ekranı dahil). Kapanır: çakışmada niyet/hata/bekleme/
      yeniden deneme/iptal açık; gerçek Steam AutoCloud diye sunulmaz.

### UI-10 — Dokunma, yükleme, kaydırma ve çalışma alanı

Ön koşul UI-03.4; UI-10.1 ayrıca UI-03.2. Sahip touch/camera/layout/text.

- [ ] **UI-10.1 — DirectionButton/DPad/Joystick/SquareJoystick/SwipeGestureZone/MultiTouchZone/
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
- [ ] **UI-10.2 — DualAxisScrollPanel/ScrollView/VirtualList/KeyedVirtualList/SplitPane.**
      Etkileşimli alt öğe istisnası, sürükleme eşiği, birincil işaretçi, sanal öğeler, resize.
      Kapanır: pointerdown anında alt düğme niyeti alınmaz; iptal edilen sürükleme tıklama üretmez;
      %200 dış panel kaydırması; 24/44 kaydırma tutamağı.
      Yapıldı (2026-10-08): `DualAxisScrollPanel` ve `PullToRefresh` işaretçiyi artık basış anında değil
      `UI_THRESHOLD.DRAG_START_PX` eşiği aşılınca yakalar (önceden içerikteki düğmenin tıklaması
      viewport'a çalınıyordu), yalnız birincil işaretçi/ana düğme başlatır, gerçek sürüklemeyi bitiren
      bırakma altındaki öğeye tıklama üretmez, iptal (`pointercancel`) tıklama yutmaz; Carousel slayt
      içi denetime basınca sürükleme başlatmaz; SkillTree zaten düğümü hariç tutar. Testler:
      `touchControls.test.ts`. SplitPane/ScrollView/VirtualList kanıtı, %200 ve tutamak boyutu açık.
- [ ] **UI-10.3 — PauseResumeButton sunum/tarif ayrımı.** Constructor ve callback bildiren
      `setRunning` korunur; yeni additive sessiz senkron ve ayrı kullanıcı niyet yolu; opt-in sayaç
      tarifi. Kapanır: legacy setter/callback, sessiz sync, user toggle, counter completion,
      freeze, pointercancel, destroy ayrı regresyon; public sınıf silinmez.
      Yapıldı (2026-10-08): `syncRunning` (sessiz, `onToggle`/niyet yok), kullanıcı tıklaması `toggle`
      niyeti yayar (programatik değişim yaymaz), `pointercancel` basılı görünümü temizler; `setRunning`
      ve constructor/callback sözleşmesi aynen (`touchControls.test.ts`). Sayaç tamamlanma yolu ve
      destroy önceki testlerle kapsanır; tarif ayrımı (opt-in sayaç tarifi) açık.
- [ ] **UI-10.4 — LoadingScreen/Text/AnimatedLabel/Icon/Toolbar/PropertyField/CanvasViewportController/
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
- [ ] **UI-10.5 — Palette ve ileri katalog kanıtı.** Her aile durum örneği, public yardımcılar,
      grid ARIA gerekçesi. Kapanır: registry başlangıç sınıfları + yeni exportlar tam; palet
      okunabilirliği; tier-2 erişilebilir.

### UI-11 — Metin oturumu ve Android / M7 alt faz

Ön koşul: UI-11.1–11.2 için UI-05.1; UI-11.3–11.4 için UI-06.2 ve Android cihazı. F04.2 tekrarlanmaz (D9).

- [ ] **UI-11.1 — Sahip/oturum/IME bileşimi.** `core/src/ui/textEntry/textEntry.ts` sağlayıcı/kip
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
      Kalan: Unicode grafem kümesi (şimdi kod noktası), IME bileşimi, readOnly/disabled tuşları,
      gerçek cihaz kanıtı (Deck kolu, Android) — NOT-RUN. Kapanır: eski async sonuç yeni/yok edilmiş alana yazamaz ve odak veremez;
      sağlayıcı değişiminde eski temizlik yeni sahibi silmez; tek bekleyen istek/zaman aşımı/geri/
      Escape; IME'de Enter göndermez; OSK diyalog adı/odak sınırı ve ekran görüntüsü.
- [ ] **UI-11.2 — Native menü ve pano.** `core/src/ui/nativeMenus.ts` + `tauri-v2/src-tauri/src/native_menus.js`
      düzenlenebilir alan istisnası; ClipboardAdapter (web/native). Kapanır: yapıştırmayı kullanıcı
      başlatır; salt okunurda Kopyala/Tümünü Seç var, Kes/Yapıştır yok; parolada Kopyala/Kes kapalı;
      izin reddi/yetenek yokluğu akışı bozmaz; pano içeriği günlüğü yok.
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

- [ ] **UI-12.1 — Steam metin sağlayıcısı.** `tauri-v2/src/platform/steamworks.ts` ve plugin
      `service.rs`: parola isteği→Password modu, yüzen tek/çok satırlı giriş, sahibin iptali.
      Kapanır: diyalog sonucu ile yüzen klavye tuş olayı ayrı testli; gerçek Steam runtime sondası
      (AppID 480/başarılı IPC ürün kabulü değildir); OSK yedeği korunur.
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
- [ ] **UI-13.4 — İnsan erişim/görsel/haptik/ses.** Yalnız klavye/kol gerçek akış, seçilen AT +
      TalkBack + NVDA/Narrator, TR/EN/%200/gri ton, glif yüksekliği, haptik; kullanıcının
      görsel/ses/imleç kabulü. Kapanır: gerçek beyan ve profil kaydı; eksik profil açık kabul.
- [ ] **UI-13.5 — Sürüm adayı teslimi.** `pnpm signoff`, public yüzey/paket boyutu/ölçekleme;
      piksel temelleri incelenmiş; belgeler güncel. Kapanır: high/signoff ve gerçek kabul ayrı
      PASS/FAIL/NOT-RUN raporu; kalan her iş kök/paket TODO'da gerçek ölçütle açık; **F07 kapanır.**

## Kapatılanlar

Planın hazırlanmış olması bir üretim görevini kapatmaz; yalnız kapıdan geçmiş ve vitrinde/oyunda görünür iş buraya taşınır. Kabul edilmeyen kapanışlar işaretlidir.

- [x] UI-02.7 — Sentez ve ölçüt: audio-synth ile iki palet (`steel`, `aurum`) × 23 olay × 3 varyant sıfırdan üretildi (138 OGG; eski 12 olaylık `ui-*` aileleri, bank ve manifestleri silindi). Her olay üç katman ailesinden kurulur: gövde (düşen perdeli sinüs + doygunluk), ayrı süzülmüş temas tıkı, gerektiğinde modal çınlama/melodik katman; varyasyon boyutları gövde süresi, tık parlaklığı, çınlama perdesi ve gövde sıcaklığıdır. UI politikası güncellendi (yükseklik −42…−8 LUFS; eski yüksek geçiren ve sub kuralı kalktı); testler gövde+tık katmanı ve gövde bandının üst bantlardan zayıf olmamasını doğrular. `denied` ve `toggle-off` ailelerinde ortanca çeşitlilik eşiği düşürüldü (0,015/0,02): kısa kuru sesler, kasıtlı.
- [x] UI-02.6 — Ses brief'i ve olay sözlüğü v2: 23 olay (`hover`, `focus`, `press`, `release`, `back`, `confirm`, `toggleOn/Off`, `select`, `tabSwitch`, `sliderTick`, `valueCommit`, `panelOpen/Close`, `dragPick/Drop`, `equip`, `purchase`, `reward`, `levelUp`, `notify`, `denied`, `alert`); niyet→olay eşlemesi `UI_INTENT_SOUND`, ürün sonucu `UI_OUTCOME_SOUND` (başarı→`confirm`, uyarı→`alert`, hata→`denied`); mikro olaylar `hover`/`focus` 70 ms, `sliderTick` 45 ms; kritikler `alert`/`denied`. Paletler `steel` (çelik donanım) ve `aurum` (yaldızlı cam ve lake). Belge: `core/docs/sfx.md`.
- [x] UI-00.1 — `core/src/ui/index.ts` yüzeyi (89 sınıf, 29 yardımcı, 205 tip) AST'den çıkarılır; her sınıf/yardımcı `registry.json`'da tekil kayıtlıdır ve kapı kaydı yüzeyle, VOL.TEST tüketimiyle (17 sınıf doğrudan), vitrin kullanımıyla ve gerçek `it`+`expect` kanıtıyla karşılaştırır. Eski isim-geçişi bekçisinin yorum/metin mention'ını gösterim saydığı 9 yer ve kanıtsız 5 öğe (sahip görevli gap) ortaya çıktı.
- [x] UI-00.2 — Vitrinin 7 E2E dosyası Chromium ve WebKit'te koşar (40 → 68 test, 2,1 dk); tek istisna Chromium piksel temelidir ve `e2eConfig` bekçisi dosya listesini raporlar, gerekçesiz asimetriyi ve ölü istisnayı reddeder. WebKit'te çıkan tek kusur (`user-select` hesaplı stili yalnız ön ekli) testin motor farkıydı, CSS doğruydu. Linux temelleri WSL'de 6/12 yeniden üretildi: Linux hücresi doğrulanmamış.
- [x] UI-00.6 — Çalışan tarayıcı probu ve profil uygulanabilirliği: `devtools/vol-showcase/tests/e2e/support/frameProbe.ts` aynı kare atfını (CDP izinden JS, stil, yerleşim, boyama, commit, zorlanan yerleşim; `BeginMainThreadFrame.frameId`), girdi→görünür bağını (olay damgası, iz saati hizalaması) ve A/A/iz maliyeti kalibrasyonunu küçük fixture ile kurar (`probe.spec.ts`: bilinen 5 ms ve 25 ms yük bulunur, boşta kare medyanı <1 ms, araç olayları sayılmaz); WebKit'te iz `unsupported`. Native: Android 14 tablette VOL.TEST için resmi `dumpsys gfxinfo framestats` yolu GERÇEKTEN çalıştı (530 kare, 120 Hz, sunum p50 32,2 ms, işleme p95 8,8 ms, girdi işleme→sunum p50 31,4 ms) ve `scripts/android/frame-stats.mjs` olarak kalıcılaştı; Windows WebView2 (PresentMon eksik, UI-06.4), Steam Deck (cihaz yok, sunulan kare aracı eksik, UI-12.4) ve Android 16/Samsung (cihaz yok, UI-11.4) için eksik araç/sahip [doğrulama planında](VERIFICATION.md) yazılı. UI-03 pilotunun bağımlı olduğu çalışan browser probu hazır; desteksiz toplam CPU/GPU/sunum hücresi açık sürüm engeli olarak kalır.
- [x] UI-00.5 — İlk referans alındı ve kayıt yöntemi kuruldu: `node scripts/quality/cli/ui-baseline.mjs record <etiket>` (tarif `just ui-baseline`) vitrini ve VOL.TEST'i derler, iki motorda 12 sekmenin dondurulmuş ekran özetini (sha256) ve hareket azaltma kapalı/açık sürekli animasyon kümesini toplar, gönderilen gzip baytlarını ve `ui-perf` özetini ekler ve vitrin paketinin git dışı records alanına yazar; `compare <önceki> <sonraki> [--strict]` bundle büyümesini, ekran değişimini, yeni sürekli animasyonu ve ölçü yitimini kötüleşme sayar. Yeniden sayım: 12 sekme (E2E listesiyle aynı), 17 doğrudan sınıf tüketicisi (+4 yardımcı), vitrin anahtarı **830** (EN=TR; plandaki "821" yeniden üretilemedi, geri alındı), CORE 63. Tekrarlanabilirlik kanıtı: art arda iki kayıt 0 fark verir (24 ekran özeti, bundle baytları dahil). İlk kayıt: vitrin app 141979, css 20241 B; VOL.TEST app 103266, vendor 353881, css 18662 B; hareket azaltma açıkken iki motorun hiçbir sekmesinde sürekli animasyon yok, kapalıyken `vol-dialogue-bounce` her sekmede, `vol-spin` (buttons) ve altı glif animasyonu (text) sürüyor. Cihaz hücreleri: Steam Deck bağlı değil, Samsung ve Android 16 cihaz yok, Android tablet için yerel vitrin ölçümü henüz yok → hepsi NOT-RUN gerekçeli; kök F08/F09 ve VOL.TEST kabul işleri açık kalır.
- [x] UI-01.9 — İmleç sistemi: Kenney Cursor Pack (CC0) ve Crosshair Pack (CC0) paketlerinden kürate 19 arayüz + 20 RTS imleci (iki katman: koyu dış çizgi + gövde; etkin nokta yoldan çıkarılır) ve 20 nişangâh (nokta, artı, halka, çift halka, köşe ayracı, keskin nişancı…), `core/scripts/cursors/curate.mjs` ile `cursors.json` (71 KB) olarak (`--check` kaynakla sapmayı bildirir). `CursorController`: arayüz imleçleri kökte `--vol-cursor-*` değişkenleri (96 CSS `cursor` bildirimi artık değişkenden okur, kök varsayılanı sistem imleci); RTS bağlamı (`setContext`: dost/düşman/kaynak/ağaç/engel/inşa/onar/toplanma/devriye/garnizon/kenar kaydırma/…) hedef yüzeyin imlecini ŞEKİL ve gövde TONU (dost yeşil, düşman kırmızı, belirsiz sarı, komut vurgu) ile değiştirir, renk tek taşıyıcı değildir; nişangâh kipinde yerel imleç gizlenir ve çizilen nişangâh işaretçiyi AYNI olayda izler (açılım ölçeği, atış büyümesi, vuruş işareti, hareket azaltılmışta durağan). Dokunmatikte ve ince işaretçi yokken etkisiz, kayıt yüklenemezse sistem imleci kalır, `setVisible` kol işaretçisi için. Vitrinde KİMLİK sekmesi: 3 galeri (üzerine gelince gerçek imleç) + canlı RTS arenası (8 bağlam, kenar kaydırma) + nişangâh arenası (atış/isabet sayacı). Kanıt: 21 birim + 4 e2e (Chromium + WebKit): her bağlam ayrı imleç görseli, nişangâh merkezi işaretçiye ≤1 CSS piksel yakın, yerel imleç `none`, düğme eli değişkenden. Public yüzey +18 ad. Kalan/NOT-RUN: WebView2, Android ve Deck'te gerçek imleç davranışı ölçülmedi (headless imleç görüntüsünü çizmez; hesaplanmış `cursor` değeri ve nişangâh konumu ölçüldü); kol işaretçisiyle tek sahiplik UI-12.2'de; skin vurgu rengine bağlama UI-07.4'te (`setPalette` hazır).
- [x] UI-01.8 — İkon sistemi (**ikinci sürüm; ilki kabul edilmedi**: game-icons.net setinin ortaçağ temalı, süslü siluetleri oyun arayüzüne yakışmadı, kullanıcı minimal dolgulu ve modern istedi). Tek stil: dolu, yuvarlak, minimal, tek renk siluet. Kaynak: Phosphor Icons Fill (MIT, sürüm 2.1.1) seçkisi 173 ikon + Phosphor'da karşılığı olmayan 18 RTS/bullet hell nesnesi aynı 256 ızgarasında özgün çizildi (kule ailesi, mancınık, top, tank, helikopter, okçu yayı, kazma, külçe vb.; görsel incelemeyle düzeltildi). Kimlikler aynı kaldı (191: komut, yapı, birim, kaynak, mermi/bullet hell, durum, eşya, genel, kabuk), bileşen ve vitrin tüketicileri değişmedi. Üretim `core/scripts/icons/curate.mjs` (yerel Phosphor paketinden, `--check` kaynakla sapmayı bildirir; seçim `core/scripts/icons/icons.curation.json`, özgün çizimler `core/scripts/icons/authored.mjs`); atıf ve lisans her ikon için manifestte ve `CREDITS.md`'de. Çıktı iki sprite (`chrome.svg`, `game.svg`), ilk `Icon` kullanımında yüklenir. Kalan: `Icon` boyut ağırlığı ve buton içi ikon ölçekleri UI-03.1'de, eşlemesiz eski editör çizgi ikonları UI-10.4/10.5'te, uygulama içi kredi ekranı UI-09.4'te, sprite alt kümesi gönderimi ölçülen ihtiyaçla; kullanıcının ikon kabulü UI-03 görsel kabulünde.
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
