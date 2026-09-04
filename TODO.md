# VOL.STUDIO — Denetim Kaydı

`dev` dalı. Bu dosya bir görev listesi değil, tamamlanmış turların **özet
kaydıdır**: ne değişti, hangi karar verildi, geriye ne kaldı. Bug-bug analizi,
tam test sayıları ve dosya listeleri commit diff'inde ve git geçmişindedir;
burada tekrarlanmaz. Güncel kapsam eşikleri `quality.json`da tek kaynaktır.

## 2026-09-04 — borç kapanışı: sınır, zaman, ölçüm

Dış bir analiz raporu repo üzerinde doğrulandı ve üç dalgada kapatıldı. Raporun
bulgularının çoğu isabetliydi; üçü düzeltildi, biri kaçırılmıştı ve o kaçırılan
en ağırıydı.

**Sınır bir anayasa ihlaliydi.** `vol-arachnid` çalışma zamanı
`@volstudio/pen.dev`i import ediyor ve onu `dependencies` altında taşıyordu —
`AGENTS.md` Kural 4'ün doğrudan ihlali. Aynı repoda doğru desen zaten vardı
(`vol-hell`, `audio-synth`i yalnız `scripts/` içinde ve `devDependencies`
olarak kullanıyor) ama sapmayı gören bir kapı yoktu. Rig VARLIK katmanı CORE'a
alındı — bunlar bir aracın API'si değil, ÜRETİLMİŞ VERİNİN sözleşmesidir — ve
72 parça oyunun kendi ağacına senkronlandı. Ölçüldü: `devtools/` ağacı tamamen
kaldırılıp `vite build` doğrudan çağrıldığında derleme geçiyor ve 72 parçanın
hepsi çıktıya giriyor — build grafiği o ağaca hiç uzanmıyor. (`pnpm` sarmalayıcısı
kayıp bir workspace paketini kendi tutarlılık kontrolünde yakalar; o ayrı bir
katman.) Kural "paket" değil "zaman" üzerinden yeniden yazıldı ve
`workspace-contract` kapısına bağlandı. Kuralın METNİ `AGENTS.md`dedir ve o
dosya bilinçli olarak `.gitignore`da; repoya giren şey metin değil ZORLAYICIDIR
(`scripts/quality/layers.mjs`). Taze bir klonda kuralı okuyamayan biri bile onu
ihlal edemez. Bekçi düzeltilen ihlalin kendisiyle sınandı ve ayrıca önceden bilinmeyen bir devtool→devtool kenarı buldu (asset
studio → visual-synth). O kenar silinmedi: gerekçesiyle BİLDİRİLDİ ve döngü
her hâlükârda reddediliyor.

**Zaman alt sistemler arasında kaymıştı.** Sahne ham `delta`yı altı alt sisteme
dağıtıyor, her biri kendi kelepçesini uyguluyordu: gövde 100 ms, yürüyüş
döngüsü kelepçesiz. 500 ms'lik bir karede gövde 100 ms yol alıyor, ayak döngüsü
500 ms ilerliyordu — ayaklar gövdenin GİTMEDİĞİ yere basıyordu. Tavan tek yere
alındı (`TECH.MAX_SIM_STEP_MS`) ve `Spring1D` de kendi özel sabitini bıraktı.
Aynı turda atılımın kare sınırına yuvarlanması, köşe çarpmasında ikinci
darbenin birinciyi ezmesi ve sekme impulse'unun ivmeye hiç girmemesi düzeldi.

**Ölçüm en çok şeyi ölçmediğimizi gösterdi.** Yeni benchmark, simülasyon ve
sunum yüklerini ayrı ölçüyor: yaratığın CPU maliyetinin neredeyse tamamı SUNUM
tarafında (poz gölgesi parça başına ~0,8 µs, doğrusal — sınır uzuv sayısı değil
PARÇA sayısı). Destek poligonu eklendiğinde ise gizli bir gerçek çıktı: düz
yürüyüşte gövde karelerin %98'inde destekli, ama atılım inişinden sonraki acil
adım fırtınasında bu oran %22'ye düşüyor. Görünür bir hata değil (devrilme
modeli yok) ama yorumların iddia ettiğinden zayıf. Ölçüldü, mandalla kilitlendi,
değiştirilmedi — adım zamanlamasına dokunmak ölçmeden yapılmayacak bir iştir.

**Raporun düzeltilen iddiaları.** (1) "facing/travel takası görsel kaymaya yol
açıyor": `RigMotionModel`in yön çıktıları hiç tüketilmiyordu, bugünkü etkisi
yoktu — altın imza değişmedi. Yine de yorum/kod yalanı kapandı ve alanlar
`intent` önekiyle yeniden adlandırıldı. (2) "gerçek geometrik runtime invariant
yok": vardı; eksik olan diz yönü kontrolü ve determinizm kilidiydi, ikisi de
eklendi. (3) "hostile delta testleri eksik": değildi; eksik olan sonluluk değil
alt sistemler arası zaman tutarlılığıydı.

**Öncülü yanlış çıkan iki madde.** Hibrit cihazda dokunmatik önceliğinin fazla
agresif olduğu iddiası ölçüldüğünde tutmadı: öncelik yalnız parmak gerçekten
ekrandayken geçerli ve "son etkinlik kazansın"a çevirmek bayat-pointer hatasını
geri getirirdi. `touchWorldScale` de sabit bir ölçek değil okunabilirlik
tabanı; `fit < floor` zaten cihaza uyum sağlıyor. İkisi de değiştirilmedi,
sözleşmeleri testle kilitlendi.

**Bilinçli olarak yapılmayanlar.** Metachronal yürüyüş (mevcut alternating
tetrapod netlik veriyor), rijit gövde motoru (destek poligonu ölçüm katmanı
olarak yeterli; kuvvet/tork bir sonraki aşama), doku atlası (ölçüm CPU
dönüşümünü işaret ediyor, draw call'u değil — atlas yükleme süresini
iyileştirir ve o ayrı bir ölçüm ister), kalite kademesine bağlı efekt bütçesi
(F3 eğrisi bugünkü 72 parçanın kare bütçesinin %0,45'ini aldığını söylüyor;
kısıtlamak için bir sebep yok). İkinci bir rig'in pipeline genelliğini kanıtlaması
birim testlerde sentetik bir varlıkla zaten yapılıyor; ikinci bir OYUN tarafı
tüketicisi ayrı bir turun konusu.

## 2026-09-02 — VOL.ARACHNID mobil geri bildirim ve gerçek bug avı

Kullanıcı cihaz geri bildiriminin her maddesi kaynak akışına kadar izlendi.
"Ses yok" sorunu yalnız asset eksikliği değildi: Phaser sesi bilinçli kapalıydı
ve VOL.ARACHNID'in haricî bir WebAudio yaşam döngüsü hiç yoktu. CORE'a oyun
kelimesi bilmeyen varyantlı/bütçeli `SoundBank`; oyuna ortak limiter altında
ambiyans ve SFX, ilk kullanıcı hareketinde AudioContext kilit açma, arka
planda suspend ve tam temizlik eklendi. Adım, atılım kalkış/iniş ve duvar
çarpması gerçek simülasyon olaylarından ses üretir; ses hataları oyun döngüsüne
taşınmaz. Üretim OGG'leri deterministik script ve QA komutuyla birlikte
gönderilir.

**Android çıkışının iki ayrı kökü vardı.** Önceki config örtüsü VOL.HELL'in
native projesini ve paket kimliğini paylaşıyordu; bu karar aşağıdaki aynı gün
kaydını GEÇERSİZ kılar. VOL.ARACHNID artık kendi Tauri crate'i, üretilmiş
Android projesi ve `com.volstudio.arachnid` kimliğiyle bağımsız kurulabilir.
Android geri hareketi `vol:androidback` olayına çevrilir; onaydan sonraki gerçek
pencere kapatma için `core:window:allow-close` capability'si verildi. Modal
açıkken simülasyon/girdi durur, kapatma reddi yakalanır.

**Dokunmatik girdi görünmez değildi, sınırsızdı.** CORE denetleyicisi stick'i
varsayılan olarak ekranın tüm yarısında doğuruyor, sağ tarafta nişan
kullanılmasa bile ikinci stick ayırıyordu. Normalize giriş bölgeleri eklendi;
Arachnid hareketi yalnız sol-alt başparmak alanında, sağ stick tamamen kapalı.
Arka plana ve modal açılışına geçerken stick + sanal eylemler birlikte
sıfırlanır. Ayrıca basılı tutulan atılım cooldown sonunda kendi kendine yeniden
ateşleniyordu; atılım artık basım KENARINA bağlıdır.

**Mobil tarayıcı artefaktı.** HUD ortak `UIRoot`tayken exit modalı ve atılım
düğmesi doğrudan container'a bağlanmıştı; bu yüzden kökteki `user-select`,
`-webkit-touch-callout` ve tap-highlight korumasını miras almıyorlardı. Üçü de
aynı referans sayımlı köke taşındı; uzun basma artık mavi seçim/kopyalama
davranışına dönüşmez.

**Haptik ve görüntü.** Haptik çağrıları eklemek tek başına yetmiyordu: Android
manifestinde `VIBRATE` izni yoktu ve CORE anahtarı açılmıyordu. İzin + yaşam
döngüsü anahtarı eklendi; yalnız kabul edilmiş atılım ve duvar çarpmasında kısa
`tap`/`select` desenleri kullanılır, arka planda iptal edilir. Grafik seçeneği
açılmadan tek sabit YÜKSEK profil veri olarak kilitlendi: tam render ölçeği,
WebGL antialias ve high-performance tercihi.

Bug avının yan bulguları da kapatıldı: yarıda kalan Phaser boot'u AudioContext
ve haptik durumunu sızdırıyordu; başlatılamayan bir WebAudio source'u ses
bütçesinde ölü voice bırakıyordu. Her ikisinin de regresyon testi var. Native
kimlik/izin/geri/capability, ses dosyası varlığı, joystick bölgesi ve yüksek
grafik profili kaynak sözleşmesi testleriyle korunuyor.

## 2026-09-02 — VOL.ARACHNID sağlamlaştırma turu: sürüklenmenin kökü, uçuş pozu, cihaz doğrulaması

**Sürüklenmenin kökü ÖLÇÜLDÜ.** "Uzun kemik hiç dönmüyor" düzeltmesi yetmemişti;
gerçek neden erişim payıydı. Bir uzvun ayağı, ev konumundan `stepTriggerPx`
kadar uzaklaşana dek yerde kalır. Kısa itici uzuvda (88 px) duruş 0.92 iken
erişim payı 7 px, tetik ise 50 px: uzuv stride'ın büyük kısmını TAM GERİLİ
geçiriyordu. Üstelik sıra disiplini bekleme süresini uzatıyor, gerginlik
erişimin çok üstüne çıkıyordu. Ölçüm: uzuv karelerin **%52-56'sını** tam gerili
geçiriyordu; bacaklarda bu oran %0-8.

İki CORE eklemesiyle çözüldü. `LegGaitLeg.strideScale` adım boyunu bacak
başına ölçekler (kısa bacak kısa adım); acil eşik BİLİNÇLİ olarak
ölçeklenmez — o eşik bacağın değil gövdenin ölçüsüdür.
`LegGaitLeg.freeStep` ise bacağı sıra disiplininin dışında bırakır: sıranın
tek amacı "gövde her an desteklidir" güvencesi ve gövdeyi sekiz bacak taşıyor;
kısa iticiler o güvencenin parçası değil. Ölçüm turdan sonra **%0**.

**Atılım artık gerçekten havada.** Yürüyüş döngüsü atılım boyunca tamamen
durur ve uzuvlar tek bir uçuş pozunda tutulur. Açık bırakıldığında uzuvlar sıra
disiplinini delip acil adım yağmuruna giriyordu: gövde düz uçarken bacaklar
yerinde TİTRİYOR, avlanan bir yaratık yerine bozuk bir makine gibi
görünüyordu. Atılım 190→130 ms'ye indi, iz kısaldı.

**Sağlamlaştırma paketi.** Her genel giriş noktası düşmanca akış değerleriyle
(NaN, ±Infinity, negatif ve dev delta) beslendi. İki gerçek hata çıktı:
`NaN <= 0` YANLIŞ olduğu için sonsuz olmayan bir delta gövdenin konumunu
kalıcı olarak NaN'e düşürüyordu; sonsuz bileşenli bir hareket niyeti ise
`x / uzunluk` üzerinden aynı sonucu veriyordu. Akış değerleri artık
temizleniyor (CORE'un `Spring1D`/`Cooldown` politikası). Ayrıca gövdenin arena
dışına çıkamadığı, dönüş tavanının hiçbir karede aşılmadığı, atılım spam'inin
cooldown'ı delemediği ve HUD'un tekrar tekrar kurulup yıkılınca DOM/dinleyici
biriktirmediği testlerle kilitlendi.

**Cihazda doğrulandı.** Bağlı Galaxy S21 FE'ye (SM-G990B2) debug APK kuruldu ve
çalıştırıldı: yatay 2340x1080, çökme yok, HUD arenaya değmiyor. Sol bölge
joystick'i gövdeyi 210 px/sn'de yürüttü, sağ bölge atılımı tetikledi. Cihazda
BULUNAN hata: basılı atılım bölgesi dolu bir zemin çiziyor ve oyun alanının
yarısını gizliyordu — zemin saydamlaştırıldı, geri bildirim kenarlıkta kaldı.

## 2026-09-02 — VOL.ARACHNID hissiyat turu 2: sürüklenen uzuv, atılım kilidi, Android

**Arka itici uzuvlar SÜRÜKLENİYORDU.** Kök kemik sabit tutuluyor ve iş alt
kemiklere bırakılıyordu; bacaklarda doğru (kök 36 px, alt kemikler 54/72) ama
arka uzuvlarda sıralama ters (kök 50, kalan 26/12). Gövde ileri yürürken ayak
duruş EKSENİ boyunca gidip gelir: açı değişmez, yalnız mesafe değişir. Sabit
kök bu mesafeyi göremediği için uzun kemik hiç dönmüyor, uzuv salınmak yerine
sürükleniyordu (ölçüldü: 4-6° gezinim). Model artık opsiyonel sabit kök +
iki kemikli IK; arka uzuvlarda kök doğrudan IK çiftinin ilkidir. Ölçülen
gezinim 31-33°'ye çıktı ve sol/sağ simetrik.

**Atılımda dümen kilitlendi.** Atılım sürerken girdiyle dönebilmek hem ağırlık
hissini öldürüyor hem uzuvları yanlış yönlendiriyordu: gövde düz uçarken duruş
yelpazesi dönüyor, ayaklar gitmediği bir yöne basmaya çalışıyordu. Yön atılımın
başında kilitlenir ve gövde uçtuğu yöne bakar.

**Toz mantığa oturdu.** Atılım sırasında ayaklar yere değmez, o yüzden toz da
kesilir. Karşılığı atılımın BİTTİĞİ karededir: bütün ayaklar aynı anda iner,
toplu bir toz patlaması ve kısa bir yer sarsıntısı bırakır.

**Ağırlık.** Hız 235→210, ivme 820→560 (tam hıza ~0.38 sn), fren 1100→760,
dönüş yayı 58→44 ve tavan 3.5→2.7 rad/s, dönüş hız cezası 0.32→0.42. Adımlar
uzadı (185→205 ms), öngörü hızı 250→215, havadaki ayağın kalçaya çekilmesi
17→20 px.

**Android çıkışı (aynı gün sonraki turda GEÇERSİZ KILINDI).** Bu turda
`tauri.arachnid.conf.json` örtüsüyle paket kimliği paylaşılmıştı; yukarıdaki
mobil geri bildirim turu VOL.ARACHNID'e ayrı native proje ve kimlik verdi.
Buradaki yarım-ekran dokunmatik modeli de sol-alt joystick + sağ-alt gerçek
düğme modeliyle değiştirildi.

**Ayrıca.** `pnpm dev` artık vol-hell'i de açıyor (eksikti). `samplePose`
matrisleri yeniden kullanıyor. `articulateRigDefinition` kaynakta yazılı
eklemleri ezmiyor. Duvar yankısı gövdenin kelepçe noktasına değil DUVARA
çiziliyor; çarpma eşiği yürüyüş hızının üstüne alındı (altındayken duvara
doğru basılı tutulan tuş sürekli sekme üretiyordu).

## 2026-09-02 — VOL.ARACHNID hissiyat turu: gerçek uzuv, ağırlık, HUD

Örümceğin "örümcek gibi durmaması" bir ayar sorunu değildi. Rig'de her bacak
DÖRT kemik (`coxa/femur/tibia/claw`) ama kod yalnız ikisini sürüyordu: `femur`,
`claw` ve eklem diskleri kök container'ın kardeşi olarak export pozunda
donuyor, uzuv kopuk görünüyordu. Arka iki uzuvda da yalnız tek kemik
sürülüyordu — "alt kısmı yok, pençe gövde altında kalıyor" bulgusunun kaynağı.

**Eklem şeması veri oldu.** Yayımlanmış export DÜZ: metadata `parentPartId`
taşımıyor. Şema `vol-arachnid/src/config/rig.ts` içinde bildiriliyor ve
pen.dev'in yeni `articulateRigDefinition`'ı ile montajdan önce uygulanıyor;
üretilmiş metadata dosyasına dokunulmuyor, yani bir sonraki export kararı
ezmiyor. Fonksiyon kaynakta yazılı eklemleri korur, topolojik sıralar,
döngüyü halkasını göstererek reddeder.

**Duruş kaynak pozdan türetilmiyor.** Export'ta her uzuv düz bir çizgi;
oradan okunan "dinlenme açısı" duruş değildir. Açılar artık İLERİ EKSENDEN
ölçülüp config'te duruyor. Eski ofsetler ters işaretliydi: `r3/l3` ÖN, `r0/l0`
ARKA bacaklar olduğu hâlde ön bacaklar geriye, arka bacaklar öne çekiliyordu —
sekiz uzuv dar bir bantta toplanıp birbirinin üstüne biniyordu.

**Arka iki uzvun zinciri yeniden kuruldu.** Kaynak yerleşim onları adlarının
TERSİNE dizmiş: ok ucu (`tail_tip`) gövdenin altında, kalın çubuk dışarıda.
Yerleşimden düzeltilemezdi; kemik boyları kaynak aralıkların ters sırası
olarak atanıp parça konumları elle eklemlerin üstüne yazılıyor. Kalça da kök
kemiğin gövdeye bakan ucuna taşındı — eski nokta gövde merkezine 30 px
mesafedeydi ve uzuv boyunun yarısını kabuğun altında harcıyordu.

**CORE'a taşınanlar.** `LegGait`in grup kilidi AÇLIK üretiyordu: aynı gruptaki
bacaklar kaymalı bittiği sürece kilit hiç bırakılmayabiliyor, karşı gruptaki
bacaklar dönüşlere bile tepkisiz yere yapışık kalıyordu ("dash sonrası takılı
bacak"). Kilit SIRA modeline çevrildi: sıra ancak adım sayısı sıfıra inince
yenilenir ve bekleyen grup her zaman en gergin olduğu için açlık matematiksel
olarak mümkün değil. `maxStrainPx` sırayı delen acil eşiktir. Ayrıca
`setLegHome` (canlı duruş), `justPlanted` (temas tetiği), `steppingCount`.

Yeni: `GazeDriver` (sıçramalı bakış, yuvasından taşmaz), `core/src/fx/`
(`samplePose` + `GhostTrail` + `PoseShadow`) ve `Bar`a dikey yönelim.
Poz örnekleyici matrisleri YENİDEN KULLANIR: argümansız bir dünya-matris
sorgusu çağrı başına iki matris ayırıyor, yetmiş parçalık bir rig'i her karede
örnekleyen gölge saniyede sekiz binden fazla nesne üretecekti.

**Ağırlık ve sınır.** İvme/fren düşürüldü, dönüş yayı yumuşatıldı ve dönüş
hızı tavanlandı (yay tek başına büyük açı farkında ağır bir gövdeye
yakışmayan bir açısal hıza fırlıyor); sert dönüş hızı kesiyor. Sınır artık
gövde yarıçapına kelepçeliyor (eskiden bir gövde boyu uzakta görünmez ikinci
bir duvardı) ve atılım hızındaki temas SEKİYOR. Çarpma eşiği `maxSpeed`in
üstünde: yürüyerek duvara dayanmak çarpma değildir — daha düşük bir eşikte
gövde duvarın önünde sürekli zıplıyordu.

**HUD arenaya değmiyor.** Kamera arenayı `viewportGutterPx` boşluklarının
İÇİNE sığdırıyor; HUD yalnız o boşluklarda yaşıyor ve ölçüler CSS değişkeni
olarak tek yerden yayımlanıyor. Metin en aza indi: dikey bar + başlık + tam
ekran butonu (F11 aynı denetleyiciden geçer) + sağ altta hız.

**Kalan riskler.** Rig sanatındaki ters dizilim ve pençe/gövde çakışması
kaynak `.pen` belgesinde duruyor; kod bunu tüketici tarafında düzeltiyor.
Manifeste `parent` alanı eklenip export yeniden üretilirse hem eklem şeması
hem yeniden kurma yolu gereksizleşir. CORE'un `-webkit-appearance:
slider-vertical` yedeği Chromium'da uyarı üretiyor ama eski Android
WebView'ları için bilinçli olarak duruyor.

Kapsam eşikleri: vol-arachnid tabandaydı (50/50/50/40), gerçek kapsam
98/86/97'ye çıktı ve eşikler ölçülenin ~2 puan altına çekildi.

## 2026-08-30 — grafik kalitesi ayarı: iki kademe, gerçek fark

Ölçüm turunda çıkan sonuç kabul edildi ve ayar yeniden kuruldu: üç kademe
ikiye indi, kademeler ÖLÇÜLEBİLİR biçimde ayrıldı ve mekanizma CORE'a taşındı.

**Önce kök sorun.** Render ölçeği naif eklenemezdi: `strategy: 'resize'` modunda
Phaser'ın dünya birimi doğrudan backing store pikselidir, yani çözünürlüğü
değiştirmek arenayı da değiştirir. Bu yalnız yeni knob'un değil MEVCUT
`maxDpr` bacağının da sorunuydu — 2x bir ekranda "yüksek" arenayı %50
genişletiyor ve dünya birimi/saniye cinsinden sabit olan oyuncu hızını ekranda
1.5 kat yavaşlatıyordu. Kalite ayarı sessizce OYNANIŞ ayarıydı.

`ViewportManager` artık dünyayı CSS pikselinde tutuyor: backing store
rasterleme çarpanıyla büyüyor, kamera AYNI çarpanla yakınlaştırılıyor, görünen
dünya alanı `viewport / zoom` = sabit. Sahneler `applyVolViewport(scene)` ile
bu sözleşmeye giriyor. Yan etki olarak DPR tutarsızlığı da kapandı.

**Ekran uzayı tuzağı.** Kamera yakınlaştırması `scrollFactor: 0` katmanları da
ölçekler (Phaser `GetCalcMatrix`: scrollFactor yalnız ötelemeyi iptal eder).
`TouchController` ham `pointer.x` kullandığı için joystick parmaktan kayacaktı;
işaretçi artık kamera uzayına çevriliyor. Bunun yan kazancı, önceki denetimde
"karar bekliyor" olarak bırakılan **dokunmatik fiziksel boyut** maddesidir:
joystick yarıçapları CSS pikseline sabitlendi, 3x telefonda `1/dpr` kadar
küçülmüyor.

**CORE'a ne taşındı.** `GraphicsQuality<TLevel, TProfile>` — kademe listesi,
geçerli kademe, değişim bildirimi, opsiyonel DOM yansıması. Profilin İÇİ
jenerik: CORE hangi knob'ların var olduğunu bilmez, kalıcılıktan habersizdir.
Oyuna özgü knob'lar `games/vol-hell/src/config/video.ts` içinde veri olarak
kalır. Showcase WORKBENCH sekmesinde kendi kademelerini tanımlayarak gösteriyor.

**İki kademe ne yapıyor.** Rasterleme ölçeği 1.0 / 0.7 (piksellerin ~%49'u),
DPR tavanı 2 / 1, partikül sayısı ×1 / ×0.35, partikül ömrü ×1 / ×0.6, mermi
izleri açık/kapalı, varlık kenar çizgileri açık/kapalı, saha göstergeleri
açık/kapalı, DOM `backdrop-filter` ve gölgeler açık/kapalı. Kenar çizgisi
anahtarı sahada ÇOK sayıda bulunan her varlığı kapsıyor (mermi, düşman, flux
pickup, kule mermisi) — yarım kapsam knob'u yalancı yapardı.

Varlıklar `@/app/services` singleton'ına UZANMIYOR: görsel anahtarlar
sağlayıcı olarak enjekte ediliyor ve verilmezse tam kalite varsayılıyor, yani
test ve simülasyon yolları etkilenmiyor.

**Göç.** Kayıtlı `'balanced'` değeri DÜŞÜĞE göç ediyor: orta kademeyi seçen
oyuncu ucuz tarafı istemiştir, yükseğe atlamak niyetin tersi olurdu. Tanınmayan
değer varsayılana düşer.

Ayar ekranında kademenin ne yaptığını anlatan açıklama satırı denendi ve
kullanıcı isteğiyle kaldırıldı; seçim etiketleri tek başına duruyor.

## 2026-08-30 — titreşim yeteneği: ayar cihazın gerçeğine bağlandı

Titreşim ayarı masaüstünde de sunuluyordu; oysa orada `navigator.vibrate` yok
ve klavye/fare titremiyor — kutu hiçbir şey yapmıyordu. CORE'a gerçek bir
yetenek katmanı eklendi ve ayar ona bağlandı.

`vibrate()` hâlâ NİYET alıyor, ama iki katmandan birine yönleniyor: Vibration
API (Android/mobil) ya da bağlı oyun kolunun `vibrationActuator`'ı (masaüstü,
Steam Deck). Desen tablosu tek kaynak kaldı — ms dizisi Vibration API'ye,
aynı desenin süre + şiddet karşılığı kola gidiyor.

`getHapticsCapability()` o anki durumu, `observeHapticsCapability()` ise
DEĞİŞİMLERİ veriyor. Yetenek çalışma anında ölçülüyor çünkü kol oyun ortasında
takılıp çıkarılabilir; açılışta bir kez bakmak, kolunu sonradan takan oyuncuya
ayarı sonsuza dek kapalı gösterirdi. Ayar ekranı bu aboneliğe bağlı: kol
takılınca kutu canlı etkinleşiyor, çıkarılınca pasifleşiyor ve solgunlaşıyor.
Kutu GİZLENMİYOR — kolunu takan oyuncu ayarı bulabildiği yerde bulmalı.

İzin hatası, reddedilen efekt ve `getGamepads` fırlatması sessizce yutuluyor:
titreşimin olmaması bir hata değil, o platformun gerçeği.

## 2026-08-30 — duran oyuncunun nişanı ve pause ayar yerleşimi

Kullanıcı bildirimi: "çoklu atış oyuncu hareket etmeyince imleci hedeflemiyor,
hep sağa ateşliyor." Avlandı, kök neden CORE'da çıktı ve etkisi bildirilenden
genişti.

`InputManager.getState()` hiçbir sağlayıcı "aktif" değilken SIFIR durum
üretiyordu. `isPCInputActive` ise aktiflik için hareket tuşu, bir eylem ya da
basılı pointer istiyor. Yani oyuncu WASD'ye basmadan, fare düğmesini tutmadan
yalnız imleci gezdirip Q/E'ye bastığında nişan `(0,0)` oluyordu — Q/E
`GameKeyboardBindings` üzerinden gidiyor ve eylem kümesine girmiyor. Nişana
bağlı her mekanik kendi yedeğine düşüyordu:

- `MultiShotAbility` → `DEFAULT_AIM_X = 1`, yani hep SAĞA yelpaze.
- `FireZoneAbility` → ofset 0, yani alan oyuncunun ayağının dibine.

Düzeltme sağlayıcı seçimindeydi: aktiflik CİHAZ TAHKİMİ içindir (dokunmatik mi
fare mi), "girdi var mı" değil. Nişan SÜREKLİ bir sinyaldir — fare her zaman
bir yerdedir. `InputProvider.providesRestingState` eklendi; hiçbir sağlayıcı
aktif değilken bu bayrağı taşıyan sağlayıcıya sorulur. `PCController` bayrağı
yalnız son işaretçi olayı DOKUNUŞ DEĞİLKEN taşır: dokunmatik cihazda parmak
yokken nişan diye bir şey yoktur, orada bayat yön uydurulmaz.

Ayrıca pause ayar formu ana menüden dar görünüyordu: aynı `GameSettingsContent`
iki panelde farklı genişlikte kuruluyordu (ana menü 560 px, pause 420 px).
Okuma sütunu tek bir `--vol-settings-column` değişkenine bağlandı ve pause
kaplamasının yatay boşluğu ayarlar ekranıyla eşitlendi.

## 2026-08-30 — harici denetim turu 2: ses/çarpışma dayanıklılığı

Üçüncü bir denetim listesi (22 madde) doğrulandı ve kapatıldı. **İki madde
zaten kapalıydı** (`31f6fb8`): süpürülmüş çarpışmada en yakın vuruş ve
MusicEngine'in iki fazlı geçişi. **Bir madde yanlış okumaydı**: `BaseScene`
yorumu cursor'ı yalnız oyun sahnesinde kurmayı TARİF ETMİYOR, tam tersine
BaseScene'e koyma gerekçesini yazıyor; yorum yine de iki ayrı gerekçeyi tek
blokta topladığı için ayrıştırıldı.

**Ses zinciri.** `menuMusic` üç ayrı biçimde kırılgandı: `Promise.all` tek bozuk
parçayla bütün hazırlığı reddediyor, reddedilen söz `loadPromise`te asılı
kalıp süreç ömrü boyunca yeniden denemeyi engelliyor ve liste yüklenip
yüklenmediğine bakılmadan TÜM parçalarla kuruluyordu. Artık `allSettled`,
red durumunda önbellek temizliği ve yalnız çalınabilir alt küme var.
`playDeath()` ise parçayı yüklenmişler arasından seçiyor — ve seçimin kendisi
de düzeltildi: `Math.floor(clamp(random.next(), 0, n - 1))` ifadesi `next()`
[0, 1) döndürdüğü için HER ZAMAN 0 veriyordu. Bugün tek ölüm parçası olduğu
için görünmüyordu; ikincisi eklendiğinde sessizce hiç seçilmezdi.

**Çarpışma.** Mermi sekmesinde yol düz değildir (`önceki → temas → güncel`) ama
çarpışma tek düz segment tarıyordu: merminin hiç uğramadığı bir kiriş üzerinden
haksız vuruş, gerçek yolda atlama. `Bullet` artık temas noktasını yayınlıyor,
çözümleyici iki parçayı SIRAYLA tarıyor (zaman sırası korunuyor). Kule mermisi
de oyuncu mermisiyle aynı grid broadphase'ine bağlandı; grid yoksa tam liste
güvenli yedek olarak kalıyor.

**Simülasyon.** Rusher faz geçişinde taşan süre siliniyordu: 300 ms'lik telegraf
16 ms'lik karelerde 304 ms'de dolup 4 ms kaybediyor, her geçişte tekrarlandığı
için devir config'de yazandan sistematik olarak uzuyor ve düşük FPS'te daha da
kayıyordu. Artık taşınıyor (bir sonraki fazın süresiyle sınırlı).

Tam üst üste binmede ayrışma yönü `definition.id`den türetiliyordu: aynı türden
bütün örnekler AYNI yöne itiliyor, yığın tek blok gibi kayıyordu. Yön artık
doğum sırasını da içeriyor ve doğumda BİR KEZ hesaplanıyor — çarpışma
döngüsünde hash maliyeti ve allocation yok. `spawnIndex` bilinçli olarak
zorunlu: unutulursa kalabalık bias'ı sessizce geri gelirdi.

**Dokunmatik ve ayarlar.** `TouchStickState` kare başına dört yeni `Vector2`
üretiyordu; tampon tabanlı okumaya geçildi. Bu geçiş `base`/`current` aynı
nesneyi paylaştığı için joystick tabanını sürükleyebilecekti — ayrıldı ve
testle kilitlendi. Ayar yazma hataları `console.warn`e gömülüyordu; artık
`settingsPersistence` üzerinden konsola, `diagnostics` akışına ve abonelere
birlikte taşınıyor.

`SimulationClock` adım geri çağrısına `stepIndex` eklendi: girdi anlık
görüntüsü frame başına bir kez okunup bütün adımlara veriliyor ve bugün
tüketilen eylemlerin hepsi seviye tetikli, ama kenar tetikli bir eylem
eklendiğinde tuzak artık görünür.

### VOL.HELL grafik kalitesi ayarı — ölçüm

Ayar bugün ölçülebilir olarak SADECE partikül yoğunluğunu değiştiriyor:
25 efekt boyunca toplam 314 / 251 / 173 partikül (high / balanced / low).
Diğer iki bacak gerçekte çalışmıyor:

- `maxDpr` (1 / 1.25 / 1.5) `Math.min(devicePixelRatio, maxDpr)` olarak
  uygulanıyor. `devicePixelRatio === 1` olan standart masaüstü monitörde
  ÜÇ AYAR DA aynı sonucu veriyor — fark yalnız HiDPI/mobil yüzeyde doğuyor,
  orada da tavan 1.5'te sabit.
- `document.documentElement.dataset.volGraphicsQuality` yazılıyor ama HİÇBİR
  CSS ya da kod okumuyor; yalnız testler doğruluyor. Ölü yazım.

Karar kullanıcıya bırakıldı: ya ayar gerçekten ölçülebilir bacaklar kazanmalı
(render ölçeği, iz/gölge/bloom anahtarları, efekt ömrü) ya da dürüstçe
"Partikül Yoğunluğu" olarak yeniden adlandırılıp ölü yazım silinmeli.

### P3 — karar bekleyen tasarım maddeleri

Bunlar kusur değil, YÖN kararıdır; kod değişikliği yapılmadı.

- **Tam sabit tick (VOLDUSTRY).** Bugün 60 FPS üstünde değişken artık adım
  koşuluyor. Kaldırmak render interpolasyonu ister ve 16 ms'e kadar girdi
  gecikmesi getirir. Öneri: VOLDUSTRY başlarken saf sabit tick + interpolasyon;
  VOL.HELL mevcut hissini korur.
- **Catch-up sınırında zaman atma politikası.** `SimulationClock` atılan süreyi
  raporluyor ama politika hâlâ "at". Alternatif: yavaşlatma (slow-motion) veya
  duraklatma. Öneri: teşhis çıktısına bakıp gerçek sıklığı ölçmeden değişmesin.
- **Dokunmatik + fare hibrit cihaz.** `shouldUseTouchControls()` tek seferlik
  karar veriyor; 2'si 1 arada cihazda kullanıcı ortada kip değiştiremiyor.
  Öneri: ayarlara açık "Kontrol kipi: Otomatik / Dokunmatik / Klavye+Fare".
- **Oyuncu çoklu temas hasarı grace semantiği.** Bugün tek küresel pencere var;
  iki düşman aynı anda değdiğinde ikinci temas yutuluyor. Öneri: kaynak başına
  pencere — ama bu zorluk dengesini değiştirir, dengeleme turu ister.
- **Replay determinizmi için ses rastgeleliği.** Ses RNG'si oyun RNG'sinden
  ayrı (`visualSeed` deseni) ama ölüm parçası seçimi koşu RNG'sini tüketiyor.
  Öneri: ses seçimlerine kendi türetilmiş seed'i verilsin.
- **VisualSynth CPU karmaşıklık puanı** ve **AudioSynth headroom/limiter
  sözleşmesi.** İkisi de üretim hattı kalite kapısı; ölçüm eşiği belirlenmeden
  eklenmesi keyfi olur. Öneri: önce mevcut varlıklardan taban ölçülsün.
- **Android üretilmiş ağaç sapması** `31f6fb8`te bekçiyle kapatıldı.

## 2026-08-30 — a579f69 denetim turu: 18 bulgunun kapatılması

Bir önceki commit (`a579f69`, 131 dosya / +5261) iki bağımsız denetimden geçti;
çıkan bulgular bu turda kapatıldı. Aşağıda yalnızca KARAR ve kalan risk var;
dosya listeleri ve satır sayıları diff'te.

**Oynanışı bozan iki kusur.** `Phaser.Input.Pointer.reset()` konumu da
sıfırlıyor; nişan `worldX/worldY − oyuncu` olarak hesaplandığı için duraklatma
dönüşünde ve dalga başında oyuncu, fare hareket edene kadar dünyanın (0,0)
köşesine nişanlıyor ve aynı vektörle dash atıyordu. İki çağrı yeri de ortak,
saf ve testli bir kapıya bağlandı (`runtime/input/pointerLatch.ts`): masaüstünde
konum korunur, dokunmatikte tam sıfırlama uygulanır. İkincisi: dükkanın yönlü
bakiye vurgusu (`balanceChange`) hiç görünmüyordu — `spendFlux` senkron
`onFluxChange` aboneliğini tetikleyip paneli YÖNSÜZ render ettiriyor, bakiye
etiketi o render'da güncellendiği için ardından gelen yönlü render "değişiklik
yok" sayılıyordu. Yön artık çağrı yerlerinden değil, son RENDER EDİLEN bakiyeden
türetiliyor; hangi yolun önce geldiği önemsiz.

**Süpürülmüş çarpışmada ilk temas.** Mermi ve kule atışı, bir adımda kesişen
düşmanlardan dizideki İLKİNİ vuruyordu: sonuç spatial grid'in hücre sırasına
bağlıydı ve mermi öndekinin içinden geçip arkadakini vurabiliyordu. CORE'a
`segmentCircleEntryT()` eklendi (parça-daire kesişiminin küçük kökü); iki çağrı
yeri de en küçük `t`'yi seçiyor. Eşitlikte dizi sırası kazanır, yani
deterministik.

**MusicEngine geçiş bütünlüğü.** `crossfadeTo()` eski stem'leri susturup
`stop()` planladıktan SONRA "hiç stem yüklenemedi" diye fırlatabiliyordu: geçiş
başarısız, mevcut müzik ölü, `isPlaying` `true`da takılı, playlist bir daha
ilerlemiyor. `play()` ve `crossfadeTo()` iki fazlı yapıldı — önce hedefin
çalınabilir stem'leri çözülür, biri bile yoksa çalan müziğe DOKUNULMADAN
fırlatılır.

**Sayısal doyum.** `getLevelSpan()` yüksek seviyede 0 dönüyordu (eşik
`MAX_SAFE_INTEGER`a doyunca `threshold(n)` ile `threshold(n-1)` eşitleniyor);
XPBar bunu bölen olarak kullandığı için dolum oranı `Infinity`/`NaN` oluyordu.
Doyumda taban eşiğe düşülüyor. Uç değer testleriyle kilitlendi.

**Tauri tam ekran gözlemcisi.** Taban durum dinleyici kurulmadan önce
okunuyordu (arada olan değişim kayboluyor) ve art arda resize'ların
`isFullscreen()` sözleri sırasız dönebiliyordu (durum yanlış yöne düşüyor).
Dinleyici önce bağlanıyor, sorgular tek kuyrukta sıralanıyor.

**Performans ve yapı.** Spatial grid adım başına iki TAM rebuild yapıyordu;
ikincisi `SpatialIndex.refresh()` ile artımlı tazelemeye çevrildi (hücre
değişmeyende sıfır iş, sorgu sonucu birebir aynı — testle kilitli). Sabit adım
mantığı sahneden `SimulationClock`a çıkarıldı: politika tek yerde, Phaser'sız
test edilebilir ve atılan catch-up süresi raporlanıyor. God-object sınırını
aşan üç dosyadan ikisi bölündü (`hudTab` 824→56 + iki aile dosyası,
`ShopPicker` 666→546 + tip yüzeyi).

**Küçükler.** Ölü `gameConfig.viewport.maxDpr` silindi (DPR artık sağlayıcı
fonksiyondan geliyor). Oyuncu gösterge renkleri runtime'dan `config/ui.ts`e
taşındı. Web build'inde hiçbir şey yapmayan "Pencere Çözünürlüğü" kontrolü
`hasNativeWindow()` ile devre dışı bırakıldı. Dalga sınırında çift çalışan
`clearTransientState` tekilleştirildi. Dalga duyurusu `aria-hidden` yerine
kalıcı canlı bölge oldu. `Counter.setValue()`ın sessizce değişen varsayılanı
(yön çıkarımı) dokümante edildi ve `change: 'none'` çıkış kapısı yazıldı.

**Kapı sıkılaştırması.** `audio-synth` ve `visual-synth` eşikleri tabandaydı
(50/50/50/40) ama gerçek kapsam 89 ve 97'ydi: kapsam yarıya düşse bile kapı
yeşil kalıyordu. Eşikler ölçülen değerin birkaç puan altına çekildi. Elle
düzenlenmiş `gen/android` kaynakları için sapma bekçisi eklendi — `android init`
yön kilidini, tam ekranı ve geri tuşu köprüsünü SESSİZCE ezebiliyordu.

### Kalan iş (bilinçli olarak bu turda YAPILMADI)

- **Tam deterministik simülasyon.** `SimulationClock` politikayı tek yere
  topladı ve sınırı dokümante etti, ama 60 FPS üstündeki değişken artık adım
  duruyor. Kaldırmak render interpolasyonu ister ve oynanış hissini değiştirir.
- **`GameScene` 681 satır.** İki bölme yapıldı; 600 altına inmek `createScene`
  kurulum bloğunun (~177 satır) ayrılmasını gerektiriyor. Doğrudan testi olmayan
  Phaser dosyasında, 18 maddelik bir turun sonunda yapılacak iş değil — kendi
  turunu ve kendi doğrulamasını hak ediyor.
- **`VolHellSimulation` üretim paritesi.** Sınır hâlâ tüm Phaser yolunun yerine
  geçmiyor (README'de yazılı).
- **Render snapshot allocation.** Her çağrıda yeni dizi/nesne üretiliyor; bu,
  DTO'nun SAHİPLİK sözleşmesinin bedeli ve `simulation-benchmark.ts` içinde zaten
  ayrı bir ölçümü var. Tampon yeniden kullanımı sahipliği bozar, çağıranın
  opt-in'i gerekir.
- **Dokunmatik kontrol fiziksel boyutu.** `STICK_MAX_RADIUS` sabit piksel;
  DPR/ekran boyutuna göre ölçeklenmesi bir tasarım kararı.
- **CORE lifecycle konvansiyonu.** `AGENTS.md` ikili konvansiyonu (tek kaynak →
  ham timer, çok kaynak → `DisposableScope`) zaten bilinçli olarak tanımlıyor;
  ek standartlaştırma yeni bir kural değil, mevcut kuralın uygulanması.

## 2026-08-29 — VOL.HELL masaüstü ve Android teslim doğrulaması

Fedora/Wayland üzerinde üretilen native AppImage ilk açılışta beyaz pencere
bırakıyordu. Kök neden, WebKitGTK GBM renderer'ının bu sürücü birleşiminde
ilk buffer'ı oluşturamamasıydı. Linux launcher'ı
`WEBKIT_DISABLE_DMABUF_RENDERER` varsayılanıyla başlatacak şekilde paketlendi;
Tauri'nin Fedora'da `linuxdeploy` aşamasında kırılan AppImage sonlandırması
için de `scripts/build-linux-appimage.mjs` ile AppDir yeniden paketleniyor.
Gerçek AppImage Fedora masaüstünde başlatıldı ve VOL.HELL ana menüsü ekran
görüntüsüyle doğrulandı. Kullanıcı menüsündeki user-level `.desktop` girdisi
güncellendi; sistem geneli RPM kurulumu sudo parolası gerektiği için yapılmadı.

Gerçek Galaxy S21 FE cihazında JDK 21 ile debug aarch64 APK üretildi, kuruldu
ve başlatıldı; ana menü ekran görüntüsüyle doğrulandı. Android Studio'nun JDK
25'iyle yapılan ilk deneme Gradle'ın `25.0.2` sürümünü kabul etmemesi nedeniyle
başarısız oldu; üretim yolu JDK 21 LTS olarak sabitlendi. Native Linux ve
Android smoke testleri geçti. `pnpm quick`, `pnpm high` (e2e dahil) ve
Tauri/Gradle üretim yolu yeniden çalıştırıldı; istisna olarak Playwright
tarayıcıları `pnpm exec playwright install chromium` ile kuruldu.

## 2026-08-29 — VOL.HELL hardening turu: shop UX, geri bildirim ve platform

Oyuncu istatistikleri için CORE'a yeniden kullanılabilir, sağdan açılan ve
modal scrim/odak tuzağı kullanan `StatsPanel` eklendi. VOL.HELL bu bileşeni
yalnızca shop/intermission katmanında açıyor; HUD'da ekstra panel/buton yok.
Shop stats'i ikonlu oyuncu, yetenek özeti ve Q/E detay kategorileriyle gerçek
ölçeklenmiş değerleri gösteriyor; satın alma, satış, reroll ve equip/unequip
sonrasında açık panel aynı instance'ları koruyarak yenileniyor.

Shop bakiyesi anında yeniden render ediliyor ve düşüşte kısa bir görsel vurgu
alıyor. Spark barındaki gereksiz “kart bekleniyor” metni kaldırıldı. Hareket
ve joystick girdisi için sekiz yönlü, yumuşak VOL oku; gerçek mermi üretiminde
merminin altında kısa ateş yönü çizgisi eklendi. Düşman ölüm kamera sarsıntısı
hafifletildi. Desktop/Web/Tauri pointer'ı, basılı ve onay durumları olan
üst-seviye VOL crosshair cursor ile değiştirildi; touch cihazlarında sistem
pointer'ı zorlanmıyor.

Wave sınırında düzenli düşman/mermi/pickup/telegraph temizliğine ek olarak kule,
ateş alanı, zincir yıldırım, partikül ve kamera efektleri, joystick/klavye latch'i
ve oyuncu dash/velocity/konumu tek kapıdan sıfırlanıyor. Oyuncu her yeni dalgada
arena merkezine dönüyor; turret'in birden fazla atışı yalnızca büyük zaman
adımını telafi eden bounded catch-up durumunda mümkün ve tek update sahibine
sahip olduğu testle doğrulandı.

Pause ayarları ana menüyle dil, master/SFX/müzik/ambiyans, sarsıntı şiddeti,
titreşim ve mute alanlarında eşitlendi. Menü SFX'leri artık sahne kapanışında
oyun seslerini susturan genel temizlik tarafından kesilmiyor; ilk etkileşimden
önce bütün SFX'ler bağımsız ve dayanıklı biçimde yükleniyor. Mobil ölüm özeti
güvenli alanlı, kaydırılabilir bir panel olarak düzenlendi; scene yeniden
kullanıldığında eski scroll konumu sıfırlanıyor. VOL.UI ve VOL.HELL F11/
programatik fullscreen akışı CORE `FullscreenController`a bağlandı; VOL.UI
üst çubuk aksiyonlarına ayrı, tam dokunma hedefleri verildi.

## 2026-08-29 — VOL.HELL hardening turu: savaş döngüsü, ses ve zaman güvenliği

Güncel ZIP'ten bildirilen 27 maddelik VOL.HELL denetimi kod ve regresyon
testleriyle kapatıldı. Terminal dalga artık shop/intermission olayı üretmeden
zafer akışına geçiyor; boss fire-rate ölçeklemesi gerçek saldırı aralığına
bağlandı; aynı slota yeniden equip cooldown'u sıfırlamıyor. Mermi ve turret
shot için ortak CORE `segmentCircleOverlap` süpürme yordamı kullanılıyor ve
ömür sonu frame'i çarpışma çözümünden önce kaybolmuyor.

Zaman tarafında sabit-adımlı accumulator simülasyonu, bounded catch-up ve
interval çıkarma uygulandı; FireZone final tick'i, çoklu EnemyManager spawn'ı,
dash/hit-flash önceliği, exact-overlap ayırma ve oyuncu temas grace'i korunuyor.
SpatialGrid hareket sonrası artımlı güncelleniyor. Ability görsel RNG'si oyun
RNG akışından ayrıldı; RunEconomy threshold hesabı kapalı formülle sabitlendi.

Ses tarafında MusicEngine buffer anahtarı track/kaynak kimliğiyle ayrıştırıldı,
play yarışları generation token ile bastırıldı ve dispose listener'ları
temizliyor. GameAudioDirector track'leri `allSettled` ile bağımsız yüklüyor;
tek bozuk opsiyonel asset kalan müzik ailelerini susturmuyor. AudioSynth WAV
decoder chunk sınırlarını, writer'lar da rate/channel/gain/quality/data
girdilerini yazmadan önce doğruluyor. Sidechain overlap release ve her loop
sınırındaki crossfade için regresyonlar eklendi.

**Doğrulama:** Paket testleri ve typecheck'ler kapı turunda yeniden
çalıştırılacak; sonuçlar commit raporunda komut/çıktı olarak tutulacak.

## 2026-08-28 — VisualSynth + AudioSynth: extraction sonrası residue ve dependency sınırı

Harici agent audit'inin bulguları dosya ağacı, import graph, package
manifest ve source diff üzerinden kanıtlandı. Kullanıcı kararları netleştikten
sonra uygulandı.

**Kanıtlanan gerçekler:**

- `core/src/visual*` ve `core/src/audio/synth*` fiziksel olarak yok.
- `core/src/index.ts` ve `core/package.json` public surface'da VisualSynth/
  Synth yok.
- `visual-synth`/`audio-synth` yalnızca `core/math/interpolation`,
  `core/random`, `core/pool` gibi generic primitiflere bağımlı; full
  `@volstudio/core` import yok.
- `core` source'u hiç `@volstudio/visual-synth`/`@volstudio/audio-synth`
  import etmiyor.

**Uygulanan kararlar:**

- 5 dosyadaki audio-synth/visual-synth textual residue'leri
  (`core/src/audio/music/types.ts`, `core/src/random/random.ts`,
  `publicApi.test.ts`, `publicSurface.test.ts`, `core/docs/music-engine.md`)
  generic build-time asset compiler / sentez aracı ifadelerine çevrildi.
- `games/vol-hell/package.json`da `@volstudio/audio-synth` `dependencies`
  yerine `devDependencies`'a çekildi (runtime `src/` import yok, sadece build
  script'leri kullanıyor).
- `export/` klasörleri mevcut haliyle `.gitkeep` ile korundu; otomatik
  generated-output ignore politikası şu an gerekmedi.
- `core/tests/governance/noSynthDependency.test.ts` eklendi: core'un
  `@volstudio/visual-synth` ve `@volstudio/audio-synth`'e source ve manifest
  seviyesinde bağımlı olmadığını regression testiyle kilitliyor.

**Doğrulama:**

- `pnpm high` ✓ (contract, format, typecheck, lint, lint-css, coverage,
  build, e2e)
- `core` testleri ve `noSynthDependency` testi ✓
- Commit: `788d30e`, push: `feature/debt-closure`

## 2026-08-28 — VisualSynth + AudioSynth: core'dan devtools paketlerine taşıma

`core/src/visualSynth/` ve `core/src/audio/synth/` alt sistemleri kendi
`devtools/visual-synth/` ve `devtools/audio-synth/` paketlerine çıkarıldı.
Bu paketler deterministik asset compiler'dır; oyun ve araçlar yalnızca
üretilmiş asset'leri (`public/assets/audio`, `export/`) tüketir.

**Yapılanlar:**

- Yeni `@volstudio/visual-synth` ve `@volstudio/audio-synth` paket iskeletleri
  (`package.json`, `tsconfig.json`, `vitest.config.ts`, `README.md`, `export/`,
  `presets/`, `recipes/`).
- Kaynak kod, testler, script'ler ve dokümanlar ilgili paketlere taşındı.
- `core/src/index.ts` ve `core/package.json` public surface'dan
  `VisualSynth`/`Synth` namespace'leri ve alt yolları kaldırıldı.
- `core/src/pool/index.ts` eklendi; `@volstudio/core/pool` alt yolu açıldı.
- `@volstudio/core/math/interpolation` alt yolu açıldı.
- `core/tests/governance/publicSurface.test.ts`, `numericContract.test.ts`,
  `primitiveNeutrality.test.ts`, `publicApi.test.ts` yeni yapıya göre
  güncellendi.
- `core/tests/audio/music/music.test.ts` ve `mock-audio.ts` artık
  `@volstudio/audio-synth`'e bağımlı kalmadan kendi `AudioBuffer` üretiyor.
- Tüketiciler (`devtools/vol-asset-studio`, `games/vol-hell`) yeni paket
  yollarına geçirildi; `tsconfig.json`/`vite.config.ts` alias'ları eklendi.
- `core/docs/visual-synthesis.md` → `devtools/visual-synth/DESIGN.md`,
  `core/docs/sound-synth.md` → `devtools/audio-synth/DESIGN.md` taşındı;
  `core/docs/music-engine.md` ve `core/src/random/random.ts` yorumları
  güncellendi.
- Root `package.json` script'leri (`convert:ios`, `audio:qa`) ve `justfile`
  yeni yollara göre güncellendi; `visual-synth-asset`/`visual-synth-qa`
  just tarifleri eklendi.
- `quality.json` yeni paketlerin kapsam eşiklerini içerecek şekilde
  güncellendi.

**Doğrulama:**

- `pnpm contract` ✓
- `pnpm quick` ✓ (contract, format-check, typecheck, lint)
- `pnpm exec just coverage` ✓ (tüm paketler coverage eşiklerini geçti)
- `pnpm exec just build` ✓ (vol-ui, vol-asset-studio, vol-hell build'leri)
- `pnpm exec just lint-css` ✓
- `pnpm -r --if-present test` ✓
- `pnpm high` × (e2e aşamasında düştü; sebep: Playwright tarayıcı ikilikleri
  kurulu değil. Çözüm: `pnpm exec playwright install` sonra `pnpm high`
  yeniden koşulmalı.)

**Kalan risk:**

- `pnpm high`'ın e2e aşaması local Playwright browser'larına bağımlı;
  yeni bir `pnpm install` sonrası `pnpm exec playwright install` unutulursa
  `high` kapısı düşer.

## 2026-08-28 — VisualSynth + AudioSynth: harici statik analiz turu, 16 bulgu

Kullanıcı, bu dalın bir zip snapshot'ı üzerinden yapılmış harici bir statik
analiz raporu getirdi: VisualSynth ve AudioSynth alt sistemlerini implementasyon,
test kapsamı, veri akışı, allocation, determinism ve edge-case açısından
inceleyen, "agent'a verilecek bug-only liste" olarak damıtılmış 16 maddelik bir
liste (5 VisualSynth + 11 AudioSynth). Her madde ayrı ayrı GERÇEK koda karşı
doğrulandı — rapor build/test koşulmadan yazıldığı için iki VisualSynth
maddesinde raporun kendi teşhisi hatalıydı, gerçek hata konumu ayrıca bulundu.

**VisualSynth:**

- **Anizotropik scale + SDF semantiği:** Rapor `post.outline` ve `distance`
  filtresini işaret ediyordu; ikisi de okunup GÜVENLİ olduğu kanıtlandı (ikisi
  de ham SDF mesafesini değil, coverage/piksel-uzayı temsilini kullanıyor).
  Gerçek bug başka yerdeydi: `toCoverageFn`'in antialiasing genişliği
  izotropik bir skalerle (`pixelUnit/2`) hesaplanıyor, ve
  `sdf.smoothUnion`/`smoothSub`/`smoothIntersection` ham SDF değerini
  doğrudan tüketiyor — ikisi de anizotropik `scale` bir SDF'yi bozduğunda
  yanlış sonuç verir. `validate.ts`'e `resolveFieldDomain`'in kendi
  belgelediği önkoşulu (yalnızca yapısal olarak geçerli ağaçta çağrılabilir)
  gözeten yeni bir anizotropik-scale-üstünde-SDF denetimi eklendi.
- **`renderStack` maske alt-yığını israfı:** Havuz-bypass'ın kasıtlı, zaten
  dokümante edilmiş bir tasarım kararı olduğu doğrulandı (bug değil). Gerçek
  israf: maske alt-yığınları yalnızca `coverage` kanalını okur ama
  height/material alanları yine de hesaplanıp atılıyordu. `renderLayer`/
  `renderStack`'e `channelsNeeded: 'all'|'coverage'` parametresi eklendi;
  maske dalları artık height/material hesaplamıyor.
- **`sdf.path` segment maliyeti artık analiz çıktısında:** implementasyon
  DEĞİŞTİRİLMEDİ (rapor açıkça istemiyordu) — `analyzeSpriteDoc`'a
  `pathSegmentCount`/`estimatedPathSegmentTests` eklendi ki bir tüketici
  (UI/CLI) 64 nokta × büyük çözünürlük kombinasyonunu render'dan önce görebilsin.
- CPU/evaluation karmaşıklık bütçesi (rapor: `maxComplexityScore`) BİLİNÇLİ
  olarak ertelendi — bu bir hata düzeltmesi değil, yeni bir alt sistem
  tasarımı gerektiriyor (FBM×octave×warp×scatter×path×iç-içe-stack maliyet
  modeli). Yüzeysel/aceleye getirilmiş bir versiyonu, kaliteli bir versiyondan
  daha kötü olurdu.

**AudioSynth (11 madde, hepsi doğrulanıp düzeltildi):**

- **Additive harmonics çifte hata:** Nyquist üstü harmonikler `Math.min` ile
  nyquistLimit'e KATLANIYORDU — farklı ratio'lu harmonikler aynı katlanmış
  frekansta üst üste binip kaynak sesle ilgisi olmayan bir ton/beating
  üretiyordu; artık duyulmaz harmonik atlanır, faz biriktiricisi yine de
  ilerletilir (slide/vibrato'da süreksizlik olmasın diye). AYRICA (rapor
  DEMEDİ, koda bakarken bulundu): `HarmonicParams.gain` hiç okunmuyordu —
  `additivePad` gibi presetlerin kasıtlı azalan harmonik kazancı (1.0→0.1)
  tamamen yok sayılıyordu, tüm harmonikler eşit sesle çalıyordu.
- **`synthesize()`/`pluck()` girdi doğrulaması yoktu:** NaN/Infinity/0/negatif
  sampleRate, duration, frequency, repeat, seed vb. `Math.max/min` NaN
  karşısında NaN döndüğü için sessizce sızıyordu (`Float32Array(Infinity)`
  kontrolsüz RangeError, ya da `repeat=NaN` sessiz boş çıktı). Mevcut
  `core/src/math/interpolation.ts`'teki NaN-güvenli `clamp()` (VisualSynth'in
  zaten kullandığı, AudioSynth'in hiç kullanmadığı) tüm ilgili alanlara
  uygulandı. `pluck()`'ta `decay >= 1` KS geri besleme döngüsünü
  kararsızlaştırıp birkaç saniyede Float32 taşmasıyla Inf/NaN üretebiliyordu
  — üst sınır 0.999'a çekildi.
- **`loopSamples` crossfade yalnızca İLK sınırı düzeltiyordu:** kod
  `out[0..fadeSamples)`'ı değiştiriyordu — bu gerçek bir loop sınırı bile
  değil (oynatmanın başı). Gerçek sınırlar (`samples.length`, `2×`, `3×`, ...)
  hiç dokunulmuyordu, her tekrarda tıklıyordu. Artık her iç sınırda uygulanıyor.
- **`decodeWav` sınır doğrulaması yoktu:** chunk boyutu dosya sınırını
  aşabiliyordu (kontrolsüz RangeError veya sessiz yanlış durum), `numChannels`/
  `bitsPerSample`=0 bölme sıfıra gidip `Float32Array(Infinity)` üretebiliyordu.
  Kesik (truncated) `data` chunk'ı artık mevcut baytlarla çözülüyor (atılmıyor);
  yapısal bozukluk temiz `Error` fırlatıyor.
- **`MusicEngine` buffer önbelleği salt `stem.id` ile anahtarlanıyordu:** iki
  farklı track aynı stem id'yi farklı buffer'la kullanırsa ikinci track
  birincinin sesini çalardı. Anahtar artık `src` varsa içerik-adresli
  (paylaşılabilir), yoksa track'e özel kapsanmış.
- **`play()`/`crossfadeTo()` eşzamanlılık yarışı:** `loadTrack` await'i
  sırasında ikinci bir çağrı gelirse hangisinin kazanacağı network
  zamanlamasına bağlıydı, ÇAĞRI SIRASINA değil. `MusicPlaylist`'in zaten
  kullandığı `startToken` deseni motöre de taşındı (`playToken`); `stop()` de
  bekleyen bir çağrıyı iptal etmek için token'ı arttırır.
- **Tüm stem'ler yüklenemezse `isPlaying` sonsuza kadar `true` TAKILI
  kalıyordu** (hiçbir `source` olmadığı için `onended` asla tetiklenmezdi).
  Artık en az bir stem başlamazsa `play()`/`crossfadeTo()` reddedilir, state
  tutarlı sıfırlanır.
- **`dispose()` `trackEndHandlers`i temizlemiyordu** — çağıran unsubscribe
  etmeyi unutursa closure referansları kalıcı sızardı.
- **`SidechainDucker.duck()`:** `cancelScheduledValues` ÖNCEKİ release'i HER
  ZAMAN iptal ediyordu ama yenisi yalnızca `end > activeUntil` iken
  planlanıyordu — daha kısa bir duck, uzun bir duck'ın hold aşamasına binince
  hiçbir release planlanmıyordu, gain sonsuza dek duck hedefinde takılı
  kalıyordu. En geç biten pencere artık HER ZAMAN yeniden planlanıyor.
- **`MusicPlaylist.advanceCursor()` sonsuz yeniden-deneme döngüsü:** yorum
  tek-parçalık listede sonsuz döngüyü önlediğini iddia ediyordu, ETMİYORDU —
  tek parça (veya tüm liste) kalıcı bozuksa `gapMs` aralıklarla sonsuza kadar
  aynı parçayı yeniden dener, hiç pes etmezdi. `queue.length` art arda
  başarısızlıktan sonra (bir başarı sayacı sıfırlar) artık durur.

**Doğrulama:** her düzeltme için gerçek regresyon testi eklendi (VisualSynth
409 test / 22 dosya, AudioSynth dahil core paketi 1810 test / 116 dosya —
hepsi geçiyor). Tam kalite kapısı (`just signoff`: contract, format, typecheck,
lint, lint-css, coverage eşikleri, tüm paket build'leri, Chromium+Firefox
e2e-full, cargo check/fmt/clippy) baştan sona TEMİZ geçti.

## 2026-08-28 — Profesyonel bulgu turu: benchmark sıkılığı, bellek doğrulama, swarm sızıntısı

Önceki turun raporundan sonra kullanıcı dokuz somut bulgu getirdi (P1: simülasyon
kapsam netliği, allocation ölçümü, CommandHistory×revizyon entegrasyonu,
lifecycle kuralı; P2: swarm sızıntısı, p95 istatistiği, killRadius'un saturasyonu
gizlemesi, CORE benchmark kapsamı, VisualSynth bellek modeli) ve gerçek bir
Android cihaz + bu Fedora makinesinin kendisinin baştan beri erişilebilir
olduğunu belirtti (önceki turun "cihaz yok" raporu `adb`'yi PATH'te aramakla
sınırlıydı — SDK `platform-tools` altında duruyordu). Her bulgu tek tek koda
karşı doğrulandı; sekizi gerçek çıktı, biri (simülasyon kapsamı) zaten
doğruydu ve yalnızca daha açık dokümantasyon istiyordu.

- **Swarm ebeveyn-minion sızıntısı (gerçek bug):** `VolHellSimulation`
  `aliveMinions`i `.filter(...).length` ile SAYIYORDU, diziyi hiç
  küçültmüyordu — bir swarmer/elite koşu boyunca doğurduğu HER minion'un
  referansını taşırdı (bellek + her frame büyüyen sayım maliyeti). `Enemy.ts`
  (Phaser) tarafında da `kill()` (hasarla ölüm, en sık yol) `this.minions`i
  temizlemiyordu — yalnızca `destroy()`/`clearWithEffect()` temizliyordu.
  İkisi de düzeltildi; regresyon 2000 doğum döngüsü sonrası dizi boyutunun
  sabit kaldığını ve hasarla ölen bir swarmer'ın minion referanslarını hemen
  bıraktığını doğruluyor.
- **Benchmark p95 yalancıydı:** nearest-rank formülü `N<20` örnekte her zaman
  maksimumu seçiyor; varsayılan `samples: 3` ile "p95" aslında "3 örneğin en
  yavaşı"ydı. Varsayılan 25'e çıkarıldı (CLI'lardaki KENDİ kopya varsayılanları
  dahil), davranış iki yeni testle kilitlendi.
- **`killRadius` saturasyonu gizliyordu:** varsayılan benchmark oyuncuya
  yaklaşan her düşmanı o karede öldürüyor, popülasyonu gerçek performans
  tavanının (80 eşzamanlı düşman) çok altında tutuyordu. Yeni "saturated"
  workload'lar (`killRadius: null` + kaba adımlı ısıtma fazı) popülasyonu
  koşunun gerçekten ulaşabileceği tavana taşıyor — ölçüm hafif yükten **~30x**
  daha maliyetli çıktı, önceden tamamen görünmezdi. (Isıtmanın ilk sürümü
  `runCompleted` no-op sınırını fark etmeden aşıp sahte ~0 ms rapor etmişti;
  düzeltilip koşu ömrüne göre sınırlandırıldı.)
- **CORE benchmark kapsamı genişletildi:** FlowField, ResourcePool, StatBlock
  eklendi (önceden yalnızca SpatialIndex/PathFinder/Scheduler/ObjectPool
  vardı). StatBlock workload'ı ilk sürümde CORE'un domain-neutrality
  bekçisini kırdı (`damage`/`fireRate` — vol-hell'in gerçek stat sözlüğüyle
  birebir çakıştı); jenerik adlara taşındı.
- **Render snapshot allocation'ı artık ölçülüyor:** `getRenderSnapshot()`
  her karede düşman/pickup sayısıyla orantılı yeni dizi+nesne ayırıyordu,
  bu hiç ölçülmüyordu. `--expose-gc` ile zorla GC edilen bir ölçüm eklendi
  (saturasyonda ~39 KB/çağrı, 56 düşmanda).
- **VisualSynth bellek modeli gerçekle karşılaştırıldı — ve gerçek bir boşluk
  bulundu.** `estimatedPeakWorkingBytes` kendini `confidence: 'conservative'`
  diye etiketliyordu ama hiç doğrulanmamıştı. `--expose-gc` ile zorla ölçülen
  gerçek yığın artışı, örnek preset kataloğunda tahminin **~5–31 katı**
  çıktı. Kök neden KANITLANMADI (en olası açıklama: model yalnızca
  `buffered` kategori düğümlerin kalıcı tamponunu sayıyor, tamponsuz
  düğümlerin render.ts'te gerçekten akışla mı değerlendirildiği ayrı bir
  profil incelemesi gerektiriyor) — formül köreltilmeden bırakıldı, ama
  `confidence` alanının dokümantasyonu ve yeni bir regresyon testi bu boşluğu
  dürüstçe kayda geçirdi.
- **CommandHistory × harici revizyon entegrasyonu:** iki mekanizma
  (`stateToken` kirlilik izleme, `conflictRevision` disk çakışması) ayrı ayrı
  test ediliyordu ama birlikte hiç değil. Dört yeni test: kirliyken gelen
  conflict undo ile temize dönünce de kalıcı kalıyor, conflict varken yeni
  düzenleme kirliliği bağımsız izliyor, kayıt ikisini birden temizliyor.
- **Lifecycle kuralı netleştirildi:** "ham timer mı, `DisposableScope` mı"
  ayrımı hiç yazılı değildi. Kural (kaynak SAYISI: tek kaynak ham, iki+
  DisposableScope) hem `AGENTS.md`ye hem `DisposableScope.ts`nin kendi
  JSDoc'una işlendi.
- **`VolHellSimulation` kapsamı** zaten doğruydu (savaş yaklaşıksaması,
  elite/boss AI'sızlığı, ability sistemsizliği) ama örtük dokümante
  edilmişti; sınıf yorumuna üç maddelik açık bir liste eklendi.

**Cihaz doğrulaması (bu turda ilk kez gerçekten yapıldı):** taşınabilir JDK 17
indirilip (`~/.local/jdk` — sistemde hiç JDK yoktu, `sudo` da yoktu) Android
debug APK üretildi, gerçek Galaxy S21 FE'ye (`R5CXA3KZWNK`) kuruldu ve
çalıştırıldı; ana menü, oyun içi dokunmatik kontroller ve ölüm/koşu özeti
ekranı ekran görüntüsüyle doğrulandı — hiçbiri önceki turda mümkün değildi.
Fedora masaüstü hedefi `tauri.conf.json`da hiç yapılandırılmamış
(`targets: ["nsis","msi"]` yalnızca Windows) — AGENTS.md'nin "Hedefler:
Windows ve Android" tanımıyla tutarlı; native paket formatı (deb/rpm/AppImage)
bilinçli olarak eklenmedi (kapsamı genişletmek ayrı bir ürün kararı). Bunun
yerine gerçek masaüstü ikili dosyası (`cargo build`, debug) bu makinede
derlenip çalıştırıldı: ilk denemede WebView içeriği render olmadan boş
pencere açtı (`Failed to create GBM buffer` — bu KDE/Wayland+GPU sürücü
kombinasyonuna özgü, bilinen bir webkit2gtk donanım-compositing sorunu, kod
kusuru değil), `WEBKIT_DISABLE_COMPOSITING_MODE=1` ile yazılım compositing'e
düşürülünce ana menü Android sürümüyle birebir aynı biçimde doğru render etti
(ekran görüntüsüyle doğrulandı). Pencere doğrulamadan hemen sonra kapatıldı.

Doğrulama: `pnpm high` tam geçti (1772/1772 test, önceki turun 3 yeni
dosyasındaki format/lint boşlukları dahil düzeltildi).

## 2026-08-28 — Android/dokunmatik platform katmanı ve sağlamlaştırma turu

Önceki oturum limite takılıp yarım bıraktığı için bu tur önce çalışma
ağacındaki tüm değişikliği ölçerek doğruladı, sonra kalan boşlukları kapattı.

- CORE'a öncül cihaz yetenek tespiti (`core/src/platform/`: `isTouchPrimary`,
  `hasTouchInput`, `canHover`, `shouldUseTouchControls`) ve tek sözleşmeli
  arka plan/ön plan algısı (`observeAppVisibility` — hem `visibilitychange`
  hem `blur`/`focus` dinler, Android'de bildirim gölgesi yalnızca `blur`
  üretir) eklendi. `VirtualActionSource` ekran üstü düğme basımlarını
  dokunmatik sağlayıcının kare durumuna, ayrı bir provider AÇMADAN, mandal
  (latch) semantiğiyle katıyor — iki kare arasına sıkışan bir dokunuş
  düşmüyor. Titreşim yüzeyi (`core/src/platform/haptics.ts`) adlandırılmış
  desenler + desen başına minimum tekrar aralığıyla salkım halinde gelen oyun
  olaylarında (art arda mermi/ölüm) eli uyuşturmuyor; varsayılan kapalı,
  vol-hell tarafında kayıtlı tercihe bağlanıyor.
- VOL.HELL'e dokunmatik kontroller (`TouchControls`: sağ altta dash + iki
  yetenek düğmesi, sağ üstte duraklatma — mekanik ikonlu, cooldown halkalı),
  Android donanım geri tuşu köprüsü (`MainActivity.kt` → `vol:androidback` →
  `backNavigation.ts`'in yığın tabanlı işleyici zinciri) ve arka plana
  geçince otomatik duraklatma + sanal basım temizliği eklendi. Ayarlar ekranı
  artık tüm güvenli alanı kaplayan bir `ScrollView` içinde kayıyor ve kapatma
  düğmesi panelden bağımsız, ekranın güvenli köşesinde sabit duruyor — kısa
  yatay ekranda panel taştığında "GERİ" görünmez olsa bile geri tuşu ikinci
  bir çıkış yolu sağlıyor. `gen/android` Tauri projesi elle düzenlenen
  `AndroidManifest`/tema/`MainActivity.kt` içerdiği için bilinçli olarak
  sürüm kontrolüne alındı (`gen/apple` hâlâ dışarıda — iOS hedeflenmiyor).
- Ana menü ses cızırtısının kök nedeni bulundu: `SfxBank` aktif sesleri
  `stop()` ile sıfır olmayan örnekte kesiyordu. Kaynaklar artık kısa bir
  kazanç rampasından sonra durduruluyor; olay başı limitin yanında olaylar
  ARASI global bir eşzamanlı ses tavanı (`globalMaxVoices`) ve fade kuyruğu
  için ayrı bir bağlı-kaynak tavanı (`globalMaxLiveVoices`) eklendi, salkım
  altında en eski/en az önemli ses düşürülüyor.
- `GameScene`nin `createScene()`'i artık tek bir `DisposableScope`
  (`runtimeScope`) sahipliğinde: her sistem oluşturulduğu anda kaydediliyor,
  elle tutulan ters-sıralı `destroy()` listesi kalktı. `BaseScene.create()`
  artık `createScene()` fırlatırsa `handleShutdown()`'ı kendisi tetikliyor —
  Phaser `create()` hata verince SHUTDOWN göndermeyi garanti etmiyor, aksi
  hâlde kısmi kurulum kaynakları açıkta kalırdı. `RunFinisher` bir kuşak
  (generation) sayacı kazandı: restart sonrası dönen eski bir istatistik-
  gönderim sonucu artık yeni koşunun üstüne özet ekranı açamıyor;
  `isScenePresent` da duraklatılmış sahneyi (kendi zorladığı duraklatma
  dâhil) "kapanmış" saymıyor.
- Kule (turret) artık düşman temasına karşı zırhlı: hasarın yarısını alıyor
  ve ortak bir temas-hasarı cooldown'u paylaşıyor, böylece aynı karede beşten
  fazla düşmanla çevrilmek kuleyi tek vuruşta silmiyor. Regresyon testi üç
  kule varyantının da kesintisiz grunt baskısında kendi aktivasyon
  cooldown'unun en az yarısı kadar ayakta kaldığını sayısal olarak
  doğruluyor.
- Yarım bırakılan işlemler tamamlandı: `prettier` hiç koşmamıştı (3 dosya),
  `eslint` iki gerçek hata taşıyordu (`SfxBank.test.ts`'te gereksiz `!`
  assertion, `MainMenuScene.test.ts`'te `import()` tip anotasyonu ve `any`
  member erişimi) — ikisi de kalıcı olarak düzeltildi, bastırılmadı. Kök ve
  `games/vol-hell` README'lerine Android build talimatı ve mobil/dokunmatik
  sözleşmesi bölümleri eklendi.

Doğrulama: `pnpm quick`, `pnpm high`, `pnpm signoff` (cargo check/fmt/clippy
dâhil) ve `pnpm exec just e2e-full` (Chromium + Firefox, ikinci turda
Playwright'ın Firefox ikilisi bu makineye kuruldu) tamamı yeşil;
`pnpm benchmark:core` ve `pnpm benchmark:vol-hell` regresyon göstermedi.

**Kalan risk:** Bu ortamda bağlı bir Android cihaz veya emülatör yok; APK
üretimi ve cihaz üstü menü/ayar/oyun/kart/pause/ölüm/zafer matrisi hâlâ elle
doğrulanmalı (araçlar hazır: NDK 27.2.12479018 ve rustup Android target'ları
kurulu, `ANDROID_HOME` bu kabukta tanımlı değildi). Fedora native paket
üretimi (`just tauri-build`) bu turda koşulmadı. PC'de TR/EN tüm ekranların
tam görsel/etkileşim taraması otomasyonla değil `pnpm dev` ile elle
yapılmalı — bu projede görsel doğrulama zaten büyük ölçüde bu şekilde.

## 2026-08-27 — P1/P2 borç kapatma ve VOL-HELL ability ilerleme denetimi

- Yaşam döngüsü kaynakları için `DisposableScope` ortaklaştırıldı; CORE,
  vol-ui ve VOL.HELL'in ilgili yüzeylerinde elle yönetilen cleanup dizileri
  kaldırıldı. Scope; subscription, listener, timer/rAF ve `destroy()` sahibi
  bileşenleri ters sırada, hata izolasyonuyla kapatıyor.
- Değer taşıyan UI kontrollerinin `onInput`/`onCommit` geçişi tamamlandı;
  `onChange` yalnızca seçim/aksiyon semantiği taşıyan bileşenlerde bırakıldı.
  Showcase, oyun sahneleri ve test tüketicileri yeni sözleşmeye taşındı.
- VOL.HELL için Phaser'sız `VolHellSimulation` + salt-okunur kopya snapshot ve
  render driver sınırı kuruldu. Dalga/düşman/ekonomi/pickup uzun koşusu ve
  render snapshot sahiplik testi bu yüzeyi kullanıyor; mevcut Phaser elite/boss
  özel yolu bilinçli olarak sınırın dışında ve dokümante edildi.
- Ability denetiminde sabit zincir şimşek/ateş alanı hasarlarının oyuncu
  `damage` statından kopuk kaldığı, tek kulenin de oyuncu `health` ve iç atış
  temposunu izlemediği ölçüldü. Tüm sabit hasar aileleri hasar oranını, kule
  canı ve iç atış aralığı ilgili statları takip ediyor; kule canı ve atış
  aralığı alt sınırlarla korunuyor. Çoklu atışın mevcut hasar sözleşmesi
  korundu; kart varyantlarının sırası rastgele buff artışıyla değiştirilmedi.
- CORE benchmark harness'i SpatialIndex rebuild/artımlı yol, PathFinder,
  Scheduler ve ObjectPool workload'larıyla genişletildi; VOL.HELL simülasyon
  adımı ile render snapshot kopyası için ayrı benchmark komutu eklendi.
- Asset Studio `DocumentSession` kirliliği paralel stamp sayaçlarından
  `CommandHistory` state token'ına taşındı; history budget eviction, undo/redo
  ve oversized command regresyonları eklendi.
- VisualSynth bellek tahmini bilinen tampon, geçici scratch, metadata ve %50
  güvenlik payını ayrı raporlayan muhafazakâr modele taşındı. RenderCache
  sahiplik kopyalarının byte/işlem telemetry'si benchmark çıktısına eklendi.

Bu turda bilinçli olarak config taban değerleri körlemesine artırılmadı: sorun
varyantların geç oyunda oyuncu build'inden kopmasıydı ve çözüm önce ortak stat
ölçeklemesiyle güvenceye alındı. Son doğrulamada `pnpm quick`, `pnpm fast`,
`pnpm high` ve `pnpm signoff` yeşil geçti; signoff içindeki Asset Studio tam
matrisi Chromium ve Firefox'ta 38/38 test tamamladı. `pnpm run doctor:env`, CORE
ve VOL.HELL benchmark komutları, `git diff --check` ve ilgili hedefli testler de
başarılıdır. Playwright Chromium ikilisi bu makinenin yerel önbelleğine kuruldu;
gerçek cihaz ve uzun süreli oynanış smoke testi otomatik kapı değildir ve kalan
operasyonel risktir.

## 2026-08-26 — VOL-HELL kapsamlı hardening turu

- Runtime sayıları ortak sonlu/saturating yardımcılarla sınırlandı; oyuncu,
  düşman, mermi, ability, telegraph, efekt, dalga ve ekonomi sınırlarında
  `NaN`/`Infinity`/negatif delta artık durumu zehirleyemiyor.
- Scene restart temizliği genişletildi: klavye key sahipliği, Phaser entity
  yöneticileri, DOM kart ekranları, async telegraph'lar ve eski müzik yükleme
  nesilleri kapatılıyor. `BaseScene` alt sınıf temizliği hata verse bile kendi
  listener/rAF/UI kaynaklarını finally ile bırakıyor.
- Ses ayarı yazmaları snapshot + sıralı kuyrukla persist ediliyor; `flush()`
  gerçekten devam eden yazmayı bekliyor. SFX ilk çalma zamanı, geçersiz
  AudioParam seçenekleri ve release sonrası geç cache yazımı için regresyonlar
  eklendi.
- Kart envanteri dış dizi mutasyonuna kapatıldı; ability upgrade'leri işaretli
  doygunlukta çalışıyor ve kısmi commit geri alması önceki değerleri birebir
  geri yüklüyor.
- Geniş değişiklik yüzeyi `games/vol-hell` kodu/testleri ile bu kaydın ve paket
  README'lerinin güncellenmesiyle sınırlıdır; bu turda commit/push bilinçli
  olarak yapılmayacak. Kalan doğrulama resmi workspace kapıları ve gerçek
  tarayıcı/cihaz smoke testidir.

## 2026-08-25 — VisualSynth P0/P1/P2 ve güvenli inceleme yüzeyi

- `VISUAL_SYNTH_CAPABILITIES` manifesti şemadan türetiliyor; determinism,
  palette lock, headless sınırı ve bilinçli 2B/3B/AI kapsamı CLI üzerinden
  okunabiliyor (`capabilities --json`).
- `benchmark` komutu ısınma sonrası render/QA sürelerini, piksel sayısını ve
  süreç RSS değerlerini ve render aşama sürelerini raporluyor; henüz makine
  bağımsız performans eşiği uydurmuyor.
- `inspect` komutu render etmeden alan düğümü, tampon ihtiyacı, scatter talebi
  ve yaklaşık tepe çalışma belleğini raporluyor; cache/tile kararı artık
  graph ölçümüne dayanabilir.
- QA sonlu kanal değerlerini, anlamsal kanal aralıklarını ve scatter'ın kabul/
  minimum mesafe tutarlılığını kapıdan geçiriyor; renderer opt-in aşama
  profiliyle bu metriklerin maliyeti ayrıca görülebiliyor.
- `sdf.path` sabit maliyetli capsule zinciri olarak eklendi; açık/kapalı path,
  endpoint ve birleşim regresyonları var.
- `sdf.smoothUnion`, `sdf.smoothSub` ve `sdf.smoothIntersection` eklendi;
  `k=0` sert boolean davranışına iner.
- `scatter` varsayılan grid davranışını koruyor; opt-in deterministik Poisson
  dağılımı `distribution` ve `minDistance` ile geliyor. Tileable kenar mesafesi
  uzamsal kovada denetleniyor.
- Capability, path, smooth SDF, Poisson ve benchmark için regresyon testleri
  eklendi.

- `inspect` graph ölçümü artık gerçek bir region/halo sözleşmesine bağlı:
  komşuluk/tampon/ışık/post isteyen belgeler güvenli olmayan tile isteğini
  reddeder; halo'suz belgeler global koordinatlarla doğrudan bölge render'ı
  yapar ve tam kare crop'u ile bit düzeyinde eşleşir.
- `RenderCache`, çağıranın verdiği byte ve giriş sayısı bütçeleriyle bounded
  LRU olarak eklendi. Cache global değildir, profil ölçümünü atlamaz ve typed
  array/graph mutasyonunu girdiye geri sızdırmaz.
- Asset Studio Quick Look'a salt-okunur VisualSynth inspector eklendi:
  kaynak graph, kanal önizlemesi, QA, gerçek render aşama profili, tampon
  maliyeti ve region/halo engelleri görünür; JSON varlık yazılmaz.
- `brushedMetal`, `warmWood`, `coarseStone`, `organicFlesh` ve
  `emissiveGlow` şekilden bağımsız malzeme tarifleri ile doğrulanabilir test
  kartları eklendi. P2 ışık diliminde emission ve palette-safe glow var;
  glow'un kısmi alfası QA sözleşmesine açıkça dahil edildi.

Kalan: sonlu halo hesabını buffered/normal/AO/post zincirlerine genişletmek;
benchmark çıktısını tüketen Web Worker eşiğini gerçek hedef makinelerde
ölçerek seçmek; atlas/variant, normal-map dışa aktarımı ve daha fazla malzeme
tarifi için gerçek tüketici eklemek. 3B kamera, depth/shadow mapping,
specular/Fresnel/IBL/PBR ve üretken AI core kapsamına alınmadı.

## 2026-08-25 — vol-ui ikinci denetim: yaşam döngüsü, erişilebilirlik ve dar ekran

- `Popup.destroy()` açık durumu kapatmıyor ve yok edilmiş popup yeniden açılabiliyordu; yok etme artık idempotent, kapalı ve yeniden açılamaz. Regresyon testi eklendi.
- `ColorPicker.setLabel()` görünür etiketi değiştirirken swatch/hex/popover erişilebilir adlarını eski bırakıyordu; tüm ilişkili yüzeyler birlikte güncelleniyor ve hazır renk düğmeleri ad taşıyor.
- Showcase grid'inde dar ekranda `span:2` kartlar örtük sütunla taşabiliyor; tek sütun medya kuralı eklendi. Kart picker satırında kısa kartın uzun karta zorla gerilmesi kaldırıldı.
- Joystick eksen okuması ve kritik floating text artık i18n kaynaklarından geliyor.

## 2026-08-25 — vol-ui görsel hata avı: kök neden `box-sizing` eksikliği

Ekran görüntüleriyle bildirilen sekiz ayrı belirti tek bir kök nedene indi:
`devtools/vol-asset-studio` kendi `* { box-sizing: border-box }` sıfırlamasını
taşıyordu, oyun `UIRoot`'un `.vol-ui-root *` kuralından aynı sıfırlamayı
alıyordu — **vol-ui showcase hiçbirini almıyordu.** Sonuç: `width:100%` +
padding taşıyan her primitif (TextArea, Input, Checkbox track'i) content-box'ta
gerçek boyutun üstüne padding/border ekleyip taşıyordu.

- `devtools/vol-ui/src/styles.css`'e evrensel `* { box-sizing: border-box }`
  eklendi (Asset Studio'nun deseniyle aynı). Bu tek satır TextArea'nın sağa
  taşmasını, PropertyField içindeki Input'un taşmasını ve Checkbox thumb'ının
  track'in sağına tam yaslanmamasını (kalan `translate(20px)` → `18px`
  düzeltmesiyle birlikte) çözdü.
- `.vol-showcase-card-grid` sabit `repeat(4, minmax(0,1fr))`den
  `repeat(auto-fit, minmax(260px,1fr))`e döndü — bir dönem responsive iken
  sabit 4 sütuna değiştirilmiş, kod yorumunda eski davranış hâlâ yazılıydı.
  Pencere daralınca artık sütun sayısı azalır (4→1), kart genişliği hiç
  260px'in altına düşmez.
- **Kritik:** `ColorPicker`'ın kutucuğu `<input type="color">` idi ve
  tıklanınca TARAYICININ kendi diyaloğunu açıyordu (Firefox'ta ayrı bir "Bir
  renk seçin" penceresi — VOL temasız, fontsuz, i18n'siz). Kutucuk artık sade
  bir düğme: mevcut rengi gösterir, `swatches` verildiyse VOL'un kendi
  `Popover`'ında hazır renk ızgarasını açar. Kesin/keyfi değer her zaman
  hex alanından girilir. `.vol-card-shop__reroll-row` mekanizması dokunulmadı.
- HUD sekmesinde Minimap ↔ FloatingText yer değiştirdi; FloatingText artık
  BuildMenu'nün altında tam satır (`spanAll`).
- Workbench sekmesinde: gereksiz Toolbar+Popover demo kartı (FORMLAR'daki ikon
  buton galerisiyle örtüşüyordu) kaldırıldı; PropertyField kartı boşalan
  satırı tam kaplıyor; İkon Kaydı `width:100%` eksikliğinden sağda boş kalan
  alanı artık `auto-fill` ızgarasıyla dolduruyor; SplitPane'in görüntüleyici
  çubuğunda `.vol-button`'ın taban `width:100%`ü Sığdır/%100 düğmelerini
  `flex-basis`e çevirip ipucu metnini tek sözcüklük bir sütuna sıkıştırıyordu
  (`panel-demo__controls`daki gibi `flex:none; width:auto` eklendi).
- `ShopPicker`'ın `vol-card__action--secondary` sınıfı JS'te atanıyor ama hiç
  CSS kuralı yoktu — kilit/sat/tak butonu satın al ile birebir aynı görünüyordu.
  Ghost stil eklendi; birincil aksiyon artık görsel olarak öne çıkıyor.

Doğrulama: `pnpm high`, core/vol-ui/vol-asset-studio/vol-hell testlerinin
tamamı, dört paketin production build'i, her değişiklik canlı Playwright
ekran görüntüsüyle doğrulandı.

## 2026-08-25 — `core/visual` → `core/visualSynth` yeniden adlandırıldı

`core/visual` yalnızca prosedürel raster **sentez** motoruydu ama adı bunu
söylemiyordu — `audio/synth`'in görsel karşılığı olduğu hâlde `Synth`
isimlendirme desenini taşımıyordu (bkz. `audio/music` gibi senteze
GİRMEYEN bir kardeşi olmadığı için "visual" domain adı yanıltıcı kalıyordu;
`audio`'da bu risk yok çünkü sentez zaten kendi `synth/` alt yolunda ayrı).

Değişenler: `core/src/visual` → `core/src/visualSynth`; kök export
`Visual` → `VisualSynth`; `core/package.json`'daki `./visual*` subpath'leri
→ `./visualSynth*`; CLI script'leri `visual-asset.ts`/`visual-qa.ts` →
`visual-synth-asset.ts`/`visual-synth-qa.ts`; `core/tests/visual` →
`core/tests/visualSynth`; `visualHeadless.test.ts` →
`visualSynthHeadless.test.ts`; `primitiveNeutrality` `PRIMITIVE_ROOTS` ve
`publicSurface` `EXPECTED_VISUAL_EXPORT_COUNT` güncellendi.
`core/docs/visual-synthesis.md` içindeki tüm kod yolları eşlendi; **doküman
dosyasının kendi adı bilinçli olarak değişmedi** (doktrin adı hâlâ "görsel
sentez"). Tek dış tüketici `devtools/vol-asset-studio/src/editor/Palette.ts`
güncellendi. Fonksiyon/tip adları (`createVisualPreset`, `createVisualArtifact`
vb.) kapsam dışı bırakıldı — kullanıcı onayı yalnızca klasör/export/CLI script
adlarını kapsıyordu.

Doğrulama: `pnpm high`.

## 2026-08-25 — VOL Cursor ailesi kaldırıldı

`core/src/input/cursor/*` (20 vektörel cursor, DOM/Phaser renderer, context
entegrasyonları) ve bağımlı her yüzey — vol-ui INPUT sekmesi, Asset Studio ve
vol-hell cursor context'leri — tamamen söküldü. `publicSurface.test.ts` export
sayacı güncellendi. Doğrulama: `pnpm high` + vol-ui showcase manuel kontrolü.

## 2026-08-24 — P0/P1 ve Asset Studio lease/save düzeltmeleri

Asset Studio yazma lease'i mutation uçlarında (`audio/render`,
`save-transactions`, `delete`, `restore`) `EditorLeaseManager.assertEditor`
ile denetleniyor; `AssetStudioClient` acquire/renew/ensureLease taşıyor.
`SaveTargetRequest` gereksiz alanlarını kaybetti, boş payload ve
`transactionId` türü doğrulanıyor. Doğrulama: `pnpm high` tam geçti.

## 2026-08-24 — Asset Studio UI/UX ve ses önizleme

VOL.UI font yükleme sorunu çözüldü (`publicDir` → `core/public`). Kart
animasyon/tooltip sağlamlaştırması; sol ray butonları ortak `Tooltip`'e
taşındı. Ses editörüne 7 işlem (gain/trim/fade/normalize/reverse/clear) için
önizleme uç noktası ve istemci desteği eklendi. `MusicEngine.dispose()` durum
sıfırlama kazandı; `core/docs/music-engine.md` gerçek API'ye göre temizlendi.
Doğrulama: `pnpm high` tam geçti.

**Kalan risk:** önizleme testi sahte `URL`/blob kullanıyor; gerçek tarayıcı
performansı ayrı doğrulanmalı.

## 2026-08-23 — Asset Studio Aşama 0–9: repo-varlık aracı ayağa kalktı

`devtools/vol-asset-studio` sıfırdan kuruldu: repo hostu (LAN token, SSE
watcher, edit lease), Phaser'sız DOM editör kabuğu, tam piksel düzenleme
(katman/blend/seçim/transform, unpremultiplied RGBA), palet sistemi (CORE
renk matematiği üzerine), sprite sheet + `.volsprite.json`, türetilmiş varlık
modeli (`.volpost.json` piksel deltası — generator yeniden ürettiğinde
kullanıcının işi korunur), ses işleme (frame-doğru tarif derleyicisi, kanal
başına min/max peak piramidi), repo zekâsı (geri alınamaz `unlink` yerine
çöp alanına taşıma, referans taraması, onaysız uygulanmayan rename önizleme)
ve sertleştirme (responsive, e2e Chromium+Firefox matrisi).

Yol boyunca eski `games/vol-forge` tamamen emekliye ayrıldı (motor ve CLI
korunarak, yalnız web arayüzü söküldü — asıl çalışan yol zaten agent'ın
`SpriteDoc`u doğrudan yazıp CLI ile render/QA etmesiydi); `createForgeArtifact`
→ `createVisualArtifact`, `core/scripts/forge.ts` → `visual-synth-asset.ts`.

Kalıcı kararlardan ikisi: `[hidden] { display: none !important }` merkezi CSS
kuralı + governance testi (dağınık `[hidden]` istisnaları tekrar tekrar aynı
gizleme hatasını üretiyordu); tanımsız `--vol-*`/`--studio-*` custom property
taraması (stylelint sözdizimi geçerli olduğu için yakalamıyordu).

Doğrulama: her aşama sonunda `pnpm high` tam geçti.

## 2026-08-22/23 — Görsel sentez motoru: Tur 1–5 ve `vol-forge` editörü

`core/docs/visual-synthesis.md` §12'nin beş turu uygulandı: çekirdek iskelet
(üreteç/birleştirici/domain/filtre cebiri, D2 birim uzay, D7 tampon havuzu) →
cebiri tamamlama (döşeme, `scatter`, filtre-düğüm birleşimi, dikiş metriği) →
biçim ve stil (gölgeleme, dış çizgi, dither, palet sentezi, ölçüm metrikleri)
→ `vol-forge` editörü (Phaser'sız DOM, şemadan üretilen kontroller) → tek
ekran üretim ürünü (niyet → katalog tarifi → canlı sonuç → kaydetme; ileri
düzenleme modu ve teknik yüzey tamamen kaldırıldı).

Tur 5 denetimi, Tur 1–4'ün üç iddiasının (`domain` zinciri düzenleyicisi,
veri paleti rampa editörü, çıktı geri yükleme yüzeyi) editör tarafında hiç
uygulanmadığını doğruladı — çekirdek ve sunucu destekliyor, ileri arayüz ayrı
iş olarak kaydedildi. `vol-forge` daha sonra (Asset Studio Aşama 4) tamamen
kaldırıldı; motor ve CLI (`core/scripts/visual-synth-asset.ts`) korundu. Kalan açık
uçlar `core/docs/visual-synthesis.md` §13'te güncel tutulur.

Doğrulama: her tur `pnpm high` ile kapandı.

## 2026-08-20 — Profesyonel kod avı: ~47/63 bulgu çözüldü

6 paralel subagent + doğrulamayla derin bir bulgu taraması yapıldı. Kritik
bulgular kapatıldı: Tauri bundle `targets` eksikti (Windows nsis/msi, Android
apk eklendi), Carousel pointer listener sızıntısı, reverb `tailSeconds`
sample-rate'e bağlanmamıştı, `StateMachine` hata durumunda `current` geri
alınmıyordu. Orta/düşük öncelikli ~30 bulgu (magic number, i18n eksikleri,
listener temizliği) kapatıldı. God-object ve AGENTS.md bulguları kullanıcı
talimatıyla kapsam dışı bırakıldı; 3 bulgu yanlış pozitif doğrulanıp atlandı.

## 2026-08-18/20 — CORE'un katmanlanması, domain saflığı ve sertleştirilmesi

CORE, VOL.HELL geliştirilirken bulunamayıp sıfırdan yazılan jenerik
mekanizmaları (`SpatialGrid`, `EffectManager`, `CollisionResolver`,
`WaveManager`, vb.) üç katmanlı bir sözleşmeye oturttu: **mekanizma** (oyun
kelimesi bilmez) → **sunum** (durum çizer, kural taşımaz) → **tarif** (opt-in
kısayol — bkz. `AGENTS.md` CORE Katmanları). On dört yeni headless primitif
eklendi (`Scheduler`, `Grid`, `findPath`/`PathFinder`, `FlowField`,
`EventBus`, `SpatialIndex`, interpolasyon fonksiyonları, vb.), her biri gerçek
bir tüketiciyle (ikinci somut tüketici kuralı) doğrulandı.

Paralel olarak domain sızıntısı temizlendi: stat sözlüğü (`StatKey`) ve eylem
sözlüğü (`fire`/`dash`) CORE'dan `games/vol-hell/src/config/`e taşındı;
`InputState<TAction>` jenerik hâle geldi, tuşlar veri olarak yeniden
atanabilir oldu. Primitiflerin JSDoc'undaki "tower defense" gibi tür örnekleri
de temizlendi — bir primitif yaptığı işle anlatılır, örnek gerekiyorsa
mekanizmanın kendi terimleriyle verilir (`primitiveNeutrality` bekçisi).

Sistemik sağlamlaştırma: sonlu-sayı sözleşmesi (`math/numeric.ts`, yapılandırma
NaN/Infinity'yi reddeder, akış yoksayar), sonuç-tamponu sözleşmesi
(`queryInto` + query-stamp — `SpatialIndex.query()`'nin döngüsel tamponu
saklanan eski sonuçları sessizce bozuyordu), `ObjectPool` sahiplik takibi,
`Scheduler` yeniden-giriş koruması, `DisposableScope`'un norm hâline
getirilmesi (elle yönetilen cleanup dizileri bir bekçiyle yasaklandı),
Diagnostics'ten singleton'ın tamamen kaldırılması (taşıma katmanı ayrıldı,
CORE artık hiçbir ağ isteği açmaz), ve evrensel dokunmatik-hedef/etkileşim
politikası (`hitTargetSync.test.ts` — CSS'teki her `cursor: pointer` kuralı
token tüketir ya da gerekçeli muaf olur).

Ayrıca: menü müziği sıradan ilerlemiyordu (`MusicPlaylist` eklendi — Fisher-
Yates karıştırma, tükenince yeniden karıştırma); `ShopPicker` reroll/refresh
niyetini sezgiyle tahmin ediyordu (`ShopPickerState.transition` eklendi).
Kalite kapıları `just` ile local-first'e geçti (bulut CI yok);
`workspace-contract.mjs` ve `quality.json` paket/eşik paritesini tek kaynaktan
zorunlu kılıyor; `scripts/quality/report.mjs` kapıları makine-okunur raporlar.

Doğrulama: her alt-tur `pnpm signoff`/`pnpm high` ile kapandı; CORE public API
yüzeyi ve kapsam eşikleri kilitlendi (bkz. `core/tests/governance/
publicSurface.test.ts`, `quality.json`).

## Açık borç ve riskler

Kapatılmamış, bilinçli olarak taşınan maddeler. Kapanan bir madde bu listeden
silinir; kronolojiye not düşülmez.

**Yapı**

- `GameScene.ts` (618 satır), `SlotGrid.ts` (687 satır) ve `Kanban.ts`
  (831 satır, `core/src/ui/data/`) god-object sınırının (~600) üstünde. Kalan
  kod zaten sahnenin/bileşenin kendi sorumluluğu; daha fazla bölmek satırı
  taşır ama test edilebilirlik kazandırmaz — bilinçli olarak durduruldu.
- `SpatialIndex`in artımlı yolu renderer-neutral `VolHellSimulation` içinde
  üretim modelinin parçası; Phaser `GameScene` ise aynı frame snapshot'ını ve
  separation sırasını korumak için hâlâ `rebuild()` kullanıyor. Phaser yolunu
  artımlıya taşımak, iki hareket fazının davranış eşitliğini koruyan ayrı bir
  entegrasyon ve cihaz benchmark'ı gerektiriyor.
- CORE public API yüzeyi kilitli bir sayıyla büyüyor (güncel sayı
  `core/tests/governance/publicSurface.test.ts`te), 13 `export *`
  barrel'ıyla. Barrel'ları elle listeye çevirmek büyük bakım yükü getirir;
  yüzey şimdilik SAYIYLA korunuyor.
- `PlayerController` → `MovableController` takma adı hâlâ `@deprecated`
  duruyor; kaldırma bir sonraki büyük sürüme bırakıldı.
- ~~`AGENTS.md` ve `devtools/pen.dev/AGENTS.md` `.gitignore`da~~ — **kapandı
  (2026-09-04).** Yerelde tutuldukları sürece kural güncellemeleri hiçbir
  commit'e girmiyordu; ikisi de artık repoda.
- CORE headless primitiflerinin benchmark/workload tüketimi genişledi; ancak
  `EventBus`, `Deck`, `SlotContainer`, `FlowField` ve benzeri bazı yüzeylerin
  hâlâ ikinci gerçek ürün tüketicisi yok. Bu, mekanizma doğrulamasından ayrı
  bir entegrasyon borcu olarak duruyor.
- Tuşlar yeniden atanabilir durumda (`PCActionBinding` veri hâlinde) ama
  bunu oyuncuya açan bir ayar ekranı yok.
- `TouchButton` adı taşıdığı semantiği (girdi cihazından bağımsız press/hold)
  tam karşılamıyor; yeniden adlandırma bedeli (public API + showcase + i18n)
  gerekçesiyle ertelendi.

**Kalite kapıları**

- Bulut CI yok; kapılar yalnızca local `just` ile koşar, hook'lar
  `--no-verify`/`SKIP_SIMPLE_GIT_HOOKS=1` ile atlanabilir. Atlanan bir hook
  raporlanmalıdır.
- Görsel doğrulama büyük ölçüde elle yapılıyor (`pnpm dev`); tarayıcı
  otomasyonu yalnızca Asset Studio e2e'de var.
- `vol-hell`in `GameScene`/`MainMenuScene`/`SettingsScene` gibi Phaser'a
  gömülü sahneleri mock maliyeti yüksek olduğu için düşük kapsamda kalmaya
  devam ediyor — kabul edilen bir sınır (bkz. `quality.json` eşikleri).

**Oynanış / UI**

- Ability stat ölçeklemesi ve kule dayanıklılık/tempo bağı artık runtime ve
  regresyon testleriyle korunuyor; hedefleme, alan kapsaması ve gerçek cihaz
  FPS'i matematiksel benchmark'ta temsil edilmediği için 20 dalgalık manuel
  oynanış smoke testi hâlâ gerekli.

- `ShopPicker` reroll'unda eski kartlar çıkış animasyonu almadan yok
  ediliyor (yeni kartların aynı hücreye girişini engellememek için) —
  bilinçli "sert değişim" hissi.
- iOS/WKWebView MP3 fallback'i (`pnpm convert:ios`) manuel kalıyor; iOS şu
  an hedeflenmiyor (bkz. `AGENTS.md` Kimlik — Windows/Android hedefleri).
