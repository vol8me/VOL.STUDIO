import { i18next } from '@volstudio/core/i18n';
import { DisposableScope } from '@volstudio/core/lifecycle';
import {
  Button,
  Checkbox,
  CurveEditor,
  DENSITY_IDS,
  Input,
  MinimapPanel,
  SegmentedControl,
  SettingsRow,
  Select,
  Slider,
  THEME_IDS,
  Text,
  ThemeController,
  type DensityId,
  type ThemeId,
  type ThemeState,
} from '@volstudio/core/ui';
import type { PlatformView } from '../platform';
import { card } from './shared';

/** Tema sekmesinin kabuktan aldığı tek şey: küresel denetleyici ve oturum bilgisi. */
export interface ThemeLabContext {
  readonly theme: ThemeController;
  readonly platform: Pick<PlatformView, 'platform' | 'session' | 'fullscreenControl'>;
}

const LANGUAGES = ['tr', 'en'] as const;

const skinLabel = (id: ThemeId): string =>
  i18next.t(id === 'aurum' ? 'volui:app.skinAurum' : 'volui:app.skinDefault');

const densityLabel = (id: DensityId): string =>
  i18next.t(
    id === 'compact'
      ? 'volui:theme.densityCompact'
      : id === 'spacious'
        ? 'volui:theme.densitySpacious'
        : 'volui:theme.densityComfortable',
  );

function skinControl(
  value: ThemeId,
  onCommit: (id: ThemeId) => void,
  ariaLabel = i18next.t('volui:theme.skin'),
): SegmentedControl {
  return new SegmentedControl({
    ariaLabel,
    options: THEME_IDS.map((id) => ({ value: id, label: skinLabel(id) })),
    value,
    onCommit: (next) => onCommit(next as ThemeId),
  });
}

/**
 * Yoğunluk üç uzun etiketli bir seçimdir ("Comfortable"): 320 px pencerede ve sahte yerelde segmentler kelime ortasından kırılırdı.
 * Seçim listesi her genişlikte aynı yeri tutar; kapsamlı önizlemede listesi de kutuya bağlanır (`container`).
 */
function densityControl(
  value: DensityId,
  onCommit: (id: DensityId) => void,
  container?: HTMLElement,
): Select {
  return new Select({
    options: DENSITY_IDS.map((id) => ({ value: id, label: densityLabel(id) })),
    value,
    onCommit: (next) => onCommit(next as DensityId),
    container,
  });
}

/**
 * Küresel seçiciler: skin, yoğunluk, dil ve büyük hedef tabanı. Hepsi tek `ThemeController`a (ve i18next'e) bağlıdır; üst
 * çubuktaki skin düğmesi gibi başka bir yerden gelen değişim bu kontrollere de yansır. Skin ve yoğunluk yalnız nitelik
 * yazar: DOM yeniden kurulmaz, kaydırma/odak/seçim korunur. Dil değişimi sekmeleri yeniden kurar (metinler kurulurken
 * çevrilir); kabuk etkin sekmeyi, kaydırmayı ve odağı geri yükler.
 */
function buildGlobalCard(
  context: ThemeLabContext,
  disposables: DisposableScope,
): { element: HTMLElement } {
  const { theme } = context;
  const body = document.createElement('div');
  body.className = 'vol-theme-lab__global';

  const skin = skinControl(theme.state.theme, (id) => theme.setTheme(id));
  const density = densityControl(theme.state.density, (id) => theme.setDensity(id));
  const language = new SegmentedControl({
    ariaLabel: i18next.t('volui:theme.language'),
    options: LANGUAGES.map((id) => ({
      value: id,
      label: i18next.t(id === 'tr' ? 'volui:forms.turkish' : 'volui:forms.english'),
    })),
    value: i18next.language === 'en' ? 'en' : 'tr',
    onCommit: (id) => void i18next.changeLanguage(id),
  });
  const targets = new Checkbox({
    label: i18next.t('volui:theme.largeTargets'),
    variant: 'switch',
    checked: theme.state.largeTargets,
    onCommit: (checked) => theme.setLargeTargets(checked),
  });
  disposables.addDestroyables(skin, density, language, targets);

  const rows = [
    new SettingsRow({ label: i18next.t('volui:theme.skin'), control: skin, stackOnNarrow: true }),
    new SettingsRow({
      label: i18next.t('volui:theme.density'),
      control: density,
      stackOnNarrow: true,
    }),
    new SettingsRow({
      label: i18next.t('volui:theme.language'),
      control: language,
      stackOnNarrow: true,
    }),
    new SettingsRow({ control: targets, stackOnNarrow: true }),
  ];
  body.append(...rows.map((row) => row.element));

  // Anlık durum: hangi kaplama/yoğunluk/hedef tabanı etkin. Başka yerden gelen değişim de buraya düşer.
  const readout = new Text('', { variant: 'muted' });
  readout.element.classList.add('vol-theme-lab__readout');
  readout.element.setAttribute('role', 'status');
  disposables.addDestroyables(readout);
  const render = (state: ThemeState): void => {
    readout.setContent(
      i18next.t('volui:theme.state', {
        skin: skinLabel(state.theme),
        density: densityLabel(state.density),
        targets: i18next.t(
          state.largeTargets ? 'volui:theme.targetsLarge' : 'volui:theme.targetsNormal',
        ),
      }),
    );
    skin.setValue(state.theme);
    density.setValue(state.density);
    targets.setChecked(state.largeTargets);
  };
  render(theme.state);
  disposables.add(theme.onChange(render));
  body.appendChild(readout.element);

  return { element: body };
}

/** Oturum bilgisi: "ben neyim, neredeyim" — platform, oturum sınıfı ve tam ekran kontrolünün gerçek karşılığı. */
function buildSessionCard(context: ThemeLabContext, disposables: DisposableScope): HTMLElement {
  const { platform, session, fullscreenControl } = context.platform;
  const fullscreenKey =
    fullscreenControl === 'native-window'
      ? 'volui:theme.fullscreenNative'
      : fullscreenControl === 'browser'
        ? 'volui:theme.fullscreenBrowser'
        : 'volui:theme.fullscreenNone';
  const readout = new Text(
    i18next.t('volui:theme.sessionReadout', {
      platform,
      session,
      fullscreen: i18next.t(fullscreenKey),
    }),
    { variant: 'muted' },
  );
  readout.element.classList.add('vol-theme-lab__session');
  disposables.addDestroyables(readout);
  return readout.element;
}

type ScopeKind = 'global' | 'a' | 'b';

const SCOPE_INITIAL: Readonly<Record<'a' | 'b', { theme: ThemeId; density: DensityId }>> = {
  a: { theme: 'aurum', density: 'spacious' },
  b: { theme: 'default', density: 'compact' },
};

/**
 * Önizleme kapsamı. `global` kendi denetleyicisi olmayan, kökü izleyen kapsamdır (katmanları `<body>`ye iner). `a`/`b` kendi
 * `ThemeController`ına sahiptir: kaplama ve yoğunluk yalnız bu kutuyu etkiler, katmanlar (`Select` listesi) `container`
 * olarak kutuya bağlanır — aksi halde `<body>`ye taşınan katman kutunun temasını almaz.
 */
function buildScope(kind: ScopeKind, disposables: DisposableScope): HTMLElement {
  const scope = document.createElement('div');
  scope.className = 'vol-theme-scope';
  scope.dataset.volScope = kind;

  let controller: ThemeController | null = null;
  const header = document.createElement('div');
  header.className = 'vol-theme-scope__header';
  const note = new Text(
    i18next.t(kind === 'global' ? 'volui:theme.noteGlobal' : 'volui:theme.noteScoped'),
    { variant: 'muted', tag: 'span' },
  );
  disposables.addDestroyables(note);
  header.appendChild(note.element);

  if (kind !== 'global') {
    const initial = SCOPE_INITIAL[kind];
    const own = new ThemeController({ theme: initial.theme, density: initial.density });
    controller = own;
    disposables.add(own.attach(scope));
    disposables.add(own);
    const scopeName = i18next.t(kind === 'a' ? 'volui:theme.scopeA' : 'volui:theme.scopeB');
    const skin = skinControl(
      initial.theme,
      (id) => own.setTheme(id),
      i18next.t('volui:theme.scopeSkin', { scope: scopeName }),
    );
    const density = densityControl(initial.density, (id) => own.setDensity(id), scope);
    disposables.addDestroyables(skin, density);
    const controls = document.createElement('div');
    controls.className = 'vol-theme-scope__controls';
    controls.append(
      new SettingsRow({
        label: i18next.t('volui:theme.skin'),
        control: skin,
        stackOnNarrow: true,
      }).element,
      new SettingsRow({
        label: i18next.t('volui:theme.density'),
        control: density,
        stackOnNarrow: true,
      }).element,
    );
    header.appendChild(controls);
  }
  scope.appendChild(header);

  const sample = document.createElement('div');
  sample.className = 'vol-theme-scope__sample';
  const container = controller ? scope : undefined;

  const buttons = document.createElement('div');
  buttons.className = 'vol-theme-scope__buttons';
  for (const [variant, key] of [
    ['primary', 'volui:theme.samplePrimary'],
    ['default', 'volui:theme.sampleDefault'],
    ['danger', 'volui:theme.sampleDanger'],
  ] as const) {
    const button = new Button(i18next.t(key), { variant, size: 'sm', fullWidth: false });
    disposables.addDestroyables(button);
    buttons.appendChild(button.element);
  }
  sample.appendChild(buttons);

  const input = new Input({
    value: i18next.t('volui:theme.sampleNameValue'),
    ariaLabel: i18next.t('volui:theme.sampleName'),
  });
  const volume = new Slider({
    label: i18next.t('volui:theme.sampleVolume'),
    min: 0,
    max: 100,
    value: 60,
  });
  const notify = new Checkbox({
    label: i18next.t('volui:theme.sampleSwitch'),
    variant: 'switch',
    checked: true,
  });
  const quality = new Select({
    options: [
      { value: 'low', label: i18next.t('volui:forms.low') },
      { value: 'high', label: i18next.t('volui:forms.high') },
    ],
    value: 'high',
    container,
  });
  disposables.addDestroyables(input, volume, notify, quality);
  sample.append(
    input.element,
    volume.element,
    notify.element,
    new SettingsRow({
      label: i18next.t('volui:theme.sampleSelect'),
      control: quality,
      stackOnNarrow: true,
    }).element,
  );

  // Canvas çizimleri CSS değil: tema değişimini kendileri izler (`watchTheme`); kutu kaplamasını da buradan alırlar.
  const curve = new CurveEditor({
    label: i18next.t('volui:theme.sampleCurve'),
    width: 160,
    height: 96,
    points: [
      [0, 0],
      [0.5, 0.8],
      [1, 1],
    ],
  });
  const minimap = new MinimapPanel({
    width: 120,
    height: 120,
    worldWidth: 1000,
    worldHeight: 1000,
  });
  minimap.setMarker('base', { worldX: 300, worldY: 400, color: '#ffffff' });
  minimap.setViewport(100, 150, 400, 300);
  disposables.addDestroyables(curve, minimap);
  const canvases = document.createElement('div');
  canvases.className = 'vol-theme-scope__canvases';
  canvases.append(curve.element, minimap.element);
  sample.appendChild(canvases);

  scope.appendChild(sample);
  return scope;
}

export function buildThemeTab(context: ThemeLabContext): {
  element: HTMLElement;
  destroy: () => void;
} {
  const container = document.createElement('div');
  container.className = 'vol-showcase-section vol-theme-lab';
  const disposables = new DisposableScope();

  const global = buildGlobalCard(context, disposables);
  const session = buildSessionCard(context, disposables);
  const globalBody = document.createElement('div');
  globalBody.className = 'vol-theme-lab__body';
  globalBody.append(global.element, session);

  const scopes = (['global', 'a', 'b'] as const).map((kind) =>
    card(
      i18next.t(
        kind === 'global'
          ? 'volui:theme.scopeGlobal'
          : kind === 'a'
            ? 'volui:theme.scopeA'
            : 'volui:theme.scopeB',
      ),
      buildScope(kind, disposables),
    ),
  );

  const scopeGrid = document.createElement('div');
  scopeGrid.className = 'vol-theme-lab__scopes';
  scopeGrid.append(...scopes);
  container.append(card(i18next.t('volui:theme.global'), globalBody, { spanAll: true }), scopeGrid);
  return { element: container, destroy: () => disposables.dispose() };
}
