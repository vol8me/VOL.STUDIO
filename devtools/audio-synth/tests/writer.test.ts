import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { rmSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { spawnSync, SpawnSyncReturns } from 'node:child_process';
import { writeWav, writeOgg, writeAudio, resetFfmpegCache } from '@volstudio/audio-synth/writer';
import { synth } from '../src/engine';

// `writer.ts`, `@volstudio/core/...` paket specifier'ı üzerinden (pnpm workspace
// self-import) çözülüyor — bu, Vite'ın bağımlılık grafiğinde test dosyasından
// ayrı bir dal. `vi.mock` fabrikası top-level değişkene referans verirse hoisting
// sırasında "before initialization" hatası alınır; `vi.hoisted` bu değişkenleri
// mock ile aynı anda hoist eder. `default` alanı da gerekli — built-in modüllerin
// ESM/CJS interop köprüsü bunu bekliyor, yoksa "no default export" hatası verir.
// Tip parametresi (`typeof spawnSync`) verilmezse `mock.calls` `any` olur ve
// `no-unsafe-*` lint kuralları devreye girer.
const { spawnSyncMock } = vi.hoisted(() => ({
  spawnSyncMock: vi.fn<typeof spawnSync>(),
}));

vi.mock('node:child_process', () => ({
  spawnSync: spawnSyncMock,
  default: { spawnSync: spawnSyncMock },
}));

/** FFmpeg varlık denetimi (`-version`) dışındaki çağrılar: kodlamanın kendisi. */
const encodeCalls = () =>
  spawnSyncMock.mock.calls.filter(([, args]) => !(args ?? []).includes('-version'));

const TEST_DIR = join(tmpdir(), 'vol-synth-test');

// Node'un `spawnSync` aşırı yüklemeleri encoding'e göre string | Buffer döner;
// mock dönüşünü gerçek çağrı şekliyle (encoding verilmez → Buffer) eşlemek için
// tek bir `unknown` köprüsü kullanılır.
function fakeSpawnResult(status: number | null, stderr = ''): ReturnType<typeof spawnSyncMock> {
  const result: SpawnSyncReturns<Buffer> = {
    pid: 1,
    output: [null, Buffer.alloc(0), Buffer.from(stderr)],
    stdout: Buffer.alloc(0),
    stderr: Buffer.from(stderr),
    status,
    signal: null,
    error: undefined,
  };
  return result as unknown as ReturnType<typeof spawnSyncMock>;
}

describe('WAV writer', () => {
  beforeEach(() => {
    if (!existsSync(TEST_DIR)) mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('mono WAV dosyası yazar ve başlık geçerlidir', () => {
    const outPath = join(TEST_DIR, 'test-mono.wav');
    const result = synth(0.05, { wave: 'sine', frequency: 440 });
    writeWav(outPath, result);

    const header = readFileSync(outPath).subarray(0, 44);
    expect(header.toString('ascii', 0, 4)).toBe('RIFF');
    expect(header.toString('ascii', 8, 12)).toBe('WAVE');
    expect(header.toString('ascii', 12, 16)).toBe('fmt ');
    expect(header.readUInt16LE(20)).toBe(1); // PCM
    expect(header.readUInt16LE(22)).toBe(1); // mono
    expect(header.readUInt32LE(24)).toBe(44100);
    expect(header.readUInt16LE(34)).toBe(16); // bits per sample
    expect(header.toString('ascii', 36, 40)).toBe('data');
  });

  it('stereo WAV dosyası yazar', () => {
    const outPath = join(TEST_DIR, 'test-stereo.wav');
    const result = synth(0.05, { wave: 'sine', frequency: 440, pan: -0.5 });
    expect(result.channels).toHaveLength(2);
    writeWav(outPath, result);

    const header = readFileSync(outPath).subarray(0, 44);
    expect(header.readUInt16LE(22)).toBe(2); // stereo
  });

  it('geçersiz sample rate, kanal uzunluğu ve finite olmayan örneği reddeder', () => {
    const result = synth(0.05, { wave: 'sine', frequency: 440 });
    expect(() => writeWav(join(TEST_DIR, 'bad-rate.wav'), { ...result, sampleRate: 0 })).toThrow(
      /örnek oranı/,
    );
    expect(() =>
      writeWav(join(TEST_DIR, 'bad-channels.wav'), {
        ...result,
        channels: [result.channels[0], new Float32Array(1)],
      }),
    ).toThrow(/uzunluğu eşit/);
    const invalid = result.channels[0];
    invalid[0] = Number.NaN;
    expect(() => writeWav(join(TEST_DIR, 'bad-sample.wav'), result)).toThrow(/sonlu olmayan/);
  });
});

describe('OGG writer', () => {
  beforeEach(() => {
    if (!existsSync(TEST_DIR)) mkdirSync(TEST_DIR, { recursive: true });
    // ensureFfmpeg() başarıyı process ömrü boyunca memoize eder (bkz.
    // writer.ts) — sıfırlanmazsa "FFmpeg bulunamadı" testi yalnızca bu describe
    // bloğundaki İLK test olduğu için geçer; test sırası değişirse sessizce
    // yanlış geçmeye başlar.
    resetFfmpegCache();
    // Varsayılan: FFmpeg mevcut ve encode başarılı. Testler yalnızca farklı
    // davranan kısmı `...Once` ile geçersiz kılar — `mockReset` sonrası
    // yeniden kurulum sırasına bağlı kırılganlığı önler.
    spawnSyncMock.mockReturnValue(fakeSpawnResult(0));
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
    spawnSyncMock.mockClear();
  });

  it('FFmpeg bulunamazsa kurulum talimatlı hata fırlatır, spawnSync hiç çağrılmaz', () => {
    spawnSyncMock.mockReturnValueOnce(fakeSpawnResult(null));
    const result = synth(0.05, { wave: 'sine', frequency: 440 });

    expect(() => writeOgg(join(TEST_DIR, 'test.ogg'), result)).toThrow(/FFmpeg bulunamadı/);
    expect(encodeCalls()).toHaveLength(0);
  });

  it('FFmpeg mevcutsa doğru argümanlarla spawnSync çağırır (shell yok, array argüman)', () => {
    const outPath = join(TEST_DIR, 'test.ogg');
    const result = synth(0.05, { wave: 'sine', frequency: 440 });
    writeOgg(outPath, result, { quality: 6 });

    expect(encodeCalls()).toHaveLength(1);
    const call = encodeCalls()[0];
    expect(call?.[0]).toBe('ffmpeg');
    expect(call?.[1]).toEqual(
      expect.arrayContaining([
        '-f',
        'f32le',
        '-ar',
        '44100',
        '-ac',
        '1',
        '-i',
        'pipe:0',
        '-c:a',
        'libvorbis',
        '-q:a',
        '6',
        '-y',
        outPath,
      ]),
    );
    expect(Buffer.isBuffer(call?.[2]?.input)).toBe(true);
  });

  it('geçersiz OGG kalite/gain değerlerini encode etmeden reddeder', () => {
    const result = synth(0.02, { wave: 'sine', frequency: 440 });

    expect(() => writeOgg(join(TEST_DIR, 'bad-quality.ogg'), result, { quality: 11 })).toThrow(
      /kalite/,
    );
    expect(() => writeOgg(join(TEST_DIR, 'bad-gain.ogg'), result, { targetGain: 3 })).toThrow(
      /gain/,
    );
    expect(encodeCalls()).toHaveLength(0);
  });

  it('FFmpeg sıfırdan farklı çıkış koduyla dönerse hata fırlatır', () => {
    // İlk çağrı varlık denetimi (başarılı), ikincisi kodlama (düşer).
    spawnSyncMock
      .mockReturnValueOnce(fakeSpawnResult(0))
      .mockReturnValueOnce(fakeSpawnResult(1, 'boom'));

    const result = synth(0.05, { wave: 'sine', frequency: 440 });
    expect(() => writeOgg(join(TEST_DIR, 'fail.ogg'), result)).toThrow(/encode başarısız/);
  });
});

describe('writeAudio format seçimi', () => {
  beforeEach(() => {
    if (!existsSync(TEST_DIR)) mkdirSync(TEST_DIR, { recursive: true });
    // Bu blok 'OGG writer'dan bağımsız çalışabilsin diye (tek dosya çalıştırma,
    // yeniden sıralama vb.) kendi cache'ini de sıfırlar.
    resetFfmpegCache();
    spawnSyncMock.mockReturnValue(fakeSpawnResult(0));
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
    spawnSyncMock.mockClear();
  });

  it("format 'wav' iken writeWav'a delege eder, FFmpeg tetiklenmez", () => {
    const outPath = join(TEST_DIR, 'delegate.wav');
    const result = synth(0.05, { wave: 'sine', frequency: 440 });
    writeAudio(outPath, result, 'wav');

    expect(existsSync(outPath)).toBe(true);
    expect(encodeCalls()).toHaveLength(0);
  });

  it("format 'ogg' iken writeOgg'a delege eder", () => {
    const outPath = join(TEST_DIR, 'delegate.ogg');
    const result = synth(0.05, { wave: 'sine', frequency: 440 });
    writeAudio(outPath, result, 'ogg');

    expect(spawnSyncMock).toHaveBeenCalled();
  });
});

describe('writeOgg bayt kararlılığı', () => {
  it('FFmpeg BİTEXACT ile çağrılır', () => {
    /*
     * FFmpeg varsayılanda her çağrıda rastgele bir Ogg akış seri numarası
     * üretir ve kodlayıcı sürümünü üstveriye yazar: sentez deterministik
     * olsa da kap her çağrıda farklı baytlar verir.
     *
     * Bedeli pratikti: her yeniden üretim, hiçbir şey değişmese bile bir git
     * farkı üretiyordu ve ses farklarını görmezden gelmeyi öğrenen bir ekip
     * gerçekten değişeni de göremez. Gerçek bir bayatlama tam da böyle
     * gizlenmişti (`first-light.ogg` eski bir reçeteyle üretilmişti).
     *
     * Burada yalnız ARGÜMAN doğrulanır; bayt kararlılığının kendisi
     * `just audio-verify` kapısında gerçek FFmpeg ile ölçülür — bu dosya
     * `spawnSync`i mock'lar ve gerçek kodlayıcıyı hiç çalıştırmaz.
     */
    const result = synth(0.05, { wave: 'sine', frequency: 440 });
    writeOgg(join(TEST_DIR, 'stable.ogg'), result);

    expect(spawnSyncMock.mock.calls[0]?.[1]).toContain('-bitexact');
  });
});
