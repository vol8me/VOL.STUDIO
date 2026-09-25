import { LAYOUT_POLICY } from '../analysis/layout';
import { TREATMENT_CUES_METHOD } from '../analysis/treatmentCues';
import { TREATMENT_LIMITS } from '../program/treatment';
import { TREATMENT_PROFILE_SCHEME, TREATMENT_PROFILES } from '../program/treatmentProfiles';
import { DERIVATION_SCHEME, TREATMENT_CEILING_DBTP } from './derivation';
import { ENCODE_BASELINE_FILE, ENCODE_POLICY } from './encodeProfiles';

/**
 * `context` çıktısının teslim bölümü (Dalga 12): kanal/yerleşim politikası,
 * sınıf bazlı kodlama profili ve teslim (işleme) profilleri. Hepsi çalışan
 * koddaki veriden türetilir.
 */
export function deliveryContext(cli: string) {
  return {
    layout: {
      policy: LAYOUT_POLICY,
      briefField: 'placement: positional | screen | bed (yazılmazsa sınıf varsayılanı)',
      rules: [
        'Kanal sayısı yerleşimin izin verdiği sayılardan biri olmalı; yanlış sayı brief doğrulamasında düşer.',
        'Stereo kodek sonrası mono katlamaya dayanmalı; mono’ya izin verilen yerde özdeş kanallar (dual-mono) ihlaldir.',
        'Manifest `layout` bloğu yerleşimi ve stereo görüntüyü kaydeder; verify yeniden sınar.',
      ],
    },
    encoding: {
      policy: ENCODE_POLICY,
      baseline: ENCODE_BASELINE_FILE,
      rules: [
        'Vorbis kalitesi asset sınıfından gelir; tablo kilidin ölçtüğü politikayla aynı olmalı.',
        'Ölçüm kaliteyi yükseltebilir; daha önce yayımlanmış kalitenin (minQuality) altına inmek dinleme kararı ister.',
        'verify kayıtlı kaliteyle yeniden kodlar; profil değiştiyse bilgi olarak yeniden publish önerir.',
      ],
      commands: { baseline: `pnpm --filter @volstudio/audio-synth audio:encode-baseline` },
    },
    treatments: {
      scheme: TREATMENT_PROFILE_SCHEME,
      derivation: DERIVATION_SCHEME,
      cues: TREATMENT_CUES_METHOD,
      ceilingDbtp: TREATMENT_CEILING_DBTP,
      limits: TREATMENT_LIMITS,
      profiles: TREATMENT_PROFILES.map((p) => ({
        id: p.id,
        version: p.version,
        kind: p.kind,
        description: p.description,
        image: p.image,
        levelLu: p.levelLu,
        tailSeconds: p.tailSeconds,
        model: p.model,
      })),
      rules: [
        'program.treatment master ve loop katlamasından SONRA uygulanır; çıkarılınca kalan belge kaynağın kendisidir.',
        'Seviye kaynağa göreli (levelLu, en yüksek momentary); mesafe zayıflaması (1/r) çalışma zamanınındır, model.inverseSquareDb bildirir.',
        'Loop kaynağı dairesel işlenir (iki tur, ikinci tur); kuyruk payı almaz.',
        'Türetilmiş manifest kaynağın program/PCM özetini ve profil kimliğini taşır; verify bağı kaynak ve katalogla sınar.',
      ],
      commands: {
        derive: `${cli} derive <jobId> --from <kaynak manifest> --profile <profil> --asset <paket-göreli .ogg>`,
      },
    },
  };
}
