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
