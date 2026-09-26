import { spawnSync } from 'node:child_process';
import {
  buildSemanticDocument,
  checkSemanticTerms,
  semanticRequest,
  validateSemanticResponse,
  SEMANTIC_SCORER_ENV,
  type SearchSemanticV1,
  type SemanticTermsV1,
} from '../search/semantic';
import type { AcousticSearchSpecV1 } from '../search/spec';
import { AudioParamError } from '../guard/errors';
import { writeAuditionCopy } from './audition';
import { hashCanonical, prettyCanonicalJson, type Sha256 } from './canonical';
import { ProtocolError } from './errors';
import { resolveInside, writeFileAtomic } from './fs';
import type { SearchCandidateOutput } from './parallelTasks';
import type { SearchLocation } from './search';

/**
 * Semantic scorer adaptörü — İSTEĞE BAĞLI LABORATUVAR KAPISI (F6c).
 *
 * Skorer, kullanıcının `AUDIO_SYNTH_SEMANTIC_SCORER` ya da `--scorer` ile
 * verdiği HARİCİ süreçtir: request JSON'u stdin'e yazılır, response JSON'u
 * stdout'tan okunur. Core hiçbir model bağımlılığı taşımaz; skorer kapalıyken
 * bütün production akışı eksiksiz çalışır.
 *
 * SINIR: skorlar yalnız `semantic.json` ve CLI sıralamasıdır. Aday durumunu,
 * kararları, terfiyi, manifest'i ya da publish kapısını etkilemez — bu
 * fonksiyon hiçbir production belgesi okumaz/yazmaz.
 */
export interface SemanticRunConfig {
  /** Scorer komutu; verilmezse `AUDIO_SYNTH_SEMANTIC_SCORER` okunur. */
  readonly command?: string;
  readonly terms: SemanticTermsV1;
}

export interface SemanticRunOutcome {
  /** `<search>/semantic.json` (repo-göreli). */
  readonly file: string;
  readonly document: SearchSemanticV1;
}

/** Scorer'a giden WAV kopyası — dinleme kopyası gibi `export/` altında kalır. */
function semanticWavPath(searchId: string, candidateId: string): string {
  return `devtools/audio-synth/export/audio-searches/${searchId}/semantic/${candidateId}.wav`;
}

const SCORER_TIMEOUT_MS = 120_000;
const SCORER_MAX_BUFFER = 8 * 1024 * 1024;

export function runSemanticScoring(
  loc: SearchLocation,
  spec: AcousticSearchSpecV1,
  reportHash: Sha256,
  outputs: readonly SearchCandidateOutput[],
  config: SemanticRunConfig,
): SemanticRunOutcome {
  const terms = checkSemanticTerms(config.terms, 'semantic.terms');
  const command = config.command ?? process.env[SEMANTIC_SCORER_ENV];
  if (command === undefined || command.trim() === '') {
    throw new ProtocolError(
      'invalid',
      `scorer komutu yok — --scorer <cmd> ya da ${SEMANTIC_SCORER_ENV}=<cmd> gerekir`,
      undefined,
    );
  }
  // Skorlanabilir adaylar = render üretmiş olanlar (passed ya da render sonrası
  // filtrelenmiş; geçersiz/hata adayların PCM'i yoktur ve skorlanamaz).
  const items = outputs.flatMap(({ result, render }) =>
    render && result.candidateId && result.state !== 'error'
      ? [
          {
            candidateId: result.candidateId,
            wav: writeAuditionCopy(
              loc.repoRoot,
              semanticWavPath(loc.searchId, result.candidateId),
              render,
            ),
            descriptors: result.descriptors,
          },
        ]
      : [],
  );
  if (items.length === 0) {
    throw new ProtocolError(
      'invalid',
      'skorlanabilir aday yok (hiçbir aday render üretmedi)',
      loc.searchId,
    );
  }
  const specHash = hashCanonical(spec);
  const request = semanticRequest(loc.searchId, specHash, reportHash, terms, items);
  const spawned = spawnSync('sh', ['-c', command], {
    input: JSON.stringify(request),
    encoding: 'utf8',
    timeout: SCORER_TIMEOUT_MS,
    maxBuffer: SCORER_MAX_BUFFER,
  });
  if (spawned.error) {
    throw new ProtocolError(
      'toolchain',
      `scorer süreci başarısız: ${spawned.error.message}`,
      loc.searchId,
    );
  }
  if (spawned.status !== 0) {
    throw new ProtocolError(
      'toolchain',
      `scorer çıkış kodu ${spawned.status}: ${spawned.stderr.slice(0, 500)}`,
      loc.searchId,
    );
  }
  let doc: unknown;
  try {
    doc = JSON.parse(spawned.stdout);
  } catch {
    throw new ProtocolError(
      'toolchain',
      `scorer çıktısı JSON değil: ${spawned.stdout.slice(0, 200)}`,
      loc.searchId,
    );
  }
  const allowed = new Set(items.map((i) => i.candidateId));
  let scores;
  try {
    scores = validateSemanticResponse(doc, allowed);
  } catch (error) {
    if (!(error instanceof AudioParamError)) throw error;
    throw new ProtocolError('toolchain', `scorer yanıtı geçersiz: ${error.message}`, loc.searchId);
  }
  const document = buildSemanticDocument(
    loc.searchId,
    specHash,
    reportHash,
    command,
    terms,
    scores,
  );
  const file = `${loc.searchesRoot}/${loc.searchId}/semantic.json`;
  writeFileAtomic(
    resolveInside(loc.repoRoot, file, 'semantic.json'),
    prettyCanonicalJson(document),
  );
  return { file, document };
}
