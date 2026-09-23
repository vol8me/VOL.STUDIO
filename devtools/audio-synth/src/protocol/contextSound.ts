import { SEAM_LIMITS, SEAM_METHOD } from '../analysis/seam';
import { describeMaterials } from '../program/materials';
import { capabilityMatrix } from '../program/ontology';
import { PROGRAM_PLAN_SCHEMA } from '../program/planner';
import { LAYER_ROLES } from '../program/roles';
import { ROUTING_LIMITS } from '../program/routing';
import { SAMPLE_BANK_SCHEMA } from '../program/sampleBank';
import { SOUND_GRAPH_SCHEMA } from '../program/soundGraph';
import { NEUTRAL_STYLE, STYLE_PROFILES } from '../program/styles';
import { DEFAULT_SAMPLES_ROOT, SAMPLE_ASSET_SCHEMA, SAMPLE_CACHE_ROOT } from './samples';

/**
 * `context` çıktısının ses tasarımı bölümü (Dalga 7–10): SoundGraph kuralları,
 * mekanizma kabiliyet matrisi, stil ve materyal verisi, planlayıcı ve sample
 * kütüphanesi. Hepsi çalışan koddaki veriden türetilir.
 */
export function soundDesignContext(cli: string) {
  return {
    graph: {
      schema: SOUND_GRAPH_SCHEMA,
      roles: LAYER_ROLES,
      limits: ROUTING_LIMITS,
      rules: [
        'Katman → (bus) → master; `sends` post-fader, yalnız tanımlı bus’lara; `master` ayrılmış addır.',
        'Zamana yayılan efekt (routing.timeBased) katman insert’ine giremez; kuyruk send/return bus’ında paylaşılır.',
        'Çıkış, send ve sidechain kenarları döngü kuramaz; bus işlem sırası topolojik, eşitlikte ada göre.',
        'Girdisi olmayan bus, kullanılmayan sample/banka ve rolü ontolojide olmayan mekanizma reddedilir.',
        'Bus’suz program geçmişle bit-eşit render edilir (PROGRAM_RENDERER_VERSION değişmedi).',
      ],
      master: {
        limiter:
          'master.limiter { ceilingDbtp, lookaheadSeconds?, releaseSeconds? } — teslim güvenliği, effect.limiter’dan ayrı',
        loop: `master.loop { crossfadeSeconds } — çıktı süresi durationSeconds − crossfade; ${SEAM_METHOD} sınırları ${JSON.stringify(
          SEAM_LIMITS,
        )}`,
      },
    },
    ontology: capabilityMatrix(),
    styles: {
      neutral: NEUTRAL_STYLE,
      profiles: STYLE_PROFILES,
      rule: 'style: { profile, version } | { controls } — özel stilin ad alanı yoktur; adlandırılmış referans niteliklerine çözülür.',
    },
    materials: describeMaterials(),
    planner: {
      schema: PROGRAM_PLAN_SCHEMA,
      briefFields:
        'mechanisms (ontoloji kimlikleri), style (profil), material (materyal) — hepsi isteğe bağlı',
      rule: 'Mekanizmalar beyan + terim sözlüğünden deterministik; unsupported uydurulmaz, raporlanır.',
      commands: {
        plan: `${cli} plan <jobId> [--skeleton <çıktı.json>] | plan --brief <brief.json>`,
        context: `${cli} context --brief <brief.json>  (context + o brief’in planı)`,
        graph: `${cli} graph --file <program.json>  (SoundGraphV1 + topoloji özeti)`,
      },
    },
    samples: {
      schema: SAMPLE_ASSET_SCHEMA,
      bankSchema: SAMPLE_BANK_SCHEMA,
      root: DEFAULT_SAMPLES_ROOT,
      cacheRoot: SAMPLE_CACHE_ROOT,
      rules: [
        'Program sample’ı içerik özetiyle bildirir (samples: { ad: { id, hash, sampleRate, channels, frames } }).',
        'recorded: WAV kütüphanede commit edilir (lisans + kaynak zorunlu); synthetic-fixture: üretici program gömülü, WAV git-dışı önbelleğe üretilir.',
        'Özet uyuşmazlığı `identity` hatasıdır; manifest `sources` bloğu kayıt ve sampler seçim gerekçesini taşır.',
      ],
      commands: {
        list: `${cli} samples list`,
        verify: `${cli} samples verify  (verify --all da doğrular)`,
        decl: `${cli} samples decl <id>  (programa yazılacak bildirim)`,
      },
    },
  };
}
