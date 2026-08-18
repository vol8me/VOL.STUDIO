import type Phaser from 'phaser';
import type { Random, Vector2 } from '@volstudio/core';
import type { HellStatBlock } from '@/config/stats';
import { createRandom } from '@volstudio/core';
import { getAbilityDefinition, type AbilityDefinition } from '@/config/abilities';
import type { Border } from '@/runtime/entity/Border';
import type { Enemy } from '@/runtime/entity/Enemy';
import type { BulletManager } from '@/runtime/entity/BulletManager';
import { ChainLightningStrike } from '@/runtime/entity/ChainLightningStrike';
import { FireZone } from '@/runtime/entity/FireZone';
import { Turret } from '@/runtime/entity/Turret';
import type { EffectManager } from '@/runtime/systems/EffectManager';
import { diagnostics, gameAudio } from '@/app/services';
import { sfxVolumes } from '@/config/audio';
import type { SoundEvent } from '@/config/sounds';
import { AbilityUpgrades } from './AbilityUpgrades';
import { ChainLightningAbility } from './ChainLightningAbility';
import { FireZoneAbility } from './FireZoneAbility';
import { MultiShotAbility } from './MultiShotAbility';
import { TurretAbility } from './TurretAbility';
import {
  ABILITY_SLOTS,
  type Ability,
  type AbilityContext,
  type AbilitySlot,
  type AbilityWorld,
} from './types';

export interface AbilityRuntimeDeps {
  scene: Phaser.Scene;
  effects: EffectManager;
  border: Border;
  random: Random;
  bullets: BulletManager;
  playerStats: HellStatBlock;
}

/** Tanımdan doğru ability sınıfını üretir — yeni mekanik eklenince tek yer değişir. */
export function createAbility(definitionId: string): Ability {
  const definition = getAbilityDefinition(definitionId);

  switch (definition.kind) {
    case 'turret':
      return new TurretAbility(definition);
    case 'chainLightning':
      return new ChainLightningAbility(definition);
    case 'fireZone':
      return new FireZoneAbility(definition);
    case 'multiShot':
      return new MultiShotAbility(definition);
  }
}

/**
 * Ability katmanının çalışma zamanı — Q/E slotları, ability'lerin ürettiği
 * varlıklar (kule, ateş alanı, yıldırım) ve ability'ler arası kurallar.
 *
 * Ability sınıfları sahneyi tanımaz; ürettikleri her şeyi buraya verir. "Aynı
 * anda tek kule" gibi ability'ler ARASI kurallar bu yüzden tek yerde durur.
 */
export class AbilityRuntime implements AbilityWorld {
  readonly upgrades = new AbilityUpgrades();
  private readonly slots = new Map<AbilitySlot, Ability | null>([
    ['primary', null],
    ['secondary', null],
  ]);
  private turret: Turret | null = null;
  private readonly zones: FireZone[] = [];
  private readonly strikes: ChainLightningStrike[] = [];
  private context: AbilityContext | null = null;
  /**
   * Görsel rastgelelik (yıldırım zikzağı) için AYRI akış. Koşu PRNG'sinden bir
   * kez tohumlanır: her koşu farklı görünür ama her karede çizim için sayı
   * çekmek spawn/kart sırasını kaydırmaz.
   */
  private readonly visualRandom: Random;

  constructor(private readonly deps: AbilityRuntimeDeps) {
    this.visualRandom = createRandom(Math.floor(deps.random.next() * 0x7fffffff));
  }

  /** Slota ability atar; slotta ability varsa yerini alır. `null` slotu boşaltır. */
  assign(slot: AbilitySlot, ability: Ability | null): void {
    this.slots.get(slot)?.destroy();
    this.slots.set(slot, ability);
    diagnostics?.recordEvent('abilityAssigned', { slot, id: ability?.id ?? null });
  }

  getAbility(slot: AbilitySlot): Ability | null {
    return this.slots.get(slot) ?? null;
  }

  /** Slotu boş olan tuşa basmak sessizce hiçbir şey yapmaz. */
  tryActivate(slot: AbilitySlot): boolean {
    const ability = this.slots.get(slot);
    if (!ability || !this.context) return false;

    const activated = ability.tryActivate(this.context);
    if (activated) {
      diagnostics?.recordEvent('abilityUsed', { slot, id: ability.id });
    }
    return activated;
  }

  /**
   * Frame durumunu tazeler ve ability'lerle onların ürettiği varlıkları sürer.
   * Bağlam nesnesi bir kez kurulup yerinde güncellenir — her frame yeni obje yok.
   */
  update(deltaMs: number, playerPos: Vector2, aim: Vector2, enemies: readonly Enemy[]): void {
    const context = this.refreshContext(playerPos, aim, enemies);

    for (const slot of ABILITY_SLOTS) {
      this.slots.get(slot)?.update(deltaMs, context);
    }

    this.turret?.update(deltaMs, enemies);
    if (this.turret && !this.turret.isAlive) {
      // Kule yıkıldığında havadaki mermileri de kapat: referansı düşürmek
      // yetmez, o Arc'lar sahnede donmuş halde kalırdı.
      this.turret.destroy();
      this.turret = null;
    }

    for (let i = this.zones.length - 1; i >= 0; i--) {
      const zone = this.zones[i];
      zone.update(deltaMs, enemies);
      if (!zone.isActive) this.zones.splice(i, 1);
    }

    for (let i = this.strikes.length - 1; i >= 0; i--) {
      const strike = this.strikes[i];
      strike.update(deltaMs, enemies);
      if (!strike.isActive) this.strikes.splice(i, 1);
    }
  }

  /** Sahnedeki kule — düşman hedeflemesi ve çarpışma bunu okur. */
  getTurret(): Turret | null {
    return this.turret && this.turret.isAlive ? this.turret : null;
  }

  /** Aktif ateş alanı sayısı — teşhis/test için. */
  getActiveZoneCount(): number {
    return this.zones.length;
  }

  /** Aktif yıldırım sayısı — teşhis/test için. */
  getActiveStrikeCount(): number {
    return this.strikes.length;
  }

  // --- AbilityWorld ---------------------------------------------------------

  replaceTurret(x: number, y: number, definition: AbilityDefinition): void {
    const params = definition.turret;
    if (!params) return;

    // TEK KULE kuralı: yeni kule eskisini yıkar (hangi ability yerleştirmiş olursa olsun).
    // Yıkım efektinden sonra `destroy()` de çağrılır: eski kulenin havadaki
    // mermileri sahipsiz kalıp sahnede donmasın.
    this.turret?.destroyWithEffect();
    this.turret?.destroy();
    this.turret = new Turret(this.deps.scene, x, y, this.deps.effects, {
      ...params,
      damage: Math.max(0, params.damage + this.upgrades.get('turretDamage')),
    });
    this.playSfx('turretDeploy', sfxVolumes.turretDeploy);
  }

  spawnFireZone(x: number, y: number, definition: AbilityDefinition): void {
    const params = definition.fire;
    if (!params) return;

    this.zones.push(
      new FireZone(this.deps.scene, x, y, this.deps.effects, {
        ...params,
        durationMs: Math.max(
          params.tickMs,
          params.durationMs + this.upgrades.get('fireZoneDurationMs'),
        ),
      }),
    );
    this.playSfx('fireZone', sfxVolumes.fireZone);
  }

  spawnChainLightning(originX: number, originY: number, definition: AbilityDefinition): void {
    const params = definition.chain;
    if (!params) return;

    this.strikes.push(
      new ChainLightningStrike(
        this.deps.scene,
        originX,
        originY,
        this.deps.effects,
        params,
        this.visualRandom,
        this.upgrades.get('chainBounces'),
      ),
    );
    this.playSfx('chainLightning', sfxVolumes.chainLightning);
  }

  fireBullet(x: number, y: number, dirX: number, dirY: number, damage: number): void {
    this.deps.bullets.spawnBullet(x, y, dirX, dirY, damage);
  }

  playSfx(event: SoundEvent, volume: number): void {
    if (gameAudio) {
      void gameAudio.playSfx(event, { volume });
    }
  }

  destroy(): void {
    for (const slot of ABILITY_SLOTS) {
      this.slots.get(slot)?.destroy();
      this.slots.set(slot, null);
    }
    this.turret?.destroy();
    this.turret = null;
    for (const zone of this.zones) zone.destroy();
    this.zones.length = 0;
    for (const strike of this.strikes) strike.destroy();
    this.strikes.length = 0;
  }

  private refreshContext(
    playerPos: Vector2,
    aim: Vector2,
    enemies: readonly Enemy[],
  ): AbilityContext {
    const next: AbilityContext = {
      scene: this.deps.scene,
      effects: this.deps.effects,
      border: this.deps.border,
      random: this.deps.random,
      playerStats: this.deps.playerStats,
      playerX: playerPos.x,
      playerY: playerPos.y,
      aimX: aim.x,
      aimY: aim.y,
      enemies,
      world: this,
      upgrades: this.upgrades,
    };
    this.context = next;
    return next;
  }
}
