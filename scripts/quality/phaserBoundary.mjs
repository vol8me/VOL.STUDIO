import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { workingTreeFiles } from './gitFiles.mjs';
import { sourceImports } from './sourceImports.mjs';

export const PHASER_BRIDGES = Object.freeze([
  'core/src/phaser/ViewportManager.ts',
  'core/src/phaser/createVolGame.ts',
  'core/src/phaser/entities/BaseSprite.ts',
  'core/src/phaser/entities/MovableController.ts',
  'core/src/phaser/input/InputManager.ts',
  'core/src/phaser/input/PCController.ts',
  'core/src/phaser/input/TouchController.ts',
  'core/src/phaser/rig/assembleRig.ts',
]);

export const PHASER_REPLACEMENTS = Object.freeze({
  audio: 'Adaptive stem, sidechain ve tek AudioContext yaşam döngüsü Phaser.Sound tarafında yok.',
  events: 'Tipli olay adları ve hata izolasyonu Phaser EventEmitter sözleşmesinden farklı.',
  math: 'Headless ve sonlu sayı sözleşmeli matematik Phaser kurulmadan çalışır.',
  pool: 'Jenerik havuz Phaser GameObject olmayan değerleri de yönetir.',
  random: 'Tohumlanabilir ve state aktarılabilir RNG tekrar üretilebilirlik sağlar.',
  time: 'Sahne döngüsünden bağımsız sabit adım ve catch-up sınırı gerekir.',
});

function importsPhaser(source, file) {
  return sourceImports(source, file).some(
    (specifier) => specifier === 'phaser' || specifier.startsWith('phaser/'),
  );
}

export function validatePhaserBoundary(root, bridges = PHASER_BRIDGES) {
  const problems = [];
  const declared = new Set(bridges);
  const files = workingTreeFiles(root, ['core/src/**/*.ts', 'core/src/*.ts']);
  const coupled = files.filter((file) =>
    importsPhaser(readFileSync(join(root, file), 'utf8'), file),
  );

  for (const file of coupled) {
    if (!file.startsWith('core/src/phaser/')) {
      problems.push(`${file}: doğrudan Phaser importu yalnız core/src/phaser/** altında olabilir.`);
    }
    if (!declared.has(file)) {
      problems.push(`${file}: Phaser bridge ledger kaydı yok.`);
    }
  }

  for (const file of declared) {
    if (!existsSync(join(root, file))) {
      problems.push(`${file}: Phaser bridge ledger kaydı bayat; dosya yok.`);
    } else if (!coupled.includes(file)) {
      problems.push(`${file}: bridge olarak kayıtlı ama doğrudan Phaser importu yok.`);
    }
  }

  return problems;
}
