import Phaser from 'phaser';
import { DisposableScope, InputManager, applyVolViewport } from '@volstudio/core';
import {
  assembleRig,
  buildRigDefinition,
  preloadRigTextures,
  type AssembledRig,
  type RigDefinition,
} from '@volstudio/pen.dev';
import { arenaConfig } from '@/config/arena';
import {
  ARACHNID_ACTIONS,
  ARACHNID_MOVE_KEYS,
  ARACHNID_PC_BINDINGS,
  type ArachnidAction,
} from '@/config/input';
import { arachnidMetadata, arachnidPartUrls } from '@/config/rigAssets';
import { ArachnidBody } from '@/runtime/entity/ArachnidBody';
import { ArachnidLegs } from '@/runtime/entity/ArachnidLegs';
import { Arena } from '@/runtime/entity/Arena';
import { prepareArachnidRig } from '@/runtime/rig/arachnidRig';
import { ArachnidBodyMotion } from '@/runtime/rig/ArachnidBodyMotion';
import { ArachnidHud } from '@/runtime/ui/ArachnidHud';

const ARENA_FIT_MARGIN = 0.92;
const RIG_FACING_OFFSET_RAD = Math.PI / 2;

/** Sabit arena, eklemli örümcek ve ortak girdi akışının oyun sahnesi. */
export class GameScene extends Phaser.Scene {
  private rig!: RigDefinition;
  private assembled!: AssembledRig;
  private body!: ArachnidBody;
  private legs!: ArachnidLegs;
  private bodyMotion!: ArachnidBodyMotion;
  private inputManager!: InputManager<ArachnidAction>;
  private hud: ArachnidHud | null = null;
  private runtimeScope: DisposableScope | null = null;

  constructor() {
    super({ key: 'Game' });
  }

  preload(): void {
    this.rig = buildRigDefinition(arachnidMetadata, arachnidPartUrls);
    preloadRigTextures(this, this.rig);
  }

  create(): void {
    this.runtimeScope?.dispose();
    const runtimeScope = new DisposableScope();
    this.runtimeScope = runtimeScope;

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
    runtimeScope.addSubscription(() =>
      this.events.off(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this),
    );

    try {
      runtimeScope.addDestroyable(new Arena(this));

      this.assembled = assembleRig(this, this.rig);
      const arachnidRig = prepareArachnidRig(arachnidMetadata, this.assembled);

      const centerX = arenaConfig.widthPx / 2;
      const centerY = arenaConfig.heightPx / 2;
      this.body = new ArachnidBody(centerX, centerY);
      this.assembled.container.setPosition(centerX, centerY);
      // Metadata'da arka uzuvlar gövde merkezinin altında: rig yerel -Y'ye
      // bakar. Atan2 yönü +X'i sıfır aldığı için ilk -π/2 yönünde ofset sıfırdır.
      this.assembled.container.rotation = this.body.facingRad + RIG_FACING_OFFSET_RAD;

      this.legs = new ArachnidLegs(arachnidRig);
      this.legs.reset(centerX, centerY, this.body.facingRad);
      this.bodyMotion = new ArachnidBodyMotion(arachnidRig.bodyParts);

      this.inputManager = runtimeScope.addDestroyable(
        new InputManager<ArachnidAction>(this, {
          actions: ARACHNID_ACTIONS,
          pcActionBindings: ARACHNID_PC_BINDINGS,
          moveKeys: ARACHNID_MOVE_KEYS,
        }),
      );
      this.hud = runtimeScope.addDestroyable(
        new ArachnidHud(this.game.canvas.parentElement ?? document.body),
      );

      this.applyArenaCamera();
      this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
      runtimeScope.addSubscription(() =>
        this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this),
      );
    } catch (error) {
      runtimeScope.dispose();
      this.runtimeScope = null;
      throw error;
    }
  }

  update(_time: number, delta: number): void {
    this.inputManager.update(delta);
    const state = this.inputManager.getState(this.body.position);

    this.body.update(state.move, state.actions.dash, delta);
    this.assembled.container.setPosition(this.body.position.x, this.body.position.y);
    this.assembled.container.rotation = this.body.facingRad + RIG_FACING_OFFSET_RAD;
    this.legs.update(
      this.body.position.x,
      this.body.position.y,
      this.body.facingRad,
      this.body.velocity.x,
      this.body.velocity.y,
      delta,
    );
    this.bodyMotion.update(state.move, delta);
    this.hud?.refresh({
      dashProgress: this.body.dashProgress,
      speedPxPerSec: this.body.speed,
      isDashing: this.body.isDashing,
    });
  }

  private applyArenaCamera(): void {
    applyVolViewport(this);

    const camera = this.cameras.main;
    const quality = camera.zoom;
    const viewportWidth = camera.width / quality;
    const viewportHeight = camera.height / quality;
    const fit =
      Math.min(viewportWidth / arenaConfig.widthPx, viewportHeight / arenaConfig.heightPx) *
      ARENA_FIT_MARGIN;

    camera.setZoom(quality * fit);
    camera.centerOn(arenaConfig.widthPx / 2, arenaConfig.heightPx / 2);
  }

  private handleResize(): void {
    // ViewportManager aynı resize turunun sonunda kalite zoom'unu tazeler;
    // arena fit'i bir sonraki kareye bırakmak bu son değerin üstüne uygular.
    this.runtimeScope?.addAnimationFrame(() => this.applyArenaCamera());
  }

  private handleShutdown(): void {
    this.runtimeScope?.dispose();
    this.runtimeScope = null;
    this.hud = null;
  }
}
