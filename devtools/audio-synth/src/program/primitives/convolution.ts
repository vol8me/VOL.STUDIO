import { convolutionWork, convolveChannels } from '../../effects/convolution';
import { AudioParamError } from '../../guard/errors';
import { resample } from '../../synthesis/sample';
import { choiceOf, numberOf } from '../params';
import type { EffectEntry } from '../registry';

/**
 * Offline konvolüsyon: oda IR'ı, materyal gövde tepkisi ya da özel ses
 * tasarımı IR'ı — hepsi sample kütüphanesinden içerik özetiyle gelir
 * (manifest IR'ın kimliğini ve özetini taşır). Zamana yayıldığı için katman
 * insert'ine giremez; bus/return'de kullanılır. Kuyruk program süresine
 * sığmalıdır (`tailSeconds` = IR süresi); sığmayan kuyruk kesilir. Maliyet
 * IR uzunluğundan hesaplanır ve render bütçesine tabidir.
 */
export const CONVOLUTION: EffectEntry = {
  id: 'effect.convolution',
  kind: 'effect',
  version: 1,
  timeBased: true,
  linear: true,
  description:
    'Bölümlü FFT konvolüsyon (UPOLS, blok 2048): mono/stereo IR yönlendirmesi (stereo×stereo ' +
    'kanal kanal, stereo×mono aynı IR, mono programda stereo IR ortalaması); IR program oranına ' +
    'Kaiser sinc ile getirilir. Kuyruk = IR süresi, program süresinde kesilir.',
  capabilities: ['space', 'convolution', 'tail', 'sampled'],
  params: {
    ir: { type: 'sample', description: 'Programın `samples` bildirimindeki IR adı.' },
    mix: {
      type: 'number',
      unit: 'normalized',
      min: 0,
      max: 1,
      default: 0.5,
      description: 'Islak oran (return bus’ında 1).',
    },
    gainDb: {
      type: 'number',
      unit: 'dB',
      min: -48,
      max: 12,
      default: -6,
      description: 'Islak yol kazancı.',
    },
  },
  causal: [
    { param: 'mix', dimension: 'wetness', direction: 1, note: 'Islak oran.' },
    { param: 'gainDb', dimension: 'loudness', direction: 1, note: 'Islak seviye.' },
  ],
  determinism: { stochastic: false, substreams: [] },
  resource: {
    model: 'O(kare·(log B + IR/B))',
    workPerFrame: (p) => convolutionWork(Number(p['ir.frames'] ?? 48000)),
    stateBytes: (p) => 32 * 2 * Number(p['ir.frames'] ?? 48000),
    bytesPerFrame: () => 8,
  },
  process(channels, params, ctx) {
    const name = choiceOf(params, 'ir');
    if (!ctx.sample)
      throw new AudioParamError(`samples.${name}`, 'required', 'sample çözücüsü yok', name);
    const data = ctx.sample(name);
    const ir = data.channels.map((c) =>
      data.sampleRate === ctx.sampleRate ? c : resample(c, data.sampleRate / ctx.sampleRate),
    );
    convolveChannels(
      channels,
      ir,
      numberOf(params, 'mix'),
      Math.pow(10, numberOf(params, 'gainDb') / 20),
    );
  },
};
