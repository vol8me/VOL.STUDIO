import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UiSoundKit, type UiSoundAssets } from '../../src/audio/ui';
import { uiIntentBusFor } from '../../src/ui/feedback/uiIntent';
import { Tabs, type TabDefinition } from '../../src/ui/layout/Tabs';
import { Button } from '../../src/ui/primitives/Button';
import { Checkbox } from '../../src/ui/primitives/Checkbox';
import { Slider } from '../../src/ui/primitives/Slider';
import { FakeContext, stubFetch } from '../support/fakeAudio';

/**
 * Ses bir geri bildirimdir, işlev değil: kapalı (muted) kitle de aynı bileşen aynı geri çağrıları,
 * aynı durumu ve aynı DOM'u üretir. Aynı senaryo iki kez koşulur, kayıtlar birebir karşılaştırılır.
 */
const ASSETS: UiSoundAssets = {
  press: ['p0.ogg'],
  toggleOn: ['g0.ogg'],
  sliderTick: ['t0.ogg'],
  valueCommit: ['c0.ogg'],
  tabSwitch: ['s0.ogg'],
};

let clock = 0;

async function session(muted: boolean) {
  const context = new FakeContext();
  context.state = 'running';
  const handle = uiIntentBusFor(document.body);
  const kit = new UiSoundKit({
    assets: ASSETS,
    context: context as unknown as AudioContext,
    now: () => clock,
  });
  await kit.preload();
  kit.attach(handle.bus);
  kit.setSettings({ muted });
  return { context, release: () => handle.release() };
}

function tab(id: string): TabDefinition {
  const element = document.createElement('div');
  element.textContent = id;
  return { id, label: id.toUpperCase(), content: { element } };
}

/** Dört bileşeni sürer ve gözlenebilir her sonucu sırayla kaydeder. */
function scenario(): string[] {
  const log: string[] = [];

  const button = new Button('Kaydet', { onClick: () => void log.push('button:click') });
  const checkbox = new Checkbox({
    label: 'Aç',
    onInput: (checked) => log.push(`checkbox:input:${checked}`),
    onCommit: (checked) => log.push(`checkbox:commit:${checked}`),
  });
  const slider = new Slider({
    label: 'Ses',
    min: 0,
    max: 10,
    step: 1,
    value: 0,
    onInput: (value) => log.push(`slider:input:${value}`),
    onCommit: (value) => log.push(`slider:commit:${value}`),
  });
  const tabs = new Tabs([tab('a'), tab('b')], { onChange: (id) => log.push(`tabs:change:${id}`) });
  document.body.append(button.element, checkbox.element, slider.element, tabs.element);

  button.element.click();
  checkbox.element.querySelector('input')!.click();

  const input = slider.element.querySelector('input')!;
  input.value = '7';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  log.push(`slider:value:${slider.getValue()}`);

  tabs.element.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click();
  log.push(
    ...[...tabs.element.querySelectorAll('[role="tab"]')].map(
      (el) => `tab:${el.textContent}:${el.getAttribute('aria-selected')}`,
    ),
  );

  button.destroy();
  checkbox.destroy();
  slider.destroy();
  tabs.destroy();
  return log;
}

beforeEach(() => {
  clock = 0;
  stubFetch();
});

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe('sessiz kit: bileşen davranışı sesten bağımsızdır', () => {
  it('ses açıkken geri çağrılar, durum ve DOM yazılan senaryodaki gibi çalışır', async () => {
    const { context, release } = await session(false);
    const log = scenario();
    expect(log).toEqual([
      'button:click',
      'checkbox:input:true',
      'checkbox:commit:true',
      'slider:input:7',
      'slider:commit:7',
      'slider:value:7',
      'tabs:change:b',
      'tab:A:false',
      'tab:B:true',
    ]);
    expect(context.sources.length).toBeGreaterThan(0);
    release();
  });

  it('muted kitle aynı senaryo birebir aynı kaydı üretir ve hiçbir ses başlatmaz', async () => {
    const loud = await session(false);
    const reference = scenario();
    loud.release();
    document.body.replaceChildren();
    clock += 1000;

    const quiet = await session(true);
    const muted = scenario();
    expect(muted).toEqual(reference);
    expect(quiet.context.sources).toHaveLength(0);
    quiet.release();
  });
});
