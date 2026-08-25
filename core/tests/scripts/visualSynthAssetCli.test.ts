import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createVisualPreset, findVisualPresets } from '../../src/visualSynth/catalog';

/**
 * Görsel varlık CLI'ının uçtan uca sözleşmesi.
 *
 * CLI, çekirdeği editörsüz süren ASIL arayüzdür ve uzun süre hiç testi yoktu:
 * bayrak ayrıştırma, çıkış kodu ve JSON rapor biçimi yalnız elle deneniyordu.
 * Testler gerçek süreci çalıştırır — `main()` çağırmak, `process.exit` ve argv
 * ayrıştırma gibi tam da kırılan yerleri atlardı.
 */
const CLI = resolve(import.meta.dirname, '../../scripts/visual-synth-asset.ts');

/** tsx üzerinden gerçek süreç; çıkış kodu ve akışlar birlikte döner. */
function runCli(args: string[]): { status: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync('npx', ['tsx', CLI, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 0, stdout, stderr: '' };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string };
    return {
      status: failure.status ?? 1,
      stdout: failure.stdout ?? '',
      stderr: failure.stderr ?? '',
    };
  }
}

let workspace: string;
let docPath: string;

beforeAll(() => {
  workspace = mkdtempSync(join(tmpdir(), 'vol-visual-synth-cli-'));
  docPath = join(workspace, 'doc.json');
  const [presetId] = findVisualPresets();
  writeFileSync(docPath, JSON.stringify(createVisualPreset(presetId), null, 2));
});

afterAll(() => {
  rmSync(workspace, { recursive: true, force: true });
});

// tsx başlatma maliyeti her çağrıda ~1-2 sn; süre gerçek süreç testinin
// bedelidir, takılma değil. Genel testTimeout ARTIRILMAZ.
const CLI_TIMEOUT_MS = 60_000;

describe('visual-synth-asset CLI', () => {
  it(
    'render belgeyi PNG olarak yazar ve QA raporu basar',
    () => {
      const outPath = join(workspace, 'out.png');
      const result = runCli(['render', docPath, outPath]);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('yazıldı');
      expect(readFileSync(outPath).subarray(1, 4).toString()).toBe('PNG');
    },
    CLI_TIMEOUT_MS,
  );

  it(
    'aynı belge ve tohum ile deterministik aynı baytları üretir',
    () => {
      const first = join(workspace, 'det-1.png');
      const second = join(workspace, 'det-2.png');
      runCli(['render', docPath, first, '--seed', '7']);
      runCli(['render', docPath, second, '--seed', '7']);

      expect(readFileSync(first).equals(readFileSync(second))).toBe(true);
    },
    CLI_TIMEOUT_MS,
  );

  it(
    'validate geçerli belgeyi kabul, bozuk belgeyi sıfırdan farklı kodla reddeder',
    () => {
      const brokenPath = join(workspace, 'broken.json');
      writeFileSync(brokenPath, JSON.stringify({ layers: 'dizi değil' }));

      expect(runCli(['validate', docPath]).status).toBe(0);
      const broken = runCli(['validate', brokenPath]);
      expect(broken.status).not.toBe(0);
      expect(broken.stderr).toContain('sorun');
    },
    CLI_TIMEOUT_MS,
  );

  it(
    'qa render ile aynı bayrakları kabul eder ve piksel özdeşliği doğrular',
    () => {
      // Regresyon: `qa` bir dönem `--size` kabul etmiyordu; `--size` ile
      // üretilmiş PNG belgeyle karşılaştırılamıyor, doğrulayıcı belgeyi doğal
      // boyutunda render edip BÜTÜN pikselleri uyumsuz sayıyordu.
      const scaled = join(workspace, 'scaled.png');
      runCli(['render', docPath, scaled, '--size', '128']);

      const result = runCli(['qa', scaled, '--doc', docPath, '--size', '128', '--json']);
      const report = JSON.parse(result.stdout) as {
        pixelMismatch: number;
        width: number;
        pass: boolean;
      };

      expect(result.status).toBe(0);
      expect(report.pixelMismatch).toBe(0);
      expect(report.width).toBe(128);
      expect(report.pass).toBe(true);
    },
    CLI_TIMEOUT_MS,
  );

  it(
    'boyut uyuşmazlığını ham piksel sayısı yerine açıkça raporlar',
    () => {
      const scaled = join(workspace, 'scaled2.png');
      runCli(['render', docPath, scaled, '--size', '128']);

      const result = runCli(['qa', scaled, '--doc', docPath, '--json']);
      const report = JSON.parse(result.stdout) as {
        dimensionMismatch?: { png: number[]; document: number[] };
        pass: boolean;
      };

      expect(result.status).not.toBe(0);
      expect(report.dimensionMismatch).toEqual({ png: [128, 128], document: [64, 64] });
      expect(report.pass).toBe(false);
    },
    CLI_TIMEOUT_MS,
  );

  it(
    'bilinmeyen bayrağı ve eksik komutu kullanım metniyle reddeder',
    () => {
      const unknownFlag = runCli([
        'render',
        docPath,
        join(workspace, 'x.png'),
        '--bilinmeyen',
        '1',
      ]);
      const noCommand = runCli([]);

      expect(unknownFlag.status).not.toBe(0);
      expect(unknownFlag.stderr).toContain('Kullanım:');
      expect(noCommand.status).not.toBe(0);
      expect(noCommand.stderr).toContain('Kullanım:');
    },
    CLI_TIMEOUT_MS,
  );

  it(
    'palette istek dosyasından rampa üretir',
    () => {
      const requestPath = join(workspace, 'palette.json');
      writeFileSync(
        requestPath,
        JSON.stringify({ generate: [{ base: '#c8502d', steps: 5, name: 'kiremit' }] }),
      );

      const result = runCli(['palette', requestPath]);

      expect(result.status).toBe(0);
      const palette = JSON.parse(result.stdout) as {
        colors: string[];
        ramps: { name?: string; indices: number[] }[];
      };
      expect(palette.colors).toHaveLength(5);
      expect(palette.colors.every((color) => /^#[0-9a-f]{6}$/.test(color))).toBe(true);
      expect(palette.ramps[0]).toMatchObject({ name: 'kiremit', indices: [0, 1, 2, 3, 4] });
    },
    CLI_TIMEOUT_MS,
  );

  it(
    'capabilities motorun gerçek sınırlarını JSON olarak bildirir',
    () => {
      const result = runCli(['capabilities', '--json']);
      const capabilities = JSON.parse(result.stdout) as {
        fieldKinds: string[];
        unsupported: string[];
      };

      expect(result.status).toBe(0);
      expect(capabilities.fieldKinds).toContain('sdf.smoothUnion');
      expect(capabilities.fieldKinds).toContain('sdf.path');
      expect(capabilities.unsupported).toContain('camera3d');
    },
    CLI_TIMEOUT_MS,
  );

  it(
    'benchmark farklı çözünürlüklerde render ve QA sürelerini raporlar',
    () => {
      const result = runCli([
        'benchmark',
        docPath,
        '--sizes',
        '16,24',
        '--iterations',
        '1',
        '--json',
      ]);
      const report = JSON.parse(result.stdout) as {
        rows: { size: number[]; renderMs: number; qaMs: number; pixels: number }[];
      };

      expect(result.status).toBe(0);
      expect(report.rows).toHaveLength(2);
      expect(report.rows[0].size).toEqual([16, 16]);
      expect(report.rows.every((row) => row.renderMs >= 0 && row.qaMs >= 0)).toBe(true);
      expect(report.rows[1].pixels).toBe(24 * 24);
    },
    CLI_TIMEOUT_MS,
  );
});
