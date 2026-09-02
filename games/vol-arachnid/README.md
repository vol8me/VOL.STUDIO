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
| `pnpm build:arachnid`                             | Üretim derlemesi (`dist/`)           |
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

## Mimari

```
src/
  config/    Ölçüler ve denge — VERİ. Runtime dosyalarında sihirli sayı yoktur.
  runtime/   Çalışan sistemler.
  app/       Boot (i18n, font, Phaser oyunu).
```

| Dosya                               | Sorumluluk                                                  |
| ----------------------------------- | ----------------------------------------------------------- |
| `config/rig.ts`                     | Eklem şeması, uzuv zincirleri, rig yön ofseti (TEK kaynak)  |
| `config/gait.ts`                    | Duruş tablosu (açı/erişim/büküm/grup), adım tempoları       |
| `config/player.ts`                  | İvme, fren, dönüş yayı ve tavanı, atılım, duvar sekmesi     |
| `config/arena.ts`                   | Alan ölçüleri, kamera boşlukları, çarpma yankısı            |
| `config/bodyMotion.ts`              | Yalpalama, yaslanma, çömelme, uç parça öncülüğü, bakış      |
| `config/fx.ts`                      | Hayalet iz, gölge, toz ve çizim derinlikleri                |
| `runtime/rig/arachnidRig.ts`        | Montajlanmış rig'i sürülebilir uzuv geometrisine çevirir    |
| `runtime/rig/ArachnidBodyMotion.ts` | Gövde kabuğunun ikincil hareketi ve bakış                   |
| `runtime/entity/ArachnidBody.ts`    | Konum, hız, yön, atılım, sınır çözümü (headless)            |
| `runtime/entity/ArachnidLegs.ts`    | Duruş → yürüyüş → ters kinematik                            |
| `runtime/entity/Arena.ts`           | Zemin, ızgara, sınır ve çarpma yankısı                      |
| `runtime/fx/ArachnidDust.ts`        | Pençe temasında toz                                         |
| `runtime/ui/ArachnidHud.ts`         | CORE bileşenleriyle HUD (dikey bar, başlık, tam ekran, hız) |
| `runtime/scene/GameScene.ts`        | Kurulum, kare akışı, kamera, yaşam döngüsü                  |

### Uzuv çözümü

Her uzuv ÜÇ kemiktir: omuz (`coxa`), üst (`femur`), alt (`tibia` + `claw`).
Üç eklemli bir zincirde çözüm tek olmadığı için belirsizlik omuzla kapatılır:
omuz, duruş açısı ile ayak yönü arasında sabit bir oranda paylaşır
(`gaitConfig.shoulderFollow`), kalan iki kemik CORE'un `solveTwoBoneIk`'i ile
çözülür.

Ayaklar dünya uzayında sabitlenir (`LegGait`); gövde ilerledikçe geride
kalırlar ve eşiği aşınca öne adım atarlar. Adım sırası gruplar arasında
dönüşümlüdür, yani gövde her an en az bir grup ayak üstündedir.

Arka iki uzuv (`tl`/`tr`) kısa İTİCİ bacaklardır: yürüyüş hızıyla daha geriye
basar, atılımda gövdeyi iterler.

### Duruş kaynak pozdan TÜRETİLMEZ

Export'ta her uzuv düz bir çizgidir; dizilim yalnızca parçaları okunur biçimde
yan yana koymak içindir. Duruş açıları `config/gait.ts` içinde İLERİ EKSENDEN
ölçülerek bildirilir (0° ileri, +90° sağ, 180° arka). Kaynak pozdan okunan
"dinlenme açısı" bir duruş değildir.

## Pencil export hattı

Rig sanatı `devtools/pen.dev/pen/entities.pen` içinde yaşar ve
`pen_export/enemies/arachnid/` altına export edilir; hattın kuralları
[devtools/pen.dev/AGENTS.md](../../devtools/pen.dev/AGENTS.md) ve
[README](../../devtools/pen.dev/README.md) dosyalarındadır. Bu paket export'u
`config/rigAssets.ts` üzerinden (metadata JSON + `import.meta.glob` PNG'leri)
tüketir.

Yayımlanmış export DÜZDÜR: metadata `parentPartId` taşımaz, yani tüm parçalar
kökün kardeşidir. Eklemsiz bir zincirde yalnız uçlar sürülebilir; ara kemikler
export pozunda donar ve uzuv kopuk görünür. Eklem şeması bu yüzden
`config/rig.ts` içinde VERİ olarak bildirilir ve montajdan önce
`articulateRigDefinition` ile uygulanır — üretilmiş metadata dosyasına
dokunulmaz, bir sonraki export bu kararı ezmez. Manifest'e `parent` alanı
eklenip export yeniden üretilirse bu şema gereksizleşir.

## HUD ve arena

Kamera arenayı `arenaConfig.viewportGutterPx` boşluklarının İÇİNE sığdırır;
HUD yalnız o boşluklarda yaşar ve oyun alanına hiçbir koşulda binmez. Ölçüler
`ArachnidHud` tarafından CSS değişkeni olarak yayımlanır, yani iki taraf ayrı
sayı tutmaz.
