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

Son kapanışlar aşağıdadır; önceki teslim ayrıntıları Git geçmişindedir.
Güncel kabul [VERIFICATION](VERIFICATION.md), yüzey/durum sayıları canlı
[CATALOG](CATALOG.md) komutlarıyla okunur.

- [x] UI-03.4 — İki motor/skin, uzun etiket/sayı ve pointer/touch/sanal kol profillerinde DOM yanıtı A/A payıyla doğrulandı; CPU/sunum kapsamı ayrıldı.
- [x] UI-09.1 — Katmanların malzeme, hareket, tek ses ve odak dönüşü; kaynak ömrü, %200 geometri ve iki motorlu piksel regresyonlarıyla tamamlandı.
- [x] UI-13.1 — Uygulanabilir tier-1 durumların açık hücreleri kapandı; test bağları, gerekçeli N/A ve public/i18n paritesi otomatik bekçiye bağlandı.
- [x] UI-00.1 — Public UI yüzeyi, registry, gerçek tüketici ve test bağlantıları AST denetimiyle korunur.
- [x] UI-00.2 — Chromium/WebKit E2E, axe, geometri, durum fixture kayıtları ve gerekçeli motor asimetrisi zorunlu kapılara bağlandı.
