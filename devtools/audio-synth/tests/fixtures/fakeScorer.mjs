/**
 * Semantic scorer test kuklası (F6c) — bağımlılıksız Node süreci.
 *
 * `search run --semantic --scorer "node tests/fixtures/fakeScorer.mjs"` ile
 * koşulur. stdin'den SemanticScoreRequestV1 okur, stdout'a
 * SemanticScoreResponseV1 yazar. Skorlar adayın `spectralPeakHz`
 * betimleyicisinden türetilir: deterministiktir ve boyutlar değiştikçe
 * gerçekten farklılaşır.
 *
 * FAKE_SCORER_MODE ile hata kipleri sınanır:
 *   ok (varsayılan) | tie | unknown | garbage | exit | silent
 * FAKE_SCORER_DUMP verilirse alınan stdin belgesi o dosyaya da yazılır.
 */
import { writeFileSync } from 'node:fs';

const mode = process.env.FAKE_SCORER_MODE ?? 'ok';

let input = '';
process.stdin.on('data', (chunk) => (input += chunk));
process.stdin.on('end', () => {
  const dump = process.env.FAKE_SCORER_DUMP;
  if (dump) writeFileSync(dump, input);
  if (mode === 'exit') process.exit(3);
  if (mode === 'silent') return;
  if (mode === 'garbage') {
    process.stdout.write('json değil{');
    return;
  }
  const request = JSON.parse(input);
  const scores = (request.items ?? []).map((item) => ({
    candidateId: item.candidateId,
    score: mode === 'tie' ? 0.5 : (item.descriptors?.spectralPeakHz ?? 0) / 1000,
    note: 'kukla',
  }));
  if (mode === 'unknown') scores.push({ candidateId: 'c-9999', score: 9, note: null });
  process.stdout.write(JSON.stringify({ schema: 'SemanticScoreResponseV1', scores }));
});
