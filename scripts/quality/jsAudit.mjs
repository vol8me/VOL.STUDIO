#!/usr/bin/env node
/**
 * `security-js` kapısı: `pnpm audit --audit-level moderate` bulgularını
 * `securityPolicy.json` ile eşler.
 *
 * Seviye düşürülmez ve toptan yok sayma yoktur. Bir bulgu ancak politikada
 * (advisory + paket + sürüm) yazılıysa VE kanıtı sağlanıyorsa geçer:
 *   - yama dosyası vardır ve `pnpm-workspace.yaml` `patchedDependencies` ile bağlıdır;
 *   - kurulu kopya yamalıdır (paketin kendi sınaması gerçek süreçte koşar);
 *   - kayıt defterinde daha yeni sürüm yoktur (varsa yükseltme gözden geçirilir).
 * Kayıtlı ama artık bulunmayan istisna da kapıyı düşürür; politika bayatlayamaz.
 */
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from './command.mjs';
import { failureMarker, loadSecurityPolicy } from './securityPolicy.mjs';

export const AUDIT_LEVEL = 'moderate';
const SEVERITIES = ['info', 'low', 'moderate', 'high', 'critical'];

/** `pnpm audit --json` çıktısını (advisory, paket, sürüm) bulgularına düzleştirir. */
export function auditFindings(report, level = AUDIT_LEVEL) {
  const floor = SEVERITIES.indexOf(level);
  const findings = [];
  for (const advisory of Object.values(report?.advisories ?? {})) {
    if (SEVERITIES.indexOf(advisory.severity) < floor) continue;
    const versions = [...new Set((advisory.findings ?? []).map((finding) => finding.version))];
    for (const version of versions.length > 0 ? versions : ['?']) {
      findings.push({
        advisory: advisory.github_advisory_id ?? String(advisory.id),
        package: advisory.module_name,
        version,
        severity: advisory.severity,
        title: advisory.title,
      });
    }
  }
  return findings;
}

/**
 * Bulguları politikayla eşler. `prove(entry)` kaydın kanıt sorunlarını döner;
 * boşsa istisna geçerlidir.
 */
export function evaluateJsAudit({ findings, entries, prove }) {
  const problems = [];
  const accepted = [];
  const used = new Set();
  for (const finding of findings) {
    const entry = entries.find(
      (candidate) =>
        candidate.advisory === finding.advisory &&
        candidate.package === finding.package &&
        candidate.version === finding.version,
    );
    const subject = `${finding.package}@${finding.version} ${finding.advisory}`;
    if (!entry) {
      problems.push(`${subject} (${finding.severity}): ${finding.title} — politikada kayıt yok.`);
      continue;
    }
    used.add(entry);
    const unproven = prove(entry);
    if (unproven.length > 0) {
      problems.push(...unproven.map((problem) => `${subject}: ${problem}`));
    } else {
      accepted.push(entry);
    }
  }
  for (const entry of entries) {
    if (!used.has(entry)) {
      problems.push(
        `${entry.package}@${entry.version} ${entry.advisory}: politikada kayıtlı ama audit artık bulmuyor. ` +
          `Kaydı (securityPolicy.json) ve ${entry.patch} yamasını (pnpm-workspace.yaml) sil.`,
      );
    }
  }
  return { ok: problems.length === 0, problems, accepted };
}

/** `pnpm-workspace.yaml` → `patchedDependencies` eşlemesi (ad@sürüm → yama yolu). */
export function patchedDependencies(text) {
  const map = new Map();
  let inside = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^patchedDependencies:\s*$/.test(line)) {
      inside = true;
      continue;
    }
    if (!inside) continue;
    if (/^\S/.test(line)) break;
    const match = /^\s+(?:'([^']+)'|"([^"]+)"|([^\s:]+)):\s*(?:'([^']+)'|"([^"]+)"|(\S+))\s*$/.exec(
      line,
    );
    if (match) map.set(match[1] ?? match[2] ?? match[3], match[4] ?? match[5] ?? match[6]);
  }
  return map;
}

function compareVersions(left, right) {
  const a = left.split('.').map(Number);
  const b = right.split('.').map(Number);
  for (let index = 0; index < 3; index++) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

/** `version`dan büyük, ön sürüm olmayan yayımlanmış sürümler. */
export function newerVersions(published, version) {
  return published
    .filter((candidate) => /^\d+\.\d+\.\d+$/.test(candidate))
    .filter((candidate) => compareVersions(candidate, version) > 0)
    .sort(compareVersions);
}

/**
 * Bağımlıların GERÇEKTEN çözdüğü kurulu kopyalar. pnpm sanal deposunda eski
 * kopya artık dizin olarak kalabilir; yalnız bağımlıdan gelen bağlantılar sayılır.
 */
export function installedCopies(root, name, version) {
  const segments = name.split('/');
  const store = join(root, 'node_modules/.pnpm');
  const links = [join(root, 'node_modules', ...segments)];
  if (existsSync(store)) {
    for (const directory of readdirSync(store)) {
      links.push(join(store, directory, 'node_modules', ...segments));
    }
  }
  const copies = new Set();
  for (const link of links) {
    try {
      if (!lstatSync(link).isSymbolicLink()) continue;
      const real = realpathSync(link);
      const manifest = JSON.parse(readFileSync(join(real, 'package.json'), 'utf8'));
      if (manifest.version === version) copies.add(real);
    } catch {
      // Bağlantı yok ya da okunamıyor: bu dizin paketi çözmüyor.
    }
  }
  return [...copies];
}

/**
 * Pakete özgü gerçek davranış sınaması; gerçek bir Node sürecinde koşar
 * (yığın taşması süreci düşürse bile kapıyı değil sınamayı düşürür).
 * Her istisna kaydının paketi için bir sınama zorunludur.
 */
export const PROBES = {
  braces: `
    const braces = require(process.argv[1]);
    const deep = '{'.repeat(4900) + 'a,b' + '}'.repeat(4900);
    let failure = null;
    try { braces(deep, { expand: true }); } catch (error) { failure = error; }
    if (!failure || failure.name !== 'SyntaxError') {
      console.log('derin desen denetimli hata vermedi: ' + (failure ? failure.name : 'hata yok'));
      process.exit(1);
    }
    const ordinary = braces('{a,b}{c,d}', { expand: true }).join();
    if (ordinary !== 'ac,ad,bc,bd') {
      console.log('olağan desen bozuldu: ' + ordinary);
      process.exit(1);
    }
  `,
};

/** Kurulu kopyada sınamayı koşar; geçerse `null`, düşerse sebep metni. */
export function probeCopy(copy, script) {
  const result = spawnSync(process.execPath, ['-e', script, copy], {
    encoding: 'utf8',
    timeout: 30_000,
  });
  if (result.status === 0) return null;
  const detail = (result.stdout || result.stderr || `çıkış kodu ${result.status}`).trim();
  return `${copy}: ${detail.split('\n')[0]}`;
}

/** Kayıt defterinde yayımlanmış sürümler; ulaşılamazsa `null`. */
function publishedVersions(root, name) {
  const result = spawnSync('pnpm', ['view', name, 'versions', '--json'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 60_000,
  });
  if (result.status !== 0) return null;
  try {
    return [].concat(JSON.parse(result.stdout));
  } catch {
    return null;
  }
}

/** Kaydın kanıt sorunları; boşsa istisna geçerlidir. */
export function proveEntry(root, entry, io = {}) {
  const problems = [];
  const workspace = readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8');
  if (!existsSync(join(root, entry.patch))) {
    problems.push(`yama dosyası yok: ${entry.patch}`);
  }
  const mapped = patchedDependencies(workspace).get(`${entry.package}@${entry.version}`);
  if (mapped !== entry.patch) {
    problems.push(
      `pnpm-workspace.yaml patchedDependencies "${entry.package}@${entry.version}" için ${entry.patch} göstermiyor`,
    );
  }

  const probe = PROBES[entry.package];
  if (!probe) {
    problems.push(`"${entry.package}" için davranış sınaması yok (jsAudit.mjs → PROBES)`);
  } else {
    const copies = (io.installedCopies ?? installedCopies)(root, entry.package, entry.version);
    if (copies.length === 0) {
      problems.push('kurulu kopya bulunamadı (pnpm install?)');
    }
    for (const copy of copies) {
      const failure = (io.probeCopy ?? probeCopy)(copy, probe);
      if (failure) problems.push(`yama etkin değil — ${failure}`);
    }
  }

  const published = (io.publishedVersions ?? publishedVersions)(root, entry.package);
  if (published === null) {
    problems.push('kayıt defterine ulaşılamadı; yayımlanmış düzeltme denetlenemedi');
  } else {
    const newer = newerVersions(published, entry.version);
    if (newer.length > 0) {
      problems.push(
        `daha yeni sürüm yayımlanmış (${newer.join(', ')}): yükselt, ${entry.patch} yamasını ve bu kaydı sil`,
      );
    }
  }
  return problems;
}

function runAudit(root) {
  const result = spawnSync('pnpm', ['audit', '--json', '--audit-level', AUDIT_LEVEL], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: 120_000,
  });
  try {
    return { report: JSON.parse(result.stdout) };
  } catch {
    return { error: (result.stderr || result.stdout || `çıkış kodu ${result.status}`).trim() };
  }
}

export function auditJs(root, log = console.log, io = {}) {
  const policy = loadSecurityPolicy(root);
  log(`[js-security] pnpm audit --audit-level ${AUDIT_LEVEL}`);
  const { report, error } = (io.runAudit ?? runAudit)(root);
  if (!report) {
    log(`[js-security] audit sonucu okunamadı (ağ ya da kayıt defteri?):\n${error}`);
    log(failureMarker('security-js', 1));
    return 1;
  }
  const result = evaluateJsAudit({
    findings: auditFindings(report),
    entries: policy.js,
    prove: (entry) => (io.prove ?? ((candidate) => proveEntry(root, candidate)))(entry),
  });
  for (const entry of result.accepted) {
    log(
      `  kabul: ${entry.package}@${entry.version} ${entry.advisory} — yama etkin (${entry.patch}), ` +
        `düzeltme yayımlanmamış; sahip: ${entry.owner}`,
    );
  }
  if (!result.ok) {
    for (const problem of result.problems) log(`  DÜŞTÜ: ${problem}`);
    log(failureMarker('security-js', result.problems.length));
    return 1;
  }
  log(`[js-security] temiz: ${result.accepted.length} kayıtlı ve kanıtlı istisna, başka bulgu yok`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = auditJs(process.cwd());
}
