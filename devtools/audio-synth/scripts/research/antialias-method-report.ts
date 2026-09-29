/**
 * Kenarlı osilatör bant-sınırlama yöntemi karşılaştırması — R2e kanıtı.
 *
 * Aynı testere ızgarasında dört aday ölçülür:
 *   1. minBLEP   — aynı Kaiser-sinc çekirdeğin gerçel kepstrum ile minimum
 *                  fazlı eşdeğeri; kümülatif integrali basamak tabanına
 *                  çevrilir (literatürdeki minBLEP üretim yolu).
 *   2. polyBLEP  — yüksek dereceli polinom BLEP: 3. derece B-spline
 *                  çekirdeğinin kümülatif integrali (±2 örnek, C²).
 *   3. os4x      — yerel aşırı örnekleme: naif testere 4× oranda + iki
 *                  halfband decimation (`downsample2x`).
 *   4. blepR16   — mevcut pencereli-sinc BLEP rezidüeli (BLEP_RADIUS=16).
 *
 * Ölçüler: kafes-dışı alias (polyblep-alias-report ile aynı yöntem),
 * bant içi harmonik genlik hatası (ideal 1/m'ye göre en kötü dB sapma)
 * ve CPU maliyeti (örnek başına ns; göreli karşılaştırma içindir).
 *
 * Deterministiktir; çıktı commit'lenmez.
 *
 * Kullanım: tsx scripts/research/antialias-method-report.ts [--json]
 */
import { performance } from 'node:perf_hooks';
import { fft, powerSpectrum } from '../../src/analysis/spectrum';
import { downsample2x } from '../../src/engine/render';
import { blepResidual, BLEP_RADIUS } from '../../src/synthesis/waveforms';

const RATE = 44100;
const SUBSTEPS = 64;

/** Kafes dışı / kafes gücü (dB) — polyblep-alias-report ile aynı. */
function aliasDb(x: Float32Array, f: number): number {
  const size = 16384;
  const power = powerSpectrum(x, Math.floor(0.25 * RATE), size);
  const binHz = RATE / size;
  const top = Math.floor((0.4535 * RATE) / binHz);
  const on = new Uint8Array(top + 1);
  for (let k = 0; k <= 5; k++) on[k] = 1;
  for (let m = 1; m * f <= 0.4535 * RATE + 5 * binHz; m++) {
    const c = Math.round((m * f) / binHz);
    for (let k = c - 5; k <= c + 5; k++) if (k >= 0 && k <= top) on[k] = 1;
  }
  let signal = 0;
  let alias = 0;
  for (let k = 0; k <= top; k++) {
    if (on[k]) signal += power[k];
    else alias += power[k];
  }
  return 10 * Math.log10(Math.max(alias / signal, 1e-30));
}

/** Bant içi harmonik genlik hatası: ideal 1/m'ye göre en kötü dB sapma (≤18 kHz). */
function harmonicErrorDb(x: Float32Array, f: number): number {
  const size = 16384;
  const power = powerSpectrum(x, Math.floor(0.25 * RATE), size);
  const binHz = RATE / size;
  const peakAt = (m: number) => {
    const c = Math.round((m * f) / binHz);
    let best = 0;
    for (let k = c - 5; k <= c + 5; k++) best = Math.max(best, power[k] ?? 0);
    return Math.sqrt(best);
  };
  const ref = peakAt(1);
  let worst = 0;
  for (let m = 2; m * f <= 18000; m++) {
    const a = peakAt(m);
    if (a <= 0 || ref <= 0) continue;
    worst = Math.max(worst, Math.abs(20 * Math.log10((a * m) / ref)));
  }
  return worst;
}

/* ---------- aday çekirdekler: d örnek → basamak rezidüeli ---------- */

let besselMemo: number | null = null;
function besselI0(x: number): number {
  let sum = 1;
  let term = 1;
  const y = (x * x) / 4;
  for (let k = 1; k < 64; k++) {
    term *= y / (k * k);
    sum += term;
    if (term < 1e-12 * sum) break;
  }
  return sum;
}

function kaiser(u: number): number {
  const a = Math.abs(u);
  if (a >= 1) return 0;
  if (besselMemo === null) besselMemo = besselI0(8.6);
  return besselI0(8.6 * Math.sqrt(1 - a * a)) / besselMemo;
}

function sincKaiser(u: number): number {
  return (u === 0 ? 1 : Math.sin(Math.PI * u) / (Math.PI * u)) * kaiser(u / BLEP_RADIUS);
}

/** Min-faz çekirdeğin basamağı kenar sonrası uzun salınır: tablo [−R, +4R]. */
const MINBLEP_POST = 4 * BLEP_RADIUS;
let minBlepTable: Float32Array | null = null;

/** minBLEP tablosu: sinc·Kaiser → kepstrum katlama → minimum faz → integral. */
function getMinBlepTable(): Float32Array {
  if (minBlepTable) return minBlepTable;
  const half = BLEP_RADIUS * SUBSTEPS;
  const n = 65536;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = -half; i <= half; i++) {
    re[(i + n) % n] = sincKaiser(i / SUBSTEPS);
  }
  fft(re, im);
  // Derin spektral sıfırlar (|K| ~1e-11) kepstrumu uzatır; taban
  // regülarizasyonu zaman-bulanıklığını sınırlar.
  let kMax = 0;
  for (let i = 0; i < n; i++) kMax = Math.max(kMax, Math.hypot(re[i], im[i]));
  const floor = kMax * 1e-9;
  for (let i = 0; i < n; i++) re[i] = Math.log(Math.max(Math.hypot(re[i], im[i]), floor));
  im.fill(0);
  fft(re, im); // c[m] = fft(logK)[n−m]/n; çift simetriyle re[i]+re[n−i] = 2c[i]·n
  const ceps = new Float64Array(n);
  ceps[0] = re[0] / n;
  for (let i = 1; i < n / 2; i++) ceps[i] = (re[i] + re[n - i]) / n;
  ceps[n / 2] = re[n / 2] / n;
  const re2 = new Float64Array(ceps);
  const im2 = new Float64Array(n);
  fft(re2, im2);
  // Minimum faz çekirdeği = ifft(exp(logK_min)) — conj·fft·conj/n.
  for (let i = 0; i < n; i++) {
    const e = Math.exp(re2[i]);
    re2[i] = e * Math.cos(im2[i]);
    im2[i] = -e * Math.sin(im2[i]);
  }
  fft(re2, im2);
  const kernel = new Float64Array(n);
  for (let i = 0; i < n; i++) kernel[i] = re2[i] / n;
  // Kümülatif integral → basamak; %50 geçişi d=0'a hizalanır. Kuyruk
  // kenar sonrası ~30+ örnek salındığından tamponu tüm destek kaplar.
  const stepLen = (BLEP_RADIUS + MINBLEP_POST + 4) * SUBSTEPS;
  const total = kernel.slice(0, stepLen).reduce((a, b) => a + b, 0);
  const step = new Float64Array(stepLen);
  let acc = 0;
  for (let i = 0; i < stepLen; i++) {
    acc += kernel[i] / total;
    step[i] = acc;
  }
  let cross = 0;
  while (cross < stepLen && step[cross] < 0.5) cross++;
  const len = (BLEP_RADIUS + MINBLEP_POST) * SUBSTEPS + 1;
  const table = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const src = cross + (i - half);
    const u = i >= half ? 1 : 0;
    table[i] = src >= 0 && src < stepLen ? step[src] - u : 0;
  }
  minBlepTable = table;
  return table;
}

function minBlepResidual(d: number): number {
  if (d <= -BLEP_RADIUS || d >= MINBLEP_POST) return 0;
  const table = getMinBlepTable();
  const pos = (d + BLEP_RADIUS) * SUBSTEPS;
  const i = Math.min(Math.floor(pos), table.length - 2);
  return table[i] + (table[i + 1] - table[i]) * (pos - i);
}

const POLY_RADIUS = 2;
let polyTable: Float32Array | null = null;

/**
 * 3. derece B-spline basamak rezidüeli tablosu (±2 örnek, C²):
 * `B(u) = (2−|u|)³/6 (1≤|u|<2)`, `(4−6u²+3|u|³)/6 (|u|<1)` çekirdeğinin
 * kümülatif integrali − basamak. Çalışma zamanında tabloya bir kez
 * örneklenir — CPU ölçümü diğer adaylarla aynı yolu paylaşır.
 */
function getPolyTable(): Float32Array {
  if (polyTable) return polyTable;
  const len = 2 * POLY_RADIUS * SUBSTEPS + 1;
  const table = new Float32Array(len);
  const dx = 1 / SUBSTEPS;
  const kernel = (u: number) => {
    const w = Math.abs(u);
    return w >= 2 ? 0 : w >= 1 ? (2 - w) ** 3 / 6 : (4 - 6 * w * w + 3 * w * w * w) / 6;
  };
  let acc = 0;
  for (let i = 1; i < len; i++) {
    acc += kernel(-POLY_RADIUS + (i - 0.5) * dx) * dx;
    table[i] = acc - Math.max(0, -POLY_RADIUS + i * dx);
  }
  polyTable = table;
  return table;
}

function polyBlepResidual(d: number): number {
  if (d <= -POLY_RADIUS || d >= POLY_RADIUS) return 0;
  const table = getPolyTable();
  const pos = (d + POLY_RADIUS) * SUBSTEPS;
  const i = Math.min(Math.floor(pos), table.length - 2);
  return table[i] + (table[i + 1] - table[i]) * (pos - i);
}

/* ---------- üreticiler ---------- */

type Residual = (d: number) => number;

/** Kenar rezidüeli toplamalı naif testere (her periyot 0'da −2 sıçrama). */
function sawWith(residual: Residual, radius: number, f: number, seconds = 0.7): Float32Array {
  const n = Math.floor(seconds * RATE);
  const inc = f / RATE;
  const span = radius * inc;
  const out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    let s = 2 * phase - 1;
    const first = Math.ceil(phase - span);
    const last = Math.floor(phase + span);
    for (let k = first; k <= last; k++) s += -2 * residual((phase - k) / inc);
    out[i] = s;
    phase = (phase + inc) % 1;
  }
  return out;
}

/** 4× yerel aşırı örnekleme: naif testere + iki halfband decimation. */
function sawOversampled(f: number, seconds = 0.7): Float32Array {
  const os = 4;
  const n = Math.floor(seconds * RATE * os);
  const inc = f / (RATE * os);
  const buf = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    buf[i] = 2 * phase - 1;
    phase = (phase + inc) % 1;
  }
  const half1 = downsample2x(buf, RATE * os, RATE * 2);
  return downsample2x(half1, RATE * 2, RATE);
}

const METHODS: { name: string; make: (f: number) => Float32Array }[] = [
  { name: 'minBLEP', make: (f) => sawWith(minBlepResidual, MINBLEP_POST, f) },
  { name: 'polyBLEP', make: (f) => sawWith(polyBlepResidual, POLY_RADIUS, f) },
  { name: 'os4x', make: (f) => sawOversampled(f) },
  { name: 'blepR16', make: (f) => sawWith(blepResidual, BLEP_RADIUS, f) },
];

const GRID = [233, 917, 3600, 5500, 8000];
const rows: {
  method: string;
  frequency: number;
  aliasDb: number;
  harmonicErrorDb: number;
  nsPerSample: number;
}[] = [];

for (const m of METHODS) {
  for (const f of GRID) {
    const x = m.make(f);
    const t0 = performance.now();
    const reps = 5;
    for (let r = 0; r < reps; r++) m.make(f);
    const nsPerSample = ((performance.now() - t0) / reps / x.length) * 1e6;
    rows.push({
      method: m.name,
      frequency: f,
      aliasDb: aliasDb(x, f),
      harmonicErrorDb: harmonicErrorDb(x, f),
      nsPerSample,
    });
  }
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ rows }, null, 1));
} else {
  let prev = '';
  for (const r of rows) {
    if (r.method !== prev) console.log(`— ${r.method}`);
    prev = r.method;
    console.log(
      `  ${String(r.frequency).padStart(5)} Hz  alias ${r.aliasDb.toFixed(1)} dB  ` +
        `harm ${r.harmonicErrorDb.toFixed(2)} dB  ${r.nsPerSample.toFixed(1)} ns/örnek`,
    );
  }
}
