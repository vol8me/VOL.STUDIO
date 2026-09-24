import {
  MUSIC_RUNTIME_CAPABILITIES,
  MUSIC_ASSET_SPEC_SCHEMA,
  MASTERING_PATHS,
} from '@volstudio/core/audio/music';
import { MUSIC_SYMBOLIC_SCHEMA } from '../music/analyze';
import { MUSIC_ADAPTIVE_QA_SCHEMA, STEM_PARITY_FLOOR_DBFS } from '../music/bundle';
import { ARTICULATION_GROUPS } from '../music/articulation';
import { INSTRUMENT_SOURCE_KINDS, SOURCE_ARTICULATIONS } from '../music/instrumentDefinition';
import { DEFAULT_VELOCITY } from '../music/instrumentResolve';
import { instrumentIds } from '../music/instruments';
import { ORCHESTRATION_ROLES, ROLE_BANDS } from '../music/orchestration';
import { SEGMENT_KINDS } from '../music/segments';
import { TUNING_KINDS } from '../music/tuning';
import { DRUM_MODELS } from '../instruments/percussion/drum';
import { RETRO_WAVEFORMS } from '../synthesis/retro';
import { MOTIF_TRANSFORMS } from '../music/motif';
import { MUSIC_ANALYSIS_POLICY } from '../music/policy';
import { MUSIC_PROGRAM_SCHEMA } from '../music/program';
import { MUSIC_SCORE_SCHEMA } from '../music/score';
import {
  MUSIC_SEARCH_REPORT_SCHEMA,
  MUSIC_SEARCH_SPEC_SCHEMA,
  MUSIC_TARGET_KINDS,
} from '../music/search';
import { MUSIC_STEM_PROGRAM_SCHEMA, REFERENCE_MIX_ID } from '../music/stem';
import { SECTION_ROLES, MUSIC_RULE_KINDS, PLAYBACK_MODES, MUSIC_USAGES } from '../music/terms';
import { THEME_BOOK_SCHEMA } from '../music/themeBook';
import { TRANSITION_KINDS } from '../music/transitions';
import {
  DEFAULT_MUSIC_ROOT,
  DEFAULT_THEMEBOOKS_ROOT,
  MUSIC_BUNDLE_SCHEMA,
  MUSIC_STATUS_SCHEMA,
} from './music';
import { MUSIC_SEARCH_FILE } from './musicSearch';

/** `context` çıktısının müzik bölümü — şemalar, sözlükler, kurallar, komutlar. */
export function musicContext(cli: string) {
  return {
    schemas: {
      brief: "AudioBriefV1 (kind: 'music')",
      themeBook: THEME_BOOK_SCHEMA,
      program: MUSIC_PROGRAM_SCHEMA,
      score: MUSIC_SCORE_SCHEMA,
      stemProgram: MUSIC_STEM_PROGRAM_SCHEMA,
      symbolicReport: MUSIC_SYMBOLIC_SCHEMA,
      adaptiveQa: MUSIC_ADAPTIVE_QA_SCHEMA,
      spec: MUSIC_ASSET_SPEC_SCHEMA,
      bundle: MUSIC_BUNDLE_SCHEMA,
      status: MUSIC_STATUS_SCHEMA,
      search: { spec: MUSIC_SEARCH_SPEC_SCHEMA, report: MUSIC_SEARCH_REPORT_SCHEMA },
    },
    roots: { music: DEFAULT_MUSIC_ROOT, themeBooks: DEFAULT_THEMEBOOKS_ROOT },
    vocabulary: {
      playback: PLAYBACK_MODES,
      usage: MUSIC_USAGES,
      sectionRoles: SECTION_ROLES,
      ruleKinds: MUSIC_RULE_KINDS,
      motifTransforms: MOTIF_TRANSFORMS,
      transitions: TRANSITION_KINDS,
      searchTargets: MUSIC_TARGET_KINDS,
    },
    instruments: {
      builtins: instrumentIds().length,
      idFormat: 'preset:<ad> (yerleşik) | inst:<kimlik> (programın instruments[] tanımı)',
      profile:
        'yerleşikte aralık ve rol katalogdan; nota tutma (vurgusal/sürekli) tipik sürede ölçülür',
      definition: {
        contract: [
          'role',
          'range (SESLENEN)',
          'preferred',
          'transposition',
          'polyphony',
          'velocity {rangeDb, brightness}',
          'release (sampler)',
          'articulations',
        ],
        sources: INSTRUMENT_SOURCE_KINDS,
        sourceArticulations: SOURCE_ARTICULATIONS,
        drumModels: DRUM_MODELS,
        drumMacros:
          'tune (yarım ton), decay, tone, attack, noise (payın çarpanı 0–2), drive, open (hat), level',
        retroWaveforms: [...RETRO_WAVEFORMS, 'table-custom'],
        rule: 'besteci kaynağı bilmez: aynı nota verisi preset, sampler, kit, retro ya da katmana gider',
      },
    },
    expression: {
      articulations: ARTICULATION_GROUPS,
      rule: 'nota her kümeden en çok birini taşır; enstrümanın desteklemediği artikülasyon reddedilir',
      velocity: `yazılmazsa seviye değişmez; yazılırsa rangeDb × (v − ${DEFAULT_VELOCITY})`,
    },
    orchestration: {
      roles: ORCHESTRATION_ROLES,
      bands: ROLE_BANDS,
      rule: 'palet görev → enstrüman eşler; transposition: "auto" yazılanı tercih edilen register’a oturtur; bantlar yönlendiricidir',
    },
    patterns: {
      cells: 'x vuruş · X accent · o ghost · . sus · _ uzat (boşluk ve | adım sayılmaz)',
      chain: 'chain[{pattern, variation?, repeat?}], loop, fill {pattern, every}, bar',
      probability: 'olay kimliğine bağlı alt akış; düşen vuruş diğer kimlikleri kaydırmaz',
    },
    segments: {
      kinds: SEGMENT_KINDS,
      rule: 'tam bir loop; giriş loop başında biter; cue’lar ortak kazancı paylaşır, stinger/geçiş gainDb farkı taşır',
      qa: 'stinger loop’un her hizalı noktasında, giriş loop’a devrederken birlikte ölçülür (−1 dBTP)',
    },
    tuning: {
      kinds: TUNING_KINDS,
      microtonal: 'nota adına cent sapması: A3+50c, Eb4-14c (±100)',
      rule: 'ayar yazılmazsa 12-TET (A4 440) bit-eşit',
    },
    mastering: {
      paths: MASTERING_PATHS,
      rule: 'yol çalma modelinden türetilir; belge başka bir yol beyan ederse program reddedilir',
      stemSafe: `stem yolunda sınırlayıcı yok; stem toplamı referans mix'ten en çok ${STEM_PARITY_FLOOR_DBFS} dBFS sapabilir`,
    },
    runtime: {
      capabilities: MUSIC_RUNTIME_CAPABILITIES,
      rule: 'desteklenmeyen geçiş (bölüm atlama, farklı tempoda bar hizası) unsupported-by-runtime ile reddedilir; stinger geçişi bir cue segmentine bağlanır',
      compressor: 'spec kompresörsüz ölçülür; motor assertEngineCompatible ile uyum ister',
    },
    policy: MUSIC_ANALYSIS_POLICY,
    publication: {
      assets:
        'adaptiveLoop her stem + referans mix yayımlar; loop ve tek seferlik cue yalnız ' +
        `"${REFERENCE_MIX_ID}" asset'ini yayımlar; segmentli programda her cue ayrıca kendi asset'idir`,
      rule: 'her asset kanonik publish kapısından geçer; bundle en son yazılır',
      sync: 'kodlanmış her stem çözülüp kaynak PCM ile çapraz korelasyonla hizalanır (gecikme 0 şart); döngüye giren asset’in dikişi sürekli olmalı',
    },
    commands: {
      plan: `${cli} music plan <musicId>`,
      analyze: `${cli} music analyze <musicId> [--json]  (render yok)`,
      check: `${cli} music check <musicId> [--json] [--draft]`,
      render: `${cli} music render <musicId> [--draft]  (dinleme kopyası export/music altına)`,
      publish: `${cli} music publish <musicId>`,
      status: `${cli} music status <musicId>`,
      verify: `${cli} music verify <musicId>  (verify --all bütün bundle'ları da doğrular)`,
      list: `${cli} music list`,
      search: `${cli} music search plan|run|promote <musicId> [--candidate <id>]  (${MUSIC_SEARCH_FILE})`,
    },
  };
}
