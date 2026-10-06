import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import {
  validateAxeRecords,
  validateGeometryRecords,
  validateRepoUiEvidence,
  validateStateFixtures,
} from '../uiEvidence.mjs';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const tasks = new Set(['UI-03.1', 'UI-09.1']);
const record = (over = {}) => ({
  scope: 'tab/buttons',
  rule: 'button-name',
  target: '.x',
  owner: 'UI-03.1',
  reason: 'ad yok',
  ...over,
});

test('geçerli axe kaydı ihlal üretmez', () => {
  assert.deepEqual(
    validateAxeRecords({ violations: [record()], incomplete: [record()] }, tasks),
    [],
  );
});

test('sahibi kapanmış/yanlış, gerekçesiz, yinelenen ve geçersiz kapsamlı kayıt reddedilir', () => {
  const problems = validateAxeRecords(
    {
      violations: [
        record({ owner: 'UI-99.9' }),
        record({ reason: ' ' }),
        record(),
        record(),
        record({ scope: 'her-yer' }),
      ],
      incomplete: [],
    },
    tasks,
  );
  assert.ok(problems.some((p) => /sahip görev açık bir UI görevi olmalı \(UI-99\.9\)/.test(p)));
  assert.ok(problems.some((p) => /gerekçe boş/.test(p)));
  assert.ok(problems.some((p) => /yinelenen kayıt/.test(p)));
  assert.ok(problems.some((p) => /geçersiz kapsam/.test(p)));
});

const registry = {
  archetypes: { overlay: { applicable: ['normal', 'focusVisible', 'keyboard'] } },
  entries: [{ export: 'Modal', archetype: 'overlay' }],
};
const fixture = (over = {}) => ({
  scope: 'panels/modal',
  export: 'Modal',
  states: ['focusVisible', 'keyboard'],
  known: { keyboard: { chromium: 'UI-09.1' } },
  ...over,
});

test('uygulanabilir durumu sınayan fixture geçer', () => {
  assert.deepEqual(validateStateFixtures({ fixtures: [fixture()] }, registry, tasks), []);
});

test("N/A duruma, kayıtsız export'a ve kapanmış sahibe yazılan fixture reddedilir", () => {
  const problems = validateStateFixtures(
    {
      fixtures: [
        fixture({ states: ['hover'] }),
        fixture({ scope: 'x/y', export: 'Yok' }),
        fixture({ scope: 'a/b', known: { keyboard: { webkit: 'UI-99.9' } } }),
        fixture({
          scope: 'c/d',
          known: { focusVisible: { firefox: 'UI-09.1' }, press: { '*': 'UI-09.1' } },
        }),
      ],
    },
    registry,
    tasks,
  );
  assert.ok(problems.some((p) => /"hover" uygulanabilir değil/.test(p)));
  assert.ok(problems.some((p) => /Yok registry'de yok/.test(p)));
  assert.ok(problems.some((p) => /known sahibi açık UI görevi olmalı/.test(p)));
  assert.ok(problems.some((p) => /bilinmeyen motor "firefox"/.test(p)));
  assert.ok(problems.some((p) => /known "press" fixture'ın durumu değil/.test(p)));
});

const geometry = (over = {}) => ({
  scope: 'tab/panels',
  rule: 'clipped',
  target: '.vol-button',
  owner: 'UI-03.1',
  reason: 'kırpılıyor',
  ...over,
});

test('geçerli geometri kaydı ihlal üretmez', () => {
  assert.deepEqual(validateGeometryRecords({ hitTargets: [geometry()] }, tasks), []);
});

test('geometri: kapanmış sahip, bilinmeyen kural, yinelenen ve gerekçesiz kayıt reddedilir', () => {
  const problems = validateGeometryRecords(
    {
      hitTargets: [
        geometry({ owner: 'UI-99.9' }),
        geometry({ rule: 'tiny', target: '.b' }),
        geometry({ reason: '', target: '.c' }),
        geometry({ target: '.d', scope: 'her-yer' }),
        geometry({ target: '.e' }),
        geometry({ target: '.e' }),
      ],
    },
    tasks,
  );
  assert.ok(problems.some((p) => /sahip görev açık bir UI görevi olmalı \(UI-99\.9\)/.test(p)));
  assert.ok(problems.some((p) => /bilinmeyen kural/.test(p)));
  assert.ok(problems.some((p) => /gerekçe boş/.test(p)));
  assert.ok(problems.some((p) => /geçersiz kapsam/.test(p)));
  assert.ok(problems.some((p) => /yinelenen kayıt/.test(p)));
});

test('glif kaydı: geçerli geçer; biçim, motor, sahip ve gerekçe hatası reddedilir', () => {
  const ok = { font: 'Jura 12px w400', owner: 'UI-03.1', reason: 'düşük' };
  assert.deepEqual(validateGeometryRecords({ hitTargets: [], glyphHeights: [ok] }, tasks), []);
  const problems = validateGeometryRecords(
    {
      hitTargets: [],
      glyphHeights: [
        ok,
        { ...ok, font: 'Jura 12' },
        { ...ok, font: 'A 9px w400', engines: ['firefox'] },
        { ...ok, font: 'B 9px w400', owner: 'UI-99.9' },
        { ...ok, font: 'C 9px w400', reason: '' },
      ],
    },
    tasks,
  );
  assert.ok(problems.some((p) => /Aile boyutpx/.test(p)));
  assert.ok(problems.some((p) => /bilinmeyen motor "firefox"/.test(p)));
  assert.ok(problems.some((p) => /UI-99\.9/.test(p)));
  assert.ok(problems.some((p) => /gerekçe boş/.test(p)));
});

test('depodaki axe kaydı ve durum fixture verisi geçerlidir', () => {
  assert.deepEqual(validateRepoUiEvidence(ROOT), []);
});
