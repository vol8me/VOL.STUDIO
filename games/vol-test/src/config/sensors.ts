/** Çekirdek ışığı: bağlandığı parçanın merkezine göre konum (parça-yerel), ölçek ve renk. */
export interface CoreArt {
  readonly x: number;
  readonly y: number;
  /** Striker'ın çekirdeği 0.75'tir (`CORE_REFERENCE`); buna göre büyür ya da küçülür. */
  readonly scale: number;
  readonly tint: number;
}

/** Bir araç ailesinin duyarga çizimi; konumlar duyargaların bağlandığı parçanın yerel uzayındadır. */
export interface FeelerArt {
  /** Sağ duyarganın bağlantısı (sol aynasıdır). */
  readonly anchorX: number;
  readonly anchorY: number;
  readonly length: number;
  readonly thickness: number;
  /** Duyarganın dinlenme açısı (rad): öne bakan için eksenden dışa, arkaya bakan için arkadan dışa. */
  readonly rest: number;
  /** Duyargalar öne (1) ya da arkaya (-1) bakar. */
  readonly facing: 1 | -1;
  /** Gövde rengi ve uç ışığının rengi. */
  readonly tint: number;
  readonly glow: number;
  /** Uç ışığının çapı (dünya birimi). */
  readonly tipSize: number;
}

/** Parça-yerel çekirdek ve duyarga tanımı: yürüyücü göğsü ve süzülen gövde bunu kullanır. */
export interface SensorArt {
  readonly core: CoreArt;
  readonly feelers: FeelerArt;
}
