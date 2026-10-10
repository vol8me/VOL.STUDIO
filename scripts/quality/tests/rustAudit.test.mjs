import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { rustManifests } from '../rust.mjs';
import { activeCargoLocks, auditRust, evaluateRustAudit, mergeReports } from '../rustAudit.mjs';
import { RUST_EXCEPTION_KINDS, loadSecurityPolicy } from '../securityPolicy.mjs';
import { loadRepoLifecycle } from '../workspaceLifecycle.mjs';

test('güvenlik kapısı yalnız aktif paketlerin kilitlerini denetler', () => {
  const root = mkdtempSync(join(tmpdir(), 'vol-rust-audit-'));
  try {
    execFileSync('git', ['init', '-q', root]);
    for (const path of ['Cargo.lock', 'games/old/src-tauri/Cargo.lock']) {
      mkdirSync(join(root, path, '..'), { recursive: true });
      writeFileSync(join(root, path), '');
    }
    const lifecycle = {
      workspaces: [
        { path: 'core', status: 'active' },
        { path: 'games/old', status: 'frozen' },
      ],
    };
    assert.deepEqual(activeCargoLocks(root, lifecycle), ['Cargo.lock']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('gerçek ağaçta bütün aktif crate’ler kökteki tek kilitle denetlenir', () => {
  const root = resolve(import.meta.dirname, '../../..');
  const lifecycle = loadRepoLifecycle(root);
  assert.ok(lifecycle);
  assert.deepEqual(activeCargoLocks(root, lifecycle), ['Cargo.lock']);
  assert.ok(rustManifests(root, lifecycle).length >= 5);
});

const ENTRY = {
  advisory: 'RUSTSEC-2024-0429',
  crate: 'glib',
  version: '0.18.5',
  kind: 'unsound',
  platforms: ['linux'],
  owner: 'tauri',
};

const warning = (name, version, id, title = 't') => ({
  package: { name, version },
  advisory: id ? { id, title } : null,
});

const reportOf = ({ vulnerabilities = [], warnings = {} } = {}) => ({
  vulnerabilities: { found: vulnerabilities.length > 0, list: vulnerabilities },
  warnings,
});

test('kayıtlı unsound uyarısı geçer; yeni, farklı sürüm ve farklı tür düşer', () => {
  const known = reportOf({ warnings: { unsound: [warning('glib', '0.18.5', ENTRY.advisory)] } });
  const clean = evaluateRustAudit({ report: known, entries: [ENTRY] });
  assert.equal(clean.ok, true);
  assert.deepEqual(clean.accepted, [ENTRY]);

  const fresh = evaluateRustAudit({
    report: reportOf({
      warnings: {
        unsound: [
          warning('glib', '0.18.5', ENTRY.advisory),
          warning('yeni', '1.0.0', 'RUSTSEC-2026-0001'),
        ],
      },
    }),
    entries: [ENTRY],
  });
  assert.equal(fresh.ok, false);
  assert.match(fresh.problems.join('\n'), /yeni unsound riski: yeni@1\.0\.0 RUSTSEC-2026-0001/);

  const bumped = evaluateRustAudit({
    report: reportOf({ warnings: { unsound: [warning('glib', '0.18.6', ENTRY.advisory)] } }),
    entries: [ENTRY],
  });
  assert.equal(bumped.ok, false, 'istisna yalnız kayıtlı sürümü kapsar');
  assert.match(bumped.problems.join('\n'), /yeni unsound riski: glib@0\.18\.6/);
  assert.match(
    bumped.problems.join('\n'),
    /glib@0\.18\.5 RUSTSEC-2024-0429: politikada kayıtlı ama/,
  );

  const otherKind = evaluateRustAudit({
    report: reportOf({ warnings: { unmaintained: [warning('glib', '0.18.5', ENTRY.advisory)] } }),
    entries: [ENTRY],
  });
  assert.equal(otherKind.ok, false, 'tür de eşleşmek zorundadır');
});

test('zafiyet ve yanked hiçbir kayıtla geçmez; tanımsız uyarı türü de geçmez', () => {
  const vulnerable = evaluateRustAudit({
    report: reportOf({
      vulnerabilities: [
        {
          package: { name: 'tehlikeli', version: '1.0.0' },
          advisory: { id: 'RUSTSEC-2026-0002', title: 'rce' },
        },
      ],
    }),
    entries: [{ ...ENTRY, advisory: 'RUSTSEC-2026-0002', crate: 'tehlikeli', version: '1.0.0' }],
  });
  assert.equal(vulnerable.ok, false);
  assert.match(
    vulnerable.problems[0],
    /zafiyet: tehlikeli@1\.0\.0 RUSTSEC-2026-0002 — rce.*istisna verilmez/,
  );

  const yanked = evaluateRustAudit({
    report: reportOf({ warnings: { yanked: [warning('yoke-derive', '0.8.3')] } }),
    entries: [],
  });
  assert.equal(yanked.ok, false);
  assert.match(yanked.problems[0], /yanked: yoke-derive@0\.8\.3.*cargo update -p yoke-derive/);

  const notice = evaluateRustAudit({
    report: reportOf({ warnings: { notice: [warning('x', '1.0.0', 'RUSTSEC-2026-0003')] } }),
    entries: [],
  });
  assert.match(notice.problems[0], /notice: x@1\.0\.0 RUSTSEC-2026-0003.*istisna vermez/);
});

test('bayat kayıt: cargo-audit artık bulmuyorsa politika temizlenmek zorundadır', () => {
  const stale = evaluateRustAudit({ report: reportOf(), entries: [ENTRY] });
  assert.equal(stale.ok, false);
  assert.match(stale.problems[0], /glib@0\.18\.5 RUSTSEC-2024-0429.*artık bu sürümde bulmuyor/);
  assert.equal(evaluateRustAudit({ report: reportOf(), entries: [] }).ok, true);
});

test('birden çok kilidin raporu tek rapora toplanır', () => {
  const merged = mergeReports([
    reportOf({ warnings: { unsound: [warning('a', '1.0.0', 'RUSTSEC-2026-0004')] } }),
    reportOf({
      vulnerabilities: [
        { package: { name: 'b', version: '1.0.0' }, advisory: { id: 'RUSTSEC-2026-0005' } },
      ],
      warnings: {
        unsound: [warning('c', '1.0.0', 'RUSTSEC-2026-0006')],
        yanked: [warning('d', '1.0.0')],
      },
    }),
  ]);
  assert.equal(merged.vulnerabilities.list.length, 1);
  assert.deepEqual(
    merged.warnings.unsound.map((item) => item.package.name),
    ['a', 'c'],
  );
  assert.equal(merged.warnings.yanked.length, 1);
  assert.deepEqual(mergeReports([]), { vulnerabilities: { list: [] }, warnings: {} });
});

test('gerçek cargo-audit rapor biçimi okunur', () => {
  // `cargo audit --json` çıktısının kullanılan alanları: warnings.<tür>[].package/advisory.
  const real = {
    vulnerabilities: { found: false, count: 0, list: [] },
    warnings: {
      unsound: [
        {
          kind: 'unsound',
          package: {
            name: 'glib',
            version: '0.18.5',
            source: 'registry+https://github.com/rust-lang/crates.io-index',
          },
          advisory: {
            id: 'RUSTSEC-2024-0429',
            package: 'glib',
            title: 'Unsoundness in `Iterator` impls',
          },
          versions: { patched: ['>=0.20.0'], unaffected: ['<0.15.0'] },
        },
      ],
    },
  };
  assert.equal(evaluateRustAudit({ report: real, entries: [ENTRY] }).ok, true);
});

test('gerçek politikadaki her Rust kaydı doğrulayıcıdan geçer ve istisna alabilen türdedir', () => {
  const policy = loadSecurityPolicy(resolve(import.meta.dirname, '../../..'));
  for (const entry of policy.rust) {
    assert.ok(RUST_EXCEPTION_KINDS.includes(entry.kind), `${entry.crate}: ${entry.kind}`);
  }
});

test('auditRust: kayıtlı risk geçer, okunamayan çıktı ve yeni risk düşer', () => {
  const root = resolve(import.meta.dirname, '../../..');
  const lines = [];
  const log = (text) => lines.push(text);
  const policy = loadSecurityPolicy(root);
  const known = {
    unmaintained: policy.rust
      .filter((entry) => entry.kind === 'unmaintained')
      .map((entry) => warning(entry.crate, entry.version, entry.advisory)),
    unsound: policy.rust
      .filter((entry) => entry.kind === 'unsound')
      .map((entry) => warning(entry.crate, entry.version, entry.advisory)),
  };

  assert.equal(
    auditRust(root, log, { auditLock: () => ({ report: reportOf({ warnings: known }) }) }),
    0,
  );
  assert.match(lines.join('\n'), /temiz: zafiyet yok, 8 kayıtlı ve gerekçeli risk/);

  lines.length = 0;
  const withNew = {
    ...known,
    unmaintained: [...known.unmaintained, warning('yeni', '1.0.0', 'RUSTSEC-2026-0001')],
  };
  assert.equal(
    auditRust(root, log, { auditLock: () => ({ report: reportOf({ warnings: withNew }) }) }),
    1,
  );
  assert.match(lines.join('\n'), /DÜŞTÜ: yeni unmaintained riski: yeni@1\.0\.0/);
  assert.match(lines.join('\n'), /##quality:\{"kind":"security-rust","count":1\}/);

  lines.length = 0;
  assert.equal(auditRust(root, log, { auditLock: () => ({ error: 'cargo-audit yok' }) }), 1);
  assert.match(lines.join('\n'), /sonucu okunamadı:\ncargo-audit yok/);
});
