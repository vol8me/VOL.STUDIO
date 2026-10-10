/**
 * Birleşik kapı koşucusunun çekirdeği: dalgaları sırayla koşar, girdisi
 * değişmemiş aşamayı makbuzdan atlar, geçen aşamaya makbuz yazar.
 *
 * Süreç başlatma enjekte edilir (`execute`); bu modül süreç açmaz, bu yüzden
 * atlama/makbuz/sıra kararları gerçek araç koşmadan test edilir.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gateStages, parseJustRecipes } from './justfile.mjs';
import {
  clearReceipt,
  environmentParts,
  fingerprint,
  listReceipts,
  readReceipt,
  snapshotFiles,
  writeReceipt,
} from './gateCache.mjs';
import { STAGE_PLAN, wavesFor } from './gatePlan.mjs';
import { deriveSharedInputs, readWorkspaceGraph, scopeInclude } from './gateScope.mjs';
import { unitsFor } from './gateUnits.mjs';

/** Sürüm öncesi kapı hiçbir makbuza güvenmez; yine de makbuz yazar. */
export const ALWAYS_FRESH = new Set(['signoff']);

function makeItem(ctx, stage, spec, parts) {
  const plan = STAGE_PLAN[stage];
  const { unit, command, args } = spec;
  const label = unit ? `${stage} ${spec.label}` : stage;
  const base = { stage, unit, label, command, args };
  if (plan.cache === false) {
    return { ...base, key: null, cached: null, reason: 'önbelleksiz aşama' };
  }

  const include = scopeInclude(ctx.graph, spec.scope, ctx.shared());
  const key = fingerprint(ctx.files, include, [
    `stage=${stage}`,
    ...(unit ? [`unit=${unit}`] : []),
    // Komut anahtarda: birimin ne koşturduğu değişirse eski makbuz geçerli sayılmaz.
    `run=${[command, ...args].join(' ')}`,
    ...environmentParts(),
    ...parts,
  ]);
  if (ctx.fresh) return { ...base, key, cached: null, reason: 'makbuz kullanılmıyor (--fresh)' };
  const receipt = readReceipt(ctx.root, stage, unit, key);
  if (receipt) return { ...base, key, cached: receipt, reason: 'girdi aynı' };
  const known = listReceipts(ctx.root, stage, unit).length > 0;
  return { ...base, key, cached: null, reason: known ? 'girdi değişti' : 'makbuz yok' };
}

/** Aşamayı koşulacak/atlanacak öğelere ayırır; hiçbir şey koşmaz. */
export function planStage(ctx, stage) {
  const plan = STAGE_PLAN[stage];
  const parts = ctx.toolParts(stage);
  const specs = plan.units
    ? unitsFor(ctx, stage)
    : [
        {
          unit: null,
          label: stage,
          command: 'pnpm',
          args: ['exec', 'just', stage],
          scope: { kind: plan.scope },
        },
      ];
  return {
    stage,
    concurrency: plan.concurrency ?? 1,
    items: specs.map((spec) => makeItem(ctx, stage, spec, parts)),
  };
}

/**
 * Aşamanın öğelerini koşar. Makbuzdan atlanan öğeler tek olay olarak bildirilir; kalanlar
 * en çok `concurrency` kadar birlikte koşar. Biri düşünce yeni öğe başlamaz, koşanlar biter.
 */
async function runPlanned(planned, ctx) {
  const started = Date.now();
  const entries = new Map();
  const cached = planned.items.filter((item) => item.cached);
  if (cached.length > 0) ctx.emit({ type: 'cached', stage: planned.stage, items: cached });
  for (const item of cached) {
    entries.set(item, {
      item,
      status: 'cached',
      durationMs: 0,
      savedMs: item.cached.durationMs ?? 0,
    });
  }

  const queue = planned.items.filter((item) => !item.cached);
  const lanes = Math.max(1, Math.min(planned.concurrency, queue.length));
  // Canlı çıktı yalnız tek koşan öğede okunur; eşzamanlı çocukların çıktısı karışırdı.
  const live = ctx.live && lanes === 1;
  let stopped = false;
  const lane = async () => {
    while (!stopped) {
      const item = queue.shift();
      if (!item) return;
      ctx.emit({ type: 'start', item });
      const itemStart = Date.now();
      const result = await ctx.execute(item, { live });
      const durationMs = Date.now() - itemStart;
      const status = result.code === 0 ? 'passed' : 'failed';
      entries.set(item, { item, status, durationMs, output: result.output, code: result.code });
      ctx.emit({ type: 'end', item, status, durationMs });
      if (status === 'failed') stopped = true;
    }
  };
  await Promise.all(Array.from({ length: lanes }, lane));

  const items = planned.items.filter((item) => entries.has(item)).map((item) => entries.get(item));
  // Eşzamanlı birimlerden birden fazlası düşebilir; hepsi raporlanır, hiçbiri kaybolmaz.
  const failedEntries = items.filter((entry) => entry.status === 'failed');
  const status =
    failedEntries.length > 0
      ? 'failed'
      : items.every((entry) => entry.status === 'cached')
        ? 'cached'
        : 'passed';
  return {
    stage: planned.stage,
    status,
    durationMs: Date.now() - started,
    concurrency: planned.concurrency,
    items,
    failedEntries,
  };
}

/**
 * Bir aşamanın, her öğesi koşsaydı süreceği duvar süresi: öğeler en çok `lanes` şeritte,
 * en uzundan başlayarak dağıtılır (atlananın yerine kayıtlı süresi konur).
 */
function stageWallTime(durations, lanes) {
  const loads = new Array(Math.max(1, lanes)).fill(0);
  for (const duration of [...durations].sort((a, b) => b - a)) {
    loads[loads.indexOf(Math.min(...loads))] += duration;
  }
  return Math.max(...loads);
}

/**
 * Dalganın duvar saatinde önbelleğin kazandırdığı süre. Aşamalar birlikte koştuğu için
 * süreler toplanmaz: dalga, en uzun aşama kadar sürerdi; kazanç o süre ile gerçek
 * duvar süresi arasındaki farktır. Aşamanın birimleri `concurrency` kadar birlikte koşar.
 */
export function waveSaving(outcomes, wallMs) {
  const would = outcomes.map((outcome) =>
    stageWallTime(
      outcome.items.map((entry) => (entry.status === 'cached' ? entry.savedMs : entry.durationMs)),
      outcome.concurrency ?? 1,
    ),
  );
  return Math.max(0, Math.max(0, ...would) - wallMs);
}

/** Ağacın tamamının karması: aşama sırasında dosya değişti mi diye bakmak için. */
const treeDigest = (files) => fingerprint(files, () => true);

/**
 * @param {object} options
 * @param {string} options.root
 * @param {string} options.gate quick | fast | high | signoff
 * @param {boolean} [options.fresh]
 * @param {(item: object, mode: { live: boolean }) => Promise<{ code: number, output: string }>} options.execute
 * @param {(event: object) => void} [options.emit]
 * @param {(stage: string) => string[]} [options.toolParts]
 * @param {(root: string) => Map<string, string>} [options.snapshot]
 */
export async function runGate(options) {
  const { root, gate, execute, emit = () => {}, snapshot = snapshotFiles } = options;
  const fresh = Boolean(options.fresh) || ALWAYS_FRESH.has(gate);
  const toolParts = options.toolParts ?? (() => []);
  const recipes = parseJustRecipes(readFileSync(join(root, 'justfile'), 'utf8'));
  const waves = wavesFor(gateStages(recipes, gate));
  const graph = readWorkspaceGraph(root);
  // Betik başvuruları her dalgada değil, ağaç değiştiğinde yeniden türetilir.
  const derived = { files: null, value: new Map() };
  const sharedInputs = (current) => {
    if (derived.files !== current) {
      derived.value = deriveSharedInputs(root, graph, current.keys());
      derived.files = current;
    }
    return derived.value;
  };

  const started = Date.now();
  const stages = [];
  const notes = [];
  let savedMs = 0;
  let files = snapshot(root);
  /** @type {{ stage: string, entry: any }[]} */
  const failures = [];

  for (const wave of waves) {
    const ctx = {
      root,
      graph,
      files,
      fresh,
      toolParts,
      execute,
      emit,
      live: wave.length === 1,
      shared: () => sharedInputs(files),
    };
    const before = treeDigest(files);
    const planned = wave.map((stage) => planStage(ctx, stage));
    emit({ type: 'wave', stages: wave });
    const waveStart = Date.now();
    const outcomes = await Promise.all(planned.map((entry) => runPlanned(entry, ctx)));
    savedMs += waveSaving(outcomes, Date.now() - waveStart);

    const after = snapshot(root);
    const stable = treeDigest(after) === before;
    if (!stable) {
      notes.push(`${wave.join(', ')}: ağaç koşu sırasında değişti; makbuz yazılmadı`);
    }
    for (const outcome of outcomes) {
      for (const entry of outcome.items) {
        const { item } = entry;
        if (!item.key) continue;
        if (entry.status === 'failed') clearReceipt(root, item.stage, item.unit, item.key);
        else if (entry.status === 'passed' && stable) {
          writeReceipt(root, item.stage, item.unit, {
            key: item.key,
            passedAt: new Date().toISOString(),
            durationMs: entry.durationMs,
          });
        }
      }
    }
    // Değişmeyen ağaçta aynı nesne kalır: türetilmiş betik girdileri yeniden hesaplanmaz.
    if (!stable) files = after;
    stages.push(...outcomes);
    for (const outcome of outcomes) {
      for (const entry of outcome.failedEntries) failures.push({ stage: outcome.stage, entry });
    }
    if (failures.length > 0) break;
  }

  return {
    gate,
    status: failures.length > 0 ? 'failed' : 'passed',
    fresh,
    durationMs: Date.now() - started,
    savedMs,
    notes,
    stages,
    failures,
  };
}
