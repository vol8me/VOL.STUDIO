import { CHECK_KINDS, CHECKS_VERSION, DESCRIPTORS } from '../analysis/checks';
import { ONSET_METHOD, PITCH_METHOD, PULSE_METHOD } from '../analysis/descriptors';
import {
  DEFAULT_BATCH_BUDGET,
  SECONDS_PER_WORK_UNIT,
  ANALYSIS_WORK_PER_SAMPLE,
} from '../guard/batch';
import { PROGRAM_REGISTRY } from '../program/catalog';
import { MAX_DIMENSIONS, MAX_OPTIONS } from '../program/dimensions';
import { POLYBLEP_RISK_HZ } from '../program/limitations';
import { SEARCH_REPORT_SCHEMA } from '../search/report';
import { SEARCH_SELECTION_SCHEMA } from '../search/selection';
import { MAX_CANDIDATES, SEARCH_SPEC_SCHEMA } from '../search/spec';
import { SEARCH_STRATEGIES } from '../search/strategy';
import { PROGRAM_ORIGIN_SCHEMA } from './origin';
import { DEFAULT_SEARCHES_ROOT, SEARCH_AUDITION_ROOT, SEARCH_STATUS_SCHEMA } from './search';

/**
 * `context` çıktısının arama bölümü — hepsi çalışan koddan türer. Aranabilir
 * archetype parametreleri ve makrolar registry'den listelenir; düğüm
 * parametreleri kuralla tarif edilir (her registry parametresi, gesture'a
 * bağlı olmadıkça), çünkü hangi düğümün var olduğu programa bağlıdır.
 */
export function searchContext(cli: string) {
  const entries = PROGRAM_REGISTRY.entries();
  const archetypes = entries
    .filter((e) => e.kind === 'archetype')
    .map((e) => ({
      id: e.id,
      version: e.version,
      params: Object.fromEntries(
        Object.entries(e.params).map(([name, spec]) => [
          name,
          spec.type === 'number'
            ? { unit: spec.unit, min: spec.min, max: spec.max }
            : spec.type === 'choice'
            ? { choices: spec.choices }
            : { sample: true },
        ]),
      ),
      ownedMacros: e.kind === 'archetype' ? e.macros : [],
    }));
  return {
    schemas: {
      spec: SEARCH_SPEC_SCHEMA,
      report: SEARCH_REPORT_SCHEMA,
      selection: SEARCH_SELECTION_SCHEMA,
      status: SEARCH_STATUS_SCHEMA,
      origin: PROGRAM_ORIGIN_SCHEMA,
    },
    root: DEFAULT_SEARCHES_ROOT,
    auditionRoot: SEARCH_AUDITION_ROOT,
    strategies: Object.entries(SEARCH_STRATEGIES).map(([id, s]) => ({
      id,
      version: s.version,
      maxDimensions: s.maxDimensions,
      properties: [
        'deterministik: aynı tohum + boyut adları → aynı noktalar',
        'önek kararlı: k. aday aday sayısından bağımsız',
        'boyut dizisi sırası ve JSON anahtar sırası sonucu değiştirmez (ad sırası kanoniktir)',
        'optimizasyon/estetik puan yok: strateji sonucu okumaz',
      ],
    })),
    limits: { candidates: MAX_CANDIDATES, dimensions: MAX_DIMENSIONS, options: MAX_OPTIONS },
    dimensions: {
      shape:
        '{ name, target, range: { min, max, scale: linear|log, unit } } | { name, target, options: [...] }',
      targets: {
        'archetype-param': { shape: '{ kind, param }', searchable: archetypes },
        control: {
          shape: '{ kind, control }',
          controls: entries.filter((e) => e.kind === 'control').map((e) => e.id),
          rule: "archetype tabanında archetype'ın sahip olduğu makro aranamaz (archetype-param ile aranır); programda hedefi olmayan makro spec aşamasında reddedilir",
        },
        'node-param': {
          shape:
            '{ kind, layer?, slot: source|articulation|resonator|effect, index?, primitive, param }',
          rule: 'adreslenen düğümün her registry parametresi (sayı: range/options, seçenek: options); primitive kimliği eşleşmeli; gesture/modülasyona bağlı değer aranamaz',
        },
      },
      order: 'archetype genişletmesi → makrolar → düğüm parametreleri',
      unit: 'range.unit registry birimiyle aynı olmalı; aralık registry sınırları içinde olmalı',
    },
    constraints:
      "{ kind: 'exclude', when: [{ dimension, min?, max?, equals? }], reason } — bütün koşullar tutarsa aday render'dan ÖNCE geçersiz",
    filters: {
      checksVersion: CHECKS_VERSION,
      kinds: CHECK_KINDS,
      descriptors: Object.keys(DESCRIPTORS),
      methods: { pitch: PITCH_METHOD, onsets: ONSET_METHOD, pulse: PULSE_METHOD },
      note: 'Filtreler mekaniktir; estetik ya da "organik" puanı yoktur. spectralPeakHz perde değildir; perde YIN ile güvenilirse ölçülür, değilse null.',
    },
    budget: {
      default: DEFAULT_BATCH_BUDGET,
      secondsPerWorkUnit: SECONDS_PER_WORK_UNIT,
      analysisWorkPerSample: ANALYSIS_WORK_PER_SAMPLE,
      rule: "Plan/ön-denetim bütün adayların maliyetini render'dan ÖNCE toplar; aşım BatchBudgetError (items|memory|work|time) ile reddedilir ve hiçbir dosya yazılmaz. Süre tahminidir, duvar saati değildir.",
    },
    states: {
      mechanical: ['invalid', 'filtered', 'error', 'passed'],
      decision: ['pending', 'approved', 'rejected'],
      rejectionStages: [
        'constraint',
        'materialize',
        'render-budget',
        'duplicate',
        'render',
        'analysis',
        'filter',
      ],
    },
    risks: {
      'polyblep-alias': `testere/kare osilatör > ${POLYBLEP_RISK_HZ} Hz (ya da sürülen frekans); aday işaretlenir, production-safe denmez`,
    },
    workflow: [
      'search plan',
      'search run',
      'search audition',
      'search decide',
      'promote',
      'render',
      'analyze',
      'select',
      'publish',
    ],
    commands: {
      plan: `${cli} search plan --file <spec.json>`,
      run: `${cli} search run --file <spec.json> [--audition]`,
      status: `${cli} search status <searchId> [--json]`,
      list: `${cli} search list`,
      verify: `${cli} search verify <searchId>  (verify --all bütün aramaları da doğrular)`,
      audition: `${cli} search audition <searchId> [--serve] [--port <n>]`,
      decide: `${cli} search decide <searchId> --candidate <c-…> --state approved|rejected|pending --by human|agent [--label a,b] [--note <metin>]`,
      promote: `${cli} promote <jobId> --search <searchId> --candidate <c-…>`,
    },
    rules: [
      'Adaylar production kaydı değildir; publish yalnız promote edilen job programından kanonik akışla yapılır.',
      'promote: aday passed + onaylı olmalı; spec yeniden planlanır ve PCM yeniden render edilir — tutmazsa stale.',
      'Onay/ret beyandır (by: human|agent); agent insan dinlemesi uyduramaz.',
      'Dinleme sunucusu yalnız 127.0.0.1/::1’e bağlanır ve yalnız selection.json yazar.',
    ],
  };
}
