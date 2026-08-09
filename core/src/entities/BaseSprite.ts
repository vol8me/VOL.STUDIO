import Phaser from 'phaser';
import type { BaseEntity } from './BaseEntity';

/**
 * Alt sınıflar `destroy(fromScene?)`'ı override ederse kendi temizliklerinden
 * SONRA mutlaka `super.destroy(fromScene)` çağırmalıdır, aksi halde Phaser'in
 * GameObject temizliği çalışmaz.
 */
export abstract class BaseSprite extends Phaser.GameObjects.Sprite implements BaseEntity {
  public id: string;

  constructor(scene: Phaser.Scene, x: number, y: number, texture: string, id: string) {
    super(scene, x, y, texture);
    this.id = id;
  }

  public abstract update(delta: number): void;
}
