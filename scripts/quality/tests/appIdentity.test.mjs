import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { identitySlug, validateAppIdentity, validateRepoAppIdentity } from '../appIdentity.mjs';

test('paket adı kimlikte aranan biçime indirgenir', () => {
  assert.equal(identitySlug('@volstudio/deck-probe'), 'deckprobe');
  assert.equal(identitySlug('@volstudio/sample-game'), 'samplegame');
});

test('jenerik, ürün adı taşımayan ve çakışan kimlikler reddedilir', () => {
  const problems = validateAppIdentity([
    { name: '@volstudio/sample-game', pkg: 'com.volstudio.game' },
    { name: '@volstudio/other-game', pkg: 'studio.vol.something' },
    { name: '@volstudio/third-game', pkg: 'studio.vol.thirdgame' },
    { name: '@volstudio/third-game-copy', pkg: 'studio.vol.thirdgame' },
  ]).join('\n');
  assert.match(problems, /sample-game: .*jenerik/);
  assert.match(problems, /other-game: .*paket adını/);
  assert.match(problems, /third-game-copy: .*third-game ile aynı/);
  assert.deepEqual(
    validateAppIdentity([{ name: '@volstudio/deck-probe', pkg: 'studio.vol.deckprobe' }]),
    [],
  );
});

test('gerçek ağaçtaki aktif uygulamaların kimlikleri kurala uyar', () => {
  assert.deepEqual(validateRepoAppIdentity(resolve(import.meta.dirname, '../../..')), []);
});
