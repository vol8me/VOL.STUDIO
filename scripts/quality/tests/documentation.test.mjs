import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { validateDocumentationConfig } from '../documentationConfig.mjs';
import { measureMarkdown, validateDocumentation } from '../documentation.mjs';

const budgets = {
  rootReadme: { lines: 100, words: 800 },
  packageReadme: { lines: 80, words: 600 },
  hub: { lines: 40, words: 250 },
  rootAgent: { lines: 120, words: 1000 },
  pencilAgent: { lines: 80, words: 650 },
  toolAgent: { lines: 40, words: 250 },
};
const config = () => ({
  budgets: structuredClone(budgets),
  paths: [
    { path: 'README.md', role: 'rootReadme' },
    { path: 'AGENTS.md', role: 'rootAgent' },
  ],
  exceptions: [],
});

function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), 'vol-docs-'));
  const files = [];
  const write = (path, text) => {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), text);
    if (path.endsWith('.md') && !files.includes(path)) files.push(path);
  };
  write('package.json', JSON.stringify({ scripts: { dev: 'node dev.mjs' } }));
  write('justfile', 'test:\n');
  write('docs/detail.md', '# Ayrıntı\n\n## Türkçe başlık\n\nAçıklama.\n');
  write(
    'README.md',
    '# Proje\n\nOrtak mekanizmalar ve geliştirici araçları sunan bir çalışma alanıdır.\n\n`pnpm dev`\n\n[Ayrıntı](docs/detail.md#türkçe-başlık)\n',
  );
  write(
    'AGENTS.md',
    '# Sözleşme\n\nKaynak gerçeğini ölç ve değişen davranış için doğrulamayı tamamla.\n\n[Ayrıntı](docs/detail.md)\n',
  );
  const check = (policy = config(), lifecycle = { workspaces: [] }) =>
    validateDocumentation(root, policy, lifecycle, files);
  try {
    run({ write, check, files, root });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('belge şeması yalnız bilinen roller, kanonik yollar ve bütçeler kabul eder', () => {
  assert.deepEqual(validateDocumentationConfig(config()), []);
  for (const mutate of [
    (c) => {
      c.unknown = true;
    },
    (c) => {
      c.paths[0].role = 'anything';
    },
    (c) => {
      c.paths[0].path = '../README.md';
    },
    (c) => {
      c.paths[0].path = 'docs\\README.md';
    },
    (c) => {
      c.paths.push(c.paths[0]);
    },
    (c) => {
      c.exceptions = [
        {
          path: 'README.md',
          role: 'rootReadme',
          lines: 101,
          words: 801,
          reason: 'Uzun komut örneği gerekiyor.',
        },
        {
          path: 'README.md',
          role: 'rootReadme',
          lines: 102,
          words: 802,
          reason: 'Aynı kaydın ikinci örneği.',
        },
      ];
    },
    (c) => {
      c.budgets.hub.words = 0;
    },
    (c) => {
      c.exceptions.push({
        path: 'README.md',
        role: 'rootReadme',
        lines: 101,
        words: 801,
        reason: '',
      });
    },
    (c) => {
      c.exceptions.push({
        path: 'README.md',
        role: 'reference',
        lines: 101,
        words: 801,
        reason: 'Gerekçe',
      });
    },
  ]) {
    const broken = config();
    mutate(broken);
    assert.ok(validateDocumentationConfig(broken).length > 0);
  }
});

test('satır ve sözcük ayrı ölçülür; tek uzun satır boyut kapısını atlatmaz', () => {
  assert.deepEqual(measureMarkdown('bir iki\nüç\n'), { lines: 2, words: 3 });
  fixture(({ write, check }) => {
    write(
      'README.md',
      `# Proje\n\n${'sözcük '.repeat(801)}\n\n\`pnpm dev\`\n\n[Ayrıntı](docs/detail.md)\n`,
    );
    assert.ok(check().some((p) => p.includes('800 sözcük')));
    write(
      'README.md',
      '# Proje\n\nOrtak mekanizmalar ve geliştirici araçları sunan bir çalışma alanıdır.\n\n`pnpm dev`\n\n[Ayrıntı](docs/detail.md)\n' +
        '\n'.repeat(101),
    );
    assert.ok(check().some((p) => p.includes('100 satır')));
  });
});

test('aktif paket README keşfi lifecycle kaynaklıdır; frozen paket dışarıdadır', () => {
  fixture(({ write, check }) => {
    const lifecycle = {
      workspaces: [
        { packageName: '@vol/a', path: 'packages/a', status: 'active' },
        { packageName: '@vol/b', path: 'packages/b', status: 'frozen' },
      ],
    };
    assert.ok(check(config(), lifecycle).some((p) => p.includes('packages/a/README.md')));
    write(
      'packages/a/package.json',
      JSON.stringify({ name: '@vol/a', scripts: { test: 'node test.mjs' } }),
    );
    write(
      'packages/a/README.md',
      '# Paket\n\nBu paket ortak bir çalışma zamanı mekanizması sağlar.\n\n`pnpm --filter @vol/a test`\n\n[Ayrıntı](../../docs/detail.md)\n',
    );
    assert.deepEqual(check(config(), lifecycle), []);
  });
});

test('giriş belgesi gerçek amaç, çalıştırılabilir komut ve ayrıntı yönü ister', () => {
  fixture(({ write, check }) => {
    write('README.md', '# Amaç\n\n## Çalıştırma\n\n`pnpm imaginary`\n\n## Ayrıntı\n');
    const problems = check();
    assert.ok(problems.some((p) => p.includes('amaç')));
    assert.ok(problems.some((p) => p.includes('komut')));
    assert.ok(problems.some((p) => p.includes('ayrıntı')));
  });
});

test('yerel bağlantı, başlık, yinelenen başlık ve kaynak satır sınırı doğrulanır', () => {
  fixture(({ write, check }) => {
    write('src/example.ts', 'export const x = 1;\n');
    write(
      'docs/detail.md',
      '# Ayrıntı\n\n## Aynı\n\n## Aynı\n\n[İkinci](#aynı-1) [Kaynak](../src/example.ts#L1)\n',
    );
    write(
      'README.md',
      '# Proje\n\nOrtak mekanizmalar ve geliştirici araçları sunan bir çalışma alanıdır.\n\n`pnpm dev`\n\n[Ayrıntı](docs/detail.md#aynı-1)\n',
    );
    assert.deepEqual(check(), []);
    write(
      'docs/detail.md',
      '# Ayrıntı\n\n[Yok](missing.md) [Başlık](#missing) [Satır](../src/example.ts#L2)\n',
    );
    const problems = check();
    assert.ok(problems.some((p) => p.includes('missing.md')));
    assert.ok(problems.some((p) => p.includes('#missing')));
    assert.ok(problems.some((p) => p.includes('#L2')));
  });
});

test('istisna boyut aşımını gerekçesiyle sınırlar; bayat veya yanlış rol kayıt geçmez', () => {
  fixture(({ write, check }) => {
    const policy = config();
    policy.exceptions.push({
      path: 'README.md',
      role: 'rootReadme',
      lines: 101,
      words: 850,
      reason: 'Geçişte gereken ek çalışma komutu.',
    });
    assert.ok(check(policy).some((p) => p.includes('bayat')));
    write(
      'README.md',
      `# Proje\n\n${'sözcük '.repeat(801)}\n\n\`pnpm dev\`\n\n[Ayrıntı](docs/detail.md)\n`,
    );
    assert.deepEqual(check(policy), []);
    policy.exceptions[0].role = 'packageReadme';
    assert.ok(check(policy).some((p) => p.includes('rol')));
    policy.exceptions[0].path = 'docs/missing.md';
    assert.ok(check(policy).some((p) => p.includes('docs/missing.md') && p.includes('bayat')));
  });
});

test('başvuru, lisans ve üretilmiş Markdown genel boyut muafiyeti gerektirmez', () => {
  fixture(({ write, check }) => {
    write('docs/reference.md', `# Başvuru\n\n${'ayrıntı '.repeat(1001)}\n`);
    const policy = config();
    policy.paths.push({ path: 'docs/reference.md', role: 'reference' });
    assert.deepEqual(check(policy), []);
    policy.paths.push({ path: 'docs/missing.md', role: 'generated' });
    assert.ok(check(policy).some((p) => p.includes('docs/missing.md')));
  });
});

test('agent ve hub dosyası farklı rolle boyut kapısını aşamaz', () => {
  fixture(({ write, check }) => {
    write(
      'CLAUDE.md',
      '# Araç\n\nBu araç proje talimatlarını kaynak sözleşmesinden okuyarak çalışır.\n\n[Ayrıntı](AGENTS.md)\n',
    );
    write(
      'docs/ui/README.md',
      '# UI belgeleri\n\nBu dizin arayüz kurallarını ve doğrulama rehberlerini bir araya getirir.\n\n[Kurallar](../detail.md) [Rehber](../../AGENTS.md)\n',
    );
    const policy = config();
    policy.paths.push({ path: 'CLAUDE.md', role: 'reference' });
    policy.paths.push({ path: 'docs/ui/README.md', role: 'legal' });
    const problems = check(policy);
    assert.ok(problems.some((p) => p.includes('CLAUDE.md') && p.includes('toolAgent')));
    assert.ok(problems.some((p) => p.includes('docs/ui/README.md') && p.includes('hub')));
  });
});

test('bağlantı fixture kodu gerçek başvuru sayılmaz; kaçış ve depo dışı hedef reddedilir', () => {
  fixture(({ write, check }) => {
    write(
      'docs/detail.md',
      '# Ayrıntı\n\n```md\n[Yok](missing.md)\n```\n\n[Yok](%ZZ.md) [Dışarı](../../outside.md)\n',
    );
    const problems = check();
    assert.equal(
      problems.some((p) => p.includes('missing.md')),
      false,
    );
    assert.ok(problems.some((p) => p.includes('geçersiz URL')));
    assert.ok(problems.some((p) => p.includes('depo dışına')));
  });
});

test('belge politikası üretim contract akışında zorunludur', () => {
  assert.ok(validateDocumentation('.', undefined, { workspaces: [] }, []).length > 0);
});

test('geçerli komutun yanına eklenen sahte komut bütün aktif belgelerde reddedilir', () => {
  fixture(({ write, check }) => {
    write('docs/detail.md', '# Ayrıntı\n\n`pnpm dev` ve `pnpm totally-made-up`\n');
    const problems = check();
    assert.ok(problems.some((p) => p.includes('docs/detail.md') && p.includes('totally-made-up')));
  });
});

test('paket komutu yanlış pakette var olduğu için kabul edilmez', () => {
  fixture(({ write, check }) => {
    write('docs/detail.md', '# Ayrıntı\n\n`pnpm --filter @vol/a missing`\n');
    write('packages/a/package.json', JSON.stringify({ scripts: { test: 'node test.mjs' } }));
    const lifecycle = {
      workspaces: [{ packageName: '@vol/a', path: 'packages/a', status: 'active' }],
    };
    assert.ok(check(config(), lifecycle).some((p) => p.includes('@vol/a missing')));
  });
});
