/**
 * Bir görüntü ağacının o kareki DÜNYA pozunun düz kopyası.
 *
 * Bir uzuv zinciri (container içinde container içinde sprite) tek bir görüntü
 * değildir; hayaletini ya da gölgesini çıkarmak için ağacın yaprakları dünya
 * uzayına düzleştirilmelidir. Örnek, kaynağın ömründen bağımsızdır: kaynak o
 * karede değişse bile kopya değişmez.
 */
export interface PoseSample {
  textureKey: string;
  frameName: string | number | undefined;
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  originX: number;
  originY: number;
  alpha: number;
}

interface DecomposedTransform {
  translateX: number;
  translateY: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
}

/** Dünya dönüşümü taşıyan, çözümlenebilir matris. */
export interface PoseTransform {
  decomposeMatrix(): DecomposedTransform;
}

/**
 * `samplePose`in yeniden kullandığı matrisler.
 *
 * Render motoru, argümansız çağrılan bir dünya-matris sorgusunda KARE BAŞINA
 * iki matris ayırır; yetmiş parçalık bir rig'i her karede örnekleyen bir gölge
 * saniyede sekiz binden fazla nesne üretirdi. İlk çağrıda iki matris alınır ve
 * sonraki tüm sorgular onları tüketir. Çağıran yalnız boş bir nesne tutar.
 */
export interface PoseSampleScratch {
  world?: PoseTransform;
  parent?: PoseTransform;
}

/**
 * `Phaser.GameObjects.GameObject`ın bu modülün dokunduğu yüzeyi.
 *
 * Phaser tipine doğrudan bağlanmak, CORE'un fx katmanını bir render motoru
 * örneği olmadan test edilemez hâle getirirdi. Yapısal arayüz gerçek Phaser
 * nesneleriyle birebir uyumludur ve testte sahte bir ağaç kurmayı serbest
 * bırakır.
 */
export interface PoseSourceNode {
  visible?: boolean;
  alpha?: number;
  /** Container ise çocuk listesi; yaprakta yoktur. */
  list?: readonly PoseSourceNode[];
  texture?: { key: string } | null;
  frame?: { name: string | number } | null;
  originX?: number;
  originY?: number;
  getWorldTransformMatrix?: (world?: PoseTransform, parent?: PoseTransform) => PoseTransform;
}

/**
 * Görüntü ağacını dünya uzayına düzleştirir; çizim sırası korunur.
 *
 * Görünmez düğümler ve alt ağaçları atlanır — hayalette görünmeyen bir parçayı
 * göstermek kaynağı yanlış temsil eder. `out` verilirse yeniden kullanılır:
 * her karede örneklenen bir gölge, kare başına dizi ayırmamalıdır.
 */
export function samplePose(
  root: PoseSourceNode,
  out: PoseSample[] = [],
  scratch?: PoseSampleScratch,
): PoseSample[] {
  out.length = 0;
  collect(root, out, scratch);
  return out;
}

function collect(node: PoseSourceNode, out: PoseSample[], scratch?: PoseSampleScratch): void {
  if (node.visible === false) return;

  if (node.list) {
    for (const child of node.list) collect(child, out, scratch);
    return;
  }

  const textureKey = node.texture?.key;
  if (!textureKey || !node.getWorldTransformMatrix) return;

  if (scratch && !scratch.world) {
    // Matrisleri kaynağın kendisinden al: bu modül render motorunun matris
    // tipini bilmez, yalnız çözümleme yüzeyini bilir.
    scratch.world = node.getWorldTransformMatrix();
    scratch.parent = node.getWorldTransformMatrix();
  }
  const transform = node.getWorldTransformMatrix(scratch?.world, scratch?.parent).decomposeMatrix();
  out.push({
    textureKey,
    frameName: node.frame?.name,
    x: transform.translateX,
    y: transform.translateY,
    rotation: transform.rotation,
    scaleX: transform.scaleX,
    scaleY: transform.scaleY,
    originX: node.originX ?? 0.5,
    originY: node.originY ?? 0.5,
    alpha: node.alpha ?? 1,
  });
}
