import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MotionController } from '../../../src/ui/motion/MotionController';
import { MOTION_SAFETY_MARGIN_MS } from '../../../src/ui/motion/presets';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const controller = (
  reduced = false,
  extra: ConstructorParameters<typeof MotionController>[0] = {},
) => new MotionController({ reducedMotion: () => reduced, ...extra });

describe('hareket azaltma ve süre politikası', () => {
  it('dekor 0 olur, anlamsal süre korunur, işlevsel süre HİÇ değişmez', () => {
    const reduced = controller(true);
    expect(reduced.effectiveMs(200)).toBe(0);
    expect(reduced.effectiveMs(200, 'decor')).toBe(0);
    expect(reduced.effectiveMs(200, 'semantic')).toBe(200);
    expect(reduced.effectiveMs(1500, 'functional')).toBe(1500);
    const normal = controller(false);
    expect(normal.effectiveMs(200, 'decor')).toBe(200);
    expect(normal.effectiveMs(1500, 'functional')).toBe(1500);
  });

  it('sistem tercihi matchMedia ile okunur; elle geçersiz kılma null ile sisteme döner', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
    }));
    const motion = new MotionController();
    expect(motion.reducedMotion).toBe(true);
    motion.setReducedMotion(false);
    expect(motion.reducedMotion).toBe(false);
    motion.setReducedMotion(null);
    expect(motion.reducedMotion).toBe(true);
    vi.stubGlobal('matchMedia', undefined);
    expect(new MotionController().reducedMotion).toBe(false);
  });
});

describe('geçiş grubu hakkı ve temizlik', () => {
  it('hak süreyi taşır; finish onFinal çağırır ve ikinci finish etkisizdir', () => {
    const motion = controller();
    const onFinal = vi.fn();
    const grant = motion.requestGroup({ priority: 'user', durationMs: 200, onFinal })!;
    expect(grant.durationMs).toBe(200);
    expect(grant.active).toBe(true);
    expect(motion.usage.groups).toBe(1);
    grant.finish();
    grant.finish();
    expect(onFinal).toHaveBeenCalledTimes(1);
    expect(grant.active).toBe(false);
    expect(motion.usage.groups).toBe(0);
  });

  it('animasyon olayı gelmese de süre + emniyet payı sonunda temizlik tamamlanır', () => {
    const motion = controller();
    const onFinal = vi.fn();
    motion.requestGroup({ priority: 'user', durationMs: 200, onFinal });
    vi.advanceTimersByTime(200 + MOTION_SAFETY_MARGIN_MS - 1);
    expect(onFinal).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onFinal).toHaveBeenCalledTimes(1);
    expect(motion.usage.groups).toBe(0);
  });

  it('sıfır sürede kaynak temizliği SENKRON yapılır ve hiçbir bütçe tüketilmez', () => {
    const motion = controller();
    const onFinal = vi.fn();
    const grant = motion.requestGroup({ priority: 'user', durationMs: 0, onFinal })!;
    expect(onFinal).toHaveBeenCalledTimes(1);
    expect(grant.active).toBe(false);
    expect(grant.durationMs).toBe(0);
    expect(motion.usage.groups).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('hareket azaltmada dekor grubu senkron biter; anlamsal grup süresini korur', () => {
    const motion = controller(true);
    const decorFinal = vi.fn();
    motion.requestGroup({ priority: 'decor', durationMs: 300, onFinal: decorFinal });
    expect(decorFinal).toHaveBeenCalledTimes(1);
    const semanticFinal = vi.fn();
    const grant = motion.requestGroup({
      priority: 'user',
      kind: 'semantic',
      durationMs: 300,
      onFinal: semanticFinal,
    })!;
    expect(grant.durationMs).toBe(300);
    expect(semanticFinal).not.toHaveBeenCalled();
    grant.finish();
    expect(semanticFinal).toHaveBeenCalledTimes(1);
  });

  it('işlevsel süre hareket azaltmada da korunur', () => {
    const motion = controller(true);
    const grant = motion.requestGroup({ priority: 'user', kind: 'functional', durationMs: 800 })!;
    expect(grant.durationMs).toBe(800);
    grant.finish();
  });

  it('bir onFinal fırlatsa kalan temizlik sürer ve hata bildirilir', () => {
    const onError = vi.fn();
    const motion = controller(false, { onError });
    const after = vi.fn();
    motion.requestGroup({
      priority: 'user',
      durationMs: 100,
      onFinal: () => {
        throw new Error('bozuk');
      },
    });
    motion.requestGroup({ priority: 'user', durationMs: 100, onFinal: after });
    motion.cancelAll();
    expect(after).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
    expect((onError.mock.calls[0][0] as Error).message).toBe('bozuk');
  });
});

describe('bütçe: 3 grup / 64 parçacık / 1 blur', () => {
  it('eşzamanlı grup sınırı 3: aynı öncelikte fazlası hareketsiz (null) ve son duruma gider', () => {
    const motion = controller();
    const finals = Array.from({ length: 6 }, () => vi.fn());
    const grants = finals.map((onFinal) =>
      motion.requestGroup({ priority: 'decor', durationMs: 200, onFinal }),
    );
    expect(grants.filter((grant) => grant !== null)).toHaveLength(3);
    expect(motion.usage.groups).toBe(3);
    // Reddedilenler son durumlarını hemen aldı; verilenler hâlâ sürüyor.
    expect(finals.map((fn) => fn.mock.calls.length)).toEqual([0, 0, 0, 1, 1, 1]);
  });

  it('öncelik: kullanıcı eylemi en eski dekoru keser, kritik kullanıcıyı keser, dekor dekoru kesemez', () => {
    const motion = controller();
    const decor = [vi.fn(), vi.fn(), vi.fn()];
    decor.forEach((onFinal) =>
      motion.requestGroup({ priority: 'decor', durationMs: 200, onFinal }),
    );
    const userFinal = vi.fn();
    expect(
      motion.requestGroup({ priority: 'user', durationMs: 200, onFinal: userFinal }),
    ).not.toBeNull();
    expect(decor.map((fn) => fn.mock.calls.length)).toEqual([1, 0, 0]);
    expect(motion.usage.groups).toBe(3);

    // Dekor, dolu bütçede hiçbir şeyi kesemez.
    const lateDecor = vi.fn();
    expect(
      motion.requestGroup({ priority: 'decor', durationMs: 200, onFinal: lateDecor }),
    ).toBeNull();
    expect(lateDecor).toHaveBeenCalledTimes(1);

    // Kritik, kullanıcıyı da keser (önce kalan dekorlar gider).
    const criticalFinal = vi.fn();
    expect(
      motion.requestGroup({ priority: 'critical', durationMs: 200, onFinal: criticalFinal }),
    ).not.toBeNull();
    expect(decor.map((fn) => fn.mock.calls.length)).toEqual([1, 1, 0]);
    expect(userFinal).not.toHaveBeenCalled();
  });

  it('kritik her zaman hak alır: hepsi kritikse en eski kritik son duruma gider', () => {
    const motion = controller();
    const finals = Array.from({ length: 4 }, () => vi.fn());
    const grants = finals.map((onFinal) =>
      motion.requestGroup({ priority: 'critical', durationMs: 200, onFinal }),
    );
    expect(grants.every((grant) => grant !== null)).toBe(true);
    expect(finals.map((fn) => fn.mock.calls.length)).toEqual([1, 0, 0, 0]);
    expect(motion.usage.groups).toBe(3);
    // Kullanıcı eylemi dolu kritik bütçeyi kesemez.
    const userFinal = vi.fn();
    expect(
      motion.requestGroup({ priority: 'user', durationMs: 200, onFinal: userFinal }),
    ).toBeNull();
    expect(userFinal).toHaveBeenCalledTimes(1);
  });

  it("parçacık toplamı 64'ü geçmez; fazlası kısılır, bırakınca hak geri döner", () => {
    const motion = controller();
    const a = motion.requestParticles(40)!;
    const b = motion.requestParticles(40)!;
    expect(a.count).toBe(40);
    expect(b.count).toBe(24);
    expect(motion.usage.particles).toBe(64);
    expect(motion.requestParticles(1)).toBeNull();
    a.release();
    a.release();
    expect(motion.usage.particles).toBe(24);
    expect(motion.requestParticles(100)!.count).toBe(40);
    expect(motion.requestParticles(0)).toBeNull();
    expect(motion.requestParticles(-3)).toBeNull();
  });

  it('hareket azaltmada parçacık verilmez', () => {
    expect(controller(true).requestParticles(10)).toBeNull();
  });

  it('en çok bir blur yüzeyi: ikincisi null (düz scrim yedeği), bırakınca yeniden verilir', () => {
    const motion = controller();
    const first = motion.requestBlur()!;
    expect(first).not.toBeNull();
    expect(motion.requestBlur()).toBeNull();
    expect(motion.usage.blur).toBe(1);
    first.dispose();
    first.dispose();
    expect(motion.usage.blur).toBe(0);
    expect(motion.requestBlur()).not.toBeNull();
  });

  it('olay salkımı: 30 olay (grup + 10 parçacık + blur) bütçeyi hiçbir anda aşmaz ve hepsi bir kez temizlenir', () => {
    const motion = controller();
    const finals = Array.from({ length: 30 }, () => vi.fn());
    const priorities = ['decor', 'user', 'critical'] as const;
    let peakGroups = 0;
    let peakParticles = 0;
    let peakBlur = 0;
    const parts: { release(): void }[] = [];
    const blurs: { dispose(): void }[] = [];
    finals.forEach((onFinal, index) => {
      motion.requestGroup({ priority: priorities[index % 3], durationMs: 200, onFinal });
      const burst = motion.requestParticles(10);
      if (burst) parts.push(burst);
      const blur = motion.requestBlur();
      if (blur) blurs.push(blur);
      peakGroups = Math.max(peakGroups, motion.usage.groups);
      peakParticles = Math.max(peakParticles, motion.usage.particles);
      peakBlur = Math.max(peakBlur, motion.usage.blur);
    });
    expect(peakGroups).toBeLessThanOrEqual(3);
    expect(peakParticles).toBeLessThanOrEqual(64);
    expect(peakBlur).toBeLessThanOrEqual(1);
    expect(peakParticles).toBe(64); // sınır doldu (6 × 10 + kısılan 4)
    vi.advanceTimersByTime(200 + MOTION_SAFETY_MARGIN_MS);
    for (const part of parts) part.release();
    for (const blur of blurs) blur.dispose();
    expect(finals.every((fn) => fn.mock.calls.length === 1)).toBe(true);
    expect(motion.usage).toEqual({ groups: 0, particles: 0, blur: 0 });
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('kesinti, askıya alma ve kaynak yaşam döngüsü', () => {
  it('cancelAll ve suspend bütün grupları son duruma götürür ve zamanlayıcı bırakmaz', () => {
    const motion = controller();
    const finals = [vi.fn(), vi.fn()];
    finals.forEach((onFinal) =>
      motion.requestGroup({ priority: 'user', durationMs: 300, onFinal }),
    );
    motion.cancelAll();
    expect(finals.every((fn) => fn.mock.calls.length === 1)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    const late = vi.fn();
    motion.requestGroup({ priority: 'user', durationMs: 300, onFinal: late });
    motion.suspend();
    expect(late).toHaveBeenCalledTimes(1);
  });

  it('sayfa gizlenince (visibilitychange) hareketler son duruma gider; görünür olunca etkisiz', () => {
    let state: DocumentVisibilityState = 'visible';
    const fake = new EventTarget() as unknown as Document;
    Object.defineProperty(fake, 'visibilityState', { get: () => state });
    const motion = controller(false, { visibilityTarget: fake });
    const onFinal = vi.fn();
    motion.requestGroup({ priority: 'user', durationMs: 300, onFinal });
    fake.dispatchEvent(new Event('visibilitychange'));
    expect(onFinal).not.toHaveBeenCalled();
    state = 'hidden';
    fake.dispatchEvent(new Event('visibilitychange'));
    expect(onFinal).toHaveBeenCalledTimes(1);
  });

  it('dispose: aktif hakları bitirir, dinleyiciyi söker; sonraki istekler hareketsiz', () => {
    const fake = new EventTarget() as unknown as Document;
    Object.defineProperty(fake, 'visibilityState', { get: () => 'hidden' });
    const motion = controller(false, { visibilityTarget: fake });
    const onFinal = vi.fn();
    motion.requestGroup({ priority: 'user', durationMs: 300, onFinal });
    motion.dispose();
    motion.dispose();
    expect(onFinal).toHaveBeenCalledTimes(1);
    const late = vi.fn();
    expect(motion.requestGroup({ priority: 'user', durationMs: 300, onFinal: late })).toBeNull();
    expect(late).toHaveBeenCalledTimes(1);
    expect(motion.requestParticles(5)).toBeNull();
    expect(motion.requestBlur()).toBeNull();
    // Dinleyici sökülmüş: gizlenme olayı artık hiçbir şeyi tetiklemez.
    fake.dispatchEvent(new Event('visibilitychange'));
    expect(late).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
