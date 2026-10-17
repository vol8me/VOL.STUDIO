/** Oda kurulumundan önce süreç içi kapasite ayırır; rezervasyon ve kopuk oyuncu odaları da sayılır. */
export class RoomSlots {
  private occupied = 0;

  constructor(readonly capacity: number) {
    if (!Number.isSafeInteger(capacity) || capacity < 1)
      throw new RangeError('Oda kapasitesi pozitif tam sayı olmalı.');
  }

  claim(): (() => void) | null {
    if (this.occupied >= this.capacity) return null;
    this.occupied++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.occupied--;
    };
  }
}
