import { FAMILY_QUALITY_SCHEMA, DEFAULT_FAMILY_QUALITY_POLICY } from '../analysis/family';
import { STATE_DESCRIPTORS } from '../analysis/familyStates';
import { TIMBRE_MAX_SHIFT_OCTAVES, TIMBRE_METHOD } from '../analysis/timbre';
import { BANK_CHOICE_METHOD, BANK_LOOKUP_CONTRACT, SOUND_FAMILY_BANK_SCHEMA } from '../family/bank';
import {
  FAMILY_VARIATION_POLICY,
  MAX_VARIANTS,
  MIN_VARIANTS,
  ROLE_AXES,
  SOUND_FAMILY_SCHEMA,
  STATE_AXES,
} from '../family/program';
import {
  DEFAULT_FAMILIES_ROOT,
  FAMILY_STATUS_SCHEMA,
  PUBLICATION_ANALYSIS_PASSES,
  PUBLICATION_RENDER_PASSES,
} from './family';

/** `context` çıktısının aile bölümü — şema, genel rol sözlüğü, kurallar, komutlar. */
export function familyContext(cli: string) {
  return {
    schemas: {
      family: SOUND_FAMILY_SCHEMA,
      quality: FAMILY_QUALITY_SCHEMA,
      bank: SOUND_FAMILY_BANK_SCHEMA,
      status: FAMILY_STATUS_SCHEMA,
    },
    root: DEFAULT_FAMILIES_ROOT,
    variationPolicy: FAMILY_VARIATION_POLICY,
    variants: { min: MIN_VARIANTS, max: MAX_VARIANTS },
    roleAxes: ROLE_AXES,
    states: {
      axes: STATE_AXES,
      rule: 'durum eksenleri SIRALI ve geneldir; domain nesnesini (silah şarjı, motor devri, yaralı yaratık, kritik uyarı) eksen değerine tüketici eşler',
      brief: 'durum eksenli varyantın brief’i (ve manifest’i) yapılandırılmış `state` taşır',
      claims: {
        field: 'quality.states: [{ axis, descriptor, direction: 1 | -1 }]',
        descriptors: STATE_DESCRIPTORS,
        rule: 'yalnız o eksende farklı, diğer rolleri aynı çiftlerde KESİN yön; sınanabilir çifti olmayan iddia geçmez',
      },
      identity: {
        field: 'quality.identity: { maxTimbreDistance }',
        method: TIMBRE_METHOD,
        rule: `her üye medoide eşik içinde; zarf 1/6 oktav, seviye çıkarılır, ±${TIMBRE_MAX_SHIFT_OCTAVES} oktav kaydırmanın en iyisi`,
      },
    },
    dimensions:
      'search ile aynı boyut sözlüğü (archetype-param | control | node-param) + scope: all | role; rol, boyutun alt aralığını/seçenek alt kümesini seçer',
    substream: 'family:<familyId>/variant:<key>/<boyut> — dizi sırası rastgeleliği belirlemez',
    identity: {
      key: 'yazarın verdiği kararlı ad (varyant işinin kimliği ve asset adı)',
      variantId: 'v-<16 hex> = aile kimliği + anahtar + roller + politika + tohum + program özeti',
      pcmHash: 'ses kimliği; manifest ve bank taşır',
    },
    quality: {
      defaultPolicy: DEFAULT_FAMILY_QUALITY_POLICY,
      rule: 'duplicate PCM her zaman düşer; politika near-identical/outlier için fail|report seçer; oran sınırları beyan edilirse sınanır',
    },
    publication: {
      rule: 'Her varyant kendi job’undan kanonik publish kapısıyla geçer; bank en son, bütün varyantlar doğrulandıktan sonra yazılır.',
      preflight: `bütçe yayın için ${PUBLICATION_RENDER_PASSES} render + ${PUBLICATION_ANALYSIS_PASSES} analiz geçişi sayar; kodlama (FFmpeg) modellenmez`,
      resume: 'yarım yayın bank’sızdır; aynı komut yayımlanmış varyantları atlayıp sürer',
    },
    bank: {
      lookupContract: BANK_LOOKUP_CONTRACT,
      choice: BANK_CHOICE_METHOD,
      rule: 'tam anahtar | rol+etiket süzme (anahtara göre sıralı) | FNV-1a 32(token UTF-8) mod n — tüketici audio-synth kodunu çalıştırmaz',
    },
    commands: {
      plan: `${cli} family plan --file <family.json>`,
      check: `${cli} family check --file <family.json> [--json] [--draft]`,
      publish: `${cli} family publish --file <family.json> | <familyId>`,
      status: `${cli} family status <familyId>`,
      verify: `${cli} family verify <familyId>  (verify --all bütün bank'ları da doğrular)`,
      list: `${cli} family list`,
    },
  };
}
