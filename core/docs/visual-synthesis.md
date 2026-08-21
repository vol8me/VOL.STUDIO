# Görsel sentez — doktrin ve sözleşme

Bu belge `core/visual/` (prosedürel raster sentezi) ve `games/vol-forge`
(parametre editörü) için **bağlayıcı** tasarım kararlarını taşır. Uygulayan
kişi ya da agent önce bunu okur; buradaki kararlar gerekçeleriyle birlikte
yazılıdır ve gerekçe çürütülmeden değiştirilmez.

Kardeş belge: [`sound-synth.md`](./sound-synth.md). Görsel sentez, ses
sentezinin aynadaki görüntüsüdür ve aynı doktrinleri paylaşır: saf matematik,
offline üretim, tohumlanmış determinizm, ölçülebilir kalite.

---

## 0. Amaç ve anti-hedefler

**Amaç:** parametrelerle tanımlanan, deterministik, tek bir PNG sprite üreten
genel amaçlı bir raster sentez sistemi; ve onu canlı düzenleyen bir editör.

Sistem **hiçbir nesne türüne göre tasarlanmaz.** Ağaç, matkap, cevher, sıvı,
kristal — hepsi aynı cebirin farklı bileşimleridir. Bir örneğe demirlemek
sistemi o örnek kadar dar yapar.

**Anti-hedefler** (bunlar bilinçli olarak YAPILMAZ):

| Yapılmayacak                     | Neden                                                                                           |
| -------------------------------- | ----------------------------------------------------------------------------------------------- |
| Animasyon / kare dizisi          | Çıktı tek PNG. Zaman parametresi eklemek her düğümü ve editörü etkiler; gerekirse ayrı bir tur. |
| Düğüm grafiği (DAG) editörü      | Kompozisyon modeli katman yığını (bkz. D10). DAG'a geçiş yolu açık ama bugün yapılmaz.          |
| Genel amaçlı görüntü düzenleyici | Fırça, seçim, katman efekti yok. Bu bir _üretici_, bir _editör_ değil.                          |
| Üretken YZ / difüzyon            | Çıktı tamamen algoritmiktir.                                                                    |
| Vektör çıktı (SVG)               | Hedef raster; SDF'ler vektör değil, alan olarak kullanılır.                                     |
| 3B                               | Yükseklik alanı 2.5B gölgeleme içindir, geometri değil.                                         |

---

## 1. Doktrinler

Numaralandırılmıştır; kodda ve incelemede bunlara referans verilir.

### D1 — Her şey bir ALANDIR

Tek soyutlama: `f(x, y) → sayı`. Skaler alan yükseklik/maske/yoğunluk taşır.
Sprite, alanların bileşimidir. Üreteç, birleştirici, filtre — hepsi alan alır,
alan verir.

Bunun sonucu: **yeni bir şey eklemek yeni bir tip değil, yeni bir alan
fonksiyonudur.** Sistem büyürken kavramsal yükü sabit kalır.

### D2 — İki uzay, tek sınır

Aynı belge 32² ve 1024² üretecekse koordinatlar **piksel olamaz**: 8 birimlik
yarıçap 32²'de devasa, 1024²'de noktadır.

Ama her şey de birim uzayda olamaz: dither matrisi ölçeklenirse dither olmaktan
çıkar, 1 piksellik dış çizgi her çözünürlükte 1 pikseldir.

```
BİRİM ÖLÇÜLER — parametreler [0,1] uzayında, çözünürlükten BAĞIMSIZ
  katmanlar → bileşim → biçimlendirme (normal, ışık, AO)
        │
        │  (yeniden örnekleme YOK — tamponlar en baştan hedef
        │   çözünürlüktedir; sınır yalnızca PARAMETRE BİRİMİDİR)
        ▼
PİKSEL ÖLÇÜLER — parametreler piksel sayısı, çözünürlüğe BAĞLI
  dış çizgi (N piksel) → dither (matris) → palete nicemleme → PNG
```

Sınır **nicemlemedir**. Sınırın hangi tarafında olduğu belirsiz bir parametre
yazılmaz; belirsizse tasarım yanlıştır.

**Açı birimi:** JSON'da **derece**, motor içinde **radyan**. Dönüşüm sınırda
(şema doğrulaması sırasında) bir kez yapılır. Gerekçe: `"angle": 45` bir
insanın ve agent'ın yazacağı biçimdir; `0.7853981634` değil. Kod içinde radyan
kalır çünkü `Math.*` öyle çalışır.

Yan sonuç: **stil, grafiğin değil ÇIKTININ özelliğidir.** Aynı belge 64² + 8
renk + Bayer ile piksel sanatı, 1024² + 64 renk + dithersiz ile pürüzsüz doku
verir. Bu bir hata değil, sistemin en güçlü yanıdır.

Kenar yumuşatma bu yüzden sabit değil **parametre**dir: düşük çözünürlükte
kapalı (keskin piksel), yüksekte açık olabilir.

### D3 — Bileşim tek alan değil, ÜÇ KANALDIR

Katmanlar tek skaler alanda birleşirse gövdesi kahverengi, yaprağı yeşil bir
ağaç yapılamaz — her şey tek rampaya düşer.

| Kanal      | Tip            | Taşıdığı       | Kullanımı                            |
| ---------- | -------------- | -------------- | ------------------------------------ |
| `coverage` | `Float32Array` | 0..1 kapsama   | şeffaflık, silüet, dış çizgi kaynağı |
| `height`   | `Float32Array` | 0..1 yükseklik | normal, Lambert, AO — **hacim**      |
| `material` | `Uint8Array`   | rampa kimliği  | hangi palet rampası                  |

Nicemleme `(material, shade)` çiftini renge çevirir. Sonuç: **çok renkli obje,
tek ve tutarlı ışık.** Gövde ile yaprak farklı rampalarda ama gölgeleri aynı
ışıktan gelir — "elle çizilmiş" hissinin teknik kaynağı budur.

`material` neden `Uint8Array`: rampa sayısı 256'yı aşmaz ve 1024²'de
`Float32Array`'e göre 3 MB tasarruf eder (bkz. D7 bellek bütçesi).

### D4 — İki aşamalı değerlendirme: fonksiyonel alan-uzayı, tamponlu komşuluk

**Bu belgedeki en önemli teknik karardır.**

Naif "her düğüm bir tampon üretir" modeli döndürme/aynalama/kutupsal gibi
alan-uzayı işlemlerini **yeniden örneklemeye** çevirir: önce daire tampona
çizilir, sonra tampon döndürülür → bulanıklık ve kenar bozulması. Piksel
sanatında bu ölümcüldür.

Doğru model hibrittir:

**Aşama 1 — fonksiyonel (yeniden örnekleme YOK).**
Bir katmanın `üreteç ∘ alan-uzayı zinciri` her çıktı pikseli için TEK SEFERDE
değerlendirilir. Koordinat dönüştürülür, üreteç dönüşmüş koordinatta okunur.
Döndürme, aynalama, kutupsal, tekrar — hepsi **tam** (exact), ara raster yok.

```
her (px, py) için:
  (u, v) = pikselden birim uzaya
  (u, v) = domainZinciri.tersUygula(u, v)     ← ters dönüşüm
  değer   = üreteç(u, v)
  tampon[px, py] = değer
```

Dönüşümlerin **ters** uygulandığına dikkat: çıktıdan girdiye gidilir
(inverse mapping), aksi halde çıktıda boşluk kalır.

**Aşama 2 — tamponlu (komşuluk).**
Bulanıklık, kenar, genişletme/aşındırma, mesafe dönüşümü, normal —
bunlar komşu piksel okur, `(x,y)`'nin saf fonksiyonu olarak yazılamaz.
Aşama 1'in ürettiği tampon üzerinde çalışırlar.

`warp` özel bir durumdur: bozma miktarı başka bir alandan gelir. O alan önce
Aşama 1 ile tampona yazılır, sonra warp o tampondan **çift doğrusal**
(bilinear) örnekler. Örnekleme modu parametredir — piksel sanatında `nearest`
tercih edilebilir.

### D5 — Determinizm mutlaktır

Aynı belge + aynı tohum = **bit düzeyinde aynı PNG**, her platformda.

- Her rastgele kullanan düğüm tohumunu `kökTohum ⊕ hash(düğümYolu)` ile alır.
  Düğüm sırası değişince komşu düğümlerin çıktısı değişMEMELİdir.
- `Math.random()` **yasaktır**. `createRandom()` kullanılır.
- Kayan nokta işlem sırası sabit tutulur; paralel/atlamalı toplama yapılmaz.
- Test: aynı belge iki kez render edilir, tamponlar birebir karşılaştırılır.

Gerekçe: asset üretimi tekrarlanabilir olmazsa "şu parçayı biraz değiştir"
istenmeyen değişiklikler getirir ve fark gözden geçirilemez.

### D6 — Palet veridir, gömülü değildir

Palet `{ colors: string[], ramps: Ramp[] }` biçiminde **girdidir**. Agent
kendi paletini verebilir ya da sentezletebilir; ikisi de aynı veriye indirgenir.

Motor asla renk sabiti taşımaz. `VOL_COLORS` bu sisteme girmez — o, arayüzün
paletidir, üretilen asset'in değil.

**Palet kilidi:** nicemleme sonrası çıktıda palet dışı piksel KALMAZ. Bu
ölçülür (bkz. §9) ve ihlal kapıyı kırar. Sebep: piksel sanatı iddiası taşıyan
bir çıktının 4 renk yerine 4.000 renk içermesi sessiz bir yalandır.

### D7 — Bellek doğrusaldır, çünkü kompozisyon doğrusaldır

1024² tek `Float32Array` = 4 MB. Elli düğümlük bir DAG'da ara sonuç ömürlerini
bilmek zamanlayıcı + referans sayımı ister; naif uygulama 200 MB'ı bulur.

**Katman yığını doğrusaldır** → ömürler bedavaya bilinir. Aynı anda yaşayanlar:

| Tampon                                     | 1024²'de         |
| ------------------------------------------ | ---------------- |
| Biriktirici (coverage + height + material) | 4 + 4 + 1 = 9 MB |
| İşlenen katman (coverage + height)         | 8 MB             |
| Maske                                      | 4 MB             |
| **Yığın seviyesi başına toplam**           | **~21 MB**       |

Alt-yığın her seviyede kendi biriktiricisini (9 MB) ister. **Azami derinlik 4**
ile sınırlı (bkz. D10):

- katman/maske scratch'i **havuzlanırsa**: `4×9 + 2×(8+4)` = **60 MB**
- havuzlanmazsa: `4×21` = **84 MB**

Yani havuzlama isteğe bağlı bir iyileştirme değil, bütçenin parçasıdır.

Tamponlar `ObjectPool` (bkz. [`primitives.md`](./primitives.md)) ile devredilir;
boyut başına bir havuz tutulur.

### D8 — Çekirdek headless, editör tüketici

`core/visual/` **DOM tanımaz**. `Canvas`, `ImageData`, `window` geçmez.
Node'da ve tarayıcıda aynı çalışır.

Editör bir _tüketicidir_: çekirdeği çağırır, sonucu gösterir. Editörsüz
çekirdek tam işlevlidir — `synthesize()`in `vol-ui` olmadan çalıştığı gibi.

Node-only kod (PNG yazma, dosya sistemi) **barrel'a girmez**, ayrı alt-yolda
yayınlanır. Ses tarafındaki `@volstudio/core/audio/synth/writer` deseninin
birebir aynısı; tarayıcı paketine `node:fs` sızmasını bu ayrım engeller.

### D9 — Ortogonallik: türetilebilen primitif olmaz

Kural: **iki primitifin bileşimiyle ifade edilebilen şey primitif değildir.**

`kare` bir primitiftir. `yuvarlatılmış kare` primitiftir (SDF'de ayrı formül,
`kare`den türetilemez). `dikdörtgen` primitif DEĞİLDİR — `kare` + `ölçek`.

"Kapsamlı" olmak 200 düğüm demek değil; **birbirine indirgenmeyen ~35
primitif** demektir. Genelliğin kaynağı üreteç sayısı değil, alan-uzayı
işlemleridir (bkz. §4).

### D10 — Kompozisyon: katman yığını + son işlem zinciri

Belge, sıralı bir **katman listesi** ve ortak bir **son işlem zinciri**dir.

Neden DAG değil:

1. **JSON düz dizi** — agent'ın yazması ve düzenlemesi kolay; DAG'da düğüm
   kimliği/bağlantı hatası çok daha olası.
2. **Editör liste** — mevcut `Tabs`/`Accordion`/`Slider` bileşenleri doğrudan
   karşılar; grafik editörü ayrı bir projedir.
3. **Bellek doğrusal** (D7).
4. **DAG'ı engellemez** — primitifler aynı kalır, ilerde yalnızca kompozisyon
   katmanı değişir.

Maske **alt-yığın** olabilir (özyinelemeli). Azami derinlik **4**; aşılırsa
hata fırlatılır. Gerekçe: bellek sınırı (D7) ve editörde gezilebilirlik.
Sonsuz derinlik pratikte gerekmedi, sınırsız bırakmak hem belleği hem arayüzü
öngörülemez yapar.

### D11 — Parametre şeması hem doğrular hem arayüz üretir

Her primitifin parametreleri **veriyle bildirilir**: ad, tip, aralık, adım,
varsayılan, açıklama.

Bu şema iki yerde kullanılır:

- **Doğrulama** — agent'ın yazdığı JSON sınırda kontrol edilir (ses tarafındaki
  `validateQualityConfig`/`validateRigMetadata` deseni).
- **Arayüz üretimi** — editör kontrolleri şemadan türetir; 35 primitifin
  parametrelerini elle bağlamak sürdürülemez.

_İleriye dönük dikiş:_ ses motorunun editöre taşınması düşünülüyor. O geldiğinde
`SynthParams` de bir şema kazanırsa aynı editör kabuğu iki motoru da sürebilir.
**Bugün ses için hiçbir şey inşa edilmez** — şema görsel için tek başına
gerekçelidir; ses geldiğinde soyutlama yapılır, öncesinde değil.

### D12 — Ölçüm zorunludur

"Kötü görünüyor" takip edilemez. Ses tarafında `audio-qa.ts` bunu sayıya
çeviriyor ve o disiplin olmasa parçalar da kötü olurdu. Görselin karşılığı
`visual-qa` (bkz. §9) ve **ilk turdan itibaren** vardır, sonradan eklenmez.

---

## 2. Veri modeli

Belgenin tamamı **serileştirilebilir JSON**dur. Closure, fonksiyon referansı,
sınıf örneği taşımaz — agent'ın yazabilmesi ve farkının gözden geçirilebilmesi
buna bağlıdır. (Ses tarafında `conditionId` yerine closure taşımama kararının
aynısı.)

```jsonc
{
  "schemaVersion": 1,
  "size": 64, // çıktı kenarı (piksel). 8..2048, ikinin katı olmak ZORUNDA DEĞİL.
  "seed": 1337,
  "tileable": false, // true ise gürültü periyodik, filtreler sarmalı (bkz. §5)
  "antialias": false, // birim uzayda süperörnekleme; düşük çözünürlükte kapalı tutulur

  "palette": {
    // Ya doğrudan veri…
    "colors": ["#1a1420", "#3a2b3f", "#6b5570", "#a58aa8"],
    "ramps": [{ "id": 0, "name": "taş", "indices": [0, 1, 2, 3] }]
    // …ya da sentez isteği (bkz. §7)
    // "generate": { "base": "#6b5570", "steps": 4, "hueShift": -18, "satCurve": "arch" }
  },

  "layers": [
    {
      "id": "govde",
      "source": { "kind": "sdf.capsule", "a": [0.5, 0.92], "b": [0.5, 0.42], "r": 0.055 },
      "domain": [
        { "kind": "warp", "by": { "kind": "noise.fbm", "freq": 5, "octaves": 3 }, "amount": 0.02 }
      ],
      "mask": null, // null | üreteç | { "layers": [...] }  ← alt-yığın
      "height": null, // opsiyonel AYRI yükseklik alanı; null → source kullanılır
      "blend": "max", // coverage: over|max|min|add|sub|mul|screen|replace
      "heightBlend": "max", // height: max|min|add|mul|replace
      "opacity": 1,
      "material": 0, // rampa kimliği
      "materialAlt": 1, // opsiyonel ikinci malzeme…
      "materialMask": { "kind": "noise.value", "freq": 12 }, // …bu maskeyle geçilir
      "materialThreshold": 0.6,
      "materialThresholdCoverage": 0.5 // altında malzeme YAZILMAZ (bkz. §3)
    }
  ],

  "shade": {
    "light": [-0.55, -0.7, 0.45], // normalize edilir
    "strength": 0.6,
    "ambient": 0.35,
    "rim": 0.15,
    "ao": { "radius": 0.04, "strength": 0.4 }
  },

  "post": {
    "outline": { "px": 1, "mode": "outside", "colorIndex": 0 },
    "dither": { "kind": "bayer4", "amount": 0.15 },
    "quantize": { "mode": "ramp" } // "ramp" | "nearest"
  }
}
```

### Neden `material` katman sabiti + opsiyonel maske

Malzemeyi tamamen bir alandan türetmek (ör. yüksekliğe göre metal/pas) güçlüdür
ama her katmanı bir malzeme-alanı yazmaya zorlar ve basit durumları
karmaşıklaştırır. Katman sabit verir; aşınma/pas gibi ikinci malzeme
gerektiğinde `materialMask` devreye girer. Basit durum basit, karmaşık durum
mümkün.

---

## 3. Değerlendirme boru hattı

```
1. Palet çözümle            (veri ya da sentez → Palette)
2. Biriktiriciyi hazırla    coverage=0, height=0, material=0
3. HER KATMAN için (sırayla):
     a. layerCoverage ← Aşama 1: üreteç ∘ domain zinciri  (fonksiyonel, D4)
     b. maske varsa   ← üreteç ya da alt-yığın (özyineleme, azami derinlik 4)
     c. komşuluk filtreleri (varsa) layerCoverage üzerinde
     d. layerCoverage *= maske * opacity
     f. layerHeight ← katmanın `height` alanı varsa Aşama 1 ile ayrıca
                      değerlendirilir; YOKSA layerCoverage kullanılır
     g. coverage ← blend(coverage, layerCoverage)
        height   ← heightBlend(height, layerHeight * layerCoverage)
        material ← layerCoverage > materialThresholdCoverage olan yerde
                   katmanın malzemesi (materialMask > threshold ise materialAlt)
4. BİÇİMLENDİR              normal ← height; shade ← Lambert + ambient + rim
                            ao     ← height'tan; shade *= (1 - ao)
── PARAMETRE UZAYI SINIRI ──  (ayrı bir işlem DEĞİL; bkz. aşağıdaki not)
5. DIŞ ÇİZGİ                dilate(coverage, px) − coverage → outline maskesi
6. DITHER                   shade += (matris(px,py) − 0.5) * amount
7. NİCEMLE                  (material, shade) → palet indeksi → RGBA
8. KODLA                    RGBA → PNG
```

**Sınır bir işlem değildir.** D4 gereği Aşama 1 zaten HER ÇIKTI PİKSELİ için
değerlendirilir; tamponlar en baştan hedef çözünürlüktedir. Yeniden örnekleme,
ölçekleme ya da "rasterize etme" adımı YOKTUR — olsaydı D4'ün tüm kazancı
(dönüşümlerin tam olması) kaybolurdu.

Sınır **parametrelerin birimindedir**: 1–4 arası adımlarda ölçüler birim
uzaydadır (`r: 0.055`, `freq: 5`) ve çözünürlükten bağımsızdır; 5–7 arası
adımlarda ölçüler **piksel sayısıdır** (`px: 1`, Bayer matrisi) ve
çözünürlüğe bağlıdır. Bir parametre yazarken hangi tarafta olduğu belirsizse
tasarım yanlıştır (D2).

**Katmanın `height` alanı neden AYRI olabilmeli:** tek alan hem kapsamayı hem
yüksekliği belirlerse "düz siluet, dokulu yüzey" ifade edilemez — bir metal
levhanın kenarı keskin, yüzeyi gürültülüdür. `height` verilmezse `source`
kullanılır (basit durum basit kalır); verildiğinde kapsamayla ÇARPILIR, çünkü
kapsama dışında yükseklik anlamsızdır.

**`heightBlend` neden ayrı:** iki katman `max` ile birleşirken kapsama
birleşmelidir ama yükseklik toplanmalı olabilir (üst üste binen kabartma).
Tek mod ikisini de doğru yapamaz.

**Malzeme yazımı eşikli:** `materialThresholdCoverage` (varsayılan 0.5)
altındaki kısmi kapsama malzeme YAZMAZ. Ham `> 0` koşulu, kenar yumuşatma
açıkken saçaklarda yanlış rampa bırakırdı.

---

## 4. Primitif envanteri

Toplam ~35. Her biri D9'a (ortogonallik) uyar. `kind` alanı JSON'daki kimliktir.

### 4.1 Üreteçler (birim uzay → skaler)

| `kind`             | Parametreler                      | Not                                                         |
| ------------------ | --------------------------------- | ----------------------------------------------------------- | -------------- | ------------------------------------- |
| `const`            | `value`                           | Sabit alan; maske/karışım için taban.                       |
| `noise.value`      | `freq, octaves?, seed?`           | En ucuz gürültü, blok karakterli.                           |
| `noise.simplex`    | `freq, octaves?, seed?`           | Yön yapaylığı (axis artifact) düşük.                        |
| `noise.worley`     | `freq, mode(F1                    | F2                                                          | F2-F1), seed?` | Hücresel; `F2-F1` hücre kenarı verir. |
| `noise.fbm`        | `base, octaves, lacunarity, gain` | Sarmalayıcı; oktavlar arası **döndürme** uygular (bkz. §5). |
| `gradient.linear`  | `angle, from, to`                 |                                                             |
| `gradient.radial`  | `center, radius`                  |                                                             |
| `gradient.angular` | `center, offset`                  | Kutupsal açı; dişli/pasta için.                             |
| `gradient.diamond` | `center, size`                    | Manhattan mesafesi.                                         |
| `sdf.circle`       | `center, r`                       |                                                             |
| `sdf.box`          | `center, half`                    |                                                             |
| `sdf.roundBox`     | `center, half, r`                 | `box`tan türetilemez, ayrı formül.                          |
| `sdf.polygon`      | `center, n, r, rotation`          | Düzgün n-gen.                                               |
| `sdf.star`         | `center, n, rOuter, rInner`       |                                                             |
| `sdf.line`         | `a, b, thickness`                 |                                                             |
| `sdf.capsule`      | `a, b, r`                         | Uçları yuvarlak; gövde/dal için temel.                      |
| `sdf.arc`          | `center, r, thickness, from, to`  |                                                             |
| `pattern.checker`  | `size`                            |                                                             |
| `pattern.stripes`  | `freq, angle, duty`               |                                                             |
| `pattern.dots`     | `freq, r`                         |                                                             |
| `pattern.grid`     | `freq, thickness`                 |                                                             |
| `pattern.hex`      | `freq`                            |                                                             |

SDF'ler **işaretli mesafe** döndürür; `step`/`smoothstep` ile maskeye,
`abs` ile konture çevrilir. Bu, bir SDF'den hem dolu şekil hem çerçeve
elde edilebilmesini sağlar — ayrı primitif gerekmez (D9).

### 4.2 Alan-uzayı işlemleri — GENELLİĞİN KAYNAĞI

Bunlar **girdi koordinatını** dönüştürür (D4, ters eşleme). On üreteçle
sınırlı kalmanın önündeki tek engel budur.

| `kind`      | Parametreler                                  | Neyi açar                                 |
| ----------- | --------------------------------------------- | ----------------------------------------- | ------------------------------------------ | ---------- | ----------------------------------------- |
| `translate` | `x, y`                                        |                                           |
| `rotate`    | `angle, center?`                              |                                           |
| `scale`     | `x, y, center?`                               | Bileşenler ayrı → anizotropik esnetme.    |
| `skew`      | `x, y`                                        |                                           |
| `mirror`    | `axis(x                                       | y                                         | quad                                       | radial-n)` | **Simetri**: makine parçası, yaprak, yüz. |
| `repeat`    | `count, mode(tile                             | mirror)`                                  | Döşeme; `mirror` dikiş gizler.             |
| `polar`     | `center, inverse?`                            | **Halka, spiral, dişli, girişim deseni.** |
| `warp`      | `by, amount, sample(nearest                   | bilinear)`                                | **Organik**: mermer, duman, damar, akıntı. |
| `scatter`   | `count, seed, jitter, rotJitter, scaleJitter` | **Tekrar**: dal, yaprak, cıvata, çakıl.   |

`scatter` özel: alt-alanı N kez, tohumlanmış rastgele dönüşümlerle yerleştirir
ve `max` ile birleştirir. Determinizm D5'e tabidir.

### 4.3 Birleştiriciler (alan × alan → alan)

`add` · `sub` · `mul` · `min` · `max` · `mix(t)` · `screen` · `overlay`
`step(edge)` · `smoothstep(e0,e1)` · `remap(inMin,inMax,outMin,outMax)`
`curve(points[])` · `clamp` · `abs` · `invert`

`min`/`max` SDF'de kesişim/birleşim demektir — ayrı boolean primitifi gerekmez.

### 4.4 Komşuluk filtreleri (tampon → tampon)

| `kind`     | Parametreler      | Algoritma notu                               |
| ---------- | ----------------- | -------------------------------------------- | ---------------------------------------------------------------------- |
| `blur`     | `radius, kind(box | gauss)`                                      | Ayrılabilir + koşan toplam, piksel başına O(1). Gauss ≈ 3 kutu geçişi. |
| `sharpen`  | `amount`          | Orijinal + (orijinal − bulanık) × amount.    |
| `dilate`   | `radius`          | Morfolojik genişletme; ayrılabilir maks.     |
| `erode`    | `radius`          |                                              |
| `edge`     | `—`               | Sobel gradyan büyüklüğü.                     |
| `distance` | `threshold`       | Felzenszwalb & Huttenlocher, O(n) tam Öklid. |

**Kenar davranışı `tileable`a bağlıdır:** `false` → kenar değeri kelepçelenir,
`true` → **sarmalanır**. Sarmalanmazsa döşeme dikişinde bulanıklık kırılır ve
5×5 önizlemede görülür.

### 4.5 Biçimlendirme (height → gölge)

| `kind`    | Not                                                           |
| --------- | ------------------------------------------------------------- |
| `normal`  | Sobel türeviyle yükseklikten normal; `strength` ile z ölçeği. |
| `lambert` | `max(0, N·L)`; `ambient` taban aydınlık.                      |
| `rim`     | `1 − max(0, N·V)` üssü; silüeti ayırır.                       |
| `ao`      | Yükseklik farkının yerel ortalaması; ucuz ve yeterli.         |

### 4.6 Piksel-uzay son işlem

| `kind`     | Not                                                                                   |
| ---------- | ------------------------------------------------------------------------------------- |
| `outline`  | `dilate(coverage, px) − coverage`. Modlar: `outside`, `inside`, `centered`.           |
| `dither`   | `none` · `bayer2/4/8` · `blueNoise`.                                                  |
| `quantize` | `ramp` (material+shade → rampa indeksi) veya `nearest` (RGB → **OKLab'da** en yakın). |

**`nearest` neden OKLab'da:** RGB Öklid mesafesi algısal değildir; koyu
mavilerde ve doygun kırmızılarda gözle alakasız eşleşmeler üretir.

---

## 5. Algoritma notları — kolay yanlış yapılan yerler

Bu bölüm uygulayana özeldir. Her madde, naif çözümün neden yetmediğini söyler.

### 5.1 fbm oktavları arasında DÖNDÜRME

Naif fbm oktavları yalnızca ölçekler. Sonuç **eksen hizalı yapaylık**: yatay ve
dikey çizgiler göze çarpar. Her oktavda alan-uzayını sabit bir açıyla (ör.
~0.5 rad) döndürmek bunu dağıtır. Maliyeti bir 2×2 çarpım, kazancı büyüktür.

### 5.2 Döşenebilir (tileable) gürültü

`tileable: true` iken gürültü **periyodik** olmak zorunda. İki yol:

- **Izgara sarma:** value/worley'de hücre indeksleri `mod freq` alınır. Basit
  ve tam; `freq` tam sayı olmalı.
- **4B torus:** 2B koordinat bir torusa gömülüp 4B gürültü örneklenir. Genel
  ama pahalı.

Öneri: **ızgara sarma**, ve `tileable` iken `freq` tam sayıya yuvarlanır.
Yuvarlama sessiz olmaz — editörde uyarı gösterilir.

Ayrıca `tileable` iken TÜM komşuluk filtreleri sarmalı çalışır (§4.4) ve
`scatter` örnekleri kenardan taşarken karşı kenardan girer.

### 5.3 Bulanıklık O(1) olmalı

Yarıçap r için naif kutu bulanıklığı piksel başına O(r²). 1024²'de r=16 ile
268 milyon işlem. **Ayrılabilir** (önce yatay, sonra dikey) O(r)'ye düşürür;
**koşan toplam** (running sum) O(1)'e indirir. Gauss için 3 kutu geçişi
yeterli yaklaşımdır (merkezi limit).

### 5.4 Mesafe dönüşümü: Felzenşvalb, Chamfer değil

Chamfer/iki-geçişli yaklaşım hızlıdır ama **anizotropiktir** — çapraz
yönlerde hata birikir ve dış çizgi kalınlığı yönle değişir. Felzenszwalb &
Huttenlocher algoritması O(n) ve **tam** Öklid karesi verir: satırlar için
alt-zarf (lower envelope) hesabı, sonra sütunlar için aynısı. ~60 satır.

### 5.5 Bayer matrisi özyinelemeli üretilir

```
M1 = [[0]]
M(2n) = [[4·Mn + 0, 4·Mn + 2],
         [4·Mn + 3, 4·Mn + 1]]
```

Normalize: `M / (n²)`. 2→4→8 böyle türetilir; elle tablo yazılmaz.

Mavi gürültü için **void-and-cluster** ile 64×64 bir karo başlangıçta üretilip
saklanır. Hash tabanlı "rastgele" bir yaklaşım mavi gürültü DEĞİLDİR — spektrumu
düz olur ve dither kumlu görünür.

### 5.6 OKLab dönüşümü — sRGB transfer fonksiyonuyla

Sık yapılan hata: gamma 2.2 üssü kullanmak. sRGB'nin gerçek transfer
fonksiyonu parçalıdır ve koyu tonlarda doğrusal bir bölüm içerir:

```
lineer = c ≤ 0.04045 ? c/12.92 : ((c+0.055)/1.055)^2.4
```

Sonra lineer sRGB → LMS → küp kök → OKLab. Ters yönde tersi. Bu, palet
sentezinin ve `nearest` nicemlemenin doğruluğunu belirler.

### 5.7 Ters eşleme, ileri değil

Alan-uzayı zinciri çıktı pikselinden girdiye gider (D4). `rotate(30°)`
uygularken çıktı koordinatı **−30°** döndürülür. İleri eşleme (girdiden
çıktıya) çıktıda boşluk (hole) bırakır. Zincir birden fazlaysa **ters sırada**
uygulanır.

### 5.8 SDF `smoothstep` genişliği çözünürlüğe bağlıdır

Bir SDF'yi maskeye çevirirken `smoothstep(-w, +w, d)` kullanılır. `w` birim
uzayda sabitse 1024²'de yumuşak, 32²'de tüm şekli yutar. `w` **piksel
cinsinden** verilip birim uzaya çevrilmelidir: `w = pixelWidth / size`.
`antialias: false` iken `step(0, d)` kullanılır, `w` hiç devreye girmez.

---

## 6. Modül yerleşimi

```
core/src/visual/
  types.ts            SpriteDoc, Layer, Palette, ParamSchema…
  schema.ts           parametre şeması + doğrulama (D11)
  field/
    buffer.ts         FieldBuffer ayırma/havuzlama
    generators.ts     §4.1
    domain.ts         §4.2  (ters eşleme burada)
    combine.ts        §4.3
    filter.ts         §4.4  (koşan toplam, Felzenszwalb)
  shade/
    normal.ts  lambert.ts  ao.ts  outline.ts
  color/
    oklab.ts          §5.6
    palette.ts        Palette tipi, kilit doğrulaması
    generate.ts       §7 palet sentezi
    dither.ts         §5.5
    quantize.ts
  render.ts           §3 boru hattı — TEK giriş noktası
  index.ts            barrel (Node-only HİÇBİR ŞEY yok — D8)

core/src/visual/encode/            ← ayrı ALT-YOL, barrel'da değil (D8)
  png.ts              node:zlib ile PNG kodlayıcı

core/scripts/visual-qa.ts          §9 ölçüm aracı

games/vol-forge/                   editör (vol-ui kardeşi)
  src/main.ts  scenes/  sections/  i18n/{tr,en}.json
```

`core/package.json` `exports` alanına iki giriş eklenir:
`"./visual"` ve `"./visual/encode"`.

### PNG kodlayıcı neden ffmpeg değil

Ses tarafı OGG için ffmpeg'e **mecburdur** (Vorbis kodlayıcı yazmak makul
değil). PNG öyle değil: `node:zlib` yerleşiktir, PNG konteyneri basittir
(IHDR + IDAT + IEND, CRC32, zlib deflate). ~120 satır. Görsel hattının ffmpeg
gerektirmemesi gerçek bir kazançtır — `just doctor`'da bir önkoşul daha
olmaz.

Not: paletli (indexed, renk tipi 3) PNG yazmak dosyayı ciddi küçültür ve
palet kilidini dosya formatında da garanti eder. Öneri: **varsayılan indexed**,
palet 256'yı aşarsa truecolor'a düş.

---

## 7. Palet sistemi

### 7.1 Sentez — "elle yapılmış" görünmenin üç kuralı

Naif yol HSL'de parlaklığı adımlamaktır. Sonuç **cansız**dır. Gerçek piksel
sanatçılarının yaptığı üç şey:

1. **Ton kayması (hue shift).** Gölgeler maviye/mora, aydınlıklar
   sarıya/turuncuya kayar. Tek renk rampası asla tek tonda kalmaz. Bu, elle
   yapılmış görünmenin **tek en büyük etkenidir**.
2. **Doygunluk kemeri.** Uçlarda (en koyu ve en açık) doygunluk düşer, ortada
   zirve yapar. Düz doygunluk plastik görünür.
3. **Algısal uzay.** OKLab'da eşit adım göze eşit görünür; HSL'de görünmez.

```ts
generateRamp({
  base: '#6b5570',
  steps: 5,
  hueShift: -18,        // derece; negatif = gölgeler soğur
  satCurve: 'arch',     // 'flat' | 'arch' | 'rise'
  lightRange: [0.18, 0.88],
}): string[]
```

### 7.2 Palet kilidi

Nicemleme sonrası çıktıda palet dışı piksel **kalmaz**. `visual-qa` bunu
ölçer; ihlal kapıyı kırar (D6). `nearest` modunda kilit doğal olarak sağlanır;
`ramp` modunda rampa indeksi sınırları kelepçelenir.

Şeffaflık istisnadır: alfa 0 pikseller palet dışı sayılmaz.

---

## 8. Editör (`games/vol-forge`)

Kullanıcı içindir; agent CLI'dan sürer (§10). Bileşenler `core/src/ui`'den
gelir — ImGui benzeri bir bağımlılık **eklenmez** (repo zaten kendi
immediate-benzeri kontrol setine sahip).

### 8.1 Düzen

```
┌───────────────┬──────────────────────────┬──────────────┐
│ KATMAN LİSTESİ│        ÖNİZLEME          │  PARAMETRE   │
│ (sürükle-sırala│  1:1 · yakınlaştırma     │  (şemadan    │
│  göz/kilit)   │  3×3 döşeme              │   üretilir)  │
│               │  kanal görüntüleyici     │              │
├───────────────┴──────────────────────────┴──────────────┤
│ PALET ŞERİDİ  (rampa düzenleme · kilit göstergesi)      │
└──────────────────────────────────────────────────────────┘
```

### 8.2 Önizleme modları — hangileri ve NEDEN

| Mod                             | Neden gerekli                                                                                                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **1:1 + tamsayı yakınlaştırma** | Piksel sanatı 1:1 değerlendirilir; kesirli ölçek yanıltır. Yakınlaştırma **nearest** olmalı.                                                                       |
| **3×3 döşeme**                  | Dikişsizliği gözle doğrulamanın tek yolu. `tileable: true` iken varsayılan.                                                                                        |
| **Kanal görüntüleyici**         | `coverage` · `height` · `material` · `normal` · `shade` · final. **Hata ayıklamanın belkemiği**: "gölge neden yanlış?" sorusu ancak `height` görülünce cevaplanır. |
| **Nicemleme öncesi/sonrası**    | Paletin ne kadarını kaybettiğini gösterir; dither ayarı buna bakılarak yapılır.                                                                                    |
| **Palet uyum rozeti**           | Palet dışı piksel sayısı canlı. Sıfır değilse kırmızı.                                                                                                             |

Şeffaflık dama deseniyle gösterilir; düz renk zeminde alfa hatası görünmez.

### 8.3 Kontroller şemadan üretilir (D11)

`number` → `Slider` (min/max/step şemadan) · `int` → `NumberStepper` ·
`bool` → `Checkbox` · `enum` → `SegmentedControl` ya da `Select` ·
`vec2` → iki `Slider` · `color` → **ColorPicker (YENİ, bkz. §11)** ·
`field` → alt-düzenleyici (özyineleme, azami derinlik 4).

### 8.4 Zorunlu repo kuralları

- Metinler i18n'den (`volforge:` namespace), tr/en key paritesi zorunlu.
- Yeni bir CORE bileşeni eklenirse `games/vol-ui` showcase'ine de eklenir ve
  README sekme tablosu güncellenir ([AGENTS.md](../../AGENTS.md) UI Kuralları).
- Listeler kimliğe göre diff'lenir; her güncellemede DOM yıkılmaz.
- Her listener'ın `destroy()` karşılığı olur — `DisposableScope` kullanılır.

---

## 9. Ölçüm — `core/scripts/visual-qa.ts`

Ses tarafındaki `audio-qa.ts`'in karşılığı. **İlk turdan itibaren** vardır.

| Metrik                     | Ne söyler                               | Eşik                        |
| -------------------------- | --------------------------------------- | --------------------------- |
| **Palet uyumu**            | Palet dışı piksel sayısı                | **0 olmalı** (alfa 0 hariç) |
| **Dikiş farkı**            | Sol↔sağ ve üst↔alt kenar piksel farkı | `tileable` iken ~0          |
| **Dış çizgi sürekliliği**  | Silüetin kopuk parça sayısı             | 1 (tek bileşen)             |
| **Kontrast oranı**         | En koyu/en açık algısal fark (OKLab L)  | tür bazlı taban             |
| **Bantlaşma**              | Rampa adımlarının histogram düzgünlüğü  | uç birikme yok              |
| **Kullanılan renk sayısı** | Palet gereğinden büyük mü               | rapor                       |
| **Alfa saflığı**           | Kısmi alfa piksel sayısı                | `antialias:false` iken 0    |

Rapor makine-okunur (`--json`), tıpkı `scripts/quality/report.mjs` gibi.

---

## 10. Agent arayüzü

### 10.1 CLI

```bash
tsx core/scripts/forge.ts render <doc.json> <out.png> [--size 256] [--seed 42]
tsx core/scripts/forge.ts validate <doc.json>
tsx core/scripts/forge.ts qa <out.png> --doc <doc.json> [--json]
tsx core/scripts/forge.ts palette <istek.json>      # palet sentezi
```

`--size` ve `--seed` belgeyi **ezmek** içindir: aynı belgeden farklı boyut/
varyant üretmenin yolu budur (D2).

### 10.2 Katalog — agent'ın "ne yazacağını" bilmesi

Parametre şeması **yetmez**; agent neyi arayacağını bilmeli. Ses tarafındaki
`presets/catalog/` deseninin aynısı:

```ts
export const MATERIAL_CATALOG: Record<string, PresetMetadata> = {
  brushedMetal: {
    category: 'material',
    description: 'Yönlü çizikli metal yüzey; anizotropik gürültü + hafif AO.',
    useCase: 'Machine housing, panel, plate',
    tags: ['metal', 'industrial', 'anisotropic'],
    related: ['rustedMetal', 'polishedMetal'],
  },
};
```

Kategoriler: `material` · `terrain` · `organic` · `liquid` · `mineral` ·
`structure` · `effect`.

**Bu katalog olmadan agent boş bir parametre setine bakar.** Katalog, "piksel
ağacı çiz" isteğinin başlangıç noktasıdır: agent `organic` + `tags:['plant']`
arar, en yakın preseti alır, parametreleri türetir.

> Katalog girdileri **TÜR (genre) değil malzeme/biçim** tanımlar. Bir oyun
> türünü ya da belirli bir oyunu adlandıran terimler kataloğa girmez; yasaklı
> terimlerin listesi `core/tests/governance/primitiveNeutrality.test.ts`
> içindeki `GENRE_TERMS` dizisidir ve **burada tekrarlanmaz** — iki yerde
> tutulan bir liste ayrışır.

---

## 11. Depodan gelen yükümlülükler

Bu bölüm "yeni kod yazarken nelere takılacaksın" listesidir. Hepsi mevcut
kapılardan doğar; sürpriz olmasınlar diye önden yazıldı.

### 11.1 Yeniden kullanılacaklar (yazma, al)

| İhtiyaç                             | Depoda var | Yol                                                                                                            |
| ----------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------- |
| Tohumlanmış PRNG                    | ✅         | `createRandom`, `seedFromString`                                                                               |
| `lerp`/`clamp`/`smoothstep`/`remap` | ✅         | `core/src/math/interpolation.ts`                                                                               |
| Sonlu sayı bariyeri                 | ✅         | `requireFinite`, `finiteOr` — **D5 için zorunlu**                                                              |
| Tampon havuzu                       | ✅         | `ObjectPool` — D7                                                                                              |
| Yaşam döngüsü                       | ✅         | `DisposableScope` — editörde zorunlu                                                                           |
| UI kontrolleri                      | ✅         | `Slider`, `NumberStepper`, `Select`, `SegmentedControl`, `Checkbox`, `Tabs`, `Accordion`, `Tree`, `ScrollView` |
| Node-only izolasyon deseni          | ✅         | `audio/synth/writer` alt-yolu                                                                                  |
| Katalog deseni                      | ✅         | `audio/synth/presets/catalog/`                                                                                 |
| CLI deseni                          | ✅         | `tsx core/scripts/*.ts`                                                                                        |

### 11.2 Yazılacak yeni CORE parçaları

| Parça                    | Neden yok                                | Nereye                                                                      |
| ------------------------ | ---------------------------------------- | --------------------------------------------------------------------------- |
| **OKLab dönüşümü**       | Depoda renk uzayı matematiği **hiç yok** | `visual/color/oklab.ts`                                                     |
| **ColorPicker bileşeni** | UI setinde renk kontrolü yok             | `core/src/ui/primitives/ColorPicker.ts` + **vol-ui showcase FORMS sekmesi** |
| **PNG kodlayıcı**        | Raster yazma yok                         | `visual/encode/png.ts` (alt-yol)                                            |

`ColorPicker` CORE'a girdiği an [AGENTS.md](../../AGENTS.md) UI kuralı devreye
girer: showcase'e eklenir, README sekme tablosu güncellenir, i18n key paritesi
sağlanır.

### 11.3 Kapılar ve bekçiler

- **`workspace-contract`**: `games/vol-forge` `typecheck`, `test`,
  `test:coverage` script'leri ve `quality.json`da eşik **olmadan** repoya
  giremez. Taban: 50/50/50/40.
- **`publicSurface`**: her yeni CORE export'u yüzey sayısını değiştirir; kapı
  kırılır ve sayı **bilinçli** güncellenir. `visual/` ~40 export getirecek.
- **`publicApi`**: export adları `enemy`/`boss`/`flux`/`spark`/`volhell`
  içeremez.
- **`primitiveNeutrality`**: `PRIMITIVE_ROOTS` dizisine `'visual'` **eklenir**;
  o andan itibaren `visual/` altında bir oyun türünü adlandıran terim hem kodda
  hem yorumda yasaktır. Yasaklı terimler bekçideki `GENRE_TERMS` dizisinde
  tutulur; bu belge onları tekrarlamaz.

  **Bu belge de taranmalıdır.** Bekçi bugün `core/docs/primitives.md`i tarıyor;
  `visual/` bir primitif kökü olduğunda tarama listesine
  `core/docs/visual-synthesis.md` de eklenmelidir — bir modülün kodu nötr olup
  dokümanı bir türe demirlerse, kod nötr sayılsa da REPO değildir (bu hata bir
  kez yapıldı, bkz. `TODO.md` "Tür sızıntısı" turu).

- **`numericContract`**: sonlu olmayan girdi ya reddedilir (yapılandırma) ya
  yoksayılır (akış). `size`, `seed`, `freq` **reddedilir**.
- **`lifecycleIdiom`**: elle `(() => void)[]` temizlik dizisi yasak.
- **Kapsam**: yeni paket ölçülür; eşikler ölçülen değerin ~2 puan altına
  ratchet'lenir.

### 11.4 i18n

Editör metinleri `volforge:` namespace'inde, `tr.json` + `en.json` **key
paritesi zorunlu**. Module-level `i18next.t()` **yasak** (import anında
`init()` bitmemiştir; boş string döner) — çağrı build fonksiyonunun İÇİNDE olur.

---

## 12. Uygulama sırası

Her tur kendi başına yeşil kapıyla kapanır; yarım tur bırakılmaz.

### Tur 1 — Çekirdek iskelet (editörsüz, ölçülebilir)

Hedef: `tsx forge.ts render doc.json out.png` çalışsın.

- `types.ts`, `schema.ts` + doğrulama
- `FieldBuffer` + havuz
- Üreteçler: `const`, `noise.value`, `gradient.linear/radial`, `sdf.circle/box`
- Alan-uzayı: `translate`, `rotate`, `scale` (ters eşleme — D4)
- Birleştirici: `add`, `mul`, `min`, `max`, `mix`, `step`, `smoothstep`
- Üç kanallı bileşim (D3) + katman yığını (D10, alt-yığın **henüz yok**)
- OKLab + palet veri + `ramp` nicemleme
- PNG kodlayıcı (indexed)
- **Determinizm testi** (D5): iki render bit düzeyinde aynı
- **`visual-qa` ilk üç metrik**: palet uyumu, alfa saflığı, renk sayısı

_Kanıt:_ elle yazılmış bir `doc.json` beklenen PNG'yi üretir; palet uyumu 0 ihlal.

### Tur 2 — Cebiri tamamla

- Kalan üreteçler (worley, simplex, fbm, tüm SDF'ler, desenler)
- Kalan alan-uzayı: `mirror`, `repeat`, `polar`, `warp`, `scatter`, `skew`
- Kalan birleştiriciler
- Komşuluk filtreleri (koşan toplam bulanıklık, Felzenszwalb DT, morfoloji, edge)
- `tileable` uçtan uca (periyodik gürültü + sarmalı filtre + sarmalı scatter)
- Dikiş farkı metriği

_Kanıt:_ döşenebilir bir doku 3×3'te dikişsiz; dikiş farkı ~0.

### Tur 3 — Biçim ve stil

- `normal`, `lambert`, `rim`, `ao`
- `outline` (üç mod), `dither` (Bayer + mavi gürültü)
- `nearest` nicemleme (OKLab mesafesi)
- Palet sentezi (`generateRamp`, ton kayması + doygunluk kemeri)
- Alt-yığın maskeler (özyineleme, derinlik sınırı 4)
- `materialAlt` + `materialMask`
- Kalan `visual-qa` metrikleri

_Kanıt:_ tek belgeden hem 64² piksel sanatı hem 512² doku; ikisi de palet uyumlu.

### Tur 4 — Editör

- `games/vol-forge` iskeleti (vol-ui deseni)
- `ColorPicker` → CORE + showcase + README
- Şemadan kontrol üretimi (D11)
- Katman listesi (sürükle-sırala, göz/kilit)
- Önizleme modları (§8.2) — **kanal görüntüleyici dahil**
- JSON içe/dışa aktarma

_Kanıt:_ editörde kurulan belge CLI'dan **birebir aynı** PNG'yi verir.

### Tur 5 — Katalog ve olgunlaşma

- Preset kataloğu (§10.2), kategoriler ve etiketler
- CLI `qa` alt komutu + `--json`
- Kapsam ratchet'i, doküman güncellemesi

_Kanıt:_ agent yalnızca kataloğu okuyarak makul bir başlangıç belgesi üretir.

---

## 13. Açık kalanlar

Bunlar **bilinçli olarak** kararlaştırılmadı; ilk gerçek kullanım karar
verecek. Karar verilmeden kod yazılmaz.

1. **Dikdörtgen çıktı.** Bugün `size` tek sayı (kare). Kare olmayan sprite
   gerekirse birim uzayın en-boy oranı da tanımlanmalı — `[0,1]²` mi kalır,
   yoksa uzun kenar mı 1 olur? İkisi farklı sonuç verir.
2. **Çoklu çıktı.** Bir belgeden atlas/varyant seti üretmek (`--variants 8`)
   doğal bir istek ama `seed` ezmesiyle zaten yapılabiliyor; ayrı bir kavram
   gerekip gerekmediği belirsiz.
3. **Normal/height haritası dışa aktarımı.** Motor zaten üretiyor; PNG olarak
   yazmak ucuz. Tüketicisi çıkınca eklenir.
4. **`curve` düzenleyici.** Şemadan üretilen kontroller eğri için yetersiz;
   özel bir bileşen gerekir. Tur 4'te değerlendirilir.
5. **Ses motorunun editöre taşınması.** D11'deki şema deseni bunun dikişidir.
   **Görsel kanıtlanmadan başlanmaz** — ikinci tüketici gelmeden ortak kabuk
   soyutlaması yapılmaz.

---

## 14. Bu belgeyi değiştirmek

Doktrinler (§1) numaralıdır ve gerekçelidir. Bir doktrini değiştirmek için
**gerekçesinin neden geçersiz olduğunu** yazmak gerekir; "daha kolay olurdu"
yeterli değildir. Kararı değiştiren tur, bu belgeyi aynı turda günceller
([AGENTS.md](../../AGENTS.md) — Doküman gerçeğin gerisine düşürülmez).
