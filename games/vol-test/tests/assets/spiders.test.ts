import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SPIDER_LOOKS, SPIDER_PARTS } from '@/config/spiders';
import { WALKER_IDS } from '@/config/vehicles';

const ROOT = join(__dirname, '../../src/assets/vehicles');
const read = (look: string, part: string): string =>
  readFileSync(join(ROOT, look, `${part}.svg`), 'utf8');

describe.each(WALKER_IDS)('örümcek SVG parçaları (%s)', (id) => {
  const look = SPIDER_LOOKS[id];

  it('her parça vardır ve viewBox ile boyut yapılandırmadaki kutuyla aynıdır', () => {
    for (const part of SPIDER_PARTS) {
      const svg = read(id, part);
      const match = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
      expect(match, part).not.toBeNull();
      expect(Number(match?.[1]), `${part} genişlik`).toBeCloseTo(look.parts[part].width, 1);
      expect(Number(match?.[2]), `${part} yükseklik`).toBeCloseTo(look.parts[part].height, 1);
      expect(svg, part).toContain(`width="${match?.[1]}"`);
    }
  });

  it('parçalar tank sanatıyla aynı sözlüğü kullanır: koyu kenar, degrade, perçin', () => {
    for (const part of SPIDER_PARTS) {
      if (part === 'contact' || part.endsWith('shadow')) continue;
      const svg = read(id, part);
      expect(svg, part).toContain('#0d1217');
      expect(svg, part).toMatch(/Gradient/);
    }
    expect(read(id, 'thorax')).toContain('<circle');
  });

  it('süzgeç, gömülü görüntü ve dış başvuru yoktur: tek atlasa güvenle çizilir', () => {
    for (const part of SPIDER_PARTS) {
      const svg = read(id, part);
      expect(svg, part).not.toMatch(/<filter|<image|href=|@import|<script|<style/);
    }
  });

  it('gölge parçaları düz siyah siluettir', () => {
    for (const part of ['thorax-shadow', 'abdomen-shadow']) {
      const svg = read(id, part);
      expect(svg).toContain('fill="#000"');
      expect(svg).not.toMatch(/Gradient/);
    }
  });
});
