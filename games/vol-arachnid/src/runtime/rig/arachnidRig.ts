import type Phaser from 'phaser';
import type { RigMetadata, RigPartMetadata } from '@volstudio/pen.dev';
import type { AssembledRig } from '@volstudio/pen.dev';

const DEG = Math.PI / 180;

export const LEG_IDS = ['r0', 'r1', 'r2', 'r3', 'l0', 'l1', 'l2', 'l3'] as const;
export const TAIL_IDS = ['l', 'r'] as const;
export const BODY_PART_IDS = [
  'abdomen_shell',
  'abdomen_plate',
  'core_ring',
  'reactor',
  'reactor_slit',
  'top_cap',
  'top_cap_side_l',
  'top_cap_side_r',
] as const;

export interface LegRig {
  id: string;
  /** Gövde merkezine göre kalça (coxa kemik başlangıcı). */
  hipX: number;
  hipY: number;
  /** Kalça–diz ve diz–ayak kemik uzunlukları. */
  upperLength: number;
  lowerLength: number;
  /** Dinlenme pozunda bacağın kalçadan baktığı yön (radyan). */
  restRad: number;
  /** Dizin büküleceği taraf; sol/sağ ayna simetrisi için zıt işaret. */
  bendSign: number;
  /** Üst kemiği süren container (coxa). */
  upper: Phaser.GameObjects.Container;
  /** Alt kemiği süren container (tibia); dönüşü üst kemiğe GÖRELİdir. */
  lower: Phaser.GameObjects.Container;
}

export interface TailRig {
  id: string;
  hipX: number;
  hipY: number;
  length: number;
  restRad: number;
  root: Phaser.GameObjects.Container;
}

export interface ArachnidRig {
  legs: LegRig[];
  tails: TailRig[];
  bodyParts: Phaser.GameObjects.Container[];
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

/**
 * Bir pivot container'ının DÖNME ORİJİNİNİ, dünya konumlarını bozmadan kendi
 * yerel `(lx, ly)` noktasına taşır.
 *
 * `assembleRig` her parçayı sol-üst köşesinden döndürür (kaynak belgenin
 * sözleşmesi). Bir uzuv ise eklemden dönmelidir; kalçadan 9.5px kayan bir
 * dönme merkezi, bacak açıldıkça gövdeden görünür biçimde kopardı. Pivot
 * ileri kaydırılır, çocukları aynı miktarda geri kaydırılır: net etki sıfır,
 * dönme merkezi eklemin üstünde.
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
 * Montajlanmış rig'i IK ile sürülebilir hâle getirir: gövde merkezini yerel
 * uzayın orijinine taşır, eklem pivotlarını kemik eksenlerine oturtur ve her
 * uzvun ölçülmüş geometrisini döner.
 */
export function prepareArachnidRig(metadata: RigMetadata, assembled: AssembledRig): ArachnidRig {
  const rootSize = metadata.source.rootSizePx;
  if (!rootSize) throw new Error('rig metadata rootSizePx taşımıyor');

  const bodyCenter = centerOf(requirePart(metadata, 'abdomen_shell'));

  // `assembleRig` parçaları rootSize merkezine göre yerleştirir; gövde merkezi
  // ise bbox merkezinde DEĞİL. Kök çocukları kaydırılarak dönme ve konum
  // orijini gövdenin üstüne alınır.
  const shiftX = rootSize.width / 2 - bodyCenter.x;
  const shiftY = rootSize.height / 2 - bodyCenter.y;
  for (const child of assembled.container.list) {
    if (!hasPosition(child)) throw new Error('rig kökü yalnız konum taşıyan çocuklar içerebilir');
    child.x += shiftX;
    child.y += shiftY;
  }

  const legs: LegRig[] = LEG_IDS.map((id) => {
    const coxa = requirePart(metadata, `leg_${id}_coxa`);
    const tibia = requirePart(metadata, `leg_${id}_tibia`);
    const claw = requirePart(metadata, `leg_${id}_claw`);

    const hip = boneStart(coxa);
    const knee = boneStart(tibia);
    const foot = boneEnd(claw);

    const upper = requireContainer(assembled, `leg_${id}_coxa`);
    const lower = requireContainer(assembled, `leg_${id}_tibia`);
    recenterPivot(upper, 0, coxa.logicalSizePx.height / 2);
    recenterPivot(lower, 0, tibia.logicalSizePx.height / 2);

    return {
      id,
      hipX: hip.x - bodyCenter.x,
      hipY: hip.y - bodyCenter.y,
      upperLength: Math.hypot(knee.x - hip.x, knee.y - hip.y),
      lowerLength: Math.hypot(foot.x - knee.x, foot.y - knee.y),
      restRad: Math.atan2(foot.y - hip.y, foot.x - hip.x),
      // Sol ve sağ bacaklar ayna simetriktir; aynı işaret verilirse bir taraf
      // dizini ters büker ve yürüyüş çarpık görünür.
      bendSign: id.startsWith('l') ? -1 : 1,
      upper,
      lower,
    };
  });

  const tails: TailRig[] = TAIL_IDS.map((id) => {
    const upperPart = requirePart(metadata, `tail_${id}_tail_upper`);
    const tipPart = requirePart(metadata, `tail_${id}_tail_tip`);

    // Kuyruk sanatı AYAKTAN GÖVDEYE doğru çizilmiştir: zincirin kökü olan
    // `tail_upper`'ın kemik başlangıcı ayakta, gövde bağlantısı ise `tail_tip`in
    // ucundadır. Pivot o bağlantıya taşınır ki kuyruk gövdeden sallansın.
    const foot = boneStart(upperPart);
    const attach = boneEnd(tipPart);
    const length = Math.hypot(foot.x - attach.x, foot.y - attach.y);

    const root = requireContainer(assembled, `tail_${id}_tail_upper`);
    recenterPivot(root, length, upperPart.logicalSizePx.height / 2);

    return {
      id,
      hipX: attach.x - bodyCenter.x,
      hipY: attach.y - bodyCenter.y,
      length,
      restRad: Math.atan2(foot.y - attach.y, foot.x - attach.x),
      root,
    };
  });

  const bodyParts = BODY_PART_IDS.map((partId) => requireContainer(assembled, partId));

  return { legs, tails, bodyParts, bodyCenterX: bodyCenter.x, bodyCenterY: bodyCenter.y };
}
