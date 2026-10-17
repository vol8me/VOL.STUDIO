import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SoundBank } from '../../src/audio/sfx/SoundBank';
import { FakeContext, FakeNode, playedUrls, stubFetch } from '../support/fakeAudio';

let context: FakeContext;
let bank: SoundBank;

async function make(maxVoices: number, maxVoicesPerSound = maxVoices): Promise<void> {
  context = new FakeContext();
  bank = new SoundBank(context as unknown as AudioContext, new FakeNode() as unknown as AudioNode, {
    maxVoices,
    maxVoicesPerSound,
  });
  for (const id of ['a', 'b', 'c']) bank.register(id, [`${id}.ogg`]);
  await bank.loadAll();
}

beforeEach(() => {
  stubFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SoundBank ses önceliği', () => {
  it('yalnız normal sesler: bütçe dolunca EN ESKİ ses düşer (eski davranış)', async () => {
    await make(2);
    expect(bank.play('a')).toBe(true);
    expect(bank.play('b')).toBe(true);
    expect(bank.play('c')).toBe(true);
    expect(context.sources[0].stop).toHaveBeenCalledTimes(1);
    expect(context.sources[1].stop).not.toHaveBeenCalled();
    expect(playedUrls(context)).toEqual(['a.ogg', 'b.ogg', 'c.ogg']);
  });

  it('kritik ses en eski NORMAL sesi düşürür, kritik olanlara dokunmaz', async () => {
    await make(2);
    bank.play('a', { priority: 'critical' });
    bank.play('b');
    expect(bank.play('c', { priority: 'critical' })).toBe(true);
    expect(context.sources[0].stop).not.toHaveBeenCalled();
    expect(context.sources[1].stop).toHaveBeenCalledTimes(1);
  });

  it('normal ses kritiği DÜŞÜRMEZ: bütçe kritiklerle doluysa kendisi atlanır (false)', async () => {
    await make(2);
    bank.play('a', { priority: 'critical' });
    bank.play('b', { priority: 'critical' });
    expect(bank.play('c')).toBe(false);
    expect(context.sources).toHaveLength(2);
    expect(context.sources.every((source) => source.stop.mock.calls.length === 0)).toBe(true);
  });

  it('hepsi kritikken yeni kritik en eski kritiği düşürür', async () => {
    await make(2);
    bank.play('a', { priority: 'critical' });
    bank.play('b', { priority: 'critical' });
    expect(bank.play('c', { priority: 'critical' })).toBe(true);
    expect(context.sources[0].stop).toHaveBeenCalledTimes(1);
  });

  it('kimlik başına sınırda da öncelik korunur', async () => {
    await make(4, 1);
    bank.play('a', { priority: 'critical' });
    // Aynı kimlikte normal ses, kritik sesi düşüremez.
    expect(bank.play('a')).toBe(false);
    expect(context.sources[0].stop).not.toHaveBeenCalled();
    // Aynı kimlikte kritik ses kendi kimliğinin eski sesini düşürebilir.
    expect(bank.play('a', { priority: 'critical' })).toBe(true);
    expect(context.sources[0].stop).toHaveBeenCalledTimes(1);
  });

  it('play yüklenmemiş kimlikte ve serbest bırakılmış bankada false döner', async () => {
    await make(2);
    expect(bank.play('yok')).toBe(false);
    bank.dispose();
    expect(bank.play('a')).toBe(false);
  });
});
