import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SidechainDucker } from '../../src/audio/sidechain';
import {
  UI_CRITICAL_DUCK,
  UI_CRITICAL_EVENTS,
  UiSoundKit,
  uiDuckProfiles,
  type UiSoundAssets,
} from '../../src/audio/ui';
import { FakeContext, stubFetch } from '../support/fakeAudio';
import { FakeAudioContext } from './music/mock-audio';

const ASSETS: UiSoundAssets = {
  press: ['p0.ogg', 'p1.ogg', 'p2.ogg'],
  denied: ['e0.ogg', 'e1.ogg', 'e2.ogg'],
  alert: ['w0.ogg', 'w1.ogg', 'w2.ogg'],
};

let clock = 0;

function setup() {
  const context = new FakeContext();
  context.state = 'running';
  const musicContext = new FakeAudioContext();
  const ducker = new SidechainDucker(
    musicContext as unknown as AudioContext,
    musicContext.destination as unknown as AudioNode,
  );
  const gain = (ducker.gain as unknown as { gain: { value: number } }).gain;
  const kit = new UiSoundKit({
    assets: ASSETS,
    context: context as unknown as AudioContext,
    now: () => clock,
    duck: { ducker },
  });
  return { kit, context, ducker, gain, musicContext };
}

beforeEach(() => {
  clock = 1000;
  stubFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('kritik olay kısması (isteğe bağlı, −6 dB, 120/80/450 ms)', () => {
  it('profil sözleşmesi: yarım kazanç (−6 dB), 120 ms iniş, 80 ms bekleme, 450 ms çıkış, yalnız kritik olaylar', () => {
    expect(UI_CRITICAL_DUCK).toEqual({ target: 0.5, attack: 0.12, hold: 0.08, release: 0.45 });
    expect(20 * Math.log10(UI_CRITICAL_DUCK.target)).toBeCloseTo(-6.02, 1);
    expect(Object.keys(uiDuckProfiles()).sort()).toEqual([...UI_CRITICAL_EVENTS].sort());
  });

  it('kritik olay otobüsü kısar; normal olay ve kısma kapalı kit kısmaz', async () => {
    const { kit, gain } = setup();
    await kit.preload();
    expect(kit.play('press')).toBe(true);
    expect(gain.value).toBe(1);
    clock += 500;
    expect(kit.play('denied')).toBe(true);
    expect(gain.value).toBe(0.5);

    // Kısma yapılandırılmamış kitte kritik olay da kısmaz.
    const context = new FakeContext();
    context.state = 'running';
    const plain = new UiSoundKit({
      assets: ASSETS,
      context: context as unknown as AudioContext,
      now: () => clock,
    });
    await plain.preload();
    expect(plain.play('denied')).toBe(true);
  });

  it('örtüşen kritik olaylarda en güçlü kısma korunur ve son olay bitene kadar çıkılmaz', async () => {
    const { kit, gain } = setup();
    await kit.preload();
    kit.play('denied');
    expect(gain.value).toBe(0.5);
    // Kullanıcı daha güçlü bir profil isteyen özel bir kit kurarsa (örtüşme) en düşük hedef kazanır.
    const context = new FakeContext();
    context.state = 'running';
    const musicContext = new FakeAudioContext();
    const ducker = new SidechainDucker(
      musicContext as unknown as AudioContext,
      musicContext.destination as unknown as AudioNode,
    );
    const strong = new UiSoundKit({
      assets: ASSETS,
      context: context as unknown as AudioContext,
      now: () => clock,
      duck: {
        ducker,
        profiles: { denied: UI_CRITICAL_DUCK, alert: { ...UI_CRITICAL_DUCK, target: 0.25 } },
      },
    });
    await strong.preload();
    strong.play('denied');
    clock += 500;
    strong.play('alert');
    const strongGain = (ducker.gain as unknown as { gain: { value: number } }).gain;
    expect(strongGain.value).toBe(0.25);
    clock += 500;
    strong.play('denied');
    // Daha zayıf olay gelse de kısma güçlü hedefte kalır.
    expect(strongGain.value).toBe(0.25);
  });

  it('iptal (stopAll), askıya alma, sessizlik ve söküm kısmayı geri alır; kit ducker sahibi değildir', async () => {
    for (const release of ['stopAll', 'suspend', 'mute', 'dispose'] as const) {
      const { kit, gain, ducker } = setup();
      await kit.preload();
      kit.play('denied');
      expect(gain.value, release).toBe(0.5);
      if (release === 'stopAll') kit.stopAll();
      else if (release === 'suspend') kit.suspend();
      else if (release === 'mute') kit.setSettings({ muted: true });
      else kit.dispose();
      expect(gain.value, release).toBe(1);
      // Ducker kit tarafından sökülmez: bağlı kalır ve kullanılabilir.
      expect(() => ducker.duck(UI_CRITICAL_DUCK)).not.toThrow();
    }
  });

  it('sessizken kritik olay çalmaz ve kısmaz', async () => {
    const { kit, gain } = setup();
    await kit.preload();
    kit.setSettings({ muted: true });
    expect(kit.play('denied')).toBe(false);
    expect(gain.value).toBe(1);
  });
});
