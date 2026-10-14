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

`installShutdown(stop, { logger })` SIGINT/SIGTERM'de ve yakalanmamış hata ya da reddedilmiş sözde
`stop`u çalıştırır, günlüğü kapatır ve süreci çıkarır (çökmede kod 1). `stop` hata verir ya da
`graceMs` (10 sn) içinde bitmezse kod 1 ile çıkılır; kapanış sürerken gelen ikinci olay beklemeyi bırakır.
`isEntryModule(import.meta.url, process.argv[1])` modülün doğrudan başlatılıp başlatılmadığını dosya
URL'sini yola çevirerek sınar; `file:///` birleştirmesi POSIX'te yanlış eşleşir ve sunucu sessizce çıkardı.

## Katılım kapısı

`authenticateJoin(options)` oda `onAuth`unda çağrılır: protokol sürümünü ve oda kodu biçimini doğrular,
adı temizler ve `{ name, code }` döndürür. `rejectJoin(neden)` istemcide `JoinError(neden)` olarak
görünen `ServerError(4400, neden)` üretir. Ret **`onAuth`ta** yapılır: `onCreate`te fırlatılan
`ServerError`un kodu Colyseus'un HTTP katmanında durum kodu olur ve 4400 geçersiz olduğu için istemci
nedensiz `500` görür. `uniqueName(istenen, alınanlar)` odada çakışan adı `Ada 2`, `Ada 3` diye açar.

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
Toplam soket sınırı oda sayısını dolaylı bağlar; oda başına oyuncu sınırı odanın `maxClients`idir.

İstemcide kapının reddi `JoinError('busy')` olur (`429`/`503`); oyun "biraz sonra dene" der. Yükseltme aşamasındaki ret
WebSocket hatası olarak göründüğünden `unreachable` kalır. Köken denetimi yalnız `Origin` başlığı gönderen istemciyi (tarayıcı, Tauri/Android webview) sınar;
başlıksız Node istemcisi geçer, çünkü başlığı sahteleyebilen istemci için köken zaten güvenlik sınırı
değildir. Liste boşsa denetim yoktur; uzak erişim açılırken (`VOL_NET_HOST=0.0.0.0`) liste verilmelidir.
Tauri kabuğunun kökenleri `tauri://localhost`, `http://tauri.localhost` ve `https://tauri.localhost`tur.
İzlenen adres sayısı 50 000 ile sınırlıdır; boşta kalan adresler süpürülür. Saldırı sırasında günlük
şişmesin diye her ret nedeni günlüğe bir kez yazılır; sayaçlar `ConnectionGuard.stats()`tadır.

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
yazımı sunucuyu düşürmez. `stdoutSink` her kaydı bir satır yazar; `fileSink` satırları tamponlar ve
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
500 olur, ayrıntı yanıta sızmaz ve günlüğe yazılır. CORS yoktur: tarayıcı sayfası bu kapıyı çağıramaz,
ajan ve betikler Node'dan okur.

## Ölçüm ve sınırlar

- `drainEventLoopDelay`: olay döngüsü gecikmesi; histogramın ölçüm aralığı (10 ms) taban olarak
  çıkarılır, Windows'ta zamanlayıcı ayrıca ~15,6 ms ayrıktır. Okuma histogramı sıfırlar ve sıfırlamadan
  sonraki ilk örnek yalnız zaman çıpasıdır, ölçülmez.
- `processSnapshot()`: bellek, işlemci, çalışma süresi, süreç ve sürüm bilgisi.
- `Ring`/`summarize`: son N ölçümün ortalama, p50, p99 ve en büyük değeri; ayırma yapmaz.
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
