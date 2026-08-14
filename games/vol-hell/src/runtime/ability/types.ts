import type Phaser from 'phaser';
import type { Random, StatBlock } from '@volstudio/core';
import type { AbilityDefinition } from '@/config/abilities';
import { MIN_ABILITY_COOLDOWN_MS } from '@/config/abilities';
import type { Border } from '@/runtime/entity/Border';
import type { Enemy } from '@/runtime/entity/Enemy';
import type { EffectManager } from '@/runtime/systems/EffectManager';
import type { AbilityUpgrades } from './AbilityUpgrades';

/** Q ve E — oyuncunun iki aktif ability slotu. */
export type AbilitySlot = 'primary' | 'secondary';

/** Slot sırası — UI ve tuş eşlemesi bu sırayı izler (Q, E). */
export const ABILITY_SLOTS: readonly AbilitySlot[] = ['primary', 'secondary'];

/**
 * Ability'lerin sahneye dokunabildiği yüzey.
 *
 * Ability'ler sahneyi/manager'ları doğrudan tanımaz; ürettikleri şeyleri
 * (kule, ateş alanı, yıldırım, mermi) buraya verirler. Böylece "tek kule"
 * gibi ability'ler ARASI kurallar tek yerde uygulanır ve her ability
 * bağımsız test edilebilir kalır.
 */
export interface AbilityWorld {
  /** Kuleyi yerleştirir; TEK KULE kuralı gereği varsa eskisini yok eder. */
  replaceTurret(x: number, y: number, definition: AbilityDefinition): void;
  /** Zemine ateş alanı serer. */
  spawnFireZone(x: number, y: number, definition: AbilityDefinition): void;
  /** Zincir yıldırımı başlatır. */
  spawnChainLightning(originX: number, originY: number, definition: AbilityDefinition): void;
  /** Silahın ateş cooldown'unu atlayarak mermi doğurur (çoklu mermi). */
  fireBullet(x: number, y: number, dirX: number, dirY: number, damage: number): void;
}

/** Ability'nin aktivasyon/güncelleme anında gördüğü dünya durumu. */
export interface AbilityContext {
  readonly scene: Phaser.Scene;
  readonly effects: EffectManager;
  readonly border: Border;
  readonly random: Random;
  /** Oyuncunun stat bloğu — cooldown ölçeklemesi ve hasar için. */
  readonly playerStats: StatBlock;
  readonly playerX: number;
  readonly playerY: number;
  /** Nişan yönü (birim vektör bileşenleri). */
  readonly aimX: number;
  readonly aimY: number;
  readonly enemies: readonly Enemy[];
  readonly world: AbilityWorld;
  /** Ability'e özel, kartlarla biriken parametre artışları. */
  readonly upgrades: AbilityUpgrades;
}

/**
 * Tüm ability'lerin ortak tabanı: cooldown muhasebesi ve aktivasyon sözleşmesi.
 * Davranış `onActivate()` içinde, her ability'nin KENDİ dosyasında yaşar.
 */
export abstract class Ability {
  private cooldownRemainingMs = 0;
  private lastCooldownMs: number;

  constructor(readonly definition: AbilityDefinition) {
    this.lastCooldownMs = definition.cooldownMs;
  }

  get id(): string {
    return this.definition.id;
  }

  isReady(): boolean {
    return this.cooldownRemainingMs <= 0;
  }

  /** 0 = yeni kullanıldı, 1 = hazır. HUD göstergesi için. */
  getReadyRatio(): number {
    if (this.lastCooldownMs <= 0) return 1;
    return 1 - Math.max(0, this.cooldownRemainingMs) / this.lastCooldownMs;
  }

  /** Hazırsa ability'yi çalıştırır ve cooldown'u başlatır. */
  tryActivate(context: AbilityContext): boolean {
    if (!this.isReady()) return false;

    this.onActivate(context);
    this.lastCooldownMs = this.getCooldownMs(context);
    this.cooldownRemainingMs = this.lastCooldownMs;
    return true;
  }

  update(deltaMs: number, context: AbilityContext): void {
    if (this.cooldownRemainingMs > 0) {
      this.cooldownRemainingMs = Math.max(0, this.cooldownRemainingMs - deltaMs);
    }
    this.onUpdate(deltaMs, context);
  }

  /**
   * Etkin cooldown — oyuncunun `fireRate` stat'ının tabanına oranıyla ölçeklenir.
   * `fireRate` bir BEKLEME süresidir: kart onu düşürdükçe ability'ler de hızlanır.
   * Alt sınır, modifier'ların cooldown'u sıfıra indirmesini engeller.
   */
  protected getCooldownMs(context: AbilityContext): number {
    const base = context.playerStats.getBase('fireRate');
    const ratio = base > 0 ? context.playerStats.getValue('fireRate') / base : 1;
    return Math.max(MIN_ABILITY_COOLDOWN_MS, this.definition.cooldownMs * Math.max(0, ratio));
  }

  /** Ability'nin kendi davranışı — her alt sınıf kendi dosyasında uygular. */
  protected abstract onActivate(context: AbilityContext): void;

  /** Sürekli durum taşıyan ability'ler için (varsayılan: yok). */
  protected onUpdate(_deltaMs: number, _context: AbilityContext): void {}

  /** Slottan çıkarılırken/sahne kapanırken çağrılır. */
  destroy(): void {}
}

/** Verilen noktaya en yakın canlı düşmanı bulur; menzil dışındaysa null. */
export function findNearestEnemy(
  enemies: readonly Enemy[],
  x: number,
  y: number,
  maxDistance: number,
  exclude?: ReadonlySet<Enemy>,
): Enemy | null {
  let best: Enemy | null = null;
  let bestDistance = maxDistance;

  for (const enemy of enemies) {
    if (!enemy.isAlive || exclude?.has(enemy)) continue;
    const distance = Math.hypot(enemy.x - x, enemy.y - y);
    if (distance > bestDistance) continue;
    best = enemy;
    bestDistance = distance;
  }

  return best;
}
