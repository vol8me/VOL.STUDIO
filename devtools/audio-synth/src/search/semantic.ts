import { AudioParamError } from '../guard/errors';
import { checkArray, checkNumber, checkObject } from '../guard/read';
import type { Sha256 } from '../protocol/canonical';
import type { DescriptorSummaryV1 } from '../analysis/summary';

/**
 * Semantic audio scorer — İSTEĞE BAĞLI LABORATUVAR SİNYALİ.
 *
 * Bir metin-ses gömücüsü ya da sesli model core `audio-synth` bağımlılığı
 * YAPILMAZ: scorer her zaman kullanıcının sağladığı harici süreçtir ve bu
 * modül yalnız istek/yanıt şeması ile sıralama matematiğini taşır. Skorlar
 * aday durumunu (`passed`/`filtered`/`invalid`), kararları, terfiyi ya da
 * publish kapısını ASLA etkilemez; tek çıktısı arama dizinindeki yardımcı
 * `semantic.json` ve CLI sıralama listesidir. Scorer tanımsızken bütün
 * production akışı eksiksiz çalışır (varsayılan kapalı).
 */
export const SEMANTIC_SCHEMA = 'SearchSemanticV1';
export const SEMANTIC_REQUEST_SCHEMA = 'SemanticScoreRequestV1';
export const SEMANTIC_RESPONSE_SCHEMA = 'SemanticScoreResponseV1';

/**
 * Scorer argv'si için ortam değişkeni (`--scorer` bayrağı bunu geçersiz
 * kılar). Değer bir JSON argv dizisidir (`["node","scorer.mjs","--opt"]`);
 * köşeli ayraçla başlamayan düz metin tek elemanlı argv (çalıştırılabilir
 * yolu, argüman yok) sayılır. Kabuk asla araya girmez: argv[0] doğrudan
 * `spawnSync`'e verilir, `;`/`$()`/`&&` gibi karakterler yorumlanmaz.
 */
export const SEMANTIC_SCORER_ENV = 'AUDIO_SYNTH_SEMANTIC_SCORER';

export const MAX_SEMANTIC_TERMS = 16;
export const MAX_SEMANTIC_TERM_CHARS = 80;

export interface SemanticTermsV1 {
  readonly positive: readonly string[];
  readonly negative: readonly string[];
}

function termList(value: unknown, path: string): string[] {
  const list = checkArray(value, path);
  if (list.length > MAX_SEMANTIC_TERMS) {
    throw new AudioParamError(path, 'range', `en çok ${MAX_SEMANTIC_TERMS} terim`, list.length);
  }
  return list.map((t, i) => {
    if (typeof t !== 'string' || t.trim().length === 0 || t.length > MAX_SEMANTIC_TERM_CHARS) {
      throw new AudioParamError(
        `${path}[${i}]`,
        'type',
        `1…${MAX_SEMANTIC_TERM_CHARS} karakterlik terim`,
        t,
      );
    }
    return t.trim();
  });
}

export function checkSemanticTerms(value: unknown, path: string): SemanticTermsV1 {
  const o = checkObject(value, path, ['positive', 'negative']);
  const positive = termList(o.positive ?? [], `${path}.positive`);
  const negative = termList(o.negative ?? [], `${path}.negative`);
  if (positive.length + negative.length === 0) {
    throw new AudioParamError(path, 'required', 'en az bir pozitif veya negatif terim', value);
  }
  const overlap = positive.filter((t) => negative.includes(t));
  if (overlap.length > 0) {
    throw new AudioParamError(
      path,
      'combination',
      'aynı terim iki listede birden olamaz',
      overlap[0],
    );
  }
  return { positive, negative };
}

/**
 * Scorer argv doğrulaması: boş olmayan metin parçalarından oluşan dizi.
 * Boş dizi geçerlidir ve "yapılandırılmamış" anlamı taşır.
 */
export function checkScorerArgv(value: unknown, path: string): string[] {
  const list = checkArray(value, path);
  return list.map((a, i) => {
    if (typeof a !== 'string' || a.trim().length === 0) {
      throw new AudioParamError(`${path}[${i}]`, 'type', 'boş olmayan komut parçası', a);
    }
    return a;
  });
}

/**
 * Metin yapılandırmasını argv'ye çevirir. `[` ile başlayan değer JSON argv
 * dizisidir; aksi halde tek elemanlı argv sayılır. Boş metin boş dizidir.
 */
export function parseScorerArgv(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed === '') return [];
  if (!trimmed.startsWith('[')) return [trimmed];
  let value: unknown;
  try {
    value = JSON.parse(trimmed);
  } catch {
    throw new AudioParamError('scorer', 'type', 'JSON argv dizisi', trimmed.slice(0, 80));
  }
  return checkScorerArgv(value, 'scorer');
}

/** Skorer sürecine giden istek öğesi: WAV yolu + ölçülmüş betimleyiciler. */
export interface SemanticRequestItem {
  readonly candidateId: string;
  /** Repo-göreli WAV yolu (export ağacı; git'e girmez). */
  readonly wav: string;
  readonly descriptors: DescriptorSummaryV1 | null;
}

export interface SemanticScoreRequestV1 {
  readonly schema: typeof SEMANTIC_REQUEST_SCHEMA;
  readonly searchId: string;
  readonly specHash: Sha256;
  readonly reportHash: Sha256;
  readonly terms: SemanticTermsV1;
  readonly items: readonly SemanticRequestItem[];
}

export interface SemanticScoreEntryV1 {
  readonly candidateId: string;
  readonly score: number;
  readonly note: string | null;
}

export interface SearchSemanticV1 {
  readonly schema: typeof SEMANTIC_SCHEMA;
  readonly searchId: string;
  readonly specHash: Sha256;
  readonly reportHash: Sha256;
  readonly scorer: { readonly argv: readonly string[] };
  readonly terms: SemanticTermsV1;
  readonly scores: readonly SemanticScoreEntryV1[];
  /** Skora göre azalan sıralama (eşitlikte candidateId); sunum içindir. */
  readonly ranked: readonly string[];
}

export function semanticRequest(
  searchId: string,
  specHash: Sha256,
  reportHash: Sha256,
  terms: SemanticTermsV1,
  items: readonly SemanticRequestItem[],
): SemanticScoreRequestV1 {
  return {
    schema: SEMANTIC_REQUEST_SCHEMA,
    searchId,
    specHash,
    reportHash,
    terms,
    items,
  };
}

/**
 * Scorer yanıtını doğrular: şema adı, yalnız bilinen aday kimlikleri ve
 * sonlu skorlar. Bilinmeyen ya da tekrarlanan kimlik reddedilir.
 */
export function validateSemanticResponse(
  value: unknown,
  allowedIds: ReadonlySet<string>,
): readonly SemanticScoreEntryV1[] {
  const o = checkObject(value, 'response', ['schema', 'scores']);
  if (o.schema !== SEMANTIC_RESPONSE_SCHEMA) {
    throw new AudioParamError(
      'response.schema',
      'type',
      `"${SEMANTIC_RESPONSE_SCHEMA}" olmalı`,
      o.schema,
    );
  }
  const list = checkArray(o.scores, 'response.scores');
  const seen = new Set<string>();
  return list.map((entry, i) => {
    const at = `response.scores[${i}]`;
    const e = checkObject(entry, at, ['candidateId', 'score', 'note']);
    if (typeof e.candidateId !== 'string' || !allowedIds.has(e.candidateId)) {
      throw new AudioParamError(
        `${at}.candidateId`,
        'unknown-id',
        'skorlanan aday değil',
        e.candidateId,
      );
    }
    if (seen.has(e.candidateId)) {
      throw new AudioParamError(
        `${at}.candidateId`,
        'combination',
        'tekrarlanan aday',
        e.candidateId,
      );
    }
    seen.add(e.candidateId);
    const score = checkNumber(e.score, `${at}.score`);
    if (e.note !== undefined && e.note !== null && typeof e.note !== 'string') {
      throw new AudioParamError(`${at}.note`, 'type', 'metin ya da null', e.note);
    }
    return { candidateId: e.candidateId, score, note: e.note ?? null };
  });
}

/** Skora göre azalan; eşitlikte kimlik sırası — deterministik sunum sırası. */
export function rankedOrder(scores: readonly SemanticScoreEntryV1[]): string[] {
  return [...scores]
    .sort(
      (a, b) =>
        b.score - a.score ||
        (a.candidateId < b.candidateId ? -1 : a.candidateId > b.candidateId ? 1 : 0),
    )
    .map((s) => s.candidateId);
}

export function buildSemanticDocument(
  searchId: string,
  specHash: Sha256,
  reportHash: Sha256,
  argv: readonly string[],
  terms: SemanticTermsV1,
  scores: readonly SemanticScoreEntryV1[],
): SearchSemanticV1 {
  return {
    schema: SEMANTIC_SCHEMA,
    searchId,
    specHash,
    reportHash,
    scorer: { argv },
    terms,
    scores,
    ranked: rankedOrder(scores),
  };
}
