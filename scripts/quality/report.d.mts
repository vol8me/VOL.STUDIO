/**
 * `report.mjs` için tip bildirimi.
 *
 * Betik düz `.mjs`: kalite kapılarını sarmalar ve build adımı olmadan, çıplak
 * Node ile koşabilmelidir. Yalnızca `classify` dışa açıktır ve o da test
 * edilebilmesi için — kalıplarının araç sürümüyle sürüklenmesi sessiz bir
 * teşhis kaybı olurdu (bkz. core/tests/governance/qualityReport.test.ts).
 */

export interface QualityFailure {
  /** Sınıflandırma türü: 'typecheck', 'test', 'coverage-threshold', 'unknown'… */
  kind: string;
  /** İlgili workspace paketi; çıkarılamazsa null. */
  package: string | null;
  /** İnsan-okunur özet. */
  reason: string;
  /** Yalnızca `kind === 'unknown'` iken: çıktının son anlamlı satırları. */
  tail?: string[];
}

/** Bir aşamanın çıktısını sınıflandırır. */
export declare function classify(stage: string, output: string): QualityFailure;
