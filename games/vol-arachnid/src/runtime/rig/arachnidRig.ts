import type Phaser from 'phaser';
import type { AssembledRig, RigMetadata, RigPartMetadata } from '@volstudio/core';
import {
  BODY_SHELL_PART_IDS,
  GAZE_PART_ID,
  LIMB_CHAINS,
  SNOUT_PART_IDS,
  type LimbChainSpec,
} from '@/config/rig';

const DEG = Math.PI / 180;

/**
 * Sürülebilir bir uzuv: opsiyonel SABİT bir kök kemik, ardından iki kemikli
 * ters kinematik çifti ve ucunda kozmetik bir uç parça.
 *
 * Uzunluklar kaynak sanatın ÖLÇÜLMÜŞ eklem aralıklarıdır; parça genişliği
 * değildir (bitişik parçalar birbirinin üstüne birkaç piksel biner).
 *
 * **Kök kemik neden opsiyonel?** Sabit kök, üç eklemli zincirdeki çözüm
 * belirsizliğini kapatır ve uzvu gövdeye bağlı bir dizilimde tutar. Bacaklarda
 * doğru seçimdir: kök EN KISA kemiktir (36 px), iş uzun femur/tibia'dadır.
 * Arka itici uzuvlarda sıralama TERSTİR — kök 50 px, kalan iki kemik 26 ve 12.
 * Orada kök sabitlenirse uzun kemik hiç dönmez: ayak duruş EKSENİ boyunca
 * gidip geldiği için açı neredeyse değişmez, yalnız mesafe değişir ve uzuv
 * salınmak yerine SÜRÜKLENİR. Bu yüzden arka uzuvlarda kök kemik doğrudan
 * IK çiftinin ilk kemiğidir.
 */
export interface LimbRig {
  id: string;
  /** Gövde merkezine göre kalça eklemi. */
  hipX: number;
  hipY: number;
  /** Sabit kök kemik; yoksa IK doğrudan kalçadan başlar. */
  root: Phaser.GameObjects.Container | null;
  rootLength: number;
  upperLength: number;
  /** Alt kemik + uç parça: ters kinematik bunları TEK kemik sayar. */
  lowerLength: number;
  upper: Phaser.GameObjects.Container;
  lower: Phaser.GameObjects.Container;
  /** Uç parça; yalnız bilek kıvrımı alır, IK çözümüne girmez. */
  tip: Phaser.GameObjects.Container | null;
}

export interface ArachnidRig {
  limbs: LimbRig[];
  /** Uzuvlarla birlikte hareket etmeyen kabuk parçaları. */
  shellParts: Phaser.GameObjects.Container[];
  /** Öne bakan uç parçalar — dönüşe önden yatarlar. */
  snoutParts: Phaser.GameObjects.Container[];
  /** Bakışı taşıyan parça. */
  gazePart: Phaser.GameObjects.Container;
  /** Gövde merkezinin metadata uzayındaki konumu — yerel uzayın orijini. */
  bodyCenterX: number;
  bodyCenterY: number;
}

function localToRig(part: RigPartMetadata, lx: number, ly: number): { x: number; y: number } {
  const r = part.rotationDeg * DEG;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const pos = part.positionPx;
  if (!pos) throw new Error(`${part.partId}: positionPx yok`);
  return { x: pos.x + lx * cos - ly * sin, y: pos.y + lx * sin + ly * cos };
}

const boneStart = (p: RigPartMetadata) => localToRig(p, 0, p.logicalSizePx.height / 2);
const boneEnd = (p: RigPartMetadata) =>
  localToRig(p, p.logicalSizePx.width, p.logicalSizePx.height / 2);
const centerOf = (p: RigPartMetadata) =>
  localToRig(p, p.logicalSizePx.width / 2, p.logicalSizePx.height / 2);

const distance = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Bir pivot container'ının DÖNME ORİJİNİNİ, dünya konumlarını bozmadan kendi
 * yerel `(lx, ly)` noktasına taşır.
 *
 * `assembleRig` her parçayı sol-üst köşesinden döndürür (kaynak belgenin
 * sözleşmesi). Bir kemik ise eklemden dönmelidir; eklemden birkaç piksel kayan
 * bir dönme merkezi, uzuv açıldıkça zinciri görünür biçimde kopardı. Pivot
 * ileri kaydırılır, çocukları aynı miktarda geri kaydırılır: net etki sıfır,
 * dönme merkezi eklemin üstünde.
 *
 * Alt kemikler artık pivotun ÇOCUĞU olduğu için onlar da birlikte kayar;
 * zincirin geri kalanı ayrıca düzeltilmez.
 */
function recenterPivot(pivot: Phaser.GameObjects.Container, lx: number, ly: number): void {
  const cos = Math.cos(pivot.rotation);
  const sin = Math.sin(pivot.rotation);
  pivot.x += lx * cos - ly * sin;
  pivot.y += lx * sin + ly * cos;
  for (const child of pivot.list) {
    if (!hasPosition(child)) throw new Error('pivot yalnız konum taşıyan çocuklar içerebilir');
    child.x -= lx;
    child.y -= ly;
  }
}

function hasPosition(
  child: Phaser.GameObjects.GameObject,
): child is Phaser.GameObjects.GameObject & { x: number; y: number } {
  return 'x' in child && 'y' in child && typeof child.x === 'number' && typeof child.y === 'number';
}

function requirePart(metadata: RigMetadata, partId: string): RigPartMetadata {
  const part = metadata.parts.find((p) => p.partId === partId);
  if (!part) throw new Error(`rig'de "${partId}" parçası yok`);
  return part;
}

function requireContainer(rig: AssembledRig, partId: string): Phaser.GameObjects.Container {
  const container = rig.parts.get(partId);
  if (!container) throw new Error(`assembleRig "${partId}" container'ını üretmedi`);
  return container;
}

/**
 * Kemik pivotunu kendi kemik ekseninin BAŞINA taşır; sanat pivotun yerel +x
 * yönünde uzanır.
 */
function anchorBone(
  assembled: AssembledRig,
  part: RigPartMetadata,
  offsetX = 0,
): Phaser.GameObjects.Container {
  const container = requireContainer(assembled, part.partId);
  recenterPivot(container, offsetX, part.logicalSizePx.height / 2);
  return container;
}

/** Kaynak yerleşimi doğru olan zincir: eklem aralıkları olduğu gibi ölçülür. */
function buildAuthoredLimb(
  metadata: RigMetadata,
  assembled: AssembledRig,
  spec: LimbChainSpec,
  bodyCenter: { x: number; y: number },
): LimbRig {
  const shoulderPart = requirePart(metadata, spec.shoulderPartId);
  const upperPart = requirePart(metadata, spec.upperPartId);
  const lowerPart = requirePart(metadata, spec.lowerPartId);
  const tipPart = spec.tipPartId ? requirePart(metadata, spec.tipPartId) : null;

  const hip = boneStart(shoulderPart);
  const knee1 = boneStart(upperPart);
  const knee2 = boneStart(lowerPart);
  const foot = boneEnd(tipPart ?? lowerPart);

  return {
    id: spec.id,
    hipX: hip.x - bodyCenter.x,
    hipY: hip.y - bodyCenter.y,
    rootLength: distance(hip, knee1),
    upperLength: distance(knee1, knee2),
    lowerLength: distance(knee2, foot),
    // Zincir kökten uca doğru sabitlenir; her pivot kendi ekleminin üstüne
    // oturur ve çocuk kemikler ebeveynle birlikte taşınır.
    root: anchorBone(assembled, shoulderPart),
    upper: anchorBone(assembled, upperPart),
    lower: anchorBone(assembled, lowerPart),
    tip: tipPart ? anchorBone(assembled, tipPart) : null,
  };
}

/**
 * Kaynak yerleşimi TERS dizilmiş zincir (bkz. `LimbChainSpec.sourceChainReversed`).
 *
 * Kemik boyları kaynaktaki eklem aralıklarının ters sırasıdır: uzuv fiziksel
 * boyunu birebir korur, yalnız hangi parçanın hangi kemiği çizdiği değişir.
 * Parça konumları kaynaktan MİRAS ALINMAZ — sıra değiştiği için miras alınan
 * konumlar zinciri kopuk bırakırdı; her pivot doğrudan kendi ekleminin üstüne
 * yazılır.
 */
function buildRebuiltLimb(
  metadata: RigMetadata,
  assembled: AssembledRig,
  spec: LimbChainSpec,
  bodyCenter: { x: number; y: number },
): LimbRig {
  const shoulderPart = requirePart(metadata, spec.shoulderPartId);
  const upperPart = requirePart(metadata, spec.upperPartId);
  const lowerPart = requirePart(metadata, spec.lowerPartId);

  // Kaynak dizilimi, gövdeye en yakından en uzağa: lower(tip) → upper → shoulder.
  const sourceSpacing = [
    distance(boneEnd(lowerPart), boneEnd(upperPart)),
    distance(boneEnd(upperPart), boneEnd(shoulderPart)),
    distance(boneEnd(shoulderPart), boneStart(shoulderPart)),
  ];

  /*
   * Kalça, KÖK KEMİĞİN gövdeye bakan ucudur.
   *
   * Kaynak zincirin en iç noktası (ok ucunun ucu) gövde merkezine 30 px
   * mesafededir; oradan başlayan bir uzuv boyunun yarısını kabuğun altında
   * harcar ve dışarıda bir çıkıntı olarak okunur. Kök kemiğin iç ucu ise
   * kabuğun alt kenarındadır — referans kartında uzvun gövdeden çıktığı yer.
   */
  const attach = boneEnd(shoulderPart);

  const shoulder = anchorBone(assembled, shoulderPart);
  const upper = anchorBone(assembled, upperPart);
  const lower = anchorBone(assembled, lowerPart);

  const hipX = attach.x - bodyCenter.x;
  const hipY = attach.y - bodyCenter.y;
  const upperLength = sourceSpacing[2];
  const lowerLength = sourceSpacing[1];

  shoulder.setPosition(hipX, hipY);
  upper.setPosition(upperLength, 0);
  lower.setPosition(lowerLength, 0);

  if (spec.rebuiltJointPartId) {
    // Eklem diski kemik değildir; iki kemiğin dikişinin üstünde durur ve
    // merkezinden döner.
    const jointPart = requirePart(metadata, spec.rebuiltJointPartId);
    const joint = requireContainer(assembled, spec.rebuiltJointPartId);
    recenterPivot(joint, jointPart.logicalSizePx.width / 2, jointPart.logicalSizePx.height / 2);
    joint.setPosition(upperLength, 0);
    joint.rotation = 0;
  }

  /*
   * Sabit kök kemik YOKTUR: uzun kemik doğrudan IK çiftinin ilki olur, böylece
   * ayak mesafesi değiştikçe SALINIR. Uçtaki küçük parça bilek gibi davranır
   * ve alt kemiğin uzunluğuna dahildir.
   */
  return {
    id: spec.id,
    hipX,
    hipY,
    root: null,
    rootLength: 0,
    upperLength,
    lowerLength: lowerLength + sourceSpacing[0],
    upper: shoulder,
    lower: upper,
    tip: lower,
  };
}

function buildLimb(
  metadata: RigMetadata,
  assembled: AssembledRig,
  spec: LimbChainSpec,
  bodyCenter: { x: number; y: number },
): LimbRig {
  return spec.sourceChainReversed
    ? buildRebuiltLimb(metadata, assembled, spec, bodyCenter)
    : buildAuthoredLimb(metadata, assembled, spec, bodyCenter);
}

/**
 * Montajlanmış rig'i ters kinematikle sürülebilir hâle getirir: gövde
 * merkezini yerel uzayın orijinine taşır, eklem pivotlarını kemik uçlarına
 * oturtur ve her uzvun ölçülmüş geometrisini döner.
 *
 * `assembled`, eklem şeması UYGULANMIŞ bir tanımdan gelmelidir (bkz.
 * `ARACHNID_ARTICULATION`); düz bir montajda ara kemikler kardeş kalır ve
 * yalnız uçlar döner.
 */
export function prepareArachnidRig(metadata: RigMetadata, assembled: AssembledRig): ArachnidRig {
  const rootSize = metadata.source.rootSizePx;
  if (!rootSize) throw new Error('rig metadata rootSizePx taşımıyor');

  const bodyCenter = centerOf(requirePart(metadata, 'abdomen_shell'));

  // `assembleRig` parçaları rootSize merkezine göre yerleştirir; gövde merkezi
  // ise bbox merkezinde DEĞİL. Kök çocukları kaydırılarak dönme ve konum
  // orijini gövdenin üstüne alınır. Eklemli parçalar ebeveynleriyle taşındığı
  // için burada yalnız kök seviyesindeki çocuklar gezilir.
  const shiftX = rootSize.width / 2 - bodyCenter.x;
  const shiftY = rootSize.height / 2 - bodyCenter.y;
  for (const child of assembled.container.list) {
    if (!hasPosition(child)) throw new Error('rig kökü yalnız konum taşıyan çocuklar içerebilir');
    child.x += shiftX;
    child.y += shiftY;
  }

  const limbs = LIMB_CHAINS.map((spec) => buildLimb(metadata, assembled, spec, bodyCenter));

  return {
    limbs,
    shellParts: BODY_SHELL_PART_IDS.map((partId) => requireContainer(assembled, partId)),
    snoutParts: SNOUT_PART_IDS.map((partId) => requireContainer(assembled, partId)),
    gazePart: requireContainer(assembled, GAZE_PART_ID),
    bodyCenterX: bodyCenter.x,
    bodyCenterY: bodyCenter.y,
  };
}
