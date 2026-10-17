import { createNoiseSource } from '../../synthesis/noise';
import { gaussian, OrnsteinUhlenbeck, StateVariableFilter } from '../../synthesis/svf';
import { numberOf } from '../params';
import type { SourceEntry } from '../registry';
import { addGrain, scheduleEvents } from './events';

/**
 * Elektrik/enerji ailesi — "bozulmuş sinüs" değil, ayrı mekanizmaların
 * toplamı:
 *
 * - Hum: şebeke frekansı ve harmonikleri (çift harmonik manyetostriksiyon
 *   2× vurgusu; `buzz` darbe katarına doğru keskinleştirir — tek harmonikler
 *   ve üst seri kabarır, doğrultulmuş/yarı iletken vızıltısı).
 * - Ark/çatırtı: güç yasalı genlikte (Pareto α = 1.5) sıçramalar; olay motoru.
 * - Şarj/deşarj: `charge` > 0 süre boyunca perde +2·charge oktav ve seviye
 *   yükselir (şarj), < 0 perde düşer ve seviye söner (deşarj/atış).
 * - Kararsızlık: perde ve seviye üzerinde iki ölçekli Ornstein–Uhlenbeck.
 * - Ring: `ringHz` taşıyıcıyla halka modülasyonu (metalik/bilimkurgu yan bant).
 */
export const ELECTRICAL: SourceEntry = {
  id: 'source.electrical',
  kind: 'source',
  version: 1,
  description:
    'Elektrik/enerji: şebeke hum’ı + harmonikler, buzz (darbe katarı keskinliği), güç yasalı ark ' +
    'çatırtıları, şarj/deşarj perde-seviye zarfı, OU kararsızlığı ve halka modülasyonu. Hum, ' +
    'şarj, enerji atışı ve kararsız ark aynı yapı taşının farklı programlarıdır.',
  capabilities: ['electrical', 'discharge', 'hum', 'stochastic', 'time-varying'],
  params: {
    mains: {
      type: 'number',
      unit: 'Hz',
      min: 40,
      max: 400,
      default: 50,
      belowNyquist: true,
      description: 'Temel frekans (şebeke 50/60 Hz; bilimkurgu tonu için daha yüksek).',
    },
    hum: {
      type: 'number',
      unit: 'normalized',
      min: 0,
      max: 1,
      default: 0.5,
      description: 'Harmonik hum seviyesi.',
    },
    buzz: {
      type: 'number',
      unit: 'normalized',
      min: 0,
      max: 1,
      default: 0.3,
      description: 'Darbe katarı keskinliği (üst harmonik kabarması).',
    },
    arcs: {
      type: 'number',
      unit: 'normalized',
      min: 0,
      max: 1,
      default: 0.2,
      description: 'Ark/çatırtı olay yoğunluğu (5…800 /sn).',
    },
    charge: {
      type: 'number',
      unit: 'normalized',
      min: -1,
      max: 1,
      default: 0,
      description: '+ şarj (perde/seviye yükselir), − deşarj (perde düşer, söner).',
    },
    instability: {
      type: 'number',
      unit: 'normalized',
      min: 0,
      max: 1,
      default: 0.2,
      description: 'Perde/seviye kararsızlığı (OU).',
    },
    ring: {
      type: 'number',
      unit: 'normalized',
      min: 0,
      max: 1,
      default: 0.15,
      description: 'Halka modülasyonu payı.',
    },
    ringHz: {
      type: 'number',
      unit: 'Hz',
      min: 20,
      max: 4000,
      default: 700,
      belowNyquist: true,
      description: 'Halka modülasyonu taşıyıcısı.',
    },
  },
  causal: [
    { param: 'mains', dimension: 'pitch', direction: 1, note: 'Hum perdesi.' },
    { param: 'hum', dimension: 'loudness', direction: 1, note: 'Hum seviyesi.' },
    { param: 'buzz', dimension: 'brightness', direction: 1, note: 'Keskin darbe katarı.' },
    { param: 'arcs', dimension: 'density', direction: 1, note: 'Daha çok çatırtı.' },
    { param: 'charge', dimension: 'pitch', direction: 1, note: 'Yükselen perde (şarj).' },
    { param: 'instability', dimension: 'irregularity', direction: 1, note: 'Kararsız.' },
    { param: 'ring', dimension: 'roughness', direction: 1, note: 'Yan bant.' },
    { param: 'ringHz', dimension: 'brightness', direction: 1, note: 'Yan bant yeri.' },
  ],
  determinism: {
    stochastic: true,
    substreams: ['drift', 'arc-timing', 'arc-variation', 'arc-size', 'arc-noise'],
  },
  resource: {
    model: 'O(kare·24) + O(olay)',
    workPerFrame: (p) => 70 + 30 * Number(p.arcs),
    stateBytes: () => 256,
  },
  render(out, params, ctx) {
    const sr = ctx.sampleRate;
    const n = out.length;
    const mains = numberOf(params, 'mains');
    const hum = numberOf(params, 'hum');
    const buzz = numberOf(params, 'buzz');
    const arcs = numberOf(params, 'arcs');
    const charge = numberOf(params, 'charge');
    const instability = numberOf(params, 'instability');
    const ring = numberOf(params, 'ring');
    const ringHz = numberOf(params, 'ringHz');
    const drift = ctx.random('drift');
    const g = gaussian(() => drift.next());
    const slow = new OrnsteinUhlenbeck(0.4, sr, g);
    const fast = new OrnsteinUhlenbeck(0.02, sr, g);
    let phase = 0;
    let ringPhase = 0;
    const harmonics = 24;
    for (let i = 0; i < n; i++) {
      const progress = i / n;
      const sweep = charge >= 0 ? 2 * charge * progress : 2 * -charge * (1 - progress);
      const level =
        charge >= 0
          ? 0.2 + 0.8 * Math.pow(progress, 1 - 0.7 * charge)
          : Math.exp(4 * charge * progress);
      const wobble = instability * (0.6 * slow.next() + 0.4 * fast.next());
      const f0 = mains * Math.pow(2, sweep + 0.08 * wobble);
      let tone = 0;
      for (let k = 1; k <= harmonics; k++) {
        const f = k * f0;
        if (f >= 0.45 * sr) break;
        const even = k % 2 === 0 ? 1 : 0.35;
        const weight =
          Math.pow(k, -2 + 1.6 * buzz) * (buzz * (k % 2 === 1 ? 1 : 0.4) + (1 - buzz) * even);
        tone += weight * Math.sin(2 * Math.PI * k * phase);
      }
      phase += f0 / sr;
      if (phase >= 1) phase -= Math.floor(phase);
      const carrier = Math.sin(2 * Math.PI * ringPhase);
      ringPhase += ringHz / sr;
      if (ringPhase >= 1) ringPhase -= 1;
      const voiced = tone * (1 - ring + ring * carrier);
      out[i] = hum * level * (1 + 0.5 * instability * wobble) * voiced;
    }
    if (arcs <= 0) return;
    const rate = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const progress = i / n;
      const shape = charge >= 0 ? 0.3 + 0.7 * progress : 1 - 0.8 * progress;
      rate[i] = (5 + 795 * arcs * arcs) * shape;
    }
    const events = scheduleEvents(
      {
        rate,
        regularity: 0,
        clustering: 0.4,
        sizeSpread: 0.8,
        levelSpread: 0,
        frames: n,
        sampleRate: sr,
      },
      ctx.random('arc-timing'),
      ctx.random('arc-variation'),
    );
    const noise = createNoiseSource('noise', ctx.seed('arc-noise'));
    const crack = new StateVariableFilter(sr);
    const pareto = ctx.random('arc-size');
    for (const event of events) {
      const size = Math.min(8, Math.pow(1 - pareto.next(), -1 / 1.5));
      const length = Math.min(
        n - event.frame,
        Math.round((0.0008 + 0.002 * Math.min(1, size / 4)) * sr),
      );
      for (let j = 0; j < length; j++) {
        const decay = Math.exp((-6 * j) / length);
        out[event.frame + j] += 0.12 * size * decay * crack.highpass(noise.next(), 1500);
      }
      addGrain(
        out,
        event.frame,
        0.04 * size,
        Math.min(0.4 * sr, 2500 * Math.pow(2, event.size)),
        0.004,
        0,
        sr,
      );
    }
  },
};
