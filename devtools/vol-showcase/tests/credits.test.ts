import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CREDIT_ENTRIES } from '../src/credits';

/**
 * Kredi ekranı, depodaki varlık kayıtlarından ayrışmasın: her satır kayıtta aynen doğrulanır. Kayıtlar tek tek
 * adıyla okunur (depo kökünü gösteren belirsiz bir yol değil): hepsi vitrin paketinin makbuz kapsamındadır
 * (`core/public/assets/*` CORE kapanışında, kök `NOTICE` paylaşılan dosyadır), kayıt değişince bu test yeniden koşar.
 */
const text = (path: string): string => readFileSync(resolve(import.meta.dirname, path), 'utf8');

const entry = (name: string) => {
  const found = CREDIT_ENTRIES.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`Kredi satırı yok: ${name}`);
  return found;
};

describe('vitrin kredi ekranı varlık kayıtlarıyla uyumlu', () => {
  it('Phosphor: sürüm, lisans ve telif sahibi ikon kaydındaki gibidir', () => {
    const credits = text('../../../core/public/assets/icons/CREDITS.md');
    const phosphor = entry('Phosphor Icons');
    expect(credits).toContain(`sürüm ${phosphor.version}`);
    expect(credits).toContain(`Lisans: ${phosphor.license}`);
    expect(credits).toContain(`Copyright (c) 2023 ${phosphor.author}`);
    expect(credits).toContain(phosphor.source);
  });

  it('Kenney paketleri: ad, sürüm, CC0 ve kaynak adresi kaynak kaydındadır', () => {
    const glyphs = text('../../../core/public/assets/glyphs/SOURCES.md');
    const prompts = entry('Kenney Input Prompts');
    expect(glyphs).toContain(`${prompts.name.replace('Kenney ', '')} ${prompts.version}`);
    expect(glyphs).toContain('CC0 1.0');
    expect(glyphs).toContain(prompts.source);

    const cursors = text('../../../core/public/assets/cursors/SOURCES.md');
    const cursorPack = entry('Kenney Cursor Pack');
    const crosshair = entry('Kenney Crosshair Pack');
    expect(cursors).toContain(`${cursorPack.name} ${cursorPack.version}`);
    expect(cursors).toContain(cursorPack.source);
    expect(cursors).toContain(crosshair.name.replace('Kenney ', ''));
    expect(cursors).toContain(crosshair.source);
    expect(cursors.match(/CC0 1\.0/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('yazı tipleri: telif sahibi ve kaynak OFL dosyasındadır; kök NOTICE ikisini de anar', () => {
    for (const [name, ofl] of [
      ['Jura', text('../../../core/public/assets/fonts/OFL-Jura.txt')],
      ['Exo 2', text('../../../core/public/assets/fonts/OFL-Exo2.txt')],
    ] as const) {
      const font = entry(name);
      expect(ofl).toContain(font.author);
      expect(ofl).toContain(font.source);
      expect(font.license).toBe('SIL OFL 1.1');
    }
    const notice = text('../../../NOTICE');
    expect(notice).toContain('Jura, Exo 2');
    expect(notice).toContain('SIL Open Font License 1.1');
  });

  it('her satırın lisansı, yazarı ve kaynağı vardır; kaynak adresi https ile başlar', () => {
    expect(CREDIT_ENTRIES.length).toBeGreaterThanOrEqual(6);
    for (const credit of CREDIT_ENTRIES) {
      expect(credit.license).not.toBe('');
      expect(credit.author).toBeTruthy();
      expect(credit.source).toMatch(/^https:\/\//);
    }
    expect(new Set(CREDIT_ENTRIES.map((credit) => credit.name)).size).toBe(CREDIT_ENTRIES.length);
  });
});
