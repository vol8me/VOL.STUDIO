import {
  Button,
  Checkbox,
  ColorPicker,
  CurveEditor,
  Input,
  NumberStepper,
  PropertyField,
  RadioGroup,
  RangeSlider,
  SegmentedControl,
  Select,
  Slider,
  Text,
  TextArea,
  TimerBar,
  Toolbar,
} from '@volstudio/core/ui';
import { i18next } from '@volstudio/core/i18n';
import { card, cardGrid } from './shared';

interface Destroyable {
  destroy(): void;
}

/** Checkbox'ı ayar listesi içinde gösterir. */
function buildCheckboxGroupDemo(disposables: Destroyable[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-checkbox-group';

  const music = new Checkbox({ label: i18next.t('volui:forms.musicOn'), checked: true });
  const screenShake = new Checkbox({ label: i18next.t('volui:forms.screenShake'), checked: true });
  const autoAim = new Checkbox({ label: i18next.t('volui:forms.autoAim'), checked: false });
  disposables.push(music, screenShake, autoAim);

  wrap.appendChild(music.element);
  wrap.appendChild(screenShake.element);
  wrap.appendChild(autoAim.element);

  return wrap;
}

function buildVerticalSliderDemo(disposables: Destroyable[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-vertical-sliders';

  const channels = [
    i18next.t('volui:forms.music'),
    i18next.t('volui:forms.effects'),
    i18next.t('volui:forms.sound'),
  ];
  for (const channel of channels) {
    const column = document.createElement('div');
    column.className = 'vol-showcase-vertical-sliders__column';

    const slider = new Slider({
      orientation: 'vertical',
      min: 0,
      max: 100,
      value: 60,
      length: 160, // vol-showcase-panel-stage'in 200px yükseklik ritmine yakın
      formatValue: (v) => `${Math.round(v)}`,
    });
    column.appendChild(slider.element);

    const label = new Text(channel, { variant: 'muted', tag: 'span' });
    column.appendChild(label.element);
    disposables.push(slider, label);

    wrap.appendChild(column);
  }

  return wrap;
}

/** RangeSlider demosu: düşman seviye aralığı filtresi. */
function buildRangeSliderDemo(disposables: Destroyable[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const hint = new Text(i18next.t('volui:forms.enemyLevelHint'), {
    variant: 'muted',
  });
  disposables.push(hint);

  const range = new RangeSlider({
    label: i18next.t('volui:forms.enemyLevelRange'),
    min: 1,
    max: 50,
    value: { min: 5, max: 30 },
    formatValue: (v) => `Lv.${v}`,
  });
  disposables.push(range);

  wrap.appendChild(range.element);
  wrap.appendChild(hint.element);

  return wrap;
}

/** Otomatik (autoStart + loop) TimerBar varyasyonları: bekleme, buff, yükleme. */
function buildTimerBarVariationsDemo(disposables: Destroyable[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-timer-variations';

  const cooldown = new TimerBar({
    durationSeconds: 4,
    mode: 'drain',
    label: (remaining) => i18next.t('volui:forms.abilityCooldown', { n: remaining }),
    autoStart: true,
    loop: true,
  });
  disposables.push(cooldown);

  const buff = new TimerBar({
    durationSeconds: 6,
    mode: 'fill',
    label: i18next.t('volui:forms.buffDuration'),
    autoStart: true,
    loop: true,
  });
  disposables.push(buff);

  const loading = new TimerBar({
    durationSeconds: 2.5,
    mode: 'fill',
    autoStart: true,
    loop: true,
  });
  disposables.push(loading);
  loading.element.classList.add('vol-timer-bar--thin');

  for (const [caption, timer] of [
    [i18next.t('volui:forms.cooldownCountdown'), cooldown],
    [i18next.t('volui:forms.buffFilling'), buff],
    [i18next.t('volui:forms.loadingThin'), loading],
  ] as const) {
    const column = document.createElement('div');
    column.className = 'vol-showcase-timer-variations__column';

    const label = new Text(caption, { variant: 'muted', tag: 'span' });
    disposables.push(label);
    column.appendChild(label.element);
    column.appendChild(timer.element);
    wrap.appendChild(column);
  }

  return wrap;
}

/** TimerBar: sıfırlanabilir dol/boşalt zamanlayıcı. */
function buildTimerBarDemo(disposables: Destroyable[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const timer = new TimerBar({
    durationSeconds: 8,
    mode: 'fill',
    label: (remaining) => i18next.t('volui:forms.abilityReady', { n: remaining }),
    loop: false,
  });
  disposables.push(timer);
  wrap.appendChild(timer.element);

  const controls = document.createElement('div');
  controls.className = 'vol-showcase-panel-demo__controls';

  const startButton = new Button(i18next.t('volui:forms.start'), {
    variant: 'primary',
    onClick: () => timer.start(),
  });
  const pauseButton = new Button(i18next.t('volui:forms.pause'), {
    onClick: () => timer.pause(),
  });
  const resetButton = new Button(i18next.t('volui:forms.reset'), {
    onClick: () => timer.reset(),
  });
  disposables.push(startButton, pauseButton, resetButton);

  controls.appendChild(startButton.element);
  controls.appendChild(pauseButton.element);
  controls.appendChild(resetButton.element);
  wrap.appendChild(controls);

  return wrap;
}

/** Palet düzenlemenin iki ucu: kutucuk + hex + hazır renkler. */
function buildColorPickerDemo(disposables: Destroyable[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo vol-showcase-panel-demo--centered';

  const readout = new Text('#b85518', { variant: 'muted' });
  const picker = new ColorPicker({
    label: i18next.t('volui:forms.colorPickerLabel'),
    value: '#b85518',
    swatches: ['#b85518', '#246a79', '#565dbe', '#307a57', '#d2a03c', '#b94a4a'],
    onInput: (value) => readout.setContent(value),
  });
  disposables.push(picker, readout);

  wrap.appendChild(picker.element);
  wrap.appendChild(readout.element);
  return wrap;
}

/** Aktarım eğrisi: noktaları sürükle, çift tıkla ekle, Alt+tık ile sil. */
function buildCurveEditorDemo(disposables: Destroyable[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo vol-showcase-panel-demo--centered';

  const readout = new Text('f(0.5) = 0.50', { variant: 'muted' });
  const curve = new CurveEditor({
    label: i18next.t('volui:forms.curveEditorLabel'),
    points: [
      [0, 0],
      [0.5, 0.85],
      [1, 1],
    ],
    onChange: () => readout.setContent(`f(0.5) = ${curve.sample(0.5).toFixed(2)}`),
  });
  disposables.push(curve, readout);
  readout.setContent(`f(0.5) = ${curve.sample(0.5).toFixed(2)}`);

  wrap.appendChild(curve.element);
  wrap.appendChild(readout.element);
  return wrap;
}

/** Inspector form örneği: etiket + input + açıklama + reset. */
function buildPropertyFieldDemo(disposables: Destroyable[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const defaultValue = i18next.t('volui:forms.playerNameValue');
  const state = new Text(i18next.t('volui:forms.propertyFieldNoCommit'), { variant: 'muted' });
  const input = new Input({
    value: defaultValue,
    onCommit: (value) => state.setContent(i18next.t('volui:forms.propertyFieldCommit', { value })),
  });
  const field = new PropertyField({
    label: i18next.t('volui:forms.playerName'),
    control: input,
    description: i18next.t('volui:forms.propertyFieldDescription'),
    resetLabel: i18next.t('volui:forms.reset'),
    onReset: () => {
      input.setValue(defaultValue);
      state.setContent(i18next.t('volui:forms.propertyFieldNoCommit'));
    },
  });
  disposables.push(input, field, state);

  wrap.appendChild(field.element);
  wrap.appendChild(state.element);
  return wrap;
}

/** Tek/çoklu seçim ve aksiyon düğmesi destekli araç çubuğu. */
function buildToolbarDemo(disposables: Destroyable[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo vol-showcase-panel-demo--centered';

  const toolLabels: Record<string, string> = {
    pencil: i18next.t('volui:forms.pencil'),
    eraser: i18next.t('volui:forms.eraser'),
    eyedropper: i18next.t('volui:forms.eyedropper'),
    trash: i18next.t('volui:forms.trash'),
  };

  const state = new Text(i18next.t('volui:forms.toolbarSelected', { value: toolLabels.pencil }), {
    variant: 'muted',
  });
  const toolbar = new Toolbar({
    ariaLabel: i18next.t('volui:forms.toolbar'),
    selectionMode: 'single',
    value: 'pencil',
    items: [
      { id: 'pencil', icon: 'pencil', label: toolLabels.pencil },
      { id: 'eraser', icon: 'eraser', label: toolLabels.eraser },
      { id: 'eyedropper', icon: 'eyedropper', label: toolLabels.eyedropper },
      {
        id: 'trash',
        icon: 'trash',
        label: toolLabels.trash,
        toggle: false,
        onPress: () =>
          state.setContent(i18next.t('volui:forms.toolbarAction', { action: toolLabels.trash })),
      },
    ],
    onChange: (value) => {
      if (value === undefined || typeof value !== 'string') {
        state.setContent(i18next.t('volui:forms.toolbarIdle'));
      } else {
        state.setContent(
          i18next.t('volui:forms.toolbarSelected', { value: toolLabels[value] ?? value }),
        );
      }
    },
  });
  disposables.push(toolbar, state);

  wrap.appendChild(toolbar.element);
  wrap.appendChild(state.element);
  return wrap;
}

export function buildFormsTab(uiRootElement: HTMLElement): {
  element: HTMLElement;
  destroy: () => void;
} {
  const container = document.createElement('div');
  container.className = 'vol-showcase-section';
  const disposables: Destroyable[] = [];

  const nameInput = new Input({ placeholder: i18next.t('volui:forms.playerNamePlaceholder') });
  disposables.push(nameInput);

  const volumeSlider = new Slider({
    label: i18next.t('volui:forms.volumeLabel'),
    min: 0,
    max: 100,
    value: 70,
    formatValue: (v) => `${Math.round(v)}%`,
  });
  disposables.push(volumeSlider);

  const difficultySelect = new Select({
    options: [
      { value: 'easy', label: i18next.t('volui:forms.easy') },
      { value: 'normal', label: i18next.t('volui:forms.normal') },
      { value: 'hard', label: i18next.t('volui:forms.hard') },
      { value: 'nightmare', label: i18next.t('volui:forms.nightmare'), tone: 'danger' },
    ],
    value: 'normal',
    placeholder: i18next.t('volui:forms.difficultyPlaceholder'),
    container: uiRootElement,
  });
  disposables.push(difficultySelect);

  const gameModeRadio = new RadioGroup({
    options: [
      { value: 'campaign', label: i18next.t('volui:forms.campaign') },
      { value: 'endless', label: i18next.t('volui:forms.endlessWave') },
      { value: 'coop', label: i18next.t('volui:forms.coop') },
    ],
    value: 'campaign',
  });
  disposables.push(gameModeRadio);

  const qualitySegmented = new SegmentedControl({
    options: [
      { value: 'low', label: i18next.t('volui:forms.low') },
      { value: 'medium', label: i18next.t('volui:forms.medium') },
      { value: 'high', label: i18next.t('volui:forms.high') },
    ],
    value: 'medium',
  });
  disposables.push(qualitySegmented);

  const unitStepper = new NumberStepper({
    label: i18next.t('volui:forms.productionQuantity'),
    min: 1,
    max: 20,
    value: 5,
  });
  disposables.push(unitStepper);

  const noteTextArea = new TextArea({
    placeholder: i18next.t('volui:forms.serverModPlaceholder'),
    rows: 4,
    maxLength: 200,
  });
  disposables.push(noteTextArea);

  const cards = [
    card(i18next.t('volui:forms.input'), nameInput.element),
    card(i18next.t('volui:forms.textArea'), noteTextArea.element),
    card(i18next.t('volui:forms.slider'), volumeSlider.element),
    card(i18next.t('volui:forms.sliderVertical'), buildVerticalSliderDemo(disposables)),
    card(i18next.t('volui:forms.checkbox'), buildCheckboxGroupDemo(disposables)),
    card(i18next.t('volui:forms.select'), difficultySelect.element),
    card(i18next.t('volui:forms.radioGroup'), gameModeRadio.element),
    card(i18next.t('volui:forms.segmentedControl'), qualitySegmented.element),
    card(i18next.t('volui:forms.numberStepper'), unitStepper.element, { center: true }),
    card(i18next.t('volui:forms.timerBarVariations'), buildTimerBarVariationsDemo(disposables)),
    card(i18next.t('volui:forms.timerBar'), buildTimerBarDemo(disposables), { span: 2 }),
    card(i18next.t('volui:forms.rangeSlider'), buildRangeSliderDemo(disposables), { span: 4 }),
    card(i18next.t('volui:forms.colorPicker'), buildColorPickerDemo(disposables), { center: true }),
    card(i18next.t('volui:forms.curveEditor'), buildCurveEditorDemo(disposables), { center: true }),
    card(i18next.t('volui:forms.propertyField'), buildPropertyFieldDemo(disposables)),
    card(i18next.t('volui:forms.toolbar'), buildToolbarDemo(disposables)),
  ];

  container.appendChild(cardGrid(cards));

  return {
    element: container,
    destroy: () => disposables.forEach((d) => d.destroy()),
  };
}
