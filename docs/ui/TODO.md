# CORE UI — iş listesi

Açık UI işlerinin tek sahibidir; repo geneli işler [kök TODO](../../TODO.md)
içindedir. Tasarım ve sınırlar [CONTRACT](CONTRACT.md), canlı yüzey
[CATALOG](CATALOG.md), teknik kabul [VERIFICATION](VERIFICATION.md) ve
[monorepo denetiminde](../monorepo-audit.md) tutulur.

`[ ]` açık, `[x]` kanıtıyla kapanmış iştir. Kimlikler tekildir. Görev metni
kalan davranışı ve **Kapanır** ölçütünü taşır; geçmiş test dökümleri burada
tekrarlanmaz. Kapsamdan çıkarılan görevler kapalı gibi işaretlenmez.

İki skin'in oyun arayüzü kimliği, kürate varlık/lisans, tek niyet/ses/girdi
sahibi ve hareket azaltma sözleşmeleri korunur. Görsel/ses beğenisi isteğe
bağlı feedback'tir; fiziksel giriş ve ölçülmeyen cihaz kabulü
uydurulmaz. Doğrulama ilgili bileşen veya kısa native akışla sınırlandırılır;
repo kapıları [kapı sözleşmesinin](../gates.md) konusudur.

## Açık

### UI-03 — Ürün tüketimi ve etkileşim

- [ ] **UI-03.3 — Aktif oyun regresyonları.** **Kapanır:** VOL.TEST pause/ayar denetimlerinin Deck native hit-test'i, görünürlüğü ve geri/odak sahipliği doğrulanır. Mevcut iki motor ve çift ses regresyonları korunur.

### UI-06 — Kısa native vitrin kabulü

- [ ] **UI-06.4 — Windows ve Deck işlevsel vitrin turu.** Native açılış ve canvas düzeltmeleri mevcut. **Kapanır:** Deck'te OGG/UI sesi çıkışı, fiziksel kol erişimi, gamescope pencere ayarlarının gizlenmesi ve dokunma canvas'ı kısa turda doğrulanır; host ve gerçek SLR4 ayrı etiketlenir. Windows release/DPI kabulünün sahibi UI-12.4'tür.

### UI-09 — Katmanlar, bildirimler ve veri

- [ ] **UI-09.2 — Tooltip ve bildirim kabulü.** Kuyruk/öncelik/odak/Escape mekanizmaları mevcut. **Kapanır:** dokunmatik tooltip alternatifi uygulanır; Deck/tablet HUD kontrollerini kapatmayan yerleşim doğrulanır; isteğe bağlı ses feedback'i UI-13.4'te tutulur.

### UI-11 — Metin girişi

- [ ] **UI-11.4 — Metin laboratuvarının APK kabulü.** **Kapanır:** güncel fiziksel Android APK'da sağlayıcı var/yok, hata/yarış, güvenli giriş ve dil örnekleri doğrulanır; OS/WebView/Tauri ve ekran görüntüsü kaydedilir; %200 sistem fontu ile %200 web ayrı sınanır, WebView probu kalibre edilir. Erişilmeyen Samsung profili NOT-RUN kalır.

### UI-12 — Native giriş ve kabuk

- [ ] **UI-12.2 — Eylem glifi ve fiziksel kol geçişi.** **Kapanır:** remap/hotplug/çoklu kol/Steam Input kapalı/trackpad/fare/klavye kısa örneklerde sınanır; gerçek bağlama glifi ile aile yedeği ayrılır, tek işaretçi sahibi korunur; Deck OSK/menü/diyalogları yalnız kolla erişilir.
- [ ] **UI-12.3 — Haptik/native yaşam döngüsü.** **Kapanır:** sıfır/kapalı durumda sessizlik ve tek driver; tek uyku/uyanma, odak kaybı, cihaz çıkarma ve çıkış olayında durma gerçek sondada doğrulanır. Hissiyat feedback'i teknik sonuçtan ayrı kaydedilir.
- [ ] **UI-12.4 — Windows yükleyicisi ve metin laboratuvarı.** **Kapanır:** NSIS kurulum/açılış/kaldırma, WebView2, DPI 125/150/200, font/input/clipboard/back kısa turda doğrulanır; asgari izinler ve özgün kimlik korunur, kare/CPU probunun A/A kalibrasyonu kaydedilir.

### UI-13 — Katalog, stres ve erişilebilirlik

- [ ] **UI-13.2 — Native etkileşim streslerinin kalanı.** İki motorlu modal→Select→OSK, çoklu dokunma, sanal kol↔dokunma/hotplug ve bekleyen istekte tema/dil regresyonları geçti. **Kapanır:** kısa Windows native akışında giriş geçişi, tek askıya alma/devam ve ses erişimi doğrulanır; kayıp odak, yinelenen değişiklik, eski sonuç veya kalan kaynak yoktur. Sanal girdi gerçek donanım kabulü sayılmaz.
- [ ] **UI-13.4 — Gerçek giriş profilleri.** **Kapanır:** yalnız klavye/kol, TR/EN/%200/gri ton, glif ve haptik kısa akışları kayıtlıdır; eksik cihaz profili NOT-RUN kalır. Görsel/ses/imleç beğenisi isteğe bağlıdır ve bekleme kapısı değildir.

## Kapatılanlar

Önceden kapanmış teknik teslimlerin özeti aşağıdadır. Ayrıntılı kanıt ve
kapsam sınırları [VERIFICATION](VERIFICATION.md) ile
[monorepo denetimindedir](../monorepo-audit.md).

- [x] UI-03.4 — İki motor/skin, %30 etiket, altı hane ve pointer/touch/sanal kol DOM yanıtının 12 profilinde p95 güven üst sınırı + A/A payı ≤40 ms; CPU/sunum ölçülmediği açıkça ayrıldı (§29).
- [x] UI-09.1 — Katman ailesinin malzeme/hareket/tek ses ve odak dönüşü tamamlandı; kaynak ömrü regresyonları, %200 geometri ve güncel piksel temelleriyle iki motorlu tam UI geçti (§29).
- [x] UI-13.1 — Uygulanabilir tier-1 durumlarda 0 açık hücre/278 test bağı; gerekçeli N/A, public/i18n paritesi, high ve 1.095 PASS/20 mevcut SKIP ile tam UI doğrulandı (§29).
- [x] UI-00.1 — Public UI yüzeyi, registry, tüketici ve gerçek test bağlantıları AST tabanlı denetime bağlandı.
- [x] UI-00.2 — Chromium/WebKit E2E kapsamı ve gerekçeli motor asimetrisi bekçisi kuruldu.
- [x] UI-00.3 — Axe, geometri ve durum fixture'ları iki motorlu kanıt düzenine bağlandı.
- [x] UI-00.4 — Hit-test/kırpılma/glif ölçümü ve desteklenmeyen performans kapsamı ayrımı doğrulandı.
- [x] UI-00.5 — Önce/sonra UI referans kaydı, ekran/bundle karşılaştırması ve yerel kanıt protokolü kuruldu.
- [x] UI-00.6 — Tarayıcı kare/girdi probu, A/A ve iz maliyeti kalibrasyonu fixture'larla doğrulandı.
- [x] UI-00.7 — Kanonik ses bankı ile gönderilen runtime görünümü ayrıldı; paket boyutu kazancı ölçüldü.
- [x] UI-01.1 — Anlamsal token ve tema kaynağı AST'den tek üretilen CSS hattına bağlandı.
- [x] UI-01.2 — Tema/yoğunluk/target sahipliği, scoped uygulama, restore ve kalıcılık regresyonları kapandı.
- [x] UI-01.3 — Hareket ilkelleri, öncelik/kaynak bütçesi ve azaltılmış hareket temizliği doğrulandı.
- [x] UI-01.4 — Tüketilmeyen ilk varlık seti kabul edilmedi; yerine kürate ikon/imleç ve malzeme hattı getirildi.
- [x] UI-01.5 — Tema üretim sapması, kontrast sahipliği ve ham hareket süresi ratchet'i contract'a bağlandı.
- [x] UI-01.6 — default/aurum tema çifti uygulandı; ayırt edilemeyen ember teması kaldırıldı.
- [x] UI-01.7 — Malzeme/çerçeve dili, son renk kontrastı, hasar şeridi ve gölge/blur bütçesi ölçüldü.
- [x] UI-01.8 — Kürate dolu/modern ikon seti, lisans ve tüketim hattı teslim edildi.
- [x] UI-01.9 — CSS/yazılım imleci, nişangâh, kürasyon ve girdi sahipliği teslim edildi.
- [x] UI-01.10 — Juice, counter overshoot, modal giriş dizisi, eşzamanlı bütçe ve flaş sınırı doğrulandı.
- [x] UI-02.1 — Tek niyet/olay/girdi sahipliği ve programatik sessizlik gerçek tüketici testleriyle kapandı.
- [x] UI-02.2 — UiSoundKit, ayrı public alt yüzey ve mevcut audio mekanizmalarıyla ayarlar teslim edildi.
- [x] UI-02.3 — Kabul edilmeyen ilk UI ses seti kaldırıldı; yeni palet/olay hattına geçildi.
- [x] UI-02.4 — Duck/haptik kısma, iptal, sessizlik ve sökümde tek sahiplik doğrulandı.
- [x] UI-02.5 — Ses laboratuvarının teknik mekanizması korundu; yeni olay sözlüğü ve paletlere bağlandı.
- [x] UI-02.6 — Ses brief'i, olay sözlüğü, niyet/sonuç eşlemesi ve tekrar aralıkları tanımlandı.
- [x] UI-02.7 — İki UI paleti ve varyantları sentezlendi; eski ses seti teknik yayın hattıyla değiştirildi.
- [x] UI-02.8 — UI ses kiti vitrin ve VOL.TEST köküne bağlandı; çift ses ve geç restore regresyonları kapandı.
- [x] UI-02.9 — Ses laboratuvarı ve teknik karşılaştırma kaydı teslim edildi; insan beğenisi iddia edilmedi.
- [x] UI-03.1 — Button/IconButton/ToolButton malzeme, durum, erişilebilir ad ve tek etkinleşme regresyonları kapandı.
- [x] UI-03.2 — Hold/Charge/LongPress klavye/kol eşdeğeri, iptal ve kaynak temizliği doğrulandı.
- [x] UI-04.1 — Kart yüzeyi, nadirlik işareti, erişilebilir ad ve seçim/drag niyeti teslim edildi.
- [x] UI-04.2 — Picker ailesinin yükleme/hata/boşluk/seçim sunumu ve katman örnekleri tamamlandı.
- [x] UI-04.3 — SwipeableCardStack klavye/kol/dokunma, iptal, duyuru ve hareket azaltma teknik kabulü geçti.
- [x] UI-04.4 — Kart matrisi, uzun metin/altı hane/RTL, geometri, axe ve piksel teknik kabulü geçti.
- [x] UI-05.1 — Adlandırılmış giriş, readOnly/invalid/IME, taslak/commit ve değer niyeti sözleşmesi doğrulandı.
- [x] UI-05.2 — Seçim denetimlerinin disabled/empty/invalid, yön sahipliği ve niyet davranışı tamamlandı.
- [x] UI-05.3 — Panel/yerleşim, carousel/wizard/scroll ve paylaşılan UI kökü yaşamı düzeltildi.
- [x] UI-05.4 — SettingsModel/tarif ayrımı, atomik kapsam yazımı, kirli taslak ve canlı ses ayarları doğrulandı.
- [x] UI-05.5 — Formların klavye/kol/dokunma ve uzun metin/altı hane teknik kabulü geçti.
- [x] UI-06.1 — Tek VOL.SHOWCASE paketine göç; lifecycle/quality/Cargo/port/katalog bağları tamamlandı.
- [x] UI-06.2 — Vitrinin native crate'i ortak kabuk ve kapı kapsamına bağlandı.
- [x] UI-06.3 — Platform ayarı ve görünür kabuk gerçek servislere bağlandı; pencere izinleri ve scope testleri geçti.
- [x] UI-07.1 — Görünen metin, dil paritesi ve i18n yüzeyi AST tabanlı denetimle doğrulandı.
- [x] UI-07.2 — Çoğul, sayı biçimi, RTL ve uzun etiket davranışı tamamlandı.
- [x] UI-07.3 — Font varlıkları, kaynak/lisans ve yükleme sözleşmesi teslim edildi.
- [x] UI-07.4 — Tema laboratuvarı, üst bar ve canlı platform/tema sunumu tamamlandı.
- [x] UI-08.1 — HUD bar/sayaç/zaman ve floating text ailesinin teknik sunumu tamamlandı.
- [x] UI-08.2 — FPS/minimap/seçim/istatistik bileşenleri gerçek tüketici ve scoped tema kanıtına bağlandı.
- [x] UI-08.3 — ActionBar/BuildMenu/SkillTree/SlotGrid oyun ikonları ve teknik etkileşim kabulü geçti.
- [x] UI-08.4 — Erken tier-1 kapsam denetimi kuruldu; kalan durum bağlantılarının sahibi UI-13.1'dir.
- [x] UI-09.4 — Diyalog deseni, yönlendirici işaret ve yasal metin teknik kabulü tamamlandı.
- [x] UI-10.1 — Yön/joystick/jest/multitouch/pull ailesinin teknik giriş ve iptal sözleşmesi tamamlandı.
- [x] UI-10.2 — Scroll/virtual list/split pane ailesinin teknik odak ve yerleşim sözleşmesi tamamlandı.
- [x] UI-10.3 — PauseResumeButton sunum ve opt-in tarif katmanlarına ayrıldı.
- [x] UI-10.4 — Yükleme/metin/ikon/toolbar/property/viewport/camera/zoom yardımcıları teknik kabulle tamamlandı.
- [x] UI-10.5 — Palette ve ileri katalog örnekleri gerçek test ve vitrin kanıtına bağlandı.
- [x] UI-11.1 — Metin girişi sahip/oturum/IME bileşimi ve eski sonuç/odak regresyonları kapandı.
- [x] UI-11.2 — Native menü/pano ve dokunmatik seçim sözleşmesi doğrulandı.
- [x] UI-11.3 — Android Activity/ActionMode/Insets teknik turu ve kes/yapıştır regresyonu kapandı.
- [x] UI-12.1 — Steam metin sağlayıcısının teknik sahiplik ve temizliği uygulandı.
- [x] B24/B25 — İç içe kök olay sahipliği, dinletim ayrımı ve geç restore alan/snapshot regresyonları kapandı.
- [x] B26/B28 — Minimap scoped tema, remount ve canlı erişilebilir ad tüketici regresyonları kapandı.
