# Network çalışma alanı

`@volstudio/network`, birden fazla oyunun kullanabileceği **opt-in** çok oyunculu
iletişim katmanıdır. CORE simülasyon mekaniği ve UI'ı taşımaya devam eder;
`tauri-v2` native kabuğu sağlar. Dünya durumu, savaş, üretim kuralları ve
sunucu odası **oyuna** aittir. İlk tüketici VOL.TEST'tir.

İkinci tüketici [VOL.TEST2](../games/vol-test2/DESIGN.md) yalnız `./protocol`daki
`PROTOCOL_VERSION`'u kullanır: odası, ikili protokolü ve kilit adımlı istemcisi oyunun
içindedir ve Colyseus `Schema` kullanmaz. İkinci bir oyun aynı kilit adımlı istemciyi isterse
`ForgeSession`, protokol ve kilit adımlı istemci bu pakete taşınır; o zamana dek paylaşım yoktur.

`./protocol` sürümlü girdi doğrulaması ve `InputMailbox` sağlar; bağlantı
patlaması tek simülasyon adımında birden çok dünya adımı üretmez. Hareket ve
nişan eksenleri aralık/uzunluk açısından doğrulanır; istemci pozisyon veya hasar
durumu yazamaz. `./client` tarayıcı/webview uyumlu Colyseus bağlantısını ve
temizlenebilir state aboneliğini sunar. Ağ protokolünün kesin sürümü `1`dir.

VOL.TEST'te örnek Node sunucusu oyunun `games/vol-test/server/` dizinindedir:

```sh
pnpm --filter @volstudio/vol-test server:dev
pnpm --filter @volstudio/vol-test build:server
pnpm --filter @volstudio/vol-test start:server
pnpm --filter @volstudio/vol-test exec vitest run tests/server/WorldRoom.test.ts
pnpm --filter @volstudio/vol-test probe:network --worlds=1 --clients=12 --seconds=10
```

Şimdiki test odası 12 oyuncuya kadar gerçek `Simulation` ile 60 Hz işler,
durumu 20 Hz schema patch ile yayınlar. Adres varsayılan olarak
`127.0.0.1:2567`dir. Bu bir **yerel prototiptir**: üretim kimlik doğrulaması,
durable dünya kaydı, veri tabanı, region/interest/fog filtreleri, uzun süreli
soak ve cihazlar arası düzeltmeli hareket henüz yoktur. `maxClients` oda başına
12'dir; `joinOrCreate` dolu odadan sonra başka oda oluşturabilir.

Yalnız sunucu dünya ve savaş değerlerini değiştirir. VOL.TEST'te
`?net=http://127.0.0.1:2567` opt-in Phaser sahnesi sunucu durumunu çizer;
normal açılış çevrimdışı oyundur. Bir sonraki dilimde istemci
tahmini/uzlaştırması, düşen bağlantı sonrası aynı koltuğa dönüş, sunucu
ACK'sı ve dünya restore'u doğrulanmalıdır.
Karar ve maliyet varsayımları [backend araştırmasındadır](../docs/backend-research.md).
