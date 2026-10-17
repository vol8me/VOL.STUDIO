import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  describeSignoff,
  readSignoffRecord,
  signoffRecordFile,
  writeSignoffRecord,
} from '../signoffRecord.mjs';

function withRoot(body) {
  const root = mkdtempSync(join(tmpdir(), 'vol-signoff-record-'));
  try {
    return body(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const NOW = Date.parse('2026-10-11T12:00:00.000Z');
const record = {
  treeDigest: 'aaa',
  commit: 'c0ffee',
  passedAt: '2026-10-11T10:00:00.000Z',
  durationMs: 2_900_000,
};

test('kayıt yazılıp aynen okunur; kayıt yokken null verir', () => {
  withRoot((root) => {
    assert.equal(readSignoffRecord(root), null);
    writeSignoffRecord(root, record);
    assert.deepEqual(readSignoffRecord(root), record);
  });
});

test('bozuk, eksik alanlı ya da geçersiz tarihli kayıt "kayıt yok" sayılır', () => {
  withRoot((root) => {
    const file = signoffRecordFile(root);
    mkdirSync(dirname(file), { recursive: true });
    for (const content of [
      'bozuk {',
      '{}',
      JSON.stringify({ treeDigest: 'a', passedAt: 'dün' }),
      JSON.stringify({ treeDigest: 1, passedAt: record.passedAt }),
    ]) {
      writeFileSync(file, content);
      assert.equal(readSignoffRecord(root), null, content);
    }
  });
});

test('kayıt yoksa uyarır', () => {
  const result = describeSignoff({ record: null, treeDigest: 'aaa', now: NOW, commitsSince: null });
  assert.equal(result.state, 'none');
  assert.equal(result.ageMs, null);
  assert.match(result.message, /^uyarı:.*yeşil `signoff` kaydı yok/);
});

test('ağaç karması aynıysa uyarı yazmaz ve yaşı söyler', () => {
  const result = describeSignoff({ record, treeDigest: 'aaa', now: NOW, commitsSince: 0 });
  assert.equal(result.state, 'same');
  assert.equal(result.ageMs, 2 * 60 * 60_000);
  assert.match(result.message, /^son yeşil signoff 2\.0 sa önce; ağaç bayt bayt aynı/);
});

test('ağaç değiştiyse commit farkını ya da bilinmediğini söyler ve uyarır', () => {
  const ahead = describeSignoff({ record, treeDigest: 'bbb', now: NOW, commitsSince: 3 });
  assert.equal(ahead.state, 'changed');
  assert.match(ahead.message, /^uyarı:.*3 commit sonrası.*e2e koşulmadı/);

  const dirty = describeSignoff({ record, treeDigest: 'bbb', now: NOW, commitsSince: 0 });
  assert.match(dirty.message, /commit aynı, çalışma ağacı farklı/);

  const unknown = describeSignoff({ record, treeDigest: 'bbb', now: NOW, commitsSince: null });
  assert.match(unknown.message, /commit farkı bilinmiyor/);
});

test('yaş birimi dakikadan güne ölçeklenir', () => {
  const at = (iso) =>
    describeSignoff({
      record: { ...record, passedAt: iso },
      treeDigest: 'aaa',
      now: NOW,
      commitsSince: 0,
    }).message;
  assert.match(at('2026-10-11T11:59:30.000Z'), /az önce/);
  assert.match(at('2026-10-11T11:20:00.000Z'), /40 dk önce/);
  assert.match(at('2026-10-08T12:00:00.000Z'), /3 gün önce/);
});
