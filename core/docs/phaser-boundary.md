# Katman mı, motor mu?

CORE bir **katmandır**. Sınır tektir ve kolay ölçülür: **renderer'ı kim yazıyor?**
Phaser yazıyor. CORE onu boot eder, sahnesini, sahne grafiğini, kamerasını,
girdi yüzeyini ve çizim nesnelerini kullanır.

Ama bu sınır tek bir kararla değil, **birikerek** kayar. Her yeni primitif masum
görünür; Phaser'ın zaten verdiği bir şeyi yeniden yazdığında bunu söyleyen kimse
olmaz. Bu belge o kaymayı görünür tutar.

## Bugünkü durum (ölçüldü)

| Ölçü                                         | Değer                      |
| -------------------------------------------- | -------------------------- |
| CORE kaynak dosyası                          | 191                        |
| Phaser'ı **import eden** dosya               | 5 (`Game.ts` + 4 modül)    |
| CORE'un en büyük modülü                      | `ui/` — 17.824 satır (%61) |
| `ui/`nin Phaser importu                      | **0**                      |
| Phaser alt sistemini **yeniden yazan** modül | 6                          |

Phaser'ın **hiç vermediği** alan CORE'un ezici çoğunluğudur: DOM UI toolkit
(Kanban, SplitPane, DataTable, CommandPalette, Wizard…), yol bulma, uzamsal
indeks, ters kinematik ve yürüyüş döngüsü, dokunsal geri bildirim, teşhis.
Phaser bunların hiçbirini sunmaz — burada onunla yarışılmıyor, boşluğu
dolduruluyor.

## Dört duruş

Her CORE modülü Phaser karşısındaki duruşunu **beyan eder**
(`core/tests/governance/phaserBoundary.test.ts`):

| Duruş        | Anlamı                                                                                                                                               |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gap`        | Phaser bunu HİÇ vermez. Doldurmak katmanın işidir.                                                                                                   |
| `delegates`  | Phaser verir, CORE import eder ve KULLANIR.                                                                                                          |
| `structural` | Phaser nesnesiyle beslenir ama ona BAĞLANMAZ; ihtiyacı olan yüzeyi kendi yapısal arayüzüyle bildirir, böylece render motoru olmadan test edilebilir. |
| `replaces`   | Phaser verir, CORE KENDİ uygulamasını taşır. **Motor sınırı burada.**                                                                                |

## Yerine geçilen altı alt sistem

Bunlar bilinçli seçimlerdir ve her birinin gerekçesi kapıda yazılıdır:

| Modül    | Phaser'daki karşılığı        | Neden yetmedi                                                          |
| -------- | ---------------------------- | ---------------------------------------------------------------------- |
| `audio`  | `Phaser.Sound`               | Adaptive stem mix, sidechain ducking, tek `AudioContext` yaşam döngüsü |
| `time`   | `Phaser.Time.Clock`          | Sahne döngüsünden bağımsız, Phaser'sız test edilebilir sabit adım      |
| `math`   | `Phaser.Math`                | Headless test + sonlu sayı sözleşmesi                                  |
| `events` | `Phaser.Events.EventEmitter` | Tipli olay adı/yükü, abone hata izolasyonu                             |
| `pool`   | `GameObjects.Group`          | Phaser nesnesi OLMAYAN değerler için jenerik havuz                     |
| `random` | `Phaser.Math.RND`            | Determinizm testleri için tohumlanabilir, Phaser'sız üreteç            |

## Kapı ne yapar

Beş koruma, hepsi mutasyonla sınanmış:

1. Yeni bir CORE modülü **beyansız** eklenemez.
2. Silinen modülün beyanı da silinir (ölü kayıt birikmez).
3. `delegates` diyen modül Phaser'ı **gerçekten** import etmelidir — son
   importunu kaybeden modül sessizce `replaces` olmuştur.
4. `structural` diyen modüle Phaser importu **giremez** — girerse yapısal
   bağımsızlık, yani tek değeri kaybolur.
5. **`replaces` sayısı sabittir.** Büyütmek yasak değildir; sessiz olamaz.

Beşincisi asıl alarmdır. Sayı büyüdüğünde sorulacak soru şudur: _Phaser'ın
gerçekten veremediği bir şey mi var, yoksa motor mu yazıyoruz?_

## Renderer

`type` **açıkça** seçilir (`createVolGame({ renderer })`), varsayılan `'auto'`.
`auto` bilinçlidir: WebGL kurulamayan bir cihazda hiç açılmamaktansa yavaş
açılmak yeğdir. Bedeli geri düşüşün sessiz olmasıdır — bu yüzden yutulmaz:

- teşhis anlık görüntüsünde `renderer.kind` ve `renderer.fellBack`
- overlay'de `gpu: canvas ⚠ GERİ DÜŞTÜ`
- konsolda uyarı, `pnpm benchmark:device` çıktısında `renderer` satırı

Geri düşüş ölçülemezse belirti "oyun bu cihazda yavaş" olur ve sebebi hiç
görünmez. `renderer: 'webgl'` verildiğinde geri düşüş yoktur: oyun açılmaz ve
hata açıkça çıkar — sürüm ve ölçüm koşuları içindir.
