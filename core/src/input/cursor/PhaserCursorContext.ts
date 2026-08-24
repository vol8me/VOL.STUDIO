import type Phaser from 'phaser';
import type { CursorId, CursorTheme } from './types';
import { PhaserCursorManager } from './PhaserCursorManager';

/** Bir Phaser GameObject'ten cursor kimliği çözümleyen fonksiyon. */
export type PhaserCursorResolver = (
  gameObject: Phaser.GameObjects.GameObject,
) => CursorId | undefined;

export interface PhaserCursorContextOptions {
  resolver?: PhaserCursorResolver;
  size?: number;
  defaultCursor?: CursorId;
}

/**
 * Phaser sahnesi içindeki GameObject'lerin cursor bağlamını yönetir.
 *
 * - GameObject `setData('cursor', id)` ile özel cursor atar.
 * - `pointerover`/`pointerout` olaylarında `PhaserCursorManager`'ı günceller.
 * - Sahne genelinde varsayılan cursor döndürülebilir.
 */
export class PhaserCursorContext {
  readonly scene: Phaser.Scene;
  readonly manager: PhaserCursorManager;
  readonly resolver: PhaserCursorResolver;
  private readonly defaultCursor: CursorId;
  private readonly boundOver: (
    pointer: Phaser.Input.Pointer,
    gameObject: Phaser.GameObjects.GameObject,
  ) => void;
  private readonly boundOut: (
    pointer: Phaser.Input.Pointer,
    gameObject: Phaser.GameObjects.GameObject,
  ) => void;

  constructor(scene: Phaser.Scene, theme: CursorTheme, options: PhaserCursorContextOptions = {}) {
    this.scene = scene;
    this.manager = new PhaserCursorManager(scene, theme);
    this.resolver = options.resolver ?? defaultPhaserCursorResolver;
    this.defaultCursor = options.defaultCursor ?? 'default';

    if (options.size) {
      this.manager.setSize(options.size);
    }

    this.boundOver = this.onGameObjectOver.bind(this);
    this.boundOut = this.onGameObjectOut.bind(this);

    scene.input.on('gameobjectover', this.boundOver);
    scene.input.on('gameobjectout', this.boundOut);

    this.manager.set(this.defaultCursor);
  }

  set(id: CursorId): void {
    this.manager.set(id);
  }

  reset(): void {
    this.manager.set(this.defaultCursor);
  }

  destroy(): void {
    this.scene.input.off('gameobjectover', this.boundOver);
    this.scene.input.off('gameobjectout', this.boundOut);
    this.manager.destroy();
  }

  private onGameObjectOver(
    _pointer: Phaser.Input.Pointer,
    gameObject: Phaser.GameObjects.GameObject,
  ): void {
    const id = this.resolver(gameObject);
    this.manager.set(id ?? this.defaultCursor);
  }

  private onGameObjectOut(
    _pointer: Phaser.Input.Pointer,
    gameObject: Phaser.GameObjects.GameObject,
  ): void {
    const id = this.resolver(gameObject);
    // Eğer başka bir GameObject üzerine gidiliyorsa gameobjectover ayrıca
    // ateşlenecektir; burada yalnızca hiçbir şeyin üzerinde değilsek reset.
    if (!id) {
      this.manager.set(this.defaultCursor);
    }
  }
}

export function defaultPhaserCursorResolver(
  gameObject: Phaser.GameObjects.GameObject,
): CursorId | undefined {
  const explicit = gameObject.getData('cursor') as CursorId | undefined;
  if (explicit) return explicit;

  if (gameObject.getData('disabled') === true) {
    return 'not-allowed';
  }

  if (gameObject.getData('danger') === true) {
    return 'not-allowed';
  }

  if (gameObject.getData('editable') === true) {
    return 'text';
  }

  if (gameObject.getData('clickable') === true) {
    return 'pointer';
  }

  return undefined;
}
