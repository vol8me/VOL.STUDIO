# VOL.ARACHNID

Eklemli bir örümcek rig'inin ters kinematikle sürüldüğü, sabit arenalı hareket
deneyi. Oyun döngüsü yoktur: paket, uzuv çözümü, yürüyüş, ağırlık hissi ve
sunum efektlerinin (iz, gölge, toz) çalışıldığı yüzeydir.

## Yığın

Phaser 4 · TypeScript · Vite · `@volstudio/core` (paylaşılan sistemler, UI kiti
ve rig çalışma zamanı)

`@volstudio/pen.dev` yalnız BUILD-TIME bir araçtır (`rig:sync`) ve
`devDependencies` altındadır; çalışma zamanı ona bağlı değildir.

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
| `pnpm --filter @volstudio/vol-arachnid test:e2e`  | Gerçek tarayıcıda render smoke'u     |
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

## Daha derine

Uzuv çözümü, Pencil export hattı, ölçüm sonuçları ve denge modeli için
[DESIGN.md](DESIGN.md).
