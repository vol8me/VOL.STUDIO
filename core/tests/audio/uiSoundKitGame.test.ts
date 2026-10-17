import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  UI_SLIDER_RATE_RANGE,
  UI_SOUND_PALETTES,
  UiSoundKit,
  uiSoundAssets,
  uiSoundPaletteFor,
  type UiSoundAssets,
} from '../../src/audio/ui';
import { THEME_IDS } from '../../src/ui/themes/registry';
import { ThemeController } from '../../src/ui/themes/ThemeController';
import { uiIntentBusFor } from '../../src/ui/feedback/uiIntent';
import { Checkbox } from '../../src/ui/primitives/Checkbox';
import { Slider } from '../../src/ui/primitives/Slider';
import { FakeContext, playedUrls, stubFetch } from '../support/fakeAudio';

const stems = (id: string): string[] => [`${id}0.ogg`, `${id}1.ogg`, `${id}2.ogg`];
const ASSETS: UiSoundAssets = {
  hover: stems('h'),
  focus: stems('f'),
  toggleOn: stems('on'),
  toggleOff: stems('off'),
  sliderTick: stems('t'),
  press: stems('p'),
};
const OTHER_PALETTE: UiSoundAssets = { press: stems('q') };

let clock = 0;

async function ready() {
  const context = new FakeContext();
  context.state = 'running';
  const kit = new UiSoundKit({
    assets: ASSETS,
    context: context as unknown as AudioContext,
    now: () => clock,
  });
  await kit.preload();
  return { kit, context };
}

function pointerOver(target: Element, pointerType: string, relatedTarget: Node | null = null) {
  const event = new Event('pointerover', { bubbles: true });
  Object.assign(event, { pointerType, relatedTarget });
  target.dispatchEvent(event);
}

beforeEach(() => {
  clock = 1000;
  stubFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('oyun arayüzü sesleri: açma/kapama, değer perdesi, hover/odak, palet', () => {
  it('onay kutusu: işaretleyince toggleOn, işareti kaldırınca toggleOff çalar', async () => {
    const bus = uiIntentBusFor(document.body);
    const { kit, context } = await ready();
    kit.attach(bus.bus);
    const box = new Checkbox({ label: 'Gölge' });
    document.body.append(box.element);
    const input = box.element.querySelector('input')!;
    input.click();
    clock += 500;
    input.click();
    expect(playedUrls(context).map((url) => url.replace(/\d\.ogg$/, ''))).toEqual(['on', 'off']);
    bus.release();
  });

  it('kaydırıcı ticki: perde değerin konumuna bağlıdır (alçak değer alçak, yüksek değer yüksek)', async () => {
    const bus = uiIntentBusFor(document.body);
    const { kit, context } = await ready();
    kit.attach(bus.bus);
    const slider = new Slider({ label: 'Ses', min: 0, max: 100, value: 0 });
    document.body.append(slider.element);
    const input = slider.element.querySelector('input')!;
    const rates: number[] = [];
    for (const value of ['0', '50', '100']) {
      clock += 100;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      rates.push(context.sources.at(-1)!.playbackRate.value);
    }
    const [low, high] = UI_SLIDER_RATE_RANGE;
    // ±%4 titreşim payıyla beklenen konuma yakın ve artan.
    expect(rates[0]).toBeCloseTo(low, 0);
    expect(rates[2]).toBeCloseTo(high, 0);
    expect(rates[0]).toBeLessThan(rates[1]);
    expect(rates[1]).toBeLessThan(rates[2]);
    bus.release();
  });

  it('observe: yalnız gerçek fare hover sesi çalar; dokunma, çocuk geçişi ve devre dışı hedef çalmaz', async () => {
    const { kit, context } = await ready();
    const root = document.createElement('div');
    const button = document.createElement('button');
    const inner = document.createElement('span');
    button.append(inner);
    const disabled = document.createElement('button');
    disabled.disabled = true;
    root.append(button, disabled);
    document.body.append(root);
    kit.observe(root);

    pointerOver(button, 'touch');
    expect(context.sources).toHaveLength(0);
    pointerOver(disabled, 'mouse');
    expect(context.sources).toHaveLength(0);
    pointerOver(inner, 'mouse', button);
    expect(context.sources).toHaveLength(0);
    pointerOver(button, 'mouse', document.body);
    expect(playedUrls(context)[0]).toMatch(/^h/);
    // 70 ms içinde ikinci hover düşer (mikro aralık).
    clock += 30;
    pointerOver(button, 'mouse', document.body);
    expect(context.sources).toHaveLength(1);
    clock += 60;
    pointerOver(button, 'mouse', document.body);
    expect(context.sources).toHaveLength(2);
  });

  it('observe: klavye odağı (focus-visible) odak sesi çalar; fare odağı çalmaz; ikinci observe çoğalmaz', async () => {
    const { kit, context } = await ready();
    const root = document.createElement('div');
    const button = document.createElement('button');
    root.append(button);
    document.body.append(root);
    const first = kit.observe(root);
    expect(kit.observe(root)).toBe(first);

    const focusIn = (): void => {
      button.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    };
    const visible = vi.spyOn(button, 'matches');
    visible.mockImplementation((selector: string) => selector !== ':focus-visible');
    focusIn();
    expect(context.sources).toHaveLength(0);
    visible.mockImplementation(() => true);
    focusIn();
    expect(playedUrls(context)).toHaveLength(1);
    expect(playedUrls(context)[0]).toMatch(/^f/);

    first.dispose();
    clock += 500;
    focusIn();
    expect(context.sources).toHaveLength(1);
  });

  it('setAssets: palet değişince çalanlar kesilir, yeni set yüklenene dek sessiz kalır, sonra yeni dosyalar çalar', async () => {
    const { kit, context } = await ready();
    expect(kit.play('press')).toBe(true);
    expect(playedUrls(context)[0]).toMatch(/^p/);
    kit.setAssets(OTHER_PALETTE);
    expect(context.active).toHaveLength(0);
    clock += 500;
    expect(kit.play('press')).toBe(false);
    await kit.preload();
    clock += 500;
    expect(kit.play('press')).toBe(true);
    expect(playedUrls(context).at(-1)).toMatch(/^q/);
    // Eski olay yeni sette yoktur: sessiz.
    expect(kit.play('hover')).toBe(false);
  });

  it('her tema kimliği bir ses paletine eşlenir; bilinmeyen tema varsayılana düşer', () => {
    for (const theme of THEME_IDS) expect(UI_SOUND_PALETTES).toContain(uiSoundPaletteFor(theme));
    expect(uiSoundPaletteFor('default')).toBe('steel');
    expect(uiSoundPaletteFor('aurum')).toBe('aurum');
    expect(uiSoundPaletteFor('bilinmeyen')).toBe('steel');
  });

  it('followTheme: tema değişince palet değişir; bağ kesilince değişmez', async () => {
    const theme = new ThemeController();
    const { kit, context } = await ready();
    const subscription = kit.followTheme(theme, (palette) => uiSoundAssets('./', palette));
    await kit.preload();
    clock += 500;
    expect(kit.play('press')).toBe(true);
    expect(playedUrls(context).at(-1)).toContain('/steel/press-');
    theme.setTheme('aurum');
    await kit.preload();
    clock += 500;
    expect(kit.play('press')).toBe(true);
    expect(playedUrls(context).at(-1)).toContain('/aurum/press-');
    subscription.dispose();
    theme.setTheme('default');
    await kit.preload();
    clock += 500;
    expect(kit.play('press')).toBe(true);
    expect(playedUrls(context).at(-1)).toContain('/aurum/press-');
  });
});
