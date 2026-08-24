# Görsel sentez — doktrin ve sözleşme

Bu belge `core/visual/` (prosedürel raster sentezi) ve onun tüketici
yüzeyleri için **bağlayıcı** tasarım kararlarını taşır. Uygulayan
kişi ya da agent önce bunu okur; buradaki kararlar gerekçeleriyle birlikte
yazılıdır ve gerekçe çürütülmeden değiştirilmez.

Kardeş belge: [`sound-synth.md`](./sound-synth.md). Görsel sentez, ses
sentezinin aynadaki görüntüsüdür ve aynı doktrinleri paylaşır: saf matematik,
offline üretim, tohumlanmış determinizm, ölçülebilir kalite.

---

## 0. Amaç ve anti-hedefler

**Amaç:** parametrelerle tanımlanan, deterministik, tek bir PNG sprite üreten
genel amaçlı raster sentez sistemi ve onu niyetten canlı kuran üretim yüzeyi.

Sistem **hiçbir nesne türüne göre tasarlanmaz.** Ağaç, matkap, cevher, sıvı,
kristal — hepsi aynı cebirin farklı bileşimleridir. Bir örneğe demirlemek
sistemi o örnek kadar dar yapar.

**Anti-hedefler** (bunlar bilinçli olarak YAPILMAZ):

| Yapılmayacak                     | Neden                                                                                         |
| -------------------------------- | --------------------------------------------------------------------------------------------- |
| Animasyon / kare dizisi          | Çıktı tek PNG. Zaman parametresi her düğümü ve çıktı hattını etkiler; gerekirse ayrı bir tur. |
| Düğüm grafiği (DAG) editörü      | Kompozisyon modeli katman yığını (bkz. D10). DAG'a geçiş yolu açık ama bugün yapılmaz.        |
| Genel amaçlı görüntü düzenleyici | Fırça, seçim, katman efekti yok. Bu bir _üretici_, bir _editör_ değil.                        |
| Üretken YZ / difüzyon            | Çıktı tamamen algoritmiktir.                                                                  |
| Vektör çıktı (SVG)               | Hedef raster; SDF'ler vektör değil, alan olarak kullanılır.                                   |
| 3B                               | Yükseklik alanı 2.5B gölgeleme içindir, geometri değil.                                       |

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

**Koordinat sözleşmesi:** `size` bir `[w, h]` çiftidir. Birim uzayın **kökeni
MERKEZDEDİR** ve birim **kısa kenarın yarısıdır**: kısa eksen `[-1, 1]`, uzun
eksen `[-a, a]` (`a = uzun / kısa`).

İki gerekçe:

1. **Bozulma yok.** `[0,1]²`yi dikdörtgene esnetmek daireyi elipse çevirir ve
   her SDF'yi en-boy oranına bağımlı kılar. Kısa kenar normalizasyonu şekli
   korur; uzun eksen yalnızca daha fazla alan gösterir.
2. **Simetri doğal olur.** `mirror` ve `polar` bu sistemin genelliğinin
   kaynağıdır (§4.2). `x = 0` etrafında aynalamak doğaldır; `x = 0.5`
   etrafında aynalamak her çağrıda merkez parametresi taşımak demektir.

**Eksen yönü: +y AŞAĞIDIR.** Çıktı bir görüntüdür ve tampon indeksi doğrudan
satıra eşlenir; ayrıca `"light": [-0.55, -0.7, …]` bu eksende sol-üst demektir
ki piksel sanatının alışılmış anahtar ışığı odur. Yan sonucu: **pozitif açı
görsel olarak saat yönünde döner.**

**Açı birimi:** JSON'da **derece**, motor içinde **radyan**. Dönüşüm sınırda
(derleme sırasında) bir kez yapılır. Gerekçe: `"angle": 45` bir insanın ve
agent'ın yazacağı biçimdir; `0.7853981634` değil. Kod içinde radyan kalır
çünkü `Math.*` öyle çalışır.

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

Aynı belge + aynı tohum = **bit düzeyinde aynı PİKSELLER**, her platformda.

- Her rastgele kullanan düğüm tohumunu `kökTohum ⊕ hash(düğümYolu)` ile alır.
  Düğüm sırası değişince komşu düğümlerin çıktısı değişMEMELİdir.
- `Math.random()` **yasaktır**. Sıralı rastgelelik gereken yerde
  `createRandom()` kullanılır.
- **Kafes gürültüsü sıralı PRNG değil KONUMSAL KARMA kullanır.** Gürültünün
  değeri konumun fonksiyonu olmalıdır, çağrı sırasının değil: sıralı bir
  üreteç aynı noktayı iki kez okurken farklı değer verir ve `warp` gibi
  yeniden örnekleyen işlemler bozulur. Tohum yine yukarıdaki kuralla
  türetilir; değişen yalnızca tohumun nasıl tüketildiğidir.
- Kayan nokta işlem sırası sabit tutulur; paralel/atlamalı toplama yapılmaz.
- Test: aynı belge iki kez render edilir, tamponlar birebir karşılaştırılır.

**Tohum yolu katman KİMLİĞİYLE başlar, indeksiyle değil.** İndeks kullanılsa
listenin başına bir katman eklemek altındaki her katmanın gürültüsünü
değiştirir; "şu parçayı biraz değiştir" isteği ilgisiz katmanları da
yeniden üretir ve fark gözden geçirilemez olur — D5'in yasakladığı tam olarak
budur.

**Garantinin sınırı dürüstçe:** garanti edilen PİKSEL özdeşliğidir. PNG'nin
bayt düzeyinde aynı olması zlib sıkıştırma çıktısının aynı kalmasına bağlıdır;
bu aynı Node sürümünde geçerlidir, sürümler arası garanti edilemez. Testler
bu yüzden RGBA tamponunu karşılaştırır, dosya özetini değil.

Gerekçe: asset üretimi tekrarlanabilir olmazsa "şu parçayı biraz değiştir"
istenmeyen değişiklikler getirir ve fark gözden geçirilemez.

### D6 — Palet veridir, gömülü değildir

Palet `{ colors: string[], ramps: Ramp[] }` biçiminde **girdidir**. Agent
kendi paletini verebilir ya da sentezletebilir; ikisi de aynı veriye indirgenir.

Motor asla renk sabiti taşımaz. `VOL_COLORS` bu sisteme girmez — o, arayüzün
paletidir, üretilen asset'in değil.

**Kimliği 0 olan rampa zorunludur.** Malzeme biriktiricisi 0 ile başlar (§3);
kapsaması sıfırdan büyük ama malzeme eşiğinin altında kalan bir piksel oraya
düşer. Rampa 0'ı zorunlu kılmak, o pikselin çalışma anında patlaması yerine
belgenin sınırda reddedilmesi demektir.

**Palet kilidi:** nicemleme sonrası çıktıda palet dışı piksel KALMAZ. Bu
ölçülür (bkz. §9) ve ihlal kapıyı kırar.

Kilit **uygulanabilirdir çünkü nicemleme boru hattının SON renk işlemidir**
(§3, adım 7). Kenar yumuşatma açıkken karışan ara renkler bile nicemlemeden
geçer ve palete oturur. İhlal ancak nicemlemeden sonra renk üreten bir adım
eklenirse doğar — böyle bir adım eklenmez. Sebep: piksel sanatı iddiası taşıyan
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

### D8 — Çekirdek headless, üretim yüzeyi tüketici

`core/visual/` **DOM tanımaz**. `Canvas`, `ImageData`, `window` geçmez.
Node'da ve tarayıcıda aynı çalışır.

Yüzeyler _tüketicidir_: çekirdeği çağırır, sonucu gösterir. Hiçbir yüzey
olmadan çekirdek tam işlevlidir — `synthesize()`in `vol-ui` olmadan çalıştığı
gibi. Bugünkü tüketici agent'ın CLI üzerinden sürdüğü hattır (§8, §10).

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
2. **Agent tarafından okunabilirlik** — düz JSON dizi yazılır ve diff'lenir;
   grafik bağlantı kimlikleri gerekmez.
3. **Bellek doğrusal** (D7).
4. **DAG'ı engellemez** — primitifler aynı kalır, ilerde yalnızca kompozisyon
   katmanı değişir.

Maske **alt-yığın** olabilir (özyinelemeli). Azami derinlik **4**; aşılırsa
hata fırlatılır. Gerekçe: bellek sınırı (D7) ve belge okunabilirliği.
Sonsuz derinlik pratikte gerekmedi, sınırsız bırakmak hem belleği hem arayüzü
öngörülemez yapar.

### D11 — Parametre şeması doğrular ve araçlara veri sağlar

Her primitifin parametreleri **veriyle bildirilir**: ad, tip, aralık, adım,
varsayılan, açıklama.

Bu şema iki amaç taşır:

- **Doğrulama** — agent'ın yazdığı JSON sınırda kontrol edilir (ses tarafındaki
  `validateQualityConfig`/`validateRigMetadata` deseni).
- **Araç introspeksiyonu** — CLI/agent hangi alanın türünü, aralığını ve
  varsayılanını tek kaynaktan okuyabilir.

Tur 4'te şema doğrudan parametre editörü üretmek için kullanıldı; Tur 5 ürün
denetiminde bu yüzey kaldırıldı. Şemanın doğrulama ve agent sözleşmesi değeri
bundan bağımsızdır. Gelecekte yeni bir tüketici çıkmadan ortak editör kabuğu
soyutlanmaz.

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
  "size": [64, 64], // [genişlik, yükseklik] piksel; 8..2048. Kare olmak zorunda değil.
  "seed": 1337,
  "tileable": false, // true ise gürültü periyodik, filtreler sarmalı (bkz. §5)
  "antialias": false, // birim uzayda süperörnekleme; düşük çözünürlükte kapalı tutulur

  // Palet ya DOĞRUDAN VERİ ya da SENTEZ İSTEĞİdir; ikisi bir arada olamaz.
  // Karıştırmak renk indekslerini kimin yönettiğini belirsiz yapardı.
  "palette": {
    "colors": ["#1a1420", "#3a2b3f", "#6b5570", "#a58aa8"],
    "ramps": [{ "id": 0, "name": "taş", "indices": [0, 1, 2, 3] }]
    // …ya da (bkz. §7). DİZİdir: kimlikler 0'dan başlayarak sırayla verilir.
    // "generate": [{ "base": "#6b5570", "steps": 4, "hueShift": -18, "satCurve": "arch" }]
  },

  "layers": [
    {
      "id": "govde",
      "source": { "kind": "sdf.capsule", "a": [0, -0.84], "b": [0, 0.16], "r": 0.11 },
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

  // `shade` YOKSA gölge yüksekliğin kendisidir; bu bir yer tutucu değil,
  // basit belgeleri basit tutan bilinçli bir varsayılan.
  "shade": {
    "light": [-0.55, -0.7, 0.45], // normalize edilir; +y aşağı, +z izleyiciye
    "strength": 0.6, // yayınık ışığın katkısı
    "ambient": 0.35, // taban aydınlık
    "rim": 0.15, // kenar ışığı şiddeti (üssü sabittir, bkz. §4.5)
    "relief": 1, // yükseklikten türetilen kabartmanın şiddeti
    "ao": { "radius": 0.04, "strength": 0.4 } // radius BİRİM uzayda
  },

  "post": {
    "outline": { "px": 1, "mode": "outside", "colorIndex": 0 }, // px PİKSEL
    "dither": { "kind": "bayer4", "amount": 0.15 }, // none|bayer2/4/8|blueNoise
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
                        layerCoverage *= maske   (MASKE ŞEKİLDİR — aşağıdaki not)
     c. komşuluk filtreleri AĞAÇTA yaşar (a ve b'nin içinde); ayrı adım yok
     d. layerAlpha ← layerCoverage * opacity
                     (KAPSAMA AYRI KALIR — bkz. aşağıdaki not)
     e. layerHeight ← katmanın `height` alanı varsa Aşama 1 ile ayrıca
                      değerlendirilir; YOKSA layerCoverage kullanılır
     f. coverage ← blend(coverage, layerAlpha)
        height   ← heightBlend(height, layerHeight * layerAlpha)
        material ← layerCoverage > materialThresholdCoverage olan yerde
                   (opaklık DEĞİL kapsama sınanır)
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

**Malzeme yazımı eşikli, ama KAPSAMAYI sınar — opaklığı değil.** Ham `> 0`
koşulu, kenar yumuşatma açıkken saçaklarda yanlış rampa bırakırdı; bu yüzden
`materialThresholdCoverage` (varsayılan 0.5, katman düzeyinde) vardır.

Kritik ayrım: **kapsama "şekil burada mı", opaklık "ne kadar saydam"dır.**
İkisi tek değere karıştırılırsa `opacity: 0.3` veren bir katmanın kapsaması
her yerde 0.3 olur, eşiğin altına düşer ve HİÇBİR YERE malzeme yazmaz — cam
paneli renksiz çıkar. Bu yüzden `layerCoverage` ile `layerAlpha` ayrı tutulur:
harmanlama alfayı, malzeme eşiği kapsamayı kullanır.

**Maske opaklığın değil ŞEKLİN tarafındadır.** Bu ayrım Tur 1'de uygulama
sırasında netleşti: maske `layerAlpha`ya bırakılırsa, maskeyle gizlenen bölge
`layerCoverage` üzerinden hâlâ eşiği geçer ve ALTINDAKİ katmanın rengini bu
katmanın rampasıyla ezer. Görünmeyen bir katmanın görünür yan etkisi olur.
Maskenin anlamı "bu parça burada YOK"tur; opaklığınki "bu parça burada ama
saydam". İlki kapsamayı çarpar, ikincisi çarpmaz.

Bu, kapsama/alfa ayrımının gerekçesini çürütmez, tamamlar: ayrım OPAKLIK için
kondu; maskenin aynı çarpanda durması o kararın yan ürünüydü.

**Katman kaynağı kapsamaya nasıl çevrilir.** `source`, `mask` ve `height`
alanlarının hepsi 0..1 kapsama üretmelidir, ama SDF'ler işaretli mesafe
döndürür (§4.1). Dönüşüm tek yerde ve düğüm türünden STATİK olarak türetilen
bir bilgiyle yapılır — her düğüm şemada çıktı etki alanını bildirir:

| Etki alanı | Kim üretir                      | Kapsamaya çevrimi |
| ---------- | ------------------------------- | ----------------- |
| `unit`     | `const`, gürültü, gradyan, eşik | `clamp01(v)`      |
| `signed`   | `sdf.*`                         | §5.8'in eşiği     |

Alan-uzayı işlemleri etki alanını girdilerinden DEVRALIR (koordinatı
değiştirirler, değerin anlamını değil). Birleştiricilerde girdilerden
herhangi biri `signed` ise sonuç `signed`'dır: `min`/`max` iki SDF'nin
birleşimi/kesişimi, `add` bir SDF'yi ötelemek (şekli büyütmek), `mul`
mesafeyi ölçeklemektir. `step`/`smoothstep` her zaman `unit` üretir.

Bu sayede §2'deki gibi çıplak bir SDF doğrudan `source` olarak yazılabilir;
elle eşik sarmak gerekmez.

---

## 4. Primitif envanteri

Toplam ~35. Her biri D9'a (ortogonallik) uyar. `kind` alanı JSON'daki kimliktir.

### 4.1 Üreteçler (birim uzay → skaler)

| `kind`             | Parametreler                            | Not                                            |
| ------------------ | --------------------------------------- | ---------------------------------------------- |
| `const`            | `value`                                 | Sabit alan; maske/karışım için taban.          |
| `noise.value`      | `freq, seed?`                           | En ucuz gürültü, blok karakterli.              |
| `noise.simplex`    | `freq, seed?`                           | Eksen yapaylığı düşük; **döşenemez** (§5.2).   |
| `noise.worley`     | `freq, mode(F1 · F2 · F2-F1), seed?`    | Hücresel; `F2-F1` hücre kenarı verir.          |
| `noise.fbm`        | `base, octaves, lacunarity?, gain?`     | Oktav sarmalayıcı; aralarında döndürür (§5.1). |
| `gradient.linear`  | `angle, from, to`                       | `from`/`to` KONUMdur, değer değil.             |
| `gradient.radial`  | `center?, radius`                       | Merkezde 1, yarıçapta 0.                       |
| `gradient.angular` | `center?, offset?`                      | Kutupsal açı; dişli/pasta için.                |
| `gradient.diamond` | `center?, size`                         | Manhattan mesafesi.                            |
| `sdf.circle`       | `center?, r`                            |                                                |
| `sdf.box`          | `center?, half`                         |                                                |
| `sdf.roundBox`     | `center?, half, r`                      | `box`tan türetilemez, ayrı formül.             |
| `sdf.polygon`      | `center?, n, r, rotation?`              | Düzgün n-gen; `r` çevrel yarıçap.              |
| `sdf.star`         | `center?, n, rOuter, rInner, rotation?` |                                                |
| `sdf.line`         | `a, b, thickness`                       | Uçları DÜZ.                                    |
| `sdf.capsule`      | `a, b, r`                               | Uçları YUVARLAK; gövde/dal için temel.         |
| `sdf.arc`          | `center?, r, thickness, from, to`       |                                                |
| `pattern.checker`  | `size`                                  |                                                |
| `pattern.stripes`  | `freq, angle?, duty?`                   |                                                |
| `pattern.dots`     | `freq, r`                               |                                                |
| `pattern.grid`     | `freq, thickness`                       |                                                |
| `pattern.hex`      | `freq`                                  | Dikdörtgen olmayan kafes.                      |

**Tablolarda `|` yerine `·` kullanılır.** Kaçırılmamış bir boru işareti hücreyi
böler ve satır hayalet sütunlara dağılır; bu belgede bir kez oldu ve
`mirror` satırının açıklaması görünmez hâle geldi.

SDF'ler **işaretli mesafe** döndürür; katman sınırında kapsamaya çevrilir
(§3). Çerçeve için ayrı primitif gerekmez: `sub(abs(d), w)` kalınlığı `w`
olan bir kontur bandı verir ve sonucu yine işaretli bir alandır, yani
`min`/`max` ile birleştirilebilir (D9).

**Tek tek gürültülerde `octaves` YOKTUR** ve bu bir düzeltmedir: `noise.fbm`
zaten oktav sarmalayıcısıdır ve oktavlar arası döndürmeyi (§5.1) o uygular.
Aynı parametreyi taban gürültülere de koymak, `fbm(base=value, octaves=3)`
ile `value(octaves=3)` arasında iki farklı ve sessizce ayrışan yol açardı —
D9'un yasakladığı türetilebilir primitifin parametre düzeyindeki hâli.

`noise.fbm`in `base`i herhangi bir BİRİM alandır, yalnızca gürültü değil:
sarmalayıcı olması, `fbm(worley)` ya da `fbm(pattern.hex)` gibi bileşimleri
bedavaya açar.

**Desenler D9'un BİLİNÇLİ ve SINIRLI bir istisnasıdır.** `stripes`, `dots` ve
`grid` `repeat` + bir SDF + eşik bileşimiyle ifade edilebilir; doktrine göre
primitif sayılmazlar. Yine de tutuluyorlar çünkü çok sık gereken bir şeyi
dört düğümlük bir bileşime çevirmek belgeyi okunmaz yapar. İstisna
DESENLERLE sınırlı ve burada yazılı; kural gevşetilmiş değil, bir kez ve
gerekçesiyle delinmiştir. `checker` (katlamadan elde edilemeyen bir parite)
ve `hex` (dikdörtgen olmayan kafes) gerçekten türetilemez.

### 4.2 Alan-uzayı işlemleri — GENELLİĞİN KAYNAĞI

Bunlar **girdi koordinatını** dönüştürür (D4, ters eşleme). On üreteçle
sınırlı kalmanın önündeki tek engel budur.

| `kind`      | Parametreler                             | Neyi açar                                      |
| ----------- | ---------------------------------------- | ---------------------------------------------- |
| `translate` | `x, y`                                   |                                                |
| `rotate`    | `angle, center?`                         | +y aşağı olduğu için pozitif açı saat yönünde. |
| `scale`     | `x, y, center?`                          | Bileşenler ayrı → anizotropik esnetme.         |
| `skew`      | `x, y`                                   | `x·y = 1` tekildir ve reddedilir.              |
| `mirror`    | `axis(x · y · quad · radial), count?`    | **Simetri**: makine parçası, yaprak, yüz.      |
| `repeat`    | `count, mode(tile · mirror), center?`    | Döşeme; `mirror` dikişi gizler.                |
| `polar`     | `center?, inverse?`                      | **Halka, spiral, dişli, girişim deseni.**      |
| `warp`      | `by, amount, sample(nearest · bilinear)` | **Organik**: mermer, duman, damar.             |

`mirror`ın `radial-n` yazımı yerine **`axis: 'radial'` + `count`** kullanılır:
D11 parametrelerin TİPLİ bildirilmesini ister ve içine sayı gömülmüş bir dizgi
ne doğrulanabilir ne de editörde kontrol üretebilir.

`polar` ileri yönde çıktının x'ini AÇIYA, y'sini YARIÇAPA eşler — yatay
çizgiler halkaya, dikey çizgiler ışınlara döner. `inverse` bunun tersidir ve
ikisi arka arkaya uygulanınca kimlik verir.

`warp` bu tablodaki TEK tamponlu işlemdir: kayma miktarı başka bir alandan
gelir, o alan önce tampona yazılır ve oradan örneklenir (D4). Tek skaler
alandan iki eksenlik kayma için tampon, 90° DÖNDÜRÜLMÜŞ konumdan ikinci kez
okunur — aynı örneği iki eksende kullanmak kaymayı her yerde 45° yapardı,
ikinci bir tampon ise bellek bütçesini katmanın kendisi kadar büyütürdü.

### 4.2b `scatter` — alan-uzayı işlemi DEĞİL, örnekleme işlemidir

`scatter` yukarıdaki tabloda **yer almaz** ve bu bilinçlidir. Bir alan-uzayı
işlemi koordinat üzerinde bir eşlemedir: bir çıktı noktası ↔ bir girdi noktası,
ters çevrilebilir (D4). `scatter` ise bir çıktı noktası ← **N aday** demektir;
tersi yoktur, üzerinden birleştirme yapılır. Yanlış kategoride durması, ters
dönüşümü varmış gibi uygulanmasına yol açardı.

```
scatter: { count, seed, jitter, rotJitter, scaleJitter, source }
```

Her örnek kendi dönüşümünü tohumdan türetir (D5); çıktı `max` ile birleşir.

**Maliyet uyarısı — naif uygulama kabul edilemez.** Piksel başına N örnek
denemek 1024²'de N=200 ile 200 milyon değerlendirme demektir.

Bu belge önce "sınırlayıcı kutu + uzamsal kova" öngörüyordu. Uygulamada
kutu kaldı, **kova kalktı** ve gerekçesi şudur: kova indeksi "bu pikseli
hangi örnekler kapsıyor?" sorusunu cevaplamak içindir; örnekler üzerinde
dönüp HER BİRİNİ KENDİ KUTUSUNA damgalamak aynı soruyu inşa gereği cevaplar.
Maliyet damgalanan toplam alan kadardır — kovalı çözümle aynı sınıf, bir veri
yapısı eksiğiyle. Kutu zorunluluğu aynen durur.

Örnekler **düzenli ızgaraya** yerleştirilip `jitter` kadar sapar. Tamamen
rastgele konum kümelenme ve boşluk üretir; ızgara + sapma hem düzgün dağılım
hem doğal görünüm verir ve `jitter: 1` neredeyse rastgeleye eşittir.

**Kaynak tampona yazılırken KIRPILIR.** `tileable` sarması ÖRNEĞİN çıktı
konumuna uygulanır, kaynağın kendi çizimine değil; tuvalin dışına ötelenmiş
bir kaynak hiç üretilmez. Bu yüzden kaynak KÖKENDE ORTALANMIŞ olmalıdır —
konumlandırma serpmenin işidir, kaynağın değil.

### 4.3 Birleştiriciler (alan × alan → alan)

`add` · `sub` · `mul` · `min` · `max` · `mix(t)` · `screen` · `overlay`
`step(edge)` · `smoothstep(e0,e1)` · `remap(inMin,inMax,outMin,outMax)`
`curve(points[])` · `clamp` · `abs` · `invert`

`min`/`max` SDF'de kesişim/birleşim demektir — ayrı boolean primitifi gerekmez.

Üç davranış açıkça yazılıdır çünkü sezgi ikiye ayrılıyor:

- `remap` **kelepçelemez**; aralık dışına çıkmak bilinçli bir ekstrapolasyon
  olabilir. Kelepçe isteyen `clamp` ile sarar.
- `curve` **kelepçeler**; eğrinin dışına ekstrapolasyon yapmak, kullanıcının
  ÇİZMEDİĞİ bir davranışı uydurmaktır.
- `screen` ve `overlay` birim alanlar içindir ve çıktıları her zaman kapsama
  sayılır; geri kalan ikili işlemler etki alanını girdilerinden devralır.

### 4.4 Komşuluk filtreleri (tampon → tampon)

| `kind`     | Parametreler                | Algoritma notu                                  |
| ---------- | --------------------------- | ----------------------------------------------- |
| `blur`     | `radius, mode(box · gauss)` | Ayrılabilir + koşan toplam, piksel başına O(1). |
| `sharpen`  | `amount, radius?`           | Orijinal + (orijinal − bulanık) × amount.       |
| `dilate`   | `radius`                    | Morfolojik genişletme; ayrılabilir maks.        |
| `erode`    | `radius`                    | Ayrılabilir min; ikisi de monoton kuyruk.       |
| `edge`     | `—`                         | Sobel gradyan büyüklüğü.                        |
| `distance` | `threshold?`                | Felzenszwalb & Huttenlocher, O(n) tam Öklid.    |

**Yarıçaplar BİRİM uzaydadır, piksel değil.** §3'e göre bu adım parametre
sınırının birim tarafındadır; piksel yarıçapı aynı belgeyi 64² ve 512²'de
bambaşka gösterirdi. Dönüşüm derleme anında yapılır ve bir pikselin altına
düşen yarıçap işlemi no-op'a çevirir.

**`sharpen` bir yarıçap taşır** — belgede önce yalnızca `amount` yazılıydı ama
bulanıklık olmadan bu işlem tanımsızdır: hangi ÖLÇEKTEKİ detayın
vurgulanacağını yarıçap belirler.

**`distance` İŞARETLİ ve BİRİM uzayda çıktı verir**: içeride negatif, dışarıda
pozitif. İşaretsiz bırakmak alanı `min`/`max` ile birleştirilemez yapardı;
işaretli olması onu bir SDF üreticisi hâline getirir ve mevcut cebre bağlar
(D9). Girdisi önce kapsamaya çevrilir — bir SDF'nin ham mesafesinde 0.5
eşiği anlamsız olurdu.

**Kenar davranışı `tileable`a bağlıdır:** `false` → kenar değeri kelepçelenir,
`true` → **sarmalanır**. Sarmalanmazsa döşeme dikişinde bulanıklık kırılır ve
3×3 önizlemede görülür.

**Filtreler ağacın DÜĞÜMÜDÜR, ayrı bir katman adımı değil.** §3'ün ilk
yazımında (c) adımı filtreleri yalnızca `layerCoverage` üzerine uyguluyordu;
düğüm olmaları `source`, `mask`, `height` ve hatta `warp`ın kendi `by` alanı
içinde de kullanılabilmelerini sağlar. Ayrı bir katman dizisi hem daha dar
olurdu hem de aynı şeyi söylemenin ikinci bir yolunu açardı.

### 4.5 Biçimlendirme (height → gölge)

| `kind`    | Parametreler               | Not                                        |
| --------- | -------------------------- | ------------------------------------------ |
| `normal`  | `relief`                   | Sobel türeviyle yükseklikten normal.       |
| `lambert` | `light, strength, ambient` | `max(0, N·L)`; `ambient` taban aydınlık.   |
| `rim`     | `rim`                      | `(1 − N.z)` üssü; silüeti zeminden ayırır. |
| `ao`      | `ao.radius, ao.strength`   | Yükseklik farkının yerel ortalaması.       |

Dördü ayrı düğüm değil, tek bir `shade` yapılandırmasının alanlarıdır: gölge
TEK ışıktan gelir ve tüm malzemeler onu paylaşır. D3'ün "çok renkli obje, tek
ve tutarlı ışık" iddiasının teknik karşılığı budur.

**Türev BİRİM uzayda alınır.** Piksel farkı çözünürlükle küçülür; türev ondan
alınsaydı aynı belge 512²'de 64²'ye göre sekiz kat yassı görünürdü. Bölen
`8 · pixelUnit` olduğunda eğim çözünürlükten bağımsız kalır (D2). Test bunu
ham piksel farkının dört kat değiştiğini ölçerek karşılaştırır.

**Kenar ışığının ÜSSÜ parametre değildir.** `rim` zaten bir şiddet taşıyor;
üssü de açmak, ikisi birlikte ayarlanmadıkça anlamsız sonuç veren iki
kaydırıcı demekti. Sabit değer (3) silüeti ayıracak kadar dar bir bant verir.
Ayrı bir kamera vektörü de yoktur — çıktı ortografiktir, bakış `(0, 0, 1)`.

**AO ışın izlemez.** 2.5B bir yükseklik alanında yerel ortalama ile değerin
farkı kadar bilgi taşımaz ve maliyeti kat kat yüksektir. Fark tipik olarak
0.05–0.25 aralığında kaldığı için sabit bir kazançla ölçeklenir; `strength`
böylece 0..1 aralığında anlamlı davranır.

### 4.6 Piksel-uzay son işlem

| `kind`     | Parametreler           | Not                                  |
| ---------- | ---------------------- | ------------------------------------ |
| `outline`  | `px, mode, colorIndex` | `dilate(coverage, px) − coverage`.   |
| `dither`   | `kind, amount`         | `none` · `bayer2/4/8` · `blueNoise`. |
| `quantize` | `mode(ramp · nearest)` | Boru hattının SON renk işlemi.       |

**Dış çizgi.** Modlar `outside` (silüeti büyütür), `inside` (büyütmez) ve
`centered` (tek sayıda kalınlıkta DIŞA fazladan piksel alır — silüetin görsel
ağırlığını korumak, içeriden yemekten daha az bozucudur). Yapısal eleman
KAREdir, yani köşeler 8-komşulukla dolar; piksel sanatının alışılmış dış
çizgisi budur. Çizgi pikselleri rampayı ATLAR ve doğrudan `colorIndex`i alır:
çizgi bir malzeme değil, silüetin kendisi hakkında bir ifadedir.

**Nicemleme iki kip, TEK sıcak döngü.** Her ikisi de malzeme başına 256
girişlik bir GÖLGE TABLOSUNA indirgenir; piksel başına kalan iş bir dizi
okumasıdır. Kipler yalnızca tablonun nasıl kurulduğunda ayrışır:

- `ramp` — gölge doğrudan rampa adımına düşer. Bantlanma BİLİNÇLİdir.
- `nearest` — gölge rampa renkleri ARASINDA OKLab'da ara değer alır, sonra
  PALETİN TAMAMI içinde en yakın renge oturur. Bir malzeme, kendi rampasında
  olmayan bir ara tonu komşu rampadan ödünç alabilir; yüksek çözünürlüklü
  doku bu yüzden pürüzsüz çıkar.

**3B arama tablosu GEREKMEDİ.** Belge 32³ girişlik bir LUT öngörüyordu ve
gerekçesi piksel başına palet taramasının maliyetiydi (2048² × 32 renk =
134M mesafe hesabı). Ama renk kaynağı keyfi bir RGB değil: malzeme başına
TEK BOYUTLU bir eksen, yani gölge. Tek boyutlu tablo hem 4096 kat küçük hem
daha hızlıdır ve aynı maliyeti sıfırlar.

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

Mavi gürültü için **void-and-cluster** (Ulichney) ile 64×64 bir karo süreç
başına bir kez üretilip saklanır. Hash tabanlı "rastgele" bir yaklaşım mavi
gürültü DEĞİLDİR — spektrumu düz olur ve dither kumlu görünür.

Algoritmanın çekirdeği: her adımda ya en SIKI KÜME dağıtılır ya da en BÜYÜK
BOŞLUK doldurulur; ikinci yarıda roller değişip SIFIRLARIN kümesine bakılır.
Tek enerji alanıyla devam etmek deseni ikinci yarıda beyaz gürültüye çevirirdi,
bu yüzden birler ve sıfırlar için AYRI enerji alanı tutulur ve artımlı
güncellenir — her adımda baştan hesaplamak karo başına milyarlarca işlem
demekti.

**İddia ölçülür.** Test, karonun yerel ortalama varyansını aynı boydaki beyaz
gürültüyle karşılaştırır; mavi gürültüde düşük frekans enerjisi üçte birin
altında kalır. Hash tabanlı bir dizi bu testi geçemez.

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

### 5.8 SDF eşiğinin genişliği çözünürlüğe bağlıdır

Bir SDF'yi maskeye çevirirken `smoothstep(+w, −w, d)` kullanılır (mesafe
negatifken içeridedir, yani rampa AZALIR). `w` birim uzayda sabitse 1024²'de
yumuşak, 32²'de tüm şekli yutar; bu yüzden **piksel cinsinden** verilip birim
uzaya çevrilir: `w` yarım pikseldir, yani `1 / min(genişlik, yükseklik)`.
`antialias: false` iken `d <= 0 ? 1 : 0` kullanılır ve `w` hiç devreye girmez.

**Bu dönüşüm boru hattında TEK bir yerde yaşar:** katmanın `source`/`mask`/
`height` alanları kapsamaya çevrilirken (§3). `step` ve `smoothstep`
düğümleri ayrıca vardır ama onlar YAZARIN denetimindedir ve birim uzayda
çalışır; `antialias` onları etkilemez. İkisini karıştırmamak gerekir: biri
sistemin kenar politikası, diğeri belgede yazılan bir ifade.

Piksel biriminin burada birim-uzay adımına sızması D2'ye aykırı değildir:
`antialias`ın tüm varlık sebebi çözünürlüğe bağlı kenar davranışıdır ve D2
"parametrenin hangi tarafta olduğu belirsiz olmasın" der — burada belirsizlik
yok, karar açıkça piksel tarafındadır.

---

## 6. Modül yerleşimi

```
core/src/visual/
  types.ts            SpriteDoc, Layer, FieldNode, Palette
  schema/             parametre şeması + çıktı etki alanı (D11)
    types.ts          ParamSchema, NodeSchema, OutputRule
    generators.ts  domain.ts  buffered.ts  combine.ts
    index.ts          birleştirilmiş kayıt + resolveFieldDomain
  validate.ts         belge doğrulaması — şemayı TÜKETİR
  field/
    space.ts          piksel ↔ birim uzay (D2 koordinat sözleşmesi)
    fn.ts             FieldFn (derlenmiş biçim) + ortak eğri
    buffer.ts         FieldBuffer ayırma/havuzlama
    hash.ts           konumsal karma (gürültü ve serpme kaynağı)
    lattice.ts        gürültü kafesi + döşeme periyodu (§5.2)
    generators.ts     §4.1 — sabit ve gradyanlar
    noise.ts          §4.1 — value / simplex / worley / fbm
    sdf.ts            §4.1 — işaretli mesafe alanları
    patterns.ts       §4.1 — desenler
    domain.ts         §4.2  (ters eşleme burada)
    combine.ts        §4.3
    blend.ts          kapsama/yükseklik harmanlama modları
    coverage.ts       alan → kapsama çevrimi (§5.8'in tek yeri)
    sample.ts         tampon örnekleme (nearest/bilinear, clamp/wrap)
    filter.ts         §4.4  (koşan toplam, monoton kuyruk)
    distance.ts       §5.4  (Felzenszwalb, işaretli)
    warp.ts           §4.2  tamponlu bozma
    scatter.ts        §4.2b damgalama
    evaluate.ts       iki aşamalı derleyici + tohum türetimi (D4, D5)
  shade/
    normal.ts         yükseklikten normal (birim uzayda türev)
    lighting.ts       lambert + ambient + rim
    ao.ts             yerel ortalama farkı
    outline.ts        dilate/erode tabanlı halka maskesi
  color/
    oklab.ts          §5.6
    palette.ts        Palette tipi, kilit kümesi
    generate.ts       §7 palet sentezi (OKLab + gamut kısma)
    dither.ts         §5.5 Bayer + void-and-cluster
    quantize.ts       gölge tabloları + `ramp`/`nearest`
  qa.ts               §9 metrikleri — HEADLESS, dolayısıyla test edilebilir
  render.ts           §3 boru hattı — TEK giriş noktası
  index.ts            barrel (Node-only HİÇBİR ŞEY yok — D8)

core/src/visual/encode/            ← ayrı ALT-YOL, barrel'da değil (D8)
  png.ts              node:zlib ile PNG kodlayıcı + writePng
  artifact.ts         render + QA + PNG için CLI/sunucu ortak girişi

core/scripts/visual-asset.ts       §10.1 CLI (render / validate / qa / palette)
core/scripts/visual-qa.ts          §9 ölçüm aracının İNCE sarmalayıcısı

core/tests/visual/fixtures/*.json  elle yazılmış kanıt belgeleri
core/tests/scripts/                CLI uçtan uca sözleşme testleri
```

İki ayrım kasıtlı:

- **`schema/` ve `validate.ts` ayrı.** Şema veridir; doğrulama onun bir
  tüketicisidir. Agent/CLI introspeksiyonu şemayı doğrulama yürütmeden
  okuyabilir ve tek dosya 1200 satırı aşmaz.
- **Ölçüm `visual/qa.ts` içinde, script'te değil.** Script bir sarmalayıcıdır;
  metrikler çekirdekte olduğu için hem testler hem CLI aynı sayıları taşır.
  D8 ve D12 birlikte bunu gerektirir.

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

Ton kayması `1 − 2t` ile uygulanır: en koyu adım `+hueShift`, en açık adım
`−hueShift` alır. OKLab ton açısında AZALAN yön soğuk yöndür (kırmızıdan
maviye), dolayısıyla negatif kayma gölgeleri soğutur ve aydınlıkları ısıtır.

**Doygunluk gamuta KISILIR, kelepçelenmez.** Gamut dışı iki farklı adım
kelepçe sonrası aynı renge düşer ve rampada görünmez bir tekrar oluşur — beş
adımlık bir rampa dört renk gibi davranır. İkili arama on iki adımda 8-bit
çözünürlüğün altına iner ve her adımın ayrı bir renk kalmasını garanti eder.

**`generate` bir DİZİdir.** Belgenin ilk yazımı tek bir nesne gösteriyordu;
gerçek bir palet birden çok rampa ister. Rampalar renk dizisine sırayla
eklenir ve kimlikleri 0'dan başlar, böylece `material: 0` varsayılanı
sentezlenmiş bir palette de her zaman geçerli olur.

**Palet ya VERİ ya SENTEZdir.** İkisi birlikte verilemez: karıştırmak renk
indekslerini kimin yönettiğini belirsiz yapardı ve belgeyi okuyan da yazan da
hangi indeksin nereye düştüğünü saymak zorunda kalırdı.

### 7.2 Palet kilidi

Nicemleme sonrası çıktıda palet dışı piksel **kalmaz**. `visual-qa` bunu
ölçer; ihlal kapıyı kırar (D6). `nearest` modunda kilit doğal olarak sağlanır;
`ramp` modunda rampa indeksi sınırları kelepçelenir.

Şeffaflık istisnadır: alfa 0 pikseller palet dışı sayılmaz.

---

## 8. Tüketici yüzeyi

**Çekirdek headless'tır (D8); yüzeyler onu çağırır, o hiçbir yüzeyi tanımaz.**
Bir dönem tek ekranlı bir üretim arayüzü vardı ve bu bölüm onu anlatıyordu.
O yüzey üründen kaldırıldı: serbest metinden tarif çıkarmaya çalışan kelime
eşlemesi, kullanıcının yazdığı çoğu isteğe "eşleşme yok" cevabı veriyordu —
arada bir prompt katmanı tutmak, belgeyi doğrudan yazmaktan daha zayıf bir
arayüzdü.

Bugünkü tüketiciler:

| Tüketici         | Ne yapar                                                 | Nasıl bağlanır          |
| ---------------- | -------------------------------------------------------- | ----------------------- |
| Agent            | `SpriteDoc` yazar, render ve QA eder — asıl üretim yolu  | CLI (§10.1)             |
| Katalog          | Agent'ın "ne yazabileceğini" bildiği hazır tarifler      | `visual/catalog.ts`     |
| VOL Asset Studio | Üretilen PNG'yi açar, inceler, piksel düzenler, kaydeder | Dosya sistemi — üretmez |

Asset Studio bu hattın **üreticisi değil tüketicisidir**: çekirdeğe hiç
bağlanmaz, yalnızca çıktısını bir varlık olarak görür. Üretilen varlık
`derived` roldedir; kullanıcının üzerine yaptığı düzenleme post-process
tarifine dönüşür ve belge yeniden üretildiğinde korunur.

### 8.1 Boyut ve çıktı kararları

| Karar     | Sözleşme                                                      |
| --------- | ------------------------------------------------------------- |
| Boyut     | 8..2048 genişlik/yükseklik; çekirdek sınırı `MAX_SIZE = 2048` |
| Bitiş     | Antialias + dither + quantize birlikte değiştirilir           |
| Ana renk  | Sentez paletinin ilk rampası                                  |
| Tohum     | Tam 32-bit işaretli değer, belgeye yazılır                    |
| Varyasyon | Yeni tohum; her katalog tarifinde gerçek RGBA değişir         |

128 bir motor sınırı değildir; kaldırılan arayüzün sabit seçenek listesiydi.

### 8.2 Atomik artefakt zinciri

Tüketici–çekirdek bağı bir açıklama etiketi değildir. Node-only
`createVisualArtifact(doc, options)` şu zincirin **tek** girişidir:

```
doğrulama → renderSprite → measureSprite → encodePng
```

CLI'ın `render` ve `qa` komutlarının ikisi de bu fonksiyonu çağırır; ikinci
bir `renderSprite + encodePng` yolu yoktur. Ayrı yollar zamanla ayrışır ve
"kaydedilen görüntü ile doğrulanan görüntü aynı değil" sınıfını doğurur.

`qa`, PNG'yi geri çözüp aynı belgenin yeniden ürettiği RGBA ile tam tarama
karşılaştırması yapar. `render` hangi ezmelerle çağrıldıysa `qa` da aynılarını
kabul eder — biri `--size`/`--seed` alıp diğeri almazsa ölçeklenmiş çıktı hiç
doğrulanamaz:

```bash
pnpm exec tsx core/scripts/visual-asset.ts render belge.json çıktı.png --size 256
pnpm exec tsx core/scripts/visual-asset.ts qa çıktı.png --doc belge.json --size 256
pnpm exec tsx core/scripts/visual-asset.ts qa çıktı.png --doc belge.json --json
```

Boyutlar tutmadığında rapor ham piksel sayısı değil açık bir
`dimensionMismatch` taşır; eksik bir bayrak, bozuk belge gibi görünmemelidir.

Garanti, aynı Node sürümündeki dosya baytından önce **piksel özdeşliğidir**;
PNG sıkıştırma baytları Node/zlib sürümleri arasında değişebilir (§6).

---

## 9. Ölçüm — `core/src/visual/qa.ts` + `core/scripts/visual-qa.ts`

Ses tarafındaki `audio-qa.ts`'in karşılığı. **İlk turdan itibaren** vardır.
Metrikler çekirdektedir (headless, D8); script yalnızca dosya okur ve
biçimlendirir. Böylece aynı sayılar hem testlerde hem CLI'da görünür
ve metriklerin kendisi test edilebilir.

| Metrik                     | Ne söyler                                | Eşik                        |
| -------------------------- | ---------------------------------------- | --------------------------- |
| **Palet uyumu**            | Palet dışı piksel sayısı                 | **0 olmalı** (alfa 0 hariç) |
| **Dikiş farkı**            | Sarma sınırı farkının iç komşuluğa oranı | `tileable` iken ≤ 3         |
| **Dış çizgi sürekliliği**  | Kenara değip halkası kırpılan piksel     | dışa büyüyen kipte 0        |
| **Kontrast oranı**         | Kullanılan / paletin sunduğu OKLab L     | ≥ 0.3                       |
| **Bantlaşma**              | Gölgenin rampa UÇLARINDA birikme payı    | ≤ 0.9                       |
| **Kullanılan renk sayısı** | Palet gereğinden büyük mü                | rapor                       |
| **Alfa saflığı**           | Kısmi alfa piksel sayısı                 | `antialias:false` iken 0    |

**Dış çizgi sürekliliği neden "tek bileşen" DEĞİL?** Belgenin ilk yazımı
silüetin tek parça olmasını istiyordu. `scatter` bunu geçersiz kıldı: çok
parçalı bir sprite tamamen meşrudur. Halkanın kendisi ise `dilate` gereği her
zaman kapalıdır — tek gerçek kopma biçimi silüetin görüntü KENARINA değmesi
ve halkanın orada çizilecek yer bulamamasıdır. Ölçülen budur; parça sayısı
ayrıntı satırında bilgi olarak raporlanır.

**Kontrast neden ORAN?** Mutlak bir eşik yanlış olurdu: paletin kendisi düz
ise çıktının kontrastlı olması beklenemez. Soru "verilen aralığın ne kadarını
kullandın" — beş adımlık bir rampanın ikisini kullanan bir sprite bu oranın
altına düşer. Palet düzse (L aralığı < 0.05) metrik hiç eklenmez.

**Bantlaşma neden UÇ payı?** "Bir renk çok yer kaplıyor mu" yanlış sorudur;
geniş ve düz bir yüzey meşrudur. §9'un sorduğu, gölgenin rampanın uçlarında
birikip ORTASINI boş bırakması. Yalnızca üç ve daha fazla adımlı rampalar
sayılır; iki adımlı bir rampanın ortası yoktur.

**Dikiş farkı neden ORAN?** Ham fark eşiği yanlış olurdu: dikişsiz bir dokuda
karşı kenarlar EŞİT değildir, döşenmiş düzlemde bir piksel komşudurlar. Doğru
soru "kenar farkı sıfır mı" değil, "kenar farkı sıradan bir komşu farkı gibi
mi". Ölçüm, sarma sınırındaki ortalama farkı tüm komşu sütun/satır çiftlerinin
ortalamasına böler; ölçülen değerler dikişsiz bir dokuda 1'in altında,
döşenmeyen bir gradyanda 60'ın üstünde çıkar.

Metriğin sınırı: DEĞER sürekliliğini ölçer, TÜREV sürekliliğini değil. Merkeze
göre simetrik bir alan (ör. ortalanmış dairesel gradyan) sıfır fark verir ama
döşendiğinde bir kırık gösterir. Bu bilinçlidir — yansımalı döşeme (`repeat`
`mirror` modu) meşru bir tekniktir ve tam olarak böyle davranır.

**Tarama yöntemi: TAM tarama, örnekleme değil.** Tek bir palet dışı piksel tam
olarak örneklemenin kaçıracağı şeydir; 4M pikselin taranması ~50 ms sürer ve
örnekleme burada sahte tasarruf olur. Metrikler tek geçişte birlikte toplanır.

Rapor makine-okunur (`--json`), tıpkı `scripts/quality/report.mjs` gibi.

---

## 10. Agent arayüzü

### 10.1 CLI

```bash
tsx core/scripts/visual-asset.ts render <doc.json> <out.png> [--size 256x384] [--seed 42]
tsx core/scripts/visual-asset.ts validate <doc.json>
tsx core/scripts/visual-asset.ts qa <out.png> --doc <doc.json> [--json]
tsx core/scripts/visual-asset.ts palette <istek.json>      # palet sentezi
```

`--size` ve `--seed` belgeyi **ezmek** içindir: aynı belgeden farklı boyut/
varyant üretmenin yolu budur (D2). `--size` `WxH` ya da tek sayı (kare) kabul
eder; koordinat sözleşmesi merkez-köken + kısa kenar normalizasyonu olduğu için
en-boy oranı değişse de şekiller bozulmaz.

### 10.2 Katalog — agent'ın "ne yazacağını" bilmesi

Parametre şeması **yetmez**; agent neyi arayacağını bilmeli. Uygulanan katalog
metadata ile geçerli başlangıç belgesini aynı kimlikte buluşturur:

```ts
export const VISUAL_PRESET_CATALOG = {
  brushedSurface: {
    category: 'material',
    description: 'Yönlü çizgiler ve düşük kabartmayla işlenmiş yüzey başlangıcı.',
    useCase: 'Directional hard-surface texture, panel or plate base',
    tags: ['metal', 'steel', 'çelik', 'surface', 'yüzey', 'brushed', 'fırçalı'],
    related: ['structureGrid', 'cutMineral'],
  },
};

findVisualPresets({ text: 'mor kristal kaya parçası' }); // ['cutMineral']
createVisualPreset('cutMineral', { size: 128, seed: 42 }); // geçerli SpriteDoc
```

Kategoriler: `material` · `terrain` · `organic` · `liquid` · `mineral` ·
`structure` · `effect`.

**Bu katalog olmadan agent boş bir parametre setine bakar.** Katalog yedi
kategorinin her birinde en az bir başlangıç taşır. Her giriş doğrulanır,
render edilir ve QA kapısını geçer; yani arama sonucu yalnızca açıklama değil
çalışan belgedir.

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
| Yaşam döngüsü                       | ✅         | `DisposableScope` — yüzey listener/timer'larında zorunlu                                                       |
| UI kontrolleri                      | ✅         | `Slider`, `NumberStepper`, `Select`, `SegmentedControl`, `Checkbox`, `Tabs`, `Accordion`, `Tree`, `ScrollView` |
| Node-only izolasyon deseni          | ✅         | `audio/synth/writer` alt-yolu                                                                                  |
| Katalog deseni                      | ✅         | `audio/synth/presets/catalog/`                                                                                 |
| CLI deseni                          | ✅         | `tsx core/scripts/*.ts`                                                                                        |

### 11.2 Turlarda eklenen CORE parçaları

| Parça                    | Neden yok                                 | Nereye                                                                      |
| ------------------------ | ----------------------------------------- | --------------------------------------------------------------------------- |
| **OKLab dönüşümü**       | Depoda renk uzayı matematiği **hiç yok**  | `visual/color/oklab.ts`                                                     |
| **ColorPicker bileşeni** | UI setinde renk kontrolü yok              | `core/src/ui/primitives/ColorPicker.ts` + **vol-ui showcase FORMS sekmesi** |
| **CurveEditor bileşeni** | Eğri verisini görsel düzenlemek için      | `core/src/ui/primitives/CurveEditor.ts` + **vol-ui showcase FORMS sekmesi** |
| **Artefakt hattı**       | Tüketicilerin ayrışmasını engellemek için | `visual/encode/artifact.ts`                                                 |
| **PNG kodlayıcı**        | Raster yazma yok                          | `visual/encode/png.ts` (alt-yol)                                            |

Bu ikisi CORE'a girdiği an [AGENTS.md](../../AGENTS.md) UI kuralı devreye
girer: showcase'e eklenir, README sekme tablosu güncellenir, i18n key paritesi
sağlanır.

### 11.3 Kapılar ve bekçiler

- **`workspace-contract`**: hiçbir paket `typecheck`, `test`,
  `test:coverage` script'leri ve `quality.json`da eşik **olmadan** repoya
  giremez. Taban: 50/50/50/40.
- **`publicSurface`**: `visual/` kök barrel'a `Synth` gibi TEK bir isimle
  (`export * as Visual`) girer, yani kök sayısını yalnızca 1 artırır. Alt
  sistemin kendi yüzeyi kök sayının gölgesinde büyümesin diye AYRICA ve kendi
  başına kilitlenir (`EXPECTED_VISUAL_EXPORT_COUNT`). İki sayı da bilinçli
  olarak güncellenir.
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
- **`visualHeadless`** (Tur 1'de eklendi): `visual/` altındaki hiçbir dosya
  DOM global'ine dokunamaz ve `node:` importu yalnızca `encode/` altında
  bulunabilir; barrel `encode/`i yeniden dışa açamaz. İki sızıntı da sessizdir
  — DOM sızıntısı testlerde (jsdom) görünmez ve yalnızca `tsx` ile asset
  üretilirken patlar; `node:` sızıntısı tarayıcı build'ini kırar.
- **Kapsam**: yeni paket ölçülür; eşikler ölçülen değerin ~2 puan altına
  ratchet'lenir.

### 11.4 i18n

Çekirdek metinsiz çalışır; yüzeylerin metinleri kendi namespace'lerinde,
`tr.json` + `en.json` **key paritesi zorunlu**. Module-level `i18next.t()`
**yasak** (import anında `init()` bitmemiştir; boş string döner) — çağrı build
fonksiyonunun İÇİNDE olur.

---

## 12. Uygulama sırası

Her tur kendi başına yeşil kapıyla kapanır; yarım tur bırakılmaz.

### Tur 1 — Çekirdek iskelet (editörsüz, ölçülebilir) — **TAMAMLANDI**

Hedef: `tsx visual-asset.ts render doc.json out.png` çalışsın.

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

_Kanıt:_ `core/tests/visual/fixtures/` altındaki üç elle yazılmış belge
beklenen PNG'yi üretir; üçünde de palet uyumu 0 ihlal.

Turda ortaya çıkan ve bu belgeye işlenen düzeltmeler: maskenin şekil tarafında
olduğu (§3), katman kaynağının kapsamaya çevrilmesinin etki alanına dayandığı
(§3, §5.8), taban gürültülerde `octaves` bulunmaması gerektiği (§4.1), tohum
yolunun katman kimliğinden türediği (D5) ve determinizm garantisinin piksel
düzeyinde olduğu (D5). Ayrıca `scale` uygulanmış bir SDF'nin artık gerçek
mesafe alanı olmadığı kaydedildi — Tur 2–3'te dış çizgi ve mesafe dönüşümü
bunu hesaba katmalı.

### Tur 2 — Cebiri tamamla — **TAMAMLANDI**

- Kalan üreteçler (worley, simplex, fbm, tüm SDF'ler, desenler)
- Kalan alan-uzayı: `mirror`, `repeat`, `polar`, `warp`, `skew`
- `scatter` (§4.2b) — sınırlayıcı kutu + uzamsal kova optimizasyonuyla
- Kalan birleştiriciler
- Komşuluk filtreleri (koşan toplam bulanıklık, Felzenszwalb DT, morfoloji, edge)
- `tileable` uçtan uca (periyodik gürültü + sarmalı filtre + sarmalı scatter)
- Dikiş farkı metriği

_Kanıt:_ `core/tests/visual/fixtures/tileable.json` 3×3'te dikişsiz; dikiş
farkı oranı 0.91 (sınır 3) ve aynı ölçüm döşenmeyen bir gradyanı 63.0 ile
reddediyor. `scatter.json` sapmalı ızgarayı, dönmeyi ve ölçek sapmasını
gösteriyor.

Turda ortaya çıkan ve bu belgeye işlenen düzeltmeler: `sdf.polygon`
katlamasının kenar ortasına ortalanması gerektiği (§4.1), filtrelerin ağaç
düğümü olduğu (§4.4, §3), filtre yarıçaplarının birim uzayda durduğu (§4.4),
`distance`ın işaretli olması gerektiği (§4.4), `scatter`da kova yerine
damgalama (§4.2b), `mirror`ın `radial-n` yazımının şemaya sığmadığı (§4.2),
`sharpen`ın bir yarıçap taşıması gerektiği (§4.4), döşemenin simplex'i
dışladığı ve fbm döndürmesini kapattığı (§5.1, §5.2), dikdörtgen çıktıda
periyodun eksen başına hesaplandığı (§5.2) ve dikiş metriğinin ham fark değil
ORAN olması gerektiği (§9). Ayrıca §4.1, §4.2 ve §4.4 tabloları kaçırılmamış
`|` yüzünden bozuktu; `·` ayracına geçildi.

### Tur 3 — Biçim ve stil — **TAMAMLANDI**

- `normal`, `lambert`, `rim`, `ao`
- `outline` (üç mod), `dither` (Bayer + mavi gürültü)
- `nearest` nicemleme (OKLab mesafesi)
- Palet sentezi (`generateRamp`, ton kayması + doygunluk kemeri)
- Alt-yığın maskeler (özyineleme, derinlik sınırı 4)
- `materialAlt` + `materialMask`
- Kalan `visual-qa` metrikleri

_Kanıt:_ `tests/visual/style.test.ts` aynı katman gövdesini ve paletini iki
çıktı yapılandırmasıyla render ediyor — 64² + Bayer + `ramp` ile piksel sanatı,
512² + `nearest` ile pürüzsüz doku — ve ikisi de palet uyumlu çıkıyor.
`fixtures/shaded.json` tüm Tur 3 yığınını (sentezlenmiş palet, ışık, AO,
ikinci malzeme, dış çizgi, dither) tek belgede gösteriyor.

Turda ortaya çıkan ve bu belgeye işlenen düzeltmeler: 3B arama tablosunun
gerekmediği (§4.6 — renk kaynağı tek boyutlu), `generate`in dizi olması
gerektiği (§7.1), paletin veri XOR sentez olması (§7.1), doygunluğun
kelepçelenmek yerine kısılması (§7.1), dış çizgi sürekliliğinin "tek bileşen"
değil "kenarda kırpılma" olduğu (§9), kontrastın mutlak değil oran olması
(§9), bantlaşmanın "baskın renk" değil "uç birikme" olması (§9), normal
türevinin birim uzayda alınması (§4.5) ve kenar ışığı üssünün parametre
olmaması (§4.5). Ayrıca §4.6'da aynı paragraf iki kez yazılmıştı; temizlendi.

### Tur 4 — Teknik editör deneyi — **TARİHSEL; ÜRÜNDEN KALDIRILDI**

Tur 4, `SpriteDoc`un DOM üzerinden düzenlenebildiğini ve geliştirme
sunucusunun PNG + JSON yazabildiğini kanıtladı. Bu teknik kanıt değerlidir:
değişmez belge geçmişi, şema doğrulaması, adaptif önizleme, güvenli çıktı
yolları ve CORE UI bileşenleri bu turda sınandı.

Ürün denetimi ise teslim kaydının gerçeği aştığını gösterdi:

- `UIRoot` olay engeli gerçek tarayıcıda kontrolleri pasif bırakıyordu,
- slider DOM'u sürükleme sırasında yeniden kuruluyordu,
- göz/kilit/kanal gibi birçok eylem görünür fakat etkisizdi,
- `domain`, veri rampası ve kayıt geri yükleme iddiaları eksikti,
- katman/ağaç/parametre/palet yüzeyi o arayüzü anlaşılır üreticiden çok yarım
  bir motor editörüne çeviriyordu,
- jsdom testleri CSS hit-testing, font dosyası ve gerçek kaydırma kusurlarını
  yakalamıyordu.

Tur 5 yön kararı bu eksikleri yeni panellerle büyütmek değil, ürün amacına
uymayan yüzeyi sökmektir. Tur 4 kodu bugün çalıştırılan ikinci bir kip değildir;
tarihsel karar ve bulguları bu bölümde tutulur.

### Tur 5 — Tek ekran ürün ve tam kalıntı denetimi — **TAMAMLANDI**

- Yedi kategoride doğrulanan, render edilen ve tohum değişince gerçek RGBA'sı
  değişen katalog tarifleri.
- Tek ekran: canlı niyet, katalog kartları, kamera, 8..2048 boyut,
  piksel/pürüzsüz bitiş, ana renk, tohum, varyasyon, kaydetme ve kayıt açma.
- “Solucan” için eş anlamlılarıyla gerçek prosedürel nesne tarifi; bilinmeyen
  metinde belgeyi değiştirmeyen dürüst sonuç.
- Gelişmiş kip, `Tabs`, katman/ağaç/parametre/palet/kanal panelleri,
  `EditorState`, yol/varsayılan editör yardımcıları, parametre i18n dosyaları
  ve üreticisi tamamen silindi.
- CORE `PinchZoomController`: sol tuş bariyeri, güvenli pointer capture,
  imleç-merkezli wheel zoom, iki parmak merkez hareketi ve tam yaşam döngüsü.
- Artboard + görüntünün birlikte panı, gerçek Sığdır, 2048 çıktıda donmayı
  önleyen adaptif preview sınırı.
- CORE fontlarının Vite çıktısına kopyalanması ve `FontManager` ile Jura /
  Exo 2 yüklenmesi.
- Görünür tam ekran düğmesi + F11; tarayıcı F11'i ayırırsa düğme yedek.
- Node-only `createVisualArtifact`: CLI render/qa'nın ortak
  doğrulama → render → QA → PNG yolu.
- PNG decode + belgeyle tam piksel karşılaştırmalı `qa [--json]` ve palet
  CLI komutu.
- Davranış, piksel, CSS entegrasyonu, font sunumu, kamera, F11, boyut,
  yaşam döngüsü ve i18n regresyon testleri.

_Kanıt:_ O dönem testleri yalnız elemanın DOM'da bulunmasını değil; prompt
sonrası belge/piksel farkını, bilinmeyen promptta değişmezliği, kamera
transformunu, 2048 sınırını ve Fullscreen API çağrısını ölçer. CORE katalog
testi yedi tarifin her tohumda değiştiğini doğrular. CLI uçtan uca denetimi
kaydedilen PNG'de `pixelMismatch: 0` ve bütün QA metriklerinde geçiş verir.

> **Sonraki durum:** Eski tek ekranlı üretim arayüzü Asset Studio
> migrasyonunda tümüyle kaldırıldı; o döneme ait testler de silindi. Kalan
> kanıt yüzeyi CORE katalog/artefakt testleri ile `core/tests/scripts`
> altındaki CLI uçtan uca denetimidir. Bu bölüm tarihsel karar kaydı olarak
> durur, çalışan bir yüzeyi anlatmaz.

---

## 13. Açık kalanlar

Bunlar tamamlanmış gibi sunulmaz; gerçek tüketici veya ölçüm tetiklemeden kod
yazılmaz.

1. **Çoklu çıktı.** Bir belgeden atlas/varyant seti üretmek
   (`--variants 8`) doğal bir istek, fakat `seed` ezmesiyle bugün
   betiklenebilir. Ayrı veri modeli gerçek kullanım çıkınca değerlendirilir.
2. **Normal/height haritası dışa aktarımı.** Motor kanalları zaten üretir;
   dosya sözleşmesi ve tüketicisi çıkınca Node-only artifact hattına eklenir.
3. **Nesne sözlüğünün genişliği.** “Solucan” sözlük mimarisini ve gerçek tarif
   zorunluluğunu kanıtlar. Yeni nesneler yalnız terim ekleyerek katalog
   presetine düşürülmez; her biri piksel testi olan gerçek bir `SpriteDoc`
   tarifi ister.
4. **Web Worker.** Büyük çıktı ana iş parçacığında adaptif önizlemeyle
   sınırlandı. Tipik bir belge 96² hızlı önizlemede bile 24 ms bütçeyi
   tutturamazsa `core/visual` render'ı worker'a taşınır.
5. **Genel amaçlı teknik editör.** Bu çekirdeğin hedefi değildir; prosedürel
   sentez tarifi üretir, elle çizim yüzeyi sunmaz. Piksel düzenleme ayrı bir
   ürünün (VOL Asset Studio) işidir ve çekirdeğe bağlanmaz. Kaldırılan Tur 4
   panelleri sessizce geri eklenmez.

---

## 14. Bu belgeyi değiştirmek

Doktrinler (§1) numaralıdır ve gerekçelidir. Bir doktrini değiştirmek için
**gerekçesinin neden geçersiz olduğunu** yazmak gerekir; "daha kolay olurdu"
yeterli değildir. Kararı değiştiren tur, bu belgeyi aynı turda günceller
([AGENTS.md](../../AGENTS.md) — Doküman gerçeğin gerisine düşürülmez).
