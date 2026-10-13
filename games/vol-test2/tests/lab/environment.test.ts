import { describe, expect, it } from 'vitest';
import {
  buildEnvironment,
  classifyRenderer,
  describeGl,
  engineOf,
  measureRaf,
  refreshRateOf,
  type GlLike,
} from '../../src/lab/environment';

describe('classifyRenderer', () => {
  it.each([
    ['ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)', 'software'],
    ['llvmpipe (LLVM 15.0.7, 256 bits)', 'software'],
    ['Microsoft Basic Render Driver', 'software'],
    ['ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11, D3D11)', 'software'],
    ['Mesa Software Rasterizer', 'software'],
    ['ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Direct3D11 vs_5_0 ps_5_0, D3D11)', 'hardware'],
    ['Apple GPU', 'hardware'],
    ['AMD Radeon Graphics', 'hardware'],
  ])('%s → %s', (name, expected) => {
    expect(classifyRenderer(name)).toBe(expected);
  });

  it('WebKit Apple dışı platformda "Apple GPU" adını gizler: sınıf bilinmez', () => {
    const webkit = { engine: 'webkit' as const };
    expect(classifyRenderer('Apple GPU', { ...webkit, platform: 'Win32' })).toBe('unknown');
    expect(classifyRenderer('Apple GPU', { ...webkit, platform: 'Linux x86_64' })).toBe('unknown');
    expect(classifyRenderer('Apple GPU', { ...webkit, platform: 'MacIntel' })).toBe('hardware');
    expect(classifyRenderer('Apple GPU', { ...webkit, platform: 'iPhone' })).toBe('hardware');
    expect(classifyRenderer('Apple GPU', { engine: 'chromium', platform: 'Win32' })).toBe(
      'hardware',
    );
  });

  it('ad yoksa sezgiyle donanım demez', () => {
    expect(classifyRenderer(null)).toBe('unknown');
    expect(classifyRenderer('  ')).toBe('unknown');
    expect(classifyRenderer(undefined)).toBe('unknown');
  });
});

describe('engineOf', () => {
  it('motoru kullanıcı aracısından çıkarır', () => {
    expect(
      engineOf('Mozilla/5.0 AppleWebKit/537.36 (KHTML) HeadlessChrome/140.0 Safari/537.36'),
    ).toBe('chromium');
    expect(
      engineOf('Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 (KHTML) Version/18.0 Safari/605.1.15'),
    ).toBe('webkit');
    expect(engineOf('Mozilla/5.0 (X11; Linux) Gecko/20100101 Firefox/130.0')).toBe('firefox');
    expect(engineOf('curl/8')).toBe('unknown');
  });
});

describe('refreshRateOf', () => {
  it('bilinen hıza yakın ölçümü hıza yuvarlar', () => {
    expect(refreshRateOf(16.7)).toEqual({ measuredHz: 59.9, hz: 60 });
    expect(refreshRateOf(8.33).hz).toBe(120);
    expect(refreshRateOf(6.94).hz).toBe(144);
  });

  it('bilinen hıza uymayan ya da geçersiz ölçümde tavan çıkarmaz', () => {
    expect(refreshRateOf(4.4).hz).toBeNull();
    expect(refreshRateOf(0)).toEqual({ measuredHz: null, hz: null });
    expect(refreshRateOf(Number.NaN).hz).toBeNull();
  });
});

describe('describeGl', () => {
  const make = (withDebug: boolean): GlLike => ({
    VENDOR: 1,
    RENDERER: 2,
    MAX_TEXTURE_SIZE: 3,
    getParameter: (name) =>
      ({ 1: 'masked-vendor', 2: 'masked-renderer', 3: 8192, 11: 'Google', 12: 'SwiftShader' })[
        name as 1 | 2 | 3 | 11 | 12
      ],
    getExtension: () =>
      withDebug ? { UNMASKED_VENDOR_WEBGL: 11, UNMASKED_RENDERER_WEBGL: 12 } : null,
  });

  it('gizli olmayan adı okur', () => {
    expect(describeGl(make(true), true)).toEqual({
      version: 2,
      vendor: 'Google',
      renderer: 'SwiftShader',
      maxTextureSize: 8192,
      masked: false,
    });
  });

  it('eklenti yoksa genel adı alır ve gizli işaretler', () => {
    expect(describeGl(make(false))).toMatchObject({
      renderer: 'masked-renderer',
      masked: true,
      version: 1,
    });
  });

  it('bağlam yoksa null', () => {
    expect(describeGl(null)).toBeNull();
  });
});

describe('buildEnvironment', () => {
  it('çizici sınıfını ve yenileme hızını türetir', () => {
    const env = buildEnvironment({
      userAgent: 'HeadlessChrome/140 Chrome/140',
      platform: 'Win32',
      dpr: 1,
      viewport: { width: 1280, height: 800 },
      hardwareConcurrency: 8,
      deviceMemoryGb: null,
      visibility: 'visible',
      gl: {
        version: 2,
        vendor: 'Google',
        renderer: 'SwiftShader',
        maxTextureSize: 8192,
        masked: false,
      },
      rafMedianMs: 16.7,
      capturedAt: '2026-10-13T10:00:00.000Z',
    });
    expect(env.engine).toBe('chromium');
    expect(env.rendererClass).toBe('software');
    expect(env.refresh.hz).toBe(60);
  });

  it('Windows üstünde WebKit "Apple GPU" bildirirse çizici sınıfı unknown olur', () => {
    const env = buildEnvironment({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/605.1.15 (KHTML, like Gecko) Safari/605.1.15',
      platform: 'Win32',
      dpr: 1,
      viewport: { width: 1280, height: 800 },
      hardwareConcurrency: 8,
      deviceMemoryGb: null,
      visibility: 'visible',
      gl: {
        version: 1,
        vendor: 'Apple Inc.',
        renderer: 'Apple GPU',
        maxTextureSize: 16384,
        masked: false,
      },
      rafMedianMs: 16,
      capturedAt: '2026-10-13T10:00:00.000Z',
    });
    expect(env.engine).toBe('webkit');
    expect(env.rendererClass).toBe('unknown');
  });

  it('GL ve rAF ölçümü yoksa bilinmiyor der', () => {
    const env = buildEnvironment({
      userAgent: 'x',
      platform: 'x',
      dpr: 2,
      viewport: { width: 1, height: 1 },
      hardwareConcurrency: null,
      deviceMemoryGb: null,
      visibility: 'hidden',
      gl: null,
      rafMedianMs: null,
      capturedAt: 't',
    });
    expect(env.rendererClass).toBe('unknown');
    expect(env.refresh).toEqual({ measuredHz: null, hz: null });
  });
});

describe('measureRaf', () => {
  it('medyan aralığı verir', async () => {
    let time = 0;
    const gaps = [16, 16, 100, 16, 16, 16];
    let index = 0;
    const raf = (callback: (now: number) => void): number => {
      time += gaps[index++ % gaps.length];
      queueMicrotask(() => callback(time));
      return 1;
    };
    expect(await measureRaf(5, raf, 3000, () => time)).toBe(16);
  });

  it('rAF durursa zaman aşımında null verir', async () => {
    let time = 0;
    const raf = (callback: (now: number) => void): number => {
      time += 2000;
      queueMicrotask(() => callback(time));
      return 1;
    };
    expect(await measureRaf(30, raf, 3000, () => time)).toBeNull();
  });
});
