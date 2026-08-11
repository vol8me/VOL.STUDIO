import type Phaser from 'phaser';
import type { BaseEntity } from './BaseEntity';
import { Vector2 } from '../math/Vector2';
import { TECH } from '../constants';

/**
 * `Sprite`'a kilitlenmez: yalnızca x/y ve destroy() kullanılır, böylece
 * placeholder geometri (texture'suz GameObject'ler) de doğrudan kullanılabilir.
 */
export type MovableGameObject = Phaser.GameObjects.GameObject &
  Phaser.GameObjects.Components.Transform;

/**
 * `sprite` composition ile tutulur (extend edilmez), bu yüzden Phaser'in
 * destroy() zinciri otomatik gelmez. Alt sınıflar destroy() override ederse
 * `super.destroy()` çağırmalıdır.
 */
export abstract class PlayerController implements BaseEntity {
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
   * `direction` ASLA yerinde değiştirilmez — çağıranlar (bkz. Player.moveDirection)
   * burayı kalıcı bir alanla besliyor, normalize etmek o alanı kalıcı olarak birim
   * uzunluğa çevirir ve analog girdiyi yok ederdi.
   *
   * Büyüklük yalnızca 1'i aşarsa kelepçelenir; altındaysa korunur. Yarıya kadar
   * itilen bir çubuk yarım hız üretmelidir — InputUtils.normalizeAnalog() zaten
   * 0..1 aralığında bir vektör döndürüyor.
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
