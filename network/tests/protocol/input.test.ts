import { describe, expect, it } from 'vitest';
import { InputMailbox, parseInput, PROTOCOL_VERSION } from '../../src/protocol';

const intent = (seq: number) => ({
  seq,
  moveX: 1,
  moveY: 0,
  aimX: 0,
  aimY: 1,
  fire: true,
  boost: false,
  brake: false,
});

describe('bağlantı girdi sözleşmesi', () => {
  it('sürümü sabitler ve geçerli niyeti kabul eder', () => {
    expect(PROTOCOL_VERSION).toBe(1);
    expect(parseInput(intent(1))).toEqual(intent(1));
  });

  it('NaN, taşan eksen, diagonal hız ve hile amaçlı eksik alanı reddeder', () => {
    for (const payload of [
      null,
      [],
      { ...intent(1), seq: -1 },
      { ...intent(1), moveX: NaN },
      { ...intent(1), moveY: Infinity },
      { ...intent(1), moveX: 2 },
      { ...intent(1), moveY: 1 },
      { ...intent(1), fire: 'true' },
      { ...intent(1), brake: undefined },
    ]) {
      expect(parseInput(payload)).toBeNull();
    }
  });

  it('burst girdileri yalnız bir tick yürütür, tekrarları ve bayat dizileri yutar', () => {
    const mailbox = new InputMailbox(1);
    for (let seq = 1; seq <= 64; seq++) expect(mailbox.offer(intent(seq))).toBe('accepted');
    expect(mailbox.offer(intent(32))).toBe('stale');
    expect(mailbox.offer({ ...intent(65), moveX: 3 })).toBe('invalid');
    expect(mailbox.acknowledgedSeq).toBe(64);
    expect(mailbox.consume()).toMatchObject({ moveX: 1 });
    expect(mailbox.consume()).toMatchObject({ moveX: 1 });
    expect(mailbox.consume()).toMatchObject({ moveX: 0, fire: false });
  });

  it('kopma girdiyi bırakır; kusurlu tutma bütçesini reddeder', () => {
    expect(() => new InputMailbox(-1)).toThrow(RangeError);
    const mailbox = new InputMailbox();
    mailbox.offer(intent(1));
    mailbox.reset();
    expect(mailbox.consume().fire).toBe(false);
    expect(mailbox.offer(intent(1))).toBe('stale');
  });
});
