import type Phaser from 'phaser';
import type { WeatherRect } from './WeatherParticles';

interface Point {
  x: number;
  y: number;
}

export class TerrainContours {
  private readonly points: Point[] = Array.from({ length: 16 }, () => ({ x: 0, y: 0 }));
  private readonly clipped: Point[] = Array.from({ length: 16 }, () => ({ x: 0, y: 0 }));
  private readonly corners: Point[] = Array.from({ length: 4 }, () => ({ x: 0, y: 0 }));
  private readonly values = new Float64Array(4);

  draw(
    graphics: Phaser.GameObjects.Graphics,
    rect: WeatherRect,
    x: number,
    y: number,
    size: number,
    a: number,
    b: number,
    c: number,
    d: number,
  ): boolean {
    const values = this.values;
    values[0] = a;
    values[1] = b;
    values[2] = c;
    values[3] = d;
    const mask = Number(a > 0) | (Number(b > 0) << 1) | (Number(c > 0) << 2) | (Number(d > 0) << 3);
    if (mask === 0) return false;
    const corners = this.corners;
    corners[0].x = x;
    corners[0].y = y;
    corners[1].x = x + size;
    corners[1].y = y;
    corners[2].x = x + size;
    corners[2].y = y + size;
    corners[3].x = x;
    corners[3].y = y + size;
    if ((mask === 5 || mask === 10) && a + b + c + d <= 0) {
      for (let corner = 0; corner < 4; corner++) {
        if (values[corner] <= 0) continue;
        const next = (corner + 1) % 4;
        const previous = (corner + 3) % 4;
        this.points[0].x = corners[corner].x;
        this.points[0].y = corners[corner].y;
        this.cross(corner, next, this.points[1]);
        this.cross(previous, corner, this.points[2]);
        this.paint(graphics, rect, 3);
      }
      return true;
    }
    let count = 0;
    for (let corner = 0; corner < 4; corner++) {
      const next = (corner + 1) % 4;
      if (values[corner] > 0) {
        this.points[count].x = corners[corner].x;
        this.points[count++].y = corners[corner].y;
      }
      if (values[corner] > 0 !== values[next] > 0) this.cross(corner, next, this.points[count++]);
    }
    return this.paint(graphics, rect, count);
  }

  private cross(from: number, to: number, target: Point): void {
    const ratio = this.values[from] / (this.values[from] - this.values[to]);
    target.x = this.corners[from].x + (this.corners[to].x - this.corners[from].x) * ratio;
    target.y = this.corners[from].y + (this.corners[to].y - this.corners[from].y) * ratio;
  }

  private paint(graphics: Phaser.GameObjects.Graphics, rect: WeatherRect, count: number): boolean {
    let source = this.points;
    let target = this.clipped;
    for (let edge = 0; edge < 4; edge++) {
      const axis = edge < 2 ? 'x' : 'y';
      const limit =
        edge === 0
          ? rect.x
          : edge === 1
            ? rect.x + rect.width
            : edge === 2
              ? rect.y
              : rect.y + rect.height;
      const inside = (point: Point): boolean =>
        edge === 0 || edge === 2 ? point[axis] >= limit : point[axis] <= limit;
      let output = 0;
      for (let index = 0; index < count; index++) {
        const current = source[index];
        const previous = source[(index + count - 1) % count];
        const currentInside = inside(current);
        if (currentInside !== inside(previous)) {
          const ratio = (limit - previous[axis]) / (current[axis] - previous[axis]);
          target[output].x = previous.x + (current.x - previous.x) * ratio;
          target[output++].y = previous.y + (current.y - previous.y) * ratio;
        }
        if (currentInside) {
          target[output].x = current.x;
          target[output++].y = current.y;
        }
      }
      count = output;
      const swap = source;
      source = target;
      target = swap;
      if (count < 3) return false;
    }
    graphics.beginPath();
    graphics.moveTo(source[0].x, source[0].y);
    for (let index = 1; index < count; index++) graphics.lineTo(source[index].x, source[index].y);
    graphics.closePath();
    graphics.fillPath();
    return true;
  }
}
