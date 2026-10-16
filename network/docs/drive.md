# Yük sürücüsü (`@volstudio/network/drive`)

Başsız çok istemcili sürücü: gerçek Colyseus SDK istemcileri bir odaya katılır, oyunun verdiği `act` ile
girdi yollar ve ağ ile sunucu yükünü ölçer. Yalnız Node'da çalışır; oyunun tarayıcı kodu ve diğer network
yüzeyleri ona uzanamaz, kendisi de sunucu kodunu içe aktarmaz (`scripts/quality/layers.mjs`). Görüntüleme,
öngörü ve uzlaştırma tarayıcıdadır; bu sürücü onları ölçmez, ölçtüğü şey katılım, yama akışı, ping, kopma ve
sunucunun taşıdığı yüktür.

## API

```ts
import { JsonlReport, runFleet } from '@volstudio/network/drive';

const report = JsonlReport.toFile('records/drive/last.jsonl');
const summary = await runFleet({
  endpoint: 'http://127.0.0.1:2567',
  roomName: 'world',
  clients: 24,
  durationMs: 60_000,
  actMs: 17,
  joinOptions: (index) => ({ name: `bot${index}` }),
  act: ({ index, room }) => sendInput(room, index),
  report,
});
await report.close();
```

`rampMs` (varsayılan istemci başına 50 ms) katılımları yayar. `sampleMs` (1000) örnek ve ping aralığıdır.
`reconnect` kopan botu SDK'nın yeniden bağlanmasına bırakır; varsayılan kapalıdır, kopma ölçülür.
`signal` koşuyu erken bitirir. `act` her `actMs`te bağlı her bot için çağrılır; fırlatırsa `actErrors`
sayılır ve koşu sürer.
Koşu bitince henüz başlamamış katılım zamanlayıcıları iptal edilir; uzun `rampMs` bitişi uzatmaz.
Başlamış eşleştirmeler sonuçlanınca açık oda bırakmadan kapatılır.

## Rapor

`JsonlReport` her olayı bir JSON satırı olarak yazar; `t` koşu başından bu yana ms, `ev` olay adıdır.

| `ev`                      | Alanlar                                                                                                                                                                     |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `start`                   | `clients`, `durationMs`, `rampMs`, `sampleMs`, `actMs`, `roomName`                                                                                                          |
| `join` / `joinFailed`     | `bot`, `ms` / `bot`, `reason` (`JoinError.reason`: `busy`, `full`, ...)                                                                                                     |
| `sample` (≤ 64 istemcide) | `bot`, `patchHz`, `messageHz`, `gapP99Ms`, `gapMaxMs` (son örnek penceresi)                                                                                                 |
| `fleet`                   | `connected`, `patchHz`, `messageHz` (bot başına), `pingP99Ms`, `gapP99Ms`                                                                                                   |
| `drop`                    | `bot`, `code` (sunucu ya da ağ kapanış kodu)                                                                                                                                |
| `error` / `actError`      | `bot`, `code`, `message` (`actError` ilk hatada bir kez)                                                                                                                    |
| `summary`                 | `FleetSummary`: katılım/yama aralığı/ping dağılımı (`count`, `mean`, `p50`, `p99`, `max`), `patchesPerSecond`, `messagesPerSecond`, `dropped`, `closeCodes`, `joinFailures` |

Dağılımlar sabit kovalı `Histogram`la tutulur (bellek ölçüm sayısıyla büyümez, 24 saatlik koşuda da
kullanılır); yüzdelik kovanın üst sınırıdır, en çok bir kova yukarı yuvarlanır. Yama aralığı, SDK'nın
`onStateChange` olayları arasındaki süredir; Windows'ta sunucu `setPatchRate(50)` ile 20 Hz ister ama
zamanlayıcı ~15,6 ms ayrık olduğundan yama aralığı ~62,5 ms (16 Hz) ölçülür.

## Bozuk ağ aracısı (`ImpairedLink`)

Gerçek sunucuyla istemci arasına konan TCP aracısıdır; WebSocket üstüne bindiği için tarayıcı ya da SDK
istemcisi adresini `endpoint`e çevirir. Loopback'te rastgele portta dinler.

```ts
const link = await ImpairedLink.start(
  { host: '127.0.0.1', port: serverPort },
  { profile: { latencyMs: 80, jitterMs: 40, stallProbability: 0.02, stallMs: 300 } },
);
// istemci: link.endpoint
link.setProfile({ latencyMs: 250 }); // yeni parçalar için
link.blackhole(); // iki yönde her şey tutulur, bağlantı açık kalır (telefon uykuya girdi)
link.release(); // tutulan sırayla teslim edilir
link.sever(); // bağlantıları hemen yok eder (Wi-Fi'dan LTE'ye geçiş)
```

TCP sıralı olduğundan gecikme ve titreşim sırayı bozmaz; paket kaybı yeniden iletim bekleyişi olarak
(`stallMs`, arkadaki her şeyi geciktirir) modellenir, gerçek paket kaybı bu katmanın altındadır.
`bytesPerSecond` yön başına bant genişliğini sınırlar. Yön başına `maxBufferedBytes` (varsayılan 1 MiB)
üstünde kaynak soket okumayı durdurur; tek okuma parçası sınırı aşabilir. Hedef yazımı dolunca
`drain` beklenir: kara delik sınırsız belleğe çekmez, taşıma geri basıncını korur.
`stats()` bağlantı, bayt, tampon baytı ve geciktirilen parça sayar. Bu bir ağ emülatörü değil, tekrarlanabilir bir bozulma kaynağıdır; ölçülen sayılar o profilin
sonucudur, gerçek ağ ya da cihaz kabulü değildir.

`judgeFleet` sıfır örnekli gecikme dağılımını ölçülmemiş olarak işaretler; `complete` yanlıştır.
`observeServer` eksik/bozuk alanı sıfıra çeviremez ve aynı örnekteki bütün odaların atımlarını toplar.
VOL.TEST `--profile` koşusu başarısız **veya eksik** hükümde sıfırdan farklı çıkış verir.

## VOL.TEST

`pnpm --filter @volstudio/vol-test drive -- --clients 24 --seconds 60 --out records/drive/run.jsonl`
kalıcı savaş dünyasına 60 Hz girdi yollayan botlar (sürüş, dönüş, nişan, ara sıra ateş) katar.
`--server` sunucu adresi, `--ops` sunucunun işletim kapısıdır: verilirse `/metrics` her saniye rapora
`server` satırı olarak girer (oda adım süresi, trafik, bağlantı kapısı sayaçları) ve istemci gözlemi ile
sunucu yükü aynı zaman çizgisinde okunur. Rapor vol-test paketinin git dışı records klasörüne yazılır.
Tüm botlar tek adresten bağlandığından sunucu `VOL_NET_MAX_SOCKETS_PER_ADDRESS` ile yükseltilmelidir.

Ölçüm örneği (geliştirme makinesi, Windows 11, 8 çekirdek, loopback, sunucu ve botlar aynı makinede;
cihaz ya da ağ kabulü değildir): 8 bot, 20 sn: katılım p99 77 ms, yama aralığı p50 63 / p99 67 ms, ping
p99 7 ms, bot başına ~49 KB/sn gönderim, oda adımı ortalama 1,1 / p95 1,6 ms, olay döngüsü gecikmesi
p99 ~7 ms. 16 bot: adım p95 1,8 ms, bot başına ~45 KB/sn. Bu sayılar bir kapasite iddiası değildir;
saatlik ve 24 saatlik koşu ile Windows ve Steam Deck ölçümü ayrı iştir ve yapılmamıştır.
