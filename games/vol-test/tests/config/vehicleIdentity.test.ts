import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SHOT_LOOK } from '@/config/fx';
import { WEAPON_STYLES } from '@/config/tank';
import { TANK_ART, tankSpecs } from '@/config/tankView';
import { ARACHNID } from '@/config/vehicles';

/**
 * Araçların birbirinden görünüşte ve hissiyatta ayrışması: renk kimliği tek tek tanımlıdır ve
 * araçlar arasında çakışmaz. Tasarım niyeti `DESIGN.md` Araçlar bölümündedir.
 */
const ids = tankSpecs().map((spec) => spec.id);

/** SVG'deki ana renkler: koyu çizgi renkleri (aydınlık < 0.115) kimlik taşımaz, sayılmaz. */
function paintOf(id: string, part: 'hull' | 'turret'): Set<string> {
  // Test paket kökünde koşar (`vitest.config.ts`); yol oradan başlar.
  const file = resolve(process.cwd(), `src/assets/vehicles/${id}/${part}.svg`);
  const colours = readFileSync(file, 'utf8').match(/#[0-9a-fA-F]{6}\b/g) ?? [];
  return new Set(
    colours
      .map((colour) => colour.toLowerCase())
      .filter((colour) => {
        const [r, g, b] = [1, 3, 5].map((at) => parseInt(colour.slice(at, at + 2), 16) / 255);
        return (Math.max(r, g, b) + Math.min(r, g, b)) / 2 >= 0.115;
      }),
  );
}

function similarity(a: Set<string>, b: Set<string>): number {
  const shared = [...a].filter((colour) => b.has(colour)).length;
  return shared / (a.size + b.size - shared);
}

describe('araç kimliği', () => {
  it('her silah stilinin kendi mermi görünümü vardır ve renkleri ayrışır', () => {
    for (const style of WEAPON_STYLES) expect(SHOT_LOOK[style], style).toBeDefined();
    const glows = WEAPON_STYLES.map((style) => SHOT_LOOK[style].glow);
    expect(new Set(glows).size).toBe(WEAPON_STYLES.length);
  });

  it('araçların mermi stili birbirinden farklıdır', () => {
    const styles = [...tankSpecs(), ARACHNID].map((spec) => spec.armament.weapon.style);
    expect(new Set(styles).size).toBe(styles.length);
  });

  it('tankların çekirdek parıltısı ve palet tonu çakışmaz', () => {
    expect(new Set(ids.map((id) => TANK_ART[id].glow)).size).toBe(ids.length);
    expect(new Set(ids.map((id) => TANK_ART[id].treadTint)).size).toBe(ids.length);
  });

  it('tank gövdeleri ve tareti ortak bir paleti paylaşmaz', () => {
    for (const part of ['hull', 'turret'] as const) {
      for (const [index, first] of ids.entries()) {
        for (const second of ids.slice(index + 1)) {
          const overlap = similarity(paintOf(first, part), paintOf(second, part));
          expect(overlap, `${first}/${second} ${part} renk benzerliği`).toBeLessThan(0.3);
        }
      }
    }
  });
});
