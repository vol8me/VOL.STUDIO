import { DisposableScope } from '../lifecycle/DisposableScope';

export type GpuTimerSampleStatus =
  'ready' | 'unsupported' | 'unavailable' | 'disjoint' | 'context-lost' | 'error';

export interface GpuTimerSample {
  readonly frameId: number | null;
  readonly status: GpuTimerSampleStatus;
  readonly durationMs: number | null;
}

export interface GpuTimerOptions {
  readonly onSample: (sample: GpuTimerSample) => void;
}

interface TimerExtension {
  readonly TIME_ELAPSED_EXT: number;
  readonly GPU_DISJOINT_EXT: number;
}

interface TimerExtensionV1 extends TimerExtension {
  readonly QUERY_RESULT_AVAILABLE_EXT: number;
  readonly QUERY_RESULT_EXT: number;
  createQueryEXT(): WebGLQuery | null;
  beginQueryEXT(target: number, query: WebGLQuery): void;
  endQueryEXT(target: number): void;
  deleteQueryEXT(query: WebGLQuery): void;
  getQueryObjectEXT(query: WebGLQuery, parameter: number): unknown;
}

interface QueryApi {
  create(): WebGLQuery | null;
  begin(query: WebGLQuery): void;
  end(): void;
  delete(query: WebGLQuery): void;
  available(query: WebGLQuery): boolean;
  result(query: WebGLQuery): unknown;
  disjoint(): boolean;
}

interface Measurement {
  readonly query: WebGLQuery;
  readonly frameId: number | null;
}

function createApi(gl: WebGLRenderingContext | WebGL2RenderingContext): QueryApi | null {
  if ('createQuery' in gl) {
    const extension = gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExtension | null;
    if (!extension) return null;
    return {
      create: () => gl.createQuery(),
      begin: (query) => gl.beginQuery(extension.TIME_ELAPSED_EXT, query),
      end: () => gl.endQuery(extension.TIME_ELAPSED_EXT),
      delete: (query) => gl.deleteQuery(query),
      available: (query) => Boolean(gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)),
      result: (query) => gl.getQueryParameter(query, gl.QUERY_RESULT) as unknown,
      disjoint: () => Boolean(gl.getParameter(extension.GPU_DISJOINT_EXT)),
    };
  }
  const extension = gl.getExtension('EXT_disjoint_timer_query') as TimerExtensionV1 | null;
  if (!extension) return null;
  return {
    create: () => extension.createQueryEXT(),
    begin: (query) => extension.beginQueryEXT(extension.TIME_ELAPSED_EXT, query),
    end: () => extension.endQueryEXT(extension.TIME_ELAPSED_EXT),
    delete: (query) => extension.deleteQueryEXT(query),
    available: (query) =>
      Boolean(extension.getQueryObjectEXT(query, extension.QUERY_RESULT_AVAILABLE_EXT)),
    result: (query) => extension.getQueryObjectEXT(query, extension.QUERY_RESULT_EXT),
    disjoint: () => Boolean(gl.getParameter(extension.GPU_DISJOINT_EXT)),
  };
}

export class GpuTimer {
  private readonly scope = new DisposableScope();
  private api: QueryApi | null = null;
  private active: Measurement | null = null;
  private readonly pending: Measurement[] = [];
  private state: GpuTimerSampleStatus | 'destroyed' = 'unsupported';

  constructor(
    private readonly gl: WebGLRenderingContext | WebGL2RenderingContext | null,
    private readonly options: GpuTimerOptions,
  ) {
    if (!gl) return;
    this.initialize();
    this.scope.addListener(gl.canvas, 'webglcontextlost', (event) => {
      event.preventDefault();
      this.invalidate('context-lost');
      this.api = null;
      this.state = 'context-lost';
    });
    this.scope.addListener(gl.canvas, 'webglcontextrestored', () => this.initialize());
  }

  get status(): GpuTimerSampleStatus | 'destroyed' {
    return this.state;
  }

  begin(frameId: number | null): boolean {
    if (this.state === 'destroyed') return false;
    if (this.gl?.isContextLost()) {
      this.invalidate('context-lost');
      this.state = 'context-lost';
    }
    if (!this.api || this.state === 'context-lost') {
      this.emit(frameId, this.state);
      return false;
    }
    let query: WebGLQuery | null = null;
    try {
      if (this.api.disjoint()) {
        this.invalidate('disjoint');
        this.emit(frameId, 'disjoint');
        return false;
      }
      if (this.active || this.pending.length >= 4) {
        this.emit(frameId, 'unavailable');
        return false;
      }
      query = this.api.create();
      if (!query) {
        this.emit(frameId, 'unavailable');
        return false;
      }
      this.api.begin(query);
      this.active = { query, frameId };
      this.state = 'ready';
      return true;
    } catch {
      if (query) this.deleteQuery(query);
      this.invalidate('error');
      this.emit(frameId, 'error');
      return false;
    }
  }

  end(): void {
    if (!this.active || !this.api) return;
    try {
      this.api.end();
      this.pending.push(this.active);
      this.active = null;
    } catch {
      this.invalidate('error');
    }
  }

  poll(): void {
    if (!this.api || this.state === 'destroyed') return;
    if (this.gl?.isContextLost()) {
      this.invalidate('context-lost');
      this.state = 'context-lost';
      return;
    }
    try {
      if (this.api.disjoint()) {
        this.invalidate('disjoint');
        return;
      }
      for (let index = 0; index < this.pending.length;) {
        const measurement = this.pending[index];
        if (!this.api.available(measurement.query)) {
          index++;
          continue;
        }
        if (this.api.disjoint()) {
          this.invalidate('disjoint');
          return;
        }
        const result = this.api.result(measurement.query);
        this.pending.splice(index, 1);
        this.deleteQuery(measurement.query);
        if (typeof result !== 'number' || !Number.isFinite(result) || result < 0) {
          this.emit(measurement.frameId, 'error');
        } else {
          this.emit(measurement.frameId, 'ready', result / 1_000_000);
        }
      }
    } catch {
      this.invalidate('error');
    }
  }

  destroy(): void {
    if (this.state === 'destroyed') return;
    this.state = 'destroyed';
    this.scope.dispose();
    this.invalidate();
    this.api = null;
  }

  private initialize(): void {
    try {
      if (this.gl?.isContextLost()) {
        this.state = 'context-lost';
        return;
      }
      this.api = this.gl ? createApi(this.gl) : null;
      this.state = this.api ? 'ready' : 'unsupported';
    } catch {
      this.api = null;
      this.state = 'error';
    }
  }

  private invalidate(status?: GpuTimerSampleStatus): void {
    const measurements = this.pending.splice(0);
    if (this.active) {
      try {
        this.api?.end();
      } catch {
        // Kayıp bağlamda end başarısız olsa da sorgu referansı bırakılır.
      }
      measurements.push(this.active);
      this.active = null;
    }
    for (const measurement of measurements) {
      this.deleteQuery(measurement.query);
      if (status) this.emit(measurement.frameId, status);
    }
  }

  private deleteQuery(query: WebGLQuery): void {
    try {
      this.api?.delete(query);
    } catch {
      // Bir sürücü hatası diğer sorguların temizliğini engellemez.
    }
  }

  private emit(
    frameId: number | null,
    status: GpuTimerSampleStatus,
    durationMs: number | null = null,
  ): void {
    this.options.onSample({ frameId, status, durationMs });
  }
}
