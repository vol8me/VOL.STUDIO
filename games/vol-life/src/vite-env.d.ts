/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Yalnız `vite dev`de okunur; üretim bundle'ı bu değişkeni hiç değerlendirmez. */
  readonly VITE_LIFE_AUDITION_GENOME?: string;
}
