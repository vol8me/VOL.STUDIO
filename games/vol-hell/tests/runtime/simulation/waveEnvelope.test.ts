import { beforeAll, describe, expect, it } from 'vitest';
import { VolHellSimulation } from '@/runtime/simulation/VolHellSimulation';
import { simulationConfig } from '@/config/simulation';

/**
 * YİRMİ DALGALIK KOŞU — elle smoke testinin yerine geçen ölçüm.
 *
 * Bir dönem "20 dalgalık manuel smoke testi hâlâ gerekli" diye kayıtlıydı:
 * yetenek ölçeklemesi ve dalga temposu yalnız oynayarak görülüyordu. Simülasyon
 * renderer'dan bağımsız olduğu için o koşu artık headless yapılabilir.
 *
 * İddialar ZARFTIR, sabit sayı değil. Doğum stokastiktir; "20. dalgada tam 37
 * düşman" gibi bir iddia her denge değişiminde kırılır ve kırıldığında hiçbir
 * şey öğretmez. Zarf ise gerçek gerilemeyi yakalar: dalga ilerlemiyor, düşman
 * sayısı patlıyor, ekonomi durmuş, koşu hiç bitmiyor.
 */
const STEP_MS = simulationConfig.defaultStepMs;
/** 20 dalgayı geçmeye yeten süre; koşu erken biterse `runCompleted` yakalar. */
const FRAMES = Math.ceil((20 * 60 * 1000) / STEP_MS);

/**
 * Eşzamanlı düşman TAVANI.
 *
 * Ölçüldü (20 dalga, üç tohum): tepe 41 / 30 / 31. Tavan 64, gözlenen tepeye
 * ~%56 pay bırakır. Sayı bir hedef değil bir ALARM: doğum temposu ölümden
 * hızlı olduğunda sayı yüzlere çıkar ve oyun cihazda önce yavaşlar, sonra
 * durur — yalnız oynayarak fark edilen türden bir gerileme.
 */
const ENEMY_CEILING = 64;

function run(seed: number) {
  const simulation = new VolHellSimulation({ seed });
  simulation.run(FRAMES, STEP_MS);
  return simulation.snapshot();
}

type Run = ReturnType<typeof run>;

/*
 * Koşu tohum başına BİR KEZ yapılır. Her `it` kendi koşusunu açtığında aynı
 * 20 dalga yedi kez simüle ediliyordu; kapsam ölçümü altında (v8 enstrümanı)
 * bu, dosyayı 5 sn'lik varsayılan zaman aşımının üstüne çıkarıp `just coverage`
 * koşusunu düşürdü — testler tek başına koşarken yeşildi.
 */
const SEED = 0x5eed;
/** Gerçek bir iş yükü: kapsam enstrümanı altında tek sim ölçüldü ~1,9 sn. */
const RUN_TIMEOUT_MS = 60_000;

let base: Run;
let repeat: Run;
let other: Run;

beforeAll(() => {
  base = run(SEED);
  repeat = run(SEED);
  other = run(0x1234);
}, RUN_TIMEOUT_MS);

describe('VOL.HELL — 20 dalgalık headless koşu', () => {
  it('koşu hedef dalgaya ulaşır', () => {
    expect(base.waves.length).toBeGreaterThanOrEqual(20);
    expect(other.waves.length).toBeGreaterThanOrEqual(20);
  });

  it('dalgalar ilerler ve koşu sonlanır', () => {
    const state = base;

    // Dalga numaraları ARTAN olmalı; tekrar eden ya da geri giden bir sayı
    // dalga yöneticisinin sıfırlandığını gösterir.
    const waves = [...state.waves];
    expect(waves).toEqual([...waves].sort((a, b) => a - b));
    expect(new Set(waves).size).toBe(waves.length);
  });

  /*
   * Düşman sayısının tavanı ölçülür: doğum temposu ölümden hızlı olursa sayı
   * sınırsız büyür ve oyun cihazda önce yavaşlar, sonra durur. Bu, yalnız
   * oynayarak fark edilen türden bir gerilemeydi.
   */
  it('düşman sayısı patlamaz', () => {
    const state = base;
    expect(state.maxEnemies).toBeGreaterThan(0);
    expect(state.maxEnemies).toBeLessThan(ENEMY_CEILING);
    expect(state.enemyCount).toBeLessThanOrEqual(state.maxEnemies);
  });

  it('ekonomi ilerler — dalga geçiyor ama kaynak durmuyor', () => {
    const state = base;
    /* Ölçüldü: üç tohumda da seviye 19'a, spark 11.000'in üstüne çıkıyor. */
    expect(state.economy.level).toBeGreaterThan(5);
    expect(state.economy.spark).toBeGreaterThan(1000);
    expect(state.runCompleted, '20 dalgalık koşu sonlanmalı').toBe(true);
  });

  /* Elite ve boss dalgaları tempo sözleşmesinin parçasıdır; hiç çıkmazsa denge kaymıştır. */
  it('elite ve boss dalgaları 20 dalga içinde ortaya çıkar', () => {
    const state = base;
    expect(state.eliteWaves.length).toBeGreaterThan(0);
    expect(state.bossWaves.length).toBeGreaterThan(0);
  });

  /*
   * Aynı tohum aynı koşuyu vermeli: zarf testleri ancak koşu tekrar
   * üretilebilirse bir gerilemeyi işaret edebilir.
   */
  it('aynı tohum aynı koşuyu üretir', () => {
    expect(base.waves).toEqual(repeat.waves);
    expect(base.eliteWaves).toEqual(repeat.eliteWaves);
    expect(base.bossWaves).toEqual(repeat.bossWaves);
    expect(base.economy).toEqual(repeat.economy);
  });

  it('farklı tohum aynı zarfın içinde kalır', () => {
    // Zarf aynı kalmalı; içerik farklı olabilir.
    expect(other.maxEnemies).toBeGreaterThan(0);
    expect(other.maxEnemies).toBeLessThan(ENEMY_CEILING);
    expect(other.runCompleted).toBe(true);
  });
});
