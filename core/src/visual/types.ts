/**
 * Görsel sentez veri modeli — `core/docs/visual-synthesis.md` §2'nin tip
 * karşılığı.
 *
 * Belgenin tamamı serileştirilebilir JSON'dur (D10): closure, fonksiyon
 * referansı, sınıf örneği taşımaz. Agent'ın yazabilmesi ve farkının gözden
 * geçirilebilmesi buna bağlıdır.
 *
 * **Bu dosya YALNIZCA uygulanmış olanı bildirir.** Envanterin tamamını
 * (§4) baştan tipe yazmak, tip denetiminden geçen ama hiçbir şey çizmeyen
 * belgeler üretirdi — palet kilidinin reddettiği "sessiz yalan"ın (D6) tip
 * sistemindeki karşılığı. Sonraki turlar tipi büyütür; doğrulayıcı o ana
 * kadar hangi turda geleceğini söyleyerek reddeder (bkz. `schema.ts`).
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
 * davranır: `unit` kelepçelenir, `signed` §5.8'in eşik dönüşümünden geçer.
 * Etki alanı düğüm türünden STATİK olarak türetilir; çalışma anında
 * değer "mesafeye benziyor mu" diye yoklanmaz.
 */
export type FieldDomain = 'unit' | 'signed';

/* ── §4.1 Üreteçler (birim uzay → skaler) ─────────────────────────────── */

/** Sabit alan; maske ve karışım için taban. */
export interface ConstNode {
  kind: 'const';
  value: number;
}

/**
 * Değer gürültüsü. `freq` = KISA KENAR boyunca hücre sayısı (§5.2 döşeme
 * kuralı bu tanıma dayanır: `tileable` iken hücre indeksleri `mod freq`).
 *
 * `seed` verilmezse düğüm yolundan türetilir (D5).
 */
export interface ValueNoiseNode {
  kind: 'noise.value';
  freq: number;
  seed?: number;
}

/**
 * Doğrusal gradyan. `angle` derece (D2); `from`/`to` o eksen üzerindeki
 * BİRİM UZAY KONUMLARIdır — değer değil. Değer aralığını değiştirmek
 * `remap`in işidir (§4.3), gradyanın değil.
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
  center: Vec2;
  radius: number;
}

/** Daire işaretli mesafesi. */
export interface CircleSdfNode {
  kind: 'sdf.circle';
  center: Vec2;
  r: number;
}

/** Kutu işaretli mesafesi. `half` yarım kenar uzunluklarıdır. */
export interface BoxSdfNode {
  kind: 'sdf.box';
  center: Vec2;
  half: Vec2;
}

export type GeneratorNode =
  | ConstNode
  | ValueNoiseNode
  | LinearGradientNode
  | RadialGradientNode
  | CircleSdfNode
  | BoxSdfNode;

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

export type DomainOp = TranslateOp | RotateOp | ScaleOp;

export type TranslateNode = TranslateOp & { input: FieldNode };
export type RotateNode = RotateOp & { input: FieldNode };
export type ScaleNode = ScaleOp & { input: FieldNode };

export type DomainNode = TranslateNode | RotateNode | ScaleNode;

/* ── §4.3 Birleştiriciler ─────────────────────────────────────────────── */

/**
 * İki alanlı aritmetik. `min`/`max` SDF'de kesişim/birleşim demektir —
 * ayrı bir boolean primitifi gerekmez (D9).
 */
export interface BinaryNode {
  kind: 'add' | 'mul' | 'min' | 'max';
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

export type CombineNode = BinaryNode | MixNode | StepNode | SmoothstepNode;

export type FieldNode = GeneratorNode | DomainNode | CombineNode;

/** `FieldNode` birleşiminde geçen tüm `kind` değerleri. */
export type FieldKind = FieldNode['kind'];

/* ── Katman ve belge ──────────────────────────────────────────────────── */

/** Kapsama harmanlama modları (§2). */
export type CoverageBlend = 'over' | 'max' | 'min' | 'add' | 'sub' | 'mul' | 'screen' | 'replace';

/**
 * Yükseklik harmanlama modları. Kapsamadan AYRI olması gerekir: iki katman
 * `max` ile birleşirken kapsama birleşmeli ama yükseklik toplanmalı olabilir
 * (üst üste binen kabartma). Tek mod ikisini de doğru yapamaz (§3).
 */
export type HeightBlend = 'max' | 'min' | 'add' | 'mul' | 'replace';

export interface LayerSpec {
  /** Tohum türetiminde kullanılır (D5) — bu yüzden belge içinde benzersizdir. */
  id: string;
  source: FieldNode;
  /** `source`a sırayla uygulanan alan-uzayı zinciri; `[A, B]` ≡ `B(A(source))`. */
  domain?: readonly DomainOp[];
  /** Kapsamayı çarpan alan. Alt-yığın biçimi Tur 3'te gelir. */
  mask?: FieldNode | null;
  /** AYRI yükseklik alanı; verilmezse `source` kullanılır (§3). */
  height?: FieldNode | null;
  blend?: CoverageBlend;
  heightBlend?: HeightBlend;
  opacity?: number;
  /** Yazılacak rampa kimliği. */
  material?: number;
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

export interface PaletteSpec {
  /** `#rrggbb` biçiminde renkler. */
  colors: readonly string[];
  ramps: readonly RampSpec[];
}

export interface QuantizeSpec {
  /** Tur 1'de yalnızca `ramp`; `nearest` Tur 3'te gelir. */
  mode: 'ramp';
}

export interface PostSpec {
  quantize?: QuantizeSpec;
}

export interface SpriteDoc {
  schemaVersion: 1;
  /** `[genişlik, yükseklik]` piksel. Kare olmak zorunda değildir. */
  size: readonly [number, number];
  seed: number;
  /** Tur 2'de uygulanacak; şimdilik yalnızca `false` kabul edilir. */
  tileable?: boolean;
  /** Birim uzayda kenar yumuşatma (§5.8). */
  antialias?: boolean;
  palette: PaletteSpec;
  layers: readonly LayerSpec[];
  post?: PostSpec;
}
