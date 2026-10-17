#!/usr/bin/env node
/**
 * Birleşik kapı koşucusu: `pnpm quick|fast|high|signoff` ve git kancaları bunu çağırır.
 *
 *   node scripts/quality/gate.mjs <quick|fast|high|signoff> [--fresh] [--verbose] [--json]
 *
 * - Aşamalar `justfile`daki bileşimden gelir; sıra ve paralellik `gatePlan.mjs`dedir.
 * - Girdisi bayt bayt aynı olan aşama makbuzdan atlanır (`gateCache.mjs`). `--fresh`
 *   makbuzu yok sayar; `signoff` her zaman taze koşar.
 * - Çıktı sessizdir: geçen aşama tek satır, düşen aşama sonu + sınıflandırma +
 *   tam günlük yolu. `--verbose` çocuk çıktısını canlı akıtır.
 * - `--json` `report.mjs` ile aynı şekli stdout'a yazar; insan günlüğü stderr'e gider.
 * - `quick` dışındaki kapılar başlamadan makine yükünü örnekler; meşgulse yiyen süreçleri adıyla yazar
 *   (`hostLoad.mjs`). Yalnız uyarır; süre ve zaman aşımı sonuçları yük taşır.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync, spawn, spawnSync } from './command.mjs';
import { assertIndexMatchesWorkingTree, receiptDirectory } from './gateCache.mjs';
import { audioTestPlan, changedFiles } from './audioTests.mjs';
import { runGate } from './gateRunner.mjs';
import { checkHostLoad } from './hostLoad.mjs';
import { loadQualityConfig } from './config.mjs';
import { describeCounts } from './counts.mjs';
import { resolveRatchetBase } from './thresholdRatchet.mjs';
import { describeSignoff, readSignoffRecord, writeSignoffRecord } from './signoffRecord.mjs';
import { COMPOSITE_GATES, classify } from './report.mjs';

const OUTPUT_CAP = 8 * 1024 * 1024;
const HEARTBEAT_MS = 60_000;

const seconds = (ms) => `${(ms / 1000).toFixed(1)} sn`;
const minutes = (ms) => (ms >= 90_000 ? `${(ms / 60_000).toFixed(1)} dk` : seconds(ms));

function killTree(child) {
  if (child.exitCode !== null || child.pid === undefined) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill('SIGTERM');
  }
}

/** Sonucu etkileyen araç sürümleri; makbuz anahtarına girer. */
function toolParts(root) {
  const version = (command) => {
    try {
      return execFileSync(command, ['-V'], { cwd: root, encoding: 'utf8' }).trim();
    } catch {
      return `${command}=yok`;
    }
  };
  return (stage) => {
    if (stage === 'rust') return [version('rustc'), version('cargo')];
    // Eşik ratchet'i taban ref'in `quality.json`una bağlıdır; ağaç aynı kalsa da taban değişebilir.
    if (stage === 'contract') {
      return [`ratchetBase=${resolveRatchetBase(root)?.blob ?? 'yok'}`];
    }
    // Hangi alt kümenin koştuğu git farkından gelir; geçen plan o plan için geçerlidir.
    if (stage === 'audio-test') return [`plan=${JSON.stringify(audioTestPlan(changedFiles()))}`];
    return [];
  };
}

function gitText(root, args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' }).trim();
  } catch {
    return null;
  }
}

/**
 * Yeşil `signoff` kaydını yazar; ağaç koşu sırasında değiştiyse yazmaz (o ağaç için kanıt değildir).
 * `high` bunu okuyup yaşını yazar (F11.7).
 */
function recordSignoff(root, report) {
  if (report.gate !== 'signoff' || report.status !== 'passed') return;
  if (report.tree.start !== report.tree.end) return;
  writeSignoffRecord(root, {
    treeDigest: report.tree.end,
    commit: gitText(root, ['rev-parse', 'HEAD']),
    passedAt: new Date().toISOString(),
    durationMs: report.durationMs,
  });
}

/** `high` koşusunun sonunda son yeşil `signoff`un yaşını ve ağaçla ilişkisini söyler. */
function signoffStatus(root, report) {
  const record = readSignoffRecord(root);
  const commitsSince = record?.commit
    ? Number(gitText(root, ['rev-list', '--count', `${record.commit}..HEAD`]))
    : null;
  return describeSignoff({
    record,
    treeDigest: report.tree.end,
    now: Date.now(),
    commitsSince: Number.isFinite(commitsSince) ? commitsSince : null,
  });
}

/** Aşamanın öğelerinden okunan sayım satırları (koşan ve makbuzdan gelen). */
function stageRows(stage) {
  return stage.items.flatMap((entry) => entry.counts ?? []);
}

/** `report.mjs` ile aynı şekil: ajanlar ve araçlar tek biçim okur. */
function summarize(failure) {
  return {
    stage: failure.stage,
    ...(failure.unit && { unit: failure.unit }),
    rerun: failure.rerun,
    kind: failure.kind,
    package: failure.package,
    reason: failure.reason,
    exitCode: failure.exitCode,
    logFile: failure.logFile,
    ...(failure.tail && { tail: failure.tail }),
    ...(failure.title && { title: failure.title }),
    ...(failure.path && { path: failure.path }),
  };
}

function main() {
  const [, , gate = 'high', ...flags] = process.argv;
  if (!COMPOSITE_GATES.includes(gate)) {
    console.error(`Bilinmeyen kapı: ${gate}. Seçenekler: ${COMPOSITE_GATES.join(', ')}`);
    return Promise.resolve(2);
  }
  const root = process.cwd();
  const asJson = flags.includes('--json');
  const verbose = flags.includes('--verbose');
  const log = (text) => (asJson ? console.error(text) : console.log(text));

  const children = new Set();
  const running = new Map();
  const onSignal = () => {
    for (const child of children) killTree(child);
    process.exit(130);
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  // `quick` pre-commit hızını korur ve kanıtı süre değil içeriktir; yük yalnız ağır kapılarda örneklenir.
  let hostLoad = null;
  const preflight =
    gate === 'quick'
      ? Promise.resolve()
      : checkHostLoad({ root, log }).then((load) => {
          hostLoad = load;
        });

  const execute = (item, mode) =>
    new Promise((resolve) => {
      const child = spawn(item.command, item.args, {
        cwd: root,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
      children.add(child);
      let output = '';
      const take = (chunk) => {
        const text = chunk.toString('utf8');
        if (verbose && mode.live) (asJson ? process.stderr : process.stdout).write(text);
        output += text;
        if (output.length > OUTPUT_CAP) output = output.slice(-OUTPUT_CAP);
      };
      child.stdout.on('data', take);
      child.stderr.on('data', take);
      child.on('error', (error) => {
        children.delete(child);
        resolve({ code: 1, output: `${output}\n${error.message}` });
      });
      child.on('close', (code) => {
        children.delete(child);
        resolve({ code: code ?? 1, output });
      });
    });

  const heartbeat = setInterval(() => {
    const now = Date.now();
    const line = [...running]
      .map(([label, start]) => `${label} ${minutes(now - start)}`)
      .join(', ');
    if (line) log(`  … sürüyor: ${line}`);
  }, HEARTBEAT_MS);
  heartbeat.unref();

  const emit = (event) => {
    if (event.type === 'wave' && event.stages.length > 1) {
      log(`▶ ${event.stages.join(', ')} (birlikte)`);
    } else if (event.type === 'start') {
      running.set(event.item.label, Date.now());
      if (event.item.cached === null && event.item.key !== null) {
        log(`▶ ${event.item.label} (${event.item.reason})`);
      } else {
        log(`▶ ${event.item.label}`);
      }
    } else if (event.type === 'end') {
      running.delete(event.item.label);
      log(
        `  ${event.status === 'passed' ? '✓' : '✗'} ${event.item.label} ${seconds(event.durationMs)}`,
      );
    } else if (event.type === 'cached') {
      const [first] = event.items;
      const ago = first.cached.passedAt
        ? ` · ${minutes(Date.now() - Date.parse(first.cached.passedAt))} önce geçti`
        : '';
      const names = event.items.some((item) => item.unit)
        ? `${event.stage}: ${event.items.map((item) => item.label.slice(event.stage.length + 1)).join(', ')}`
        : first.label;
      log(`⏭ ${names} (girdi bayt bayt aynı${ago})`);
    }
  };

  return preflight
    .then(() => {
      if (flags.includes('--index')) assertIndexMatchesWorkingTree(root);
      return runGate({
        root,
        gate,
        fresh: flags.includes('--fresh'),
        execute,
        emit,
        toolParts: toolParts(root),
        skipBudget: loadQualityConfig(join(root, 'quality.json')).skipBudget ?? {},
      });
    })
    .then((report) => {
      clearInterval(heartbeat);
      if (flags.includes('--index')) assertIndexMatchesWorkingTree(root);
      const logDirectory = join(receiptDirectory(root), '..');
      const failures = report.failures.map(({ stage, entry }, index) => {
        const output = entry.output ?? '';
        const slug = entry.item.label.replace(/[^\w.-]+/g, '_');
        const logFile = join(logDirectory, `last-failure${index === 0 ? '' : `-${slug}`}.log`);
        mkdirSync(logDirectory, { recursive: true });
        writeFileSync(logFile, output);
        return {
          stage,
          label: entry.item.label,
          unit: entry.item.unit,
          rerun: [entry.item.command, ...entry.item.args].join(' '),
          exitCode: entry.code || 1,
          ...classify(stage, output),
          output,
          logFile,
        };
      });

      recordSignoff(root, report);
      const signoff = gate === 'high' ? signoffStatus(root, report) : null;

      const summary = {
        gate: report.gate,
        status: report.status,
        durationMs: report.durationMs,
        savedMs: report.savedMs,
        fresh: report.fresh,
        stages: report.stages.map((stage) => ({
          stage: stage.stage,
          status: stage.status,
          durationMs: stage.durationMs,
          ...(stageRows(stage).length > 0 && { counts: stageRows(stage) }),
          ...(stage.items.some((entry) => entry.item.unit) && {
            units: stage.items.map((entry) => ({
              unit: entry.item.unit,
              status: entry.status,
              durationMs: entry.durationMs,
            })),
          }),
        })),
        ...(failures.length > 0 && {
          failure: summarize(failures[0]),
          failures: failures.map(summarize),
        }),
        ...(report.notes.length > 0 && { notes: report.notes }),
        ...(signoff && {
          signoff: {
            state: signoff.state,
            ageMs: signoff.ageMs,
            commitsSince: signoff.commitsSince,
          },
        }),
        ...(hostLoad && {
          hostLoad: { busy: Number(hostLoad.busy.toFixed(2)), warned: hostLoad.warned },
        }),
      };

      for (const failure of failures) {
        const tail = failure.output.split('\n').slice(-120).join('\n');
        log(`\n── ${failure.label} düştü ──\n${tail}\n`);
        log(`  tür   : ${failure.kind}`);
        log(`  paket : ${failure.package ?? '-'}`);
        log(`  sebep : ${failure.reason}`);
        log(`  günlük: ${failure.logFile}`);
        log(`  tekrar: ${failure.rerun}`);
        if (failure.unit) log(`  aşama : pnpm exec just ${failure.stage} (tüm birimler, düz yol)`);
      }
      for (const note of report.notes) log(`  not   : ${note}`);
      if (signoff && report.status === 'passed') log(`  ${signoff.message}`);
      const saved = report.savedMs > 0 ? ` (önbellek ~${minutes(report.savedMs)} kazandırdı)` : '';
      log(
        `\n[kapı] ${gate}: ${report.status === 'passed' ? 'geçti' : 'DÜŞTÜ'} — ${minutes(report.durationMs)}${saved}` +
          `${report.fresh ? ' · taze koşu' : ''} · ${availableParallelism()} çekirdek` +
          `${hostLoad ? ` · ön yük %${Math.round(hostLoad.busy * 100)}` : ''}`,
      );
      for (const stage of report.stages) {
        const mark =
          stage.status === 'passed'
            ? '✓'
            : stage.status === 'cached'
              ? '⏭'
              : stage.status === 'notRun'
                ? '—'
                : '✗';
        const ran = stage.items.filter((entry) => entry.status !== 'cached').length;
        const detail =
          stage.items.length > 1 && ran > 0 && ran < stage.items.length
            ? ` · ${ran}/${stage.items.length} birim koştu`
            : '';
        const counted = describeCounts(stageRows(stage));
        log(
          `  ${mark} ${stage.stage.padEnd(15)} ${stage.status === 'cached' ? 'önbellek' : stage.status === 'notRun' ? 'NOT-RUN' : seconds(stage.durationMs)}${detail}${counted ? ` · ${counted}` : ''}`,
        );
      }
      if (asJson) console.log(JSON.stringify(summary, null, 2));
      return failures.length > 0 ? failures[0].exitCode : 0;
    });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      console.error(error);
      process.exit(1);
    },
  );
}
