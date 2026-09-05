import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as Ui from '../../src/ui/index';
import * as Lifecycle from '../../src/lifecycle/index';
import * as I18n from '../../src/i18n/index';
import * as Fonts from '../../src/fonts/index';
import * as RigMetadata from '../../src/rig/metadata';

describe('Phaser taşımayan araç alt-yolları', () => {
  const packageJson = JSON.parse(
    readFileSync(resolve(import.meta.dirname, '../../package.json'), 'utf8'),
  ) as { exports: Record<string, unknown> };

  it('package exports UI, CSS, lifecycle, i18n ve fonts yüzeylerini açıkça tanımlar', () => {
    expect(packageJson.exports).toMatchObject({
      './ui': { import: './src/ui/index.ts', types: './src/ui/index.ts' },
      './ui/styles.css': './src/ui/theme.css',
      './lifecycle': { import: './src/lifecycle/index.ts', types: './src/lifecycle/index.ts' },
      './i18n': { import: './src/i18n/index.ts', types: './src/i18n/index.ts' },
      './fonts': { import: './src/fonts/index.ts', types: './src/fonts/index.ts' },
      './benchmark': { import: './src/benchmark/index.ts', types: './src/benchmark/index.ts' },
      './random': { import: './src/random/random.ts', types: './src/random/random.ts' },
      './spatial': {
        import: './src/spatial/SpatialIndex.ts',
        types: './src/spatial/SpatialIndex.ts',
      },
      './stats': { import: './src/stats/StatBlock.ts', types: './src/stats/StatBlock.ts' },
      './rig/metadata': { import: './src/rig/metadata.ts', types: './src/rig/metadata.ts' },
    });
  });

  it('alt-yollar beklenen bağımsız APIleri gerçekten ihraç eder', () => {
    expect(Ui.SplitPane).toBeDefined();
    expect(Ui.CanvasViewportController).toBeDefined();
    expect(Ui.CommandHistory).toBeDefined();
    expect(Ui.Toolbar).toBeDefined();
    expect(Lifecycle.DisposableScope).toBeDefined();
    expect(I18n.I18n).toBeDefined();
    expect(Fonts.FontManager).toBeDefined();
    expect(Fonts.VOL_FONTS).toBeDefined();
    expect(RigMetadata.validateRigMetadata).toBeDefined();
    expect(RigMetadata.buildRigDefinition).toBeDefined();
    expect(RigMetadata.articulateRigDefinition).toBeDefined();
  });

  it('iki alt yol AYNI dosyayı göstermez', () => {
    /*
     * Aynı dosyaya iki ad vermek, hangisinin kullanılacağına dair bir kural
     * bırakmaz ve tüketiciler kaçınılmaz olarak ayrışır. Tam olarak bu oldu:
     * harita hem `./random` hem `./random/random`, hem `./spatial` hem
     * `./spatial/SpatialIndex`, hem `./stats` hem `./stats/StatBlock`
     * taşıyordu. Yukarıdaki test KISA biçimi kanonik ilan ediyordu ama
     * VOL.HELL üç dosyada uzun biçimi kullanıyor, kısa biçimin ise hiç
     * tüketicisi yoktu — yani kanonik olan fiilen ölüydü.
     *
     * Bir export haritası bir SÖZDÜR: her girdi sonsuza kadar korunmak
     * zorundadır. Mükerrer bir giriş, karşılığı olmayan bir söz demektir.
     */
    const targets = new Map<string, string[]>();
    for (const [subpath, entry] of Object.entries(packageJson.exports)) {
      const target =
        typeof entry === 'string' ? entry : (entry as { import?: string }).import ?? undefined;
      if (target === undefined) continue;
      targets.set(target, [...(targets.get(target) ?? []), subpath]);
    }

    const duplicated = [...targets.entries()]
      .filter(([, subpaths]) => subpaths.length > 1)
      .map(([target, subpaths]) => `${target} ← ${subpaths.join(' , ')}`);

    expect(
      duplicated,
      'Aynı dosyaya birden çok alt yol açılmış. Birini kanonik seç, ' +
        'tüketicileri ona taşı, diğerini haritadan kaldır.',
    ).toEqual([]);
  });

  it('alt-yol barrel dosyaları oyun runtime veya Phaser import etmez', () => {
    const files = [
      '../../src/ui/index.ts',
      '../../src/lifecycle/index.ts',
      '../../src/i18n/index.ts',
      '../../src/fonts/index.ts',
      '../../src/rig/metadata.ts',
    ];
    for (const file of files) {
      const source = readFileSync(resolve(import.meta.dirname, file), 'utf8');
      expect(source).not.toMatch(/from ['"](?:\.\.\/)*Game|from ['"]phaser|from ['"]games\//);
    }
  });
});
