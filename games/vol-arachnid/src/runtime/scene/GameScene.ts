import Phaser from 'phaser';
import {
  DisposableScope,
  FullscreenController,
  GhostTrail,
  InputManager,
  PoseShadow,
  VirtualActionSource,
  applyVolViewport,
  cancelHaptics,
  clamp,
  clamp01,
  damp,
  observeAppVisibility,
  shouldUseTouchControls,
  vibrate,
  type CancellableDisposable,
  type PoseSourceNode,
} from '@volstudio/core';
import {
  articulateRigDefinition,
  assembleRig,
  buildRigDefinition,
  preloadRigTextures,
  type AssembledRig,
  type RigDefinition,
} from '@volstudio/pen.dev';
import { arenaConfig } from '@/config/arena';
import { arachnidAudioConfig } from '@/config/audio';
import { fxConfig } from '@/config/fx';
import {
  ARACHNID_ACTIONS,
  ARACHNID_LEFT_STICK_REGION,
  ARACHNID_MOVE_KEYS,
  ARACHNID_PC_BINDINGS,
  type ArachnidAction,
} from '@/config/input';
import type { ArachnidAudioPort } from '@/app/ArachnidAudio';
import { ARACHNID_ARTICULATION, RIG_FACING_OFFSET_RAD } from '@/config/rig';
import { arachnidMetadata, arachnidPartUrls } from '@/config/rigAssets';
import { ArachnidBody } from '@/runtime/entity/ArachnidBody';
import { ArachnidLegs } from '@/runtime/entity/ArachnidLegs';
import { Arena } from '@/runtime/entity/Arena';
import { ArachnidDust } from '@/runtime/fx/ArachnidDust';
import { prepareArachnidRig } from '@/runtime/rig/arachnidRig';
import { ArachnidBodyMotion } from '@/runtime/rig/ArachnidBodyMotion';
import { ArachnidHud } from '@/runtime/ui/ArachnidHud';
import { ArachnidExitPrompt } from '@/runtime/ui/ArachnidExitPrompt';
import { ArachnidTouchControls } from '@/runtime/ui/ArachnidTouchControls';

/** Görüş alanını arenanın içinde tutar; arena görüşten darsa ortalar. */
function clampView(center: number, halfExtent: number, arenaExtent: number): number {
  if (halfExtent * 2 >= arenaExtent) return arenaExtent / 2;
  return clamp(center, halfExtent, arenaExtent - halfExtent);
}

/** Sabit arena, eklemli örümcek ve ortak girdi akışının oyun sahnesi. */
export class GameScene extends Phaser.Scene {
  private rig!: RigDefinition;
  private assembled!: AssembledRig;
  private body!: ArachnidBody;
  private legs!: ArachnidLegs;
  private bodyMotion!: ArachnidBodyMotion;
  private arena!: Arena;
  private dust!: ArachnidDust;
  private ghostTrail!: GhostTrail;
  private shadow!: PoseShadow;
  private inputManager!: InputManager<ArachnidAction>;
  /** Ekran üstü düğmelerin yazdığı eylemler; dokunmatik sağlayıcıyla birleşir. */
  private readonly actionSource = new VirtualActionSource<ArachnidAction>();
  private hud: ArachnidHud | null = null;
  private runtimeScope: DisposableScope | null = null;
  /** Bekleyen kamera tazeleme karesi; her resize'da yenisiyle DEĞİŞTİRİLİR. */
  private pendingCameraFrame: CancellableDisposable | null = null;
  /**
   * Kamera arenayı sığdırmak yerine gövdeyi TAKİP mi ediyor? Küçük ekranlarda
   * arenanın tamamını sığdırmak yaratığı okunmaz hâle getirir.
   */
  private cameraFollowsBody = false;
  /** Dokunmatik cihazda kamera arenayı sığdırmaz, gövdeyi takip eder. */
  private prefersFollowCamera = false;
  /** Yürürlükteki dünya→CSS ölçeği; takip kelepçesi bunu kullanır. */
  private worldScale = 1;
  /** Çıkış onayı açıkken dünya ilerlemez; modal arkasında hareket edilmez. */
  private exitPromptOpen = false;
  private readonly audio: ArachnidAudioPort | null;

  constructor(audio: ArachnidAudioPort | null = null) {
    super({ key: 'Game' });
    this.audio = audio;
  }

  preload(): void {
    // Eklem şeması montajdan ÖNCE uygulanır: `assembleRig` ağacı tek geçişte
    // kurar ve ara kemikler kardeş değil çocuk olur.
    this.rig = articulateRigDefinition(
      buildRigDefinition(arachnidMetadata, arachnidPartUrls),
      ARACHNID_ARTICULATION,
    );
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
      this.arena = runtimeScope.addDestroyable(new Arena(this));
      this.shadow = runtimeScope.addDestroyable(new PoseShadow(this, fxConfig.shadow));
      this.ghostTrail = runtimeScope.addDestroyable(new GhostTrail(this, fxConfig.ghostTrail));
      this.dust = runtimeScope.addDestroyable(new ArachnidDust(this));

      this.assembled = assembleRig(this, this.rig);
      const arachnidRig = prepareArachnidRig(arachnidMetadata, this.assembled);

      const centerX = arenaConfig.widthPx / 2;
      const centerY = arenaConfig.heightPx / 2;
      this.body = new ArachnidBody(centerX, centerY);
      this.assembled.container.setPosition(centerX, centerY);
      this.assembled.container.rotation = this.body.facingRad + RIG_FACING_OFFSET_RAD;

      this.legs = new ArachnidLegs(arachnidRig);
      this.legs.reset(centerX, centerY, this.body.facingRad);
      this.bodyMotion = new ArachnidBodyMotion(arachnidRig);

      this.actionSource.clear();
      this.inputManager = runtimeScope.addDestroyable(
        new InputManager<ArachnidAction>(this, {
          actions: ARACHNID_ACTIONS,
          pcActionBindings: ARACHNID_PC_BINDINGS,
          moveKeys: ARACHNID_MOVE_KEYS,
          actionSource: this.actionSource,
          leftStickRegion: ARACHNID_LEFT_STICK_REGION,
          rightStickRegion: null,
        }),
      );

      const uiParent = this.game.canvas.parentElement ?? document.body;
      const touchDevice = shouldUseTouchControls();
      this.prefersFollowCamera = touchDevice;
      if (touchDevice) {
        runtimeScope.addDestroyable(
          new ArachnidTouchControls(uiParent, { actionSource: this.actionSource }),
        );
        // Arka plana geçiş aktif pointer'ı sonlandırmayabilir; basılı kalan bir
        // atılım geri dönüldüğünde kendiliğinden tetiklenirdi.
        runtimeScope.addSubscription(
          observeAppVisibility((state) => {
            if (state === 'background') {
              this.inputManager.reset();
              cancelHaptics();
            }
          }),
        );
        // Geri hareketi uygulamayı sessizce kapatmaz; onay sorar.
        runtimeScope.addDestroyable(
          new ArachnidExitPrompt({
            container: uiParent,
            onVisibilityChange: (open) => {
              this.exitPromptOpen = open;
              if (open) this.inputManager.reset();
            },
          }),
        );
      }

      // F11 ve buton aynı denetleyiciden geçer; sahne ömrüne bağlı olduğu için
      // yeniden başlatmada ikinci bir keydown dinleyicisi birikmez.
      const fullscreen = runtimeScope.addDestroyable(
        new FullscreenController({
          onChange: (active) => this.hud?.setFullscreenActive(active),
          onError: (error) => console.warn('[VOL.ARACHNID] Tam ekran açılamadı:', error),
        }),
      );
      this.hud = runtimeScope.addDestroyable(
        new ArachnidHud(uiParent, {
          // Android uygulaması zaten tam ekran açılır; orada düğme hem
          // anlamsız hem de başparmağın yolunda duruyor.
          showFullscreenToggle: !touchDevice,
          onToggleFullscreen: () => void fullscreen.toggle(),
        }),
      );

      this.applyArenaCamera();
      this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
      runtimeScope.addSubscription(() => {
        this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
        this.pendingCameraFrame?.cancel();
        this.pendingCameraFrame = null;
      });
    } catch (error) {
      runtimeScope.dispose();
      this.runtimeScope = null;
      this.hud = null;
      throw error;
    }
  }

  update(_time: number, delta: number): void {
    // Kurulum yarıda patladıysa (ya da sahne kapandıysa) çalışma zamanı yoktur;
    // Phaser sahneyi durdurmadığı için kare akışı her karede aynı hatayı
    // fırlatarak konsolu doldururdu.
    if (!this.runtimeScope || this.exitPromptOpen) return;

    this.inputManager.update(delta);
    const state = this.inputManager.getState(this.body.position);

    this.body.update(state.move, state.actions.dash, delta);
    this.assembled.container.setPosition(this.body.position.x, this.body.position.y);
    this.assembled.container.rotation = this.body.facingRad + RIG_FACING_OFFSET_RAD;

    const accel = this.body.accelerationVector;
    const motion = this.bodyMotion.update(
      {
        speed: this.body.speed,
        accelX: accel.x,
        accelY: accel.y,
        turnRate: this.body.turnRate,
        facingRad: this.body.facingRad,
        dash01: this.body.dash01,
      },
      delta,
    );

    this.legs.update(
      {
        bodyX: this.body.position.x,
        bodyY: this.body.position.y,
        bodyRad: this.body.facingRad,
        velX: this.body.velocity.x,
        velY: this.body.velocity.y,
        turnRate: this.body.turnRate,
        motion01: motion.motion01,
        dash01: this.body.dash01,
        crouch01: motion.crouch01,
        airborne: this.body.isDashing,
      },
      delta,
    );

    if (this.cameraFollowsBody) this.followBody(delta);
    this.resolveWallImpact();
    this.arena.update(delta);
    this.emitFootDust();

    // İz ve gölge, POZLANDIKTAN sonra örneklenir; aksi halde bir kare
    // gecikmiş bir gövde çizerlerdi.
    const poseRoot = this.assembled.container as unknown as PoseSourceNode;
    if (this.body.isDashing) this.ghostTrail.capture(poseRoot);
    this.ghostTrail.update(delta);
    this.shadow.update(poseRoot);

    this.hud?.refresh({
      dashProgress: this.body.dashProgress,
      speedPxPerSec: this.body.speed,
      isDashing: this.body.isDashing,
    });
  }

  /** Duvar çarpmasının görsel yankısı: sınır parlaması, sarsıntı ve toz. */
  private resolveWallImpact(): void {
    const impact = this.body.consumeWallImpact();
    if (!impact) return;

    this.arena.strike(impact);
    this.cameras.main.shake(
      arenaConfig.impact.shakeDurationMs,
      arenaConfig.impact.shakeIntensity * (0.4 + 0.6 * impact.strength01),
    );
    this.dust.puff(impact.x, impact.y, fxConfig.dust.fullSpeedPxPerSec);
    const impactFloor = arachnidAudioConfig.intensity.wallImpactFloor;
    this.audio?.play('wallImpact', impactFloor + (1 - impactFloor) * impact.strength01);
    vibrate('select');
  }

  /**
   * Pençe temasında toz.
   *
   * Atılım SÜRERKEN kapalıdır: ayaklar o sırada yere değmez, gövde havada
   * uçar. Bunun karşılığı atılımın BİTTİĞİ karededir — bütün ayaklar aynı anda
   * yere iner ve toplu bir toz patlaması bırakır.
   */
  private emitFootDust(): void {
    if (this.body.consumeDashLaunch()) {
      // Yürüyüşten kalan toz atılımın ilk karesinde silinir; havada asılı
      // partiküller "atılım tozu" gibi okunuyordu.
      this.dust.clear();
      this.audio?.play('dashLaunch');
      vibrate('tap');
      return;
    }
    if (this.body.consumeDashLanding()) {
      this.legs.forEachFoot((x, y) => this.dust.puff(x, y, fxConfig.dust.landingSpeedPxPerSec));
      this.cameras.main.shake(fxConfig.dust.landingShakeMs, fxConfig.dust.landingShakeIntensity);
      this.audio?.play('dashLand');
      vibrate('tap');
      return;
    }
    if (this.body.isDashing) return;
    const speed = this.body.speed;
    let planted = 0;
    this.legs.forEachPlant((x, y) => {
      planted++;
      this.dust.puff(x, y, speed);
    });
    // Aynı karede birden çok pençe basabilir; tek varyantlı temas sesi, pençe
    // sayısıyla hafifçe güçlenir ama ses bankasını sekiz kaynakla doldurmaz.
    if (planted > 0) {
      const speed01 = clamp01(speed / fxConfig.dust.fullSpeedPxPerSec);
      const { stepBase, stepPerPlant, stepPlantCap } = arachnidAudioConfig.intensity;
      const plantScale = stepBase + Math.min(planted, stepPlantCap) * stepPerPlant;
      this.audio?.play('step', speed01 * plantScale);
    }
  }

  /**
   * Arenayı kamera boşluklarının İÇİNE sığdırır ve o kutunun ortasına oturtur.
   * Boşluklar HUD'un yaşam alanıdır; sığdırma onları yerse HUD oyun alanının
   * üstüne binerdi.
   */
  private applyArenaCamera(): void {
    applyVolViewport(this);

    const camera = this.cameras.main;
    const quality = camera.zoom;
    const gutter = arenaConfig.viewportGutterPx;
    const viewportWidth = camera.width / quality;
    const viewportHeight = camera.height / quality;
    const availableWidth = Math.max(1, viewportWidth - gutter.left - gutter.right);
    const availableHeight = Math.max(1, viewportHeight - gutter.top - gutter.bottom);
    const fit =
      Math.min(availableWidth / arenaConfig.widthPx, availableHeight / arenaConfig.heightPx) *
      arenaConfig.fitMargin;

    /*
     * Arenanın tamamını göstermek masaüstünde doğrudur; dokunmatik cihazda
     * yaratığı okunmaz hâle getirir. Ölçek girdi türüne göre ayrılır ve taban
     * çok küçültülmüş pencereleri de yakalar.
     */
    const floor = this.prefersFollowCamera
      ? arenaConfig.touchWorldScale
      : arenaConfig.minWorldScale;
    this.cameraFollowsBody = fit < floor;
    this.worldScale = Math.max(fit, floor);
    camera.setZoom(quality * this.worldScale);

    if (this.cameraFollowsBody) {
      this.followBody(0);
      return;
    }

    // Kutu merkezi ekran merkezinden bu kadar kayıktır (CSS px); kamerayı ters
    // yönde kaydırmak arenayı oraya taşır. Dünya birimine çeviren ölçektir.
    const offsetX = gutter.left - gutter.right;
    const offsetY = gutter.top - gutter.bottom;
    camera.centerOn(
      arenaConfig.widthPx / 2 - offsetX / 2 / this.worldScale,
      arenaConfig.heightPx / 2 - offsetY / 2 / this.worldScale,
    );
  }

  /**
   * Kamerayı gövdenin üstünde tutar ve görüş alanını arenanın İÇİNE kelepçeler:
   * oyuncu kenara gittiğinde ekranın yarısı boş kalmamalıdır. Arena bir eksende
   * görüş alanından darsa o eksen ortalanır.
   */
  private followBody(deltaMs: number): void {
    const camera = this.cameras.main;
    const halfWidth = camera.width / camera.zoom / 2;
    const halfHeight = camera.height / camera.zoom / 2;
    const targetX = clampView(this.body.position.x, halfWidth, arenaConfig.widthPx);
    const targetY = clampView(this.body.position.y, halfHeight, arenaConfig.heightPx);

    if (deltaMs <= 0) {
      camera.centerOn(targetX, targetY);
      return;
    }
    // Sert takip her adımda kamerayı titretir; yumuşatma kare hızından
    // BAĞIMSIZDIR (bkz. CORE `damp`).
    camera.centerOn(
      damp(camera.midPoint.x, targetX, arenaConfig.followSmoothingMs, deltaMs),
      damp(camera.midPoint.y, targetY, arenaConfig.followSmoothingMs, deltaMs),
    );
  }

  /**
   * `ViewportManager` aynı resize turunun sonunda kalite zoom'unu tazeler;
   * arena fit'i bir sonraki kareye bırakmak bu son değerin üstüne uygular.
   *
   * Bekleyen kare her seferinde İPTAL EDİLİR: sürükleyerek yeniden boyutlanan
   * bir pencere yüzlerce resize üretir ve her biri ayrı bir kare biriktirirdi.
   */
  private handleResize(): void {
    this.pendingCameraFrame?.cancel();
    this.pendingCameraFrame =
      this.runtimeScope?.addAnimationFrame(() => {
        this.pendingCameraFrame = null;
        this.applyArenaCamera();
      }) ?? null;
  }

  private handleShutdown(): void {
    this.runtimeScope?.dispose();
    this.runtimeScope = null;
    this.hud = null;
    this.exitPromptOpen = false;
  }
}
