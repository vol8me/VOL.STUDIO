# CORE primitifleri

CORE'un **katman 1**'i: sunumdan bağımsız, doğrudan alınıp kullanılan parçalar.

Her primitif yaptığı işle tanımlanır — nerede kullanılacağıyla değil. Hangi
oyunun neye ihtiyacı olduğu CORE'un kararı değildir.

## Sonlu sayı sözleşmesi

Her primitif dış dünyadan gelen sayıyı **sınırda** doğrular. `NaN`/`Infinity`
bir kez duruma girdiğinde her aritmetiği kirletir ve kaynağı çok sonra,
tamamen ilgisiz bir yerde fark edilir.

İki politika vardır ve seçim bilinçlidir:

| Politika                     | Nerede                                                                  | Neden                                                                           |
| ---------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **Reddet** (`requireFinite`) | Yapılandırma: `new Cooldown(ms)`, `breakMs`, `cellSize`, kaynak miktarı | Bozuk değer çağıranın hatasıdır; sessizce düzeltmek onu kullanıma kadar erteler |
| **Yoksay** (`finiteOr`)      | Akış: `update(deltaMs)`                                                 | Tek bozuk kare yüzünden oyunu durdurmak orantısız olurdu                        |

`core/tests/governance/numericContract.test.ts` bunu kapıda doğrular.

## CORE'un üç katmanı

| Katman        | Ne yapar                                     | Örnek                                       |
| ------------- | -------------------------------------------- | ------------------------------------------- |
| **Mekanizma** | Sunumdan bağımsız, oyun kelimesi bilmez      | `Scheduler`, `StateMachine`, `SpatialIndex` |
| **Sunum**     | Durumu çizer, niyet bildirir — kural taşımaz | `Bar`, `SkillTree`, `ShopPicker`            |
| **Tarif**     | Yaygın kuralı hazır verir — ama **opt-in**   | `resolveSkillStates()`, `applyXpGain()`     |

Ayrımın sebebi somuttur: bir kural sunum bileşeninin içinde yaşarsa bileşen
kendi defterini tutar ve tüketicinin kendi sistemiyle **kayar**. `XPBar` bir
dönem seviye hesabını kendi yapıyordu; onu tüketen oyun kullanmayı reddedip
yalnızca `setState()` çağırdı — kural CORE'da dururken tek çalıştıranı showcase
demosu kaldı.

Tarif katmanı bu yüzden **silinmiş bir kural değil, taşınmış bir kuraldır**:
yaygın davranış hazır durur, tek satırda çağrılır, ama hiçbir bileşen onu
arkanda varsaymaz.

## Zamanlama

Üçü de delta-time ile sürülür: `update()` çağrılmadıkça zaman akmaz. Tarayıcı
zamanlayıcılarından farkı budur — duraklatılmış bir çalıştırmada hiçbiri
ilerlemez.

### `Scheduler`

Gecikmeli ve tekrarlı işler. Deterministiktir: aynı delta dizisi aynı
tetiklenme sırasını üretir.

**Yeniden giriş reddedilir:** bir callback içinden `update()` çağrılırsa çağrı
yok sayılır ve `false` döner. Aksi halde iç çağrı zamanı bir kez daha ilerletir
(ölçüldü: tek 10ms'lik kare içinde aynı iş üç kez çalışıyordu) ve "yayın
sırasında eklenen iş bu turda çalışmaz" garantisini kırar.

```ts
const scheduler = new Scheduler({ maxCatchUp: 32 });
const cancel = scheduler.every(2000, tick);
scheduler.after(500, once);

scheduler.update(deltaMs);
```

Uzun bir karede birikmiş tetiklenmeler **atlanmaz** (aksi halde kare
düşmelerinde mantık gerçek zamandan geri kalır) ama **sınırsız da değildir**:
donmuş bir sekmeden dönen tek dev delta, 1ms periyotlu bir işi yüz binlerce kez
çağırıp kareyi kilitlerdi. `maxCatchUp` aşılınca kalan borç düşülür ve
`onCatchUpLimit` ile bildirilir.

### `Cooldown`

Bir işlemin yeniden yapılabilir olmasına kalan süre.

```ts
const cd = new Cooldown(250);
if (cd.tryTrigger()) act(); // kontrol + tetikleme tek çağrıda
bar.setValue(cd.getProgress()); // [0,1]
cd.setDuration(180); // devam eden bekleme KISALIR
cd.update(deltaMs);
```

`tryTrigger` tek çağrıdır: kontrol ve tetikleme ayrı adımlar olsaydı araya
giren bir çağrı ikisinin arasında beklemeyi tüketebilirdi.

### `RoundLoop`

Ardışık turlar ve aralarındaki mola. Toplam tur sınırı opsiyoneldir; verilmezse
sonsuz sürer.

```ts
const loop = new RoundLoop({
  breakMs: 5000,
  totalRounds: 20,
  onRoundStart: (round) => begin(round),
  onComplete: () => finish(),
});
loop.start(); // İLK tur hemen başlar, mola aralarda

loop.update(deltaMs);
loop.getRound();
loop.getRemainingMs();
loop.skipBreak(); // molayı atla
```

### `Clock`

Duraklatılabilir, ölçeklenebilir geçen-zaman sayacı. "İçeride geçen zaman"ı
okuyan her yer gerçek zamanı değil bunu okumalıdır.

```ts
const clock = new Clock();
clock.setScale(0.5); // yavaş çekim; 0 = dondur
clock.update(deltaMs);
clock.getElapsedSeconds();
```

## Durum

### `StateMachine`

Tipli sonlu durum makinesi. Boolean bayrak birleşimlerinin
(`isPaused && isFinishing`) aksine geçersiz durumu **temsil edilemez** kılar.

```ts
const machine = new StateMachine<'draft' | 'review' | 'done'>({
  initial: 'draft',
  states: {
    draft: { transitions: ['review'], onEnter: () => prepare() },
    review: { transitions: ['done'], onUpdate: (dt) => tick(dt) },
    done: { transitions: [] }, // terminal
  },
  onRejected: (from, to) => console.warn(`geçersiz geçiş: ${from} → ${to}`),
});
```

`transitions` verilmezse her geçiş serbesttir; boş dizi durumu terminal yapar.
Kanca sırası `onExit` → durum değişimi → `onEnter`; `onEnter` içinde
`getState()` YENİ durumu görür.

**Kanca hatası:** bir kanca fırlatırsa makine kaynağa döner ve hata yeniden
fırlar. Bu geri alma **tam değildir ve olamaz** — `onEnter` fırlamışsa
`onExit(from)` zaten çalışmıştır, yani makine `from`'da görünürken `from`'un
çıkış temizliği yapılmıştır. Yırtık durum kaçınılmaz; seçenek yalnızca hangi
yarısında durulacağı. Doğru çözüm çağırandadır: `onEnter` istisna-güvenli
yazılmalı ya da `onTransitionError` ile bilinçli bir kurtarma yapılmalıdır.

### `ResourcePool`

Tipli sayaç cüzdanı. Kaynak kümesini **tüketici** tanımlar —
`StatBlock<TStat>` ile aynı sözleşme.

```ts
const wallet = new ResourcePool<'a' | 'b'>({ a: 100, b: 5 }, { b: 10 });

if (wallet.spend({ a: 50, b: 2 })) commit();
```

`spend` **ya hepsi ya hiçbiri**: bir kalem yetmezse hiçbiri düşmez. Kısmi
harcama geri alınamaz bir ara duruma yol açardı.

### `EventBus`

Tipli yayın/abone. Olay kümesini tüketici tanımlar.

```ts
interface Events {
  changed: { total: number };
  ended: void;
}

const bus = new EventBus<Events>();
const off = bus.on('changed', ({ total }) => hud.set(total));
bus.emit('changed', { total: 120 });
```

Yayıncının dinleyicileri tanımaması, bir çıktıya yeni tüketici eklemeyi
yayıncıya dokunmadan mümkün kılar. Bir dinleyicinin hatası kalanları durdurmaz;
yayın sırasında yapılan abonelik değişiklikleri o yayını bozmaz.

## Uzam

### `Grid`

Sabit boyutlu, ayrık 2B ızgara. `SpatialIndex`ten farkı ölçek değil MODEL:
`SpatialIndex` sürekli uzayda "yakınımda ne var", `Grid` ayrık hücrelerde "şu
hücrede ne var" sorusunu yanıtlar.

```ts
const grid = new Grid<T>(cols, rows);
grid.set(col, row, value); // sınır dışı → false, sessiz taşma yok
grid.get(col, row); // sınır dışı → undefined
grid.neighbours(col, row, DIAGONAL_NEIGHBOURS); // dizi + nesne tahsis eder
grid.forEachNeighbour(col, row, (c, r) => {}); // tahsis-sız, sıcak döngüler için
grid.forEach((value, col, row) => {}); // koordinat SAYI — aliasing imkânsız
grid.toCell(x, y, cellSize);
grid.toWorld(col, row, cellSize); // hücre MERKEZİ
```

### `findPath` (A\*)

Izgara üzerinde en kısa yol. Izgaranın içeriğini bilmez: geçilebilirlik ve
maliyet çağırandan gelen fonksiyonlardır.

Aynı ızgarada tekrar tekrar arama yapılacaksa `PathFinder` kullanılır:
tamponları bir kez ayırır ve her aramada damga (generation) tekniğiyle
"temizler", yani hazırlık O(1) olur. `findPath` her çağrıda üç typed array
tahsis eder — tek seferlik aramada görünmez, çok sayıda birim her kare yol
arattığında GC takılmaları başlar.

```ts
const finder = new PathFinder(cols, rows);
finder.find(start, goal, options);

// tek seferlik:
const path = findPath({ cols, rows }, start, goal, {
  isWalkable: (p) => !blocked.has(key(p)),
  cost: (p) => terrainCost(p),
  neighbours: DIAGONAL_NEIGHBOURS,
});
```

Sezgisel komşuluğa göre seçilir (dört yönde Manhattan, çaprazda Chebyshev);
sezgiselin gerçek maliyeti aşmaması A\*'ın en kısa yol garantisinin koşuludur.
Çapraz adım maliyeti √2 sayılır, yoksa yol çaprazlara çarpılırdı.

### `FlowField`

TEK hedefe giden ÇOK birim için. `findPath` bir başlangıçtan bir hedefe arar
(N birim = N arama); `FlowField` hedeften geriye tek bir Dijkstra taraması
yapar ve her hücre için "buradan hangi komşuya" bilgisini üretir. 10 birim de
5000 birim de aynı alanı okur.

```ts
const field = new FlowField(cols, rows);
field.compute([goal], { isWalkable, cost });

field.getNext(col, row); // hedefe doğru komşu; ulaşılamıyorsa null
field.getCost(col, row); // toplam maliyet; ulaşılamıyorsa Infinity
field.traceFrom(col, row); // tam yol (alan hazır olduğu için ucuz)
```

Bedeli: tüm ızgara taranır ve hedef değişince yeniden hesaplanır. Az birim ya
da sık değişen hedefte A\* daha ucuzdur — ikisi rakip değil, farklı sorulara
verilen cevaplardır.

### Doğru ve görüş

```ts
bresenhamLine(from, to); // uçlar dahil, bitişik hücreler
hasLineOfSight(from, to, { blocks }); // uç hücreler varsayılan olarak sayılmaz
```

Yalnızca tam sayı aritmetiği kullanır: kayan noktalı adımlarda uzun
mesafelerde birikimli yuvarlama hatası doğruyu kaydırır ve iki uçtan çizilen
aynı doğru farklı hücrelerden geçer.

## Koleksiyonlar

### `RingBuffer`

Sabit kapasiteli kayan pencere. Dizi + `shift()` yerine: `shift()` kalan tüm
elemanları kaydırır (O(n)), halka tamponda ekleme/düşürme O(1).

```ts
const history = new RingBuffer<number>(60);
const evicted = history.push(value); // dolduysa düşen öğeyi DÖNDÜRÜR
```

Düşeni döndürmesi, kayan bir toplam/ortalama tutan çağıran için gereklidir.

### `Deck`

Karılmış çekme yığını, iskarta ve yeniden karma ile. `WeightedPicker`den farkı:
o her seferinde bağımsız bir zar atar, `Deck` sonlu bir yığından TEKRARSIZ
çeker. "N çekişte her öğe en az bir kez" garantisini yalnızca ikincisi verir.

```ts
const deck = new Deck(items, random);
deck.draw();
deck.discard(item); // tükenince karılıp geri döner
deck.putOnTop(item);
```

Fisher-Yates ile karar. `sort(() => rnd - 0.5)` yaygın ama yanlıştır:
karşılaştırma tutarsız olduğu için sonuç sıralama algoritmasına bağlıdır ve
dağılım düzgün değildir.

### `SlotContainer`

Sabit sayıda slot, isteğe bağlı yığınlama, taşıma ve takas.

```ts
const bag = new SlotContainer<Item>({
  size: 24,
  isSameItem: (a, b) => a.id === b.id,
  maxStack: (item) => item.stackSize,
});

const leftover = bag.add(item, 25); // KISMİ ekler, sığmayanı döner
bag.swap(from, to); // aynı yığınlanabilir öğede TAKAS değil BİRLEŞTİRME
```

Yığınlama varsayılan olarak KAPALIDIR (`maxStack` 1): yığınlanamayan bir öğeyi
yanlışlıkla bindirmek sessizce kopya üretirdi.

## Performans

### `ObjectPool`

Sık doğup ölen kısa ömürlü nesneler. Amaç allocation'ı değil **çöp toplamayı**
azaltmak: kare başına yüzlerce nesne, GC'yi görünür takılmalar üretecek
sıklıkta tetikler.

Havuz **sahiplik** takip eder: `acquire` edilmemiş bir nesnenin iadesi hata
fırlatır. Aksi halde yabancı nesne havuza girer ve bir sonraki `acquire()` ile
başka bir çağırana dağıtılırdı — iki sahip aynı örneği paylaşır.

```ts
const pool = new ObjectPool<T>({
  create: () => new T(),
  reset: (item) => {
    item.ref = null;
  }, // referansları BIRAK
  prewarm: 64,
  maxIdle: 256, // tepe anındaki şişme kalıcı olmasın
});

const item = pool.acquire();
pool.release(item); // aynı örneği iki kez iade → hata
```

`reset` içinde referans bırakmak çağıranın sorumluluğudur: boşta duran bir
nesne başkasına referans tutuyorsa o da serbest kalmaz.

### `SpatialIndex`

"Şu noktanın yakınında ne var?" sorusunu O(N)'den O(k)'ya düşürür.

```ts
const index = new SpatialIndex<T>(64, (t) => t.isActive);

index.rebuild(items); // tüm dünyayı yeniden indeksle, O(N)
index.refresh(items); // KÜME aynı, konumlar değişti — O(hücre değiştiren)
index.update(item); // yalnızca değişeni bildir; hücre aynıysa false, iş yok

index.query(x, y); // 3×3 hücre — YALNIZCA yarıçap ≤ cellSize iken doğru
index.queryRadius(x, y, r); // her yarıçapta doğru, daireye göre filtreli
index.queryBounds(x, y, w, h); // dikdörtgen bölge (negatif boyut normalize)
index.findNearest(x, y, r, self); // en yakın, kendini hariç tutabilir

index.queryInto(mine, x, y); // ÇAĞIRANIN dizisine yazar — süresiz saklanabilir
index.queryRadiusInto(mine, x, y, r);
```

**Sonuç tamponu:** `query*` metodları 4'lük bir halkadan yeniden kullanılan dizi
döner. Dördüncü sorgudan sonra halka devreder ve saklanan eski bir sonuç
**uyarısız** başka bir sorgunun verisine dönüşür (ölçüldü: 5 sonuç tutulduğunda
birincisi beşincinin verisi oluyordu). Sonucu saklaman gerekiyorsa `queryInto`
kullan; teşhis için `queryStamp()` + `assertQueryValid(stamp)` bozulmayı
gürültülü hâle getirir.

**Sözleşme farkı önemlidir:** `query()` sabit 3×3 pencere tarar; arama yarıçapı
`cellSize`'ı aşarsa uzaktaki varlığı **sessizce** kaçırır. Bu, ölçü
değiştiğinde (menzil artıran bir etki, farklı birim tipi) ortaya çıkan ve fark
edilmesi zor bir hatadır. Geniş arama için `queryRadius` kullanılır — taranacak
hücre sayısını yarıçaptan hesaplar.

İki model **aynı sonucu** verir (testle kilitli). Nesnelerin çoğu sabitse ve az
sayıda öğe hareket ediyorsa artımlı model O(hareket eden)'e düşer; hepsi her
kare hareket ediyorsa `rebuild` daha basittir.

**`refresh` ikisinin arasıdır:** varlık KÜMESİ değişmeyip yalnız konumlar
kaydığında (tipik "hareket ettir, sonra çarpışmayı çöz" sırası) `rebuild`
indeksi boşaltıp her varlığı yeniden ekler — maliyet hareket etmemişlere de
biner. `refresh` her varlık için `update` çağırır ve hücre değişmediğinde
hiçbir iş yapmaz; pasif olanları indeksten düşürür. Listeden TAMAMEN çıkan bir
varlığı yalnız `rebuild` temizler, o yüzden doğum/geri dönüşüm olan geçişte
`rebuild` kullanılır.

## Rastgelelik

### `WeightedPicker`

Ağırlıklı seçim; deterministik `Random` ile çalışır, yani aynı tohum aynı
diziyi üretir.

```ts
const picker = new WeightedPicker([
  { value: a, weight: 9 },
  { value: b, weight: 1 },
]);

picker.pick(random);
picker.pickUnique(random, 3); // tekrarsız
```

Sıfır/negatif ağırlık havuza girmez — "bu seçenek şu an kapalı" demenin doğal
yolu ağırlığı sıfırlamaktır.

## Geometri

Saf sayılarla çalışır, hiçbir nesne tipi tanımaz.

```ts
circlesOverlap(a, b);
circleRectOverlap(circle, rect); // KÖŞE temasını yakalar
pointInRect(x, y, rect);
raycastCircles(origin, direction, targets, maxDistance); // en YAKIN isabet
```

Karşılaştırmalarda `distanceSquared` kullanılır: kare kök, sonucu bir eşikle
karşılaştırırken bilgi eklemez ama kare başına binlerce çağrıda maliyet üretir.

`raycastCircles` ışının arkasındaki hedefleri eler — negatif izdüşüm,
"arkamdaki hedefi vurdum" hatasının kaynağıdır.

### İnterpolasyon

```ts
clamp(v, min, max);
lerp(a, b, t); // t kelepçelenmez (ekstrapolasyon bilinçli)
inverseLerp(a, b, v);
remap(v, fromMin, fromMax, toMin, toMax);
approach(current, target, maxDelta); // hedefi AŞMAZ, ona ULAŞIR
damp(current, target, smoothing, deltaMs); // kare hızından BAĞIMSIZ
wrap(v, min, max); // üst sınır dışlayıcı
```

`damp` ile naif `lerp` arasındaki fark önemlidir: `lerp(cur, target, 0.1)` her
KAREDE aynı oranı uygular, yani 30 FPS ile 144 FPS'te farklı hızda yumuşatır ve
his donanıma göre değişir. `damp` oranı delta ile üstel hesaplar.

`approach` ise sabit hızla yaklaşır ve hedefe gerçekten ULAŞIR; `lerp` her
karede kalan mesafenin bir kısmını kapattığı için teorik olarak hiç varmaz ve
bir eşitlik kontrolü asla tutmaz.

## Web araçları için UI yüzeyi

Repo içindeki web araçları, Phaser bağımlılığını bundle'a taşımayan alt yolları
kullanır:

```ts
import {
  CanvasViewportController,
  CommandHistory,
  KeyedVirtualList,
  SplitPane,
  Toolbar,
} from '@volstudio/core/ui';
import { i18next } from '@volstudio/core/i18n';
import '@volstudio/core/ui/styles.css';
```

`@volstudio/core/lifecycle` ve `@volstudio/core/fonts` da aynı nedenle ayrı
giriş noktalarıdır. Web araçları kök `@volstudio/core` barrel'ını kullanmaz;
bu barrel oyun runtime yüzeyini de taşır.

`StatsPanel`, tüketicinin verdiği kimlikli grupları ve satırları DOM'u yıkmadan
güncelleyen, sağdan açılan modal çekmecedir. `icon` alanı `string | Element`
kabul eder; CORE oyun ikonlarını bilmez, yalnızca verilen elementi güvenli bir
kopya olarak yerleştirir. Scrim, `Modal` ile aynı karartma sözleşmesini kullanır;
bulanıklaştırma eklemez. Yükseklik ekranı tamamen doldurur, içerik ise panelin
içinde kayar. Oyun kuralları ve stat hesapları çağıranda kalır.

### Dokunsal geri bildirim yeteneği

`vibrate()` hâlâ NİYET alır (`'tap'`, `'error'`), ama artık iki katmandan
birine yönlenir ve hangisinin var olduğunu ÇALIŞMA ANINDA ölçer:

- `navigator.vibrate` — Android WebView ve mobil tarayıcılar.
- Oyun kolunun `vibrationActuator`'ı — masaüstünde ve Steam Deck'te titreşimin
  tek gerçek kaynağı; klavye ve fare titremez.

`getHapticsCapability()` o anki durumu, `observeHapticsCapability()` ise
DEĞİŞİMLERİ verir (`gamepadconnected`/`gamepaddisconnected`). Tüketici ayarı
buna bağlar: kol takılınca titreşim kutusu etkinleşir, çıkarılınca pasifleşir.
Açılışta bir kez ölçüp karar vermek, kolunu sonradan takan oyuncuya ayarı
sonsuza dek kapalı gösterirdi.

Desen tablosu tek kaynaktır: ms dizisi Vibration API'ye, aynı desenin süre +
şiddet karşılığı oyun koluna gider. Reddedilen efekt ya da izin hatası asla
akışı kesmez — titreşimin olmaması bir hata değil, o platformun gerçeğidir.

### Grafik kalitesi

`GraphicsQuality<TLevel, TProfile>` kalite kademelerinin JENERİK kaydıdır:
kademe listesi, geçerli kademe, değişim bildirimi ve opsiyonel DOM yansıması.
**CORE profilin içini bilmez** — kademelerin adı ve knob'ların ne olduğu
tamamen tüketicinindir; bir knob sözlüğü dayatmak bir sonraki oyunun
ihtiyacını yanlış tahmin ederdi. Kalıcılıktan da habersizdir: tüketici kendi
`SaveManager`'ı ile yükler ve `setLevel()` çağırır.

```ts
const quality = new GraphicsQuality({
  levels: { high: { renderScale: 1 }, low: { renderScale: 0.7 } },
  initial: 'high',
  // Opsiyonel: CSS `[data-vol-graphics='low']` ile pahalı boyamayı kapatır.
  reflect: { element: document.documentElement, attribute: 'vol-graphics' },
});
```

`ViewportManager.renderScale` bunun RENDER ayağıdır ve DPR'den bağımsızdır.
Kritik nokta: `strategy: 'resize'` modunda Phaser'ın dünya birimi doğrudan
backing store pikselidir, yani çözünürlüğü değiştirmek DÜNYAYI da değiştirir —
arena küçülür, dünya birimi/saniye cinsinden sabit olan hızlar ekranda
hızlanır. Bu yüzden `applyToScene()` kamerayı rasterleme çarpanı kadar
yakınlaştırır: görünen dünya alanı `viewport / zoom` = CSS pikseli olur ve
çözünürlükten bağımsız kalır. Sahneler `applyVolViewport(scene)` ile bu
sözleşmeye girer. Pencere yeniden boyutlandığında backing store önce yeni
ölçüye alınır, ardından zoom tazelenir; bu sıra Phaser'ın `Scale.NONE` inline
CSS boyutunu ve input koordinatlarında kullanılan canvas sınırını yeni viewport
oranına göre yeniden hesaplamasını sağlar.

**Ekran uzayına sabitlenen katmanlar (`scrollFactor: 0`) kamera
yakınlaştırmasından MUAF DEĞİLDİR** (bkz. Phaser `GetCalcMatrix`: scrollFactor
yalnız ötelemeyi iptal eder, ölçeği değil). Böyle bir katman işaretçi
konumunu kullanacaksa önce kamera uzayına çevirmelidir:
`(pointer.x - camera.x) / camera.zoom`. `TouchController` bunu yapar; yan
kazanç olarak joystick yarıçapları CSS pikseline sabitlenir ve yüksek DPR'li
telefonlarda `1/dpr` kadar küçülmez.

`Counter.setValue()` **varsayılan olarak değişim yönünü vurgular**: artışta
`--increase`, azalışta `--decrease` sınıfı oynar. Bu, `pulse: true` opt-in'i
olan eski davranıştan farklıdır ve `ResourceCounter`/`ResourceBar` üzerinden
tüm tüketicileri etkiler. Aynı sayacı HER KARE yazan bir HUD (skor, süre,
mesafe) sürekli animasyon almamak için açıkça `change: 'none'` geçer; yön
zorlamak için `change: 'increase' | 'decrease'` verilir.

`TouchStickState` dokunmatik SICAK YOLDUR: `getState`, çizim katmanı ve yön
sorgusu kare başına en az dört kez ham vektör okur. Bu okumalar yeniden
kullanılan tamponlara yazar, yeni `Vector2` üretmez — mobilde kare başına
küçük çöp doğrudan GC duraklamasına dönüşür. Sonuçlar SENKRON okunmalıdır:
bir sonraki çağrıya kadar geçerlidirler, saklanmazlar. Stick'in `base` ve
`current` alanları AYRI nesnelerdir; tek nesne paylaşılsaydı parmağın her
hareketi joystick'in tabanını da sürüklerdi.

Süpürülmüş çarpışmada `segmentCircleOverlap` "kesişti mi" der, `segmentCircleEntryT`
İLK TEMAS parametresini (`0..1`) döndürür. Bir adımda birden fazla daire
kesişiyorsa çağıran en küçük `t`'yi seçerek sonucu aday listesinin sırasından
bağımsız kılar — dizideki ilk eşleşmeyi almak, aynı geometride farklı sonuç
üretir ve mermi öndekinin içinden geçebilir.

`FullscreenController`, web araçları ve Phaser sahneleri için ortak F11/
programatik tam ekran akışıdır. Standart Fullscreen API'yi, Android WebView
uyumluluğu için WebKit isimlerini ve API reddedildiğinde hata callback'ini
destekler. İki veya daha fazla listener'ı olduğu için `DisposableScope` ile
`destroy()` edildiğinde klavye ve fullscreen listener'larını birlikte kaldırır.

Workbench bileşenleri oyun kuralı tutmaz:

- `SplitPane`, yatay/dikey panel ölçüsünü pointer ve klavye ile değiştirir;
  daraltma durumunu çağıran yönetir. Kullanıcının seçtiği ölçü ayrı tutulur:
  pencere daralınca görünen ölçü kısılır, yeniden genişleyince tercih geri gelir.
- `Toolbar` ve `ToolButton`, roving tabindex, ARIA ve tekli/çoklu seçim
  davranışını sağlar. Seçimli bir toolbardaki **aksiyon** düğmeleri (menü açan,
  komut çalıştıran) `toggle: false` almalıdır; aksi halde seçim kümesine girer
  ve basıldıklarında aktif aracı düşürürler.
- `PropertyField` etiket, açıklama, durum ve sıfırlama niyetini tek erişilebilir
  alanda toplar; `Popover` açılma/kapanma ve odağı geri verme işini üstlenir.
  Odak yalnız popover'ın içindeyken tetikleyiciye döner: dışarı tıklamayla
  kapanışta kullanıcının odaklandığı alan korunur.
- `KeyedVirtualList`, satır DOM'unu kimliğe göre korur; güncelleme sırasında
  odağı ve esnek satır ölçülerini kaybetmez. Satırlarında bileşen kuran
  tüketiciler `destroyItem` vermelidir — satır görünürden çıktığında ve liste
  yıkıldığında çağrılır, verilmezse her kaydırma dinleyici sızdırır.
- `CanvasViewportController`, normal sol sürüklemeyi çizim aracına bırakır.
  Kamera yalnızca orta tuşla veya `Space` + sol tuşla kaydırılır; tekerlek
  imlecin altındaki belge koordinatını sabit tutarak yakınlaştırır.
- `CommandHistory`, komutları byte bütçesi içinde tutar; transaction, geri alma
  ve yineleme mekanizması sunar. Komutların alan anlamı tüketicide kalır.
  Bütçe aşıldığında en eski komutlar düşer; tek başına bütçeye sığmayan bir
  komut uygulanır fakat saklanamaz ve o noktadan geriye hiçbir undo geçerli
  olmadığı için yığın tümüyle bırakılır.

### Değer ve olay sözleşmesi

Form kontrollerinde `setValue()` / `setChecked()` programatik ve **sessizdir**.
Kullanıcı etkileşiminde `onInput` canlı değeri, `onCommit` tamamlanan hareketi
bildirir. Değer taşıyan primitiflerde `onChange` geçişi tamamlandı; yeni
tüketiciler `onInput` / `onCommit` kullanmalıdır. `onChange` yalnızca Toolbar
ve Tabs gibi değer değil seçim/aksiyon semantiği taşıyan bileşenlerde kalır.
Özellikle bildirim gereken programatik geçişlerde
`setValueAndNotify()` / `setCheckedAndNotify()` kullanılır.

DOM olayı, dil aboneliği, observer veya pointer capture alan her workbench
bileşeni `destroy()` ile bunları bırakır. Bu sözleşme, araç yüzeyi yeniden
kurulduğunda çift listener ve eski DOM'a bildirim sızıntısını önler.

## Ayrımı bozmamak

- Bir bileşene kural eklemek istediğinde önce sor: **başka bir tüketici bunu
  farklı isteyebilir mi?** Cevap evetse kural tarif katmanına ait.
- Bir primitif ne kodunda ne dokümanında bir türe (genre) bağlanmaz; örnek
  vermek gerekiyorsa mekanizmanın kendi terimleriyle verilir.
  `core/tests/governance/primitiveNeutrality.test.ts` bunu kapıda doğrular.
- Public API yüzeyi sayılıdır (`publicSurface.test.ts`); yeni export bilinçli
  bir karardır, kapı kırılınca sayı güncellenir.
