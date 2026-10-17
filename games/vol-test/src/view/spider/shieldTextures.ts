import type Phaser from 'phaser';

/**
 * Enerji kubbesinin dokuları (`ShieldView`). Hepsi beyaz-alfa çizilir ve çalışma anında boyanır
 * (renk araçtan gelir). Kare doku merkezdeki daireyi doldurur: yarıçap `SIZE / 2`.
 */
export const SHIELD_TEXTURE = {
  dome: 'fx-shield-dome',
  mesh: 'fx-shield-mesh',
  rim: 'fx-shield-rim',
} as const;

/** Doku kenarı (px): en yakın zoom'da kubbe ekrandan küçük kalmasın diye iri tutulur. */
export const SHIELD_TEXTURE_SIZE = 512;

/** Altıgen örgünün dış yarıçapı, kenar sayısı ve kenar çizgisi kalınlığı (256 birimlik tasarım uzayında). */
const MESH = { cell: 21, line: 1.35, node: 1.7 } as const;
const RIM = { ticks: 72, majorEvery: 6, nodes: 6 } as const;
const TAU = Math.PI * 2;
const HALF = 128;

/** Belirlenimli [0, 1) karması: örgüdeki ışıklı hücreler her açılışta aynıdır. */
function hash(a: number, b: number): number {
  const mixed = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return mixed - Math.floor(mixed);
}

function bake(
  scene: Phaser.Scene,
  key: string,
  paint: (g: CanvasRenderingContext2D) => void,
): void {
  if (scene.textures.exists(key)) return;
  const canvas = document.createElement('canvas');
  canvas.width = SHIELD_TEXTURE_SIZE;
  canvas.height = SHIELD_TEXTURE_SIZE;
  const g = canvas.getContext('2d');
  if (!g) throw new Error(`"${key}" dokusu için 2B canvas bağlamı alınamadı`);
  g.scale(SHIELD_TEXTURE_SIZE / 256, SHIELD_TEXTURE_SIZE / 256);
  paint(g);
  scene.textures.addCanvas(key, canvas);
}

/** Kubbe gövdesi: ortası şeffaf, kenara doğru parlayan (fresnel) dolgu ve sol-üstten bir ışık lekesi. */
function paintDome(g: CanvasRenderingContext2D): void {
  const body = g.createRadialGradient(HALF, HALF, 0, HALF, HALF, HALF - 1);
  body.addColorStop(0, 'rgba(255,255,255,0.05)');
  body.addColorStop(0.55, 'rgba(255,255,255,0.1)');
  body.addColorStop(0.8, 'rgba(255,255,255,0.26)');
  body.addColorStop(0.93, 'rgba(255,255,255,0.62)');
  body.addColorStop(0.985, 'rgba(255,255,255,0.95)');
  body.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = body;
  g.beginPath();
  g.arc(HALF, HALF, HALF - 1, 0, TAU);
  g.fill();
  g.save();
  g.beginPath();
  g.arc(HALF, HALF, HALF - 1, 0, TAU);
  g.clip();
  const gloss = g.createRadialGradient(92, 86, 0, 92, 86, 74);
  gloss.addColorStop(0, 'rgba(255,255,255,0.3)');
  gloss.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gloss;
  g.fillRect(0, 0, 256, 256);
  g.restore();
}

/** Altıgen enerji örgüsü: kenara doğru parlayan çizgiler, köşe düğümleri ve seyrek ışıklı hücreler. */
function paintMesh(g: CanvasRenderingContext2D): void {
  g.save();
  g.beginPath();
  g.arc(HALF, HALF, HALF - 2, 0, TAU);
  g.clip();
  const R = MESH.cell;
  const height = Math.sqrt(3) * R;
  for (let q = -9; q <= 9; q++) {
    for (let r = -9; r <= 9; r++) {
      const cx = HALF + q * 1.5 * R;
      const cy = HALF + (r + q / 2) * height;
      const reach = Math.hypot(cx - HALF, cy - HALF) / HALF;
      if (reach > 1.18) continue;
      const strength = 0.2 + 0.7 * reach * reach;
      if (hash(q, r) > 0.86) {
        g.fillStyle = `rgba(255,255,255,${(0.1 + 0.16 * reach).toFixed(3)})`;
        hexagon(g, cx, cy, R);
        g.fill();
      }
      g.strokeStyle = `rgba(255,255,255,${strength.toFixed(3)})`;
      g.lineWidth = MESH.line;
      hexagon(g, cx, cy, R);
      g.stroke();
      g.fillStyle = `rgba(255,255,255,${Math.min(1, strength * 1.15).toFixed(3)})`;
      for (let corner = 0; corner < 6; corner++) {
        const angle = (corner * TAU) / 6;
        g.beginPath();
        g.arc(cx + Math.cos(angle) * R, cy + Math.sin(angle) * R, MESH.node, 0, TAU);
        g.fill();
      }
    }
  }
  g.restore();
}

function hexagon(g: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  g.beginPath();
  for (let corner = 0; corner < 6; corner++) {
    const angle = (corner * TAU) / 6;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (corner === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.closePath();
}

/** Kenar halkası: ince parlak çizgi, içe bakan ölçek çentikleri ve altı köşede elmas düğümler. */
function paintRim(g: CanvasRenderingContext2D): void {
  const band = g.createRadialGradient(HALF, HALF, HALF * 0.93, HALF, HALF, HALF - 1);
  band.addColorStop(0, 'rgba(255,255,255,0)');
  band.addColorStop(0.55, 'rgba(255,255,255,1)');
  band.addColorStop(0.75, 'rgba(255,255,255,0.85)');
  band.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = band;
  g.beginPath();
  g.arc(HALF, HALF, HALF - 1, 0, TAU);
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,1)';
  g.lineCap = 'round';
  for (let tick = 0; tick < RIM.ticks; tick++) {
    const major = tick % RIM.majorEvery === 0;
    const angle = (tick * TAU) / RIM.ticks;
    const outer = HALF * 0.915;
    const inner = outer - (major ? 9 : 4);
    g.globalAlpha = major ? 0.85 : 0.42;
    g.lineWidth = major ? 1.8 : 1.1;
    g.beginPath();
    g.moveTo(HALF + Math.cos(angle) * outer, HALF + Math.sin(angle) * outer);
    g.lineTo(HALF + Math.cos(angle) * inner, HALF + Math.sin(angle) * inner);
    g.stroke();
  }
  g.globalAlpha = 1;
  g.fillStyle = 'rgba(255,255,255,1)';
  for (let node = 0; node < RIM.nodes; node++) {
    const angle = (node * TAU) / RIM.nodes;
    const x = HALF + Math.cos(angle) * (HALF * 0.96);
    const y = HALF + Math.sin(angle) * (HALF * 0.96);
    const glow = g.createRadialGradient(x, y, 0, x, y, 11);
    glow.addColorStop(0, 'rgba(255,255,255,0.8)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = glow;
    g.fillRect(x - 11, y - 11, 22, 22);
    g.fillStyle = 'rgba(255,255,255,1)';
    g.save();
    g.translate(x, y);
    g.rotate(angle + Math.PI / 4);
    g.fillRect(-3.2, -3.2, 6.4, 6.4);
    g.restore();
  }
}

/** Kubbe dokularını bir kez çizer (`createRuntimeTextures`). */
export function createShieldTextures(scene: Phaser.Scene): void {
  bake(scene, SHIELD_TEXTURE.dome, paintDome);
  bake(scene, SHIELD_TEXTURE.mesh, paintMesh);
  bake(scene, SHIELD_TEXTURE.rim, paintRim);
}
