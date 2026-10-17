# VOL.STUDIO — iş listesi

Repo geneli açık işlerin sahibidir. UI alt işleri [UI TODO](docs/ui/TODO.md),
audio işleri [audio TODO](devtools/audio-synth/TODO.md) içindedir; aynı iş
birden fazla listede checkbox olarak tutulmaz. Tasarım kararları ve teknik
kanıt [monorepo denetimindedir](docs/monorepo-audit.md).

`[ ]` açık, `[x]` kanıtıyla kapanmış iştir. Kimlikler tekildir; eski kimlikler
başka işe verilmez. Her açık madde yalnız kalan işi ve kısa bir **Kapanır**
ölçütünü taşır. Kapsamdan çıkarılan iş tamamlandı olarak işaretlenmez.
Görev doğrulaması ilgili davranışla sınırlıdır; repo kapılarının sözleşmesi
[AGENTS.md](AGENTS.md) ve [kapı belgesindedir](docs/gates.md).

## Açık

### F04 — Kalıcılık ve native yaşam döngüsü

- [ ] **[P1] F04.4 — Steam callback ve kapanış kabulü.** Windows kayıt/kapanış regresyonları mevcut. Kalan: gerçek Steam popup/overlay ve metin callback yaşamı, SDK drop ve Deck SIGTERM zaman aşımı nedeni. **Kapanır:** kısa native turda son değer, callback temizliği ve kapanış sonucu kaydedilir; cihaz kabulünün sahibi F08.6'dır.

### F07 — CORE UI ve VOL.SHOWCASE

Açık UI işlerinin tek sahibi [UI TODO](docs/ui/TODO.md)'dur. Katalog,
erişilebilirlik ve kısa native kontroller orada izlenir; burada ikinci
checkbox veya toplam tutulmaz.

### F08 — Linux ve Steam Deck

- [ ] **[P1] F08.3 — Host ve SLR4 görünür açılışı.** Açılış kanıtları mevcut; codec ve paket/runtime bağının kalan teknik kabulü ayrıştırılır. **Kapanır:** aynı ürün paketi için host ve gerçek SLR4 pencere/ekran görüntüsü ile OGG çözme/çıkış sonucu ayrı kaydedilir; ölçülmeyen çıktı NOT-RUN kalır.
- [ ] **[P1] F08.4 — Windows'tan Deck devkit zinciri.** **Kapanır:** keşif/DNS/SSH/build/aktarım/launch/screenshot kısa uçtan uca turda doğrulanır; başarısız preflight görünürdür ve mevcut shell-kapalı SSH quoting korunur.
- [ ] **[P1] F08.6 — Steam, kayıt ve uyku olayları.** **Kapanır:** overlay/QAM, fiziksel kol, Steam metni/haptik, tek uyku/uyanma ve terminate/SIGKILL senaryolarında son değer, saat/ses toparlanması ve kaynak temizliği kaydedilir; libmanette sorunu dump/tekrar veya karşıt kanıtla ayrılır. F04.4 aynı kabulü tekrar sahiplenmez.

### F09 — Mevcut ürünün platform ve sunum işleri

- [ ] **[P1] F09.1 — Windows ürün kabulü.** **Kapanır:** paketli NSIS/WebView2 kurulum/açılış/kaldırma; DPI 125/150/200; klavye/kol/metin/clipboard, ekran kipi, ses, kayıt ve kapanış kısa işlevsel turda doğrulanır.
- [ ] **[P1] F09.2 — Android ürün kabulünün kalanı.** Lenovo'nun önceki 922a83dd paketinde 18 çevrimdışı ve 16 ağ kontrolü geçti. **Kapanır:** güncel Samsung turu, fiziksel ≥600dp Android 16 yön davranışı ve gerçek bölünmüş ekran ölçülür; yoğunluk benzetimi fiziksel cihaz yerine sayılmaz.
- [ ] **[P2] F09.5 — VOL.TEST görsel/ses değerlendirmesi.** Örümcek gölgeleri, Manta, çekirdek/duyarga, hasar/can izi, çevrimiçi HUD, batış ve Goliath yerleşimi teknik olarak doğrulandı. **Kapanır:** kullanıcı değerlendirmesi kaydedilir ve bu yapının Samsung görünür turu tamamlanır.
- [ ] **[P2] F09.6 — Yetenek sesleri ve sunumu.** **Kapanır:** kalkan açılış/emilim/kapanış ve kuşatma kurulum sesleri audio-synth teknik kabulüyle yayımlanır; animasyon/kubbe değerlendirmesi ve kısa Samsung/Deck yetenek turu kaydedilir.
- [ ] **[P2] F09.7 — Menü, arka plan ve geliştirici ayarları.** **Kapanır:** sağ şerit geçişi, araç alayının ritmi/yoğunluğu, okunurluk ve ayarlar Samsung/Lenovo/Deck'te kısa örneklerle değerlendirilir; menü ve en uzak yakınlaştırma kare ölçümü kendi kapsamıyla raporlanır.
- [ ] **[P2] F09.8 — Sıçrayıcılar ve dünya katmanları.** **Kapanır:** Jackal/Panther/Rhino kontrolü ve oranları; yürüyüş/dönüş/sıçrama/iniş, bitki/kaya, göl/buz/batış ve ses sunumu kısa gerçek oyun turunda birim başına değerlendirilir; bot dengesi insan oyunuyla karşılaştırılır.
- [ ] **[P2] F09.9 — Barracuda, Leviathan ve mech değerlendirmesi.** **Kapanır:** araç oranı, adım hissi, bacak/silah okunurluğu, telefon garajı ve botlarla ölçülmüş denge gerçek oyun turunda değerlendirilir.
- [ ] **[P2] F09.10 — Yenilenen oyun seslerinin değerlendirmesi.** **Kapanır:** 49 oyun sesinin kullanıcı dinleme sonucu kaydedilir; kabul edilmeyen program düzeltilip teknik yayın kapısıyla yeniden yayımlanır.

### F10 — Güvenlik ve sınırlı bakım

- [ ] **[P3] F10.4 — Haptik scheduler kararı.** **Kapanır:** mevcut driver/scheduler gecikme, eşzamanlılık ve iptal örnekleriyle ölçülür; worker gerekiyorsa tek sahipli geçiş regresyonla uygulanır, gerekmiyorsa ölçümle mevcut mimari korunur.
- [ ] **[P3] F10.5 — Yeni donanım profilleri.** **Kapanır:** OLED Deck/Steam Machine erişilebilir olduğunda ayrı kısa frame/runtime profili alınır; başka cihazın sonucu taşınmaz.
- [ ] **[P3] F10.12 — Tauri minör geçişi.** Ön koşul: F09.1/F09.2 native temel çizgisi. **Kapanır:** planlanan Tauri geçişinde Cargo/pnpm sürüm paritesi ve Rust kapısı korunur; Windows/Android/Linux kısa native karşılaştırması yapılır, çözülen advisory kayıtları kaldırılır; toplu cargo update yapılmaz.

### F13 — Network ve mevcut oyun tüketicisi

- [ ] **[P1] F13.3 — Üretim ağ sınırları.** Protokol/istemci/sunucu, origin/IP/katılım/oda sınırları ve yerel native bağlantı kanıtı mevcut. **Kapanır:** hesap kimliği/auth sağlayıcısı, internet WSS ve uzak endpoint CSP/taşıma, süreç keşfi, savaş sisi ve hedeflere ait paketli bağlantı matrisi ayrı teknik kabulle tamamlanır.
- [ ] **[P1] F13.6 — Bozuk ağ ve oturum senaryoları.** Doğrulanan düzeltme/snap sayaçları ve sınırlı SDK adımlaması mevcut. **Kapanır:** gerçek paket kaybı ve sınırlı bozuk-payload korpusu; maç sonu/doğuş/çift kopuş/sunucu boşaltma/arka plan-ağ değişimi ayrı senaryolarda sınanır; Node/Chromium/WebKit/Android manevra/çarpışma/ateş öngörüsü deterministiktir. Gecikme telafisi yalnız ölçüm gerektirirse eklenir.

### F14 — Son cihaz kabulü

- [ ] **[P1] F14.1 — Deck'in son paket ağ turu.** Önceki 922a83dd kaynak turunda Lenovo 18+16 ve gerçek SLR4 kol gezinmesi geçti; son Deck ağ turu erişim kaybıyla NOT-RUN kaldı. **Kapanır:** aynı paketin erken kopuş/aynı oturumla dönüş, süre aşımı/çevrimdışı dönüş, yeniden giriş ve temiz çıkış akışları kısa cihaz turunda kaydedilir; tura ait geçici süreçlerin temizliği doğrulanır. Eski paketin ağ sonucu yeniye taşınmaz.

## Kapatılanlar

Son teknik kapanışlar aşağıdadır; eski kapanış ayrıntıları ve ölçümler Git
geçmişindedir. Güncel sözleşmeler [denetimde](docs/monorepo-audit.md) yaşar.

- [x] F10.6 — Eski iş dalları commit ataları ve doğrulanmış bundle ile korunduktan sonra temizlendi; dev entegrasyon dalı ileri alındı.
- [x] F10.2 — ESLint/stylelint/jsdom/Vitest geçişleri kaynak, UI, oyun E2E ve ses kapsamıyla doğrulandı; parser uyumu korundu.
- [x] F08.2 — Native sonuç/runtime, sürüm/damga ve kayıt kaybı zinciri roundtrip ve probe bundle regresyonlarıyla korundu; başarısız son flush kabulü düşürür.
- [x] F10.3 — CORE sıkı indeks denetimi, ortak scaling şeması ve ölçüm A/A/iz/retry doğruluğu regresyonlarla doğrulandı.
- [x] F11.9 — Sabit beklemeler olay/koşula çevrildi; gerekçeli kalan çağrılar bütçelendi ve iki motorlu UI geçti.
- [x] F13.7 — Gerçek SDK bot senaryoları, soket baytları ve doğrulanan uzlaştırma metrics yüzeyi; HTTP/abort/JSONL ömrü regresyonlarıyla tamamlandı.
- [x] F13.4 — Colyseus ve resmî sunucu kararı aktif network paketine taşındı; güncel kapsam [network tasarımında](network/DESIGN.md), üretim açıkları F13.3 içindedir.
- [x] F12.1 — Kalıcılık, olay/ömür, asset, native teslim ve kapı bütünlüğü kusurları başarısız→başarılı regresyonlarla kapatıldı; fiziksel kabuller ayrı kaldı.
- [x] F11.7 — Ham bayt girdi makbuzu, indeks/çalışma ağacı eşitliği, kısmi sahneleme ve yeni bağımlılık negatifleriyle kanca bütünlüğü korundu.
- [x] F11.4 — Kapsam eşiği/şekil, bekleme ve skip bütçesi ratchet kuralları gerekçesiz gevşemeyi reddeder; kaynak, script ve piksel platform kümesi bekçileri zorunludur.
