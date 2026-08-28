import { afterEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => {
  interface StoredScreen {
    destroy: ReturnType<typeof vi.fn>;
  }

  class FakeHud implements StoredScreen {
    readonly reset = vi.fn();
    readonly refreshLabels = vi.fn();
    readonly destroy = vi.fn();

    constructor() {
      state.huds.push(this);
    }
  }

  class FakeCards implements StoredScreen {
    readonly refreshLabels = vi.fn();
    readonly destroy = vi.fn();

    constructor(
      _parent: unknown,
      _cards: unknown,
      _economy: unknown,
      readonly callbacks: Record<string, (...args: never[]) => void>,
    ) {
      state.cards.push(this);
    }
  }

  class FakePause implements StoredScreen {
    readonly destroy = vi.fn();

    constructor(
      _parent: unknown,
      _audio: unknown,
      readonly callbacks: Record<string, () => void>,
    ) {
      if (state.failPause) throw new Error('pause kurulamadı');
      state.pauses.push(this);
    }
  }

  class FakeDeath implements StoredScreen {
    readonly destroy = vi.fn();

    constructor(
      _parent: unknown,
      readonly callbacks: Record<string, () => void>,
    ) {
      state.deaths.push(this);
    }
  }

  const state = {
    failPause: false,
    huds: [] as FakeHud[],
    cards: [] as FakeCards[],
    pauses: [] as FakePause[],
    deaths: [] as FakeDeath[],
    playSfx: vi.fn(() => Promise.resolve()),
  };

  return { state, FakeHud, FakeCards, FakePause, FakeDeath };
});

vi.mock('@/runtime/ui/GameHud', () => ({ GameHud: fakes.FakeHud }));
vi.mock('@/runtime/ui/CardScreens', () => ({ CardScreens: fakes.FakeCards }));
vi.mock('@/runtime/scene/PauseScreen', () => ({ PauseScreen: fakes.FakePause }));
vi.mock('@/runtime/scene/DeathScreen', () => ({ DeathScreen: fakes.FakeDeath }));
vi.mock('@/app/services', () => ({ gameAudio: { playSfx: fakes.state.playSfx } }));

import { GameScreenStack, type GameScreenStackOptions } from '@/runtime/scene/GameScreenStack';

function makeOptions(): {
  options: GameScreenStackOptions;
  effectsPlay: ReturnType<typeof vi.fn>;
  onRestart: ReturnType<typeof vi.fn>;
  onMainMenu: ReturnType<typeof vi.fn>;
} {
  const effectsPlay = vi.fn();
  const onRestart = vi.fn();
  const onMainMenu = vi.fn();
  return {
    options: {
      parent: document.body,
      player: { getX: () => 42, getPosition: () => ({ y: 84 }) },
      effects: { play: effectsPlay },
      cards: {},
      economy: {},
      audioSettings: {},
      onPauseForCard: vi.fn(),
      onResumeAfterCard: vi.fn(),
      onResumeFromMenu: vi.fn(),
      onRestart,
      onMainMenu,
    } as unknown as GameScreenStackOptions,
    effectsPlay,
    onRestart,
    onMainMenu,
  };
}

afterEach(() => {
  fakes.state.failPause = false;
  fakes.state.huds.length = 0;
  fakes.state.cards.length = 0;
  fakes.state.pauses.length = 0;
  fakes.state.deaths.length = 0;
  fakes.state.playSfx.mockClear();
});

describe('GameScreenStack', () => {
  it('dört yüzeyi kurar, HUD başlangıcını ve dil yenilemesini tek yerden yapar', () => {
    const stack = new GameScreenStack(makeOptions().options);

    expect(fakes.state.huds).toHaveLength(1);
    expect(fakes.state.cards).toHaveLength(1);
    expect(fakes.state.pauses).toHaveLength(1);
    expect(fakes.state.deaths).toHaveLength(1);
    expect(fakes.state.huds[0].reset).toHaveBeenCalledOnce();

    stack.refreshLabels();
    expect(fakes.state.huds[0].refreshLabels).toHaveBeenCalledOnce();
    expect(fakes.state.cards[0].refreshLabels).toHaveBeenCalledOnce();
  });

  it('kart ve menü aksiyonlarının efekt/ses/sahne niyetlerini korur', () => {
    const { options, effectsPlay, onRestart, onMainMenu } = makeOptions();
    new GameScreenStack(options);

    fakes.state.cards[0].callbacks.onCardTaken('shop' as never);
    expect(effectsPlay).toHaveBeenCalledWith('cardPicked', 42, 84);
    expect(fakes.state.playSfx).toHaveBeenCalledWith('cardBuy', expect.any(Object));

    fakes.state.pauses[0].callbacks.onRestart();
    fakes.state.deaths[0].callbacks.onMainMenu();
    expect(onRestart).toHaveBeenCalledOnce();
    expect(onMainMenu).toHaveBeenCalledOnce();
    expect(fakes.state.playSfx).toHaveBeenCalledWith('restart', expect.any(Object));
    expect(fakes.state.playSfx).toHaveBeenCalledWith('back', expect.any(Object));
  });

  it('bir destroy hatası diğer ekranların kapanmasını engellemez ve kapanış idempotenttir', () => {
    const stack = new GameScreenStack(makeOptions().options);
    fakes.state.deaths[0].destroy.mockImplementationOnce(() => {
      throw new Error('death cleanup');
    });

    expect(() => stack.destroy()).not.toThrow();
    expect(fakes.state.deaths[0].destroy).toHaveBeenCalledOnce();
    expect(fakes.state.pauses[0].destroy).toHaveBeenCalledOnce();
    expect(fakes.state.cards[0].destroy).toHaveBeenCalledOnce();
    expect(fakes.state.huds[0].destroy).toHaveBeenCalledOnce();

    stack.destroy();
    expect(fakes.state.huds[0].destroy).toHaveBeenCalledOnce();
  });

  it('constructor yarıda kalırsa daha önce kurulan yüzeyleri hemen bırakır', () => {
    fakes.state.failPause = true;

    expect(() => new GameScreenStack(makeOptions().options)).toThrow('pause kurulamadı');
    expect(fakes.state.huds[0].destroy).toHaveBeenCalledOnce();
    expect(fakes.state.cards[0].destroy).toHaveBeenCalledOnce();
    expect(fakes.state.deaths).toHaveLength(0);
  });
});
