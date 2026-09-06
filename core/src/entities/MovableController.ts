import type Phaser from 'phaser';
import type { BaseEntity } from './BaseEntity';
import { Vector2 } from '../math/Vector2';
import { TECH } from '../constants';

/** `Sprite`'a kilitlenmez; texture'suz placeholder geometri de kullanılabilsin. */
export type MovableGameObject = Phaser.GameObjects.GameObject &
  Phaser.GameObjects.Components.Transform;

/**
 * Hız tabanlı hareketin taban sınıfı. Oyuncu semantiği YOKTUR — düşmana da
 * araca da aynen hizmet eder.
 *
 * `sprite` composition ile tutulur, yani Phaser'in destroy() zinciri otomatik
 * gelmez: `destroy()` override eden alt sınıf `super.destroy()` çağırmalıdır.
 */
export abstract class MovableController implements BaseEntity {
  protected velocity = Vector2.zero();
  /** move() çağıranın vektörünü bozmasın diye kullanılan yerel tampon. */
  private readonly moveDirBuf = Vector2.zero();

  constructor(
    public id: string,
    protected sprite: MovableGameObject,
  ) {}

  public abstract update(delta: number): void;

  public destroy(): void {
    this.sprite.destroy();
  }

  /**
   * `direction` ASLA yerinde değiştirilmez: çağıran burayı kalıcı bir alanla
   * besliyor olabilir, normalize etmek o alanı birim uzunluğa çevirirdi.
   *
   * Büyüklük yalnız 1'i AŞARSA kelepçelenir; yarıya itilen çubuk yarım hız verir.
   */
  protected move(direction: Vector2, speed: number, delta: number): void {
    this.moveDirBuf.copyFrom(direction);
    const length = this.moveDirBuf.length();
    if (length > 1) {
      this.moveDirBuf.scaleInPlace(1 / length);
    }

    this.velocity.set(this.moveDirBuf.x * speed, this.moveDirBuf.y * speed);
    this.sprite.x += this.velocity.x * (delta / TECH.MS_PER_SECOND);
    this.sprite.y += this.velocity.y * (delta / TECH.MS_PER_SECOND);
  }
}
