/**
 * Render sırasında toplanan, piksel sonucunu değiştirmeyen teşhis verileri.
 *
 * Bu kayıtlar ölçüm için vardır; zaman bilgisi taşımazlar ve aynı belge +
 * tohumda deterministik kalırlar. Süre ölçümü ayrı bir opt-in profildir.
 */

export interface ScatterDiagnostic {
  /** Belgedeki alan yolunu gösterir (`katman/source/...`). */
  readonly path: string;
  readonly distribution: 'grid' | 'poisson';
  /** İstenen örnek sayısı. */
  readonly requestedCount: number;
  /** Kaynak doluysa gerçekten yerleştirilen örnek sayısı. */
  readonly acceptedCount: number;
  /** Kaynağın tamamı sıfırsa sıfır kabul geçerli bir sonuçtur. */
  readonly sourceEmpty: boolean;
  /** Poisson için hedef minimum mesafe, piksel; grid için null. */
  readonly minDistancePixels: number | null;
  /** Kabul edilen merkezler arasındaki ölçülen minimum mesafe, piksel. */
  readonly observedMinDistancePixels: number | null;
  /** Üretecin tükettiği deterministik aday denemesi. */
  readonly attempts: number;
}

export interface RenderDiagnostics {
  readonly scatters: readonly ScatterDiagnostic[];
}

/** Derleme boyunca doldurulan teşhis kabı. */
export interface MutableRenderDiagnostics {
  readonly scatters: ScatterDiagnostic[];
}

export function createRenderDiagnostics(): MutableRenderDiagnostics {
  return { scatters: [] };
}
