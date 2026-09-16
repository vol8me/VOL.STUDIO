/**
 * Yörünge ölçüleri (E6). Eski tek fonksiyon `trajectoryAutocorrelation` adını
 * taşıyordu ama otokorelasyon HESAPLAMIYORDU: `lag` gecikmeli, normalize
 * edilmemiş ortalama kare yer değiştirme döndürüyordu ve sınıflandırıcı bunu
 * 0,8'lik birimsiz bir "otokorelasyon" eşiğiyle karşılaştırıyordu — birim bile
 * tutmuyordu. Üç büyüklük artık ayrı ayrı ve birimi belli:
 *
 * - VACF: normalize hız otokorelasyonu, [-1, 1] aralığında birimsiz;
 * - MSD: ortalama kare yer değiştirme, dünya birimi karesi;
 * - recurrence: parçacığın τ sonra başlangıç komşuluğuna dönme payı, [0, 1].
 */

export interface TrajectoryFrame {
  readonly tick: number;
  /** Slot başına [x, y]; pasif slotlar NaN taşır. */
  readonly positions: Float32Array;
  /** Slot başına [vx, vy]. */
  readonly velocities: Float32Array;
}

export interface TrajectoryMeasures {
  readonly velocityAutocorrelation: number;
  readonly meanSquaredDisplacement: number;
  readonly recurrenceFraction: number;
  /** Ölçümün dayandığı parçacık sayısı; sıfırsa değerler tanımsızdır. */
  readonly sampleCount: number;
}

/**
 * Lag SANİYE ile tanımlanır ve `fixedStepMs` ile tick'e çevrilir. Tick cinsinden
 * doğrudan verilseydi, tempo değiştiğinde aynı sayı başka bir fiziksel süreye
 * karşılık gelir ve eşikler sessizce kayardı.
 */
export function resolveLagTicks(
  lagSeconds: number,
  fixedStepMs: number,
  sampleIntervalTicks: number,
): number {
  if (!(lagSeconds > 0) || !Number.isFinite(lagSeconds)) {
    throw new RangeError(`Lag saniyesi pozitif ve sonlu olmalı: ${lagSeconds}`);
  }
  if (!(fixedStepMs > 0) || !Number.isFinite(fixedStepMs)) {
    throw new RangeError(`Sabit adım pozitif ve sonlu olmalı: ${fixedStepMs}`);
  }
  if (!Number.isInteger(sampleIntervalTicks) || sampleIntervalTicks < 1) {
    throw new RangeError(`Örnek aralığı pozitif tam sayı olmalı: ${sampleIntervalTicks}`);
  }
  /*
   * Kayan nokta toleransı ŞART: üretim temposu `fixedStepMs = 1000/60` tam
   * bölünmeyen bir ondalıktır ve 1 saniye 59,99999999999999 tick üretir.
   * `Number.isInteger` ile doğrudan bakmak geçerli bir lag'i reddediyordu
   * (ölçüldü); yuvarlanmış tick geri çarpılıp sapma sınanır.
   */
  const raw = (lagSeconds * 1000) / fixedStepMs;
  const ticks = Math.round(raw);
  if (ticks < 1 || Math.abs(raw - ticks) > 1e-6 * Math.max(1, ticks)) {
    throw new RangeError(`Lag tam sayı tick üretmeli: ${lagSeconds} sn → ${raw} tick`);
  }
  if (ticks % sampleIntervalTicks !== 0) {
    throw new RangeError(`Lag örnek aralığına tam bölünmeli: ${ticks} / ${sampleIntervalTicks}`);
  }
  return ticks;
}

/**
 * VACF normalize edilir: aynı parçacığın kendi hız büyüklüğüne bölünür, böylece
 * hızlı parçacıklar ölçümü domine edemez ve sonuç [-1, 1] aralığında kalır.
 * Dairesel harekette yarım periyotta -1, tam periyotta +1 verir.
 */
export function measureTrajectory(
  past: TrajectoryFrame,
  current: TrajectoryFrame,
  recurrenceRadiusUnits: number,
): TrajectoryMeasures {
  const slots = past.velocities.length / 2;
  let dotSum = 0;
  let normSum = 0;
  let displacementSum = 0;
  let recurrent = 0;
  let count = 0;
  for (let slot = 0; slot < slots; slot++) {
    const pastVx = past.velocities[slot * 2];
    const pastVy = past.velocities[slot * 2 + 1];
    const currentVx = current.velocities[slot * 2];
    const currentVy = current.velocities[slot * 2 + 1];
    const pastX = past.positions[slot * 2];
    const pastY = past.positions[slot * 2 + 1];
    const currentX = current.positions[slot * 2];
    const currentY = current.positions[slot * 2 + 1];
    if (
      !Number.isFinite(pastVx) ||
      !Number.isFinite(currentVx) ||
      !Number.isFinite(pastX) ||
      !Number.isFinite(currentX)
    ) {
      continue;
    }
    const pastSpeedSquared = pastVx * pastVx + pastVy * pastVy;
    const currentSpeedSquared = currentVx * currentVx + currentVy * currentVy;
    if (pastSpeedSquared > 0 && currentSpeedSquared > 0) {
      dotSum +=
        (pastVx * currentVx + pastVy * currentVy) /
        Math.sqrt(pastSpeedSquared * currentSpeedSquared);
      normSum += 1;
    }
    const dx = currentX - pastX;
    const dy = currentY - pastY;
    displacementSum += dx * dx + dy * dy;
    if (Math.hypot(dx, dy) <= recurrenceRadiusUnits) recurrent++;
    count++;
  }
  return {
    velocityAutocorrelation: normSum > 0 ? dotSum / normSum : 0,
    meanSquaredDisplacement: count > 0 ? displacementSum / count : 0,
    recurrenceFraction: count > 0 ? recurrent / count : 0,
    sampleCount: count,
  };
}
