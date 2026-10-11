# VOL.STUDIO — güncel monorepo denetimi

**Kaynak denetimi:** 2026-10-09. **Kapı derin turu:** 2026-10-11 (§22);
aynı gün sonraki başarısız `signoff` koşusu §23'te, hedefli düzeltme
kanıtları §24'te; aynı değişiklik öncesi ağaçta üç ardışık tam yeşil
`signoff` sonucu §25'tedir.
**İlk temel:** `251c3db4`, `feature/core-hardening`;
B21–B30 uygulaması kaynak ve regresyonlarla doğrulandı.
F04 teslimi `cab83d7e` sonrasında 81 commit incelendi. Bu rapor kaynak kodu,
oturum başındaki beş yerel değişikliği ve önceki cihaz kayıtlarını ayırır.
Bugünkü karar burada; ayrıntılı tarihçe git'te, işlerin sahibi
[kök TODO](../TODO.md), UI alt işlerinin sahibi [UI TODO](ui/TODO.md)'dur.

## 1. Açık hüküm

Repo ciddi biçimde ilerledi. Windows geçişi artık yalnız yol ayırıcı yaması
değil: çalışan MSVC probu, süreç/argv sözleşmeleri, gerçek disk testleri ve
native kayıt turu var. CORE UI altyapısı kaynakta, vitrinde ve oyunda
tüketiliyor; yeni görsel/ses kimliğinin tam kabulü F07'de açık. Audio hedef kilidi, manifest doğrulaması ve fizik kesişimi
düzeltmeleri gerçek; yalnız belgeye yazılmış işler değiller.

**Buna rağmen bütün ürün kabulleri tamamlanmış değildir.** B21–B30'un
on kod kusuru kaynak ve regresyonla düzeltildi; kapanış zinciri, gerçek
tüketici ve dosya/süreç sınırları birlikte sınandı (§4). Bağımsız incelemenin
yakaladığı geç mini harita montajı ve sayaçsız eski Deck kaydı da çözüme alındı.

Belge yolu kusuru giderildi; bundle farkı özellik maliyetiyle ayrıştırıldı.
Birleşik kapının 2026-10-11 taze kanıtı §22'dedir; önceki turlar §6/§17'dedir. JS güvenlik advisory'leri ve
fiziksel/native ürün kabulleri açık kalır. Teknik kapanış bir insan
beğenisi bekleme durumu üretmez; yapılmayan cihaz kabulü de PASS sayılmaz.

Mimariyi topluca yıkmak için kanıt yok. Öncelik yeni mekanizma yazmaktan
önce mevcut mekanizmaların **birlikte çalıştığı** senaryoları güvenceye almak.
En büyük açık artık parçaların varlığı değil, parçaların birleşimidir.

## 2. Yöntem ve kanıt standardı

Önemli iddialar belge/TODO → uygulama kaynağı → gerçek tüketici → testin
assert ettiği durum → uygun disk/süreç/cihaz kanıtı zinciriyle sorgulandı.
Kalıcılık/native, oyun/simülasyon ve UI/audio/Pencil bağımsız incelendi;
ana denetçi kusur tekrarlarını ayrıca çalıştırdı. İnceleyici kanaati tek
başına bulgu sayılmadı.

Her test dosyasındaki her assertion tek tek elle incelenmiş değildir.
Tam takımlar çalıştırıldı; yüksek riskli sahiplik, gerçek tüketici,
geometri ve yayın sınırları kaynaklı tekrarlarla derinleştirildi. Bu rapor
eksiksiz kusursuzluk garantisi veya yalnız kapsama dayalı puanlama değildir.

Bazı tekrarlar yanlış davranışı assert ederek exit 0 verir; bu **ürünün
PASS olması değildir**. Oyun tekrarında olması gereken davranışı bekleyen
üç assertion kırmızıdır. Kanıtlar git dışındaki yerel audit alanındadır.
Ham cihaz adresi, seri, oturum kimliği veya kişisel ekran içeriği bu belgeye alınmadı.

Fallow statik tarama ve Graphify query/affected kullanıldı. Eski grafın
vol-ui yolları verdiği görüldü; yerel, LLM gerektirmeyen kod update'i yapıldı
ve bağlantılar güncel kaynakla doğrulandı. Graphify iki TypeScript barrel'ında
parser sınırlaması bildirdi; bunlar typecheck hatası değildir. `.pen`
dosyaları okunmadı; Pencil tekrarında yalnız yapay PNG/manifest kullanıldı.

| Kanıt                         | Neyi gösterir?                             | Neyi göstermez?                         |
| ----------------------------- | ------------------------------------------ | --------------------------------------- |
| Kaynak + deterministik tekrar | Tetikleyici ve yanlış sonuç                | Cihazdaki oluşma sıklığı                |
| Otomatik kapı                 | Belirtilen komutun bu ağaçtaki sonucu      | Sınanmayan davranışın doğruluğu         |
| Gerçek cihaz otomasyonu       | Belirtilen cihaz/yazılım yolunun çalışması | İnsan girdisi, panel fotonu ve hissiyat |
| Önceki kayıt                  | Belirtilen commit/runtime referansı        | Değişmiş paketin bugünkü kabulü         |
| Açık/NOT-RUN                  | Kabul yapılmadı veya eşlenemedi            | PASS ve destek ilanı                    |

## 3. Mimari ve ölçek

| Paket                    | Gerçek rol                                      | İzlenen dosya | Src dosyası¹ | Test dosyası² |
| ------------------------ | ----------------------------------------------- | ------------: | -----------: | ------------: |
| `core/`                  | Saf mekanizma, sunum, opt-in tarif, UI kataloğu |         1.050 |          313 |           201 |
| `tauri-v2/`              | Ortak JS/Rust kabuk ve platform adaptörleri     |           176 |           16 |            20 |
| `games/vol-test/`        | CORE/kabuk tüketen gerçek tank oyunu            |           353 |           99 |            76 |
| `devtools/vol-showcase/` | UI vitrini ve native kanıt uygulaması           |           190 |           39 |            88 |
| `devtools/audio-synth/`  | Deterministik üretim ve teknik yayın            |         2.402 |          260 |           132 |
| `devtools/pen.dev/`      | Pencil export düzenleme ve rig sözleşmesi       |            88 |            2 |             2 |
| `devtools/deck/`         | Devkit CLI, sonda ve cihaz otomasyonu           |            30 |            0 |             4 |

¹ Paketin src ağacındaki TS/TSX/RS/KT/JS/CSS; native alt ağaç ve scripts ayrıca
sayılmaz. ² tests ağacındaki test/spec adları; E2E ve birim dosyası birlikte
sayılır. Dosya sayısı test kalitesi değildir.

Toplam 4.475 izlenen dosya, yedi aktif paket; frozen paket yok. `cab83d7e`
sonrası 197.847 eklenen / 13.415 silinen satırın önemli bölümü ses manifesti
ve asset verisidir. Bunlar aynı büyüklükte uygulama kodu veya mimari başarı sayılmaz.

Bağımlılık yönü sağlıklı: CORE oyun/devtool import etmez; oyun CORE/kabuk
ve dış bağımlılıkları tüketir; devtool oyun runtime bağımlılığı değildir.
Güncel workspace contract yedi paketin kapı kapsamını, katmanlarını,
kaynak girdilerini ve dosya boyutlarını geçti. Saf simülasyon CORE alt
yüzeylerine, Phaser sunumu köprülerine, native context ürün crate'ine ayrılmış.

```mermaid
flowchart LR
  Game["VOL.TEST"] --> Core["CORE mekanizma ve UI"]
  Showcase["VOL.SHOWCASE"] --> Core
  Game --> Shell["Paylaşılan native kabuk"]
  Showcase --> Shell
  Shell --> Core
  Audio["Audio üretici"] -. "yayınlanmış asset" .-> Core
  Pencil["Pencil export aracı"] -. "rig çıktısı" .-> Game
  Deck["Deck devkit"] -. "cihaz ölçümü" .-> Game
```

Düz ok runtime tüketimini, kesikli ok varlık/ölçüm akışını gösterir;
devtool'un oyunun runtime import'una dönüşmesi değildir.

Üç gerçek akış tasarımın durumunu anlatır:

- Açılış: servis oluşturma → scoped kayıt göçü → ayar/durum yükleme → oyun
  ve HUD. Yeni LoadingScreen bu gerçek zincirin tüketicisidir.
- Kapanış: oyunu duraklat → servisleri flush et → sonuçları topla → native
  ACK → çıkış. B22 düzeltmesi native sorguyu da kuyruğa alır; görüntü niyeti ayar yazımından önce yerleşir.
- UI: bileşen niyeti → en yakın UI kökü → ses/haptik sağlayıcısı → skin
  asset'i. B24 düzeltmesi fiziksel DOM olayını en yakın kayıtlı köke bağlar.

## 4. B21–B30 kök neden çözümleri

On bulgunun kaynak kusuru kapalıdır. Önce doğru sonucu bekleyen regresyon
eski davranışta kırmızı görüldü; sonra çözüm aynı testte doğrulandı.
Bu tablo cihaz desteğinin tamamını veya F07'nin bütün ailesini kapatmaz.

| Bulgu   | Kök çözüm                                                                                                                                                                                                                                                           | Regresyonun somut sınırı                                                                                                                                                                                           |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| B21, P1 | [Pencil düzenleyici](../devtools/pen.dev/scripts/organize-pen-export.mjs) yalnız manifest kaynağını tüketir; staging yalnız boşsa kaldırılır. Örtüşme ve symlink/junction preflight reddidir.                                                                       | Gerçek geçici disk; ilgisiz PNG/alt dizin korunumu, ardışık export, örtüşme ve rollback.                                                                                                                           |
| B22, P2 | [Görüntü sahibi](../tauri-v2/src/window/DisplayModeController.ts) native sorguyu da kuyruğa alır; await sonrası generation/destroy denetler. [GameServices](../games/vol-test/src/app/GameServices.ts) önce görüntü niyetini, sonra ayar/ilerleme flush'ını bekler. | Bekleyen toggle→tercih→kalıcı son snapshot; destroy sonrası geç sorgu etkisiz. Görüntü reddi diğer kayıtları boşaltmayı engellemez.                                                                                |
| B23, P2 | [Reporter](../tauri-v2/src/platform/diagnostics.ts) IPC reddini, [native append](../tauri-v2/plugins/vol-diagnostics/src/lib.rs) açma/yazma/sync hatasını Result ile taşır. Oyun hata sınırı güvenli yakalar; ölçüm kaybı sayaçta görünür.                          | Gerçek reporter + GameMeasurements, gerçek disk success/open/mkdir reddi. Deck kayıp/eksik pencere/sayaçsız phase'i reddeder; Android eksik kanıtta FPS üretmez. Hata metni yerel dosya yolu taşımaz.              |
| B24, P2 | [UiIntentBus](../core/src/ui/feedback/uiIntent.ts) fiziksel olayın en yakın kayıtlı kökünü doğrular; özel handler da dış köke yeniden atfedemez.                                                                                                                    | İç kök, dış fallback, dış custom handler; olay hedefi olmayan host sinyali korunur. Gerçek Ses sekmesinde dry/kit dinletimi ikinci sesi üretmez.                                                                   |
| B25, P2 | [UiSoundKit](../core/src/audio/ui/UiSoundKit.ts) restore jenerasyonunu ve değişen alanları izler; dokunulmamış alanı yükler, son birleştirilmiş snapshot'ı kaydeder.                                                                                                | Restore sürerken mute/master değişimi; eski restore, dispose ve kalıcı son snapshot. Yalnız callback sırası değil adapter çıktısı sınanır.                                                                         |
| B26, P2 | [MinimapPanel](../core/src/ui/hud/MinimapPanel.ts) bağlıyken yalnız ata tema attribute/direct childList izler; detached aşamasında montajı keşfedip dar gözleme döner.                                                                                              | Durağan haritada scoped tema, aynı task'ta taşıma, ilk kareden sonra ilk mount ve ayrı task'ta remount; destroy sonrası observer/RAF temizliği. Sürekli polling veya bağlı panelde subtree attribute taraması yok. |
| B27, P2 | [Projectiles](../games/vol-test/src/sim/combat/Projectiles.ts) adım segmentini ilk dünya çıkış parametresinde keser; duvar arkasındaki araç aranmaz.                                                                                                                | Yedi bağımsız konum fixture'ı, sınırdan içe uçuş, duvarın ön/arkasındaki hedef, gerçek balistik hız ve gerçek Simulation tank atışı. x=1000/y=505 beklentisi preview paritesinden türetilmez.                      |
| B28, P3 | Mini harita label sağlayıcısı dil değişiminde yeniden okunur; [oyun tüketicisi](../games/vol-test/src/hud/MapPanel.ts) canlı i18n sağlayıcısı verir.                                                                                                                | CORE harita, oyun MapPanel ve gerçek HUD dil geçişi; görünen başlıkla canvas erişilebilir adı birlikte değişir.                                                                                                    |
| B29, P3 | [Kapı raporu](../scripts/quality/report.mjs) failing TAP bloğunu ayrıştırır; belirsiz paket null kalır.                                                                                                                                                             | Önceki PASS paketi yanlış atfedilmez; multiline YAML sebep/yol, gerçek CLI JSON ve exit/raw log korunumu.                                                                                                          |
| B30, P3 | [Preview sahibi](../devtools/vol-showcase/scripts/device-preview.mjs) Vite'ı doğrudan Node çocuğu olarak açar; kendi stdout'u ve HTTP hazır olmadan kabul etmez.                                                                                                    | Gerçek Windows Vite ardışık turunda PID/port kapanışı, dolu port sahibinin korunumu, erken exit; kapanış sınırlı bekler ve başarısızsa reddeder.                                                                   |

B30 fixture'ı statik dist'i gerçek Vite ile sınar; gereksiz boş config
derlemesi kaldırıldı. Push kancasındaki ilk coverage turunda PID/port
kapalıyken tempdir EBUSY görüldü; kilit sahibi sonradan yakalanamadı.
Config kullanan 120 ayrı gerçek Windows aç/kapat turu anında dizin
temizliğiyle geçti, kalıcı grandchild sızıntısı gözlenmedi. Fixture artık
cleanup retry kullanmaz ve dizinin hemen silindiğini ayrıca assert eder;
tam coverage kompozisyonu yeniden geçti. Config bundler'ın geçici dosya
ömrü bu fixture'ın kabulü değildir; kesin EBUSY sahibi çözüldü denmez.

İki bağımsız inceleme düzeltmesi de aynı bulgunun parçasıdır; yeni açık
checkbox defteri oluşturulmadı. B27 süpürülmüş doğru parçası modelini
düzeltir; eğri uçuşun veya hareketli hedefin tam sürekli CCD'si vaat edilmez.
Native pencere test harness'inin Windows DLL giriş sorunu nedeniyle Rust
yazım regresyonu UI mock üzerinden değil gerçek tempdir fonksiyonuyla kuruldu.

## 5. Statik araçların doğru yorumu

Fallow 3.31.0, 1.469 dosya / 20.098 fonksiyon analiz etti. Dead-code taraması
487 sinyal bildirdi: 110 dosya, 200 export, 57 tip, 108 sınıf üyesi, bir
bağımlılık, iki çözülemeyen import ve dokuz çift export. Döngü bildirmedi;
duplication yaklaşık %2. Bu **487 doğrulanmış hata değildir**.

Bilinçli UI kataloğu, CLI girişleri, subprocess fixture'ları, üretilen
vendor dosyaları ve library API'si import grafında eksik görünebilir. CORE
scaling/debug bağımsız girişler; Deck frame-summary vendor'u üreticiden
oluşur. Silme için gerçek giriş/üretici/tüketici zinciri gerekir.

Health coverage_model static_estimated'dır; gerçek V8 kapsamı sayılmadı.
Boundary/rule-pack yapılandırması yok; o alanlardaki sıfır **ölçülmemiştir**.
Repo katman AST bekçisi ayrıca geçti. Graphify update 13.200 kod düğümü /
40.341 kenar bildirdi; belge/görsel semantiği yeniden çıkarılmadı. Kaynak
doğrulaması, parser sınırı ve kesilmiş query çıktısı önemini korur.

Bakım inceleme sırası: kalite config validator'ı (siklomatik 68, bilişsel
171), public type yüzeyi, katman bekçisi, WorldScene, music engine, Select.
Kalite betikleri yoğun değişen yüksek sorumluluklu alanlar oldu. Refactor
amacı sayıyı küçük fonksiyonlara dağıtmak değil, kural sahibini ve negatif
fixture'ları anlaşılır kılmak olmalı. Statik “test ekle” önerisi mevcut
testler okunmadan eksik test kanıtı değildir.

Yanlış alarm olarak elenenler de önemlidir: callback handle sahibi artık
gerçektir; hidraw darbe süresi native tarafta beklenir; geniş Steam Cloud
izni mevcut devkit tüketicisi görülmeden kusur sayılamaz. Yalnız bool dönüş
tipine bakılarak Steam Input init başarısızlığı ileri sürülmedi. Kullanılmayan
genel resolution API'si gerçek oyunda hata var diye yükseltilmedi.

## 6. Güncel kapılar ve bundle

İlk tamamlanan birleşik **pnpm high PASS**: contract, biçim, tip, lint,
build, Rust, CSS, coverage/shape, audio alt kümesi, bundle, scaling ve
iki motorlu E2E aynı sabit kaynak ağacında tamamlandı. Contract 414 PASS /
2 mevcut platform skip; eşik, timeout ve skip politikası gevşetilmedi.
JS güvenlik kapısı ayrıca yeniden koşuldu: 2 high / 1 moderate ile FAIL.
Bu nedenle o koşuda **signoff PASS değildi**; advisory sahipliği sonradan F10.1'de
kapandı ([kapı politikası](gates.md)).

Temiz frontend build, gzip level 9:

| Paket        |       App |    Vendor |      CSS | App bütçesi |
| ------------ | --------: | --------: | -------: | ----------: |
| VOL.SHOWCASE | 182,4 KiB |         0 | 28,8 KiB |   182,9 KiB |
| VOL.TEST     | 120,4 KiB | 345,6 KiB | 26,1 KiB |   120,9 KiB |

Eski vitrin sınırı 178,7 KiB yeni kare ölçüm aracını eksik bütçeliyordu.
Kontrollü build'de yalnız frameBenchController çıkarılınca 182,3→180,0
KiB ölçüldü: faydalı ölçüm özelliğinin 2,3 KiB maliyeti var. Bu sanal
probe yalnız yerel çıktı üretti; üründen özellik kaldırılmadı.
251c3db4 yeniden ölçümü 182,0 idi. Bu düzeltmenin ek maliyeti vitrinde
0,4 KiB, oyunda 0,6 KiB: ilk duvar teması, ekran kuyruğu, tanı hata
sınırı ve canlı mini harita dil/tema sahipliği. quality.json geçmiş
günlüğü tek güncel gerekçeye indirgendi; app bütçesinde 0,5 KiB pay var.
Vendor/CSS ve kapsam eşikleri değişmedi. Uygulama kodu vendor adıyla
ölçümden saklanmadı. Gzip boyutu FPS/native açılış/OGG toplamı değildir.

theme.css bütünü stylelint seçimi dışında; AST/parite/kontrast kapısı
üretilen bölgeleri denetler, dosyanın el yazımı bütün CSS'inin stylelint
kabulünü sağlamaz. Bu denetimde bozuk CSS gösterilmedi; güvence daralması
F10.3'te gerekçesi ve negatif fixture'ıyla sorgulanmalı.

Vitrin build'i ortak public ağacını da taşır: 150 OGG 812.111 bayt, üç TTF
864.900 bayt, 136 SVG 184.921 bayt. JS/CSS gzip kapısı bu varlıkları ölçmez.
Bu dosyalar indirme/preload ve native paket boyutunda ayrıca görünür olmalı;
tümünün ilk kare öncesi indirildiği veya gereksiz olduğu gösterilmedi.

E2E tek başına 776,6 saniye sürdü. UI TODO'daki hızlı smoke/tam ui-check
ayrımı mevcut justfile'a henüz uygulanmadı; high hâlâ tam browser takımını
koşuyor. Bu kaliteyi düşürme gerekçesi değildir; geliştirici çevriminin gerçek
maliyetidir. Kapsamı kanıtlı ayırmak ile testi sessizce kaldırmak farklıdır.

### Güvenliğin gerçek kapsamı

Yerel audit ve gerçek lock zinciri üç JS advisory gösterdi:

| Paket / kurulu sürüm          | Seviye   | Doğrulanan karar                                                                                                                                    |
| ----------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| braces 3.0.3                  | High     | Audit önerisi 3.0.4 registry'de yok; GitHub kaydı patch yok diyor. Hayalî override yapılmaz. Sonra F10.1: yerel derinlik yaması ve kanıtlı istisna. |
| source-map-js 1.2.1           | High     | **Kapandı**: lock 1.2.2'ye güncellendi; `just fast` yeşil, audit'te yok.                                                                            |
| postcss-selector-parser 7.1.4 | Moderate | **Kapandı**: lock 7.1.6'ya güncellendi; `lint-css` yeşil, audit'te yok.                                                                             |

Kaynaklar: [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm),
[source-map-js advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q),
[selector-parser advisory](https://github.com/advisories/GHSA-rj75-hqrm-r3gf).
İlkinde audit'in patched alanıyla registry/primary kayıt çatışması ayrıca
çapraz denetlendi. Diğer ikisinde önerilen sürüm metadata sorgusunda mevcut.
Bu tur bağımlılık/lock değiştirilmedi; güncelleme yapılmış sayılmaz.

Görülen yollar Stylelint/Vite/PostCSS/Vitest araç zincirindedir. Advisory'nin
saldırgan girdisi şartı ile ürünün gerçek erişilebilirliği ayrılmalı;
bu rapor oyun içinde uzaktan sömürü kanıtı sunmaz. Güvenilir kaynakla
build-time CSS kullanımı selector advisory'sinin uzaktan istek senaryosu
değildir. Yine de mevcut güvenlik kapısı kırmızıdır; sonuç saklanmaz.

Rust 470 kilitli bağımlılığı taradı, exit 0 verdi; dokuz allowed warning
risksiz kabul değildir. glib 0.18.5'in
[VariantStrIter unsound advisory'si](https://rustsec.org/advisories/RUSTSEC-2024-0429)

> =0.20.0 düzeltmesini gösterir; Tauri/GTK zincirine tek sürüm override'ı
> uyum kanıtı olmaz. Yedi bakımsız crate ve bir yanked sürümün sahibi,
> hedef platform ve erişilebilirliği F10.1'de açık kalır.

## 7. Yüksek kapsamın kaçırdığı şey

| Paket       | Statement | Branch | Function |   Line |
| ----------- | --------: | -----: | -------: | -----: |
| CORE        |    %94,10 | %86,81 |   %94,98 | %95,93 |
| pen.dev     |      %100 |   %100 |     %100 |   %100 |
| tauri-v2 JS |    %97,40 | %92,97 |     %100 | %99,16 |
| Vitrin      |    %94,98 | %71,03 |   %87,70 | %95,62 |
| VOL.TEST    |    %98,78 | %94,26 |   %97,44 | %99,33 |
| Audio synth |    %96,10 | %89,12 |   %97,77 | %96,85 |

Tablo ilk tamamlanan high kapsamıdır; audio synth ayrı audit koşusudur (§17).
Denetim başlangıcında kusurların ilgili dar testleri de yeşildi: CORE 229, Pencil 27, audio protocol
30, native/oyun hizmetleri 101, oyun fizik/HUD 43. Bunlar benzersiz toplam
test sayısı değildir; bazı dosyalar tekrar koşuldu. Kanıt, mevcut testlerin
bu birleşimleri kaçırmasıdır. Yeni regresyonlar bu sınır çiftlerini kapatır;
yüzde tek başına doğruluk kanıtı sayılmaz. Aşağıdaki eski beklentiler bu teslimde düzeltildi.

- Doğru test, yanlış bağlantı: GameMeasurements fake reporter'la kayıp
  sayar; gerçek reporter hatayı yuttuğunda birleşim yanlış olur.
- Yanlış başarı beklentisi: temiz staging'in tamamı silinsin beklenir;
  ilgisiz dosya korunumu sözleşmede yoktur.
- Parite doğruluk sanılır: preview/runtime aynı yanlış duvar noktasında
  uzlaşır. Geometrik ilk temas için bağımsız oracle gerekir.
- Sıralı test yarış sanılır: restore/setSettings veya F11/destroy ayrı
  geçer; bekleyen iş sırasında kullanıcı/yaşam değişimi sınanmaz.

Çözüm genel timeout veya kapsam istisnası artırmak değildir. Gerçek
reporter/kabuk/tüketici bileşimi ve kritik sahiplik koşulunu kaldırınca
kırılan regresyon gerekir. Bütün kombinasyonları şişirmek yerine riskli
sınır çiftleri seçilmeli.

Headless testi DOM/CSS bağımsızlığını ve aynı seed'in son pozlarını
kanıtlar; bütün event/weather geçmişinin golden kilidi değildir.
CombinedLoad 36.000 adım, simüle edilmiş on dakika; gerçek cihaz soak veya
heap büyümesi ölçümü değildir. Scaling oranı mutlak kare süresi değildir.

## 8. Mimari borç ve karar

CORE mekanizma/sunum/tarif ayrımı korunmalı. Registry'deki 148 kaydın 61'i
tier-1, 87'si tier-2; katalog sahibi tüketicisiz API otomatik ölü kod
değildir. Katalogda görünmek de klavye/kol/dokunma/AT/lifetime kabulü değildir.

GameServices startup göçü ve shutdown flush'ını görünür kılan doğru
composition root oldu. Yeni servis eklendiğinde başlatma sırası ve kapanış
niyeti birlikte test edilmeli. Kayıt, ses, görüntü ve ölçüm aynı çıkışta yarışır.

Native kabuk app değildir; context/plugin/izin üründe yaşar. Android
orientation/haptics üçlü bağı ve Steam callback guard/pump/drop sahibi
mevcut. Windows/Android native sleep watcher bilinçli noop; görünürlük/
autosave Linux logind uyku bariyeri diye anlatılamaz.

İkincil borç: orientation applySaved açılış çağıranı yok; oyun sonradan
landscape uygular. Kullanılmayan setResolution yolu center iznine ihtiyaç
duyabilir; gerçek oyun tüketicisi olmadığından ürün kusuru diye yükseltilmedi.
Template'de tüketicisiz allow-close artığı mevcut ürün temizliğini izlememiş.
Bunlar F09.4 yeni oyun kabulünde ele alınmalı.

SpatialIndex refresh bütün iterable'ı tarar: O(N) kontrol + hücre değiştiren
öğeler kadar yapısal mutasyon. Yorum taramayı da ortadan kaldırmış gibi
anlatmamalı. Yeni algoritma hatası bulunmadı. Quadtree veya worker'a sırf
daha sofistike göründüğü için geçmek mevcut ölçümle desteklenmiyor.

## 9. Windows desteğinin dürüst durumu

**Windows'ta geliştirmeye devam etmek için temel sağlam.** Doctor bu tur
Node 22.23.1, pnpm 11.18.0, Rust/Cargo 1.99.0, gerçek MSVC link+run,
Git Bash/just/FFmpeg ve iki paketin Chromium/WebKit kurulumunu geçti.
Typecheck, lint, frontend build, Rust ve kapsam çalıştı.

Önceki native-store-tour gerçek Windows ürününde 15/15 kayıt/göç/bak/
karantina/kurtarma bildirimi/WM_CLOSE ve beş sert öldürme turunu kapsar.
Kaynak/test/yerel tur zinciri Fedora geçişinin yüzeysel yamadan ileri
gittiğini gösterir. Bu tur native store turu yeniden koşulmadı; bugünkü
B22 gibi yeni yarışların kabulü eski turdan türetilmez.

Eksik kabul: NSIS kurulum/kaldırma, DPI 125/150/200, WebView2 sunum,
OGG/clipboard/metin/gerçek kol ve paketli uzun oturum. Çalışan geliştirme
hostu tam ürün matrisinin kabulü değildir. Bugünkü kanıtlı günlük akış
engelleri belge contract ve vitrin bundle'dır; ortamı baştan kurmak veya
Linux'a geri dönmek için kanıt yok.

## 10. Deck ve Android: cihazla çapraz kontrol

Lenovo TB350FU / Android 14 erişilebilir. Güncel frontend build tablette
Chrome/CDP ile portre/yatay koşuldu: **6 + 6 = 12/12 PASS**. On dört
sekmenin çizimi, ≥12 px metin, taşma/hedefler, ekran klavyesi, katmanlar,
decode/play sayımı ve geri bildirim gecikmesi sınandı. Portre 856×1317
CSS px, DPR yaklaşık 1,402; kaba işaretçi, beş touch point.

40'ar otomatik dokunmada p95 portre 35,9 ms, yatay 44,6 ms. Bu rAF +
mesaj turudur; fiziksel parmak/panel fotonu değildir. Host'ta kapılar da
çalıştığından karşılaştırmalı performans profili sayılmaz. Ses bağlamı
48 kHz/running; fiziksel hoparlör çıkışı ölçülmedi. Yeni düğme ve mini
harita sistem screenshot'ında görüldü; kişisel tarayıcı çevresi depoya konulmadı.

Bu Android Chrome kabulüdür, native APK değildir. Bu tur ikinci Android
cihaz bağlı değildi; Samsung/Android 16 kabulü yenilenmedi.

Deck keşfi/SSH/gamescope screenshot çalıştı. SteamOS'ta VOL.UI/WebKit
süreci açıktı. Ekrandaki mevcut benchmark tablosu ortanca 36,5 FPS,
Buttons 30,5 FPS gösterdi. **Bu tur başlatılmış, commit/runtime/sınır ayarı
eşlenmiş yeni profil değildir.** Ne yeni regresyon ilan edilir ne eski
60 FPS kaydı bugüne otomatik PASS taşır. Karşıt ekran F08.2/F08.5 kanıt
zinciriyle sorgulanmalı; eşleştirilemeyen ölçüm destek ilanı taşıyamaz.

`093e4c8d` VOL.TEST host AppImage'ı on dakika çoklu tank/kar/yüksek kalite
ve OS düzeyinde sanal kolla 60 FPS medyan / p95 19 ms vermişti. 18 ms
hedefi 1 ms aşılıyor; F08.5 açık. Bu referans bugünkü zengin mini haritanın
performans kabulü değildir; sanal kol fiziksel Deck düğmesi değildir.

Platform belgesi WebKitGTK CPU boyama/kart bazlı katman terfisini ölçüyor;
motor kapsamı doğru daraltılmış. HOST ve SLR4 farklı. Gamescope 2D canvas
boşluğu/DMA-BUF karşıt koşulu gerçek açık risk; sonda WebGL başarısı tüm
canvas yüzeylerinin kabulü değildir.

**Deck mekanizmaları silinmesin; tam destek ilanı askıda kalsın.** Gerçek
Steam popup/overlay/kol/metin/haptik, uyku/uyanış ve SLR4 ürün turu eksik.
Workaround motor/runtime/karşıt ölçümle sınırlandırılmalı. Kaynak katmanını
baştan yazmak eksik kabulleri kendiliğinden çözmez. Android native Activity/
ActionMode/insets/geri/yön/arka plan/haptik F09.2'dedir; Android 14 Chrome
Android 16 büyük ekran yön politikasını doğrulamaz.

## 11. İnsan bekleyen kabul ve audio

<a id="audio-teknik-kabul"></a>

Zorunlu insan-pending yayın kapısı F01'de kaldırıldı. Teknik kabul PCM,
manifest, encode/decode, provenance ve bağımsız verify üzerindedir.
İsteğe bağlı beğeni teknik PASS değildir; görsel/etkileşim/haptik insan
değerlendirmesi ayrı ürün kabulüdür.

UI TODO'da UI-02.9/F07 için ses/görsel beğenisi isteğe bağlı tasarım
feedback'idir. Teknik kapanış insan kararı beklemez; fiziksel girdi ve
cihaz profili kabulü ayrı kanıt ister. Yapılmayan insan değerlendirmesi
yapılmış/PASS diye yazılmaz. Zorunlu human-pending blokajı geri getirilmez.

F05 gerçek hedef kilidi/rollback getirir: iki süreç tek hedefe yarışır,
kilitler sabit sırada alınır, PCM metadata doğrulanır. Bu tur temsilî steel
press ve aurum alert bağımsız render/decode/reencode ile identical verdi.
İki örnek bütün sesleri kabul etmez; tam audio sonucu §17'dedir.

UI sözlüğü 25 olay × iki palet × üç varyant = **150 OGG, toplam 812.111
bayt**. İlk 138 dosya 23 olaylık dilimdi; keyTap/keyDelete sonradan geldi.
Parite testi geçti. Dosya niteliği ile açılış jesti/preload/iptal/mute/duck/
tema/uyanış birleşiminin doğruluğu farklıdır; B24/B25 regresyonla kapandı,
bütün native ses kabulü bundan türetilmez.
Producer provenance'ı runtime bank'tan ayırmak gerçek JS tasarrufu sağladı.
Aktif job adayları sırf seçilmedi diye sahipsiz kalıntı değildir.

## 12. VOL.UI ve vitrin sonunda ne olacak?

VOL.UI ortak oyun arayüz seti; VOL.SHOWCASE onun vitrini ve kanıt
uygulamasıdır. Ayrı tank oyunu değildir. Oyun CORE'un aynı bileşenlerini,
native vitrin ortak kabuğu tüketir.

Bugün iki skin gerçek: default/Çelik ve aurum. Eski ember benzerliği
geride bırakıldı. Plaka/kuyu, bevel, başlık şeridi, selection/focus,
kürate ikon/imleç ve ses paleti kaynakta var. LoadingScreen ve mini harita
oyunda; HUD/kart ARIA ve klavye davranışı iyileşti. Tablet görüntüsü eski
düz katalogdan daha belirgin oyun dili taşıyor; bu kullanıcı beğenisi değildir.

14 sekme düğme/metin/panel/HUD/kart/form/çalışma alanı/palet/gelişmiş/
kaydırma/dokunma/yükleme/ses/kimliktir. Tema ve Metin Girişi laboratuvarları
henüz tamam değil. TEXT tipografi vitrini, IME/sağlayıcı oturum laboratuvarı değildir.

Kapanmış F07 teslimi şunları sağlamalı:

- Ailelerde ortak skin ve anlaşılır hover/press/focus/selected/disabled/
  loading/error/empty; malzeme tek başına bilgi taşımaz.
- Fare/klavye/kol/dokunma eşdeğerleri; hold/drag tek yol olmaz,
  pointercancel kabul sayılmaz, geç sonuç eski sahibine işlemez.
- Uzun etiket/sayı, TR/EN/RTL/font/density/scoped tema geçişinde taşmayan
  ve durumunu koruyan gerçek örnekler.
- Tek semantik ses/haptik; doğru restore/mute/preload/tema/uyanış; native
  IME ve OS seçim tutamakları gereksiz taklitle bozulmaz.
- Native vitrin, oyun tüketicisi ve iki browser motorunun aynı yüzeye
  bağlı kanıtı; cihaz/insan/NOT-RUN ayrı ve gerekçeli kabul.

Hedef tek bir son ekran değil, farklı oyunların kendi kuralını bağlayacağı
tutarlı UI sistemidir. Oyun durumu/sayıları UI'ın içine taşınmaz. Vitrin
gösterisi oyun ergonomisini otomatik kabul etmez. Güncel yerel UI TODO
48 açık / 25 kapalı; bu tamamlanma yüzdesi değildir. Bir görev tam aile
matrisi, diğeri tek altyapı işi olabilir. **F07 açık; yalnız polish kalmadı.**

## 13. Belge ve video ilkeleri

Başlangıçta 45 Markdown 6.855 satır; dokuz README 440 satır. README'ler
ilk denetimdeki 581 satırdan kısaldı. Yoğunluk UI TODO 730, UI CONTRACT
517 ve eski raporun biriken 1.107 satırındaydı; UI beş belge 1.765 satır.
Sözcük sayacı tablo ayraçlarını da sayar; kalite/okuma süresi çıkarılmadı.

Önceki rapor, [istenen videonun](https://www.youtube.com/watch?v=5LLLxHxkCnI)
altyazısının incelendiğini söylüyordu. Bu tur sayfa ve metadata alınabildi; altyazı
uçları HTTP 200 ile boş metin döndürdü. Transkript yeniden doğrulanmış
gibi sunulmuyor; bağlı tarayıcı kontrol yüzeyi de yoktu. Korunan somut
karar: kısa varsayılan agent bağlamı, ayrıntıyı gerektiğinde açma, tek
sözleşme sahibi, tarihçeyi git'e bırakma, sonucu kanıta bağlama. Video
bütün belgeleri silmenin veya kuralları prompt'a yığmanın gerekçesi değildir.

AGENTS 97, CLAUDE 11 satır; giriş sözleşmesi kısa. README amaç/başlangıç/
yön, DESIGN gerekçe, docs sözleşme, TODO iş/kapanış rolü korunmalı.
Bu rapor eski sonuçların sonuna yeni öyküler eklemek yerine bugünkü
hükmü başa, kapanışları tek yere taşıdı.

Doğrulanmış drift:

- Eski rapor Windows native IPC turunu yapılmamış gösteriyordu; gerçek
  15/15 tur TODO'da kapanmıştı. Bu raporda düzeltildi.
- Vitrin README amaç/başlangıç/yönlendirmeye kısaltıldı; native crate,
  Ses/Kimlik laboratuvarları mevcut diye anlatılır. DESIGN web/native
  ayrımını ve preview süreç sahibini açıklar.
- Oyun DESIGN headless kabulünü bugünkü Node testiyle anlatır; duvar
  ilk segment temas kuralı eklenmiştir. SpatialIndex açıklaması O(N)
  refresh taramasını açık söyler.
- Özel kanıt atfı temiz klonda zorunlu dosya bağlantısı yapılmaz;
  başlangıç kullanıcı değişiklikleri korunarak iki UI atfı düzeltildi.

## 14. Bütün Markdown'ın sahiplik kararı

Mevcut 45 kaynak belge aşağıdaki sahiplerde kapsandı. Tablo silme yapılmış
anlamına gelmez; gereksiz tekrar, gerçek sözleşmeyle aynı şey değildir.

| Belge/alan                               | Karar                       | Gerekçe                                                   |
| ---------------------------------------- | --------------------------- | --------------------------------------------------------- |
| Kök README / AGENTS / CLAUDE             | Koru                        | Giriş, repo değişmezleri ve araç farkı ayrılmış           |
| Kök TODO / bu rapor                      | Güncelle/sadeleştir         | İş ile güncel karar; tarihçe birikmez                     |
| CORE README / DESIGN                     | Koru                        | Kullanım girişi ve mekanizma/sunum gerekçesi              |
| CORE primitives / Phaser boundary / i18n | Koru                        | Gerçek alt yüzey/import/dil sözleşmesi                    |
| CORE music-engine / sfx                  | Koru                        | Farklı runtime API ve deterministik zaman                 |
| Cursor SOURCES / glyph SOURCES           | Koru                        | Kaynak/lisans/üretim zinciri                              |
| Icon SOURCES / CREDITS                   | Koru                        | Asset kökeni ve lisans; hukuk metni temizlik hedefi değil |
| Audio README / DESIGN / TODO             | Koru                        | Giriş, teknik kabul ve üretici işi ayrı                   |
| Deck README / DESIGN                     | Koru                        | Sonda araçtır; ürün desteği platform belgesinde           |
| Pencil README / DESIGN / AGENTS          | Koru; B21 düzeltildi        | Özel erişim ve staging sahipliği kaybolmaz                |
| Vitrin README / DESIGN                   | Düzeltildi/kısaltıldı       | Göç/native/Ses bugünü; cihaz/test günlüğü taşıma          |
| UI README                                | Koru                        | 21 satır, doğru yönlendirme                               |
| UI CONTRACT                              | Koru/ayırt et               | Tasarım preset'i ile zorunlu kabul ayrı                   |
| UI CATALOG                               | Koru                        | Sınıf/yardımcı/owner/registry yüzeyi                      |
| UI TODO                                  | Koru/kısalt                 | Durum/kalan/Kapanır; commit öyküsü ekleme                 |
| UI VERIFICATION                          | Koru/sadeleştir             | Tekrarlanabilir yöntem; özel ölçüm günlüğü değil          |
| Windows / Linux / Deck / Android         | Koru                        | Ayrı toolchain/runtime/ürün kabulü                        |
| gates / new-game                         | Koru                        | Kapı ve yeni ürün kabulünün tek rehberi                   |
| VOL.TEST README / DESIGN                 | Koru; headless durum güncel | Oyun başlangıcı ve karar; CORE doktrini tekrarı değil     |
| tauri-v2 README / DESIGN                 | Koru                        | Native library/app ve adapter sahipliği                   |
| Dört autogenerated permissions reference | Üreticisinden koru          | Elle kısaltma üreticiyle ayrışır                          |

Minimalleşme gerçek kabul bilgisini/açık işi silmek değildir. UI TODO her
göreve uygulama günlüğü ekleyerek büyüyor; mevcut durum, kalan iş ve kısa
Kapanır tutulmalı. Özel veri records alanında, kabul özeti owner belgesinde,
geçmiş git'te. Yeni dört doküman kategorisi dizini açmak zorunlu değil.

## 15. Taksonomi, kök ve kalıntı

Kök girdileri rootEntries bekçisinde gerekçeli. Cargo/pnpm kilidi,
workspace/lifecycle/quality, ortak TS/lint/format, lisans ve giriş belgeleri
kökte doğru. Görünüş için taşımak araç çözümlemesini/tek kaynağı bozabilir.
Yeni audit/results/plans kökü gerekmiyor.

core / tauri-v2 / games / devtools / scripts / docs ayrımı anlamlı. Ara
çıktı üreticide, gönderilen asset tüketicide; devtool oyun build'ine
taşınmamalı. Audio'nun 2.402 dosyası veri ağırlıklı; klasör derinliği tek
başına sahipliği iyileştirmez.

Gerçek artığı bilinçli katalogdan ayır: template allow-close ve bayat
metin düzeltilebilir; permission referansı, aktif job adayları ve registry
sahibi UI API'si topluca silinmez. Emekli audio job'ları/yerel vol-ui
göç artığı F05'te temizlenmişti. Fallow çıktısı inceleme kuyruğudur.
Bu tur kaynak/asset/kullanıcı staging'i silinmedi, davranış değiştirilmedi.
B21 çözümü sahip olunan kaynakla sınırlıdır; daha geniş recursive temizlik
eklemek için kanıt veya gereksinim yoktur.

## 16. Kalan iş sırası ve sahipler

| Sıra | İş            | Kapanış                                                                         |
| ---- | ------------- | ------------------------------------------------------------------------------- |
| 1    | F07           | Mevcut aile/davranış/görsel/native matrisi; B24–B26/B28 kaynak kusurları kapalı |
| 2    | F08 / F09     | Commit/runtime eşlenmiş Linux/Deck ve Windows/Android ürün kabulleri            |
| 3    | F10.3 / F10.6 | Ratchet/CSS kapsam gerekçesi ve ayrı dal bakımı                                 |

B21/B22/B23/B27/B29/B30 kök TODO Kapatılanlar'da, UI bulgularının
kaynak/regresyon durumu UI TODO sahibindedir. Teknik ölçüt insan beğenisi
beklemez; fiziksel girdi ve paket kabulü açıkça ayrı tutulur.

## 17. Bu oturumun kanıt kaydı

Yerel etiket **audit-20261008**. Doctor/high/contract, tekil kapılar, Fallow
JSON, graf update, kaynaklı tekrarlar, tablet iki yön turu, Deck erişim/
screenshot ve başlangıç hash'leri aynı git dışı audit alanındadır.

Tam E2E PASS: vitrin 294 PASS / 6 skip, oyun 33 PASS / 1 skip. Vitrindeki
iki skip isteğe bağlı baseline toplayıcısı, iki skip motora özgü trace
kalibrasyonu, iki skip bu Playwright WebKit derlemesinde Web Audio
olmamasıdır. Oyun WebKit ses testi aynı yetenek nedeniyle atlandı.
Dolayısıyla iki motorlu E2E başarısı WebKit OGG/native ses kabulünü kapatmaz.

Tam audio kapsamı PASS: 132 dosya / 2.257 test; 1.724,35 saniye.
Kapsam %96,10 statement / %89,12 branch / %97,77 function / %96,85 line;
audio coverage-shape de geçti. Timeout/eşik/skip gevşetilmedi.

Bağımsız audio verify PASS, 108,96 saniye: 219/219 production manifest,
203 identical / 16 encoder-only. PASS bütün kodlanmış dosyaların bayt
özdeşliği değildir; encoder-only PCM/ses değişimiyle ayrılır. Bağımsızlık
mevcut çıktıyı manifestten yeniden üretmektir, ayrı bir DSP uygulaması
değildir. İki arama doğrulaması, aile/bank/link ve müzik hizası kabulü; FFmpeg
referans karşılaştırması 5/5 tolerans içinde. Üç gönderilen ses ağacında
184 dosya, sıfır politika ihlali ve sıfır kırpılmış kanal örneği var.
CORE'un 150 dosyasında 16 tık adayı raporlandı; bunlar politika FAIL
değil, bu sayının sıfır veya insan dinlemesinin yapılmış olduğu söylenmez.
Üç audio ağacı diff'siz. Sıfır aktif paket reçete üreticisi koşuldu;
gömülü programın bağımsız manifest doğrulaması, çağrılmayan bir generator'ın
yeniden koşulmuş olduğu anlamına gelmez.

Düzeltme kaydı **fix-20261009**: her domain'in RED/GREEN logları,
bağımsız inceleme, final tam paket koşuları, kontrollü bundle probe'u ve
başlangıç diff'i git dışındaki records alanındadır. Bağımsız review iki
P2 ek açığı (geç mount, sayaçsız phase) buldu; kaynak ve yeni regresyonları
yeniden inceledi, başka somut engelleyici bulgu bildirmedi.
Çalışan eski kaynakla başlayan bir tam oyun koşusu son transport testinde
reddedildi; kaynak sabitlenip yeniden koşulunca 70 dosya/380 test geçti,
unhandled rejection yoktu. Eşzamanlı yükteki zaman aşımı sonrası vitrin
tek süreçte 18 dosya/117 test geçti; genel timeout/skip büyütülmedi.
İlk birleşik high PASS; log high-final kaydındadır. E2E: oyun
33 PASS/1 skip; vitrin 293 PASS, 1 flaky, 6 skip. WebKit kalibrasyonu
ilk örnekte separation −0,05 ms ile reddedildi, mevcut retry #1'de
3,42 ms ile geçti. Mevcut iki retry politikası değiştirilmedi. Bu
20 ms iş farkının bu motorda sayısal büyüklüğünü veya panel sunumunu
kanıtlamaz; ölçüm hassasiyeti F10.3'te açık izlenir. CORE son tam
takımı 201 dosya/2.807 test, oyun 70/380, vitrin 18/117 geçti.
Yerel Graphify update son kodla yapıldı; parser sınırlaması kaynak
typecheck kabulüyle karıştırılmadı. Eski tam audio ve cihaz kanıtları
yukarıda ayrı belirtilir; yeni kaynak için tekrar sayılmaz.
Başlangıçtaki kullanıcı değişiklikleri korunur; UI TODO/VERIFICATION'ın
iki özel yolu ve zorunlu beğeni ifadeleri aynı niyet korunarak düzeltildi.

Bu tur Windows installer/native-store turu, Steam SDK ignore testi,
fiziksel Deck girdisi/uyku/haptik, yeni SLR4 paket, Android native APK,
Samsung/Android 16 kabulü yeniden yapılmadı. Bağlı cihaz kurulu paketin
bugünkü commit olduğunu kanıtlamaz; açık görevler sürer.

## 18. F01–F03 uygulama durumu

Başlık eski Windows belge bağlantısını korur. F01 zorunlu insan ses
kabulünü kaldırdı ve teknik şema/testi bağladı. F02 Windows süreç/yol/disk/
doctor/kapsam zeminini düzeltti. F03 README/agent rolünü ve belge yolu/
komut/gate denetimini kurdu; belgeler birleştirildi/minimalleşti.
Bu teslimler gerçek; semantik bayatlık yol testinden türetilemez. Yerel
kanıt atfı sorunu F10.8 ile kapandı. İnsan-pending yayın kapısı geri getirilmedi.

## 19. F04 uygulama durumu

B01/B02/B03 düzeltmeleri mevcut: reddedilen yazım flush/ACK'ye ulaşır;
geç load/destroy/abort eski kaynak açmaz; metin oturumu eski sahibine geç
commit yapmaz. Steam handle'ları session'da; drop pump'ı durdurur/join eder.

F04.3 Windows native 15/15 turuyla, F04.5 tüketicisiz mevcut ürün
allow-close izninin kaldırılmasıyla kapandı. Eski otomatik onay redi
bugünkü kabulün yerine yazılmaz. F04.4 fiziksel Steam popup/overlay/drop
ve Deck SIGTERM timeout gerekçesiyle açık. B22 F04.6 ile kapandı;
bekleyen native niyet ve kalıcı son snapshot gerçek bileşimde sınanır.

## 20. F05–F06 uygulama durumu

F05 hedef kilidi/PCM metadata/rollback/emekli job temizliği gerçek ve
testli. B21, Pencil başarısının plan dışı kaynağı koruma boyutunu kaçırdı;
F05.7 gerçek disk regresyonu ve manifest-only tüketimle kapandı.
Önceki rollback ilerlemesi korunur.

F06.1 segment–OBB ilk araç teması, F06.2 duvarın son söz olduğu sınırlı
çözüm ve F06.3 DOM'suz alt yüzey gerçek. Yığın testi kalan örtüşmeyi 0,5
altında sınar; kayıttaki yaklaşık 0,05 assertion değildir. Hareketli
hedefin tam sürekli CCD'si vaat edilmez. F06.4 `093e4c8d` cihaz referansı
gerçek; p95 19 ms F08.5'e devredildi. B27 F06.5 ilk duvar temasının
regresyonlarıyla kapandı; bütün güncel cihaz kabulü bundan türetilmez.

### İlk denetimin B01–B20 hükümleri

| Bulgu                    | Bugünkü durum                               | Sahip         |
| ------------------------ | ------------------------------------------- | ------------- |
| B01 flush reddi          | Kaynak/regresyon kapalı; B22 ayrı niyet     | F04.1 / F04.6 |
| B02 geç load             | Kaynak/regresyon kapalı                     | F04.2         |
| B03 geç metin            | Kaynak/regresyon kapalı; native matris ayrı | F04.2 / UI-11 |
| B04 yayın yarışı         | Gerçek iki süreç/target kilidi kapalı       | F05.1         |
| B05 PCM identical        | Metadata/bağımsız verify düzeltildi         | F05.2         |
| B06 insan kabulü kimliği | Zorunlu kapı kaldırıldı                     | F01           |
| B07 callback guard       | Kaynak sahibi düzeldi; fiziksel kabul açık  | F04.4 / F08.6 |
| B08 okunamayan ELF       | Açık fail-closed paketleme                  | F08.1         |
| B09 sanitizer            | Açık; B23 farklı reporter kaybı             | F08.2 / F08.7 |
| B10 runtime etiketi      | Host/SLR4 eşli kabul açık                   | F08.2         |
| B11 yarım Pencil         | Plan/rollback düzeldi; B21 ayrı kayıp       | F05.3 / F05.7 |
| B12 doctor link          | Gerçek prob ve bu tur PASS                  | F02.1         |
| B13 disk fixture         | Windows/Linux sözleşmesi düzeldi            | F02.3         |
| B14 süreç shim           | Native argv adaptörü düzeldi                | F02.2         |
| B15 URL/separator        | Gerçek disk/yol regresyonu düzeldi          | F02.3         |
| B16 shell argv           | Süreç sözleşmesi düzeldi                    | F02.2         |
| B17 araç köşesi          | OBB ilk temas düzeldi                       | F06.1         |
| B18 dünya sınırı         | Sınırlı duvar son çözümü düzeldi            | F06.2         |
| B19 DOM headless         | Ayrı Node kabulü geçti                      | F06.3         |
| B20 emekli job           | Eski yayın işleri temizlendi                | F05.5         |

## 21. Teslim kararı

Windows çalışma zemini ve mekanizma mimarisi korunmalı; UI kimliği,
native kabuk ve gerçek tüketim yatırımı sürmeli. İlerleme yüzeysel değil;
yeni kodu sırf hızlı yazıldı diye çöpe atmak doğru karar olmaz.

On kaynak kusuru çözüldü; güvenlik ve cihaz kimliği/kabulü kalan önceliktir. F07 bitmiş, Deck sorunsuz, bütün ses/erişilebilirlik kabulü
verilmiş veya signoff yeşil demek kanıta aykırı. Riskin adı/sahibi/Kapanır
ölçütü var; çözüm daha uzun TODO değil, bu ölçütleri uygulamaktır.

## 22. Kapı turu: taze ölçüm, çapraz sorgu ve tersine mühendislik (2026-10-11)

Bu bölüm bir uygulama turu değildir: bütün kapılar taze koşuldu, kapıların kendisi bilerek kusur eklenerek
sorgulandı ve koşucu kaynaktan okundu. Düzeltmeler yazılmadı; bulgular [TODO F11](../TODO.md) iş listesine
bağlandı. Ağaç `feature/core-hardening` @ `86c21077`, Windows 11, 8 mantıksal çekirdek, ön yük %7–%11,
`pnpm <kapı> --fresh` (makbuzsuz). Kullanıcı değişiklikleri korundu; negatif kontroller her seferinde geri alındı
(`git status` temiz).

### 22.1 Kapı süreleri ve sonuçları

| Kapı         | Süre (taze)        | Sonuç     | Not                                                                                                                |
| ------------ | ------------------ | --------- | ------------------------------------------------------------------------------------------------------------------ |
| `quick`      | 87,8 sn            | geçti     | `contract` 85,7 · `format-check` 82,7 · `lint` 81,3 · `typecheck` 59,0 · `lint-css` 51,4 sn                        |
| `fast`       | 359,8 sn (6,0 dk)  | geçti     | `quick` + `test` 271,8 sn (audio-synth 148,5 · core 67,3 · VOL.TEST 29,4 · vitrin 18,5)                            |
| `high`       | 281,7 sn (4,7 dk)  | geçti     | statik dalga 84,8 + build 3,8 + bundle 1,3 + scaling 3,5 + audio-test 6,3 + rust 37,2 + coverage 139,7 + shape 1,2 |
| `signoff` #1 | 1.624 sn (27,1 dk) | **DÜŞTÜ** | `e2e` 1.354,8 sn'de WebKit ana şeritte 1 test (`dialogPatterns`); koşucu orada durdu                               |
| `signoff` #2 | 1.837 sn (30,6 dk) | **DÜŞTÜ** | `e2e` 1.576,7 sn'de WebKit sessiz şeritte 1 test (`motionMeasure`); koşucu orada durdu                             |

`signoff`un koşulmayan dört aşaması ayrı ayrı koşuldu (kapı kararı yerine geçmez, aşama kanıtıdır):
`coverage-audio` 547 sn **geçti** (satır %96,86 · dal %89,1 · işlev %97,77 · ifade %96,1), `audio-verify` 101 sn
geçti, `security-js` 3 sn geçti, `security-rust` 4 sn geçti. VOL.TEST `e2e` birimi ilk `signoff`ta koşmadı
(vitrin birimi düşünce durdu); ikinci `signoff`ta da koşmadı. İkinci koşunun statik aşamaları (`contract` 79,5 ·
`format` 78,2 · `typecheck` 58,6 · `lint` 79,2 · `lint-css` 51,5 · `rust` 32,5 · `coverage` 127,6 sn) geçti; son dört
aşama o koşuda tekrar edilmedi. **İki taze `signoff` koşusunun ikisi de düştü (0/2 yeşil).**

**Düşen testler (iki ayrı koşu, iki ayrı test, ikisi de WebKit):**

1. #1 — `dialogPatterns.spec.ts:116` (ana şerit): `Cancel` tıklaması 60 sn bekledi; Playwright günlüğü
   "`.vol-showcase-card__body` işaretçiyi örtüyor", "öğe kararsız", "DOM'dan ayrıldı" der. Aynı dosya
   `--repeat-each=5` ile iki motorda 50/50 geçti; yani kalıcı değil yük altında aralıklı (ana şerit: iki motor
   eşzamanlı, motor başına 2 işçi).
2. #2 — `motionMeasure.spec.ts:124` flaş sınırı, azaltılmış hareket kapalı (sessiz şerit, tek işçi, ön yük %4):
   120 art arda `click()` döngüsü 60 sn'yi aştı (`locator.click` zaman aşımı, satır 142). Aynı test WebKit'te
   birinci koşuda 33,8 / 30,2 sn, ikincide >60 sn / 53,0 sn; Chromium 15,5 / 11,1 sn → 21,2 / 17,4 sn. Yük
   değil testin kendi bütçesi sınırda: koşular arası ~2 kat sapma, 60 sn'nin %50–100'ü.

İki durumda da kök neden bilinmiyor; test-results/trace bir sonraki e2e koşusunda silindiği için sonradan
incelenemez. Retry/zaman aşımı büyütme ile saklanmadı: F11.1 açık.

### 22.2 Test envanteri (bu turda sayılan)

| Katman                    | Dosya |      Test | Süre / not                                                                                 |
| ------------------------- | ----: | --------: | ------------------------------------------------------------------------------------------ |
| core (vitest, jsdom)      |   250 |     3.405 | 67 sn; ortam kurulumu 287 işçi-sn, testler 36 işçi-sn                                      |
| audio-synth (vitest)      |   132 |     2.264 | 148 sn (işçi sınırı 4)                                                                     |
| VOL.TEST (vitest)         |    70 |       385 | 42 sn; ortam 105 işçi-sn, testler 38 işçi-sn                                               |
| tauri-v2 (vitest)         |    21 |       188 | 4 sn                                                                                       |
| vitrin (vitest)           |    24 |       171 | 31 sn                                                                                      |
| pen.dev / deck (vitest)   |   2/2 |     48/23 | 3 sn / 0,5 sn                                                                              |
| bekçi/betik (`node:test`) |     — |       561 | 559 geçti, 2 atlama; + workspace sözleşmesi                                                |
| vitrin e2e                |     — |     1.033 | Chromium 541 · WebKit 492 (piksel yalnız Chromium); 1.013 koştu, 20 atlandı; 4.076 işçi-sn |
| Rust                      |     — | ölçülmedi | `rust` aşaması geçti; test sayısı bu turda kaydedilmedi                                    |

En ağır e2e spec'leri (iki motor, işçi-sn): themeMatrix 297, accessibility 270, layout 257, pseudoLocale 252,
materialBudget 216 (106 test), focusVisible 213, finalContrast 211, stress 188, formAcceptance 162.

### 22.3 Negatif kontrol: kapı gerçekten kırılıyor mu?

Yöntem: tek bir kusur ekle, `node scripts/quality/gate.mjs quick --json` koş, kusuru geri al. Makbuz önbelleği
açıktı (yalnız etkilenen birimler koştu).

| Kusur                                         | Beklenen aşama | Sonuç                                                        |
| --------------------------------------------- | -------------- | ------------------------------------------------------------ |
| `const x: number = 'x'` (CORE)                | typecheck      | düştü: core, tauri-v2, vitrin, VOL.TEST (bağımlılar)         |
| `Promise.resolve(1);` (no-floating-promises)  | lint           | düştü: core                                                  |
| kötü biçimli Markdown maddesi                 | format-check   | düştü (36 sn; sibling birimler kesildi)                      |
| CSS `.BadClassName`                           | lint-css       | düştü                                                        |
| 1001 satırlık izlenen dosya                   | contract       | düştü                                                        |
| 1001 satırlık **izlenmeyen** dosya            | contract       | düştü (bekçi izlenmeyeni de görür)                           |
| CORE'dan `@volstudio/vol-test` import         | contract       | düştü (katman) + typecheck                                   |
| kodlanmış görünen metin (`textContent = '…'`) | contract       | düştü                                                        |
| kırık göreli belge bağlantısı                 | contract       | düştü                                                        |
| tarihçe yorumu ("eskiden", "bir dönem")       | contract       | düştü                                                        |
| CORE kapsam eşiğini 90 → 60 düşürmek          | (geçmemeli)    | **GEÇTİ**: eşik düşürme denetlenmez, taban 50                |
| kısmi sahneleme: indeks kusurlu, ağaç temiz   | (geçmemeli)    | **GEÇTİ**: `quick` exit 0; indeks içeriği Prettier'dan düştü |

İkisi gerçek boşluktur (F11.4, F11.7). Üç not: (1) bir dalgada bir birim düşünce kardeş birimler kesilir; JSON
bunları "düşen" gibi gösterir, ilk düşeni ayırmak gerekir; (2) `contract` bekçilerinin hangisinin düştüğü
`quick`in JSON'unda değil günlüktedir; (3) bu tur yalnız `quick` aşamalarını negatif sınadı: `coverage`, `e2e`,
`bundle`, `scaling` ve güvenlik kapıları için negatif kontrol bu turda YOK (`determinism.spec.ts` piksel kapısının
kararlılığını sınar; kasıtlı CSS kusuruyla bu turda denenmedi).

### 22.4 Koşucunun tersine mühendisliği

Bu maddeler 2026-10-11 ilk denetim anındaki kaynak davranışını anlatır; sonraki
F11.2 kısmi değişiminin güncel durumu bölüm sonundadır.

- **Makbuz anahtarı** (`gateCache.mjs`): çalışma ağacındaki izlenen+izlenmeyen dosyaların içerik karması + Node
  sürümü + platform (`rust` için `rustc`/`cargo`, `audio-test` için git-farkı planı). Bağımlılık içeriği
  `node_modules`tan değil `pnpm-lock.yaml`dan gelir; elle bozulmuş kurulu paket anahtarı değiştirmez. Makbuz
  imzasızdır (düz JSON, git dışı önbellek dizini): yalnız atlama içindir, sahte geçiş üretemez ama elle yazılabilir;
  `signoff` makbuza güvenmez. Ajan makbuz yazmaz.
- **Plan** (`gatePlan.mjs`): `build`/`bundle`/`scaling`/`node-pin`/güvenlik aşamaları her zaman koşar; `coverage`
  `code` kapsamlıdır, `audio-test` git-farkı (`@{upstream}`, yoksa `origin/dev`, yoksa tam takım) ile alt küme seçer.
  `audio-test` alt kümesi tam takımın yerini tutmaz: audio-synth'in tam takımı yalnız `signoff`ta (`coverage-audio`).
- **Kancalar:** `pre-commit` → `pnpm quick`, `pre-push` → `pnpm high`; ikisi de `SKIP_SIMPLE_GIT_HOOKS=1` ile atlanır
  (simple-git-hooks kabuk betiği). Sunucu tarafı denetim yoktur (bulut CI yok kararı). Yerel kanıt, kullanıcının
  kancayı atlamamasına dayanır; `signoff`un son yeşil koşusunun kaydı yoktur.
- **e2e koşucusu** (`devtools/vol-showcase/scripts/e2e.mjs`): `reuseExistingServer: false` (eski sunucu yanlış
  geçiş üretmez); iki şerit; `forbidOnly`; yeniden deneme (`retries`) yok; ama test/atlama/flaky sayısı kapı
  çıktısına girmez, atlama ratchet'i yoktur.
- **Çıktı bütünlüğü:** `--json` yalnız koşan aşamaları listeler; düşen Playwright testi `unknown` sınıflanır ve
  adı JSON'da yoktur; düşen testin izi sonraki e2e koşusunda silinir.
- **Kapsam dışlaması:** altı paketin (core, vitrin, VOL.TEST, audio-synth, tauri-v2, pen.dev) `coverage.exclude`ı `src/**/index.ts`i toptan dışlar; audio-synth'te iki
  `index.ts` çalıştırılabilir mantık taşır (`findPresets` 6 dal, `getPreset`). `scripts/quality` kapsamı hiç
  ölçülmez.

### 22.5 Eşik boşluğu ve platform bayatlığı

| Paket       | Satır ölçülen/eşik | İşlev ölçülen/eşik | Dal ölçülen/eşik | Not                               |
| ----------- | ------------------ | ------------------ | ---------------- | --------------------------------- |
| CORE        | %96,6 / 90         | %95,7 / 91         | %88,0 / 84       | satır payı ≈1.230 kapsamsız satır |
| vitrin      | %95,2 / 94         | %88,5 / 83         | %72,4 / 58       | dal payı 14 puan                  |
| VOL.TEST    | %99,3 / 96         | %97,5 / 95         | %94,3 / 90       |                                   |
| tauri-v2    | %99,3 / 93         | %100 / 100         | %93,5 / 90       |                                   |
| pen.dev     | %100 / 97          | %100 / 100         | %97,8 / 94       | tek kaynak dosyası                |
| audio-synth | %96,86 / 95        | %97,77 / 95        | %89,1 / 88       | tek sıkı paket (pay 1–3 puan)     |

Sözleşme "ölçülen değerin ~2 puan altı" der; CORE ve vitrin bunun çok üstünde gevşektir. Piksel temeli: 51
`chromium-win32` ve 12 `chromium-linux` (2026-10-06, UI-08.x'ten önce): Linux kümesi bayat/eksiktir.

### 22.6 Karar ve sınırlar

1. **`signoff` bugün güvenle yeşil çıkarılamıyor** (iki taze koşuda 0/2): düşen testler iki ayrı WebKit zamanlama
   testidir; kök neden bilinmediği için bunun kod kusuru mu ölçüm kusuru mu olduğu da söylenemez. F11.1/F11.2'de açık.
   Taze `quick`/`fast`/`high` yeşil; `high` pre-push'ta 4,7 dk'dır, belgedeki 13,4 dk bayattı.
2. En büyük güvence boşlukları (öncelik sırasıyla): koşulmayan aşamanın JSON'da görünmemesi, kısmi sahneleme,
   düşürülebilir kapsam eşiği, kapıların kendisinin kapsamsızlığı, WebKit atlamaları.
3. Bu turda **ölçülmeyen** şeyler: Rust test sayısı, soğuk Rust derlemesi, audio-test tam takımı, `bundle`/`scaling`
   negatif kontrolü, e2e'nin tam negatif kontrolü, başka makine/OS. Hiçbiri başarılı sayılmaz.
4. Hiçbir eşik, timeout, atlama ya da kapı gevşetilmedi; kapı kodu değiştirilmedi.

**§22 sonrası F11.2 kısmi düzeltmesi (2026-10-11):** Koşucu artık erken düşüşten
sonra yürütülmeyen aşamaları ve bekleyen birimleri JSON'da `notRun` olarak listeler
(`gateRunner.mjs`, `gateRunner.test.mjs`). Playwright liste çıktısının test dosyası/satırı/başlığı
ve hata sebebi `report.mjs` ile ayrıştırılır (sentetik fixture testi). Yukarıdaki iki `signoff`
sonucu tarihsel kanıttır; gerçek Playwright düşüşüyle doğrulama aşağıdaki üçüncü
turda yapıldı. İz saklama ve tam yeşil `signoff` hâlâ açık ([F11.2](../TODO.md)).

## 23. Sonraki `signoff` düşüşü ve F11.2 gerçek çıktı doğrulaması (2026-10-11)

Önceki §22 ölçümleri korunur; sonraki taze turda `fast` ve `high` PASS
durumunu sürdürdü, ancak **`signoff` 36,2 dakikada yine DÜŞTÜ**. Önceki iki
`signoff` (27,1 ve 30,6 dk) ile birlikte sonuç **0/3 yeşil**; sürüm kapısı açık.
Üçüncü turun vitrin E2E ana WebKit şeridinde **447 geçen, 16 atlanan, 1 düşen**
test vardı. Chromium ana şeridi ve iki motorun sessiz şeridi geçti;
VOL.TEST E2E birimi vitrindeki düşüşün ardından koşmadı.

Başarısız test `devtools/vol-showcase/tests/e2e/hudStates.spec.ts:248:3` içindeki
**XPBar çoklu seviye / +2.000 XP** akışıdır. Oyun düzeyi ve çubuk değerleri
(`aria-valuemax=325`, `aria-valuenow=125`, `Lv. 11`) beklentileri geçti.
`hudStates.spec.ts:259` satırında `expect(locator).toHaveClass(expected) failed`:
`locator('.vol-xp-bar').first()` 15 saniye boyunca
`/vol-xp-bar--level-up/` sınıfını taşımadı (gerçek sınıflar
`vol-bar vol-bar--cooldown vol-xp-bar`). Geçici vurgu davranışı ile testin
gözlem anından hangisinin kusurlu olduğu henüz kanıtlanmadı; F11.1 açık.
İlk iki turun `dialogPatterns` / `motionMeasure` bulguları ayrı tarihsel kanıttır.

**F11.2 kısmi doğrulaması:** Bu üçüncü gerçek hata, raporda `kind: test`
ve `reason: expect(locator).toHaveClass(expected) failed` olarak
sınıflandırıldı. Koşucunun JSON sonucu `coverage-audio`, `audio-verify`,
`security-js`, `security-rust` aşamalarını **`notRun`** gösterdi.
Bu dört aşamanın §22'deki bağımsız PASS kayıtları üçüncü tur için
PASS sayılmaz. Kapı önbelleğindeki `last-failure.log` ile
Playwright `test-results` izi yerel/geçicidir; sonraki koşuyla silinebilir,
kalıcı arşiv kanıtı henüz yoktur. `signoff` ve F11.1/F11.2 **AÇIK**.

## 24. XPBar hedefli regresyonu ve E2E hata kanıtının ayrılması (2026-10-11)

Bu bölüm **§23'teki başarısız `signoff` sonucunu değiştirmez**. Üç tam
`signoff` denemesi de düşmüştür (0/3 yeşil); `fast`/`high` PASS kalır.
Henüz düzeltmelerden sonra tam bir yeşil `signoff` yoktur; F11.1 kapanışı için
**üç art arda yeşil tam koşu** gerekir.

**F11.1, hedefli XPBar sınaması — KISMİ:** `hudStates.spec.ts` geçici
`vol-xp-bar--level-up` sınıfını, Playwright `click()` çağrısı döndükten
sonra arıyordu. Gerçek sınıfın ömrü 600 ms olduğu için gözlem anında kaybolması
testin hatalı negatif üretmesine yol açabiliyordu. Prime, tıklamadan **önce**
`MutationObserver` kaydı kurarak sınıf geçişini ve o andaki
`animationName`/`boxShadow` kanıtını tutan test sondası ekledi; normal
ve hareket azaltılmış XPBar testleri bu kanıta bakar. Hedefli tekrarlar
**WebKit 6/6 PASS ve Chromium 6/6 PASS**. Üretim XPBar davranışında kanıtlanmış
bir düzeltme iddiası yoktur; önceki `dialogPatterns` ve `motionMeasure`
WebKit düşüşlerinin kök nedeni bu hedefli sonuçla çözülmüş sayılmaz.

**F11.2, yerel hata arşivi — KISMİ:** Worker-2, vitrin E2E çalıştırıcısında
her motor/şeridi ayrı `outputDir` ve Playwright JSON raporuyla ayırdı.
Başarısız motor/şeridin `error-context.json` ve varsa `trace.zip` /
`report.json` dosyaları git dışı kalite önbelleğindeki hata arşivine
taşınır; başarılı koşunun kendi geçici çıktısı silinir. **Zorlanmış
başarısızlıkla her iki motorda** üç dosya türü doğrulandı ve daha sonraki
başarılı koşunun eski hata arşivini silmediği sınandı. Budama
**yeni E2E başlangıcında 14 gün / 10 önceki hata koşusu** üzerinden
yapılır; o sürümde yeni düşüş bu sınırı bir sonraki başlangıca kadar
aşabiliyordu (**daha sonraki koşu sonu budama düzeltmesi ve otomatik
regresyonu §25'tedir**). Bu yerel kanıt, uzak/değişmez kayıt
ya da üçüncü tam `signoff`un geriye dönük kurtarılmış izi değildir.
`report.mjs`nin üçüncü gerçek turdaki `kind: test` sınıflandırması ve
dört `notRun` aşama kanıtı §23'teki gibi geçerlidir. Yeni arşivin bir
sonraki gerçek tam düşüşle uçtan uca doğrulanması ve F11.2 kapanış şartları
**açıktır**.

**Android cihaz turu (2026-10-11, F09.2 KISMİ):** Önce Lenovo Android 14 ve
Samsung Android 16'da 2026-10-08 tarihli eski APK ile görünür smoke yapıldı;
bu kaynak kabulü değildir. Ardından mevcut çalışma ağacından `aarch64`
Tauri debug APK/AAB üretildi ve aynı APK iki cihaza `adb install -r` ile
başarıyla kuruldu. Lenovo'nun yeni APK'sı önde çalışan `MainActivity` olarak
göründü; sistem screenshot'ı oyun, HUD, joystick ve minimap'i çizdi. Samsung'da
yeni APK kuruldu ve süreç başladı, fakat ilk siyah screenshot sırasında güç
durumu `Dozing`, odak `NotificationShade` idi; uyandırınca güvenli kilit
ekranı `Bouncer` oldu. Bu görüntü **WebView siyah ekran kusuru kanıtı değildir**;
Samsung yeni APK'nın görünür oyun paneli kabulü **NOT-RUN**. Her iki cihazın
yeniden açılma, geri/yön/arka plan, titreşim ve uzun oturum kabulü ile APK'nın
sonraki git commit'ine bağlanması açık kalır. F09.2 tamamlanmadı.

## 25. Üç ardışık tam `signoff` PASS — performans düzeltmesinden önce (2026-10-11)

**Yeni doğrulama (önceki başarısızlıklar silinmez):** §22–23'te sırasıyla
27,1, 30,6 ve 36,2 dk sonunda düşen ilk üç tam `signoff` koşusu, o
anların gerçek FAIL kanıtıdır. Ardından **aynı performans değişikliği
öncesi çalışma ağacında** üç tam `signoff` art arda **PASS** oldu:

| Yeşil seri | Süre    | Tam kapı kararı | E2E ve sonraki aşamalar                                 |
| ---------- | ------- | --------------- | ------------------------------------------------------- |
| #1         | 48,4 dk | **PASS**        | Tam `signoff` geçti                                     |
| #2         | 47,0 dk | **PASS**        | Tam `signoff` geçti                                     |
| #3         | 48,1 dk | **18/18 PASS**  | Vitrin/VOL.TEST E2E ve E2E sonrası dört aşama yürütüldü |

Son koşuda yalnız `high` ya da seçili vitrin testleri değil, **tam birleşik
kapı** geçmiştir. İlk başarısız seride vitrin E2E'den sonra
`notRun` kalan `coverage-audio`, `audio-verify`, `security-js`,
`security-rust` aşamaları bu başarılı seride gerçekten çalıştırıldı ve
geçti. VOL.TEST E2E artık “ölçülmedi/hiç koşmadı” değildir: üç tam
başarılı koşunun parçası olarak **PASS**; bu kayıtta ayrı aşama süresi
raporlanmadığı için süre uydurulmadı. Üçüncü koşunun **18/18**
sayısı yalnız o koşunun teyit edilmiş raporuna aittir. Önceki 0/3
başarısız dizi ile sonraki 3/3 başarılı dizi farklı tarihsel gözlemlerdir.

**F11.1 AÇIK — üç PASS yeterli kapanış kanıtı değildir.** Geçici 600 ms
XPBar vurgusunun tıklama öncesi `MutationObserver` ile izlenmesi,
`dialogPatterns`teki beklerken iptal ve `motionMeasure`deki flaş
istek serisinin sayfa içi `element.click()` ile sürülmesinden sonra
tam koşular geçti; ancak son iki akış eski Playwright gerçek pointer
hit-testing/actionability yolunu birebir sınamaz. İlk hata için
örtme/odak/DOM kararsızlığının, ikinci için tıklama başına WebKit
maliyetinin kök nedeni ve bağımsız gerçek işaretçi/karşıt regresyon
kanıtı tamamlanmadan F11.1 kapanmaz. Süre uzatma veya test atlama ile
PASS üretilmediği, eksik gerçek işaretçi testinin otomatik tamamlandığı
anlamına gelmez.

**F11.2 AÇIK — otomatik arşiv regresyonu artık VAR; gerçek tam kapı
entegrasyonu açık.** Erken düşüşte `notRun` ve gerçek Playwright
`kind: test` sınıflandırması önceki başarısız koşuda, yerel
motor/şerit iz arşivi elle zorlanmış hata denemesinde görüldü
(§23–24). **2026-10-11'de worker-2 RED→GREEN** hata-arşivi
regresyonunu ekledi:
`scripts/quality/tests/e2eArchive.test.mjs` **5/5 PASS**;
`scripts/quality/tests/e2eConfig.test.mjs` **3/3 PASS**.
Tarayıcı/Vite başlatmadan gerçek Node alt süreçlerinde sahte Playwright
CLI çalıştırılarak şunlar sınandı:

- Chromium/WebKit seçili başarısızlıklarında `trace.zip`,
  `error-context.json`, `report.json` ve JSON ek dosyalarının
  taşınmış arşiv yoluna yeniden bağlanması;
- ana şerit düşerken diğer motorun ve her iki sessiz şeridin
  çalışmaya devam etmesi, başarılı şeridin geçici çıktısının silinmesi;
- rapor üretilemeyen hata durumunda raporun bulunmadığının doğru
  kaydedilip mevcut trace'in korunması;
- sonraki başarılı koşunun önceki hata kanıtını silmemesi;
- **14 gün/10 hata koşusu**, 2 günlük scratch budaması ve özellikle
  **tam 10 mevcut hata koşusundan sonra 11. başarısızlığın** sınırı
  aşmaması.

Son madde gerçek kusuru yakaladı: yalnız başlangıçta budamak, yeni
başarısızlık geldiğinde 11 hata koşusu bırakıyordu. `e2e.mjs` artık
başlangıçta **ve tüm motor/şeritler bittiğinde** yeniden budar;
regresyonla onaylandı. **Bu, tarayıcısız alt süreç entegrasyon
kanıtıdır; gerçek Playwright/Vite ile tam `signoff` başarısızlığı
değildir.** Arşiv git dışı/yereldir, değişmez veya merkezi kayıt
değildir; `last-failure.log` ayrı/geçicidir.
**Açık tek F11.2 entegrasyon ölçütü:** güncel kodla gerçek tam
`signoff` hata yolunda Playwright trace/raporunun kapı JSON
`notRun`/hata sınıflandırmasına kadar bağlandığının uçtan uca
gösterilmesi. Ayrıca bu yeni arşiv ve performans değişikliklerinden
**sonra taze tam `signoff`** henüz yoktur. Önceki
48,4 / 47,0 / 48,1 dk'lık üç yeşil tam koşu bu değişikliklerden
**öncedir**; onlara sonradan kapsam atfedilemez.

**F10.13 AÇIK — performans kabul edilmedi.** Başarılı tam kapıların
**48,4 / 47,0 / 48,1 dk** sürmesi ve vitrin E2E'nin yaklaşık
**24–26 dk** sürmeye devam etmesi, belgelenen **10 dk E2E tetik
eşiğinin** çok üzerindedir. Önceki 343 sn bütçe güncel değildir.
`e2e`yi `high` pre-push'tan `signoff`a almak push gecikmesini
azalttı; **E2E yürütme maliyetini azaltmadı**. Kritik spec/motor
profiline dayalı optimizasyon ve karşılaştırılabilir önce/sonra
ölçümü gereklidir. Bu üç PASS **performans değişikliği öncesi**
ağaca aittir; daha sonra yapılacak optimizasyon için yeni tam
`signoff` çalıştırılmış veya onaylanmış sayılmaz.

**F10.13 — ilk hedefli optimizasyon ölçümü (2026-10-11; tam kapı sonucu değil):**
`devtools/vol-showcase/tests/e2e/themeMatrix.spec.ts` içindeki
**Chromium axe skin × yoğunluk matrisi** aynı beş profilde iki yöntemle
karşılaştırıldı:

| Yöntem          | Hedefli sonuç | Süre       | Kanıt                   |
| --------------- | ------------- | ---------- | ----------------------- |
| Standart `scan` | **5/5 PASS**  | **2,1 dk** | Önceki yöntem           |
| `scanCached`    | **5/5 PASS**  | **1,6 dk** | Ölçülen optimize yöntem |

Gözlenen fark **0,5 dk**, yalnız bu alt kümede yaklaşık **%24 daha kısa
süre** (0,5 / 2,1). `scanCached` axe'i her sayfada bir kez yükler;
her skin/yoğunluk profili için `buttons` ve `forms` üzerinde
**iki ek standart `scan`** yaparak `violations` ve `incomplete`
sonuçlarının aynı kaldığını doğrular. Bu parite denetimi
erişilebilirlik sonuçlarını sessizce daraltmama amacındadır.
**Bu, tüm E2E veya tam `signoff` süresinde %24 hızlanma kanıtı değildir.**
Ölçüm yalnız Chromium'daki ilgili beş test içindir; başka motorlara,
diğer spec'lere ve tam kapı süresine genellenmez. Yukarıdaki üç
**48,4 / 47,0 / 48,1 dk PASS** performans değişikliği **öncesindedir**.
Optimizasyondan sonra tam `signoff` çalıştırılmadı; F10.13
**AÇIK** kalır ve sonraki tam kapı/önce-sonra süre ölçümünü bekler.

**F09.2 AÇIK (KISMİ):** §24'teki yeni APK kurulumları ve Lenovo Android 14
görünür panel kanıtı geçerlidir; Samsung Android 16'da kilit ekranının
ötesindeki görünür panel **NOT-RUN**. Activity/ActionMode/insets/yön/
geri/arka plan/haptik, uzun oturum ve paket/commit eşlemesi tamamlanmadı.
Masaüstü tam `signoff` bu fiziksel kabulleri kapatmaz; UI-13.5/F07
ayrı açık işler olarak kalır.
