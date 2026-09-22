import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { analyzeAudio, type AudioAnalysisReportV1 } from '../../src/analysis/report';
import { renderProgram } from '../../src/program/render';
import { decodeWithFfmpeg } from '../../src/protocol/toolchain';
import { writeOgg } from '../../src/writer';
import { testProgram } from '../protocol/repo';

const PACKAGE = fileURLToPath(new URL('../..', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'qa-parity-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('audio-qa CLI ↔ analyzeAudio kütüphanesi', () => {
  it('aynı kodlanmış fixture için rapor BİREBİR aynı (tek çekirdek)', () => {
    const file = join(dir, 'sfx', 'knock.ogg');
    writeOgg(file, renderProgram(testProgram()));
    const res = spawnSync(
      join(PACKAGE, 'node_modules/.bin/tsx'),
      [join(PACKAGE, 'scripts/audio-qa.ts'), dir, '--json', '--policy'],
      { encoding: 'utf8' },
    );
    expect(res.status).toBe(0);
    const cli = JSON.parse(res.stdout) as {
      analyzerVersion: number;
      measuredFrom: string;
      files: { file: string; assetClass: string; report: AudioAnalysisReportV1 }[];
    };
    const decoded = decodeWithFfmpeg(file);
    const library = analyzeAudio(decoded.channels, decoded.sampleRate, 'decoded-encoded');
    expect(cli.measuredFrom).toBe('decoded-encoded');
    expect(cli.files.map((f) => [f.file, f.assetClass])).toEqual([['sfx/knock.ogg', 'sfx']]);
    expect(cli.files[0].report).toEqual(JSON.parse(JSON.stringify(library)));
    expect(cli.analyzerVersion).toBe(library.analyzerVersion);
  }, 30_000);
});
