export interface MatterReservoirSnapshot {
  readonly external: number;
  readonly voidLossTotal: number;
}

/**
 * Aktif dünyanın dışındaki madde muhasebesi (DESIGN.md §2). Void'a düşen madde
 * burada birikir; geri dönüş yalnız Adım 5'in görünür ekolojik süreciyledir,
 * bu sınıf otomatik tamamlama yapmaz.
 */
export class MatterReservoir {
  private externalMatter = 0;
  private lossTotal = 0;

  get external(): number {
    return this.externalMatter;
  }

  get voidLossTotal(): number {
    return this.lossTotal;
  }

  recordVoidLoss(count = 1): void {
    if (!Number.isInteger(count) || count < 1) {
      throw new RangeError(`Void kaybı pozitif tam sayı olmalı: ${count}`);
    }
    this.externalMatter += count;
    this.lossTotal += count;
  }

  reseed(count: number): number {
    const actual = Math.min(this.externalMatter, Math.max(0, Math.floor(count)));
    this.externalMatter -= actual;
    return actual;
  }

  snapshot(): MatterReservoirSnapshot {
    return { external: this.externalMatter, voidLossTotal: this.lossTotal };
  }

  restore(snapshot: MatterReservoirSnapshot): void {
    validateMatterReservoirSnapshot(snapshot);
    this.externalMatter = snapshot.external;
    this.lossTotal = snapshot.voidLossTotal;
  }
}

export function validateMatterReservoirSnapshot(snapshot: MatterReservoirSnapshot): void {
  const valid = [snapshot.external, snapshot.voidLossTotal].every(
    (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff,
  );
  if (!valid || snapshot.external > snapshot.voidLossTotal) {
    throw new RangeError('Madde rezervuarı sayaçları uint32 ve tutarlı olmalı.');
  }
}
