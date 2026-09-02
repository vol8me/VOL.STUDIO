import Phaser from 'phaser';
import type { Vector2 } from '../math/Vector2';
import { VOL_COLORS } from '../ui/colors';
import {
  isPointInNormalizedRegion,
  resolveNormalizedInputRegion,
  screenToCameraLayer,
  type NormalizedInputRegion,
} from './InputUtils';
import { TouchStickState, type TouchStickOptions } from './TouchStickState';
import type { InputProvider } from './InputProvider';
import type { InputState } from './InputState';
import {
  singleProviderSnapshot,
  type InputSnapshot,
  type TouchInputSnapshot,
  type TouchStickSnapshot,
} from './InputSnapshot';
import { UI_DEPTH, UI_RATIO, UI_ALPHA, UI_SIZE } from '../constants';

// Graphics.fillStyle sayısal 0xRRGGBB bekler, VOL_COLORS '#rrggbb' string'leri taşır.
function hexColorToNumber(hex: string): number {
  return Phaser.Display.Color.HexStringToColor(hex).color;
}

const STICK_BASE_COLOR = hexColorToNumber(VOL_COLORS.uiSurface3);
const STICK_THUMB_COLOR = hexColorToNumber(VOL_COLORS.supportSolid);
const STICK_ARMED_BASE_COLOR = hexColorToNumber(VOL_COLORS.warningSubtle);
const STICK_ARMED_COLOR = hexColorToNumber(VOL_COLORS.warningSolid);
const STICK_MANUAL_COLOR = hexColorToNumber(VOL_COLORS.brandHover);

/**
 * Aynı anda izlenmesi gereken en az işaretçi sayısı.
 *
 * Phaser VARSAYILAN OLARAK tek bir dokunma işaretçisi ayırır; ikinci parmak
 * hiç olay üretmez. Çift joystick tanımı gereği iki eşzamanlı dokunuş ister,
 * yani varsayılanla sol çubuk tutulurken sağ çubuk HİÇ çalışmaz — hareket
 * ederken nişan alınamaz. Üçüncü işaretçi pay olarak istenir: ekranı sıyıran
 * üçüncü bir parmak iki çubuğu düşürmemeli.
 */
const REQUIRED_POINTERS = 3;

const DEFAULT_LEFT_REGION: NormalizedInputRegion = {
  minX: 0,
  maxX: UI_RATIO.SCREEN_HALF,
  minY: 0,
  maxY: 1,
};
const DEFAULT_RIGHT_REGION: NormalizedInputRegion = {
  minX: UI_RATIO.SCREEN_HALF,
  maxX: 1,
  minY: 0,
  maxY: 1,
};

export interface TouchControllerOptions<TAction extends string> extends TouchStickOptions<TAction> {
  /** Sol stick'in başlayabildiği ekran bölgesi; `null` stick'i kapatır. */
  leftStickRegion?: NormalizedInputRegion | null;
  /** Sağ stick'in başlayabildiği ekran bölgesi; `null` stick'i kapatır. */
  rightStickRegion?: NormalizedInputRegion | null;
}

/**
 * İnce Phaser sarmalayıcısı: pointer olaylarını dinler, görseli çizer.
 * Stick atama/clamp/deadzone mantığı TouchStickState'te yaşar (bkz. TouchStickState.ts).
 */
export class TouchController<TAction extends string>
  extends Phaser.GameObjects.Container
  implements InputProvider<TAction>
{
  readonly id: string;
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly sticks: TouchStickState<TAction>;
  private readonly aimStickActivatesOnTouch: boolean;
  private readonly leftStickRegion: NormalizedInputRegion | null;
  private readonly rightStickRegion: NormalizedInputRegion | null;
  /** Ekranda çizili stick var mı — parmak kalkınca tek bir clear() için. */
  private hasDrawnSticks = false;

  constructor(scene: Phaser.Scene, stickOptions: TouchControllerOptions<TAction>) {
    super(scene);
    this.id = stickOptions.id ?? 'touch';
    this.sticks = new TouchStickState(stickOptions);
    this.aimStickActivatesOnTouch = stickOptions.aimStickActivatesOnTouch ?? false;
    this.leftStickRegion = resolveNormalizedInputRegion(
      stickOptions.leftStickRegion,
      DEFAULT_LEFT_REGION,
    );
    this.rightStickRegion = resolveNormalizedInputRegion(
      stickOptions.rightStickRegion,
      DEFAULT_RIGHT_REGION,
    );
    scene.add.existing(this);
    this.setScrollFactor(0);
    this.setDepth(UI_DEPTH.OVERLAY);

    this.graphics = new Phaser.GameObjects.Graphics(scene);
    this.add(this.graphics);

    TouchController.ensureMultiTouch(scene);

    scene.input.on('pointerdown', this.onPointerDown, this);
    scene.input.on('pointermove', this.onPointerMove, this);
    scene.input.on('pointerup', this.onPointerUp, this);
    scene.input.on('pointerupoutside', this.onPointerUp, this);
  }

  /**
   * Oyunun işaretçi havuzunu çift joystick için yeterli hâle getirir.
   *
   * Havuz OYUN genelindedir (`input.manager`), sahneye değil; bu yüzden sahne
   * her yeniden başladığında körlemesine `addPointer` çağırmak havuzu sürekli
   * büyütürdü. Eksik kadarı istenir, zaten yeterliyse hiç dokunulmaz.
   */
  private static ensureMultiTouch(scene: Phaser.Scene): void {
    const manager = scene.input?.manager;
    if (!manager) return;
    const missing = REQUIRED_POINTERS - manager.pointersTotal;
    if (missing > 0) scene.input.addPointer(missing);
  }

  get isActive(): boolean {
    return this.sticks.isActive;
  }

  getDebugSnapshot(): InputSnapshot {
    const left = this.sticks.getLeftStick();
    const right = this.sticks.getRightStick();
    // bkz. PCController.getDebugSnapshot — şekil açıkça tiplenir.
    const snapshot: TouchInputSnapshot = {
      left: left ? this.toStickSnapshot(left) : undefined,
      right: right ? this.toStickSnapshot(right) : undefined,
    };
    return singleProviderSnapshot(this.id, snapshot);
  }

  private toStickSnapshot(stick: { base: Vector2; current: Vector2 }): TouchStickSnapshot {
    return {
      base: { x: stick.base.x, y: stick.base.y },
      current: { x: stick.current.x, y: stick.current.y },
    };
  }

  getState(_playerPosition: Vector2): InputState<TAction> {
    return this.sticks.getState();
  }

  reset(): void {
    this.sticks.reset();
    this.graphics.clear();
    this.hasDrawnSticks = false;
  }

  update(_delta: number): void {
    if (!this.sticks.isActive) {
      // graphics.clear() yalnızca drawSticks() içinde çağrılıyor; erken dönmek
      // son çizilen halkaları ekranda kalıcı olarak bırakırdı. Bayrak, parmak
      // yokken her frame boşuna clear çağrılmasını engeller.
      if (this.hasDrawnSticks) {
        this.graphics.clear();
        this.hasDrawnSticks = false;
      }
      return;
    }

    this.drawSticks();
    this.hasDrawnSticks = true;
  }

  /**
   * `this.scene.input` sahne geçişi sırasında destroy()'dan ÖNCE zaten
   * `undefined` olabilir (Phaser'in Systems.shutdown sırasına bağlı) —
   * kontrol olmadan `this.scene.input.off(...)` fırlatır.
   */
  destroy(fromScene?: boolean): void {
    if (this.scene?.input) {
      this.scene.input.off('pointerdown', this.onPointerDown, this);
      this.scene.input.off('pointermove', this.onPointerMove, this);
      this.scene.input.off('pointerup', this.onPointerUp, this);
      this.scene.input.off('pointerupoutside', this.onPointerUp, this);
    }

    super.destroy(fromScene);
  }

  /**
   * İşaretçi konumunu bu katmanın ÇİZİM uzayına çevirir.
   *
   * `pointer.x/y` rasterleme (backing store) pikselidir. Kamera bir
   * yakınlaştırma uyguluyorsa — çözünürlük ölçeği ya da yüksek DPR yüzünden —
   * `scrollFactor: 0` olan bu katman da o yakınlaştırmayla çizilir; ham
   * işaretçi konumu kullanılırsa joystick parmaktan kayar ve yanlış boyutta
   * görünür (bkz. `GetCalcMatrix`: scrollFactor yalnız ÖTELEMEYİ iptal eder,
   * ölçeği değil).
   *
   * Ölçek kameranın orta noktası etrafında uygulanır; tersi de öyle alınır
   * (bkz. `screenToCameraLayer`).
   */
  private toLayerSpace(x: number, y: number): { x: number; y: number } {
    const camera = this.scene.cameras?.main;
    const zoom = camera?.zoom ?? 1;
    return {
      x: screenToCameraLayer(
        x,
        camera?.x ?? 0,
        (camera?.width ?? this.scene.scale.width) / 2,
        zoom,
      ),
      y: screenToCameraLayer(
        y,
        camera?.y ?? 0,
        (camera?.height ?? this.scene.scale.height) / 2,
        zoom,
      ),
    };
  }

  /** İşaretçiyi kamera viewport'una göre [0,1] ekran oranına çevirir. */
  private toViewportRatio(x: number, y: number): { x: number; y: number } {
    const camera = this.scene.cameras?.main;
    const originX = camera?.x ?? 0;
    const originY = camera?.y ?? 0;
    const width = camera?.width ?? this.scene.scale.width;
    const height = camera?.height ?? this.scene.scale.height;
    return {
      x: width > 0 ? (x - originX) / width : Number.NaN,
      y: height > 0 ? (y - originY) / height : Number.NaN,
    };
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (!pointer.wasTouch) {
      return;
    }

    const ratio = this.toViewportRatio(pointer.x, pointer.y);
    // Orta çizgi iki varsayılan bölgeye de dahildir; mevcut sözleşmedeki gibi
    // sağ taraf kazanır. Sağ stick kapalıysa aynı çizgiyi sol stick alabilir.
    const isRight =
      this.rightStickRegion !== null &&
      isPointInNormalizedRegion(ratio.x, ratio.y, this.rightStickRegion);
    const isLeft =
      this.leftStickRegion !== null &&
      isPointInNormalizedRegion(ratio.x, ratio.y, this.leftStickRegion);
    if (!isRight && !isLeft) return;

    const position = this.toLayerSpace(pointer.x, pointer.y);
    this.sticks.onPointerDown(pointer.id, position.x, position.y, isRight);
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    const position = this.toLayerSpace(pointer.x, pointer.y);
    this.sticks.onPointerMove(pointer.id, position.x, position.y);
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    this.sticks.onPointerUp(pointer.id);
  }

  private drawSticks(): void {
    this.graphics.clear();

    const sticks = [this.sticks.getLeftStick(), this.sticks.getRightStick()];
    for (const stick of sticks) {
      if (!stick) {
        continue;
      }

      const isArmedAimStick = stick.isRight && this.aimStickActivatesOnTouch;
      const hasManualDirection = isArmedAimStick && this.sticks.hasDirectionalInput(stick);
      this.graphics.fillStyle(
        isArmedAimStick ? STICK_ARMED_BASE_COLOR : STICK_BASE_COLOR,
        UI_ALPHA.STICK_BASE,
      );
      this.graphics.fillCircle(stick.base.x, stick.base.y, this.sticks.maxRadius);

      const thumbPos = this.sticks.getClampedPosition(stick);
      if (isArmedAimStick) {
        const feedbackColor = hasManualDirection ? STICK_MANUAL_COLOR : STICK_ARMED_COLOR;
        this.graphics.lineStyle(
          UI_SIZE.STICK_ACTION_RING_WIDTH,
          feedbackColor,
          UI_ALPHA.STICK_ACTION_RING,
        );
        this.graphics.strokeCircle(stick.base.x, stick.base.y, this.sticks.maxRadius);
        if (hasManualDirection) {
          this.graphics.lineStyle(
            UI_SIZE.STICK_DIRECTION_WIDTH,
            feedbackColor,
            UI_ALPHA.STICK_DIRECTION,
          );
          this.graphics.lineBetween(stick.base.x, stick.base.y, thumbPos.x, thumbPos.y);
        }
      }
      this.graphics.fillStyle(
        isArmedAimStick
          ? hasManualDirection
            ? STICK_MANUAL_COLOR
            : STICK_ARMED_COLOR
          : STICK_THUMB_COLOR,
        UI_ALPHA.STICK_THUMB,
      );
      this.graphics.fillCircle(thumbPos.x, thumbPos.y, UI_SIZE.STICK_THUMB_RADIUS);
    }
  }
}
