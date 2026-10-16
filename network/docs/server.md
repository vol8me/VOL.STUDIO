# Sunucu çalışma zamanı (`@volstudio/network/server`)

Colyseus odasını çalıştıran zemin: döngü, ana makine, kapanış, günlük, işletim kapısı ve ölçüm.
Oda sınıfı, dünya durumu ve oyun kuralları oyuna aittir. Yalnız Node'da çalışır; protokol ve istemci
bu export'a uzanamaz, oyunun tarayıcı kodu da uzanamaz (`scripts/quality/layers.mjs`).

## Döngü

`runRoomLoop(room, hz, step)` odanın sabit adımlı döngüsünü kurar. Colyseus `setFixedTimestep`
aralığı adım süresine eşitler; Node `setInterval` kesirli milisaniyeyi kırptığı için 30 Hz'de 33 ms'lik
tetikleme 33,33 ms'lik adımı yaklaşık her yüz tetiklemede bir kaçırır ve adımlar arası p99 iki adıma
(~66 ms) çıkar. `StepClock` adım süresinden kısa aralıkla (adımın üçte biri, 4–10 ms) çağrılıp geçen
süreyi biriktirir. Uzun duraklamadan sonra en çok `maxCatchUp` (5) adım koşulur, kalan borç atılır.
Tetikleyici `Room.setTimestep`tir; Colyseus oda kapanınca aralığı kendisi temizler. Ölçüm
[araştırmadadır](../../docs/backend-research.md).

## Ana makine ve kapanış

`startHost(rooms, listenSettings(env), { logger })` Colyseus sunucusunu WebSocket taşımasıyla kurar,
dinletir ve `stop()` döndürür. İleti üst sınırı 1 KiB'dir. Colyseus'un kendi sinyal ve çökme kancaları
kapalıdır: her sunucu örneği `process`e dinleyici eklerdi ve iki kapanış yolu yarışırdı. Port doluysa
(`EADDRINUSE`) Colyseus `listen` sözü hiç çözülmeden asılı kalır; `startHost` hatayı önceden yakalar,
günlüğe yazar ve reddeder.

Canlılık yoklaması: sunucu her `pingIntervalMs`te (varsayılan 3000) ping yollar ve `pingMaxRetries` (2)
yanıtsız yoklamadan sonra soketi kapatır; sessiz ölen bağlantı (uyuyan telefon, kopan Wi-Fi) böylece
~9 sn içinde odaya `onDrop` olarak düşer. Değerler `HostOptions`tan değişir; kısaltmak sessiz ölümü
erken bulur ama geçici ağ takılmasında bağlantıyı gereksiz koparır.

`installShutdown(stop, { logger })` SIGINT/SIGTERM'de ve yakalanmamış hata ya da reddedilmiş sözde
`stop`u çalıştırır, günlüğü kapatır ve süreci çıkarır (çökmede kod 1). `stop` hata verir ya da
`graceMs` (10 sn) içinde bitmezse kod 1 ile çıkılır; kapanış sürerken gelen ikinci olay beklemeyi bırakır.
`isEntryModule(import.meta.url, process.argv[1])` modülün doğrudan başlatılıp başlatılmadığını dosya
URL'sini yola çevirerek sınar; `file:///` birleştirmesi POSIX'te yanlış eşleşir ve sunucu sessizce çıkardı.

## Katılım kapısı

`authenticateJoin(options)` oda `onAuth`unda çağrılır: protokol sürümünü ve oda kodu biçimini doğrular,
adı temizler ve `{ name, code }` döndürür. `rejectJoin(neden)` istemcide `JoinError(neden)` olarak
görünen `ServerError(4400, neden)` üretir. Oda yaratılmadan önce çalışan statik `onAuth`,
HTTP durum kodu kullanmalıdır (`400`, aynı neden); istemci her iki taşıma biçimini tanır.
`4400` HTTP'de geçersizdir ve nedensiz `500` üretir. Statik ön denetim `true` döndürdüğünde
instance `onAuth` yerel nesne bağlarını yeniden kurabilir; kimlik doğrulama yükü dönerse
Colyseus instance kancasını atlar ([resmî yaşam döngüsü](https://docs.colyseus.io/auth/room)).
`uniqueName(istenen, alınanlar)` odada çakışan adı `Ada 2`, `Ada 3` diye açar.

`RoomSlots` pahalı oda kurulmadan önce süreç içi yer ayırır; `claim()` kapasitede `null`,
başarıda idempotent bırakma işlevi verir. Oda kurulum hatası ve `onDispose` yeri bırakmalıdır.
HTTP rezervasyonları WebSocket sınırına dahil olmadığı için oda tavanı ayrıca gerekir.
VOL.TEST birincil ve taşma odalarını birlikte sınırlar; bu güvenlik tavanı ölçülmüş yük kapasitesi değildir.

`InputPacer<C>` adım başına tek girdi tüketir, titreşim tamponu ve sınırlı son-komut tutma uygular.
Tutulan komutun dönüşümü tüketicinin `hold` callback'indedir; paket oyun kuralı taşımaz.
`ServerTimeline` (`./client`) benzetim zamanını SDK sunucu saatine bağlar; zamanlı veri kuyruğu
oyundan bağımsız `@volstudio/core/time` `EventQueue` mekanizmasıdır.

## Bağlantı kapısı ve kötüye kullanım sınırları

`startHost(rooms, listen, { guard: guardSettings(process.env) })` Node `http` sunucusunun `request` ve
`upgrade` olaylarının önüne `ConnectionGuard` koyar. Colyseus eşleştirmesi HTTP, oyun trafiği WebSocket
olduğundan ikisi de kapıdan geçer. Kapı `http.emit`i sarar: dinleyici sırasına ve Colyseus'un onları ne
zaman eklediğine bağlı değildir ve reddedilen istek hiçbir dinleyiciye ulaşmaz. `guard` verilmezse kapı
kurulmaz (kütüphane varsayılanı kapalıdır; oyunun sunucu girişi açar).

| Sınır                    | Ortam değişkeni                   | Varsayılan | Ret                      |
| ------------------------ | --------------------------------- | ---------- | ------------------------ |
| Adres başına hız         | `VOL_NET_REQUEST_RATE` (saniye)   | 20         | `429` + `Retry-After`    |
| Adres başına ani birikim | `VOL_NET_REQUEST_BURST`           | 60         | `429` + `Retry-After`    |
| Adres başına açık soket  | `VOL_NET_MAX_SOCKETS_PER_ADDRESS` | 32         | `429` + `Retry-After: 5` |
| Toplam açık soket        | `VOL_NET_MAX_SOCKETS`             | 512        | `503` + `Retry-After: 5` |
| Köken izin listesi       | `VOL_NET_ORIGINS` (virgüllü)      | boş (açık) | `403`                    |
| Ters vekil adresi        | `VOL_NET_TRUST_PROXY`             | kapalı     | —                        |

Bir katılım iki jeton harcar (eşleştirme isteği ve yükseltme). Adres, `req.socket.remoteAddress`tir:
Colyseus `context.ip`si `x-real-ip` ve `x-forwarded-for` başlıklarına güvenir ve bu başlıkları istemci
yazabildiği için sınır olarak kullanılmaz. Önde güvenilir bir ters vekil varsa `VOL_NET_TRUST_PROXY=1`
adresi `X-Forwarded-For`un **sağ** ucundan okur (vekilin eklediği değer). IPv6 adresleri /64 önekine
indirgenir: bir ağ tek adres sayılır ve saldırgan aynı önek içinde adres döndürerek sınırı aşamaz.
IPv4-eşlemeli IPv6'nın onaltılık ve noktalı yazımları aynı kovayı kullanır; bozuk forwarded
adres soketin adresine düşer. Oda başına oyuncu sınırı odanın `maxClients`idir.

İstemcide kapının reddi `JoinError('busy')` olur (`429`/`503`); oyun "biraz sonra dene" der. Yükseltme aşamasındaki ret
WebSocket hatası olarak göründüğünden `unreachable` kalır. Köken denetimi yalnız `Origin` başlığı gönderen istemciyi (tarayıcı, Tauri/Android webview) sınar;
başlıksız Node istemcisi geçer, çünkü başlığı sahteleyebilen istemci için köken zaten güvenlik sınırı
değildir. Liste boşsa denetim yoktur; uzak erişim açılırken (`VOL_NET_HOST=0.0.0.0`) liste verilmelidir.
Tauri kabuğunun kökenleri `tauri://localhost`, `http://tauri.localhost` ve `https://tauri.localhost`tur.
İzlenen adres sayısı 50 000 ile sınırlıdır; boşta kalan adresler süpürülür. Saldırı sırasında günlük
şişmesin diye her ret nedeni günlüğe bir kez yazılır; istemci adresi yazılmaz.
Sayaçlar `ConnectionGuard.stats()`tadır. Kökenler URL biçimiyle doğrulanır, varsayılan port ve
büyük harf normalleştirilir; kullanıcı bilgisi, sorgu veya fragment taşıyan liste başlatmayı durdurur.

### Yavaş tüketici

`SlowConsumerWatch` ve `evictSlowConsumers(clients, watch, nowMs)`: soketin yazma kuyruğu
(`bufferedAmount`) `limitBytes` (256 KiB) üstünde `graceMs` (5 sn) kesintisiz kalırsa istemci
`1013` koduyla atılır. Aksi halde bağlantıyı kesmeden yavaş okuyan istemci sunucu belleğini şişirirdi.
Oda döngüsünden saniyede birkaç kez çağrılır; kısa dalgalanma bağışlanır. `clientTraffic(client)`
istemci başına kuyruktaki bayt ile toplam gönderilen/alınan baytı verir; alanlar `ws`nin iç yapısından
okunur, yoksa 0 döner (ölçüm eksik olabilir, sunucuyu düşüremez).

## Günlük

`Logger` yapılandırılmış JSONL yazar: `{ seq, t, lvl, src, ev, data? }`. `ev` noktalı küçük harfli
olay adıdır (`listening`, `host.signal`). Kayıtlar sınırlı bir halkada da tutulur; `since(seq, limit,
minLevel)` `{ records, next, dropped }` döndürür, `dropped` halkadan düşmüş kayıt sayısıdır. Hedef
yazımı sunucuyu düşürmez. Halka da JSONL ile aynı serileştirilebilir anlık görüntüyü tutar;
sonradan değiştirilen veri ve döngüsel nesne `/logs`u bozamaz. Kapanış idempotenttir ve bir hedefin
hatası diğer hedefleri kapatmayı engellemez. `stdoutSink` her kaydı bir satır yazar; `fileSink` satırları tamponlar ve
`flushMs` aralığında ya da kapanışta yazar (`SIGKILL`de son aralık kaybolabilir).

## İşletim kapısı

`serveOps({ port, logger, metrics, routes })` oyun trafiğinden ayrı, varsayılan loopback bir HTTP
kapısıdır.

| Uç                                     | Yanıt                                                   |
| -------------------------------------- | ------------------------------------------------------- |
| `GET /healthz`                         | `ok` (düz metin)                                        |
| `GET /metrics`                         | süreç özeti ile `metrics()` sonucunun birleşimi         |
| `GET /logs?since=&limit=&level=`       | `Logger.since` sayfası; günlük verilmediyse 404         |
| `GET`/`POST` + oyunun `routes` girdisi | rota işlevinin sonucu; `undefined` ise `{ "ok": true }` |

`Host` başlığı loopback değilse 403 verilir (DNS yeniden bağlama); joker adrese (`0.0.0.0`) bağlanmak
açık uzak erişim kararıdır ve bu sınırı kaldırır. Gövde 64 KiB üstünde 413, geçersiz JSON 400, bilinmeyen
yol 404, yanlış yöntem 405 alır. Rota `OpsError(status, message)` fırlatarak durum kodu seçer; başka hata
500 olur, ayrıntı yanıta sızmaz ve günlüğe yazılır. `Origin` taşıyan veya `Sec-Fetch-Site: cross-site`
istekler rota çalışmadan 403 alır: yalnız CORS eksikliği basit POST'un yan etkisini önlemez.
Ajan ve betikler Node'dan okur. IPv6 dinleme adresleri köşeli parantezli kullanılabilir URL döndürür.

## Ölçüm ve sınırlar

- `drainEventLoopDelay`: olay döngüsü gecikmesi; histogramın ölçüm aralığı (10 ms) taban olarak
  çıkarılır, Windows'ta zamanlayıcı ayrıca ~15,6 ms ayrıktır. Okuma histogramı sıfırlar ve sıfırlamadan
  sonraki ilk örnek yalnız zaman çıpasıdır, ölçülmez.
- `processSnapshot()`: bellek, işlemci, çalışma süresi, süreç ve sürüm bilgisi.
- `summarize`: CORE `@volstudio/core/collections` `RollingWindow` ölçümlerini milisaniye
  özeti olarak verir (ortalama, p50, p99 ve en büyük değer). Son N örneğin saklanması CORE'a
  aittir; ekleme tahsissizdir, yüzdelik sıralaması istendiğinde oluşturulur ve yeni örneğe kadar
  yeniden kullanılır. Olay döngüsü ve süreç ölçümleri Node'a özgü olduğundan bu pakette kalır.
- `TokenBucket(ratePerSecond, burst, startAt)`: oyuncu başına komut ve adres başına istek sınırı; saat dışarıdan verilir.
- `envInteger`, `envText`, `envChoice`, `envFlag`: geçersiz değer başlatmayı `RangeError` ile durdurur.
  `listenSettings`: `VOL_NET_PORT` (varsayılan 2567) ve `VOL_NET_HOST` (varsayılan loopback).
  `opsSettings`: `VOL_NET_OPS_PORT` verilmedikçe işletim kapısı kapalıdır (`null`); `VOL_NET_OPS_HOST` varsayılan loopback'tir.

## Oyun iskeleti

```ts
import { defineRoom } from '@colyseus/core';
import {
  installShutdown,
  isEntryModule,
  listenSettings,
  Logger,
  startHost,
  stdoutSink,
} from '@volstudio/network/server';

const rooms = { oyun: defineRoom(OyunOdasi) };

if (isEntryModule(import.meta.url, process.argv[1])) {
  const logger = Logger.create({ src: 'oyun', sinks: [stdoutSink()] });
  const started = await startHost(rooms, listenSettings(process.env), { logger });
  installShutdown(started.stop, { logger });
}
```

Oyunun `package.json`'ı `@colyseus/core` ve `@colyseus/ws-transport`'u da bildirir: sunucu paketi
`--external:@colyseus/*` ile derlendiği için bu modüller çalışma anında oyunun `node_modules`'undan
çözülür.

## Test

`network/tests/server/` gerçek WebSocket, gerçek HTTP ve gerçek geçici dizin kullanır; yalnız sinyal
yayıcısı ve çıkış işlevi sahtedir. Kapsam eşikleri `quality.json` içindedir.
