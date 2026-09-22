import type { AssetClass } from '../analysis/assetQa';
import { AudioParamError } from '../guard/errors';
import { checkArray, checkChoice, checkNumber, checkObject, type ParamObject } from '../guard/read';

export const AUDIO_BRIEF_SCHEMA = 'AudioBriefV1';

/**
 * Brief zarfı: ortak kimlik/niyet/provenance + tek discriminated union.
 * `kind: 'acoustic'` bu sürümde tanımlıdır. `kind: 'music'` şemada YER
 * TUTAR ama alan kümesi TANIMLAMAZ — müzik alanları (rol, BPM, ölçü, tonal
 * dil) yalnız Dalga 6'nın `MusicBriefV1` sözleşmesinde yaşar; o gelene dek
 * müzik brief'i `unsupported` ile reddedilir. Böylece aynı müzik isteğinin
 * iki geçerli şeması oluşamaz.
 */
export type AcousticSubtype = 'sfx' | 'organic' | 'ambience';

export interface BriefProvenanceV1 {
  readonly author: 'agent' | 'human';
  /** Serbest araç/kişi etiketi; kimlik doğrulaması değildir. */
  readonly by?: string;
}

interface BriefEnvelopeV1 {
  readonly schema: typeof AUDIO_BRIEF_SCHEMA;
  readonly id: string;
  readonly title: string;
  /** Doğal dil niyet — korunur ama programın makine-okunur kaynağı DEĞİLDİR. */
  readonly intent: string;
  readonly provenance: BriefProvenanceV1;
}

export interface AcousticBriefV1 extends BriefEnvelopeV1 {
  readonly kind: 'acoustic';
  readonly subtype: AcousticSubtype;
  readonly assetClass: Exclude<AssetClass, 'music'>;
  readonly durationSeconds: { readonly min: number; readonly max: number };
  readonly channels: 1 | 2;
  /** Serbest betimleyici etiketler (ör. `wet`, `short-tail`); DSP'ye çevrilmez. */
  readonly descriptors?: readonly string[];
  readonly loop?: boolean;
}

export type AudioBriefV1 = AcousticBriefV1;
export type AudioBriefKind = 'acoustic' | 'music';

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

function checkText(value: unknown, path: string, max: number): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > max) {
    throw new AudioParamError(path, 'type', `boş olmayan, en çok ${max} karakterlik metin`, value);
  }
  return value;
}

function checkProvenance(value: unknown): BriefProvenanceV1 {
  const o = checkObject(value, 'provenance', ['author', 'by']);
  const author = checkChoice(o.author, 'provenance.author', ['agent', 'human'] as const);
  return o.by === undefined ? { author } : { author, by: checkText(o.by, 'provenance.by', 200) };
}

function checkAcoustic(o: ParamObject, envelope: BriefEnvelopeV1): AcousticBriefV1 {
  const subtype = checkChoice(o.subtype, 'subtype', ['sfx', 'organic', 'ambience'] as const);
  const assetClass = checkChoice(o.assetClass, 'assetClass', ['ui', 'sfx', 'ambience'] as const);
  const range = checkObject(o.durationSeconds, 'durationSeconds', ['min', 'max']);
  const min = checkNumber(range.min, 'durationSeconds.min', { above: 0, max: 600 });
  const max = checkNumber(range.max, 'durationSeconds.max', { min, max: 600 });
  if (o.channels !== 1 && o.channels !== 2) {
    throw new AudioParamError('channels', 'type', '1 ya da 2 olmalı', o.channels);
  }
  const descriptors =
    o.descriptors === undefined
      ? undefined
      : checkArray(o.descriptors, 'descriptors').map((d, i) =>
          checkText(d, `descriptors[${i}]`, 40),
        );
  if (o.loop !== undefined && typeof o.loop !== 'boolean') {
    throw new AudioParamError('loop', 'type', 'boolean olmalı', o.loop);
  }
  return {
    ...envelope,
    kind: 'acoustic',
    subtype,
    assetClass,
    durationSeconds: { min, max },
    channels: o.channels,
    ...(descriptors ? { descriptors } : {}),
    ...(o.loop === undefined ? {} : { loop: o.loop }),
  };
}

const ENVELOPE_KEYS = ['schema', 'kind', 'id', 'title', 'intent', 'provenance'] as const;
const ACOUSTIC_KEYS = [
  'subtype',
  'assetClass',
  'durationSeconds',
  'channels',
  'descriptors',
  'loop',
];

/** Brief'i doğrular; bilinmeyen `kind`/alan render'dan ÖNCE adlı hata verir. */
export function validateBrief(value: unknown): AudioBriefV1 {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new AudioParamError('brief', 'type', 'nesne olmalı', value);
  }
  const raw = value as ParamObject;
  if (raw.schema !== AUDIO_BRIEF_SCHEMA) {
    throw new AudioParamError('schema', 'type', `"${AUDIO_BRIEF_SCHEMA}" olmalı`, raw.schema);
  }
  const kind = checkChoice(raw.kind, 'kind', ['acoustic', 'music'] as const);
  if (kind === 'music') {
    throw new AudioParamError(
      'kind',
      'unsupported',
      "müzik brief'i Dalga 6 `MusicBriefV1` sözleşmesine aittir; bu sürümde tanımlı değil",
      kind,
    );
  }
  const o = checkObject(value, '', [...ENVELOPE_KEYS, ...ACOUSTIC_KEYS]);
  if (typeof o.id !== 'string' || !ID.test(o.id)) {
    throw new AudioParamError('id', 'type', `${ID.source} kalıbına uymalı`, o.id);
  }
  const envelope: BriefEnvelopeV1 = {
    schema: AUDIO_BRIEF_SCHEMA,
    id: o.id,
    title: checkText(o.title, 'title', 120),
    intent: checkText(o.intent, 'intent', 4000),
    provenance: checkProvenance(o.provenance),
  };
  return checkAcoustic(o, envelope);
}
