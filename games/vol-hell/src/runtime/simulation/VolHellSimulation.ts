import { createRandom, type Random } from '@volstudio/core/random/random';
import { SpatialIndex } from '@volstudio/core/spatial/SpatialIndex';
import { simulationConfig } from '@/config/simulation';
import { economyConfig } from '@/config/economy';
import { enemyConfig } from '@/config/enemy';
import { physicsConfig } from '@/config/physics';
import { playerConfig } from '@/config/player';
import { bulletConfig } from '@/config/bullet';
import { getMaxEnemyRadius, pickEnemyDefinition } from '@/config/enemies/catalog';
import type { EnemyDefinition } from '@/config/enemies/types';
import { createEnemyStats, quantizeEnemyHealth } from '@/runtime/entity/enemyStats';
import {
  applyRusherBehavior,
  applySeekBehavior,
  applySwarmerBehavior,
  createMinionSpawnRequest,
  createRusherState,
  createSwarmerState,
  type BehaviorContext,
  type MinionSpawnRequest,
  type MutableBehaviorContext,
  type VelocityOutput,
} from '@/runtime/entity/behaviors';
import { getDifficultyState } from '@/runtime/systems/DifficultyCalculator';
import { RunEconomy } from '@/runtime/systems/RunEconomy';
import { WaveManager } from '@/runtime/systems/WaveManager';
import { finiteOr, nonNegativeFinite, safeDeltaMs, saturatingAdd } from '@/runtime/utils/numeric';
import { clampToBounds, defaultPlayerPosition, findDefinition, withMetrics } from './helpers';
import { createRenderSnapshot, createSimulationSnapshot } from './snapshots';
import type {
  SimulationBoundsWithMetrics,
  SimulationEnemyState,
  SimulationPickup,
  SimulationPlayerPosition,
  VolHellSimulationOptions,
  VolHellRenderSnapshot,
  VolHellSimulationSnapshot,
} from './types';
export type {
  SimulationBounds,
  SimulationEnemyView,
  SimulationPickupView,
  SimulationPlayerPosition,
  VolHellRenderSnapshot,
  VolHellSimulationOptions,
  VolHellSimulationSnapshot,
} from './types';

/**
 * VOL.HELL'in render-free oyun modeli.
 *
 * Bu sınıf Phaser, Scene, GameObject, EffectManager veya ses bilmez. Katalog,
 * davranış fonksiyonları, dalga ve ekonomi sistemlerini bir araya getirir;
 * render katmanı yalnızca bu durumun üstüne görsel bir adaptör kurar. Böylece
 * uzun koşu regresyonu ve benchmark gerçek oyun akışını render maliyetiyle
 * karıştırmadan çalıştırır.
 *
 * **BU, ÜRETİM OYUNUNUN KANONİK SİMÜLASYONU DEĞİLDİR — kısmi, bilinçli bir
 * modeldir.** Gerçek `GameScene` (Phaser) ile eşleşmeyen üç somut nokta:
 *
 * 1. **Savaş yaklaşıksamadır.** `resolveAutomaticAttack()` oyuncunun mermi/
 *    ability sistemini simüle ETMEZ; `killRadius` içine giren her düşmanı o
 *    karede doğrudan öldürür. Gerçek oyunda hasar, atış hızı, ability
 *    cooldown'u ve ıskalama payı vardır — bu model bunların HİÇBİRİNİ
 *    bilmez, yalnızca "oyuncu yakındaki düşmanı öldürür" varsayımını taşır.
 * 2. **Elite/Boss AI'ı burada YOKTUR.** `eliteWaves`/`bossWaves` yalnızca
 *    HANGİ dalgada bir elite/boss'un başladığını kaydeder; telegraph,
 *    faz geçişi, özel saldırı gibi gerçek davranış tamamen Phaser
 *    tarafındaki `EliteController`/`TelegraphManager`e aittir (bkz.
 *    `games/vol-hell/README.md` "Simülasyon / render sınırı").
 * 3. **Ability sistemi (kule, zincir şimşek, ateş alanı, çoklu atış)
 *    burada YOKTUR** — oyuncunun aktif kart/yükseltme seçimi bu modele
 *    hiç yansımaz.
 *
 * Bu sınırın ötesi: benchmark ve uzun-koşu regresyon testleri (`ölü
 * düşmanlar listede birikmez`, `konumlar sonlu kalır` gibi) gerçek oyun
 * DENEYİMİNİ değil, dalga/ekonomi/spawn/spatial-index ZİNCİRİNİN bütünlüğünü
 * doğrular. Bu sınıftaki bir sayı (skor, DPS, zorluk hissi) oyunun gerçek
 * dengesi için KANIT sayılmaz — yalnızca `games/vol-hell/src/runtime/
 * scene/GameScene.ts` + gerçek cihaz smoke testi budur.
 */
export class VolHellSimulation {
  readonly economy: RunEconomy;
  private readonly bounds: SimulationBoundsWithMetrics;
  private readonly random: Random;
  private readonly playerPosition: SimulationPlayerPosition;
  private readonly killRadius: number | null;
  private readonly enemies: SimulationEnemyState[] = [];
  private readonly pickups: SimulationPickup[] = [];
  private readonly enemyIndex: SpatialIndex<SimulationEnemyState>;
  private readonly velocity: VelocityOutput = { x: 0, y: 0 };
  private readonly discardedVelocity: VelocityOutput = { x: 0, y: 0 };
  private readonly waves: number[] = [];
  private readonly shopTriggers: number[] = [];
  private readonly levelUps: number[] = [];
  private readonly eliteWaves: number[] = [];
  private readonly bossWaves: number[] = [];
  private readonly waveManager: WaveManager;
  private nextEnemyId = 1;
  private currentWave = 0;
  private spawnTimerMs = 0;
  private frame = 0;
  private elapsedMs = 0;
  private playerX: number;
  private playerY: number;
  private maxEnemyCount = 0;
  private maxPickupCount = 0;
  private runCompleted = false;

  public constructor(options: VolHellSimulationOptions = {}) {
    this.bounds = withMetrics(options.bounds ?? simulationConfig.bounds);
    this.random = createRandom(options.seed ?? simulationConfig.defaultSeed);
    this.playerPosition = options.playerPosition ?? defaultPlayerPosition;
    this.killRadius =
      options.killRadius === null
        ? null
        : nonNegativeFinite(options.killRadius ?? simulationConfig.defaultKillRadius);

    this.playerX = this.bounds.centerX;
    this.playerY = this.bounds.centerY;
    this.enemyIndex = new SpatialIndex<SimulationEnemyState>(
      Math.max(getMaxEnemyRadius(), bulletConfig.radius) * physicsConfig.spatialGridCellMultiplier,
      (enemy) => enemy.isAlive,
    );

    this.economy = new RunEconomy({
      onLevelUp: (level) => this.levelUps.push(level),
    });
    this.waveManager = new WaveManager({
      onWaveStart: (wave) => {
        this.currentWave = wave;
        this.waves.push(wave);
      },
      onWaveEnd: (wave) => this.shopTriggers.push(wave),
      onEliteWave: (wave) => this.eliteWaves.push(wave),
      onBossWave: (wave) => this.bossWaves.push(wave),
      onWaveClear: () => this.clearRegularState(),
      onRunComplete: () => {
        this.runCompleted = true;
      },
    });
    this.waveManager.start();
  }

  /** Bir simülasyon frame'ini ilerletir. Negatif/sonsuz delta yok sayılır. */
  public step(deltaMs: number): void {
    const safeDelta = safeDeltaMs(deltaMs);
    if (safeDelta <= 0 || this.runCompleted) return;

    this.elapsedMs = saturatingAdd(this.elapsedMs, safeDelta);
    const position = this.playerPosition(this.frame, this.bounds);
    this.playerX = clampToBounds(position.x, this.bounds.left, this.bounds.right);
    this.playerY = clampToBounds(position.y, this.bounds.top, this.bounds.bottom);

    this.waveManager.update(safeDelta);
    this.updateEnemies(safeDelta);
    this.updatePickups(safeDelta);
    this.resolveAutomaticAttack();
    this.compactDeadEnemies();

    this.frame += 1;
    this.maxEnemyCount = Math.max(this.maxEnemyCount, this.enemies.length);
    this.maxPickupCount = Math.max(this.maxPickupCount, this.pickups.length);
  }

  /** Verilen sayıda frame'i aynı delta ile işler. */
  public run(frames: number, stepMs: number = simulationConfig.defaultStepMs): void {
    const count = Math.max(0, Math.floor(nonNegativeFinite(frames)));
    for (let index = 0; index < count; index++) this.step(stepMs);
  }

  /** Render katmanına iç state'ten kopuk, kopyalanmış bir frame verir. */
  public getRenderSnapshot(): VolHellRenderSnapshot {
    return createRenderSnapshot(this.createSnapshotSource());
  }

  /** Simülasyonun o ana kadarki kopyalanmış özeti. */
  public snapshot(): VolHellSimulationSnapshot {
    return createSimulationSnapshot(this.createSnapshotSource());
  }

  private createSnapshotSource() {
    return {
      frame: this.frame,
      elapsedMs: this.elapsedMs,
      playerX: this.playerX,
      playerY: this.playerY,
      economy: this.economy,
      waveManager: this.waveManager,
      runCompleted: this.runCompleted,
      enemies: this.enemies,
      pickups: this.pickups,
      waves: this.waves,
      shopTriggers: this.shopTriggers,
      levelUps: this.levelUps,
      eliteWaves: this.eliteWaves,
      bossWaves: this.bossWaves,
      maxEnemyCount: this.maxEnemyCount,
      maxPickupCount: this.maxPickupCount,
    };
  }

  private updateEnemies(deltaMs: number): void {
    const difficulty = getDifficultyState(this.elapsedMs);
    this.spawnTimerMs = saturatingAdd(this.spawnTimerMs, deltaMs);
    const spawnInterval = nonNegativeFinite(difficulty.spawnIntervalMs);
    const maxEnemies = Math.max(0, Math.floor(nonNegativeFinite(difficulty.maxEnemies)));

    if (
      spawnInterval > 0 &&
      this.spawnTimerMs >= spawnInterval &&
      this.enemies.length < maxEnemies
    ) {
      if (this.spawnFromCatalog(difficulty.scoreMultiplier)) this.spawnTimerMs = 0;
      else this.spawnTimerMs = spawnInterval * enemyConfig.spawnRetryIntervalFactor;
    }

    // Her düşman aynı frame'in başındaki komşuluk görünümünü kullanır. İndeks
    // bir önceki frame'in sonunda artımlı olarak eşitlendiği için burada tam
    // rebuild gerekmez; bu, simülasyonun binlerce entity'ye ölçeklenebilmesini
    // sağlayan gerçek tüketici yoludur.
    const countAtStart = this.enemies.length;
    for (let index = countAtStart - 1; index >= 0; index--) {
      const enemy = this.enemies[index];
      if (!enemy || !enemy.isAlive) {
        this.removeEnemyAt(index);
        continue;
      }

      const request = this.updateEnemy(enemy, deltaMs);
      if (request) this.spawnMinions(enemy, request, difficulty.scoreMultiplier);
      if (!enemy.isAlive) this.removeEnemyAt(index);
    }

    // Hareketler separation hesabının kullandığı frame-başı görünümü bozmasın;
    // bütün hareketler bittikten sonra hücre değişen entity'leri güncelle.
    this.syncEnemyIndex();
  }

  private updateEnemy(enemy: SimulationEnemyState, deltaMs: number): MinionSpawnRequest | null {
    const context = this.syncBehaviorContext(enemy, deltaMs);
    const request = this.runBehavior(enemy, context);
    const dt = deltaMs / 1000;
    this.applySeparation(enemy);
    enemy.x = clampToBounds(
      enemy.x + (finiteOr(this.velocity.x, 0) + this.discardedVelocity.x) * dt,
      this.bounds.left + enemy.radius,
      this.bounds.right - enemy.radius,
    );
    enemy.y = clampToBounds(
      enemy.y + (finiteOr(this.velocity.y, 0) + this.discardedVelocity.y) * dt,
      this.bounds.top + enemy.radius,
      this.bounds.bottom - enemy.radius,
    );
    return request;
  }

  private runBehavior(
    enemy: SimulationEnemyState,
    context: BehaviorContext,
  ): MinionSpawnRequest | null {
    this.velocity.x = 0;
    this.velocity.y = 0;
    this.discardedVelocity.x = 0;
    this.discardedVelocity.y = 0;
    const contactDistance = enemy.radius + playerConfig.hitboxRadius;

    if (enemy.rusherState && enemy.definition.rusher) {
      applyRusherBehavior(
        enemy.rusherState,
        context,
        enemy.definition.rusher,
        contactDistance,
        this.velocity,
      );
    } else if (enemy.swarmerState && enemy.definition.swarmer) {
      enemy.swarmerState.aliveMinions = this.pruneMinions(enemy);
      return applySwarmerBehavior(
        enemy.swarmerState,
        context,
        enemy.definition.swarmer,
        this.velocity,
        enemy.spawnRequest!,
      );
    } else {
      applySeekBehavior(context, contactDistance, this.velocity);
    }

    // Elite kompozisyonunda rusher hareketi korunur; swarmer yalnızca doğurma
    // saatidir. Böylece headless model, EliteController'ın kuralıyla çelişmez.
    if (enemy.definition.archetype === 'elite' && enemy.swarmerState && enemy.definition.swarmer) {
      enemy.swarmerState.aliveMinions = this.pruneMinions(enemy);
      return applySwarmerBehavior(
        enemy.swarmerState,
        context,
        enemy.definition.swarmer,
        this.discardedVelocity,
        enemy.spawnRequest!,
      );
    }
    return null;
  }

  private syncBehaviorContext(
    enemy: SimulationEnemyState,
    deltaMs: number,
  ): MutableBehaviorContext {
    const context: MutableBehaviorContext = (enemy.behaviorContext ??= {
      x: enemy.x,
      y: enemy.y,
      targetX: this.playerX,
      targetY: this.playerY,
      deltaMs,
      speed: 0,
      random: this.random,
    });
    context.x = enemy.x;
    context.y = enemy.y;
    context.targetX = this.playerX;
    context.targetY = this.playerY;
    context.deltaMs = deltaMs;
    context.speed = enemy.speed;
    context.random = this.random;
    return context;
  }

  private applySeparation(enemy: SimulationEnemyState): void {
    const nearby = this.enemyIndex.query(enemy.x, enemy.y);
    const separationScale = enemy.definition.baseStats.speed;
    let pushX = 0;
    let pushY = 0;
    for (const other of nearby) {
      if (other === enemy || !other.isAlive) continue;
      const dx = enemy.x - other.x;
      const dy = enemy.y - other.y;
      const distance = Math.hypot(dx, dy);
      const minDistance = enemy.radius + other.radius + enemyConfig.separationGap;
      if (!Number.isFinite(distance) || distance <= 0 || distance >= minDistance) continue;
      const force = (1 - distance / minDistance) * enemyConfig.separationForce;
      pushX += (dx / distance) * force * separationScale;
      pushY += (dy / distance) * force * separationScale;
    }
    this.discardedVelocity.x += pushX;
    this.discardedVelocity.y += pushY;
  }

  private spawnFromCatalog(scoreMultiplier: number): boolean {
    const definition = pickEnemyDefinition(this.random, this.currentWave);
    if (!definition) return false;
    const position = this.pickEdgePosition(definition.radius);
    if (
      Math.hypot(position.x - this.playerX, position.y - this.playerY) <
      enemyConfig.spawnMinPlayerDistance
    ) {
      return false;
    }
    const enemy = this.createEnemy(definition, position.x, position.y, scoreMultiplier);
    this.enemies.push(enemy);
    // Ana spawn hareket döngüsünden önce gerçekleşir; eski rebuild davranışını
    // koruyarak bu düşmanı aynı frame'in separation görünümüne dahil et.
    this.enemyIndex.insert(enemy);
    return true;
  }

  private spawnMinions(
    parent: SimulationEnemyState,
    request: MinionSpawnRequest,
    scoreMultiplier: number,
  ): void {
    if (!parent.isAlive || !Array.isArray(request.angles)) return;
    const definition = findDefinition(request.minionId);
    if (!definition) return;
    const count = Math.min(request.angles.length, Math.floor(nonNegativeFinite(request.count)));
    const maxEnemies = Math.max(0, Math.floor(getDifficultyState(this.elapsedMs).maxEnemies));
    for (let index = 0; index < count && this.enemies.length < maxEnemies; index++) {
      const angle = request.angles[index];
      if (!Number.isFinite(angle)) continue;
      const minion = this.createEnemy(
        definition,
        parent.x + Math.cos(angle) * nonNegativeFinite(request.radius),
        parent.y + Math.sin(angle) * nonNegativeFinite(request.radius),
        scoreMultiplier,
      );
      this.enemies.push(minion);
      parent.minions.push(minion);
    }
  }

  private createEnemy(
    definition: EnemyDefinition,
    x: number,
    y: number,
    scoreMultiplier: number,
  ): SimulationEnemyState {
    const stats = createEnemyStats(definition, getDifficultyState(this.elapsedMs));
    const maxHealth = quantizeEnemyHealth(stats.getValue('health'));
    return {
      id: this.nextEnemyId++,
      definition,
      radius: definition.radius,
      maxHealth,
      health: maxHealth,
      speed: nonNegativeFinite(stats.getValue('speed')),
      scoreValue: nonNegativeFinite(definition.scoreValue * scoreMultiplier),
      x: clampToBounds(
        x,
        this.bounds.left + definition.radius,
        this.bounds.right - definition.radius,
      ),
      y: clampToBounds(
        y,
        this.bounds.top + definition.radius,
        this.bounds.bottom - definition.radius,
      ),
      isAlive: true,
      rusherState: definition.rusher === undefined ? null : createRusherState(),
      swarmerState: definition.swarmer === undefined ? null : createSwarmerState(),
      spawnRequest: definition.swarmer === undefined ? null : createMinionSpawnRequest(),
      minions: [],
      behaviorContext: null,
    };
  }

  private updatePickups(deltaMs: number): void {
    for (let index = this.pickups.length - 1; index >= 0; index--) {
      const pickup = this.pickups[index];
      this.updatePickup(pickup, deltaMs);
      if (!pickup.settled) continue;
      if (
        Math.hypot(this.playerX - pickup.x, this.playerY - pickup.y) >
        playerConfig.hitboxRadius + economyConfig.flux.radius + economyConfig.flux.collectDistance
      ) {
        continue;
      }
      this.economy.addFlux(pickup.amount);
      this.removePickupAt(index);
    }
  }

  private updatePickup(pickup: SimulationPickup, deltaMs: number): void {
    if (!pickup.settled) {
      const duration = economyConfig.flux.drop.durationMs;
      pickup.dropElapsedMs += deltaMs;
      const t = Math.min(1, pickup.dropElapsedMs / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      pickup.x = pickup.originX + (pickup.landingX - pickup.originX) * eased;
      pickup.y =
        pickup.originY +
        (pickup.landingY - pickup.originY) * eased -
        Math.sin(t * Math.PI) * economyConfig.flux.drop.arcHeight;
      if (t >= 1) {
        pickup.x = pickup.landingX;
        pickup.y = pickup.landingY;
        pickup.settled = true;
      }
      return;
    }

    const dx = this.playerX - pickup.x;
    const dy = this.playerY - pickup.y;
    const distance = Math.hypot(dx, dy);
    if (Number.isFinite(distance) && distance > 0 && distance <= economyConfig.flux.magnetRadius) {
      const travel = Math.min((economyConfig.flux.magnetSpeed * deltaMs) / 1000, distance);
      pickup.x += (dx / distance) * travel;
      pickup.y += (dy / distance) * travel;
      pickup.bobElapsedMs = 0;
      return;
    }

    const bob = economyConfig.flux.bob;
    if (!bob.enabled || bob.periodMs <= 0) return;
    pickup.bobElapsedMs = (pickup.bobElapsedMs + deltaMs) % bob.periodMs;
    pickup.y =
      pickup.landingY +
      Math.sin((pickup.bobElapsedMs / bob.periodMs) * Math.PI * 2) * bob.amplitudePx;
  }

  private resolveAutomaticAttack(): void {
    if (this.killRadius === null) return;
    for (const enemy of this.enemies) {
      if (
        !enemy.isAlive ||
        Math.hypot(enemy.x - this.playerX, enemy.y - this.playerY) > this.killRadius
      ) {
        continue;
      }
      enemy.isAlive = false;
      enemy.health = 0;
      this.economy.addSpark(enemy.definition.sparkReward);
      this.dropFlux(enemy.x, enemy.y, enemy.definition.fluxReward);
    }
  }

  private compactDeadEnemies(): void {
    for (let index = this.enemies.length - 1; index >= 0; index--) {
      if (!this.enemies[index].isAlive) this.removeEnemyAt(index);
    }
  }

  private syncEnemyIndex(): void {
    for (const enemy of this.enemies) {
      if (enemy.isAlive) this.enemyIndex.update(enemy);
    }
  }

  private dropFlux(x: number, y: number, amount: number): void {
    const total = Math.floor(nonNegativeFinite(amount));
    if (total <= 0) return;
    const { maxDropsPerDeath, scatterRadius, maxActive } = economyConfig.flux;
    const pieceCount = Math.min(total, maxDropsPerDeath);
    const perPiece = Math.floor(total / pieceCount);
    let remainder = total - perPiece * pieceCount;
    for (let index = 0; index < pieceCount; index++) {
      const pieceAmount = perPiece + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder -= 1;
      if (this.pickups.length >= maxActive) {
        this.pickups[0].amount += pieceAmount;
        continue;
      }
      const angle = this.random.next() * Math.PI * 2;
      const distance = this.random.next() * scatterRadius;
      const landingX = clampToBounds(
        x + Math.cos(angle) * distance,
        this.bounds.left + economyConfig.flux.radius,
        this.bounds.right - economyConfig.flux.radius,
      );
      const landingY = clampToBounds(
        y + Math.sin(angle) * distance,
        this.bounds.top + economyConfig.flux.radius,
        this.bounds.bottom - economyConfig.flux.radius,
      );
      this.pickups.push({
        x,
        y,
        originX: x,
        originY: y,
        landingX,
        landingY,
        amount: pieceAmount,
        dropElapsedMs: 0,
        bobElapsedMs: 0,
        settled: false,
      });
    }
  }

  private clearRegularState(): void {
    this.enemies.length = 0;
    this.pickups.length = 0;
    this.enemyIndex.clear();
  }

  private pickEdgePosition(radius: number): { x: number; y: number } {
    const side = Math.floor(this.random.next() * enemyConfig.spawnEdgeCount);
    switch (side) {
      case 0:
        return {
          x: this.bounds.left + this.random.next() * this.bounds.width,
          y: this.bounds.top + radius,
        };
      case 1:
        return {
          x: this.bounds.left + this.random.next() * this.bounds.width,
          y: this.bounds.bottom - radius,
        };
      case 2:
        return {
          x: this.bounds.left + radius,
          y: this.bounds.top + this.random.next() * this.bounds.height,
        };
      default:
        return {
          x: this.bounds.right - radius,
          y: this.bounds.top + this.random.next() * this.bounds.height,
        };
    }
  }

  private removeEnemyAt(index: number): void {
    const removed = this.enemies[index];
    if (removed) this.enemyIndex.remove(removed);
    const last = this.enemies.pop();
    if (last && index < this.enemies.length) this.enemies[index] = last;
  }

  /**
   * Ölü minion referanslarını ebeveynin listesinden düşürür ve hayatta
   * kalan sayıyı döner.
   *
   * Önceden `enemy.minions.filter(m => m.isAlive).length` kullanılıyordu:
   * salt-okunur bir sayım, dizinin kendisini hiç küçültmüyordu. Bir
   * swarmer/elite koşu boyunca doğurduğu HER minion'un referansını sonsuza
   * kadar taşıyordu — hem bellek (ölü `SimulationEnemyState` nesneleri GC
   * edilemez), hem CPU (sayım maliyeti doğan minion sayısıyla, hayatta kalan
   * sayısıyla değil, büyür) sızıntısı. `Enemy.ts`teki Phaser eşleniği
   * (`pruneMinions`) zaten takas-ve-küçült yapıyordu; headless model aynı
   * disipline burada kavuşuyor.
   */
  private pruneMinions(enemy: SimulationEnemyState): number {
    const minions = enemy.minions;
    for (let index = minions.length - 1; index >= 0; index--) {
      if (minions[index].isAlive) continue;
      const last = minions.pop();
      if (last && index < minions.length) minions[index] = last;
    }
    return minions.length;
  }

  private removePickupAt(index: number): void {
    const last = this.pickups.pop();
    if (last && index < this.pickups.length) this.pickups[index] = last;
  }
}

/** Tek çağrıda deterministik bir koşu özeti. */
export function simulateVolHell(
  frames: number,
  options: VolHellSimulationOptions = {},
): VolHellSimulationSnapshot {
  const simulation = new VolHellSimulation(options);
  simulation.run(frames, options.stepMs ?? simulationConfig.defaultStepMs);
  return simulation.snapshot();
}
