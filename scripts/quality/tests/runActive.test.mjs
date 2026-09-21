import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildActiveScriptCommand, selectActivePackages } from '../runActive.mjs';

const lifecycle = {
  schemaVersion: 1,
  workspaces: [
    { packageName: '@vol/active', path: 'active', status: 'active' },
    {
      packageName: '@vol/frozen',
      path: 'frozen',
      status: 'frozen',
      freezeTag: 'freeze/test',
      freezeCommit: '0'.repeat(40),
      decisionDate: '2026-09-21',
      reason: 'fixture',
    },
  ],
};
const packages = [
  { name: '@vol/active', scripts: { test: 'vitest run' } },
  { name: '@vol/frozen', scripts: { test: 'vitest run' } },
];

test('routine workspace seçimi frozen paketi dışarıda bırakır', () => {
  assert.deepEqual(selectActivePackages(lifecycle, packages), [packages[0]]);
  const command = buildActiveScriptCommand(lifecycle, packages, 'test');
  assert.deepEqual(command.packages, ['@vol/active']);
  assert.equal(command.args.includes('@vol/frozen'), false);
});

test('active paket frozen yapıldığında routine komuttan kendiliğinden çıkar', () => {
  const transitioned = structuredClone(lifecycle);
  transitioned.workspaces[0] = {
    packageName: '@vol/active',
    path: 'active',
    status: 'frozen',
    freezeTag: 'freeze/active',
    freezeCommit: '1'.repeat(40),
    decisionDate: '2026-09-21',
    reason: 'fixture',
  };
  assert.throws(
    () => buildActiveScriptCommand(transitioned, packages, 'test'),
    /Aktif workspace'lerde "test" script'i yok/,
  );
});
