# VOL.TEST

Monorepo'nun test ve deney oyunu. CORE'u ve paylaşılan Tauri kabuğunu gerçek
bir oyun olarak her desteklenen platformda uçtan uca sınar. Boş, ızgaralı bir
çöl dünyasında gerçek fizikli, süspansiyonlu organik-robotik bir tank sürülür.

```bash
pnpm --filter @volstudio/vol-test dev        # :5175
pnpm --filter @volstudio/vol-test test       # birim, değişmez ve hissiyat testleri
pnpm --filter @volstudio/vol-test build
pnpm --filter @volstudio/vol-test test:e2e   # build çıktısı, Chromium + WebKit
pnpm --filter @volstudio/vol-test scaling    # ölçekleme ölçümü (JSON)
```

## Kontroller

| Eylem    | Klavye / fare   | Kol (Steam Deck dahil) | Dokunmatik               |
| -------- | --------------- | ---------------------- | ------------------------ |
| Hareket  | WASD            | Sol çubuk              | Sol altta sabit joystick |
| Nişan    | Fare            | Sağ çubuk              | Sağ altta sabit joystick |
| Ateş     | Sol tık         | RT                     | Nişan joystick itilince  |
| Hızlanma | Shift           | LT                     | Hızlanma düğmesi         |
| Zoom     | Tekerlek, Q / E | LB / RB                | + / − düğmeleri          |
| Izgara   | G               | View                   | —                        |
| Duraklat | Esc             | Menu                   | Duraklat düğmesi, geri   |

## Yapı

| Yol                 | İçerik                                                                     |
| ------------------- | -------------------------------------------------------------------------- |
| `src/sim/tank/`     | Tank: palet kuvvetleri, sürücü, süspansiyon, taret, hızlanma deposu        |
| `src/sim/`          | `Simulation`, araç varlıkları, dünya, mermi, olaylar                       |
| `src/view/`         | Phaser görünümü: çöl zemini, tank ve palet rig'i, efekt katmanları         |
| `src/hud/`          | HUD: yalnız CORE UI bileşenleri; her bölge ayrı dosya                      |
| `src/input/`        | Eylem sözlüğü, tuş ve kol eşlemesi                                         |
| `src/scenes/world/` | Sahne parçaları: girdi, duraklatma, kamera bağlama, olay yönlendirme, kare |
| `src/scenes/`       | `BootScene` (yükleme), `WorldScene` (yaşam döngüsü ve bağlama)             |
| `src/config/`       | Ayarlar: dünya, tank fiziği, süspansiyon, silah, kamera, his, efekt, palet |
| `src/assets/`       | Tank SVG parçaları                                                         |
| `scripts/`          | `scaling.ts`: ölçekleme kapısının ölçümü                                   |

Tasarım, fizik modeli, ölçüler ve bilinen sınırlar [DESIGN.md](DESIGN.md)
içindedir.

## Kapılar

Kapsam eşiği, bundle ve ölçekleme bütçesi kök `quality.json`dadır. Birim
testlerine ek olarak iki sorgulayıcı katman vardır: bulanık girdi altında
simülasyon değişmezleri ve sürüş hissinin ölçülebilir zarfı. E2E gönderilen
build'i açar; klavye, sanal kol ve dokunmatik çubukla sürüş, duraklatma ve
HUD kipi sınanır, konsolda hata olmamalıdır.

## Platformlar

Web build'i ve E2E hazırdır. Tauri kabuğu (Linux, Steam Deck, Android,
Windows) sırayla eklenir; açık işler kök `TODO.md`de izlenir.
