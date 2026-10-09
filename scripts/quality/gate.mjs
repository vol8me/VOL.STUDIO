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
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync, spawn, spawnSync } from './command.mjs';
import { receiptDirectory } from './gateCache.mjs';
import { audioTestPlan, changedFiles } from './audioTests.mjs';
import { runGate } from './gateRunner.mjs';
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
    // Hangi alt kümenin koştuğu git farkından gelir; geçen plan o plan için geçerlidir.
    if (stage === 'audio-test') return [`plan=${JSON.stringify(audioTestPlan(changedFiles()))}`];
    return [];
  };
}

/** `report.mjs` ile aynı şekil: ajanlar ve araçlar tek biçim okur. */
function summarize(failure) {
  return {
    stage: failure.stage,
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
        if (verbose && mode.live) process.stdout.write(text);
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
      const ago = event.item.cached.passedAt
        ? ` · ${minutes(Date.now() - Date.parse(event.item.cached.passedAt))} önce geçti`
        : '';
      log(`⏭ ${event.item.label} (girdi bayt bayt aynı${ago})`);
    }
  };

  return runGate({
    root,
    gate,
    fresh: flags.includes('--fresh'),
    execute,
    emit,
    toolParts: toolParts(root),
  }).then((report) => {
    clearInterval(heartbeat);
    const logDirectory = join(receiptDirectory(root), '..');
    const failures = report.failures.map(({ stage, entry }, index) => {
      const output = entry.output ?? '';
      const logFile = join(logDirectory, `last-failure${index === 0 ? '' : `-${stage}`}.log`);
      mkdirSync(logDirectory, { recursive: true });
      writeFileSync(logFile, output);
      return {
        stage,
        label: entry.item.label,
        exitCode: entry.code || 1,
        ...classify(stage, output),
        output,
        logFile,
      };
    });

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
      })),
      ...(failures.length > 0 && {
        failure: summarize(failures[0]),
        failures: failures.map(summarize),
      }),
      ...(report.notes.length > 0 && { notes: report.notes }),
    };

    for (const failure of failures) {
      const tail = failure.output.split('\n').slice(-120).join('\n');
      log(`\n── ${failure.label} düştü ──\n${tail}\n`);
      log(`  tür   : ${failure.kind}`);
      log(`  paket : ${failure.package ?? '-'}`);
      log(`  sebep : ${failure.reason}`);
      log(`  günlük: ${failure.logFile}`);
      log(`  tekrar: pnpm exec just ${failure.stage}`);
    }
    for (const note of report.notes) log(`  not   : ${note}`);
    const saved = report.savedMs > 0 ? ` (önbellek ~${minutes(report.savedMs)} kazandırdı)` : '';
    log(
      `\n[kapı] ${gate}: ${report.status === 'passed' ? 'geçti' : 'DÜŞTÜ'} — ${minutes(report.durationMs)}${saved}` +
        `${report.fresh ? ' · taze koşu' : ''} · ${availableParallelism()} çekirdek`,
    );
    for (const stage of report.stages) {
      const mark = stage.status === 'passed' ? '✓' : stage.status === 'cached' ? '⏭' : '✗';
      log(
        `  ${mark} ${stage.stage.padEnd(15)} ${stage.status === 'cached' ? 'önbellek' : seconds(stage.durationMs)}`,
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
