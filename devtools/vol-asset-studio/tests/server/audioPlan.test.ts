import { describe, expect, it } from 'vitest';
import { buildFfmpegArgs, compileAudioDocument, compileAudioPlan } from '../../server/audioPlan.js';
import type { AudioEditOperation, VolAudioDocumentV1 } from '../../shared/audio.js';

const CONTEXT = { sampleRate: 48_000, channelCount: 2, frameCount: 480_000 };

function compile(operations: AudioEditOperation[]) {
  return compileAudioPlan(operations, CONTEXT);
}

describe('compileAudioPlan', () => {
  it('boş tarif filtresiz plan verir', () => {
    const plan = compile([]);

    expect(plan.filters).toEqual([]);
    expect(plan.frameCount).toBe(480_000);
  });

  it('trim ÖRNEK cinsinden çalışır ve süreyi kısaltır', () => {
    const plan = compile([{ kind: 'trim', startFrame: 1000, endFrame: 5000 }]);

    // Saniyeye çevirmek yuvarlama hatasıyla sınırı kaydırıp tık üretirdi.
    expect(plan.filters[0]).toBe('atrim=start_sample=1000:end_sample=5000');
    expect(plan.frameCount).toBe(4000);
  });

  it('ters trim aralığını reddeder', () => {
    expect(() => compile([{ kind: 'trim', startFrame: 500, endFrame: 100 }])).toThrow();
  });

  it('gain dB olarak yazılır', () => {
    expect(compile([{ kind: 'gain', decibels: -6 }]).filters[0]).toBe('volume=-6dB');
  });

  it('aşırı gain reddedilir', () => {
    expect(() => compile([{ kind: 'gain', decibels: 200 }])).toThrow();
  });

  it('fade eğrisi ve örnek sınırları taşınır', () => {
    const plan = compile([
      { kind: 'fadeIn', startFrame: 0, durationFrames: 4800, curve: 'exponential' },
      { kind: 'fadeOut', startFrame: 470_000, durationFrames: 4800 },
    ]);

    expect(plan.filters[0]).toBe('afade=t=in:start_sample=0:nb_samples=4800:curve=exp');
    expect(plan.filters[1]).toContain('t=out');
    expect(plan.filters[1]).toContain('curve=tri');
  });

  it('sıfır uzunlukta fade reddedilir', () => {
    expect(() => compile([{ kind: 'fadeIn', startFrame: 0, durationFrames: 0 }])).toThrow();
  });

  it('peak ve LUFS normalize farklı filtre üretir', () => {
    expect(compile([{ kind: 'normalize', mode: 'peak', target: -1 }]).filters[0]).toContain(
      'alimiter',
    );
    expect(compile([{ kind: 'normalize', mode: 'lufs', target: -16 }]).filters[0]).toContain(
      'loudnorm=I=-16',
    );
  });

  it('kanal dönüşümü ve takas', () => {
    const plan = compile([{ kind: 'channels', target: 2, swap: true }]);

    expect(plan.filters[0]).toBe('pan=stereo|c0=c1|c1=c0');
    expect(plan.filters[1]).toContain('stereo');
    expect(plan.channelCount).toBe(2);
  });

  it('monoya indirgeme kanal sayısını günceller', () => {
    expect(compile([{ kind: 'channels', target: 1 }]).channelCount).toBe(1);
  });

  it('resample frame sayısını ve sample-rate-i günceller', () => {
    const plan = compile([{ kind: 'resample', sampleRate: 24_000 }]);

    expect(plan.sampleRate).toBe(24_000);
    expect(plan.frameCount).toBe(240_000);
    expect(plan.filters[0]).toContain('aresample=24000');
  });

  it('geçersiz sample-rate reddedilir', () => {
    expect(() => compile([{ kind: 'resample', sampleRate: 10 }])).toThrow();
  });

  it('filtre ve EQ parametreleri aralıkla sınırlanır', () => {
    expect(compile([{ kind: 'highpass', frequency: 80 }]).filters[0]).toBe('highpass=f=80');
    expect(() => compile([{ kind: 'eq', frequency: 1000, gainDb: 100, q: 1 }])).toThrow();
  });

  it('compressor ve limiter varsayılanlarla derlenir', () => {
    const plan = compile([
      { kind: 'compressor', thresholdDb: -18 },
      { kind: 'limiter', thresholdDb: -1 },
    ]);

    expect(plan.filters[0]).toContain('acompressor=threshold=');
    expect(plan.filters[1]).toContain('alimiter=limit=');
  });

  it('DETERMİNİSTİK: aynı tarif her zaman aynı filtreyi üretir', () => {
    const operations: AudioEditOperation[] = [
      { kind: 'trim', startFrame: 10, endFrame: 1000 },
      { kind: 'gain', decibels: -3.5 },
      { kind: 'normalize', mode: 'peak', target: -1 },
    ];

    expect(compile(operations).filters).toEqual(compile(operations).filters);
  });

  it('sayılar bilimsel gösterime KAÇMAZ', () => {
    // `1e-7` gibi bir değer FFmpeg tarafından ayrıştırılamaz.
    const plan = compile([{ kind: 'normalize', mode: 'peak', target: -60 }]);

    expect(plan.filters[0]).not.toMatch(/e-?\d/i);
  });

  it('reverse tek filtre ekler', () => {
    expect(compile([{ kind: 'reverse' }]).filters).toEqual(['areverse']);
  });
});

describe('compileAudioDocument', () => {
  const document: VolAudioDocumentV1 = {
    schemaVersion: 1,
    source: { assetId: 'a1' },
    operations: [{ kind: 'gain', decibels: -3 }],
    output: { format: 'ogg', vorbisQuality: 6 },
  };

  it('geçerli belgeyi derler', () => {
    expect(compileAudioDocument(document, CONTEXT).filters).toEqual(['volume=-3dB']);
  });

  it('yanlış şema sürümünü reddeder', () => {
    expect(() => compileAudioDocument({ ...document, schemaVersion: 2 as 1 }, CONTEXT)).toThrow();
  });

  it('desteklenmeyen çıktı biçimini reddeder', () => {
    expect(() =>
      compileAudioDocument({ ...document, output: { format: 'mp3' as 'ogg' } }, CONTEXT),
    ).toThrow();
  });

  it('geçersiz loop bölgesini reddeder', () => {
    expect(() =>
      compileAudioDocument(
        { ...document, loop: { startFrame: 100, endFrame: 50, crossfadeFrames: 0 } },
        CONTEXT,
      ),
    ).toThrow();
  });

  it('crossfade loop uzunluğunu aşamaz', () => {
    expect(() =>
      compileAudioDocument(
        { ...document, loop: { startFrame: 0, endFrame: 100, crossfadeFrames: 200 } },
        CONTEXT,
      ),
    ).toThrow();
  });
});

describe('buildFfmpegArgs', () => {
  it('OGG çıktısı vorbis kalitesiyle kodlanır', () => {
    const plan = compile([{ kind: 'gain', decibels: -3 }]);

    const args = buildFfmpegArgs('/in.ogg', '/out.ogg', plan, {
      format: 'ogg',
      vorbisQuality: 7,
    });

    expect(args).toContain('-c:a');
    expect(args).toContain('libvorbis');
    expect(args[args.indexOf('-q:a') + 1]).toBe('7');
    expect(args.at(-1)).toBe('/out.ogg');
  });

  it('WAV çıktısı kayıpsız kodlanır', () => {
    const args = buildFfmpegArgs('/in.wav', '/out.wav', compile([]), { format: 'wav' });

    expect(args).toContain('pcm_s16le');
    // Filtre yoksa `-af` hiç eklenmez; boş filtergraph FFmpeg'i düşürür.
    expect(args).not.toContain('-af');
  });

  it('metadata çıktıya taşınmaz', () => {
    const args = buildFfmpegArgs('/in.ogg', '/out.ogg', compile([]), { format: 'ogg' });

    expect(args[args.indexOf('-map_metadata') + 1]).toBe('-1');
  });

  it('argümanlar kabuk yorumuna açık dize taşımaz', () => {
    const args = buildFfmpegArgs('/in.ogg', '/out.ogg', compile([{ kind: 'reverse' }]), {
      format: 'ogg',
    });

    for (const arg of args) {
      expect(arg).not.toMatch(/[;&|`$]/);
    }
  });
});
