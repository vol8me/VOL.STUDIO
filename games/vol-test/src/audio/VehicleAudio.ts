import { DisposableScope } from '@volstudio/core/lifecycle';
import { LoopBlend } from '@volstudio/core/audio/sfx';
import { angleDelta, clamp01, lerp } from '@volstudio/core/math';
import { AUDIO, type VehicleVoice } from '@/config/audio';
import { GAME } from '@/config/game';
import { chassisConfigOf, STRIKER, topSpeedOf, type VehicleSpec } from '@/config/vehicles';
import type { Chassis, ChassisKind } from '@/sim/chassis/Chassis';
import { audioUrl } from './assets';
import { spatialSound, type AudioPosition } from './spatial';

/** Şasi türüne göre ayak sesi: döngü dosyası ve sayıları. */
interface StrideVoice {
  readonly loop: string;
  readonly config: { readonly gain: number; readonly rateMin: number; readonly rateMax: number };
}

const STRIDE: Readonly<Record<ChassisKind, StrideVoice>> = {
  tank: { loop: 'tracks', config: AUDIO.tracks },
  walker: { loop: 'legs', config: AUDIO.legs },
  hover: { loop: 'fans', config: AUDIO.fans },
  mech: { loop: 'steps', config: AUDIO.steps },
  leaper: { loop: 'bounds', config: AUDIO.bounds },
};

export class VehicleAudio {
  private readonly scope = new DisposableScope();
  private readonly engine: LoopBlend;
  private readonly tracks: LoopBlend;
  private readonly skid: LoopBlend;
  private readonly servo: LoopBlend;
  private readonly boost: LoopBlend;
  private readonly loops: readonly LoopBlend[];
  readonly ready: Promise<void>;
  /** Yük ölçeği: yürüyücüde yüzey kayması olmadığından yük hep sıfırdır. */
  private readonly driveSlip: number;
  /** Yürüyücüde palet gümbürtüsü yerine bacak adımı, süzülende pervane uğultusu çalar. */
  private readonly stride: StrideVoice;
  private readonly voice: VehicleVoice;
  private braking = false;
  private dashing = false;
  /** Bu güncellemede süzülen araç ya da yürüyücünün atılımı başladı (tankın hızlanması döngüdür). */
  dashStarted = false;
  /** Bu güncellemede sıçrayıcı yere indi (sıçramanın bitişi); başka araçta hep `false`. */
  landed = false;
  private released = false;

  constructor(
    context: AudioContext,
    destination: AudioNode,
    private readonly spec: VehicleSpec = STRIKER,
  ) {
    this.driveSlip = spec.kind === 'tank' ? spec.tank.driveSlip : 1;
    this.voice = AUDIO.vehicleVoice[spec.id];
    const loop = (name: string): LoopBlend =>
      this.scope.add(
        new LoopBlend(context, destination, [
          { at: 0, url: audioUrl(`${AUDIO.loopAssetRoot}/${name}.ogg`) },
        ]),
      );
    this.engine = this.scope.add(
      new LoopBlend(
        context,
        destination,
        AUDIO.engineLayers.map((layer) => ({
          at: layer.at,
          pitch: layer.pitch,
          url: audioUrl(`${AUDIO.loopAssetRoot}/${layer.name}.ogg`),
        })),
      ),
    );
    this.stride = STRIDE[spec.kind];
    this.tracks = loop(this.stride.loop);
    this.skid = loop('skid');
    this.servo = loop('servo');
    this.boost = loop('boost');
    this.loops = [this.engine, this.tracks, this.skid, this.servo, this.boost];
    this.ready = Promise.all(this.loops.map((voice) => voice.load())).then(() => undefined);
  }

  update(tank: Chassis, listener: AudioPosition, paused: boolean): boolean {
    if (this.released) return false;
    const spatial = spatialSound(tank, listener);
    const speed = Math.hypot(tank.vx, tank.vy);
    const motion = clamp01(
      Math.max(Math.abs(tank.trackLeft), Math.abs(tank.trackRight)) / topSpeedOf(this.spec),
    );
    // Yük, palet yüzeyi ile ZEMİN HIZI arasındaki farktandır.
    // `groundLeft/groundRight` katettiği YOLDUR (işaretli integral), hız
    // değildir: onunla ölçmek tank durduktan sonra da kalıcı bir "yük" üretir
    // ve motor döngüsü hiç durmaz.
    const slipLeft = Math.abs(tank.trackLeft - tank.surfaceLeft);
    const slipRight = Math.abs(tank.trackRight - tank.surfaceRight);
    const load = clamp01((slipLeft + slipRight) / (2 * this.driveSlip));
    const level = clamp01(
      motion * AUDIO.engine.speedWeight +
        load * AUDIO.engine.loadWeight +
        (tank.boosting ? AUDIO.engine.boostLoad : 0),
    );
    const slide = clamp01(Math.max(tank.slideLeft, tank.slideRight) / AUDIO.skid.fullSlide);
    const turning = clamp01(
      Math.abs(angleDelta(tank.previous.turret, tank.turret)) /
        (GAME.simulationStepMs / 1000) /
        chassisConfigOf(this.spec).turretTurnRate,
    );
    this.engine.setLevel(level);
    this.engine.setPitch(
      lerp(AUDIO.engine.idleRpm, AUDIO.engine.maxRpm, level) * this.voice.engine,
    );
    const stride = this.stride.config;
    this.tracks.setRate(lerp(stride.rateMin, stride.rateMax, motion) * this.voice.tracks);
    this.skid.setRate(lerp(AUDIO.skid.rateMin, AUDIO.skid.rateMax, slide));
    this.servo.setRate(lerp(AUDIO.servo.rateMin, AUDIO.servo.rateMax, turning));
    const gains = [
      motion > AUDIO.engine.motionFloor || load > AUDIO.engine.motionFloor || tank.boosting
        ? AUDIO.engine.gain * this.voice.engineGain
        : 0,
      stride.gain * motion,
      AUDIO.skid.gain * slide,
      AUDIO.servo.gain * turning,
      tank.boosting ? AUDIO.boost.gain : 0,
    ];
    this.loops.forEach((voice, index) => {
      const gain = paused ? 0 : gains[index] * spatial.gain;
      voice.setGain(gain);
      voice.setPan(spatial.pan);
      if (gain <= AUDIO.loopMinGain) voice.stop();
      else voice.start();
    });
    this.dashStarted = this.spec.kind !== 'tank' && tank.boosting && !this.dashing;
    this.landed = this.spec.kind === 'leaper' && this.dashing && !tank.boosting;
    this.dashing = tank.boosting;
    const brakeEdge = tank.braking && !this.braking && speed >= AUDIO.brakeMinSpeed;
    this.braking = tank.braking;
    return !paused && brakeEdge;
  }

  stop(): void {
    for (const voice of this.loops) voice.stop();
  }
  dispose(): void {
    this.released = true;
    this.scope.dispose();
  }
}
