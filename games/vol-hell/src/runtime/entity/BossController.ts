import type { Random, Vector2 } from '@volstudio/core';
import { bossConfig } from '@/config/boss';
import type { EnemyDefinition } from '@/config/enemies/types';
import type { Border } from './Border';
import type { Enemy } from './Enemy';
import type { MinionSpawnRequest } from './behaviors';
import {
  applyStandoffBehavior,
  type MutableBehaviorContext,
  type VelocityOutput,
} from './behaviors';
import type { SpatialGrid } from '@/runtime/systems/SpatialGrid';
import type { EffectManager } from '@/runtime/systems/EffectManager';
import type { TelegraphHandle, TelegraphManager } from '@/runtime/systems/TelegraphManager';
import { gameAudio } from '@/app/services';
import { sfxVolumes } from '@/config/audio';
import { nonNegativeFinite, safeDeltaMs } from '@/runtime/utils/numeric';

/** Boss'un saldırı paternleri — sırayla döner. */
export type BossAttack = 'slam' | 'volley' | 'summon';

/** Döngüsel saldırı sırası. Rastgele DEĞİL: oyuncu ritmi öğrenebilmeli. */
const ATTACK_ORDER: readonly BossAttack[] = ['slam', 'volley', 'summon'];

/** Boss'un üst düzey durumu. */
export type BossState = 'opening' | 'idle' | 'attacking';

export interface BossControllerDeps {
  effects: EffectManager;
  telegraphs: TelegraphManager;
  random: Random;
  /** Oyuncuya hasar uygular — saldırı alanına girmişse. */
  damagePlayer: (amount: number) => void;
  /** Oyuncunun o anki konumu — saldırı çözümlenirken TAZE okunur. */
  getPlayerPosition: () => Vector2;
  /** Minion doğurma — `EnemyManager` sağlar. */
  spawnMinions: (parent: Enemy, request: MinionSpawnRequest) => void;
}

/**
 * Boss (Sovereign) yapay zekâsı — kendi state machine'i olan, tamamen izole
 * bir sistem. `Enemy.ts`'e ve `EliteController`'a hiçbir şekilde karışmaz;
 * ortak kullandığı tek şey `TelegraphManager` ve `Enemy.moveBy()`.
 *
 * Dövüş ritmi: boss oyuncuyla arasında mesafe tutarak dolaşır, sabit
 * aralıklarla üç saldırıdan birini SIRAYLA uygular. Sıra rastgele değil —
 * oyuncu paterni öğrenip pozisyon almayı öğrenebilmeli. Her saldırı önce
 * telegraph çizer, hasar UYARI SÖNDÜĞÜNDE uygulanır.
 *
 * - **SLAM** — bossun etrafında geniş daire; yakın dövüşü cezalandırır.
 * - **VOLLEY** — oyuncuya doğru üç koridor; yana kaçmayı zorunlu kılar.
 * - **SUMMON** — koni içine sürü; oyuncuyu yer değiştirmeye zorlar.
 *
 * Canı `enrageHealthRatio`'nun altına düşünce saldırı arası kısalır (ayrı bir
 * "faz 2 kiti" yok — yeni saldırılar okunabilirliği düşürürdü).
 */
export class BossController {
  private state: BossState = 'opening';
  private timerMs = 0;
  private attackIndex = 0;
  private enraged = false;
  private readonly velocity: VelocityOutput = { x: 0, y: 0 };
  private context: MutableBehaviorContext | null = null;
  private readonly activeTelegraphs: TelegraphHandle[] = [];
  private readonly spawnRequest: MinionSpawnRequest = {
    minionId: '',
    count: 0,
    angles: [],
    radius: 0,
  };

  constructor(
    private readonly enemy: Enemy,
    private readonly definition: EnemyDefinition,
    private readonly deps: BossControllerDeps,
  ) {}

  get isAlive(): boolean {
    return this.enemy.isAlive;
  }

  getEnemy(): Enemy {
    return this.enemy;
  }

  /** Öfke fazına girdi mi? HUD/test bunu okur. */
  isEnraged(): boolean {
    return this.enraged;
  }

  /** Sıradaki saldırı — test bunu okuyarak her paterni tetikleyebilir. */
  getNextAttack(): BossAttack {
    return ATTACK_ORDER[this.attackIndex % ATTACK_ORDER.length];
  }

  getState(): BossState {
    return this.state;
  }

  update(deltaMs: number, playerPos: Vector2, border: Border, grid: SpatialGrid): void {
    if (!this.enemy.isAlive) return;
    const safeDelta = safeDeltaMs(deltaMs);

    this.updateEnrage();
    this.updateMovement(safeDelta, playerPos, border, grid);

    this.timerMs += safeDelta;
    if (this.state === 'attacking') return;

    const wait = this.state === 'opening' ? bossConfig.openingDelayMs : this.getAttackIntervalMs();
    if (this.timerMs < wait) return;

    this.timerMs = 0;
    void this.runAttack(this.getNextAttack());
    this.attackIndex += 1;
  }

  /** Boss öldü/sahne kapandı — bekleyen saldırılar uygulanmasın. */
  destroy(): void {
    this.state = 'idle';
    for (const handle of this.activeTelegraphs) {
      handle.cancel();
    }
    this.activeTelegraphs.length = 0;
  }

  private getAttackIntervalMs(): number {
    const base = bossConfig.attackIntervalMs;
    return this.enraged ? base * bossConfig.enrageIntervalMultiplier : base;
  }

  private updateEnrage(): void {
    if (this.enraged) return;
    if (this.enemy.getHealthRatio() > bossConfig.enrageHealthRatio) return;
    this.enraged = true;
    this.deps.effects.play('bossSpawn', this.enemy.x, this.enemy.y);
    if (gameAudio) {
      void gameAudio.playSfx('bossEnrage', { volume: sfxVolumes.bossEnrage });
    }
  }

  /**
   * Hareket — oyuncuyla mesafesini korur, saldırı sırasında durur.
   * Saldırı anında hareketsiz kalması telegraph'ın okunmasını kolaylaştırır.
   */
  private updateMovement(
    deltaMs: number,
    playerPos: Vector2,
    border: Border,
    grid: SpatialGrid,
  ): void {
    if (this.state === 'attacking') {
      this.enemy.moveBy(0, 0, deltaMs, border, grid);
      return;
    }

    const context = this.syncContext(deltaMs, playerPos);
    applyStandoffBehavior(context, bossConfig.slam.radius, 0.2, this.velocity);
    this.enemy.moveBy(this.velocity.x, this.velocity.y, deltaMs, border, grid);
  }

  private async runAttack(attack: BossAttack): Promise<void> {
    this.state = 'attacking';
    try {
      switch (attack) {
        case 'slam':
          await this.runSlam();
          break;
        case 'volley':
          await this.runVolley();
          break;
        case 'summon':
          await this.runSummon();
          break;
      }
    } finally {
      // Saldırı sırasında boss ölmüş veya telegraph iptal edilmiş olabilir;
      // yaşarsa durumu saldırıya hazır hale getir.
      if (this.enemy.isAlive) {
        this.state = 'idle';
      }
    }
  }

  /** SLAM — bossun etrafında geniş bir daire; yakın duran oyuncu vurulur. */
  private async runSlam(): Promise<void> {
    const x = this.enemy.x;
    const y = this.enemy.y;

    if (gameAudio) {
      void gameAudio.playSfx('telegraph', { volume: sfxVolumes.telegraph });
    }

    const handle = this.playTelegraph({
      durationMs: bossConfig.slam.telegraphMs,
      shape: 'circle',
      x,
      y,
      radius: bossConfig.slam.radius,
      color: this.definition.color,
    });
    const result = await handle.promise;
    if (!result.completed || !this.enemy.isAlive) return;

    this.deps.effects.play('bossSlam', x, y);
    // Hasar UYARI KONUMUNA göre çözülür (bossun güncel konumuna değil):
    // oyuncunun kaçtığı alan gerçekten güvenli olsun.
    const player = this.deps.getPlayerPosition();
    if (Math.hypot(player.x - x, player.y - y) <= bossConfig.slam.radius) {
      this.deps.damagePlayer(this.enemy.getContactDamage() * bossConfig.slam.damageMultiplier);
    }
  }

  /** VOLLEY — oyuncuya doğru üç koridor; yana kaçmak gerekir. */
  private async runVolley(): Promise<void> {
    const x = this.enemy.x;
    const y = this.enemy.y;
    const player = this.deps.getPlayerPosition();
    const baseAngle = Math.atan2(player.y - y, player.x - x);

    if (gameAudio) {
      void gameAudio.playSfx('telegraph', { volume: sfxVolumes.telegraph });
    }

    const { laneCount, laneSpreadRad, laneLengthPx, laneWidthPx } = bossConfig.volley;
    const angles: number[] = [];
    for (let i = 0; i < laneCount; i++) {
      angles.push(baseAngle + (i - (laneCount - 1) / 2) * laneSpreadRad);
    }

    const handles = angles.map((angle) =>
      this.playTelegraph({
        durationMs: bossConfig.volley.telegraphMs,
        shape: 'line',
        x,
        y,
        angle,
        radius: laneLengthPx,
        width: laneWidthPx,
        color: this.definition.color,
      }),
    );

    let results: { completed: boolean }[] = [];
    try {
      results = await Promise.all(handles.map((h) => h.promise));
    } finally {
      for (const h of handles) this.removeTelegraph(h);
    }

    if (results.some((r) => !r.completed) || !this.enemy.isAlive) return;

    const target = this.deps.getPlayerPosition();
    for (const angle of angles) {
      this.deps.effects.play('bossVolley', x, y, angle * (180 / Math.PI));
      if (!isInsideLane(target, x, y, angle, laneLengthPx, laneWidthPx)) continue;
      this.deps.damagePlayer(this.enemy.getContactDamage() * bossConfig.volley.damageMultiplier);
      // Koridorlar üst üste binebilir; oyuncu tek salvodan bir kez hasar alır.
      break;
    }
  }

  /** SUMMON — koni içine sürü çağırır; oyuncuyu yer değiştirmeye zorlar. */
  private async runSummon(): Promise<void> {
    const x = this.enemy.x;
    const y = this.enemy.y;
    const player = this.deps.getPlayerPosition();
    const baseAngle = Math.atan2(player.y - y, player.x - x);
    const { count, spreadRad, radiusPx, minionId } = bossConfig.summon;

    if (gameAudio) {
      void gameAudio.playSfx('telegraph', { volume: sfxVolumes.telegraph });
    }

    const handle = this.playTelegraph({
      durationMs: bossConfig.summon.telegraphMs,
      shape: 'cone',
      x,
      y,
      angle: baseAngle,
      radius: radiusPx,
      spread: spreadRad,
      color: this.definition.color,
    });
    const result = await handle.promise;
    if (!result.completed || !this.enemy.isAlive) return;

    this.spawnRequest.minionId = minionId;
    this.spawnRequest.count = count;
    this.spawnRequest.radius = radiusPx;
    this.spawnRequest.angles.length = 0;
    // Koni içine eşit aralıklı: sürü uyarı alanının DIŞINDA doğmasın.
    // Uçlara tam oturmasın diye yarım adım içeriden başlanır.
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      this.spawnRequest.angles.push(baseAngle - spreadRad / 2 + spreadRad * t);
    }

    this.deps.effects.play('bossSummon', x, y);
    this.deps.spawnMinions(this.enemy, this.spawnRequest);
  }

  /**
   * Telegraph başlatır ve takip listesine ekler.
   * `destroy()` çağrıldığında tüm bekleyen telegraph'lar iptal edilebilsin.
   */
  private playTelegraph(options: Parameters<TelegraphManager['play']>[0]): TelegraphHandle {
    const handle = this.deps.telegraphs.play(options);
    this.activeTelegraphs.push(handle);
    // Promise çözüldükten sonra listeyi temizle — `destroy()` artık bu
    // telegraph'ı iptal etmeye çalışmasın.
    void handle.promise.finally(() => this.removeTelegraph(handle));
    return handle;
  }

  private removeTelegraph(handle: TelegraphHandle): void {
    const i = this.activeTelegraphs.indexOf(handle);
    if (i >= 0) this.activeTelegraphs.splice(i, 1);
  }

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
    context.speed = nonNegativeFinite(this.enemy.getStats().getValue('speed'));
    context.random = this.deps.random;
    return context;
  }
}

/** Bir nokta koridorun içinde mi? Koridor = yönlü dikdörtgen. */
function isInsideLane(
  point: Vector2,
  originX: number,
  originY: number,
  angle: number,
  length: number,
  width: number,
): boolean {
  const dx = point.x - originX;
  const dy = point.y - originY;
  // Koridorun kendi eksenine döndür: ileri mesafe ve yanal sapma.
  const forward = dx * Math.cos(angle) + dy * Math.sin(angle);
  const lateral = -dx * Math.sin(angle) + dy * Math.cos(angle);
  return forward >= 0 && forward <= length && Math.abs(lateral) <= width / 2;
}
