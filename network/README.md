# Network çalışma alanı

`@volstudio/network`, oyunların paylaştığı **opt-in** çok oyunculu altyapıdır: sürümlü protokol,
tarayıcı istemcisi ve Node'da Colyseus sunucu çalışma zamanı. CORE simülasyon mekaniği ve UI'ı,
`tauri-v2` native kabuğu taşır. Dünya durumu, savaş, üretim kuralları ve **oda sınıfı oyuna** aittir;
bu paket odayı çalıştıran zemini verir. Tüketiciler [VOL.TEST](../games/vol-test/README.md) ve
[VOL.TEST2](../games/vol-test2/DESIGN.md)'dir.

## Yüzeyler

`src/` üç yüzeye bölünür ve `exports` haritası da öyledir. Yüzeyler arası kenarlar
`scripts/quality/layers.mjs` ile denetlenir.

| Export       | Çalıştığı yer    | İçerik                                                             |
| ------------ | ---------------- | ------------------------------------------------------------------ |
| `./protocol` | tarayıcı + Node  | `PROTOCOL_VERSION`, girdi doğrulaması, `InputMailbox`              |
| `./client`   | tarayıcı/webview | `connectRoom`: Colyseus bağlantısı, temizlenebilir state aboneliği |
| `./server`   | yalnız Node      | döngü, ana makine, kapanış, günlük, işletim kapısı, ölçüm          |

Protokol ve istemci Node yerleşiklerini, `@colyseus/core` ile `@colyseus/ws-transport`'u içe
aktaramaz; sunucu istemciyi aktaramaz. Oyunun tarayıcı kodu `./server`'a uzanamaz. Sunucu
çalışma zamanının sözleşmesi [docs/server.md](docs/server.md) içindedir.

## Protokol ve istemci

`./protocol` sürümlü girdi doğrulaması ve `InputMailbox` sağlar; bağlantı patlaması tek
simülasyon adımında birden çok dünya adımı üretmez. Hareket ve nişan eksenleri aralık ve uzunluk
açısından doğrulanır; istemci pozisyon veya hasar durumu yazamaz. Protokol sürümü `1`dir.

VOL.TEST2 yalnız `PROTOCOL_VERSION`'u kullanır: ikili protokolü ve kilit adımlı istemcisi oyunun
içindedir, Colyseus `Schema` kullanmaz. İkinci bir oyun aynı istemciyi isterse protokol ve oturum
bu pakete taşınır; o zamana dek paylaşım yoktur.

## Çalıştırma

```sh
pnpm --filter @volstudio/network test:coverage
pnpm --filter @volstudio/vol-test server:dev
pnpm --filter @volstudio/vol-test probe:network --worlds=1 --clients=12 --seconds=10
```

Bu bir **yerel prototiptir**: üretim kimlik doğrulaması, durable dünya kaydı (VOL.TEST2 dışında),
region/interest/fog filtreleri ve cihazlar arası düzeltmeli hareket yoktur. Karar ve maliyet
varsayımları [backend araştırmasındadır](../docs/backend-research.md).
