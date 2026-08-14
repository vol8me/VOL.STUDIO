import type { Random, Vector2 } from '@volstudio/core';
import type { EnemyDefinition } from '@/config/enemies/types';
import { eliteConfig } from '@/config/elite';
import type { Enemy } from './Enemy';
import type { Border } from './Border';
import type { SpatialGrid } from '@/runtime/systems/SpatialGrid';
import type { EffectManager } from '@/runtime/systems/EffectManager';
import type { TelegraphHandle, TelegraphManager } from '@/runtime/systems/TelegraphManager';
import {
  applyRusherBehavior,
  applySeekBehavior,
  applySwarmerBehavior,
  createMinionSpawnRequest,
  createRusherState,
  createSwarmerState,
  type MinionSpawnRequest,
  type MutableBehaviorContext,
  type RusherState,
  type SwarmerState,
  type VelocityOutput,
} from './behaviors';

export interface EliteControllerDeps {
  effects: EffectManager;
  telegraphs: TelegraphManager;
  random: Random;
  /** Minion doğurma isteğini karşılar — `EnemyManager` sağlar. */
  spawnMinions: (parent: Enemy, request: MinionSpawnRequest) => void;
}

/**
 * Elite (Warden) yapay zekâsı — rusher ve swarmer davranışlarının KOMPOZİSYONU.
 *
 * Yeni bir davranış icat etmez: Aşama 1'de yazılan `applyRusherBehavior` ve
 * `applySwarmerBehavior` fonksiyonlarını AYNI ANDA çalıştırır. Rusher hareketi
 * verir (yaklaş → telegraf → atıl → toparlan), swarmer ise yalnızca doğurma
 * saatini işletir — konumlanmasını değil. İkisi tek gövdede birleşince
 * "kovalayan VE sürü besleyen" bir düşman çıkar.
 *
 * `Enemy` sınıfına dokunmaz: elite düşman normal bir `Enemy` nesnesidir,
 * hareketi bu kontrolcü dışarıdan sürer. Böylece temel düşman mantığı
 * şişmez ve elite'e özgü her şey tek dosyada kalır.
 */
export class EliteController {
  private readonly rusherState: RusherState = createRusherState();
  private readonly swarmerState: SwarmerState = createSwarmerState();
  private readonly spawnRequest: MinionSpawnRequest = createMinionSpawnRequest();
  private readonly velocity: VelocityOutput = { x: 0, y: 0 };
  private context: MutableBehaviorContext | null = null;
  /** Doğurma sırasında bekleyen telegraph varsa yeni bir tane açılmaz. */
  private spawnTelegraphActive = false;
  /** Atılım telegraf'ı bu faz için bir kez açılır. */
  private dashTelegraphShown = false;
  private dashTelegraph: TelegraphHandle | null = null;
  private spawnTelegraph: TelegraphHandle | null = null;

  constructor(
    private readonly enemy: Enemy,
    private readonly definition: EnemyDefinition,
    private readonly deps: EliteControllerDeps,
  ) {}

  get isAlive(): boolean {
    return this.enemy.isAlive;
  }

  /** Elite'in kendisi — çarpışma/hasar için `EnemyManager` listesinde durur. */
  getEnemy(): Enemy {
    return this.enemy;
  }

  /**
   * Bir frame yürütür. `EnemyManager`, elite'i normal düşman döngüsünden
   * ÇIKARIP bunu çağırır: hareket kontrolü tamamen buradadır.
   */
  update(deltaMs: number, playerPos: Vector2, border: Border, grid: SpatialGrid): void {
    if (!this.enemy.isAlive) return;

    const context = this.syncContext(deltaMs, playerPos);

    this.updateDash(context);
    this.updateSpawning(context);

    this.enemy.moveBy(this.velocity.x, this.velocity.y, deltaMs, border, grid);
  }

  /**
   * Elite öldü/sahne kapandı — bekleyen telegraph'lar ve doğurma işlemleri
   * durdurulsun.
   */
  destroy(): void {
    this.dashTelegraph?.cancel();
    this.dashTelegraph = null;
    this.spawnTelegraph?.cancel();
    this.spawnTelegraph = null;
    this.dashTelegraphShown = false;
  }

  /** Rusher davranışı — hareketi bu belirler, atılım telegraph'lıdır. */
  private updateDash(context: MutableBehaviorContext): void {
    const rusher = this.definition.rusher;
    if (!rusher) {
      applySeekBehavior(context, this.enemy.radius, this.velocity);
      return;
    }

    const phaseBefore = this.rusherState.phase;
    applyRusherBehavior(this.rusherState, context, rusher, this.enemy.radius, this.velocity);

    // Telegraph, windup fazına GİRİLDİĞİ frame'de bir kez açılır. Uyarı
    // süresi windup süresiyle aynıdır: uyarı sönerken atılım başlar.
    if (this.rusherState.phase === 'windup' && !this.dashTelegraphShown) {
      this.dashTelegraphShown = true;
      const angle = Math.atan2(context.targetY - context.y, context.targetX - context.x);
      // Telegraph yalnızca GÖSTERGEDİR; hasarı atılımın kendisi (temas) verir,
      // bu yüzden resolve edildiğinde yapılacak bir iş yok.
      this.dashTelegraph = this.deps.telegraphs.play({
        durationMs: rusher.windupMs,
        shape: 'line',
        x: this.enemy.x,
        y: this.enemy.y,
        angle,
        radius: rusher.triggerDistance,
        width: this.enemy.radius * eliteConfig.dashTelegraphWidthRatio,
        color: this.definition.color,
      });
    }

    if (phaseBefore === 'dash' && this.rusherState.phase !== 'dash') {
      this.dashTelegraph?.cancel();
      this.dashTelegraph = null;
      this.dashTelegraphShown = false;
    }
    if (this.rusherState.dashStarted) {
      const angleDeg =
        Math.atan2(-this.rusherState.dashDirY, -this.rusherState.dashDirX) * (180 / Math.PI);
      this.deps.effects.play('enemyDash', this.enemy.x, this.enemy.y, angleDeg);
    }
  }

  /**
   * Swarmer davranışı — YALNIZCA doğurma saati.
   *
   * Hız çıktısı bilinçli olarak atılır: standoff (mesafe koruma) elite'in
   * rusher hareketiyle çelişirdi. Elite yaklaşmalı ki atılabilsin.
   */
  private updateSpawning(context: MutableBehaviorContext): void {
    const swarmer = this.definition.swarmer;
    if (!swarmer) return;

    this.swarmerState.aliveMinions = this.enemy.getAliveMinionCount();
    const request = applySwarmerBehavior(
      this.swarmerState,
      context,
      swarmer,
      // Atılan hız — standoff elite'in hareketini bozmasın diye ayrı tampon.
      this.discardedVelocity,
      this.spawnRequest,
    );
    if (!request || this.spawnTelegraphActive) return;

    // Doğurma da telegraph'lı: sürü birden bire belirmez, oyuncu konumlanabilir.
    this.spawnTelegraphActive = true;
    const x = this.enemy.x;
    const y = this.enemy.y;
    // İstek nesnesi yeniden kullanılıyor; telegraph beklerken üzerine
    // yazılabilir, bu yüzden kopyası alınır.
    const pending: MinionSpawnRequest = {
      minionId: request.minionId,
      count: request.count,
      radius: request.radius,
      angles: [...request.angles],
    };

    this.spawnTelegraph = this.deps.telegraphs.play({
      durationMs: eliteConfig.spawnTelegraphMs,
      shape: 'circle',
      x,
      y,
      radius: pending.radius + eliteConfig.spawnTelegraphPaddingPx,
      color: this.definition.color,
    });

    void this.spawnTelegraph.promise
      .then((result) => {
        this.spawnTelegraphActive = false;
        // Uyarı sırasında elite ölmüş veya iptal edilmişse sürü mezardan çıkmasın.
        if (!result.completed || !this.enemy.isAlive) return;
        this.deps.spawnMinions(this.enemy, pending);
      })
      .finally(() => {
        this.spawnTelegraph = null;
      });
  }

  /** Standoff hızının atıldığı tampon — her frame üzerine yazılır. */
  private readonly discardedVelocity: VelocityOutput = { x: 0, y: 0 };

  /** Bağlam nesnesi elite başına bir kez kurulur, her frame yerinde güncellenir. */
  private syncContext(deltaMs: number, playerPos: Vector2): MutableBehaviorContext {
    const context: MutableBehaviorContext = (this.context ??= {
      x: this.enemy.x,
      y: this.enemy.y,
      targetX: playerPos.x,
      targetY: playerPos.y,
      deltaMs,
      speed: 0,
      random: this.deps.random,
    });
    context.x = this.enemy.x;
    context.y = this.enemy.y;
    context.targetX = playerPos.x;
    context.targetY = playerPos.y;
    context.deltaMs = deltaMs;
    context.speed = Math.max(0, this.enemy.getStats().getValue('speed'));
    context.random = this.deps.random;
    return context;
  }
}
