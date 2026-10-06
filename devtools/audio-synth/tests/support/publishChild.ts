import { existsSync, writeFileSync } from 'node:fs';
import { ProtocolError } from '../../src/protocol/errors';
import { publishJob } from '../../src/protocol/publish';

/**
 * Yayın yarışı alt süreci: `<repo> <jobId> <hazır dosyası> <başlat dosyası>`.
 * Hazır dosyasını yazar, başlat dosyası görünene dek bekler (iki süreç aynı
 * anda başlasın), sonra yayımlar ve sonucu tek satır JSON olarak yazar.
 */
const [repoRoot, jobId, readyFile, startFile] = process.argv.slice(2);
writeFileSync(readyFile, String(process.pid));
const deadline = Date.now() + 30_000;
while (!existsSync(startFile)) {
  if (Date.now() > deadline) throw new Error('başlatma işareti gelmedi');
}
let result: Record<string, unknown>;
try {
  publishJob({
    repoRoot,
    jobsRoot: 'devtools/audio-synth/records/jobs',
    jobId,
  });
  result = { ok: true };
} catch (error) {
  result =
    error instanceof ProtocolError
      ? { ok: false, code: error.code, message: error.message }
      : { ok: false, code: 'other', message: String(error) };
}
process.stdout.write(JSON.stringify(result));
