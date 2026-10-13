/**
 * Ölçümün yapıldığı ortam. Bir FPS sayısı ortamdan ayrı anlam taşımaz: yazılım çizicide (SwiftShader)
 * ya da yenileme hızına kilitli bir ekranda aynı sayı çok farklı şey söyler. Bu yüzden ortam her
 * yargıya ve her kayda eklenir.
 */

export type RendererClass = 'hardware' | 'software' | 'unknown';
export type Engine = 'chromium' | 'webkit' | 'firefox' | 'unknown';

/** Yazılım (CPU) çizicisini ele veren sürücü adı parçaları. */
const SOFTWARE_RENDERER =
  /swiftshader|llvmpipe|softpipe|software|basic render|mesa offscreen|\bwarp\b/i;

/** WebKit sürücü adını her platformda "Apple GPU" diye gizler; yalnız Apple platformunda gerçektir. */
const WEBKIT_MASKED_NAME = /^apple gpu$/i;
const APPLE_PLATFORM = /mac|iphone|ipad/i;

/**
 * WebGL çizici adından sınıf. Ad yoksa, boşsa ya da motor adı gizliyorsa (WebKit'in Apple dışı
 * platformdaki "Apple GPU"su) `unknown`: sezgiyle donanım denmez.
 */
export function classifyRenderer(
  name: string | null | undefined,
  context?: { readonly engine: Engine; readonly platform: string },
): RendererClass {
  if (!name || name.trim() === '') return 'unknown';
  if (
    context !== undefined &&
    context.engine === 'webkit' &&
    WEBKIT_MASKED_NAME.test(name.trim()) &&
    !APPLE_PLATFORM.test(context.platform)
  )
    return 'unknown';
  return SOFTWARE_RENDERER.test(name) ? 'software' : 'hardware';
}

export function engineOf(userAgent: string): Engine {
  if (/Firefox\//.test(userAgent)) return 'firefox';
  if (/Chrome\/|Chromium\/|Edg\//.test(userAgent)) return 'chromium';
  if (/AppleWebKit\//.test(userAgent)) return 'webkit';
  return 'unknown';
}

/** Yaygın ekran yenileme hızları (Hz). */
const REFRESH_RATES = [24, 30, 48, 50, 60, 72, 75, 90, 100, 120, 144, 165, 180, 240] as const;

export interface RefreshRate {
  /** Ölçülen `requestAnimationFrame` hızı (Hz); ölçülemediyse null. */
  readonly measuredHz: number | null;
  /** Ölçüm bilinen bir yenileme hızına %4 yakınsa o hız. Yoksa null: tavan yok ya da bilinmiyor. */
  readonly hz: number | null;
}

/** Medyan kare aralığından (ms) yenileme hızı çıkarımı. */
export function refreshRateOf(medianIntervalMs: number): RefreshRate {
  if (!(medianIntervalMs > 0) || !Number.isFinite(medianIntervalMs))
    return { measuredHz: null, hz: null };
  const measuredHz = 1000 / medianIntervalMs;
  const nearest = REFRESH_RATES.reduce((best, rate) =>
    Math.abs(rate - measuredHz) < Math.abs(best - measuredHz) ? rate : best,
  );
  const hz = Math.abs(nearest - measuredHz) / nearest <= 0.04 ? nearest : null;
  return { measuredHz: Math.round(measuredHz * 10) / 10, hz };
}

export interface GlInfo {
  readonly version: 1 | 2;
  readonly vendor: string | null;
  readonly renderer: string | null;
  readonly maxTextureSize: number | null;
  /** Sürücü adı gizliydi (`WEBGL_debug_renderer_info` yok): ad genel olabilir. */
  readonly masked: boolean;
}

/** `getParameter` ile `getExtension` yüzeyi; testte sahte verilir. */
export interface GlLike {
  readonly VENDOR: number;
  readonly RENDERER: number;
  readonly MAX_TEXTURE_SIZE: number;
  getParameter(name: number): unknown;
  getExtension(
    name: string,
  ): { UNMASKED_VENDOR_WEBGL: number; UNMASKED_RENDERER_WEBGL: number } | null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

export function describeGl(gl: GlLike | null, isWebGl2 = false): GlInfo | null {
  if (gl === null) return null;
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  const max = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  return {
    version: isWebGl2 ? 2 : 1,
    vendor: text(gl.getParameter(debug ? debug.UNMASKED_VENDOR_WEBGL : gl.VENDOR)),
    renderer: text(gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER)),
    maxTextureSize: typeof max === 'number' ? max : null,
    masked: debug === null,
  };
}

export interface EnvironmentInput {
  readonly userAgent: string;
  readonly platform: string;
  readonly dpr: number;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly hardwareConcurrency: number | null;
  readonly deviceMemoryGb: number | null;
  readonly visibility: 'visible' | 'hidden';
  readonly gl: GlInfo | null;
  readonly rafMedianMs: number | null;
  readonly capturedAt: string;
}

export interface Environment {
  readonly engine: Engine;
  readonly userAgent: string;
  readonly platform: string;
  readonly dpr: number;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly hardwareConcurrency: number | null;
  readonly deviceMemoryGb: number | null;
  readonly visibility: 'visible' | 'hidden';
  readonly webgl: GlInfo | null;
  readonly rendererClass: RendererClass;
  readonly refresh: RefreshRate;
  readonly capturedAt: string;
}

export function buildEnvironment(input: EnvironmentInput): Environment {
  const engine = engineOf(input.userAgent);
  return {
    engine,
    userAgent: input.userAgent,
    platform: input.platform,
    dpr: input.dpr,
    viewport: input.viewport,
    hardwareConcurrency: input.hardwareConcurrency,
    deviceMemoryGb: input.deviceMemoryGb,
    visibility: input.visibility,
    webgl: input.gl,
    rendererClass: classifyRenderer(input.gl?.renderer, { engine, platform: input.platform }),
    refresh: refreshRateOf(input.rafMedianMs ?? 0),
    capturedAt: input.capturedAt,
  };
}

/**
 * `frames` kare boyunca `requestAnimationFrame` aralığının medyanı (ms). Oyun döngüsünden bağımsızdır:
 * ekranın gerçek tavanını gösterir. Sekme gizliyse rAF durur; `timeoutMs` sonra null döner.
 */
export function measureRaf(
  frames: number,
  raf: (callback: (now: number) => void) => number,
  timeoutMs = 3000,
  clock: () => number = () => performance.now(),
): Promise<number | null> {
  return new Promise((resolve) => {
    const gaps: number[] = [];
    let last: number | null = null;
    let done = false;
    const startedAt = clock();
    // Sekme gizliyken rAF hiç çağrılmaz: süre denetimi yalnız `tick` içinde olsaydı söz asla çözülmezdi.
    const watchdog = setTimeout(() => finish(null), timeoutMs);
    const finish = (value: number | null): void => {
      if (done) return;
      done = true;
      clearTimeout(watchdog);
      resolve(value);
    };
    const tick = (now: number): void => {
      if (done) return;
      if (last !== null) gaps.push(now - last);
      last = now;
      if (gaps.length >= frames) {
        gaps.sort((a, b) => a - b);
        finish(gaps[Math.floor(gaps.length / 2)]);
      } else if (clock() - startedAt > timeoutMs) {
        finish(null);
      } else {
        raf(tick);
      }
    };
    raf(tick);
  });
}
