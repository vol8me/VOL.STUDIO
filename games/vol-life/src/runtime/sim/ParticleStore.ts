export interface ParticleSnapshot {
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly type: Uint8Array;
}

export class ParticleStore {
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly forceX: Float32Array;
  readonly forceY: Float32Array;
  readonly type: Uint8Array;

  constructor(readonly count: number) {
    if (!Number.isInteger(count) || count < 1) {
      throw new RangeError(`Parçacık sayısı pozitif bir tam sayı olmalı: ${count}`);
    }
    this.x = new Float32Array(count);
    this.y = new Float32Array(count);
    this.vx = new Float32Array(count);
    this.vy = new Float32Array(count);
    this.forceX = new Float32Array(count);
    this.forceY = new Float32Array(count);
    this.type = new Uint8Array(count);
  }

  snapshot(): ParticleSnapshot {
    return {
      x: this.x.slice(),
      y: this.y.slice(),
      vx: this.vx.slice(),
      vy: this.vy.slice(),
      type: this.type.slice(),
    };
  }

  restore(snapshot: ParticleSnapshot): void {
    const arrays = [snapshot.x, snapshot.y, snapshot.vx, snapshot.vy, snapshot.type];
    if (arrays.some((array) => array.length !== this.count)) {
      throw new RangeError(`Parçacık snapshotı ${this.count} değer taşımalı`);
    }
    this.x.set(snapshot.x);
    this.y.set(snapshot.y);
    this.vx.set(snapshot.vx);
    this.vy.set(snapshot.vy);
    this.type.set(snapshot.type);
    this.forceX.fill(0);
    this.forceY.fill(0);
  }
}
