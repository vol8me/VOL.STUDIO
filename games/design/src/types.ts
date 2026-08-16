/**
 * `scripts/organize-pen-export.mjs` tarafından yazılan metadata JSON'unun
 * şekli: `pen_export/<domain>/<entityId>/metadata/<entityId>.metadata.json`.
 */

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface RigPartMetadata {
  partId: string;
  sourceNodeId: string;
  shapeType: string;
  category: string | null;
  logicalSizePx: Size;
  /**
   * Parçanın rig kökünün yerel uzayındaki sol-üst köşesi. Bir export sheet
   * hücre düzeninden izole edilmiş parçalarda `null` olur - hücre pozisyonu
   * gerçek rig yerleşimi değildir.
   */
  positionPx: Point | null;
  /** Parçanın kendi sol-üst köşesi etrafında, derece cinsinden CCW. */
  rotationDeg: number;
  file: string;
}

export interface RigMetadata {
  schemaVersion: 1;
  entityId: string;
  domain: string;
  source: {
    penFile: string;
    sheetNodeId: string;
    sheetNodeName: string;
    exportScale: number;
    rootSizePx: Size | null;
  };
  parts: RigPartMetadata[];
  previews: unknown[];
}

/** Metadata'sı çözümlenmiş texture URL'siyle eşleştirilmiş, yüklenmeye hazır parça. */
export interface RigPartAsset {
  partId: string;
  textureKey: string;
  textureUrl: string;
  logicalSizePx: Size;
  positionPx: Point;
  rotationDeg: number;
}

export interface RigDefinition {
  entityId: string;
  rootSizePx: Size;
  /**
   * Export ölçeği. Sprite'lar bunun tersiyle ölçeklenir: Pencil'in native
   * `Export()`'u kanvası gölge payı için pad'ler, yani texture'ın piksel
   * boyutu `logicalSizePx * exportScale`'den büyüktür.
   */
  exportScale: number;
  /** Alttan üste çizim sırası - kaynak dokümanın child sırasıyla aynı. */
  parts: RigPartAsset[];
}
