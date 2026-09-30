import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { contextViolations, validateContextComments } from '../contextComments.mjs';

test('günlük, tarihçe, tarih ve plan kimliği taşıyan yorum yakalanır', () => {
  const text = [
    '// Ölçüldü: 1214 px oynuyordu.',
    ' * Eskiden bu çağrı release planlamıyordu.',
    ' * (ölçüldü 2026-09-27, Deck)',
    '// Dalga 12 kararı: eksenler eklendi.',
    ' * verisi (D6) bu biçimi bekler.',
    ' * Kapanış şartları (TODO D1): ELF bekçisi.',
  ].join('\n');
  assert.deepEqual(
    contextViolations(text).map((hit) => hit.name),
    ['ölçüm günlüğü', 'tarihçe', 'ölçüm günlüğü', 'plan kimliği', 'plan kimliği', 'plan kimliği'],
  );
});

test('gerekçe, örnek metin ve kod satırı serbesttir', () => {
  const text = [
    ' * ("Dalga 3", "El 3") oyunun kelimesidir.',
    '/** Eskiden yeniye doğru gezinir. */',
    " * Kodek dönüşü true peak'i yaklaşık 0.2 dB yükseltir.",
    "const label = 'ölçüldü: 3';",
  ].join('\n');
  assert.deepEqual(contextViolations(text), []);
});

test('gerçek depo bağlam yorumu taşımaz', () => {
  assert.deepEqual(validateContextComments(resolve(import.meta.dirname, '../../..')), []);
});
