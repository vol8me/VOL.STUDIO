import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import {
  PROBES,
  auditFindings,
  auditJs,
  evaluateJsAudit,
  installedCopies,
  newerVersions,
  patchedDependencies,
  probeCopy,
  proveEntry,
} from '../jsAudit.mjs';
import { loadSecurityPolicy } from '../securityPolicy.mjs';

const ROOT = resolve(import.meta.dirname, '../../..');

const ENTRY = {
  advisory: 'GHSA-vfj7-8cjw-p6xm',
  package: 'braces',
  version: '3.0.3',
  patch: 'patches/braces@3.0.3.patch',
  owner: 'upstream',
};

const advisory = (overrides = {}) => ({
  id: 1,
  github_advisory_id: 'GHSA-vfj7-8cjw-p6xm',
  module_name: 'braces',
  severity: 'high',
  title: 'stack exhaustion',
  findings: [{ version: '3.0.3', paths: ['.>stylelint>braces'] }],
  ...overrides,
});

const finding = (overrides = {}) => ({
  advisory: 'GHSA-vfj7-8cjw-p6xm',
  package: 'braces',
  version: '3.0.3',
  severity: 'high',
  title: 'stack exhaustion',
  ...overrides,
});

test('audit çıktısı advisory × sürüm bulgularına düzleşir ve seviye altı atılır', () => {
  const report = {
    advisories: {
      1: advisory({ findings: [{ version: '3.0.3' }, { version: '3.0.3' }, { version: '2.3.0' }] }),
      2: advisory({ id: 2, github_advisory_id: 'GHSA-aaaa-bbbb-cccc', severity: 'low' }),
    },
  };
  assert.deepEqual(
    auditFindings(report).map((item) => `${item.package}@${item.version}`),
    ['braces@3.0.3', 'braces@2.3.0'],
    'yinelenen sürüm teke iner, düşük seviye atılır',
  );
  assert.equal(auditFindings(report, 'low').length, 3);
  assert.deepEqual(auditFindings({}), []);
});

test('kayıtsız bulgu, kanıtsız kayıt ve bayat kayıt kapıyı düşürür', () => {
  const proven = () => [];
  const clean = evaluateJsAudit({ findings: [finding()], entries: [ENTRY], prove: proven });
  assert.equal(clean.ok, true);
  assert.deepEqual(clean.accepted, [ENTRY]);

  const unknown = evaluateJsAudit({
    findings: [finding({ advisory: 'GHSA-xxxx-xxxx-xxxx', package: 'other' })],
    entries: [],
    prove: proven,
  });
  assert.equal(unknown.ok, false);
  assert.match(unknown.problems[0], /politikada kayıt yok/);

  const otherVersion = evaluateJsAudit({
    findings: [finding({ version: '3.0.2' })],
    entries: [ENTRY],
    prove: proven,
  });
  assert.equal(otherVersion.ok, false, 'istisna yalnız kayıtlı sürüm için geçerlidir');
  assert.match(otherVersion.problems.join('\n'), /braces@3\.0\.2.*kayıt yok/);

  const unproven = evaluateJsAudit({
    findings: [finding()],
    entries: [ENTRY],
    prove: () => ['yama etkin değil'],
  });
  assert.equal(unproven.ok, false);
  assert.match(unproven.problems[0], /braces@3\.0\.3 GHSA-vfj7-8cjw-p6xm: yama etkin değil/);

  const stale = evaluateJsAudit({ findings: [], entries: [ENTRY], prove: proven });
  assert.equal(stale.ok, false);
  assert.match(stale.problems[0], /audit artık bulmuyor.*patches\/braces@3\.0\.3\.patch/);
});

test('patchedDependencies okunur: tırnaklı kapsamlı ad, bloğun sonu, yokluk', () => {
  const text = [
    'packages:',
    "  - 'core'",
    'patchedDependencies:',
    '  braces@3.0.3: patches/braces@3.0.3.patch',
    "  '@scope/pkg@1.0.0': 'patches/scope.patch'",
    '  "other@2.0.0": "patches/other.patch"',
    'allowBuilds:',
    '  esbuild: true',
  ].join('\n');
  assert.deepEqual(
    [...patchedDependencies(text)],
    [
      ['braces@3.0.3', 'patches/braces@3.0.3.patch'],
      ['@scope/pkg@1.0.0', 'patches/scope.patch'],
      ['other@2.0.0', 'patches/other.patch'],
    ],
  );
  assert.equal(patchedDependencies('packages:\n  - core\n').size, 0);
  assert.equal(patchedDependencies(text.replaceAll('\n', '\r\n')).size, 3, 'CRLF de okunur');
});

test('daha yeni sürüm yalnız kararlı ve büyük olanlardır', () => {
  assert.deepEqual(
    newerVersions(['3.0.2', '3.0.3', '3.0.10', '3.1.0', '4.0.0-alpha.1', '2.3.2'], '3.0.3'),
    ['3.0.10', '3.1.0'],
  );
  assert.deepEqual(newerVersions(['3.0.3', '3.0.1'], '3.0.3'), []);
});

function fakeRoot({ patch = true, mapping = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'vol-js-audit-'));
  if (patch) {
    mkdirSync(join(root, 'patches'), { recursive: true });
    writeFileSync(join(root, ENTRY.patch), 'diff');
  }
  writeFileSync(
    join(root, 'pnpm-workspace.yaml'),
    mapping ? `patchedDependencies:\n  braces@3.0.3: ${ENTRY.patch}\n` : 'packages:\n  - core\n',
  );
  return root;
}

const goodIo = {
  installedCopies: () => ['C:/copy'],
  probeCopy: () => null,
  publishedVersions: () => ['3.0.2', '3.0.3'],
};

test('kanıt: yama, eşleme, kurulu kopya ve yayımlanmış düzeltme tek tek denetlenir', () => {
  const dirs = [];
  const root = (options) => {
    const made = fakeRoot(options);
    dirs.push(made);
    return made;
  };
  try {
    assert.deepEqual(proveEntry(root(), ENTRY, goodIo), []);
    assert.match(proveEntry(root({ patch: false }), ENTRY, goodIo).join('\n'), /yama dosyası yok/);
    assert.match(
      proveEntry(root({ mapping: false }), ENTRY, goodIo).join('\n'),
      /patchedDependencies "braces@3\.0\.3" için patches\/braces@3\.0\.3\.patch göstermiyor/,
    );
    assert.match(
      proveEntry(root(), ENTRY, { ...goodIo, installedCopies: () => [] }).join('\n'),
      /kurulu kopya bulunamadı/,
    );
    assert.match(
      proveEntry(root(), ENTRY, { ...goodIo, probeCopy: () => 'C:/copy: RangeError' }).join('\n'),
      /yama etkin değil — C:\/copy: RangeError/,
    );
    assert.match(
      proveEntry(root(), ENTRY, { ...goodIo, publishedVersions: () => null }).join('\n'),
      /kayıt defterine ulaşılamadı/,
    );
    assert.match(
      proveEntry(root(), ENTRY, {
        ...goodIo,
        publishedVersions: () => ['3.0.3', '3.0.4'],
      }).join('\n'),
      /daha yeni sürüm yayımlanmış \(3\.0\.4\).*yamasını ve bu kaydı sil/,
    );
    assert.match(
      proveEntry(root(), { ...ENTRY, package: 'tanimsiz' }, goodIo).join('\n'),
      /"tanimsiz" için davranış sınaması yok/,
    );
  } finally {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  }
});

function fixturePackage(source) {
  const dir = mkdtempSync(join(tmpdir(), 'vol-braces-probe-'));
  writeFileSync(join(dir, 'index.js'), source);
  return dir;
}

const ORDINARY = `(pattern) => (pattern === '{a,b}{c,d}' ? ['ac', 'ad', 'bc', 'bd'] : null)`;

test('braces sınaması gerçek süreçte yamalıyı geçirir, yamasızı ve bozuğu düşürür', () => {
  const guarded = fixturePackage(
    `const ordinary = ${ORDINARY};
     module.exports = (pattern) => {
       if (pattern.length > 100) throw new SyntaxError('Maximum nesting depth exceeded (100)');
       return ordinary(pattern);
     };`,
  );
  const unguarded = fixturePackage(
    `const ordinary = ${ORDINARY};
     module.exports = (pattern) => {
       if (pattern.length > 100) throw new RangeError('Maximum call stack size exceeded');
       return ordinary(pattern);
     };`,
  );
  const silent = fixturePackage(`module.exports = () => ['x'];`);
  const broken = fixturePackage(
    `module.exports = (pattern) => {
       if (pattern.length > 100) throw new SyntaxError('depth');
       return [];
     };`,
  );
  try {
    assert.equal(probeCopy(guarded, PROBES.braces), null);
    assert.match(probeCopy(unguarded, PROBES.braces), /denetimli hata vermedi: RangeError/);
    assert.match(probeCopy(silent, PROBES.braces), /denetimli hata vermedi: hata yok/);
    assert.match(probeCopy(broken, PROBES.braces), /olağan desen bozuldu/);
  } finally {
    for (const dir of [guarded, unguarded, silent, broken]) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test('kurulu kopya yalnız bağımlının çözdüğü bağlantılardan bulunur', () => {
  const root = mkdtempSync(join(tmpdir(), 'vol-installed-'));
  try {
    const store = join(root, 'node_modules/.pnpm');
    const copy = (directory, version) => {
      const target = join(store, directory, 'node_modules/braces');
      mkdirSync(target, { recursive: true });
      writeFileSync(join(target, 'package.json'), JSON.stringify({ version }));
      return target;
    };
    const patched = copy('braces@3.0.3_patch_hash=x', '3.0.3');
    copy('braces@3.0.3', '3.0.3');
    const old = copy('braces@2.3.0', '2.3.0');
    const link = (dependent, target) => {
      const path = join(store, dependent, 'node_modules/braces');
      mkdirSync(dirname(path), { recursive: true });
      symlinkSync(target, path, 'junction');
    };
    link('micromatch@4.0.8', patched);
    link('legacy@1.0.0', old);

    assert.deepEqual(installedCopies(root, 'braces', '3.0.3'), [realpathSync(patched)]);
    assert.deepEqual(installedCopies(root, 'braces', '2.3.0'), [realpathSync(old)]);
    assert.deepEqual(installedCopies(root, 'braces', '9.9.9'), []);
    assert.deepEqual(installedCopies(root, 'yok-paket', '3.0.3'), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('gerçek ağaçta yamalı kopya kurulu ve gerçek sınamayı geçer', () => {
  const copies = installedCopies(ROOT, 'braces', '3.0.3');
  assert.ok(copies.length >= 1, 'stylelint zinciri braces 3.0.3 çözüyor olmalı');
  for (const copy of copies) {
    assert.equal(probeCopy(copy, PROBES.braces), null, copy);
  }
});

test('her yama bir politika kaydına bağlıdır ve her kaydın sınaması vardır', () => {
  const policy = loadSecurityPolicy(ROOT);
  const mapping = patchedDependencies(readFileSync(join(ROOT, 'pnpm-workspace.yaml'), 'utf8'));
  const patchFiles = readdirSync(join(ROOT, 'patches')).map((name) => `patches/${name}`);

  for (const [key, patch] of mapping) {
    const entry = policy.js.find((item) => `${item.package}@${item.version}` === key);
    assert.ok(entry, `${key}: yama var ama securityPolicy.json kaydı yok`);
    assert.equal(entry.patch, patch, `${key}: kayıt başka yamayı gösteriyor`);
  }
  for (const entry of policy.js) {
    assert.ok(entry.package in PROBES, `${entry.package}: davranış sınaması yok`);
    assert.ok(
      mapping.has(`${entry.package}@${entry.version}`),
      `${entry.package}: yama bağlı değil`,
    );
  }
  for (const patch of patchFiles) {
    assert.ok(
      policy.js.some((entry) => entry.patch === patch),
      `${patch}: hiçbir politika kaydına bağlı değil`,
    );
  }
});

test('auditJs: kayıtlı kanıtlı bulgu geçer; kayıtsız ya da okunamayan sonuç düşer', () => {
  const lines = [];
  const log = (text) => lines.push(text);
  const entry = loadSecurityPolicy(ROOT).js[0];
  const registered = advisory({
    github_advisory_id: entry.advisory,
    module_name: entry.package,
    findings: [{ version: entry.version }],
  });
  const reportOf = (...items) => ({
    report: { advisories: Object.fromEntries(items.map((item, index) => [index, item])) },
  });
  const proven = () => [];

  assert.equal(auditJs(ROOT, log, { runAudit: () => reportOf(registered), prove: proven }), 0);
  assert.match(lines.join('\n'), /kabul: braces@3\.0\.3 GHSA-vfj7-8cjw-p6xm/);
  assert.match(lines.join('\n'), /temiz: 1 kayıtlı ve kanıtlı istisna/);

  lines.length = 0;
  const unknown = advisory({
    id: 9,
    github_advisory_id: 'GHSA-xxxx-xxxx-xxxx',
    module_name: 'baska',
  });
  assert.equal(
    auditJs(ROOT, log, { runAudit: () => reportOf(registered, unknown), prove: proven }),
    1,
  );
  assert.match(lines.join('\n'), /DÜŞTÜ: baska@3\.0\.3 GHSA-xxxx-xxxx-xxxx/);
  assert.match(lines.join('\n'), /##quality:\{"kind":"security-js","count":1\}/);

  lines.length = 0;
  assert.equal(
    auditJs(ROOT, log, { runAudit: () => ({ error: 'ENOTFOUND registry' }), prove: proven }),
    1,
  );
  assert.match(lines.join('\n'), /audit sonucu okunamadı[\s\S]*ENOTFOUND registry/);
  assert.match(lines.join('\n'), /##quality:\{"kind":"security-js","count":1\}/);
});
