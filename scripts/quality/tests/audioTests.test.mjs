import assert from 'node:assert/strict';
import test from 'node:test';
import { audioTestPlan } from '../audioTests.mjs';

test('kaynak değişimi bağımlı testleri seçer ve sabit yayın regresyonlarını korur', () => {
  const plan = audioTestPlan([
    { status: 'M', path: 'devtools/audio-synth/src/protocol/context.ts' },
  ]);
  assert.equal(plan.length, 2);
  assert.equal(plan[0][0], 'run');
  assert.ok(plan[0].includes('tests/governance/publishPath.test.ts'));
  assert.deepEqual(plan[1], ['related', '--run', '--passWithNoTests', 'src/protocol/context.ts']);
});

test('CORE değişimi workspace tüketicisinin bağımlı testlerinde sorgulanır', () => {
  const plan = audioTestPlan([{ status: 'M', path: 'core/src/math/interpolation.ts' }]);
  assert.ok(plan[1].includes('../../core/src/math/interpolation.ts'));
});

test('silinen kaynak ve test yapılandırması dar seçime güvenmeden tam takımı koşar', () => {
  for (const change of [
    { status: 'D', path: 'devtools/audio-synth/src/program/render.ts' },
    { status: 'M', path: 'devtools/audio-synth/vitest.config.ts' },
  ])
    assert.deepEqual(audioTestPlan([change]), [['run']]);
  assert.deepEqual(audioTestPlan(null), [['run']]);
});

test('doğrudan değişen test kapsamda kalır; ilgisiz belge ses takımını büyütmez', () => {
  const changed = audioTestPlan([
    { status: 'M', path: 'devtools/audio-synth/tests/program/instrument.test.ts' },
  ]);
  assert.ok(changed[1].includes('tests/program/instrument.test.ts'));
  assert.equal(audioTestPlan([{ status: 'M', path: 'docs/android.md' }]).length, 1);
});
