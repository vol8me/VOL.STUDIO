/**
 * Görsel sentez veri modeli — `core/docs/visual-synthesis.md` §2'nin tip
 * karşılığı.
 *
 * Belgenin tamamı serileştirilebilir JSON'dur (D10): closure, fonksiyon
 * referansı, sınıf örneği taşımaz. Agent'ın yazabilmesi ve farkının gözden
 * geçirilebilmesi buna bağlıdır.
 *
 * **Bu dosya YALNIZCA uygulanmış olanı bildirir.** Envanterin tamamını
 * baştan tipe yazmak, tip denetiminden geçen ama hiçbir şey çizmeyen
 * belgeler üretirdi — palet kilidinin reddettiği "sessiz yalan"ın (D6) tip
 * sistemindeki karşılığı. Doğrulayıcı henüz gelmemiş olanı, hangi turda
 * geleceğini söyleyerek reddeder (bkz. `validate.ts`).
 */

/** Birim uzayda bir nokta ya da bir çift ölçü. */
export type Vec2 = readonly [number, number];

/**
 * Bir alanın ürettiği değerin ANLAMI.
 *
 * - `unit`   — 0..1 aralığında kapsama/yoğunluk.
 * - `signed` — işaretli mesafe; **negatif içeridedir** (§4.1).
 *
 * Ayrım gereklidir çünkü katman kaynağı kapsamaya çevrilirken ikisi farklı
 * davranır: `unit` kelepçelenir, `signed` §5.8'in eşiğinden geçer. Etki alanı
 * düğüm türünden STATİK olarak türetilir; çalışma anında değer "mesafeye
 * benziyor mu" diye yoklanmaz.
 */
export type FieldDomain = 'unit' | 'signed';

/* ── §4.1 Üreteçler: sabit ve gradyanlar ──────────────────────────────── */

/** Sabit alan; maske ve karışım için taban. */
export interface ConstNode {
  kind: 'const';
  value: number;
}

/**
 * Doğrusal gradyan. `angle` derece (D2); `from`/`to` o eksen üzerindeki
 * BİRİM UZAY KONUMLARIdır — değer değil. Değer aralığını değiştirmek
 * `remap`in işidir, gradyanın değil.
 */
export interface LinearGradientNode {
  kind: 'gradient.linear';
  angle: number;
  from: number;
  to: number;
}

/** Dairesel gradyan: merkezde 1, `radius`ta 0. Kubbe/hacim için taban. */
export interface RadialGradientNode {
  kind: 'gradient.radial';
  center?: Vec2;
  radius: number;
}

/**
 * Kutupsal açı gradyanı: merkez etrafında bir tam turda 0→1.
 * `offset` başlangıç açısını derece cinsinden kaydırır.
 */
export interface AngularGradientNode {
  kind: 'gradient.angular';
  center?: Vec2;
  offset?: number;
}

/** Manhattan (eşkenar dörtgen) gradyanı: merkezde 1, `size`ta 0. */
export interface DiamondGradientNode {
  kind: 'gradient.diamond';
  center?: Vec2;
  size: number;
}

/* ── §4.1 Üreteçler: gürültü ──────────────────────────────────────────── */

/**
 * Değer gürültüsü. `freq` = KISA KENAR boyunca hücre sayısı; §5.2'nin döşeme
 * kuralı bu tanıma dayanır (hücre indeksleri periyoda göre sarılır).
 *
 * `seed` verilmezse düğüm yolundan türetilir (D5).
 */
export interface ValueNoiseNode {
  kind: 'noise.value';
  freq: number;
  seed?: number;
}

/**
 * Simplex gürültü — eğik kafes sayesinde eksen yapaylığı düşüktür.
 *
 * **Döşenebilir belgede kullanılamaz:** kafesi eğik olduğu için ızgara sarma
 * uygulanamaz (§5.2). Doğrulayıcı `tileable: true` iken reddeder.
 */
export interface SimplexNoiseNode {
  kind: 'noise.simplex';
  freq: number;
  seed?: number;
}

/** Hücresel (Worley) gürültü. `F2-F1` hücre kenarlarını verir. */
export interface WorleyNoiseNode {
  kind: 'noise.worley';
  freq: number;
  mode?: 'F1' | 'F2' | 'F2-F1';
  seed?: number;
}

/**
 * Kesirli Brown hareketi — oktav toplayıcı SARMALAYICI.
 *
 * `base` herhangi bir BİRİM alandır; oktavlar `lacunarity` ile ölçeklenir,
 * `gain` ile zayıflar ve aralarında sabit bir açıyla DÖNDÜRÜLÜR (§5.1).
 * Döndürme olmazsa oktavlar üst üste binip eksen hizalı yapaylık üretir.
 *
 * Oktav parametresi taban gürültülerde YOKTUR: iki ayrı yol açmamak için
 * toplama yalnızca burada yapılır (D9).
 */
export interface FbmNode {
  kind: 'noise.fbm';
  base: FieldNode;
  octaves: number;
  lacunarity?: number;
  gain?: number;
}

/* ── §4.1 Üreteçler: işaretli mesafe alanları ─────────────────────────── */

export interface CircleSdfNode {
  kind: 'sdf.circle';
  center?: Vec2;
  r: number;
}

/** `half` yarım kenar uzunluklarıdır. */
export interface BoxSdfNode {
  kind: 'sdf.box';
  center?: Vec2;
  half: Vec2;
}

/** Köşesi yuvarlatılmış kutu — `sdf.box`tan türetilemez, ayrı formül (D9). */
export interface RoundBoxSdfNode {
  kind: 'sdf.roundBox';
  center?: Vec2;
  half: Vec2;
  r: number;
}

/** Düzgün n-gen; `rotation` derece. */
export interface PolygonSdfNode {
  kind: 'sdf.polygon';
  center?: Vec2;
  n: number;
  r: number;
  rotation?: number;
}

export interface StarSdfNode {
  kind: 'sdf.star';
  center?: Vec2;
  n: number;
  rOuter: number;
  rInner: number;
  rotation?: number;
}

/** Kalınlığı olan doğru parçası; uçları düz. */
export interface LineSdfNode {
  kind: 'sdf.line';
  a: Vec2;
  b: Vec2;
  thickness: number;
}

/** Uçları yuvarlak kapsül — gövde ve dal için temel. */
export interface CapsuleSdfNode {
  kind: 'sdf.capsule';
  a: Vec2;
  b: Vec2;
  r: number;
}

/** Halka dilimi; `from`/`to` derece. */
export interface ArcSdfNode {
  kind: 'sdf.arc';
  center?: Vec2;
  r: number;
  thickness: number;
  from: number;
  to: number;
}

/* ── §4.1 Üreteçler: desenler ─────────────────────────────────────────── */

/** `size` bir karenin birim uzaydaki kenar uzunluğudur. */
export interface CheckerPatternNode {
  kind: 'pattern.checker';
  size: number;
}

/** `duty` çizgi genişliğinin periyoda oranı; `angle` derece. */
export interface StripesPatternNode {
  kind: 'pattern.stripes';
  freq: number;
  angle?: number;
  duty?: number;
}

/** `r` nokta yarıçapının hücre yarı genişliğine oranı (0..1). */
export interface DotsPatternNode {
  kind: 'pattern.dots';
  freq: number;
  r: number;
}

/** `thickness` çizgi kalınlığının hücre genişliğine oranı (0..1). */
export interface GridPatternNode {
  kind: 'pattern.grid';
  freq: number;
  thickness: number;
}

/** Altıgen döşeme; hücre merkezine yakınlık verir. */
export interface HexPatternNode {
  kind: 'pattern.hex';
  freq: number;
}

export type GeneratorNode =
  | ConstNode
  | LinearGradientNode
  | RadialGradientNode
  | AngularGradientNode
  | DiamondGradientNode
  | ValueNoiseNode
  | SimplexNoiseNode
  | WorleyNoiseNode
  | FbmNode
  | CircleSdfNode
  | BoxSdfNode
  | RoundBoxSdfNode
  | PolygonSdfNode
  | StarSdfNode
  | LineSdfNode
  | CapsuleSdfNode
  | ArcSdfNode
  | CheckerPatternNode
  | StripesPatternNode
  | DotsPatternNode
  | GridPatternNode
  | HexPatternNode;

/* ── §4.2 Alan-uzayı işlemleri ────────────────────────────────────────── */

/**
 * Alan-uzayı işlemleri iki biçimde yazılır ve İKİSİ DE aynı parametreleri
 * taşır: ağaç düğümü olarak (`input` ile, bir alt ifadeye uygulanır) ya da
 * katmanın `domain` dizisinde (§2, `source`a uygulanır).
 *
 * Parametreler tek yerde tanımlıdır; `...Node` biçimi `...Op`a `input`
 * ekler. İki ayrı tanım tutmak ikisinin ayrışmasına davetiye olurdu.
 */
export interface TranslateOp {
  kind: 'translate';
  x: number;
  y: number;
}

/** `angle` derecedir (D2); +y aşağı olduğu için pozitif açı saat yönündedir. */
export interface RotateOp {
  kind: 'rotate';
  angle: number;
  center?: Vec2;
}

/** Bileşenler ayrı verilir → anizotropik esnetme. Sıfır ölçek reddedilir. */
export interface ScaleOp {
  kind: 'scale';
  x: number;
  y: number;
  center?: Vec2;
}

/** Kesme (shear); `x` y'ye bağlı yatay kayma, `y` x'e bağlı dikey kayma. */
export interface SkewOp {
  kind: 'skew';
  x: number;
  y: number;
}

/**
 * Simetri katlaması — bu sistemin genelliğinin ana kaynaklarından biri.
 *
 * `radial-n` yazımı yerine `axis: 'radial'` + `count` kullanılır: D11
 * parametrelerin TİPLİ bildirilmesini ister ve içine sayı gömülmüş bir dizgi
 * ne doğrulanabilir ne de editörde kontrol üretebilir.
 */
export interface MirrorOp {
  kind: 'mirror';
  axis: 'x' | 'y' | 'quad' | 'radial';
  /** Yalnızca `radial` için: kaç kollu simetri. */
  count?: number;
}

/** Döşeme; `mirror` modu komşu hücreleri yansıtarak dikişi gizler. */
export interface RepeatOp {
  kind: 'repeat';
  count: number;
  mode?: 'tile' | 'mirror';
  center?: Vec2;
}

/**
 * Kutupsal dönüşüm — halka, spiral, dişli, girişim deseni.
 *
 * İleri yönde çıktı noktasının açısı x'e, yarıçapı y'ye eşlenir; `inverse`
 * bunun tersidir ve ikisi birbirini götürür.
 */
export interface PolarOp {
  kind: 'polar';
  center?: Vec2;
  inverse?: boolean;
}

export type DomainOp = TranslateOp | RotateOp | ScaleOp | SkewOp | MirrorOp | RepeatOp | PolarOp;

export type TranslateNode = TranslateOp & { input: FieldNode };
export type RotateNode = RotateOp & { input: FieldNode };
export type ScaleNode = ScaleOp & { input: FieldNode };
export type SkewNode = SkewOp & { input: FieldNode };
export type MirrorNode = MirrorOp & { input: FieldNode };
export type RepeatNode = RepeatOp & { input: FieldNode };
export type PolarNode = PolarOp & { input: FieldNode };

export type DomainNode =
  | TranslateNode
  | RotateNode
  | ScaleNode
  | SkewNode
  | MirrorNode
  | RepeatNode
  | PolarNode;

/* ── Tamponlu düğümler: warp, scatter, komşuluk filtreleri ────────────── */

/**
 * Bozma — organik doku (mermer, duman, damar, akıntı) için.
 *
 * `by` alanı önce TAMPONA yazılır (D4, Aşama 2), sonra ondan örneklenir;
 * saf fonksiyon olarak yazılamamasının sebebi budur. Tek skaler alandan iki
 * eksenlik kayma türetmek için tampon iki farklı noktadan okunur
 * (bkz. `warp.ts`).
 */
export interface WarpNode {
  kind: 'warp';
  by: FieldNode;
  input: FieldNode;
  /** Azami kayma, BİRİM uzayda. */
  amount: number;
  sample?: 'nearest' | 'bilinear';
}

/**
 * Serpme — alan-uzayı işlemi DEĞİL, örnekleme işlemi (§4.2b).
 *
 * Bir alan-uzayı işlemi tek bir çıktı noktasını tek bir girdi noktasına
 * götürür ve tersi vardır; `scatter` bir çıktı noktasına N aday demektir.
 * Yanlış kategoride durması, ters dönüşümü varmış gibi uygulanmasına yol
 * açardı.
 */
export interface ScatterNode {
  kind: 'scatter';
  source: FieldNode;
  count: number;
  seed?: number;
  /** Düzenli ızgaradan sapma oranı (0 = tam ızgara, 1 = hücre boyu kadar). */
  jitter?: number;
  /** Azami dönme sapması, DERECE. */
  rotJitter?: number;
  /** Azami ölçek sapması oranı (0.2 → 0.8x–1.2x). */
  scaleJitter?: number;
}

/**
 * Komşuluk filtreleri — Aşama 2 (§4.4).
 *
 * Komşu piksel okurlar, dolayısıyla `(x,y)`nin saf fonksiyonu olarak
 * yazılamazlar. Girdileri hedef çözünürlükte bir tampona yazılır ve sonuç o
 * tampon üzerinde hesaplanır.
 *
 * **Yarıçaplar BİRİM uzaydadır**, piksel değil: §3'e göre bu adım parametre
 * sınırının birim tarafındadır. Piksel yarıçapı aynı belgeyi 64² ve 512²'de
 * bambaşka gösterirdi.
 */
export interface BlurNode {
  kind: 'blur';
  input: FieldNode;
  radius: number;
  mode?: 'box' | 'gauss';
}

export interface SharpenNode {
  kind: 'sharpen';
  input: FieldNode;
  amount: number;
  radius?: number;
}

export interface DilateNode {
  kind: 'dilate';
  input: FieldNode;
  radius: number;
}

export interface ErodeNode {
  kind: 'erode';
  input: FieldNode;
  radius: number;
}

/** Sobel gradyan büyüklüğü. */
export interface EdgeNode {
  kind: 'edge';
  input: FieldNode;
}

/**
 * Mesafe dönüşümü — `threshold` üstü "içeri" sayılır.
 *
 * Çıktı İŞARETLİDİR ve birim uzaydadır: içeride negatif, dışarıda pozitif.
 * İşaretsiz bırakmak alanı `min`/`max` ile birleştirilemez yapardı; işaretli
 * olması onu bir SDF üreticisi hâline getirir ve mevcut cebre bağlar (D9).
 */
export interface DistanceNode {
  kind: 'distance';
  input: FieldNode;
  threshold?: number;
}

export type BufferedNode =
  | WarpNode
  | ScatterNode
  | BlurNode
  | SharpenNode
  | DilateNode
  | ErodeNode
  | EdgeNode
  | DistanceNode;

/* ── §4.3 Birleştiriciler ─────────────────────────────────────────────── */

/**
 * İki alanlı aritmetik. `min`/`max` SDF'de kesişim/birleşim demektir —
 * ayrı bir boolean primitifi gerekmez (D9).
 */
export interface BinaryNode {
  kind: 'add' | 'sub' | 'mul' | 'min' | 'max' | 'screen' | 'overlay';
  a: FieldNode;
  b: FieldNode;
}

/** Doğrusal karışım; `t` sabittir (§4.3 `mix(t)`). */
export interface MixNode {
  kind: 'mix';
  a: FieldNode;
  b: FieldNode;
  t: number;
}

/** Sert eşik: `input >= edge ? 1 : 0`. Çözünürlükten bağımsızdır. */
export interface StepNode {
  kind: 'step';
  edge: number;
  input: FieldNode;
}

/** Yumuşak eşik; `e0 > e1` verilerek azalan rampa elde edilir. */
export interface SmoothstepNode {
  kind: 'smoothstep';
  e0: number;
  e1: number;
  input: FieldNode;
}

export interface RemapNode {
  kind: 'remap';
  input: FieldNode;
  inMin: number;
  inMax: number;
  outMin: number;
  outMax: number;
}

/** Parçalı doğrusal aktarım eğrisi; noktalar x'e göre artan sırada. */
export interface CurveNode {
  kind: 'curve';
  input: FieldNode;
  points: readonly Vec2[];
}

export interface ClampNode {
  kind: 'clamp';
  input: FieldNode;
  min: number;
  max: number;
}

/** Mutlak değer — bir SDF'yi konture çevirmenin yolu (§4.1). */
export interface AbsNode {
  kind: 'abs';
  input: FieldNode;
}

/** `1 − x`; kapsama alanlarını tersine çevirir. */
export interface InvertNode {
  kind: 'invert';
  input: FieldNode;
}

export type CombineNode =
  | BinaryNode
  | MixNode
  | StepNode
  | SmoothstepNode
  | RemapNode
  | CurveNode
  | ClampNode
  | AbsNode
  | InvertNode;

export type FieldNode = GeneratorNode | DomainNode | BufferedNode | CombineNode;

/** `FieldNode` birleşiminde geçen tüm `kind` değerleri. */
export type FieldKind = FieldNode['kind'];

/* ── Katman ve belge ──────────────────────────────────────────────────── */

/** Kapsama harmanlama modları (§2). */
export type CoverageBlend = 'over' | 'max' | 'min' | 'add' | 'sub' | 'mul' | 'screen' | 'replace';

/**
 * Yükseklik harmanlama modları. Kapsamadan AYRI olması gerekir: iki katman
 * `max` ile birleşirken kapsama birleşmelidir ama yükseklik toplanmalı
 * olabilir (üst üste binen kabartma). Tek mod ikisini de doğru yapamaz (§3).
 */
export type HeightBlend = 'max' | 'min' | 'add' | 'mul' | 'replace';

/**
 * Maske olarak kullanılan ALT-YIĞIN (D10).
 *
 * Katmanların tam cebri maske içinde de kullanılabilsin diye özyinelemelidir;
 * derinlik sınırlıdır (bkz. `MAX_STACK_DEPTH`) çünkü hem bellek bütçesi (D7)
 * hem editörde gezilebilirlik sonsuz derinliği öngörülemez yapardı.
 */
export interface LayerStack {
  layers: readonly LayerSpec[];
}

export interface LayerSpec {
  /** Tohum türetiminde kullanılır (D5) — bu yüzden belge içinde benzersizdir. */
  id: string;
  source: FieldNode;
  /** `source`a sırayla uygulanan alan-uzayı zinciri; `[A, B]` ≡ `B(A(source))`. */
  domain?: readonly DomainOp[];
  /** Kapsamayı çarpan alan ya da alt-yığın. */
  mask?: FieldNode | LayerStack | null;
  /** AYRI yükseklik alanı; verilmezse `source` kullanılır (§3). */
  height?: FieldNode | null;
  blend?: CoverageBlend;
  heightBlend?: HeightBlend;
  opacity?: number;
  /** Yazılacak rampa kimliği. */
  material?: number;
  /** İkinci rampa; `materialMask` eşiği aşınca yazılır. */
  materialAlt?: number;
  /** Hangi malzemenin yazılacağını seçen alan (aşınma, pas, damar). */
  materialMask?: FieldNode | null;
  /** `materialMask` bu değeri aşınca `materialAlt` yazılır. */
  materialThreshold?: number;
  /** Malzeme yazımı için KAPSAMA eşiği — opaklık değil (§3). */
  materialThresholdCoverage?: number;
}

/** Palet verisi (D6): motor asla renk sabiti taşımaz. */
export interface RampSpec {
  id: number;
  name?: string;
  /** `colors` dizisine indeksler; sırası koyudan açığa. */
  indices: readonly number[];
}

/** Sentezlenecek bir rampanın isteği (§7.1). */
export interface GenerateRampSpec {
  /** `#rrggbb` — rampanın ton ve doygunluk kaynağı. */
  base: string;
  steps: number;
  /** DERECE. Negatif = gölgeler soğur, aydınlıklar ısınır. */
  hueShift?: number;
  satCurve?: 'flat' | 'arch' | 'rise';
  lightRange?: readonly [number, number];
  name?: string;
}

/**
 * Palet ya DOĞRUDAN VERİ ya da SENTEZ İSTEĞİdir — ikisi bir arada olamaz.
 *
 * Karıştırmak renk indekslerinin kimin tarafından yönetildiğini belirsiz
 * yapardı; belgeyi okuyan da yazan da hangi indeksin nereye düştüğünü
 * saymak zorunda kalırdı.
 */
export interface PaletteSpec {
  /** `#rrggbb` biçiminde renkler. */
  colors?: readonly string[];
  ramps?: readonly RampSpec[];
  generate?: readonly GenerateRampSpec[];
}

export interface QuantizeSpec {
  /**
   * - `ramp` — gölge doğrudan rampa adımına düşer; bantlanma bilinçlidir.
   * - `nearest` — rampa içinde ara değer alınıp PALETİN TAMAMINDA en yakın
   *   renge oturulur; yüksek çözünürlüklü doku için.
   */
  mode: 'ramp' | 'nearest';
}

export interface AoSpec {
  /** BİRİM uzayda yarıçap. */
  radius: number;
  strength: number;
}

/**
 * Gölgeleme yapılandırması — §4.5.
 *
 * Verilmezse gölge YÜKSEKLİĞİN KENDİSİdir; bu, yükseklik kanalını ışık
 * modeli olmadan da görünür kılar ve basit belgeleri basit tutar.
 */
export interface ShadeSpec {
  /** Işık yönü; normalize edilir. +y aşağı, +z izleyiciye doğru. */
  light?: readonly [number, number, number];
  /** Yayınık ışığın katkısı. */
  strength?: number;
  /** Taban aydınlık — gölgede kalan yüzeyin alt sınırı. */
  ambient?: number;
  /** Kenar ışığı şiddeti; silüeti zeminden ayırır. */
  rim?: number;
  /** Yüzey eğiminden türetilen kabartma şiddeti. */
  relief?: number;
  ao?: AoSpec | null;
}

export interface OutlineSpec {
  /** PİKSEL cinsinden kalınlık (D2 — son işlem piksel uzayındadır). */
  px: number;
  mode?: 'outside' | 'inside' | 'centered';
  /** Palet renk indeksi; çizgi bir malzeme değildir. */
  colorIndex?: number;
}

export interface DitherSpec {
  kind: 'none' | 'bayer2' | 'bayer4' | 'bayer8' | 'blueNoise';
  amount?: number;
}

export interface PostSpec {
  outline?: OutlineSpec | null;
  dither?: DitherSpec | null;
  quantize?: QuantizeSpec;
}

export interface SpriteDoc {
  schemaVersion: 1;
  /** `[genişlik, yükseklik]` piksel. Kare olmak zorunda değildir. */
  size: readonly [number, number];
  seed: number;
  /** Periyodik gürültü + sarmalı filtre + sarmalı serpme (§5.2). */
  tileable?: boolean;
  /** Birim uzayda kenar yumuşatma (§5.8). */
  antialias?: boolean;
  palette: PaletteSpec;
  layers: readonly LayerSpec[];
  shade?: ShadeSpec;
  post?: PostSpec;
}
