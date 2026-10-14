import type { InputHandle, Predict, Room, SimReconciler } from '@volstudio/network/client';
import { lerpAngle } from '@volstudio/core/math';
import { COMBAT } from '@/config/combat';
import { GAME } from '@/config/game';
import { NETWORK } from '@/config/network';
import { STRIKER, vehicleAt } from '@/config/vehicles';
import { Vehicle } from '@/sim/entities/Vehicle';
import { stepPredictedVehicle, type Launch } from '@/sim/vehicleStep';
import { createChassisState } from '@/sim/chassis/ChassisState';
import type { World } from '@/sim/world/World';
import type { TankCommand } from '@/sim/command';
import {
  NO_TEAM,
  toCommand,
  type WorldSnapshot,
  type PlayerSnapshot,
  type TankInputData,
  type TankInputFields,
} from './schema';
import { readChassisState } from './chassisSync';

/** Öngörülen aracın çizim pozu: SDK'nın ara değerli ve düzeltme ofsetli okuması. */
export interface PilotPose {
  x: number;
  y: number;
  hull: number;
  turret: number;
  pitch: number;
  roll: number;
  [key: string]: number;
}

interface PilotWorld {
  vehicle: Vehicle;
  space: World;
}

export interface PilotOptions {
  readonly room: Room<WorldSnapshot>;
  readonly predict: Predict;
  readonly self: PlayerSnapshot;
  readonly space: World;
  /**
   * Verilirse her uzlaştırmada düzeltme büyüklüğü ölçülür (`reconciler.drift`, `lastCorrectionMag`)
   * ve kalıcı sapma bu eşiği aşarsa konsola uyarı yazar. Verilmezse SDK sapmayı hiç ölçmez
   * (`drift` hep 0 kalır); oyun dünyası her zaman verir.
   */
  readonly divergenceTolerance?: number;
  /**
   * Sürülecek araç; verilmezse pilot kendisi kurar. Görünüm modeli aracı kendi `Simulation`ında
   * doğurup verir: çizim, ses ve HUD aynı nesneyi okur.
   */
  readonly vehicle?: Vehicle;
  /**
   * Canlı (yeniden oynatma olmayan) adımda ateş edildiğinde çağrılır; mermiyi sunucu doğurur,
   * istemci kendi mermisini bu değerlerle görsel olarak uçurur.
   */
  readonly onFired?: (launch: Launch, mount: number) => void;
}

/**
 * Kendi aracımız: girdi her sabit adımda hem sunucuya yollanır hem aynı adım işleviyle yerelde
 * koşulur (öngörü). Sunucu onayı gelince Colyseus yetkili durumu geri yükler ve onaylanmamış
 * girdileri yeniden oynatır; sapma `reconciler.drift` ile ölçülür.
 */
export class PredictedPilot {
  readonly vehicle: Vehicle;
  readonly input: InputHandle<TankInputData>;
  readonly reconciler: SimReconciler<TankInputFields, PilotPose, PilotWorld>;
  private readonly scratch = createChassisState();

  constructor(private readonly options: PilotOptions) {
    const { room, predict, self, space } = options;
    this.vehicle =
      options.vehicle ??
      new Vehicle(
        self.vehicleId,
        vehicleAt(self.model) ?? STRIKER,
        COMBAT,
        self.team === NO_TEAM ? null : self.team,
      );
    this.input = room.input<TankInputData>();
    if (this.input.stepMs !== GAME.simulationStepMs)
      throw new Error(
        `Sunucu adımı (${this.input.stepMs} ms) istemci adımından (${GAME.simulationStepMs} ms) farklı.`,
      );
    this.adopt(this.vehicle);
    this.reconciler = predict.sim<TankInputData, PilotPose, PilotWorld>({
      input: this.input,
      world: { vehicle: this.vehicle, space },
      // Büyük sıçrama (yeniden doğma) kayan düzeltme değil, ışınlanmadır.
      snap: NETWORK.snapDistance,
      warnOnDivergence: options.divergenceTolerance,
      step: (ctx, world, command) => {
        stepPredictedVehicle(
          world.vehicle,
          toCommand(command),
          world.space,
          GAME.simulationStepMs,
          // Yeniden oynatılan atış zaten bildirildi; yalnız canlı adım mermi uçurur.
          ctx.isReplay ? undefined : this.options.onFired,
        );
      },
      adopt: (world) => this.adopt(world.vehicle),
      pose: (world) => this.readPose(world.vehicle),
      interpolate: (a, b, t) => ({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        hull: lerpAngle(a.hull, b.hull, t),
        turret: lerpAngle(a.turret, b.turret, t),
        pitch: a.pitch + (b.pitch - a.pitch) * t,
        roll: a.roll + (b.roll - a.roll) * t,
      }),
    });
  }

  /** Sunucunun yetkili durumunu araca kurar; öngörü bu noktadan yeniden başlar. */
  private adopt(vehicle: Vehicle): void {
    const self = this.options.self;
    vehicle.chassis.restoreState(readChassisState(self, this.scratch));
    vehicle.gun.restore(self.gunMs);
    vehicle.salvo = self.salvo;
    vehicle.vitality.health = self.health;
    vehicle.vitality.respawnRemainingMs = self.respawnMs;
    vehicle.vitality.protectionRemainingMs = self.protectionMs;
  }

  private readPose(vehicle: Vehicle): PilotPose {
    const tank = vehicle.chassis;
    return {
      x: tank.x,
      y: tank.y,
      hull: tank.hull,
      turret: tank.turret,
      pitch: tank.suspension.pitch,
      roll: tank.suspension.roll,
    };
  }

  /**
   * Bu adımın niyetini yollar ve (öngörü gözlemcisi sayesinde) yerelde koşturur. Eksenler tel
   * kesinliğine (`float32`) önceden yuvarlanır: yerel adım ile sunucunun okuduğu değer bit bit aynı
   * olsun, yoksa her adımda ~1e-7'lik bir sapma birikir.
   */
  send(command: TankCommand): number {
    const data = this.input.data;
    data.moveX = Math.fround(command.moveX);
    data.moveY = Math.fround(command.moveY);
    data.aimX = Math.fround(command.aimX);
    data.aimY = Math.fround(command.aimY);
    data.fire = command.fire;
    data.boost = command.boost;
    data.brake = command.brake;
    return this.input.send();
  }

  /** Çizim pozu; `predict.tick` ve gönderimlerden SONRA okunmalıdır. */
  pose(): PilotPose {
    return this.reconciler.pose();
  }

  get drift(): { ema: number; peak: number } {
    return this.reconciler.drift;
  }

  dispose(): void {
    (this.reconciler as unknown as { dispose?: () => void }).dispose?.();
  }
}
