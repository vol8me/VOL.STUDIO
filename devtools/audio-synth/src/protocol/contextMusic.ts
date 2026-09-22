import {
  MUSIC_RUNTIME_CAPABILITIES,
  MUSIC_ASSET_SPEC_SCHEMA,
  MASTERING_PATHS,
} from '@volstudio/core/audio/music';
import { MUSIC_SYMBOLIC_SCHEMA } from '../music/analyze';
import { MUSIC_ADAPTIVE_QA_SCHEMA, STEM_PARITY_FLOOR_DBFS } from '../music/bundle';
import { instrumentIds } from '../music/instruments';
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
      count: instrumentIds().length,
      idFormat: 'preset:<ad>',
      profile: 'aralık ve rol katalogdan; zarf ve spektral doluluk ölçülür',
    },
    mastering: {
      paths: MASTERING_PATHS,
      rule: 'yol çalma modelinden türetilir; belge başka bir yol beyan ederse program reddedilir',
      stemSafe: `stem yolunda sınırlayıcı yok; stem toplamı referans mix'ten en çok ${STEM_PARITY_FLOOR_DBFS} dBFS sapabilir`,
    },
    runtime: {
      capabilities: MUSIC_RUNTIME_CAPABILITIES,
      rule: 'desteklenmeyen geçiş (stinger, bölüm atlama, farklı tempoda bar hizası) unsupported-by-runtime ile reddedilir',
      compressor: 'spec kompresörsüz ölçülür; motor assertEngineCompatible ile uyum ister',
    },
    policy: MUSIC_ANALYSIS_POLICY,
    publication: {
      assets:
        'adaptiveLoop her stem + referans mix yayımlar; loop ve tek seferlik cue yalnız ' +
        `"${REFERENCE_MIX_ID}" asset'ini yayımlar`,
      rule: 'her asset kanonik publish kapısından geçer; bundle en son yazılır',
      sync: 'kodlanmış her stem çözülüp kaynak PCM ile çapraz korelasyonla hizalanır (gecikme 0 şart)',
    },
    commands: {
      plan: `${cli} music plan <musicId>`,
      analyze: `${cli} music analyze <musicId> [--json]  (render yok)`,
      check: `${cli} music check <musicId> [--json]`,
      render: `${cli} music render <musicId>  (dinleme kopyası export/music altına)`,
      publish: `${cli} music publish <musicId>`,
      status: `${cli} music status <musicId>`,
      verify: `${cli} music verify <musicId>  (verify --all bütün bundle'ları da doğrular)`,
      list: `${cli} music list`,
      search: `${cli} music search plan|run|promote <musicId> [--candidate <id>]  (${MUSIC_SEARCH_FILE})`,
    },
  };
}
