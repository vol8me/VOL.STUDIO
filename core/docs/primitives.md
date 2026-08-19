# CORE primitifleri

CORE'un **katman 1**'i: sunumdan bağımsız, doğrudan alınıp kullanılan parçalar.

Her primitif yaptığı işle tanımlanır — nerede kullanılacağıyla değil. Hangi
oyunun neye ihtiyacı olduğu CORE'un kararı değildir.

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

```ts
const scheduler = new Scheduler();
const cancel = scheduler.every(2000, tick);
scheduler.after(500, once);

scheduler.update(deltaMs);
```

Uzun bir karede birikmiş tetiklenmeler **atlanmaz**; aksi halde kare
düşmelerinde mantık gerçek zamandan geri kalır.

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
grid.neighbours(col, row, DIAGONAL_NEIGHBOURS);
grid.toCell(x, y, cellSize);
grid.toWorld(col, row, cellSize); // hücre MERKEZİ
```

### `findPath` (A\*)

Izgara üzerinde en kısa yol. Izgaranın içeriğini bilmez: geçilebilirlik ve
maliyet çağırandan gelen fonksiyonlardır.

```ts
const path = findPath({ cols, rows }, start, goal, {
  isWalkable: (p) => !blocked.has(key(p)),
  cost: (p) => terrainCost(p),
  neighbours: DIAGONAL_NEIGHBOURS,
});
```

Sezgisel komşuluğa göre seçilir (dört yönde Manhattan, çaprazda Chebyshev);
sezgiselin gerçek maliyeti aşmaması A\*'ın en kısa yol garantisinin koşuludur.
Çapraz adım maliyeti √2 sayılır, yoksa yol çaprazlara çarpılırdı.

## Performans

### `ObjectPool`

Sık doğup ölen kısa ömürlü nesneler. Amaç allocation'ı değil **çöp toplamayı**
azaltmak: kare başına yüzlerce nesne, GC'yi görünür takılmalar üretecek
sıklıkta tetikler.

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
index.update(item); // yalnızca değişeni bildir; hücre aynıysa false, iş yok

for (const near of index.query(x, y)) {
  /* … */
}
```

İki model **aynı sonucu** verir (testle kilitli). Nesnelerin çoğu sabitse ve az
sayıda öğe hareket ediyorsa artımlı model O(hareket eden)'e düşer; hepsi her
kare hareket ediyorsa `rebuild` daha basittir.

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

## Ayrımı bozmamak

- Bir bileşene kural eklemek istediğinde önce sor: **başka bir tüketici bunu
  farklı isteyebilir mi?** Cevap evetse kural tarif katmanına ait.
- Bir primitif ne kodunda ne dokümanında bir türe (genre) bağlanmaz; örnek
  vermek gerekiyorsa mekanizmanın kendi terimleriyle verilir.
  `core/tests/governance/primitiveNeutrality.test.ts` bunu kapıda doğrular.
- Public API yüzeyi sayılıdır (`publicSurface.test.ts`); yeni export bilinçli
  bir karardır, kapı kırılınca sayı güncellenir.
