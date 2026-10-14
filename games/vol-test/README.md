# VOL.TEST

CORE ve paylaşılan Tauri kabuğunu gerçek oyunla sınayan test oyunu.
Fizik tabanlı tank sürüşü, nişan, ateş, araç senaryoları ve mevsim/hava
aynı dünyada çalışır. Ana menü, garaj, ayarlar, HUD ve duraklatma CORE bileşenlerini tüketir.

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

| Eylem    | Klavye / fare   | Kol       | Dokunmatik                   |
| -------- | --------------- | --------- | ---------------------------- |
| Hareket  | WASD            | Sol çubuk | Sol joystick                 |
| Nişan    | Fare            | Sağ çubuk | Sağ joystick iç bölgesi      |
| Ateş     | Sol tık         | RT        | Sağ joystick dış bölgesi     |
| Hızlanma | Shift (tank)    | LT        | Hızlanma düğmesi             |
| Fren     | Space (tank)    | B         | Fren düğmesi                 |
| Atılım   | Space (örümcek) | B         | Atılım düğmesi (fren yerine) |
| Zoom     | Tekerlek, Q / E | LB / RB   | + / − düğmeleri              |
| Izgara   | G               | View      | —                            |
| Duraklat | Esc             | Menu      | Duraklat düğmesi, geri       |

Çevrimiçi dünya sunucuda aktığı için bu tuş orada "Menü" açar ve dünyayı durdurmaz. Alt kontrol ipuçları her girişte 10 sn görünür.

Senaryo paneli boş dünya, slalom, hedefler, fizik alanı ve çoklu tankı
seçer (ana menü ya da duraklatma menüsündeki "Geliştirici" ekranı; oyuncu ayarları "Ayarlar" ekranındadır). Seçim oyuncuyu başlangıç konumuna taşımaz. `?start=world` ana menüyü
atlayıp alıştırma dünyasını doğrudan açar. Önizleme örneği
`?season=winter&weather=snow`; season spring/summer/autumn/winter,
weather clear/dust/rain/snow olabilir. Sorgusuz oturum normal takvimdir.

## Çok oyunculu

Ana menü → "Savaşa katıl" garaja götürür: araç, ad ve cephe (ya da "dengeye göre") seçilir. Alıştırma dünyasında
Duraklat → "Savaşa katıl" aynı seçimi panel olarak açar. Dünya kalıcıdır:
sunucu açık kaldıkça iki cephe bölgeler için savaşır, botlar insan olmasa da sürdürür.
Sunucu ayrı süreçtir; adres `?server=host:port` ile verilir (varsayılan `127.0.0.1:2567`).

```bash
pnpm --filter @volstudio/vol-test server:dev
pnpm --filter @volstudio/vol-test dev
```

Uzak erişimde (`VOL_NET_HOST=0.0.0.0`) `VOL_NET_ORIGINS` verilir; ölçüm için `VOL_NET_OPS_PORT=9100`
loopback'te `/metrics` açar. Değişkenler [network sunucu belgesindedir](../../network/docs/server.md).
`pnpm --filter @volstudio/vol-test drive -- --clients 24 --seconds 60` başsız botlarla yük üretir ve
JSONL rapor yazar ([yük sürücüsü](../../network/docs/drive.md)).

Öngörü, uzlaştırma ve sınırlar [DESIGN](DESIGN.md) "Çok oyunculu" bölümündedir.

## Ayrıntılar

- [DESIGN](DESIGN.md): model, sunum, config sahipliği, kalıcılık ve ses.
- [Yeni oyun](../../docs/new-game.md): ürün üretimi ve bağımsız kabul.
- [Windows](../../docs/windows.md), [Linux](../../docs/linux.md),
  [Android](../../docs/android.md), [Deck](../../docs/steam-deck.md):
  kurulum, destek ve gerçek cihaz referansı.
- [Kök TODO](../../TODO.md): kalan oyun/native/cihaz kabul işleri.

Native kimlik `com.volstudio.voltest`; Steamworks opt-in, varsayılan stub
gerçek istemci kabulü değildir. App ID 480 geliştirme yer tutucusudur.
37 kuru mekanik ses kanonik yayın/manifest doğrulamasından gelir; müzik
ve ambiyans yoktur. Ses yayın kabulü teknik QA ile tamamlanır.
