import type { AssetClass } from './assetQa';
import { integratedLoudness, maxMomentaryLoudness } from './loudness';

/**
 * Kanal/yerleşim politikası. Bir asset'in kanal sayısı içeriğin değil
 * ÇALINIŞ BİÇİMİNİN kararıdır:
 *
 * - `positional`: dünya uzayında bir yayıcı; motor onu konumlandırır. Mono
 *   olmalı: stereo bir kaynak konumlandırıcıda ya aşağı katlanır ya da iki
 *   kanalın kendi yönü konumla çelişir.
 * - `screen`: konumsuz, ekran/arayüz düzleminde (UI, HUD, sinematik geçiş).
 *   Mono ya da stereo; stereo ancak iki kanal gerçekten farklıysa değer.
 * - `bed`: konumsuz, sürekli zemin (ambiyans yatağı, müzik).
 *
 * Mono'ya izin verilen yerde özdeş iki kanal (dual-mono) boşa bayttır ve
 * ihlaldir. Stereo her yerde mono katlamaya dayanmalıdır: telefon hoparlörü,
 * mono çıkış ya da motorun aşağı katlaması sesi söndürmemeli.
 */
export const PLACEMENTS = ['positional', 'screen', 'bed'] as const;
export type Placement = (typeof PLACEMENTS)[number];
export type ChannelCount = 1 | 2;

export interface ClassLayoutPolicy {
  readonly defaultPlacement: Placement;
  readonly placements: Readonly<Partial<Record<Placement, readonly ChannelCount[]>>>;
}

export const LAYOUT_POLICY = {
  scheme: 'channel-layout-v1',
  classes: {
    ui: { defaultPlacement: 'screen', placements: { screen: [1, 2] } },
    sfx: { defaultPlacement: 'positional', placements: { positional: [1], screen: [1, 2] } },
    ambience: { defaultPlacement: 'bed', placements: { positional: [1], bed: [1, 2] } },
    music: { defaultPlacement: 'bed', placements: { bed: [2] } },
    'music-stem': { defaultPlacement: 'bed', placements: { bed: [2] } },
  } satisfies Record<AssetClass, ClassLayoutPolicy>,
  stereo: {
    /**
     * Mono katlamada kaybedilen yükseklik tavanı (LU). Tam ilintili stereo
     * 0, ilintisiz eşit kanallar ≈3, sert panlı mono kaynak 3; ters fazlı
     * içerik bunun üstüne çıkar: 4 LU eşit seviyede ≈ −0.2 ilintidir.
     * Referans stereo asset'ler kodek sonrası 0.004–1.40 LU ölçüldü
     * (DESIGN "Kanal ve yerleşim").
     */
    maxMonoFoldLossDb: 4,
    /** Yan (L−R) enerjisi orta (L+R) enerjisinin bu kadar altındaysa kanallar özdeştir. */
    dualMonoSideDb: -50,
  },
} as const;

export function layoutPolicyOf(assetClass: AssetClass): ClassLayoutPolicy {
  return LAYOUT_POLICY.classes[assetClass];
}

/** Sınıfın izin verdiği yerleşim; yazılmamışsa sınıfın varsayılanı. */
export function placementOf(assetClass: AssetClass, declared: Placement | undefined): Placement {
  return declared ?? layoutPolicyOf(assetClass).defaultPlacement;
}

/** Yerleşim sınıfa uymuyor ya da kanal sayısı yerleşime uymuyorsa sorun metni. */
export function layoutProblem(
  assetClass: AssetClass,
  placement: Placement,
  channels: number,
): string | null {
  const allowed = layoutPolicyOf(assetClass).placements[placement];
  if (!allowed) {
    const options = Object.keys(layoutPolicyOf(assetClass).placements).join(', ');
    return `${assetClass} sınıfı ${placement} yerleşimi almaz (${options})`;
  }
  if (!allowed.includes(channels as ChannelCount)) {
    return `${assetClass}/${placement} ${allowed.join(' ya da ')} kanal ister, ${channels} verildi`;
  }
  return null;
}

export interface StereoImageV1 {
  readonly method: 'stereo-image-v1';
  /** Enerji ağırlıklı L/R ilintisi (−1…1). */
  readonly correlation: number | null;
  /** Yan/orta enerji oranı (dB); özdeş kanalda −∞ yerine `null`. */
  readonly sideDb: number | null;
  /** Mono katlama kaybı (LU): stereo yükseklik − (L+R)/2 çift-mono yüksekliği. */
  readonly monoFoldLossDb: number | null;
  readonly dualMono: boolean;
}

const round = (x: number) => Number(x.toFixed(3));

/** Uzun sinyalde integrated, 400 ms'den kısada en yüksek momentary. */
function loudnessOf(channels: readonly Float32Array[], sampleRate: number): number {
  const integrated = integratedLoudness(channels, sampleRate);
  return Number.isFinite(integrated) ? integrated : maxMomentaryLoudness(channels, sampleRate);
}

/** İki kanallı sinyalin mono uyumu; tek kanalda `null` döner. */
export function measureStereoImage(
  channels: readonly Float32Array[],
  sampleRate: number,
): StereoImageV1 | null {
  if (channels.length !== 2) return null;
  const [left, right] = channels;
  let ll = 0;
  let rr = 0;
  let lr = 0;
  const fold = new Float32Array(left.length);
  for (let i = 0; i < left.length; i++) {
    ll += left[i] * left[i];
    rr += right[i] * right[i];
    lr += left[i] * right[i];
    fold[i] = (left[i] + right[i]) / 2;
  }
  const mid = (ll + rr + 2 * lr) / 4;
  const side = (ll + rr - 2 * lr) / 4;
  const sideDb = mid > 0 && side > 0 ? 10 * Math.log10(side / mid) : null;
  const stereo = loudnessOf(channels, sampleRate);
  const folded = loudnessOf([fold, fold], sampleRate);
  const loss = Number.isFinite(stereo) ? stereo - folded : null;
  return {
    method: 'stereo-image-v1',
    correlation: ll > 0 && rr > 0 ? round(lr / Math.sqrt(ll * rr)) : null,
    sideDb: sideDb === null ? null : round(sideDb),
    monoFoldLossDb: loss === null ? null : Number.isFinite(loss) ? round(loss) : null,
    dualMono: mid > 0 && (side === 0 || (sideDb ?? 0) < LAYOUT_POLICY.stereo.dualMonoSideDb),
  };
}

/**
 * Kodek SONRASI yerleşim denetimi: kanal sayısı yerleşime uymalı, stereo
 * mono katlamaya dayanmalı, mono'ya izin verilen yerde dual-mono olmamalı.
 */
export function layoutViolations(
  assetClass: AssetClass,
  placement: Placement,
  channels: number,
  image: StereoImageV1 | null,
): string[] {
  const problem = layoutProblem(assetClass, placement, channels);
  if (problem) return [problem];
  if (!image) return [];
  const violations: string[] = [];
  const { maxMonoFoldLossDb } = LAYOUT_POLICY.stereo;
  if (image.monoFoldLossDb === null && !image.dualMono) {
    violations.push('mono katlamada sinyal yok oluyor (ters faz)');
  } else if (image.monoFoldLossDb !== null && image.monoFoldLossDb > maxMonoFoldLossDb) {
    violations.push(
      `mono katlama kaybı ${image.monoFoldLossDb.toFixed(2)} LU > ${maxMonoFoldLossDb} LU`,
    );
  }
  const monoAllowed = layoutPolicyOf(assetClass).placements[placement]?.includes(1) ?? false;
  if (image.dualMono && monoAllowed) {
    violations.push('iki kanal özdeş (dual-mono): mono yayımlanmalı');
  }
  return violations;
}
