/**
 * `RigMotionModel.update()`'in ürettiği sürekli hareket sinyalleri. Rig ya da
 * yaratık kelime dağarcığı taşımaz.
 */
export interface RigMotionSignals {
  /** [0,1] — hareket niyetinin büyüklüğü, yumuşatılmış. */
  motion01: number;
  /** [0,360) derece — hiç durmadan ilerleyen boşta-salınım fazı. */
  idlePhaseDeg: number;
  /**
   * Radyan — GİRDİ NİYETİNİN yay-yumuşatılmış yönü.
   *
   * Bu, gövdenin yönü DEĞİLDİR. Kendi hareket modeli olan bir tüketici (ivmesi,
   * dönüş tavanı, atılım kilidi olan bir gövde) yönünü zaten kendi taşır ve bu
   * alanı okumamalıdır: iki yay iki defter demektir ve iki defter kaçınılmaz
   * olarak kayar. Alan, kendi gövde fiziği OLMAYAN bir tüketici için vardır —
   * ham niyetten doğrudan pozlanan basit bir rig.
   *
   * Adı bilinçli olarak `intent` ile başlar; `facingRad` diye okunduğunda "asıl"
   * yön sanılıyor ve tam olarak yukarıdaki hataya davetiye çıkarıyordu.
   */
  intentFacingRad: number;
  /** Radyan/saniye — `intentFacingRad` yayının anlık hızı. */
  intentTurnRateRadPerSec: number;
}

/* ------------------------------------------------------------------------ *
 * Rig VARLIK modeli — bir tasarım aracının export ettiği eklemli parça
 * ağacının çalışma zamanı karşılığı.
 *
 * Yukarıdaki sinyaller bir rig'i SÜRER; aşağıdaki tipler onu TANIMLAR. İkisi
 * de aynı modülde yaşar çünkü tüketici (bir oyun) ikisini birlikte kullanır:
 * tanımdan montaj, sinyalden poz.
 *
 * Bu tipler hangi aracın ürettiğini bilmez. `metadata` bir dosyadan gelir;
 * onu yazan araç ayrı bir katmandır ve buraya sızmaz.
 * ------------------------------------------------------------------------ */

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface RigPartMetadata {
  partId: string;
  sourceNodeId: string;
  shapeType: string;
  category: string | null;
  logicalSizePx: Size;
  /**
   * Parçanın rig kökünün yerel uzayındaki sol-üst köşesi. Bir export sheet
   * hücre düzeninden izole edilmiş parçalarda `null` olur - hücre pozisyonu
   * gerçek rig yerleşimi değildir.
   */
  positionPx: Point | null;
  /** Parçanın kendi sol-üst köşesi etrafında, derece cinsinden CCW. */
  rotationDeg: number;
  /**
   * Bu parçanın bağlı olduğu ÜST parçanın `partId`si — eklemlenme (articulation).
   * `null`/verilmemiş ise parça doğrudan rig köküne bağlanır.
   *
   * Render için tek başına yeterlidir: üst parça döndüğünde alt parça da döner
   * (kol → önkol → el). Bir FİZİK rig'i DEĞİLDİR — eklem limiti, kütle, kısıt
   * taşımaz; onlar ayrı bir aşamanın işidir.
   */
  parentPartId?: string | null;
  file: string;
}

/** Rig'in bir önizleme görseli — assemble edilmiş kartın tamamını gösterir. */
export interface RigPreviewMetadata {
  partId: string;
  sourceNodeId: string;
  logicalSizePx: Size;
  file: string;
}

export interface RigMetadata {
  schemaVersion: 1;
  entityId: string;
  domain: string;
  source: {
    penFile: string;
    sheetNodeId: string;
    sheetNodeName: string;
    exportScale: number;
    rootSizePx: Size | null;
  };
  parts: RigPartMetadata[];
  previews: RigPreviewMetadata[];
}

/** Metadata'sı çözümlenmiş texture URL'siyle eşleştirilmiş, yüklenmeye hazır parça. */
export interface RigPartAsset {
  partId: string;
  /** Üst parçanın `partId`si; kök seviyesindeki parçalarda `null`. */
  parentPartId: string | null;
  textureKey: string;
  textureUrl: string;
  logicalSizePx: Size;
  positionPx: Point;
  rotationDeg: number;
}

export interface RigDefinition {
  entityId: string;
  rootSizePx: Size;
  /**
   * Export ölçeği. Sprite'lar bunun tersiyle ölçeklenir: export kanvası gölge
   * payı için pad'lenir, yani texture'ın piksel boyutu
   * `logicalSizePx * exportScale`'den büyüktür.
   */
  exportScale: number;
  /**
   * Alttan üste çizim sırası - kaynak dokümanın child sırasıyla aynı.
   *
   * Sıra AYNI ZAMANDA topolojik olarak geçerlidir: bir parçanın `parentPartId`si
   * listede ondan ÖNCE gelir (`buildRigDefinition` bunu doğrular). Böylece
   * `assembleRig` tek geçişte ağacı kurabilir, ikinci bir sıralama adımı
   * gerekmez.
   */
  parts: RigPartAsset[];
}
