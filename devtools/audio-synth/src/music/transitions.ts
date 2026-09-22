import { MUSIC_RUNTIME_CAPABILITIES } from '@volstudio/core/audio/music';
import { AudioParamError } from '../guard/errors';
import { checkChoice, checkNumber, checkObject } from '../guard/read';
import { checkPattern, MUSIC_ID, MUSIC_KEY } from './terms';

/**
 * Geçiş sözleşmesi çalışma zamanının GERÇEK kabiliyetine bakar. Motor bugün
 * yalnız bar hizalı crossfade, sönümlü durdurma ve playlist boşluğu yapar;
 * stinger ve bölüm atlama YOKTUR. Bunları "sonra bakarız" diye şemada
 * tutmak, çalmayan bir geçişi yayımlamak demektir — istek adıyla reddedilir.
 */
export const TRANSITION_KINDS = [
  'crossfade',
  'fade-stop',
  'playlist-gap',
  'stinger',
  'section-jump',
] as const;
export type TransitionKind = (typeof TRANSITION_KINDS)[number];

export const TEMPO_RELATIONS = ['same', 'different'] as const;
export const TONAL_RELATIONS = ['same', 'relative', 'neighbor', 'free'] as const;

export interface MusicTransitionV1 {
  readonly id: string;
  readonly kind: TransitionKind;
  readonly seconds: number;
  /** `crossfade` için kaç bar sonra başlayacağı; 0 = hemen. */
  readonly bars?: number;
  readonly to?: string;
  readonly tempoRelation?: (typeof TEMPO_RELATIONS)[number];
  readonly tonalRelation?: (typeof TONAL_RELATIONS)[number];
}

const SUPPORTED = MUSIC_RUNTIME_CAPABILITIES.transitions as readonly string[];

export function isSupportedKind(kind: TransitionKind): boolean {
  return SUPPORTED.includes(kind);
}

export function validateTransition(value: unknown, path: string): MusicTransitionV1 {
  const o = checkObject(value, path, [
    'id',
    'kind',
    'seconds',
    'bars',
    'to',
    'tempoRelation',
    'tonalRelation',
  ]);
  const kind = checkChoice(o.kind, `${path}.kind`, TRANSITION_KINDS);
  if (!isSupportedKind(kind)) {
    throw new AudioParamError(
      `${path}.kind`,
      'unsupported',
      `unsupported-by-runtime: motor yalnız ${SUPPORTED.join(', ')} yapar`,
      kind,
    );
  }
  const transition: MusicTransitionV1 = {
    id: checkPattern(o.id, `${path}.id`, MUSIC_KEY),
    kind,
    seconds: checkNumber(o.seconds, `${path}.seconds`, { min: 0, max: 30 }),
    ...(o.bars === undefined
      ? {}
      : { bars: checkNumber(o.bars, `${path}.bars`, { min: 0, max: 64, integer: true }) }),
    ...(o.to === undefined ? {} : { to: checkPattern(o.to, `${path}.to`, MUSIC_ID) }),
    ...(o.tempoRelation === undefined
      ? {}
      : { tempoRelation: checkChoice(o.tempoRelation, `${path}.tempoRelation`, TEMPO_RELATIONS) }),
    ...(o.tonalRelation === undefined
      ? {}
      : { tonalRelation: checkChoice(o.tonalRelation, `${path}.tonalRelation`, TONAL_RELATIONS) }),
  };
  assertRuntimeShape(transition, path);
  return transition;
}

/**
 * Bar hizası yalnız ÇALAN parçanın ızgarasında hesaplanır: hedefin temposu
 * farklıysa "bar sınırında geç" ifadesi hedef için anlamsızdır ve motor onu
 * sessizce kaynağın ızgarasına göre yapar.
 */
function assertRuntimeShape(transition: MusicTransitionV1, path: string): void {
  if (transition.kind !== 'crossfade' && transition.bars !== undefined) {
    throw new AudioParamError(
      `${path}.bars`,
      'combination',
      'bar hizası yalnız crossfade içindir',
      transition.kind,
    );
  }
  if (transition.kind === 'crossfade' && transition.to === undefined) {
    throw new AudioParamError(`${path}.to`, 'required', 'crossfade hedef parça ister', undefined);
  }
  if (transition.tempoRelation === 'different' && (transition.bars ?? 0) > 0) {
    throw new AudioParamError(
      `${path}.bars`,
      'combination',
      `unsupported-by-runtime: farklı tempoda bar hizası yok (barAlignment: ${MUSIC_RUNTIME_CAPABILITIES.barAlignment})`,
      transition.bars,
    );
  }
}

export interface TransitionFindingV1 {
  readonly id: string;
  readonly kind: TransitionKind;
  readonly enforcedByRuntime: boolean;
  readonly detail: string;
}

/**
 * Beyanların hangilerini motorun GERÇEKTEN uyguladığını söyler. Tonal
 * ilişki beyanı belgelenir ama motor onu bilmez; rapor bunu saklamaz.
 */
export function describeTransitions(
  transitions: readonly MusicTransitionV1[],
): TransitionFindingV1[] {
  return transitions.map((transition) => {
    const tonalDeclared =
      transition.tonalRelation !== undefined && transition.tonalRelation !== 'free';
    return {
      id: transition.id,
      kind: transition.kind,
      enforcedByRuntime: !tonalDeclared,
      detail: tonalDeclared
        ? `tonal ilişki "${transition.tonalRelation}" beyan edildi; motor ton bilmez (keyAwareTransitions: false)`
        : `${transition.kind}: ${transition.seconds} sn${
            transition.bars ? `, ${transition.bars} bar hizalı` : ''
          }`,
    };
  });
}
