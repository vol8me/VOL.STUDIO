import { afterEach, describe, expect, it } from 'vitest';
import {
  UI_INTENT_SOUND,
  UI_OUTCOME_SOUND,
  UI_SOUND_EVENTS,
  type UiSoundEvent,
} from '../../src/audio/ui/events';
import { uiIntentBusFor, type UiIntent } from '../../src/ui/feedback/uiIntent';
import { HoldButton } from '../../src/ui/buttons/HoldButton';
import { Accordion } from '../../src/ui/layout/Accordion';
import { Tabs } from '../../src/ui/layout/Tabs';
import { DialogueBox } from '../../src/ui/overlays/DialogueBox';
import { Modal } from '../../src/ui/overlays/Modal';
import { ToastManager } from '../../src/ui/overlays/Toast';
import { Button } from '../../src/ui/primitives/Button';

/**
 * OLAY → BİLEŞEN TABLOSU. 25 ses olayının her biri ya bir niyetten (bileşen etkileşimi), ya kökün
 * gözlemcisinden (hover/focus), ya da host'un açık `play` çağrısından gelir; sahipsiz olay kalmaz.
 * Bileşen kaynaklı niyetler burada gerçek bileşenlerle tek tek doğrulanır.
 */
const OBSERVED: readonly UiSoundEvent[] = ['hover', 'focus'];
/** `toggle` niyetinden kit, hedefin durumuna göre seçer (`toggleOn` eşlemede, kapalı hali durumdan türer). */
const STATE_DERIVED: readonly UiSoundEvent[] = ['toggleOff'];
/** Oyun/ürün kararıdır: bileşen bilemez (nesne kuşandı, satın alındı, ödül, seviye atlandı, bırakma). */
const HOST_DRIVEN: readonly UiSoundEvent[] = ['release', 'equip', 'purchase', 'reward', 'levelUp'];

afterEach(() => {
  document.body.replaceChildren();
});

function root(): { element: HTMLElement; seen: UiIntent[]; release(): void } {
  const element = document.createElement('div');
  document.body.append(element);
  const handle = uiIntentBusFor(element);
  const seen: UiIntent[] = [];
  handle.bus.subscribe({ onIntent: (intent) => seen.push(intent) });
  return { element, seen, release: handle.release };
}

const kinds = (seen: UiIntent[]): string[] =>
  seen.map((intent) => `${intent.kind}:${intent.origin}`);

describe('ses olayı sahipliği', () => {
  it('25 olayın her birinin sahibi vardır (niyet, gözlemci, sonuç ya da açık host çağrısı)', () => {
    const fromIntents = new Set<string>(Object.values(UI_INTENT_SOUND));
    const fromOutcomes = new Set<string>(Object.values(UI_OUTCOME_SOUND));
    const owned = new Set<string>([
      ...fromIntents,
      ...fromOutcomes,
      ...OBSERVED,
      ...STATE_DERIVED,
      ...HOST_DRIVEN,
    ]);
    expect(UI_SOUND_EVENTS.filter((event) => !owned.has(event))).toEqual([]);
    // Host listesi yalnız niyet/gözlemcisi olmayan olayları içerir (çift sahip olmaz).
    for (const event of HOST_DRIVEN) expect(fromIntents.has(event)).toBe(false);
    expect(UI_SOUND_EVENTS).toHaveLength(25);
  });
});

describe('bileşen etkileşimi → niyet (ses)', () => {
  it('Button tek `press` niyeti verir; yedek dinleyici yinelemez', () => {
    const { element, seen } = root();
    const button = new Button('Tamam');
    element.append(button.element);
    button.element.click();
    expect(kinds(seen)).toEqual(['press:Button']);
  });

  it('niyet yaymayan düğme/menü/sekme öğesi yedek niyet alır; susturulan almaz', () => {
    const { element, seen } = root();
    const plain = document.createElement('button');
    const tab = document.createElement('div');
    tab.setAttribute('role', 'tab');
    const item = document.createElement('div');
    item.setAttribute('role', 'menuitem');
    const quiet = document.createElement('button');
    quiet.dataset.volSilent = '';
    element.append(plain, tab, item, quiet);
    for (const control of [plain, tab, item, quiet]) control.click();
    expect(kinds(seen)).toEqual(['press:auto', 'navigate:auto', 'select:auto']);
  });

  it('oynanış denetimi (HoldButton) arayüz sesi üretmez', () => {
    const { element, seen } = root();
    const hold = new HoldButton({ label: 'Ateş' });
    element.append(hold.element);
    hold.element.click();
    expect(seen).toEqual([]);
    hold.destroy();
  });

  it('Tabs: tıklama tek `navigate`; programatik select sessiz', () => {
    const { element, seen } = root();
    const tabs = new Tabs(
      [
        { id: 'a', label: 'A', content: { element: document.createElement('div') } },
        { id: 'b', label: 'B', content: { element: document.createElement('div') } },
      ],
      {},
    );
    element.append(tabs.element);
    tabs.select('b');
    expect(seen).toEqual([]);
    tabs.element.querySelector<HTMLButtonElement>('[role="tab"]')?.click();
    expect(kinds(seen)).toEqual(['navigate:Tabs']);
    tabs.destroy();
  });

  it('Modal: tetikleyiciden açılış `open`, kapanış `close`; söküm sessiz', () => {
    const { element, seen } = root();
    const trigger = document.createElement('button');
    element.append(trigger);
    trigger.focus();
    const modal = new Modal();
    document.body.append(modal.element);
    modal.open();
    modal.close();
    expect(kinds(seen)).toEqual(['open:Modal', 'close:Modal']);
    modal.open();
    seen.length = 0;
    modal.destroy();
    expect(seen).toEqual([]);
  });

  it('Modal: tetikleyici yoksa (oyunun kendi açışı) sessizdir', () => {
    const { seen } = root();
    const modal = new Modal();
    document.body.append(modal.element);
    (document.activeElement as HTMLElement | null)?.blur();
    modal.open();
    modal.close();
    expect(seen).toEqual([]);
    modal.destroy();
  });

  it('Accordion: başlık tıklaması `open`/`close`; programatik toggle sessiz', () => {
    const { element, seen } = root();
    const accordion = new Accordion([
      { id: 'a', title: 'A', content: { element: document.createElement('div') } },
    ]);
    element.append(accordion.element);
    accordion.toggle('a');
    accordion.toggle('a');
    expect(seen).toEqual([]);
    const header = accordion.element.querySelector<HTMLButtonElement>('button');
    header?.click();
    header?.click();
    expect(kinds(seen)).toEqual(['open:Accordion', 'close:Accordion']);
    accordion.destroy();
  });

  it('ToastManager: bildirim `notify`, uyarı ve tehlike `alert`', () => {
    const { element, seen } = root();
    const toasts = new ToastManager(element);
    toasts.show('Bilgi');
    toasts.show('Uyarı', { variant: 'warning' });
    toasts.show('Tehlike', { variant: 'danger' });
    expect(kinds(seen)).toEqual([
      'notify:ToastManager',
      'alert:ToastManager',
      'alert:ToastManager',
    ]);
    toasts.destroy();
  });

  it('DialogueBox: satır ilerletme `select`, seçim yalnız `confirm`', () => {
    const { element, seen } = root();
    const dialogue = new DialogueBox({ typeSpeedMs: 0 });
    element.append(dialogue.element);
    dialogue.show([
      { text: 'Merhaba' },
      { text: 'Seç', choices: [{ label: 'Evet', onSelect: () => undefined }] },
    ]);
    dialogue.element.click();
    dialogue.element.click();
    seen.length = 0;
    dialogue.element.querySelector<HTMLButtonElement>('.vol-dialogue__choice')?.click();
    expect(kinds(seen)).toEqual(['confirm:DialogueBox']);
    dialogue.destroy();
  });
});
