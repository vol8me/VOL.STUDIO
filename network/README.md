# Network çalışma alanı

`@volstudio/network`, oyunların paylaştığı **opt-in** çok oyunculu altyapıdır: sürümlü protokol,
tarayıcı istemcisi ve Node'da Colyseus sunucu çalışma zamanı. CORE simülasyon mekaniği ve UI'ı,
`tauri-v2` native kabuğu taşır. Dünya durumu, savaş, üretim kuralları ve **oda sınıfı oyuna** aittir;
bu paket odayı çalıştıran zemini verir. Paket belirli bir oyuna bağlı değildir; ilk tüketici
[VOL.TEST](../games/vol-test/README.md)'tir.

Genel mekanizmalar CORE'un saf alt yollarından tüketilir; örneğin sayısal ölçüm penceresi
`@volstudio/core/collections` içindedir. Node ölçeri, ağ protokolü ve bağlantı politikası bu pakette kalır.

## Yüzeyler

`src/` dört yüzeye bölünür ve `exports` haritası da öyledir. Yüzeyler arası kenarlar
`scripts/quality/layers.mjs` ile denetlenir.

| Export       | Çalıştığı yer    | İçerik                                                                |
| ------------ | ---------------- | --------------------------------------------------------------------- |
| `./protocol` | tarayıcı + Node  | `PROTOCOL_VERSION`, katılım seçenekleri, ad ve oda kodu kuralları     |
| `./client`   | tarayıcı/webview | `createLobby` eşleştirme girişi, `JoinError`, Colyseus öngörü API'si  |
| `./server`   | yalnız Node      | döngü, ana makine, katılım ve bağlantı kapısı, kapanış, günlük, ölçüm |
| `./drive`    | yalnız Node      | başsız çok istemcili yük sürücüsü, JSONL rapor                        |

Protokol ve istemci Node yerleşiklerini, `@colyseus/core` ile `@colyseus/ws-transport`'u içe
aktaramaz; sunucu istemciyi aktaramaz; sürücü sunucuyu aktaramaz ve hiçbir yüzey sürücüye uzanamaz. Oyunun
tarayıcı kodu `./server`'a ve `./drive`'a uzanamaz. Sunucu
çalışma zamanının sözleşmesi [docs/server.md](docs/server.md), yük sürücüsünün sözleşmesi
[docs/drive.md](docs/drive.md) içindedir.

## Protokol ve istemci

`./protocol` bağlantı sözleşmesidir: sürüm (`PROTOCOL_VERSION`, şu an `2`), katılım seçenekleri
(`protocol`, `name`, `code`), görünen ad temizliği ve oda kodu alfabesi. Sunucu her katılımı
`authenticateJoin` ile doğrular; ret nedeni (`protocol`, `code`, `full`) `ServerError(4400, neden)`
olarak gider. `./client` içindeki `createLobby(endpoint)` Colyseus eşleştirmesini sarar, sürümü her
isteğe ekler ve her hatayı `JoinError.reason` kümesine indirger (`not-found`, `unreachable`, `busy`
[bağlantı kapısı reddi], `failed` eklenir). Girdi şeması, oda durumu ve öngörü **oyunundur**: oyun `defineInput` şemasını tanımlar,
uzlaştırmayı Colyseus SDK'nın `Predict`i yapar ([VOL.TEST tasarımı](../games/vol-test/DESIGN.md)).

`PredictionStepper` aynı SDK saatine sınırlı ara zaman damgaları verir; her `tick` bütçesi
hemen tüketilir, çizim pozu son dilimden sonra okunur. İkinci sabit adım biriktiricisi kurmaz.
Uzun render karesinde SDK'nın tek çağrılık yakalama sınırına erken düşülmesini önler; çok uzun
kesintinin eski bölümü SDK'nın mevcut hitch politikasına kalır. Dilim sayısı ve toplam girdi
sınırı sonludur, oyunun sunucu tamponuyla uyumlu seçilir. Geçersiz/geri saat yok sayılır;
callback hatası veya `dispose` sonrasında yeni girdi üretilmez. Bu, sınırsız kesintiyi kayıpsız
oynatma ya da düşük FPS altında ağ bütçesi garantisi değildir.

İsteğe bağlı `ReconciliationReporter`, gerçek SDK callbacklerinin sayaçlarını bildirir;
`ClientMetricsRegistry` doğrulanmış beyanı gerçek soket baytlarından ayrı tutar. Kabul ve ölçüm
sınırları [sunucu sözleşmesinde](docs/server.md#i%CC%87stemci-uzlaştırma-beyanı), betikli bot akışları
[sürücü sözleşmesindedir](docs/drive.md#betikli-senaryolar).

## Çalıştırma

```sh
pnpm --filter @volstudio/network test:coverage
pnpm --filter @volstudio/vol-test server:dev
```

Üretim kimlik doğrulaması, kalıcı dünya kaydı ve region/interest/fog filtreleri
henüz tamamlanmadı. Öngörü/uzlaştırma vardır; cihazlar arası kabul ve internet
üretim kapsamı [tasarımda](DESIGN.md) ayrı tutulur.
