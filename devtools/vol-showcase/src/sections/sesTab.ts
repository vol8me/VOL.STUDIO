import { DisposableScope } from '@volstudio/core/lifecycle';
import {
  DEFAULT_UI_AUDIO_SETTINGS,
  UI_AUDIO_CHANNELS,
  UI_MAX_VOICES,
  UI_SOUND_EVENTS,
  UI_SOUND_PALETTES,
  UI_SOUND_VARIANT_KEYS,
  UiSoundKit,
  channelGain,
  uiSoundAssets,
  type UiAudioChannel,
  type UiAudioSettings,
  type UiSoundEvent,
  type UiSoundPalette,
} from '@volstudio/core/audio/ui';
import { i18next } from '@volstudio/core/i18n';
import {
  getHapticsCapability,
  isHapticsEnabled,
  setHapticsEnabled,
} from '@volstudio/core/platform';
import {
  Button,
  Checkbox,
  Select,
  Slider,
  Text,
  UiHapticProvider,
  uiIntentBusFor,
  type UiIntentBus,
  type UiIntentKind,
  type UiOutcome,
} from '@volstudio/core/ui';
import { getAppSoundKit, localAudioStore } from '../appSound';
import { card, paletteGrid } from './shared';

const INTENT_KINDS: readonly UiIntentKind[] = [
  'press',
  'toggle',
  'select',
  'valuePreview',
  'valueCommit',
  'confirm',
  'cancel',
  'open',
  'close',
  'type',
  'erase',
  'reject',
  'navigate',
  'pick',
  'drop',
  'notify',
  'alert',
];
const OUTCOMES: readonly UiOutcome[] = ['success', 'warning', 'error'];

/** Ses laboratuvarının örnek adresi. */
function baseUrl(): string {
  return import.meta.env.BASE_URL;
}

/** Bir değeri gösteren, `data-ses` ile makine tarafından da okunabilen satır. */
function readout(key: string, initial = ''): HTMLElement {
  const element = document.createElement('div');
  element.className = 'vol-showcase-ses__readout';
  element.dataset.ses = key;
  element.textContent = initial;
  return element;
}

/** Görünen metin yerelleştirilir; `data-value` dilden bağımsız ham değerdir (testler ve araçlar için). */
function setText(element: HTMLElement, value: string, raw?: string): void {
  if (element.textContent !== value) element.textContent = value;
  if (raw !== undefined && element.dataset.value !== raw) element.dataset.value = raw;
}

/** Ürün sonucunu HOST bildirir: bir Promise'in çözülmesi başarı sayılmaz. */
function reportHostOutcome(bus: UiIntentBus, target: Element, outcome: UiOutcome): boolean {
  return bus.reportOutcome(target, outcome);
}

function row(): HTMLElement {
  const element = document.createElement('div');
  element.className = 'vol-showcase-ses__row';
  return element;
}

/**
 * Ses laboratuvarı: anlamsal UI olaylarının sesini, kanal ayarlarını, ses
 * bütçesini ve niyet sondasını tek yerde gösterir. Ses bağlamı ve örnekler
 * ilk kullanıcı jestine kadar kurulmaz (kilitli bağlamda ses kuyruğa alınmaz).
 * Laboratuvar uygulama sesinden bağımsızdır: gerçek bileşenler iç veriyolunda
 * kit ve sondaya bağlanır; audition ve ayarlar dış veriyolunda uygulama sesi üretmez.
 */
export function buildSesTab(): { element: HTMLElement; destroy: () => void } {
  const container = document.createElement('div');
  container.className = 'vol-showcase-section';
  const disposables = new DisposableScope();
  // Audition kendi sesini çalar; bu sınır uygulama kitinin ek press üretmesini engeller.
  const laboratoryRoot = uiIntentBusFor(container);
  disposables.add({ dispose: laboratoryRoot.release });
  // Kök başına tek UiIntentBus: niyet kökü YALNIZ "Gerçek bileşenler" kartıdır: olay düğmeleri ve kuru/kit düğmeleri
  // sesi doğrudan çalar; bir de niyet üretselerdi aynı tık iki ses ve iki sayım olurdu.
  const componentsBody = document.createElement('div');
  componentsBody.className = 'vol-showcase-panel-demo';
  const { bus, release } = uiIntentBusFor(componentsBody);
  disposables.add({ dispose: release });

  let settings: UiAudioSettings = DEFAULT_UI_AUDIO_SETTINGS;
  let palette: UiSoundPalette = 'steel';
  let kit: UiSoundKit | null = null;
  let context: AudioContext | null = null;
  let preparing = false;
  let destroyed = false;
  const decoded = new Map<string, Promise<AudioBuffer>>();

  // ── Sonda: her kabul edilmiş niyet TEK sayılır ────────────────────────────
  const counts = new Map<UiIntentKind, number>(INTENT_KINDS.map((kind) => [kind, 0]));
  let outcomeTotal = 0;
  let intentTotal = 0;
  const probeTotal = readout('probe-total');
  const probeOutcomes = readout('probe-outcomes');
  const probeLast = readout('probe-last', i18next.t('volui:ses.probe.none'));
  const probeKinds = new Map<UiIntentKind, HTMLElement>(
    INTENT_KINDS.map((kind) => [kind, readout(`probe-${kind}`, `${kind}: 0`)]),
  );
  const renderProbe = (): void => {
    setText(
      probeTotal,
      i18next.t('volui:ses.probe.total', { count: intentTotal }),
      `${intentTotal}`,
    );
    setText(
      probeOutcomes,
      i18next.t('volui:ses.probe.outcomes', { count: outcomeTotal }),
      `${outcomeTotal}`,
    );
    for (const kind of INTENT_KINDS) {
      const element = probeKinds.get(kind);
      if (element) {
        const count = counts.get(kind) ?? 0;
        setText(element, `${kind}: ${count}`, `${count}`);
      }
    }
  };
  renderProbe();
  disposables.add(
    bus.subscribe({
      onIntent: (intent) => {
        intentTotal += 1;
        counts.set(intent.kind, (counts.get(intent.kind) ?? 0) + 1);
        setText(
          probeLast,
          i18next.t('volui:ses.probe.last', {
            kind: intent.kind,
            origin: intent.origin,
            source: intent.source,
          }),
        );
        renderProbe();
      },
      onOutcome: () => {
        outcomeTotal += 1;
        renderProbe();
      },
    }),
  );

  // Titreşim sağlayıcısı aynı veriyoluna bağlanır: niyet başına TEK darbe. Titreşim
  // varsayılan KAPALIdır; laboratuvar kapanınca önceki durum geri yüklenir.
  const haptics = new UiHapticProvider({ visibilityTarget: document, focusTarget: window });
  haptics.attach(bus);
  const hapticsBefore = isHapticsEnabled();
  disposables.add({ dispose: () => setHapticsEnabled(hapticsBefore) });
  disposables.add(haptics);

  // ── Durum: kit, bağlam ve yetenek ─────────────────────────────────────────
  const statusState = readout('state');
  const statusVoices = readout('voices');
  const statusCounts = readout('counts');
  const statusContext = readout('context');
  const statusHaptics = readout('haptics');
  const renderStatus = (): void => {
    const metrics = kit?.metrics ?? { active: 0, played: 0, dropped: 0 };
    const supported = typeof AudioContext === 'function';
    const stateId = kit ? kit.state : supported ? 'idle' : 'inert';
    setText(
      statusState,
      i18next.t('volui:ses.status.state', {
        state: i18next.t(`volui:ses.status.states.${stateId}`),
      }),
      stateId,
    );
    setText(
      statusVoices,
      i18next.t('volui:ses.status.voices', { active: metrics.active, max: UI_MAX_VOICES }),
      String(metrics.active),
    );
    setText(
      statusCounts,
      i18next.t('volui:ses.status.counts', { played: metrics.played, dropped: metrics.dropped }),
      `${metrics.played}/${metrics.dropped}`,
    );
    setText(
      statusContext,
      context
        ? i18next.t('volui:ses.status.context', {
            state: context.state,
            rate: context.sampleRate,
            latency: Math.round((context.outputLatency || context.baseLatency || 0) * 1000),
          })
        : i18next.t(supported ? 'volui:ses.status.contextIdle' : 'volui:ses.status.contextNone'),
      context ? context.state : supported ? 'idle' : 'none',
    );
    const capability = getHapticsCapability();
    setText(
      statusHaptics,
      i18next.t('volui:ses.status.haptics', {
        value: capability.supported
          ? capability.backend
          : i18next.t('volui:ses.status.hapticsNone'),
        state: i18next.t(haptics.active ? 'volui:ses.status.on' : 'volui:ses.status.off'),
      }),
      `${capability.backend}/${haptics.active ? 'on' : 'off'}`,
    );
  };

  // ── Kit: ilk jestte kurulur ───────────────────────────────────────────────
  const prepare = (): void => {
    if (kit || preparing || destroyed || typeof AudioContext !== 'function') return;
    preparing = true;
    try {
      context = new AudioContext();
      kit = new UiSoundKit({
        assets: uiSoundAssets(baseUrl(), palette),
        context,
        settings,
        visibilityTarget: document,
        store: localAudioStore(),
        onError: (error) => console.warn('[VOL.UI] Ses laboratuvarı:', error),
      });
      kit.attach(bus);
      void kit.restore().then((restored) => {
        settings = restored;
        renderGain();
      });
      void kit.preload().then(renderStatus);
    } catch (error) {
      console.warn('[VOL.UI] Ses bağlamı kurulamadı:', error);
      kit?.dispose();
      kit = null;
    } finally {
      preparing = false;
    }
    renderStatus();
  };
  // Jest yakalama aşaması: bileşenin kendi tıklamasından ÖNCE kit hazırdır.
  disposables.addListener(container, 'pointerdown', prepare, true);
  disposables.addListener(container, 'keydown', prepare, true);
  disposables.addInterval(renderStatus, 250);

  const apply = (patch: Partial<UiAudioSettings>): void => {
    settings = kit ? kit.setSettings(patch) : { ...settings, ...patch };
    // Uygulama geneli kit de aynı ayarı alır: seviye ve sessiz tüm arayüzü etkiler.
    getAppSoundKit()?.setSettings(patch);
    renderGain();
  };

  // ── 1. Olay sesleri ───────────────────────────────────────────────────────
  // Olaylar anlamlı gruplara bölünür: 25 düğmeyi tek sütunda dizmek taranamıyordu.
  const EVENT_GROUPS: ReadonlyArray<{ title: string; events: readonly UiSoundEvent[] }> = [
    {
      title: i18next.t('volui:ses.groups.contact'),
      events: ['hover', 'focus', 'press', 'release'],
    },
    {
      title: i18next.t('volui:ses.groups.navigation'),
      events: ['back', 'confirm', 'select', 'tabSwitch', 'panelOpen', 'panelClose'],
    },
    {
      title: i18next.t('volui:ses.groups.value'),
      events: ['toggleOn', 'toggleOff', 'sliderTick', 'valueCommit'],
    },
    {
      title: i18next.t('volui:ses.groups.typing'),
      events: ['keyTap', 'keyDelete'],
    },
    {
      title: i18next.t('volui:ses.groups.inventory'),
      events: ['dragPick', 'dragDrop', 'equip', 'purchase'],
    },
    { title: i18next.t('volui:ses.groups.reward'), events: ['reward', 'levelUp', 'notify'] },
    { title: i18next.t('volui:ses.groups.warning'), events: ['denied', 'alert'] },
  ];
  const eventButtons = document.createElement('div');
  eventButtons.className = 'vol-showcase-ses__groups';
  for (const group of EVENT_GROUPS) {
    const heading = new Text(group.title, { variant: 'muted', tag: 'span' });
    disposables.addDestroyables(heading);
    const groupRow = row();
    for (const event of group.events) {
      const button = new Button(event, {
        variant: 'default',
        size: 'sm',
        fullWidth: false,
        haptic: false,
        onClick: () => {
          prepare();
          void kit?.unlock();
          kit?.play(event);
          renderStatus();
        },
      });
      button.element.dataset.sesEvent = event;
      disposables.addDestroyables(button);
      groupRow.appendChild(button.element);
    }
    eventButtons.append(heading.element, groupRow);
  }
  const eventsBody = document.createElement('div');
  eventsBody.className = 'vol-showcase-panel-demo';
  const eventsHint = new Text(i18next.t('volui:ses.events.hint'), { variant: 'muted' });
  disposables.addDestroyables(eventsHint);
  const paletteSelect = new Select({
    options: UI_SOUND_PALETTES.map((value) => ({
      value,
      label: i18next.t(value === 'steel' ? 'volui:ses.palette.steel' : 'volui:ses.palette.aurum'),
    })),
    value: palette,
    container,
    haptic: false,
    onInput: (value) => {
      palette = value as UiSoundPalette;
      if (kit) {
        kit.setAssets(uiSoundAssets(baseUrl(), palette));
        void kit.preload().then(renderStatus);
      }
    },
  });
  paletteSelect.element.dataset.ses = 'palette';
  paletteSelect.element.setAttribute('aria-label', i18next.t('volui:ses.palette.label'));
  disposables.addDestroyables(paletteSelect);
  eventsBody.append(eventsHint.element, paletteSelect.element, eventButtons);

  // ── 2. Gerçek bileşenler: ses niyetten gelir ──────────────────────────────
  const componentsHint = new Text(i18next.t('volui:ses.components.hint'), { variant: 'muted' });
  disposables.addDestroyables(componentsHint);
  const pressButton = new Button(i18next.t('volui:ses.components.press'), {
    variant: 'primary',
  });
  const toggle = new Checkbox({ label: i18next.t('volui:ses.components.toggle'), haptic: false });
  const select = new Select({
    options: ['a', 'b', 'c'].map((value) => ({
      value,
      label: i18next.t(`volui:ses.components.option`, { value: value.toUpperCase() }),
    })),
    value: 'a',
    container: componentsBody,
  });
  const slider = new Slider({
    label: i18next.t('volui:ses.components.slider'),
    min: 0,
    max: 100,
    value: 40,
    formatValue: (value) => `${Math.round(value)}`,
  });
  pressButton.element.dataset.sesComp = 'press';
  toggle.element.dataset.sesComp = 'toggle';
  select.element.dataset.sesComp = 'select';
  slider.element.dataset.sesComp = 'slider';
  disposables.addDestroyables(pressButton, toggle, select, slider);
  const outcomeRow = row();
  for (const outcome of OUTCOMES) {
    const save = new Button(i18next.t(`volui:ses.components.outcome.${outcome}`), {
      variant: 'default',
      onClick: () => {
        reportHostOutcome(bus, save.element, outcome);
      },
    });
    save.element.dataset.sesOutcome = outcome;
    disposables.addDestroyables(save);
    outcomeRow.appendChild(save.element);
  }
  componentsBody.append(
    componentsHint.element,
    pressButton.element,
    toggle.element,
    select.element,
    slider.element,
    outcomeRow,
  );

  // ── 3. Kanal ve sessizleştirme ────────────────────────────────────────────
  const channelsBody = document.createElement('div');
  channelsBody.className = 'vol-showcase-panel-demo';
  const gainReadouts = new Map<UiAudioChannel, HTMLElement>();
  const renderGain = (): void => {
    for (const channel of UI_AUDIO_CHANNELS) {
      const element = gainReadouts.get(channel);
      if (element) {
        const value = channelGain(settings, channel).toFixed(2);
        setText(element, i18next.t('volui:ses.channels.gain', { value }), value);
      }
    }
  };
  const levelKeys = ['master', ...UI_AUDIO_CHANNELS] as const;
  for (const key of levelKeys) {
    const slider = new Slider({
      label: i18next.t(`volui:ses.channels.${key}`),
      min: 0,
      max: 100,
      value: Math.round(settings[key] * 100),
      formatValue: (value) => `${Math.round(value)}%`,
      onInput: (value) => apply({ [key]: value / 100 }),
    });
    disposables.addDestroyables(slider);
    channelsBody.appendChild(slider.element);
    if (key !== 'master') {
      const gain = readout(`gain-${key}`);
      gainReadouts.set(key, gain);
      channelsBody.appendChild(gain);
    }
  }
  const muted = new Checkbox({
    label: i18next.t('volui:ses.channels.muted'),
    checked: settings.muted,
    haptic: false,
    onInput: (checked) => apply({ muted: checked }),
  });
  muted.element.dataset.ses = 'mute';
  disposables.addDestroyables(muted);
  channelsBody.appendChild(muted.element);
  const hapticsToggle = new Checkbox({
    label: i18next.t('volui:ses.channels.haptics'),
    checked: isHapticsEnabled(),
    haptic: false,
    onInput: (checked) => {
      setHapticsEnabled(checked);
      renderStatus();
    },
  });
  const hapticsLevel = new Slider({
    label: i18next.t('volui:ses.channels.hapticsIntensity'),
    min: 0,
    max: 100,
    value: Math.round(haptics.intensity * 100),
    formatValue: (value) => `${Math.round(value)}%`,
    onInput: (value) => haptics.setIntensity(value / 100),
  });
  hapticsToggle.element.dataset.ses = 'haptics-toggle';
  disposables.addDestroyables(hapticsToggle, hapticsLevel);
  channelsBody.append(hapticsToggle.element, hapticsLevel.element);
  renderGain();

  // ── 4. Durum ve yetenek ───────────────────────────────────────────────────
  const statusBody = document.createElement('div');
  statusBody.className = 'vol-showcase-panel-demo';
  statusBody.append(statusState, statusVoices, statusCounts, statusContext, statusHaptics);
  renderStatus();

  // ── 5. Sonda ──────────────────────────────────────────────────────────────
  const probeBody = document.createElement('div');
  probeBody.className = 'vol-showcase-panel-demo';
  const probeHint = new Text(i18next.t('volui:ses.probe.hint'), { variant: 'muted' });
  disposables.addDestroyables(probeHint);
  probeBody.append(probeHint.element, probeTotal, probeOutcomes, probeLast, ...probeKinds.values());

  // ── 6. Dışa aktarma ve kuru/kit kıyası ────────────────────────────────────
  let compareEvent: UiSoundEvent = 'press';
  let compareVariant = 0;
  const sampleUrl = (): string =>
    uiSoundAssets(baseUrl(), palette)[compareEvent]?.[compareVariant] ?? '';
  const load = (url: string): Promise<AudioBuffer> => {
    let pending = decoded.get(url);
    if (!pending) {
      const ctx = context;
      if (!ctx) return Promise.reject(new Error('Ses bağlamı yok'));
      pending = fetch(url)
        .then((response) => response.arrayBuffer())
        .then((bytes) => ctx.decodeAudioData(bytes));
      decoded.set(url, pending);
    }
    return pending;
  };

  const compareBody = document.createElement('div');
  compareBody.className = 'vol-showcase-panel-demo';
  const compareHint = new Text(i18next.t('volui:ses.compare.hint'), { variant: 'muted' });
  disposables.addDestroyables(compareHint);
  const eventSelect = new Select({
    options: UI_SOUND_EVENTS.map((event) => ({ value: event, label: event })),
    value: compareEvent,
    container,
    haptic: false,
    onInput: (value) => {
      compareEvent = value as UiSoundEvent;
    },
  });
  const variantSelect = new Select({
    options: UI_SOUND_VARIANT_KEYS.map((key, index) => ({
      value: String(index),
      label: i18next.t('volui:ses.compare.variant', { value: key.toUpperCase() }),
    })),
    value: '0',
    container,
    haptic: false,
    onInput: (value) => {
      compareVariant = Number(value);
    },
  });
  const dry = new Button(i18next.t('volui:ses.compare.dry'), {
    variant: 'default',
    haptic: false,
    onClick: async () => {
      prepare();
      const ctx = context;
      if (!ctx) return;
      try {
        await ctx.resume();
        const buffer = await load(sampleUrl());
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start();
      } catch (error) {
        console.warn('[VOL.UI] Kuru örnek çalınamadı:', error);
      }
    },
  });
  dry.element.dataset.ses = 'dry';
  const processed = new Button(i18next.t('volui:ses.compare.kit'), {
    variant: 'primary',
    haptic: false,
    onClick: () => {
      prepare();
      void kit?.unlock();
      kit?.play(compareEvent);
      renderStatus();
    },
  });
  processed.element.dataset.ses = 'kit';
  const download = new Button(i18next.t('volui:ses.compare.download'), {
    variant: 'default',
    haptic: false,
    onClick: async () => {
      const url = sampleUrl();
      try {
        const blob = await (await fetch(url)).blob();
        const link = document.createElement('a');
        const objectUrl = URL.createObjectURL(blob);
        link.href = objectUrl;
        link.download = url.split('/').pop() ?? 'ui-sound.ogg';
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(objectUrl);
      } catch (error) {
        console.warn('[VOL.UI] Örnek indirilemedi:', error);
      }
    },
  });
  download.element.dataset.ses = 'download';
  disposables.addDestroyables(eventSelect, variantSelect, dry, processed, download);
  const compareRow = row();
  compareRow.append(eventSelect.element, variantSelect.element);
  const compareActions = row();
  compareActions.append(dry.element, processed.element, download.element);
  compareBody.append(compareHint.element, compareRow, compareActions);

  container.appendChild(
    paletteGrid([
      card(i18next.t('volui:ses.events.title'), eventsBody, { span: 6 }),
      card(i18next.t('volui:ses.components.title'), componentsBody, { span: 6 }),
      card(i18next.t('volui:ses.channels.title'), channelsBody, { span: 4 }),
      card(i18next.t('volui:ses.status.title'), statusBody, { span: 4 }),
      card(i18next.t('volui:ses.probe.title'), probeBody, { span: 4 }),
      card(i18next.t('volui:ses.compare.title'), compareBody, { span: 6 }),
    ]),
  );

  return {
    element: container,
    destroy: () => {
      destroyed = true;
      kit?.dispose();
      kit = null;
      void context?.close?.().catch(() => undefined);
      context = null;
      decoded.clear();
      disposables.dispose();
    },
  };
}
