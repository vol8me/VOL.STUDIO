# VOL.TEST

CORE ve paylaşılan Tauri kabuğunu gerçek oyunla sınayan test oyunu.
Fizik tabanlı tank sürüşü, nişan, ateş, araç senaryoları ve mevsim/hava
aynı dünyada çalışır. HUD, ayarlar ve duraklatma CORE bileşenlerini tüketir.

## Çalıştırma

```bash
pnpm --filter @volstudio/vol-test dev
pnpm --filter @volstudio/vol-test test
pnpm --filter @volstudio/vol-test build
pnpm --filter @volstudio/vol-test test:e2e
pnpm --filter @volstudio/vol-test scaling
```

Geliştirme portu 5175'tir. E2E üretim build'ini Chromium ve WebKit'te açar.
Kapsam/bundle/scaling bütçeleri quality.json sahibindedir; komut kapsamı
[gates](../../docs/gates.md) belgesindedir.

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

Senaryo paneli boş dünya, slalom, hedefler, fizik alanı ve çoklu tankı
seçer. Seçim oyuncuyu başlangıç konumuna taşımaz. Önizleme örneği
`?season=winter&weather=snow`; season spring/summer/autumn/winter,
weather clear/dust/rain/snow olabilir. Sorgusuz oturum normal takvimdir.

## Ayrıntılar

- [DESIGN](DESIGN.md): model, sunum, config sahipliği, kalıcılık ve ses.
- [Yeni oyun](../../docs/new-game.md): ürün üretimi ve bağımsız kabul.
- [Windows](../../docs/windows.md), [Linux](../../docs/linux.md),
  [Android](../../docs/android.md), [Deck](../../docs/steam-deck.md):
  kurulum, destek ve gerçek cihaz referansı.
- [Kök TODO](../../TODO.md): kalan oyun/native/cihaz kabul işleri.

Native kimlik `com.volstudio.voltest`; Steamworks opt-in, varsayılan stub
gerçek istemci kabulü değildir. App ID 480 geliştirme yer tutucusudur.
33 kuru mekanik ses kanonik yayın/manifest doğrulamasından gelir; müzik
ve ambiyans yoktur. Ses yayın kabulü teknik QA ile tamamlanır.
