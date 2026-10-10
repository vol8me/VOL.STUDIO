#!/usr/bin/env node
/**
 * `security-rust` kapısı: aktif `Cargo.lock` dosyalarını cargo-audit ile tarar ve
 * sonucu `securityPolicy.json` ile eşler.
 *
 * cargo-audit bakımsız (`unmaintained`), sağlam olmayan (`unsound`) ve yanked
 * crate'leri çıkış kodunu bozmadan UYARI olarak basar; ham hâliyle kapı bunları
 * görmezdi. Burada her uyarı sınıflanır:
 *   - zafiyet: istisna yok, kapı düşer;
 *   - yanked: istisna yok, kapı düşer (`cargo update -p <crate>`);
 *   - unmaintained / unsound: yalnız politikada (advisory + crate + sürüm + tür)
 *     yazılıysa geçer; yeni olan düşer;
 *   - politikada kayıtlı ama artık bulunmayan kayıt da düşer (bayat politika).
 * Sürüm kayda bağlıdır: crate'in sürümü değişirse kayıt yeniden gözden geçirilir.
 */
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync, spawnSync } from './command.mjs';
import { RUST_EXCEPTION_KINDS, failureMarker, loadSecurityPolicy } from './securityPolicy.mjs';
import { excludingFrozenPaths, loadWorkspaceLifecycle } from './workspaceLifecycle.mjs';

export function activeCargoLocks(root, lifecycle) {
  const locks = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '**/Cargo.lock', 'Cargo.lock'],
    { cwd: root, encoding: 'utf8' },
  )
    .split('\0')
    .filter(Boolean);
  // Aktif crate'ler kökteki tek kilidi paylaşır; frozen ağaçlar kendi
  // kilidiyle donar ve denetlenmez (bkz. cargoWorkspace.mjs).
  return excludingFrozenPaths(locks, lifecycle).sort();
}

/** Birden çok kilidin cargo-audit JSON çıktısını tek rapora toplar. */
export function mergeReports(reports) {
  /** @type {{ vulnerabilities: { list: any[] }, warnings: Record<string, any[]> }} */
  const merged = { vulnerabilities: { list: [] }, warnings: {} };
  for (const report of reports) {
    merged.vulnerabilities.list.push(...(report.vulnerabilities?.list ?? []));
    for (const [kind, list] of Object.entries(report.warnings ?? {})) {
      merged.warnings[kind] = [...(merged.warnings[kind] ?? []), ...list];
    }
  }
  return merged;
}

/**
 * cargo-audit raporunu politikayla eşler.
 * @returns `{ ok, problems, accepted }`; `accepted` kayıtlı ve bulunan kayıtlardır.
 */
export function evaluateRustAudit({ report, entries }) {
  const problems = [];
  const accepted = [];
  const used = new Set();

  for (const item of report.vulnerabilities?.list ?? []) {
    const { name, version } = item.package;
    problems.push(
      `zafiyet: ${name}@${version} ${item.advisory?.id ?? '?'} — ${item.advisory?.title ?? ''}`.trim() +
        ' (zafiyete istisna verilmez).',
    );
  }

  for (const [kind, list] of Object.entries(report.warnings ?? {})) {
    for (const warning of list) {
      const { name, version } = warning.package;
      const id = warning.advisory?.id;
      if (kind === 'yanked') {
        problems.push(
          `yanked: ${name}@${version} — yayından çekilmiş; \`cargo update -p ${name}\` ile yükselt (yanked'e istisna verilmez).`,
        );
        continue;
      }
      if (!RUST_EXCEPTION_KINDS.includes(kind)) {
        problems.push(`${kind}: ${name}@${version} ${id ?? ''} — politika bu türe istisna vermez.`);
        continue;
      }
      const entry = entries.find(
        (candidate) =>
          candidate.advisory === id &&
          candidate.crate === name &&
          candidate.version === version &&
          candidate.kind === kind,
      );
      if (entry) {
        used.add(entry);
        accepted.push(entry);
      } else {
        problems.push(
          `yeni ${kind} riski: ${name}@${version} ${id ?? ''} — ${warning.advisory?.title ?? ''}`.trim() +
            ". Düzelt/yükselt ya da gerekçesiyle securityPolicy.json'a yaz.",
        );
      }
    }
  }

  for (const entry of entries) {
    if (!used.has(entry)) {
      problems.push(
        `${entry.crate}@${entry.version} ${entry.advisory}: politikada kayıtlı ama cargo-audit artık bu sürümde bulmuyor. Kaydı sil ya da yeni sürüm için yeniden gözden geçir.`,
      );
    }
  }
  return { ok: problems.length === 0, problems, accepted };
}

function auditLock(root, lock) {
  const result = spawnSync('cargo', ['audit', '--json', '--file', lock], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) {
    return { error: `cargo-audit çalıştırılamadı (kurulu mu?): ${result.error.message}` };
  }
  try {
    return { report: JSON.parse(result.stdout) };
  } catch {
    return { error: (result.stderr || result.stdout || `çıkış kodu ${result.status}`).trim() };
  }
}

export function auditRust(root, log = console.log, io = {}) {
  const lifecycle = loadWorkspaceLifecycle(join(root, 'workspace-lifecycle.json'));
  const locks = activeCargoLocks(root, lifecycle);
  if (locks.length === 0) throw new Error('Rust güvenlik kapısı: aktif Cargo.lock bulunamadı.');
  const policy = loadSecurityPolicy(root);

  const reports = [];
  for (const lock of locks) {
    log(`[rust-security] ${lock}`);
    const { report, error } = (io.auditLock ?? auditLock)(root, lock);
    if (!report) {
      log(`[rust-security] cargo audit sonucu okunamadı:\n${error}`);
      log(failureMarker('security-rust', 1));
      return 1;
    }
    reports.push(report);
  }

  const result = evaluateRustAudit({ report: mergeReports(reports), entries: policy.rust });
  for (const entry of result.accepted) {
    log(
      `  kabul: ${entry.crate}@${entry.version} ${entry.advisory} (${entry.kind}; ${entry.platforms.join('/')}) — sahip: ${entry.owner}`,
    );
  }
  if (!result.ok) {
    for (const problem of result.problems) log(`  DÜŞTÜ: ${problem}`);
    log(failureMarker('security-rust', result.problems.length));
    return 1;
  }
  log(
    `[rust-security] temiz: zafiyet yok, ${result.accepted.length} kayıtlı ve gerekçeli risk, başka uyarı yok`,
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = auditRust(process.cwd());
}
