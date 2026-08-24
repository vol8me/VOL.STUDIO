import type Phaser from 'phaser';

/**
 * SVG path `d` özniteliğini Phaser Graphics komutlarına dönüştürür.
 *
 * Desteklenen komutlar: M, m, L, l, H, h, V, v, C, c, S, s, Q, q, T, t,
 * A, a, Z, z.
 */

export interface MoveToCommand {
  type: 'M';
  x: number;
  y: number;
}

export interface LineToCommand {
  type: 'L';
  x: number;
  y: number;
}

export interface CubicBezierCommand {
  type: 'C';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  x: number;
  y: number;
}

export interface QuadraticBezierCommand {
  type: 'Q';
  x1: number;
  y1: number;
  x: number;
  y: number;
}

export interface ArcCommand {
  type: 'A';
  rx: number;
  ry: number;
  rotation: number;
  largeArc: boolean;
  sweep: boolean;
  x: number;
  y: number;
}

export interface ClosePathCommand {
  type: 'Z';
}

export type PathCommand =
  | MoveToCommand
  | LineToCommand
  | CubicBezierCommand
  | QuadraticBezierCommand
  | ArcCommand
  | ClosePathCommand;

/**
 * SVG path `d` string'ini komut listesine ayrıştırır.
 */
export function parseSvgPath(d: string): PathCommand[] {
  const commands: PathCommand[] = [];
  // Komut harfi ve ardından sayısal argümanları ayıran tokenizer.
  const tokens = d
    .replace(/([MmLlHhVvCcSsQqTtAaZz])/g, ' $1 ')
    .replace(/,/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  let i = 0;
  let currentX = 0;
  let currentY = 0;
  let subpathStartX = 0;
  let subpathStartY = 0;
  let lastCubicX2 = 0;
  let lastCubicY2 = 0;
  let lastQuadX1 = 0;
  let lastQuadY1 = 0;

  const numbers = (count: number): number[] => {
    const out: number[] = [];
    for (let k = 0; k < count; k++) {
      const token = tokens[i++];
      if (token === undefined) {
        throw new Error(`parseSvgPath: yetersiz argüman (d: "${d}")`);
      }
      const value = Number(token);
      if (!Number.isFinite(value)) {
        throw new Error(`parseSvgPath: geçersiz sayı "${token}" (d: "${d}")`);
      }
      out.push(value);
    }
    return out;
  };

  while (i < tokens.length) {
    const cmd = tokens[i++];
    const isRelative = cmd === cmd.toLowerCase();

    switch (cmd.toUpperCase()) {
      case 'M': {
        let [x, y] = numbers(2);
        if (isRelative) {
          x += currentX;
          y += currentY;
        }
        commands.push({ type: 'M', x, y });
        subpathStartX = x;
        subpathStartY = y;
        currentX = x;
        currentY = y;

        // Bir M komutundan sonra gelen koordinat çiftleri örtülü L'dir.
        while (i < tokens.length && !isNaN(Number(tokens[i]))) {
          let [lx, ly] = numbers(2);
          if (isRelative) {
            lx += currentX;
            ly += currentY;
          }
          commands.push({ type: 'L', x: lx, y: ly });
          currentX = lx;
          currentY = ly;
        }
        lastCubicX2 = currentX;
        lastCubicY2 = currentY;
        lastQuadX1 = currentX;
        lastQuadY1 = currentY;
        break;
      }

      case 'L': {
        let [x, y] = numbers(2);
        if (isRelative) {
          x += currentX;
          y += currentY;
        }
        commands.push({ type: 'L', x, y });
        currentX = x;
        currentY = y;
        lastCubicX2 = x;
        lastCubicY2 = y;
        lastQuadX1 = x;
        lastQuadY1 = y;
        break;
      }

      case 'H': {
        let [x] = numbers(1);
        if (isRelative) x += currentX;
        commands.push({ type: 'L', x, y: currentY });
        currentX = x;
        lastCubicX2 = x;
        lastQuadX1 = x;
        break;
      }

      case 'V': {
        let [y] = numbers(1);
        if (isRelative) y += currentY;
        commands.push({ type: 'L', x: currentX, y });
        currentY = y;
        lastCubicY2 = y;
        lastQuadY1 = y;
        break;
      }

      case 'C': {
        const [x1, y1, x2, y2, x, y] = numbers(6);
        const c1 = isRelative ? currentX + x1 : x1;
        const c1y = isRelative ? currentY + y1 : y1;
        const c2 = isRelative ? currentX + x2 : x2;
        const c2y = isRelative ? currentY + y2 : y2;
        const ex = isRelative ? currentX + x : x;
        const ey = isRelative ? currentY + y : y;
        commands.push({ type: 'C', x1: c1, y1: c1y, x2: c2, y2: c2y, x: ex, y: ey });
        lastCubicX2 = c2;
        lastCubicY2 = c2y;
        currentX = ex;
        currentY = ey;
        lastQuadX1 = ex;
        lastQuadY1 = ey;
        break;
      }

      case 'S': {
        const [x2, y2, x, y] = numbers(4);
        const c1x = currentX + (currentX - lastCubicX2);
        const c1y = currentY + (currentY - lastCubicY2);
        const c2 = isRelative ? currentX + x2 : x2;
        const c2y = isRelative ? currentY + y2 : y2;
        const ex = isRelative ? currentX + x : x;
        const ey = isRelative ? currentY + y : y;
        commands.push({ type: 'C', x1: c1x, y1: c1y, x2: c2, y2: c2y, x: ex, y: ey });
        lastCubicX2 = c2;
        lastCubicY2 = c2y;
        currentX = ex;
        currentY = ey;
        lastQuadX1 = ex;
        lastQuadY1 = ey;
        break;
      }

      case 'Q': {
        const [x1, y1, x, y] = numbers(4);
        const c1 = isRelative ? currentX + x1 : x1;
        const c1y = isRelative ? currentY + y1 : y1;
        const ex = isRelative ? currentX + x : x;
        const ey = isRelative ? currentY + y : y;
        commands.push({ type: 'Q', x1: c1, y1: c1y, x: ex, y: ey });
        lastQuadX1 = c1;
        lastQuadY1 = c1y;
        currentX = ex;
        currentY = ey;
        lastCubicX2 = ex;
        lastCubicY2 = ey;
        break;
      }

      case 'T': {
        const [x, y] = numbers(2);
        const c1x = currentX + (currentX - lastQuadX1);
        const c1y = currentY + (currentY - lastQuadY1);
        const ex = isRelative ? currentX + x : x;
        const ey = isRelative ? currentY + y : y;
        commands.push({ type: 'Q', x1: c1x, y1: c1y, x: ex, y: ey });
        lastQuadX1 = c1x;
        lastQuadY1 = c1y;
        currentX = ex;
        currentY = ey;
        lastCubicX2 = ex;
        lastCubicY2 = ey;
        break;
      }

      case 'A': {
        const [rx, ry, rotation, largeArc, sweep, x, y] = numbers(7);
        const ex = isRelative ? currentX + x : x;
        const ey = isRelative ? currentY + y : y;
        commands.push({
          type: 'A',
          rx,
          ry,
          rotation,
          largeArc: largeArc !== 0,
          sweep: sweep !== 0,
          x: ex,
          y: ey,
        });
        currentX = ex;
        currentY = ey;
        lastCubicX2 = ex;
        lastCubicY2 = ey;
        lastQuadX1 = ex;
        lastQuadY1 = ey;
        break;
      }

      case 'Z': {
        commands.push({ type: 'Z' });
        currentX = subpathStartX;
        currentY = subpathStartY;
        lastCubicX2 = currentX;
        lastCubicY2 = currentY;
        lastQuadX1 = currentX;
        lastQuadY1 = currentY;
        break;
      }

      default: {
        throw new Error(`parseSvgPath: bilinmeyen komut "${cmd}" (d: "${d}")`);
      }
    }
  }

  return commands;
}

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * SVG elips yayını merkez, yarıçap, başlangıç/bitiş açılarına çevirir.
 * Phaser `Graphics.arc` ile çizilebilir formatta bir dizi kısa çizgi
 * (line) komutu üretmek yerine bu bilgiyi döner; çizen taraf kendi tercihine
 * göre `arc()` veya segmentli `lineTo()` kullanır.
 */
export interface ArcSegment {
  type: 'arc';
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  /** Yayı x ekseninde döndüren açı (derece). */
  rotation: number;
  startAngle: number;
  endAngle: number;
  anticlockwise: boolean;
  /** Yayın bitiş noktası (orijinal SVG koordinatı). */
  x: number;
  /** Yayın bitiş noktası (orijinal SVG koordinatı). */
  y: number;
}

export type DrawCommand =
  | MoveToCommand
  | LineToCommand
  | CubicBezierCommand
  | QuadraticBezierCommand
  | ArcSegment
  | ClosePathCommand;

/**
 * SVG elips yayı için merkez parametrizasyonu.
 *
 * SVG spesifikasyonunun "F.6 Elliptical arc to bezier curves" bölümüne
 * dayanır; rx, ry eşitse daire, değilse elips üretir.
 */
function arcToCenter(
  x1: number,
  y1: number,
  rx: number,
  ry: number,
  phiDeg: number,
  largeArc: boolean,
  sweep: boolean,
  x2: number,
  y2: number,
): ArcSegment {
  const phi = toRadians(phiDeg);
  const cosP = Math.cos(phi);
  const sinP = Math.sin(phi);

  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cosP * dx + sinP * dy;
  const y1p = -sinP * dx + cosP * dy;

  let rx2 = rx * rx;
  let ry2 = ry * ry;
  const x1p2 = x1p * x1p;
  const y1p2 = y1p * y1p;

  const lambda = x1p2 / rx2 + y1p2 / ry2;
  if (lambda > 1) {
    const root = Math.sqrt(lambda);
    rx *= root;
    ry *= root;
    rx2 = rx * rx;
    ry2 = ry * ry;
  }

  const sign = largeArc === sweep ? -1 : 1;
  const numerator = Math.max(0, rx2 * ry2 - rx2 * y1p2 - ry2 * x1p2);
  const denom = rx2 * y1p2 + ry2 * x1p2;
  const factor = sign * Math.sqrt(numerator / denom);

  const cppx = (factor * rx * y1p) / ry;
  const cppy = (-factor * ry * x1p) / rx;

  const cxp = (x1 + x2) / 2 + cosP * cppx - sinP * cppy;
  const cyp = (y1 + y2) / 2 + sinP * cppx + cosP * cppy;

  const v1x = (x1p - cppx) / rx;
  const v1y = (y1p - cppy) / ry;
  const v2x = (-x1p - cppx) / rx;
  const v2y = (-y1p - cppy) / ry;

  const startAngle = Math.atan2(v1y, v1x);
  const endAngle = Math.atan2(v2y, v2x);

  let delta = endAngle - startAngle;
  if (sweep && delta < 0) delta += 2 * Math.PI;
  if (!sweep && delta > 0) delta -= 2 * Math.PI;

  // Phaser `arc` anticlockwise parametresi SVG sweep'in tersi:
  // SVG sweep true = clockwise = anticlockwise false.
  const anticlockwise = !sweep;

  return {
    type: 'arc',
    cx: cxp,
    cy: cyp,
    rx,
    ry,
    rotation: phiDeg,
    startAngle,
    endAngle: startAngle + delta,
    anticlockwise,
    x: x2,
    y: y2,
  };
}

/**
 * Ayrıştırılmış SVG path komutlarını `DrawCommand` listesine çevirir.
 * Yaylar merkez parametrizasyonuna dönüştürülür.
 */
export function convertCommands(commands: PathCommand[]): DrawCommand[] {
  const out: DrawCommand[] = [];
  let currentX = 0;
  let currentY = 0;

  for (const cmd of commands) {
    switch (cmd.type) {
      case 'M':
        out.push(cmd);
        currentX = cmd.x;
        currentY = cmd.y;
        break;
      case 'L':
        out.push(cmd);
        currentX = cmd.x;
        currentY = cmd.y;
        break;
      case 'C':
        out.push(cmd);
        currentX = cmd.x;
        currentY = cmd.y;
        break;
      case 'Q':
        out.push(cmd);
        currentX = cmd.x;
        currentY = cmd.y;
        break;
      case 'A':
        out.push(
          arcToCenter(
            currentX,
            currentY,
            cmd.rx,
            cmd.ry,
            cmd.rotation,
            cmd.largeArc,
            cmd.sweep,
            cmd.x,
            cmd.y,
          ),
        );
        currentX = cmd.x;
        currentY = cmd.y;
        break;
      case 'Z':
        out.push(cmd);
        break;
    }
  }

  return out;
}

/**
 * Çizim komutlarını Phaser Graphics nesnesine uygular.
 *
 * `scale` tüm koordinatları (hotspot çıkarılmadan önce) büyütür;
 * `offsetX`/`offsetY` nihai pozisyon kaymasıdır.
 */
export function drawCommands(
  graphics: Phaser.GameObjects.Graphics,
  commands: DrawCommand[],
  scale = 1,
  offsetX = 0,
  offsetY = 0,
): void {
  let currentX = 0;
  let currentY = 0;
  let subpathStartX = 0;
  let subpathStartY = 0;

  for (const cmd of commands) {
    switch (cmd.type) {
      case 'M': {
        const x = cmd.x * scale + offsetX;
        const y = cmd.y * scale + offsetY;
        graphics.moveTo(x, y);
        currentX = x;
        currentY = y;
        subpathStartX = x;
        subpathStartY = y;
        break;
      }
      case 'L': {
        const x = cmd.x * scale + offsetX;
        const y = cmd.y * scale + offsetY;
        graphics.lineTo(x, y);
        currentX = x;
        currentY = y;
        break;
      }
      case 'C':
        drawCubicBezier(graphics, currentX, currentY, cmd, scale, offsetX, offsetY);
        currentX = cmd.x * scale + offsetX;
        currentY = cmd.y * scale + offsetY;
        break;
      case 'Q':
        drawQuadraticBezier(graphics, currentX, currentY, cmd, scale, offsetX, offsetY);
        currentX = cmd.x * scale + offsetX;
        currentY = cmd.y * scale + offsetY;
        break;
      case 'arc': {
        drawArc(graphics, cmd, scale, offsetX, offsetY);
        currentX = cmd.x * scale + offsetX;
        currentY = cmd.y * scale + offsetY;
        break;
      }
      case 'Z':
        graphics.closePath();
        currentX = subpathStartX;
        currentY = subpathStartY;
        break;
    }
  }
}

function drawCubicBezier(
  graphics: Phaser.GameObjects.Graphics,
  x0: number,
  y0: number,
  cmd: CubicBezierCommand,
  scale: number,
  offsetX: number,
  offsetY: number,
): void {
  const startX = (x0 - offsetX) / scale;
  const startY = (y0 - offsetY) / scale;
  const steps = Math.max(8, Math.ceil(Math.abs(cmd.x - startX) + Math.abs(cmd.y - startY)));
  const x1 = cmd.x1 * scale + offsetX;
  const y1 = cmd.y1 * scale + offsetY;
  const x2 = cmd.x2 * scale + offsetX;
  const y2 = cmd.y2 * scale + offsetY;
  const x3 = cmd.x * scale + offsetX;
  const y3 = cmd.y * scale + offsetY;

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    const ax = mt * mt * mt * x0 + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * x3;
    const ay = mt * mt * mt * y0 + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y3;
    graphics.lineTo(ax, ay);
  }
}

function drawArc(
  graphics: Phaser.GameObjects.Graphics,
  cmd: ArcSegment,
  scale: number,
  offsetX: number,
  offsetY: number,
): void {
  const cx = cmd.cx * scale + offsetX;
  const cy = cmd.cy * scale + offsetY;
  const rx = cmd.rx * scale;
  const ry = cmd.ry * scale;
  const phi = toRadians(cmd.rotation);
  const cosP = Math.cos(phi);
  const sinP = Math.sin(phi);

  const delta = cmd.endAngle - cmd.startAngle;
  // Normalizasyon olmadan adım sayısını tutarlı hesaplamak için mutlak açı farkı.
  const sweepAngle = Math.abs(delta);
  const circumference = Math.PI * (rx + ry) * (sweepAngle / (2 * Math.PI));
  // Piksel başına en az 4 örnek; küçük cursor'larda bile yuvarlak görünür.
  const steps = Math.max(8, Math.ceil(circumference * 0.5));

  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const theta = cmd.startAngle + delta * t;
    const u = Math.cos(theta);
    const v = Math.sin(theta);
    // Elips üzerindeki döndürülmemiş nokta.
    const x1 = rx * u;
    const y1 = ry * v;
    // phi açısıyla döndür.
    const x = cx + x1 * cosP - y1 * sinP;
    const y = cy + x1 * sinP + y1 * cosP;
    graphics.lineTo(x, y);
  }
}

function drawQuadraticBezier(
  graphics: Phaser.GameObjects.Graphics,
  x0: number,
  y0: number,
  cmd: QuadraticBezierCommand,
  scale: number,
  offsetX: number,
  offsetY: number,
): void {
  const startX = (x0 - offsetX) / scale;
  const startY = (y0 - offsetY) / scale;
  const steps = Math.max(8, Math.ceil(Math.abs(cmd.x - startX) + Math.abs(cmd.y - startY)));
  const x1 = cmd.x1 * scale + offsetX;
  const y1 = cmd.y1 * scale + offsetY;
  const x2 = cmd.x * scale + offsetX;
  const y2 = cmd.y * scale + offsetY;

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    const ax = mt * mt * x0 + 2 * mt * t * x1 + t * t * x2;
    const ay = mt * mt * y0 + 2 * mt * t * y1 + t * t * y2;
    graphics.lineTo(ax, ay);
  }
}
