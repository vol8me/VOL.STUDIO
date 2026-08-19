import { describe, it, expect, vi } from 'vitest';
import { StateMachine } from '../../src/state/StateMachine';

type Phase = 'build' | 'wave' | 'reward' | 'over';

describe('StateMachine', () => {
  function machine(overrides: Partial<Record<Phase, unknown>> = {}) {
    return new StateMachine<Phase>({
      initial: 'build',
      states: {
        build: { transitions: ['wave'] },
        wave: { transitions: ['reward', 'over'] },
        reward: { transitions: ['build'] },
        over: { transitions: [] },
        ...overrides,
      } as never,
    });
  }

  it('başlangıç durumunun onEnter kancası from=null ile çalışır', () => {
    const onEnter = vi.fn();
    new StateMachine<Phase>({
      initial: 'build',
      states: {
        build: { onEnter },
        wave: {},
        reward: {},
        over: {},
      },
    });

    expect(onEnter).toHaveBeenCalledWith(null);
  });

  it('izin verilen geçiş yapılır', () => {
    const m = machine();
    expect(m.transition('wave')).toBe(true);
    expect(m.getState()).toBe('wave');
  });

  it('izin verilmeyen geçiş REDDEDİLİR ve durum değişmez', () => {
    const m = machine();
    expect(m.transition('reward')).toBe(false);
    expect(m.getState()).toBe('build');
  });

  it('reddedilen geçiş onRejected ile bildirilir', () => {
    const onRejected = vi.fn();
    const m = new StateMachine<Phase>({
      initial: 'build',
      states: { build: { transitions: ['wave'] }, wave: {}, reward: {}, over: {} },
      onRejected,
    });

    m.transition('over');
    expect(onRejected).toHaveBeenCalledWith('build', 'over');
  });

  it('transitions verilmezse HER duruma geçilebilir', () => {
    const m = new StateMachine<Phase>({
      initial: 'build',
      states: { build: {}, wave: {}, reward: {}, over: {} },
    });

    expect(m.transition('over')).toBe(true);
  });

  it('boş transitions dizisi durumu TERMİNAL yapar', () => {
    const m = machine();
    m.transition('wave');
    m.transition('over');

    expect(m.transition('build')).toBe(false);
    expect(m.getState()).toBe('over');
  });

  it('aynı duruma geçiş reddedilir (kancalar boşa çalışmaz)', () => {
    const m = machine();
    expect(m.transition('build')).toBe(false);
  });

  it('kanca sırası: onExit → durum değişimi → onEnter', () => {
    const order: string[] = [];
    const m = new StateMachine<Phase>({
      initial: 'build',
      states: {
        build: {
          transitions: ['wave'],
          onExit: (to) => order.push(`exit:build->${to}`),
        },
        wave: { onEnter: (from) => order.push(`enter:wave<-${from}`) },
        reward: {},
        over: {},
      },
    });

    m.transition('wave');
    expect(order).toEqual(['exit:build->wave', 'enter:wave<-build']);
  });

  it('onEnter içinde getState() YENİ durumu görür', () => {
    let seen: Phase | null = null;
    const m = new StateMachine<Phase>({
      initial: 'build',
      states: {
        build: { transitions: ['wave'] },
        wave: { onEnter: () => (seen = m.getState()) },
        reward: {},
        over: {},
      },
    });

    m.transition('wave');
    expect(seen).toBe('wave');
  });

  it('kanca içinden yeniden giriş reddedilir (sıra bozulmaz)', () => {
    // onEnter içinden transition çağırmak, yarım kalmış bir geçişin üstüne
    // ikinci bir geçiş bindirirdi.
    let inner: boolean | null = null;
    const m = new StateMachine<Phase>({
      initial: 'build',
      states: {
        build: { transitions: ['wave'] },
        wave: {
          transitions: ['reward'],
          onEnter: () => {
            inner = m.transition('reward');
          },
        },
        reward: {},
        over: {},
      },
    });

    m.transition('wave');
    expect(inner).toBe(false);
    expect(m.getState()).toBe('wave');
  });

  it('update yalnızca AKTİF durumun onUpdate kancasını çağırır', () => {
    const buildUpdate = vi.fn();
    const waveUpdate = vi.fn();
    const m = new StateMachine<Phase>({
      initial: 'build',
      states: {
        build: { transitions: ['wave'], onUpdate: buildUpdate },
        wave: { onUpdate: waveUpdate },
        reward: {},
        over: {},
      },
    });

    m.update(16);
    expect(buildUpdate).toHaveBeenCalledWith(16);
    expect(waveUpdate).not.toHaveBeenCalled();

    m.transition('wave');
    m.update(16);
    expect(waveUpdate).toHaveBeenCalledWith(16);
    expect(buildUpdate).toHaveBeenCalledTimes(1);
  });

  it('is() ve canTransition() sorgu için kullanılabilir', () => {
    const m = machine();
    expect(m.is('build')).toBe(true);
    expect(m.canTransition('wave')).toBe(true);
    expect(m.canTransition('reward')).toBe(false);
  });
});
