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
import { SCOPE_OVERRIDES, STAGE_PLAN, wavesFor } from './gatePlan.mjs';
import { activePackagesWithScript, readWorkspaceGraph, scopeInclude } from './gateScope.mjs';

/** Sürüm öncesi kapı hiçbir makbuza güvenmez; yine de makbuz yazar. */
export const ALWAYS_FRESH = new Set(['signoff']);

function unitScope(name) {
  const override = SCOPE_OVERRIDES[name];
  return override ? { kind: override.kind } : { kind: 'closure', package: name };
}

function makeItem(ctx, stage, unit, scope, parts) {
  const plan = STAGE_PLAN[stage];
  const command = 'pnpm';
  const args = unit ? ['--filter', unit, 'run', plan.script] : ['exec', 'just', stage];
  const label = unit ? `${stage} ${unit.replace('@volstudio/', '')}` : stage;
  const base = { stage, unit, label, command, args };
  if (plan.cache === false) {
    return { ...base, key: null, cached: null, reason: 'önbelleksiz aşama' };
  }

  const include = scopeInclude(ctx.graph, scope);
  const key = fingerprint(ctx.files, include, [
    `stage=${stage}`,
    ...(unit ? [`unit=${unit}`] : []),
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
  if (plan.units === 'packages') {
    const names = activePackagesWithScript(ctx.graph, plan.script);
    if (names.length === 0) throw new Error(`Aktif workspace'lerde "${plan.script}" betiği yok.`);
    return {
      stage,
      items: names.map((name) => makeItem(ctx, stage, name, unitScope(name), parts)),
    };
  }
  return { stage, items: [makeItem(ctx, stage, null, { kind: plan.scope }, parts)] };
}

async function runPlanned(planned, ctx) {
  const started = Date.now();
  const items = [];
  let failed = null;
  for (const item of planned.items) {
    if (item.cached) {
      ctx.emit({ type: 'cached', item });
      items.push({ item, status: 'cached', durationMs: 0, savedMs: item.cached.durationMs ?? 0 });
      continue;
    }
    ctx.emit({ type: 'start', item });
    const itemStart = Date.now();
    const result = await ctx.execute(item, { live: ctx.live });
    const durationMs = Date.now() - itemStart;
    const status = result.code === 0 ? 'passed' : 'failed';
    items.push({ item, status, durationMs, output: result.output, code: result.code });
    ctx.emit({ type: 'end', item, status, durationMs });
    if (status === 'failed') {
      failed = items.at(-1);
      break;
    }
  }
  const status = failed
    ? 'failed'
    : items.every((entry) => entry.status === 'cached')
      ? 'cached'
      : 'passed';
  return { stage: planned.stage, status, durationMs: Date.now() - started, items, failed };
}

/**
 * Dalganın duvar saatinde önbelleğin kazandırdığı süre. Aşamalar birlikte koştuğu için
 * süreler toplanmaz: dalga, en uzun aşama kadar sürerdi; kazanç o süre ile gerçek
 * duvar süresi arasındaki farktır. Aşamanın birimleri art arda koşar, onlar toplanır.
 */
export function waveSaving(outcomes, wallMs) {
  const would = outcomes.map((outcome) =>
    outcome.items.reduce(
      (sum, entry) => sum + (entry.status === 'cached' ? entry.savedMs : entry.durationMs),
      0,
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

  const started = Date.now();
  const stages = [];
  const notes = [];
  let savedMs = 0;
  let files = snapshot(root);
  /** @type {{ stage: string, entry: any }[]} */
  const failures = [];

  for (const wave of waves) {
    const ctx = { root, graph, files, fresh, toolParts, execute, emit, live: wave.length === 1 };
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
    files = after;
    stages.push(...outcomes);
    for (const outcome of outcomes) {
      if (outcome.failed) failures.push({ stage: outcome.stage, entry: outcome.failed });
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
