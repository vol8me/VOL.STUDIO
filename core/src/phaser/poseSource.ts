import type Phaser from 'phaser';
import type { PoseSourceNode } from '../fx/poseSample';

/**
 * Phaser görüntü nesnelerini CORE poz kaynağı sözleşmesine bağlar.
 *
 * `fx` (PoseShadow, GhostTrail) bilinçli olarak Phaser'sızdır ve yapısal bir
 * `PoseSourceNode` bekler. Phaser nesneleri bu yüzeyi taşır ama tip olarak
 * eşleşmez; her tüketicinin `as unknown as` yazması, yanlış nesnenin de
 * sessizce geçmesi demekti. Dönüşüm burada, Phaser sınırında, tek kez yapılır.
 * Dizi verilirse sıraları korunan tek bir kaynak (kapsayıcı gibi) kurulur.
 */
export function poseSourceOf(
  nodes: Phaser.GameObjects.GameObject | readonly Phaser.GameObjects.GameObject[],
): PoseSourceNode {
  const source = isNodeList(nodes) ? { list: [...nodes] } : nodes;
  return source as unknown as PoseSourceNode;
}

function isNodeList(
  nodes: Phaser.GameObjects.GameObject | readonly Phaser.GameObjects.GameObject[],
): nodes is readonly Phaser.GameObjects.GameObject[] {
  return Array.isArray(nodes);
}
