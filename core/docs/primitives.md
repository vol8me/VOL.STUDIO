# CORE primitifleri — yeni bir oyuna başlarken

Bu belge CORE'un **katman 1**'ini anlatır: oyun bilmeyen, sunumdan bağımsız,
doğrudan alınıp kullanılan parçalar. Amaç, yeni bir oyuna başlarken zamanlama,
faz yönetimi, kaynak cüzdanı, havuz ve uzamsal sorgu gibi işlerin sıfırdan
yazılmaması.

## CORE'un üç katmanı

| Katman        | Ne yapar                                     | Örnek                                       |
| ------------- | -------------------------------------------- | ------------------------------------------- |
| **Mekanizma** | Oyun kelimesi bilmez, sunumdan bağımsız      | `Scheduler`, `StateMachine`, `SpatialIndex` |
| **Sunum**     | Durumu çizer, niyet bildirir — kural taşımaz | `Bar`, `SkillTree`, `ShopPicker`            |
| **Tarif**     | Yaygın kuralı hazır verir — ama **opt-in**   | `resolveSkillStates()`, `applyXpGain()`     |

Ayrımın sebebi somuttur: bir kural sunum bileşeninin içinde yaşarsa bileşen
kendi defterini tutar ve oyunun kendi sistemiyle **kayar**. `XPBar` bir dönem
seviye hesabını kendi yapıyordu; VOL.HELL onu kullanmayı reddetti ve yalnızca
`setState()` çağırdı — kural CORE'da dururken tek çalıştıranı showcase demosu
kaldı.

Tarif katmanı bu yüzden **silinmiş bir kural değil, taşınmış bir kuraldır**:
en yaygın davranış hazır durur, tek satırda çağrılır, ama hiçbir bileşen onu
arkanda varsaymaz.

## Zamanlama

### `Scheduler`

Gecikmeli ve tekrarlı işler. `setTimeout` YERİNE oyun döngüsüne bağlıdır:
`update()` çağrılmadıkça zaman akmaz, yani duraklatılmış oyunda cooldown
ilerlemez. Deterministiktir — aynı delta dizisi aynı sırayı üretir.

```ts
const scheduler = new Scheduler();
const cancel = scheduler.every(2000, spawnEnemy);
scheduler.after(500, () => showHint());

// oyun döngüsünde
scheduler.update(deltaMs);
```

Uzun bir karede birikmiş tetiklenmeler **atlanmaz**; aksi halde kare
düşmelerinde oyun mantığı gerçek zamandan geri kalır.

### `Cooldown`

Ateş temposu, yetenek bekleme, yeniden doğma gecikmesi.

```ts
const shot = new Cooldown(250);
if (shot.tryTrigger()) fire(); // kontrol + tetikleme tek çağrıda
bar.setValue(shot.getProgress()); // HUD [0,1]
shot.setDuration(180); // devam eden bekleme KISALIR
```

### `RoundLoop`

Tur/dalga döngüsü — mola, otomatik ilerletme, toplam tur sınırı. Tower
defense'te dalga arası, roguelite'ta oda arası, yarışta tur sayacı aynı parça.

```ts
const loop = new RoundLoop({
  breakMs: 5000,
  totalRounds: 20,
  onRoundStart: (round) => spawnWave(round),
  onComplete: () => finishRun(),
});
loop.start(); // İLK tur hemen başlar, mola aralarda

// oyun döngüsünde
loop.update(deltaMs);
counter.setWave(loop.getRound());
counter.setRemainingSeconds(loop.getRemainingMs() / 1000);
```

`skipBreak()` "hazırım" butonu için molayı atlar.

## Durum

### `StateMachine`

Oyun fazları, entity davranışı, UI akışı. Boolean bayrak birleşimlerinin
(`isPaused && isFinishing`) aksine geçersiz durumu **temsil edilemez** kılar.

```ts
type Phase = 'build' | 'wave' | 'reward' | 'over';

const phases = new StateMachine<Phase>({
  initial: 'build',
  states: {
    build: { transitions: ['wave'], onEnter: () => showBuildUI() },
    wave: { transitions: ['reward', 'over'], onUpdate: (dt) => runWave(dt) },
    reward: { transitions: ['build'] },
    over: { transitions: [] }, // terminal
  },
  onRejected: (from, to) => console.warn(`geçersiz geçiş: ${from} → ${to}`),
});
```

`transitions` verilmezse her geçiş serbesttir; boş dizi durumu terminal yapar.

### `ResourcePool`

Tipli kaynak cüzdanı. Kaynak kümesini **tüketici** tanımlar — `StatBlock<TStat>`
ile aynı sözleşme.

```ts
type Resource = 'gold' | 'energy';

const wallet = new ResourcePool<Resource>({ gold: 100, energy: 5 }, { energy: 10 });

if (wallet.spend({ gold: 50, energy: 2 })) buildTower();
```

`spend` **ya hepsi ya hiçbiri**: bir kaynak yetmezse hiçbiri düşmez. Kısmi
harcama "altını gitti ama enerjisi yetmediği için kule kurulamadı" gibi geri
alınamaz bir duruma yol açardı.

## Performans

### `ObjectPool`

Mermi, düşman, partikül gibi sık doğup ölen varlıklar. Amaç allocation'ı değil
**çöp toplamayı** azaltmak.

```ts
const bullets = new ObjectPool<Bullet>({
  create: () => new Bullet(),
  reset: (b) => {
    b.target = null;
  }, // referansları BIRAK
  prewarm: 64,
  maxIdle: 256, // tepe anındaki şişme kalıcı olmasın
});

const b = bullets.acquire();
bullets.release(b); // aynı örneği iki kez iade → hata
```

`reset` içinde referans bırakmak çağıranın sorumluluğudur: boşta duran bir
mermi hâlâ düşmana referans tutuyorsa o düşman da serbest kalmaz.

### `SpatialIndex`

"Yakınımda ne var?" sorusunu O(N)'den O(k)'ya düşürür — çarpışma, hedefleme,
kule menzili, sürü ayrımı.

```ts
const index = new SpatialIndex<Enemy>(64, (e) => e.isAlive);

// Basit model: her kare tüm dünyayı yeniden indeksle
index.rebuild(enemies);

// Artımlı model: yalnızca hareket edeni bildir
index.update(enemy); // hücre değişmediyse false, iş yok

for (const near of index.query(x, y)) {
  /* … */
}
```

İki model **aynı sonucu** verir (testle kilitli). Binlerce duran yapı ve az
sayıda hareketli birim varsa — yani tipik bir tower defense — artımlı model
O(hareket eden)'e düşer.

## Geometri

Saf sayılarla çalışır, hiçbir oyun nesnesi tanımaz.

```ts
if (circlesOverlap(bullet, enemy)) applyDamage();
if (circleRectOverlap(unit, buildZone)) highlight(); // KÖŞE temasını yakalar

const hit = raycastCircles(origin, aimDir, enemies, 800);
if (hit) damage(hit.target, hit.distance); // en YAKIN hedef
```

Karşılaştırmalarda `distanceSquared` kullanılır: kare kök, sonucu bir eşikle
karşılaştırırken bilgi eklemez ama kare başına binlerce çağrıda maliyet üretir.

## Yeni bir oyunun ilk adımı

Tipik bir tower defense iskeleti, tamamı CORE'dan:

```ts
type Phase = 'build' | 'wave';
type Resource = 'gold' | 'lives';

const wallet = new ResourcePool<Resource>({ gold: 200, lives: 20 });
const enemies = new SpatialIndex<Enemy>(64, (e) => e.isAlive);
const bullets = new ObjectPool<Bullet>({ create: () => new Bullet(), prewarm: 128 });
const scheduler = new Scheduler();

const waves = new RoundLoop({
  breakMs: 8000,
  totalRounds: 30,
  onRoundStart: (round) => scheduler.every(600, () => spawn(round)),
  onComplete: () => phases.transition('over' as Phase),
});

const phases = new StateMachine<Phase>({
  initial: 'build',
  states: {
    build: { transitions: ['wave'], onEnter: () => waves.start() },
    wave: {
      transitions: ['build'],
      onUpdate: (dt) => {
        waves.update(dt);
        scheduler.update(dt);
      },
    },
  },
});
```

Geriye kalan oyunun kendi işidir: kule tanımları, düşman davranışı, harita.
Zemin CORE'dan gelir.

## Ayrımı bozmamak

- Bir bileşene kural eklemek istediğinde önce sor: **başka bir oyun bu kuralı
  farklı isteyebilir mi?** Cevap evetse kural tarif katmanına ait.
- Bir primitif oyun kelimesi (`enemy`, `tower`, `wave`) taşımamalı.
  `core/tests/governance/publicApi.test.ts` bunu kapıda doğrular.
- Public API yüzeyi sayılıdır (`publicSurface.test.ts`); yeni export bilinçli
  bir karardır, kapı kırılınca sayı güncellenir.
