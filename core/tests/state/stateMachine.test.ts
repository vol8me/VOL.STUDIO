import { describe, it, expect, vi } from 'vitest';
import { StateMachine } from '../../src/state/StateMachine';

/**
 * Testin sözlüğü bilinçli olarak OYUN DIŞI: bir belge iş akışı.
 *
 * `StateMachine` hiçbir faz adı bilmez; onu oyun fazlarıyla test etmek bu
 * bağımsızlığı kanıtlamaz, aksine makineye sızmış bir varsayımı gizleyebilir.
 */
type Phase = 'draft' | 'review' | 'published' | 'archived';

describe('StateMachine', () => {
  function machine(overrides: Partial<Record<Phase, unknown>> = {}) {
    return new StateMachine<Phase>({
      initial: 'draft',
      states: {
        draft: { transitions: ['review'] },
        review: { transitions: ['published', 'archived'] },
        published: { transitions: ['draft'] },
        archived: { transitions: [] },
        ...overrides,
      } as never,
    });
  }

  it('başlangıç durumunun onEnter kancası from=null ile çalışır', () => {
    const onEnter = vi.fn();
    new StateMachine<Phase>({
      initial: 'draft',
      states: {
        draft: { onEnter },
        review: {},
        published: {},
        archived: {},
      },
    });

    expect(onEnter).toHaveBeenCalledWith(null);
  });

  it('izin verilen geçiş yapılır', () => {
    const m = machine();
    expect(m.transition('review')).toBe(true);
    expect(m.getState()).toBe('review');
  });

  it('izin verilmeyen geçiş REDDEDİLİR ve durum değişmez', () => {
    const m = machine();
    expect(m.transition('published')).toBe(false);
    expect(m.getState()).toBe('draft');
  });

  it('reddedilen geçiş onRejected ile bildirilir', () => {
    const onRejected = vi.fn();
    const m = new StateMachine<Phase>({
      initial: 'draft',
      states: { draft: { transitions: ['review'] }, review: {}, published: {}, archived: {} },
      onRejected,
    });

    m.transition('archived');
    expect(onRejected).toHaveBeenCalledWith('draft', 'archived');
  });

  it('transitions verilmezse HER duruma geçilebilir', () => {
    const m = new StateMachine<Phase>({
      initial: 'draft',
      states: { draft: {}, review: {}, published: {}, archived: {} },
    });

    expect(m.transition('archived')).toBe(true);
  });

  it('boş transitions dizisi durumu TERMİNAL yapar', () => {
    const m = machine();
    m.transition('review');
    m.transition('archived');

    expect(m.transition('draft')).toBe(false);
    expect(m.getState()).toBe('archived');
  });

  it('aynı duruma geçiş reddedilir (kancalar boşa çalışmaz)', () => {
    const m = machine();
    expect(m.transition('draft')).toBe(false);
  });

  it('kanca sırası: onExit → durum değişimi → onEnter', () => {
    const order: string[] = [];
    const m = new StateMachine<Phase>({
      initial: 'draft',
      states: {
        draft: {
          transitions: ['review'],
          onExit: (to) => order.push(`exit:draft->${to}`),
        },
        review: { onEnter: (from) => order.push(`enter:review<-${from}`) },
        published: {},
        archived: {},
      },
    });

    m.transition('review');
    expect(order).toEqual(['exit:draft->review', 'enter:review<-draft']);
  });

  it('onEnter içinde getState() YENİ durumu görür', () => {
    let seen: Phase | null = null;
    const m = new StateMachine<Phase>({
      initial: 'draft',
      states: {
        draft: { transitions: ['review'] },
        review: { onEnter: () => (seen = m.getState()) },
        published: {},
        archived: {},
      },
    });

    m.transition('review');
    expect(seen).toBe('review');
  });

  it('kanca içinden yeniden giriş reddedilir (sıra bozulmaz)', () => {
    // onEnter içinden transition çağırmak, yarım kalmış bir geçişin üstüne
    // ikinci bir geçiş bindirirdi.
    let inner: boolean | null = null;
    const m = new StateMachine<Phase>({
      initial: 'draft',
      states: {
        draft: { transitions: ['review'] },
        review: {
          transitions: ['published'],
          onEnter: () => {
            inner = m.transition('published');
          },
        },
        published: {},
        archived: {},
      },
    });

    m.transition('review');
    expect(inner).toBe(false);
    expect(m.getState()).toBe('review');
  });

  it('update yalnızca AKTİF durumun onUpdate kancasını çağırır', () => {
    const draftUpdate = vi.fn();
    const reviewUpdate = vi.fn();
    const m = new StateMachine<Phase>({
      initial: 'draft',
      states: {
        draft: { transitions: ['review'], onUpdate: draftUpdate },
        review: { onUpdate: reviewUpdate },
        published: {},
        archived: {},
      },
    });

    m.update(16);
    expect(draftUpdate).toHaveBeenCalledWith(16);
    expect(reviewUpdate).not.toHaveBeenCalled();

    m.transition('review');
    m.update(16);
    expect(reviewUpdate).toHaveBeenCalledWith(16);
    expect(draftUpdate).toHaveBeenCalledTimes(1);
  });

  it('is() ve canTransition() sorgu için kullanılabilir', () => {
    const m = machine();
    expect(m.is('draft')).toBe(true);
    expect(m.canTransition('review')).toBe(true);
    expect(m.canTransition('published')).toBe(false);
  });
});
