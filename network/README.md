# Network çalışma alanı

`@volstudio/network`, oyunların paylaştığı **opt-in** çok oyunculu altyapıdır: sürümlü protokol,
tarayıcı istemcisi ve Node'da Colyseus sunucu çalışma zamanı. CORE simülasyon mekaniği ve UI'ı,
`tauri-v2` native kabuğu taşır. Dünya durumu, savaş, üretim kuralları ve **oda sınıfı oyuna** aittir;
bu paket odayı çalıştıran zemini verir. Paket belirli bir oyuna bağlı değildir; ilk tüketici
[VOL.TEST](../games/vol-test/README.md)'tir.

## Yüzeyler

`src/` üç yüzeye bölünür ve `exports` haritası da öyledir. Yüzeyler arası kenarlar
`scripts/quality/layers.mjs` ile denetlenir.

| Export       | Çalıştığı yer    | İçerik                                                               |
| ------------ | ---------------- | -------------------------------------------------------------------- |
| `./protocol` | tarayıcı + Node  | `PROTOCOL_VERSION`, katılım seçenekleri, ad ve oda kodu kuralları    |
| `./client`   | tarayıcı/webview | `createLobby` eşleştirme girişi, `JoinError`, Colyseus öngörü API'si |
| `./server`   | yalnız Node      | döngü, ana makine, katılım kapısı, kapanış, günlük, ölçüm            |

Protokol ve istemci Node yerleşiklerini, `@colyseus/core` ile `@colyseus/ws-transport`'u içe
aktaramaz; sunucu istemciyi aktaramaz. Oyunun tarayıcı kodu `./server`'a uzanamaz. Sunucu
çalışma zamanının sözleşmesi [docs/server.md](docs/server.md) içindedir.

## Protokol ve istemci

`./protocol` bağlantı sözleşmesidir: sürüm (`PROTOCOL_VERSION`, şu an `2`), katılım seçenekleri
(`protocol`, `name`, `code`), görünen ad temizliği ve oda kodu alfabesi. Sunucu her katılımı
`authenticateJoin` ile doğrular; ret nedeni (`protocol`, `code`, `full`) `ServerError(4400, neden)`
olarak gider. `./client` içindeki `createLobby(endpoint)` Colyseus eşleştirmesini sarar, sürümü her
isteğe ekler ve her hatayı `JoinError.reason` kümesine indirger (`not-found`, `unreachable`, `failed`
eklenir). Girdi şeması, oda durumu ve öngörü **oyunundur**: oyun `defineInput` şemasını tanımlar,
uzlaştırmayı Colyseus SDK'nın `Predict`i yapar ([VOL.TEST tasarımı](../games/vol-test/DESIGN.md)).

## Çalıştırma

```sh
pnpm --filter @volstudio/network test:coverage
pnpm --filter @volstudio/vol-test server:dev
```

Bu bir **yerel prototiptir**: üretim kimlik doğrulaması, durable dünya kaydı,
region/interest/fog filtreleri ve cihazlar arası düzeltmeli hareket yoktur. Karar ve maliyet
varsayımları [backend araştırmasındadır](../docs/backend-research.md).
