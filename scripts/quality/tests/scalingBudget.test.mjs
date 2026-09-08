import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateScaling } from '../scalingBudget.mjs';

const BUDGET = { 'games/demo': { fxParts72Over18: 4.5 } };

test('tavanın altındaki ölçekleme geçer', () => {
  const problems = validateScaling('/repo', BUDGET, () => ({ fxParts72Over18: 3.0 }));
  assert.deepEqual(problems, []);
});

test('tavanı aşan ölçekleme reddedilir', () => {
  /* Kareselleşme (~16) bir yana, doğrusalı biraz aşmak bile bildirilmeli. */
  const problems = validateScaling('/repo', BUDGET, () => ({ fxParts72Over18: 4.6 }));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /KARMAŞIKLIK arttı/);
  assert.match(problems[0], /4\.600/);
});

test('ÖLÇÜLEMEYEN bütçe geçerli sayılmaz', () => {
  /*
   * Sessiz geçiş en tehlikeli sonuç: benchmark koşamadığında kapı "sorun yok"
   * derse, koruma var sanılır ama yoktur.
   */
  const problems = validateScaling('/repo', BUDGET, () => {
    throw new Error('benchmark çöktü');
  });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /geçerli SAYILMAZ/);
});

test('eksik metrik sessizce geçmez', () => {
  const problems = validateScaling('/repo', BUDGET, () => ({}));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /ölçülemedi/);
});

test('`$comment` anahtarları bütçe sanılmaz', () => {
  const problems = validateScaling(
    '/repo',
    { $comment: 'açıklama', 'games/demo': { $comment: 'x', fxParts72Over18: 3.0 } },
    () => ({ fxParts72Over18: 3.0 }),
  );
  assert.deepEqual(problems, []);
});

/*
 * Bekçi bir dönem `vol-arachnid`in betiğine ve `fxScale` alanına kilitliydi;
 * başka bir pakete bütçe yazmak kapıyı "ölçülemedi" ile düşürüyordu. Tarif
 * artık VERİDİR ve oran anahtarı kendi girdilerini taşır.
 */
test('ölçüm tarifi bütçeden okunur; oran anahtarı girdilerini taşır', () => {
  const calls = [];
  const runner = (root, dir, measure, keys) => {
    calls.push({ dir, measure, keys });
    return { fxParts72Over18: 3.1, agentsSteps40000Over10000: 3.9 };
  };
  const problems = validateScaling(
    '/repo',
    {
      'games/demo': {
        $measure: { script: 'scripts/benchmark/x.ts', series: 's', input: 'n', value: 'ms' },
        fxParts72Over18: 4.5,
        agentsSteps40000Over10000: 4.5,
      },
    },
    runner,
  );

  assert.deepEqual(problems, []);
  assert.equal(calls[0].measure.script, 'scripts/benchmark/x.ts');
  assert.deepEqual(calls[0].keys, ['fxParts72Over18', 'agentsSteps40000Over10000']);
});

test('tarif yoksa ölçüm KOŞULMAZ ve bütçe geçerli sayılmaz', () => {
  const problems = validateScaling('/repo', { 'games/demo': { fxParts72Over18: 4.5 } });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /geçerli SAYILMAZ/);
});
