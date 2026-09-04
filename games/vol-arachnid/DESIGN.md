# VOL.ARACHNID — tasarım notları

Bu belge, [README](README.md)'de yeri olmayan tasarım kararlarını taşır: uzuv
çözümü, export hattı, ölçüm sonuçları ve denge modeli. README ne olduğunu ve
nasıl çalıştırılacağını anlatır; burası NEDEN böyle olduğunu.

## Uzuv çözümü

Her uzuv, opsiyonel bir SABİT kök kemik + iki kemikli ters kinematik çiftidir.

Bacaklarda kök `coxa`'dır (36 px, en kısa) ve IK dışında tutulur: üç eklemli
zincirdeki çözüm belirsizliğini kapatır ve uzvu gövdeye bağlı bir dizilimde
tutar. Duruş açısı ile ayak yönü arasında `rootFollow` oranında paylaşır;
kalan `femur` (54) ve `tibia`+`claw` (72) CORE'un `solveTwoBoneIk`'iyle
çözülür.

Arka itici uzuvlarda sıralama TERSTİR — kök 50 px, kalan kemikler 26 ve 12.
Orada kök SABİTLENMEZ, doğrudan IK çiftinin ilki olur. Sabitlenseydi o uzun
kemik hiç dönmezdi: gövde ileri yürürken ayak duruş EKSENİ boyunca gidip
gelir, yani açı değişmez yalnız mesafe değişir; uzuv salınmak yerine
sürüklenirdi.

Ayaklar dünya uzayında sabitlenir (`LegGait`); gövde ilerledikçe geride
kalırlar ve eşiği aşınca öne adım atarlar. Adım sırası gruplar arasında
dönüşümlüdür, yani gövde her an en az bir grup ayak üstündedir.

Arka iki uzuv (`tl`/`tr`) kısa İTİCİ bacaklardır ve iki noktada bacaklardan
ayrılırlar:

- **Adım boyu** (`strideScale`) kısadır. Ayak, evinden `stepTriggerPx` kadar
  uzaklaşana dek yerde kalır; 88 px'lik bir uzuvda bacakların eşiği erişim
  payını aşar ve uzuv stride'ın yarısından fazlasını TAM GERİLİ, yani yerde
  sürüklenerek geçirirdi.
- **Sıra beklemezler** (`freeStep`). Sıra disiplininin tek amacı "gövde her an
  desteklidir" güvencesidir ve gövdeyi sekiz bacak taşır; kısa iticiler o
  güvencenin parçası değildir. Sıraya sokulduklarında kendi eşiklerini çoktan
  aşmış hâlde bekliyorlardı.

Atılım boyunca yürüyüş döngüsü TAMAMEN durur ve uzuvlar tek bir uçuş pozunda
tutulur (`gaitConfig.flightLift`); açık bırakıldığında uzuvlar acil adım
yağmuruna girip yerinde titriyordu. Ayaklar yere değmediği için toz da kesilir;
karşılığı atılımın bittiği karededir — bütün ayaklar aynı anda iner ve toplu
bir toz patlaması bırakır.

## Duruş kaynak pozdan TÜRETİLMEZ

Export'ta her uzuv düz bir çizgidir; dizilim yalnızca parçaları okunur biçimde
yan yana koymak içindir. Duruş açıları `config/gait.ts` içinde İLERİ EKSENDEN
ölçülerek bildirilir (0° ileri, +90° sağ, 180° arka). Kaynak pozdan okunan
"dinlenme açısı" bir duruş değildir.

## Pencil export hattı

Rig sanatı `devtools/pen.dev/pen/entities.pen` içinde yaşar ve
`pen_export/enemies/arachnid/` altına export edilir; hattın kuralları
[devtools/pen.dev/AGENTS.md](../../devtools/pen.dev/AGENTS.md) ve
[README](../../devtools/pen.dev/README.md) dosyalarındadır.

**Bu paket export ağacını OKUMAZ.** `rig:sync` doğrulanmış export'u buraya
kopyalar — metadata `src/assets/rig/`, parça PNG'leri `public/assets/rig/` —
ve çalışma zamanı yalnız kendi ağacını görür.

**Ölçüldü:** `devtools/` tamamen kaldırılıp `vite build` doğrudan çağrıldığında
derleme geçiyor ve 72 rig parçasının hepsi çıktıya giriyor — build grafiği o
ağaca hiç uzanmıyor. (`pnpm build:arachnid` yine de düşer: pnpm, kayıp bir
workspace paketini kendi tutarlılık kontrolünde yakalar. Bu bir kod bağımlılığı
değil paket yöneticisi sorunudur; `devDependencies` girdisi de silinirse o da
kalkar.) Bir oyunun çalışma zamanı asset'ini üreten araca
bağlanmamalıdır (bkz. kök [AGENTS.md](../../AGENTS.md), "Bozulamaz Kurallar" 4);
kural `pnpm quick` içindeki `workspace-contract` kapısıyla korunur.

Rig'i okuyan katman (`validateRigMetadata`, `buildRigDefinition`,
`articulateRigDefinition`, `assembleRig`) `@volstudio/core`dadır: bunlar bir
aracın API'si değil, üretilmiş verinin sözleşmesidir. `config/rigAssets.ts`
metadata'yı çalışma zamanında doğrular ve parça URL'lerini onun `file`
alanlarından türetir; disk paritesi `tests/config/rigAssets.test.ts` ile
kapatılır — `import.meta.glob`un bıraktığı derleme zamanı garantisinin
karşılığı odur.

Yayımlanmış export DÜZDÜR: metadata `parentPartId` taşımaz, yani tüm parçalar
kökün kardeşidir. Eklemsiz bir zincirde yalnız uçlar sürülebilir; ara kemikler
export pozunda donar ve uzuv kopuk görünür. Eklem şeması bu yüzden
`config/rig.ts` içinde VERİ olarak bildirilir ve montajdan önce
`articulateRigDefinition` ile uygulanır — üretilmiş metadata dosyasına
dokunulmaz, bir sonraki export bu kararı ezmez. Manifest'e `parent` alanı
eklenip export yeniden üretilirse bu şema gereksizleşir.

## Ölçüm

`pnpm benchmark:vol-arachnid` iki yükü AYRI ölçer, çünkü ikisi farklı sebeplerle
büyür: **simülasyon** (gövde + ikincil hareket + yürüyüş + IK) uzuv sayısıyla,
**sunum** (poz gölgesi + art-görüntü) rig'in parça sayısıyla. Tek bir "kare
başına ms" sayısı hangisinin pahalandığını gizler.

Referans ölçüm (1000 kare × 25 örnek, 16 ms adım): simülasyon
~0,005 ms/kare (kare bütçesinin ~%0,03'ü), poz efektleriyle birlikte
~0,071 ms/kare (~%0,45). Yani 72 parçalık bir rig'de yaratığın CPU maliyetinin
neredeyse tamamı SUNUM tarafındadır — gölge her karede 72 dönüşüm günceller ve
atılım boyunca art-görüntü bunu çoğaltır. Bir bütçe aşımında bakılacak yer
burasıdır, yürüyüş döngüsü değil.

Ölçüm ayrıca poz gölgesinin PARÇA SAYISINA göre eğrisini verir; ölçülen değer
parça başına ~0,8 µs/kare ve doğrusaldır. Yani sınır uzuv sayısı değil parça
sayısıdır: 16 ms'lik bir karenin %10'unu efektlere ayırmak istersen üst sınır
~2000 parçadır. Kare adımının yığın ayırması da ölçülür (~600-700 bayt/kare);
sıcak yol bilinçli olarak ödünç nesnelerle çalışır ve bu sayı o kararın tutup
tutmadığını söyler. Temiz ayırma ölçümü için `NODE_OPTIONS=--expose-gc` ile
çalıştır.

Sayılar makineye özeldir ve kapı EŞİĞİ DEĞİLDİR; oran ve büyüme yönü anlamlıdır.

## Denge ölçümü

Yürüyüş döngüsü dengeyi SIRA disipliniyle korur: bir grup adım atarken diğeri
yerde kalır. O disiplin bir güvence verir ama ÖLÇMEZ — acil adım sırayı
deldiğinde güvencenin hâlâ tuttuğunu kimse söyleyemiyordu.

CORE'un `measureSupport`u basılı ayakların dışbükey zarfını kurar ve gövdenin
ona göre payını ölçer (`legs.support`). Bu bir fizik motoru değildir: kütle,
kuvvet, kısıt çözücü yok. Tek soruyu cevaplar — gövde, üzerine bastığı alanın
içinde mi?

İlk ölçüm gizli bir gerçeği gösterdi (6000 kare, sabit tohum):

| Rejim                             | Desteklenen kare | Üçten az ayak yerde |
| --------------------------------- | ---------------- | ------------------- |
| 16 ms — sabit yön                 | %98,4            | %1,0                |
| 16 ms — sık yön değişimi          | %67,2            | %23,9               |
| 16 ms — sık yön değişimi + atılım | %22,2            | %47,0               |
| Karışık delta — aynı akış         | %54,8            | %22,9               |

Atılım inişinden sonraki acil adım fırtınasında üçten az ayak yerde kalıyor ve
destek alanı çöküyor: 16 ms'lik karelerde bu, karelerin neredeyse yarısı.
Karışık delta satırının daha "iyi" görünmesi bir iyileşme DEĞİL — dev kareler
adım döngüsünü hızla ilerletip fırtınayı daha az karede geçirtiyor. Görünür bir hata DEĞİL — oyunda devrilme modeli yok,
yaratık düşmez — ama kod yorumlarının iddia ettiğinden zayıf. Adım
zamanlamasına dokunmak büyük bir davranış değişikliğidir ve ölçmeden
yapılmamalıydı; ölçüldü, `tests/runtime/locomotion.test.ts` içinde mandalla
kilitlendi, değiştirilmedi. Oranı yükseltmenin yolu denge düştüğünde
DÜZELTİCİ ADIM planlamaktır ve o ayrı bir turun konusudur.

## HUD ve arena

Kamera arenayı `arenaConfig.viewportGutterPx` boşluklarının İÇİNE sığdırır;
HUD yalnız o boşluklarda yaşar ve oyun alanına hiçbir koşulda binmez. Ölçüler
`ArachnidHud` tarafından CSS değişkeni olarak yayımlanır, yani iki taraf ayrı
sayı tutmaz.

Dokunmatik cihazda tam arena küçültülmez; kamera gövdeyi arena sınırları içinde
takip eder. HUD, atılım ve modal aynı CORE `UIRoot` katmanını paylaşır. Bu kök
mobil metin seçimini, çağrı balonunu ve dokunma parlamasını kapatır; butona uzun
basmak tarayıcının kopyalama/seçim davranışına dönüşmez.
