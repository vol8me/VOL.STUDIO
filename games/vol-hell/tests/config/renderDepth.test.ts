import { describe, it, expect } from 'vitest';
import { RENDER_DEPTH } from '@/config/layers';
import { effectsConfig, type EffectId } from '@/config/effects';

/**
 * Katman sırası oyunun okunabilirliğini belirler; depth verilmediğinde Phaser
 * yaratılma sırasına düşer ve sıralama koşudan koşuya değişirdi. Bu testler
 * sıralamanın KENDİSİNİ değil, aralarındaki İLİŞKİYİ kilitler.
 */
describe('render katmanları', () => {
  it('saha sınırı her şeyin altında', () => {
    for (const [name, depth] of Object.entries(RENDER_DEPTH)) {
      if (name === 'border') continue;
      expect(depth, name).toBeGreaterThan(RENDER_DEPTH.border);
    }
  });

  it('yerdeki Flux düşmanların altında kalır', () => {
    expect(RENDER_DEPTH.fluxPickup).toBeLessThan(RENDER_DEPTH.enemy);
  });

  it('oyuncu düşmanların üstünde — kalabalıkta kaybolmaz', () => {
    expect(RENDER_DEPTH.player).toBeGreaterThan(RENDER_DEPTH.enemy);
  });

  it('düşman can barları düşman gövdelerinin üstünde', () => {
    expect(RENDER_DEPTH.enemyHealthBar).toBeGreaterThan(RENDER_DEPTH.enemy);
    // Ama oyuncunun önüne geçmez.
    expect(RENDER_DEPTH.enemyHealthBar).toBeLessThan(RENDER_DEPTH.player);
  });

  it('mermiler oyuncunun ve düşmanların üstünde', () => {
    expect(RENDER_DEPTH.bullet).toBeGreaterThan(RENDER_DEPTH.player);
  });

  it('vuruş efektleri en üstte, zemin efektleri düşmanların altında', () => {
    expect(RENDER_DEPTH.impactEffect).toBeGreaterThan(RENDER_DEPTH.bullet);
    expect(RENDER_DEPTH.groundEffect).toBeLessThan(RENDER_DEPTH.enemy);
  });

  it('zemin efektleri yerdeki Flux’un da altında kalır — parça iz altında kaybolmaz', () => {
    expect(RENDER_DEPTH.groundEffect).toBeLessThan(RENDER_DEPTH.fluxPickup);
  });

  it('her efekt tanımı katman ölçeğindeki bir değeri kullanır', () => {
    const allowed = new Set<number>(Object.values(RENDER_DEPTH));
    for (const [id, definition] of Object.entries(effectsConfig) as [
      EffectId,
      (typeof effectsConfig)[EffectId],
    ][]) {
      if (!definition.particles) continue;
      expect(allowed.has(definition.particles.depth ?? 0), id).toBe(true);
    }
  });
});
