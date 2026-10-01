# VOL.TEST

CORE ve paylaşılan Tauri kabuğunu gerçek oyunla sınayan test oyunu.
Açık dünyada fizik tabanlı tank sürüşü, nişan, ateş, araç senaryoları ve
mevsimlere bağlı hava olayları vardır. Yeni oyun kurulumu için
[repo rehberine](../../docs/new-game.md), davranış sözleşmeleri için
[DESIGN.md](DESIGN.md) belgesine bakılır.

## Çalıştırma

```bash
pnpm --filter @volstudio/vol-test dev
pnpm --filter @volstudio/vol-test test
pnpm --filter @volstudio/vol-test build
pnpm --filter @volstudio/vol-test test:e2e
pnpm --filter @volstudio/vol-test scaling
```

Geliştirme portu 5175'tir. E2E gönderilen build'i Chromium ve WebKit'te açar.
Kapsam, bundle ve ölçekleme bütçeleri kök `quality.json` içindedir;
[repo kapıları](../../docs/gates.md) yerel doğrulamanın tek sözleşmesidir.

## Kontroller

| Eylem    | Klavye / fare   | Kol       | Dokunmatik               |
| -------- | --------------- | --------- | ------------------------ |
| Hareket  | WASD            | Sol çubuk | Sol joystick             |
| Nişan    | Fare            | Sağ çubuk | Sağ joystick iç bölgesi  |
| Ateş     | Sol tık         | RT        | Sağ joystick dış bölgesi |
| Hızlanma | Shift           | LT        | Hızlanma düğmesi         |
| Fren     | Space           | B         | Fren düğmesi             |
| Zoom     | Tekerlek, Q / E | LB / RB   | + / − düğmeleri          |
| Izgara   | G               | View      | —                        |
| Duraklat | Esc             | Menu      | Duraklat düğmesi, geri   |

Duraklatma paneli kalite, ses, titreşim ve uygun oturumlarda ekran kipini
ayarlar. Senaryo panelinde boş dünya, slalom, hedefler, fizik alanı ve çoklu
tank seçilir; aynı senaryo ve tohum aynı başlangıç düzenini üretir.

## Dünya ve hava

İlkbahar, yaz, sonbahar ve kış 15'er dakika sürer; tam döngü bir saattir.
Yeni oturum ilkbaharda açılır. Hava takvimi mevsimden ayrıdır: açık hava,
toz, yağmur ve kar mevsim olasılıklarına göre gelir. Su ve kar birikimi,
erime, palet sıkıştırması, tutuş ve mermi üzerindeki rüzgâr etkisi aynı
simülasyondan okunur. Duraklatma bütün çevre saatlerini dondurur.

Yerel görünüm önizlemesi `?season=winter&weather=snow` gibi bir sorguyla
başlatılır. Mevsimler `spring`, `summer`, `autumn`, `winter`; hava değerleri
`clear`, `dust`, `rain`, `snow`dur. Mevsim önizlemesi birikimi göstermek için
yağışı önceden ilerletir; sorgusuz oturum normal takvimle açılır.

## Yapı

| Yol           | Sorumluluk                                                          |
| ------------- | ------------------------------------------------------------------- |
| `src/app/`    | Platform kaynakları, tercihler, ilerleme ve ölçüm                   |
| `src/sim/`    | Phaser'dan bağımsız tank, mermi, senaryo, mevsim ve yüzey modelleri |
| `src/view/`   | Tank rig'i, dünya, efektler ve hava sunumu                          |
| `src/hud/`    | CORE bileşenleriyle HUD, duraklatma, ayar ve senaryo panelleri      |
| `src/input/`  | Hareket ve ateş niyetinin işlenmesi                                 |
| `src/audio/`  | Ses bankları, konumlandırma ve araç döngüleri                       |
| `src/scenes/` | Yükleme, yaşam döngüsü ve model/görünüm bağlama                     |
| `src/config/` | Fizik, kontrol, kamera, kalite, hava ve sunum verileri              |
| `src/assets/` | Tank SVG parçaları                                                  |
| `src-tauri/`  | Ürüne özgü native uygulama ve Android kaynakları                    |
| `scripts/`    | İkon üretimi ve ölçekleme ölçümü                                    |

## Platformlar ve kayıt

Native ürün kimliği `com.volstudio.voltest`tir. Kabuk, Android kaynakları ve
Windows NSIS yapılandırması vardır; gerçek cihaz kabulü kaynak ve host
kontrollerinden ayrı izlenir. Linux paketleme ve cihaz kurulumu
[Linux](../../docs/linux.md), [Android](../../docs/android.md) ve
[Steam Deck](../../docs/steam-deck.md) belgelerindedir.

```bash
pnpm --filter @volstudio/vol-test icon:source
pnpm --filter @volstudio/vol-test exec tauri icon src-tauri/app-icon.svg
pnpm --filter @volstudio/vol-test exec tauri build --debug --no-bundle
pnpm --filter @volstudio/vol-test exec tauri android build --debug --target aarch64
pnpm build:linux-steamrt4 games/vol-test
```

Android init ikonları değiştirebildiği için ardından ikon üretimi tekrarlanır.
Tercihler `device.voltest.preferences`, sürüş mesafesi ve atış sayısı
`synced.voltest.progress` anahtarındadır. Native depolama cihaz ve ilerleme
kapsamlarını ayrı dosyalara yazar. Uyku ve kapanış bekleyen kayıtları boşaltır.

Steamworks isteğe bağlı `steamworks` Cargo özelliğidir; varsayılan stub
istemci bağlantısı sağlamaz. App ID 480 geliştirme yer tutucusudur;
gerçek Steam ürünü ve Cloud kabulü ayrı doğrulama ister.

## Ses

33 kuru mekanik ses audio-synth'in kanonik yayın hattından gelir.
Motor, palet, kayma, servo, hızlanma, top, patlama, isabet, çarpma, fren ve
UI sesleri manifestlerle doğrulanır. Araç hareketsiz ve nişan sabitken ses
kaynağı çalışmaz; müzik ve ambiyans yoktur. İnsan dinleme onayı kök
[TODO.md](../../TODO.md) içinde açık kalır; görsel onay bu dinlemeyi kapatmaz.
