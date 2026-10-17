import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scalingRatios, validateScaling } from '../scalingBudget.mjs';

const BUDGET = { 'games/demo': { fxParts72Over18: 4.5 } };

test('tavanın altındaki ölçekleme geçer', () => {
  const problems = validateScaling('/repo', BUDGET, () => ({ fxParts72Over18: 3.0 }));
  assert.deepEqual(problems, []);
});

test('tavanı aşan ölçekleme reddedilir', () => {
  /* Kareselleşme (~16) bir yana, doğrusalı biraz aşmak bile bildirilmeli. */
  const problems = validateScaling('/repo', BUDGET, () => ({ fxParts72Over18: 4.6 }));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /süre oranı bütçeyi aştı/);
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
        $measure: { script: 'scripts/benchmark/x.ts', series: 's' },
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

const report = (
  entries = [
    { input: 18, value: 1 },
    { input: 72, value: 4 },
  ],
) => ({
  schemaVersion: 1,
  unit: 'ms/step',
  series: { parts: entries },
});

test('ortak şema girdileri sıralar ve yalnız istenen oranı hesaplar', () => {
  assert.deepEqual(scalingRatios(report(), 'parts', ['parts72Over18']), {
    parts72Over18: 4,
  });
  assert.deepEqual(
    scalingRatios(
      report([
        { input: 72, value: 4 },
        { input: 18, value: 1 },
      ]),
      'parts',
      ['parts72Over18'],
    ),
    { parts72Over18: 4 },
  );
});

test('şema, birim, seri ve oran eksikliği ölçüm kanıtı olamaz', () => {
  for (const invalid of [
    null,
    {},
    { ...report(), schemaVersion: 2 },
    { ...report(), unit: 'seconds' },
    { ...report(), series: [] },
    report([]),
    { ...report(), series: { other: report().series.parts } },
  ])
    assert.throws(() => scalingRatios(invalid, 'parts', ['parts72Over18']));
  for (const key of ['unmeasured', 'parts18Over72', 'parts18Over18', 'parts100Over18'])
    assert.throws(() => scalingRatios(report(), 'parts', [key]));
});

test('kopya, bozuk, sıfır veya sonlu olmayan örnek ve taşan oran reddedilir', () => {
  for (const entry of [
    null,
    { input: 18, value: 9 },
    { input: 0, value: 1 },
    { input: 72.5, value: 1 },
    { input: '72', value: 1 },
    { input: 72, value: '1' },
    { input: 72, value: 0 },
    { input: 72, value: -1 },
    { input: 72, value: NaN },
    { input: 72, value: Infinity },
  ])
    assert.throws(() =>
      scalingRatios(report([{ input: 18, value: 1 }, entry]), 'parts', ['parts72Over18']),
    );
  assert.throws(() =>
    scalingRatios(
      report([
        { input: 18, value: Number.MIN_VALUE },
        { input: 72, value: Number.MAX_VALUE },
      ]),
      'parts',
      ['parts72Over18'],
    ),
  );
});
