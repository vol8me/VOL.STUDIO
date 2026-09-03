# VOL.ARACHNID

Eklemli bir örümcek rig'inin ters kinematikle sürüldüğü, sabit arenalı hareket
deneyi. Oyun döngüsü yoktur: paket, uzuv çözümü, yürüyüş, ağırlık hissi ve
sunum efektlerinin (iz, gölge, toz) çalışıldığı yüzeydir.

## Yığın

Phaser 4 · TypeScript · Vite · `@volstudio/core` (paylaşılan sistemler + UI
kiti) · `@volstudio/pen.dev` (rig montajı)

Monorepo geneli için [kök README](../../README.md)'ye bakın.

## Komutlar

| Komut                                             | İş                                   |
| ------------------------------------------------- | ------------------------------------ |
| `pnpm --filter @volstudio/vol-arachnid dev`       | Vite dev sunucusu (`localhost:5178`) |
| `pnpm build:arachnid`                             | Web üretim derlemesi (`dist/`)       |
| `pnpm tauri:arachnid:build`                       | Masaüstü native paket                |
| `pnpm tauri:arachnid:android:dev`                 | Bağlı Android cihazda geliştirme     |
| `pnpm tauri:arachnid:android:build`               | Android APK                          |
| `pnpm --filter @volstudio/vol-arachnid audio:qa`  | Üretilmiş ses varlıklarını doğrular  |
| `pnpm --filter @volstudio/vol-arachnid rig:sync`  | Rig export'unu bu pakete gönderir    |
| `pnpm benchmark:vol-arachnid`                     | Locomotion ve poz-efekt ölçümü       |
| `pnpm --filter @volstudio/vol-arachnid test`      | Vitest                               |
| `pnpm --filter @volstudio/vol-arachnid typecheck` | `tsc --noEmit`                       |

Kök `pnpm dev` bu paketi vol-ui ve vol-asset-studio ile birlikte açar.
`pnpm build:game` VOL-HELL'i derler; bu paketin hedefi `build:arachnid`tir.

## Kontroller

| Girdi   | Etki                                         |
| ------- | -------------------------------------------- |
| `WASD`  | Hareket (ivmeli; dönüş hızı tavanlıdır)      |
| `Space` | Atılım (dash)                                |
| `F11`   | Tam ekran (HUD'daki buton da aynı işi yapar) |

Dokunmatik cihazda hareket çubuğu yalnız ekranın sol-alt başparmak bölgesinde
doğar; sağ-alt düğme atılımdır. Üst bölgedeki HUD/modal dokunuşları ve ekranın
sağ tarafı görünmez joystick olarak çalışmaz. Android geri hareketi oyunu
doğrudan kapatmaz, yerelleştirilmiş çıkış onayını açar.

Atılım, iniş, duvar çarpması ve adımlarda kısa efektler; ilk kullanıcı
etkileşiminden sonra başlayan döngüsel bir ambiyans vardır. Atılım/çarpma
olayları Android'de çok hafif haptik desen üretir. Grafik profili sabit
YÜKSEK'tir: tam render ölçeği ve kenar yumuşatma açıktır, kalite ayarı sunulmaz.

## Mimari

```
src/
  config/    Ölçüler ve denge — VERİ. Runtime dosyalarında sihirli sayı yoktur.
  runtime/   Çalışan sistemler.
  app/       Boot (i18n, font, Phaser oyunu).
  src-tauri/ VOL.ARACHNID'e ait native masaüstü/Android kabuğu.
```

| Dosya                               | Sorumluluk                                                  |
| ----------------------------------- | ----------------------------------------------------------- |
| `config/rig.ts`                     | Eklem şeması, uzuv zincirleri, rig yön ofseti (TEK kaynak)  |
| `config/gait.ts`                    | Duruş tablosu (açı/erişim/büküm/grup), adım tempoları       |
| `config/player.ts`                  | İvme, fren, dönüş yayı ve tavanı, atılım, duvar sekmesi     |
| `config/arena.ts`                   | Alan ölçüleri, kamera boşlukları, çarpma yankısı            |
| `config/bodyMotion.ts`              | Yalpalama, yaslanma, çömelme, uç parça öncülüğü, bakış      |
| `config/fx.ts`                      | Hayalet iz, gölge, toz ve çizim derinlikleri                |
| `config/audio.ts`                   | Ses varlıkları, miks, bütçe ve olay şiddetleri              |
| `config/graphics.ts`                | Sabit yüksek kalite render profili                          |
| `config/input.ts`                   | Tuşlar ve sol başparmak joystick bölgesi                    |
| `app/ArachnidAudio.ts`              | WebAudio kilit açma, ambiyans/SFX ve yaşam döngüsü          |
| `runtime/rig/arachnidRig.ts`        | Montajlanmış rig'i sürülebilir uzuv geometrisine çevirir    |
| `runtime/rig/ArachnidBodyMotion.ts` | Gövde kabuğunun ikincil hareketi ve bakış                   |
| `runtime/entity/ArachnidBody.ts`    | Konum, hız, yön, atılım, sınır çözümü (headless)            |
| `runtime/entity/ArachnidLegs.ts`    | Duruş → yürüyüş → ters kinematik                            |
| `runtime/entity/Arena.ts`           | Zemin, ızgara, sınır ve çarpma yankısı                      |
| `runtime/fx/ArachnidDust.ts`        | Pençe temasında toz                                         |
| `runtime/ui/ArachnidHud.ts`         | CORE bileşenleriyle HUD (dikey bar, başlık, tam ekran, hız) |
| `runtime/scene/GameScene.ts`        | Kurulum, kare akışı, kamera, yaşam döngüsü                  |
| `runtime/ui/ArachnidExitPrompt.ts`  | Android/masaüstü geri hareketi ve çıkış onayı               |

### Uzuv çözümü

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

### Duruş kaynak pozdan TÜRETİLMEZ

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
ve çalışma zamanı yalnız kendi ağacını görür. `devtools/` silinse bile
`pnpm build:arachnid` geçer. Bir oyunun çalışma zamanı asset'ini üreten araca
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

Sayılar makineye özeldir ve kapı EŞİĞİ DEĞİLDİR; oran ve büyüme yönü anlamlıdır.

## HUD ve arena

Kamera arenayı `arenaConfig.viewportGutterPx` boşluklarının İÇİNE sığdırır;
HUD yalnız o boşluklarda yaşar ve oyun alanına hiçbir koşulda binmez. Ölçüler
`ArachnidHud` tarafından CSS değişkeni olarak yayımlanır, yani iki taraf ayrı
sayı tutmaz.

Dokunmatik cihazda tam arena küçültülmez; kamera gövdeyi arena sınırları içinde
takip eder. HUD, atılım ve modal aynı CORE `UIRoot` katmanını paylaşır. Bu kök
mobil metin seçimini, çağrı balonunu ve dokunma parlamasını kapatır; butona uzun
basmak tarayıcının kopyalama/seçim davranışına dönüşmez.
