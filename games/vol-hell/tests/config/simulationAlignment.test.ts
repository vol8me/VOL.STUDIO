import { describe, expect, it } from 'vitest';
import { gameConfig } from '@/config/game';
import { simulationConfig } from '@/config/simulation';

/**
 * HEADLESS ile PRODUCTION arasındaki hizalama.
 *
 * Headless simülasyon, ölçtüğü yükün oyunda gerçekten oluşan yük olduğunu
 * iddia eder. O iddia yalnız aynı TEMPODA koşarken geçerlidir: 16 ms'lik bir
 * adım 62,5 Hz, 16,667 ms'lik bir adım 60 Hz demektir ve aradaki fark her
 * kare başına düşen işi değiştirir.
 *
 * İki sayı elle tutulduğunda ayrışma SESSİZDİR — biri değişir, benchmark
 * eskisini ölçmeye devam eder. Bu dosya o sessizliği kapatır.
 *
 * SINIR: bu test tempoyu hizalar, MODELLERİ değil. Headless simülasyon
 * production'ın kanonik oyun döngüsü değildir ve olduğunu iddia etmez
 * (bkz. `VolHellSimulation` sınıf yorumu): mermi, yetenek, elite/boss yapay
 * zekâsı ve gerçek çarpışma orada birebir yoktur. Benchmark sonucu "aynı
 * tempoda koşan dalga/ekonomi/doğum yükü"dür, "production oyununun tamamı"
 * değil.
 */
describe('headless ↔ production hizalaması', () => {
  it('simülasyon adımı production sabit adımından TÜRER', () => {
    expect(
      simulationConfig.defaultStepMs,
      'headless farklı bir tempoda koşarsa benchmark production yükünü ölçmez',
    ).toBe(gameConfig.fixedStepMs);
  });

  it('adım boyu gerçek bir kare süresidir — kaza eseri bir sayı değil', () => {
    /* 60 Hz civarı bir aralık: 30–240 Hz dışına düşen bir adım ölçümü anlamsız kılar. */
    expect(simulationConfig.defaultStepMs).toBeGreaterThan(1000 / 240);
    expect(simulationConfig.defaultStepMs).toBeLessThan(1000 / 30);
  });
});
