import { i18next } from '@volstudio/core/i18n';
import { DisposableScope } from '@volstudio/core/lifecycle';
import { Button, Input, SegmentedControl, Text } from '@volstudio/core/ui';
import { NAME_MAX_LENGTH } from '@volstudio/network/protocol';
import { FACTION_AUTO } from '@/app/GameSettings';
import { VEHICLE_IDS, type VehicleId } from '@/config/vehicles';
import { WAR } from '@/config/war';
import type { MessageKey } from '@/i18n/keys';
import { vehicleStats, type VehicleStats } from './vehicleStats';
import './menu.css';

/** Garajdan çıkan katılım seçimi. */
export interface GarageChoice {
  readonly name: string;
  /** `FACTION_AUTO` ya da cephe sırası. */
  readonly faction: number;
}

export interface GarageOptions {
  readonly vehicle: VehicleId;
  /** İstenen cephe; `FACTION_AUTO` sunucunun dengeye göre seçmesi demektir. */
  readonly faction: number;
  readonly name: string;
  /** Seçim değişince çağrılır (vitrin ve tercih güncellenir). */
  readonly onVehicle: (vehicle: VehicleId) => void;
  readonly onFaction: (faction: number) => void;
  readonly onName: (name: string) => void;
  /** Savaşa katılma istendi; sonuç `setBusy`/`showError` ile bildirilir. */
  readonly onJoin: (choice: GarageChoice) => void;
  readonly onPractice: () => void;
  readonly onBack: () => void;
}

const NAME_KEYS = {
  striker: 'voltest:garage.vehicles.striker.name',
  bulwark: 'voltest:garage.vehicles.bulwark.name',
  dart: 'voltest:garage.vehicles.dart.name',
  arachnid: 'voltest:garage.vehicles.arachnid.name',
} as const satisfies Record<VehicleId, MessageKey>;

const ROLE_KEYS = {
  striker: 'voltest:garage.vehicles.striker.role',
  bulwark: 'voltest:garage.vehicles.bulwark.role',
  dart: 'voltest:garage.vehicles.dart.role',
  arachnid: 'voltest:garage.vehicles.arachnid.role',
} as const satisfies Record<VehicleId, MessageKey>;

const STAT_KEYS = {
  durability: 'voltest:garage.stat.durability',
  speed: 'voltest:garage.stat.speed',
  firepower: 'voltest:garage.stat.firepower',
} as const satisfies Record<keyof VehicleStats, MessageKey>;

const FACTION_KEYS: readonly MessageKey[] = [
  'voltest:war.faction.amber',
  'voltest:war.faction.blue',
] as const;

interface Card {
  readonly id: VehicleId;
  readonly element: HTMLButtonElement;
  readonly name: HTMLElement;
  readonly role: HTMLElement;
  readonly statLabels: Map<keyof VehicleStats, HTMLElement>;
}

/**
 * Garaj: araç, cephe ve ad seçimi. Araç kartları gerçek katalogdan (ad, görev, üç ölçü) kurulur;
 * seçim vitrine ve tercihe sahibi aracılığıyla yansır. Panel ağa dokunmaz: katılma niyetini
 * `onJoin`e verir, sonucu sahibi bildirir.
 */
export class GaragePanel {
  readonly element: HTMLElement;
  private readonly scope = new DisposableScope();
  private readonly title = new Text('', { variant: 'heading', tag: 'h2' });
  private readonly vehicleLabel = new Text('', { variant: 'muted', tag: 'span' });
  private readonly nameLabel = new Text('', { variant: 'muted', tag: 'span' });
  private readonly factionLabel = new Text('', { variant: 'muted', tag: 'span' });
  private readonly name: Input;
  private readonly faction: SegmentedControl;
  private readonly join: Button;
  private readonly practice: Button;
  private readonly back: Button;
  private readonly status = new Text('', { variant: 'body', tag: 'p' });
  private readonly cards: Card[];
  private readonly list: HTMLElement;
  private selected: VehicleId;
  private factionValue: string;
  private statusKey: MessageKey | undefined;
  private busy = false;

  constructor(private readonly options: GarageOptions) {
    this.selected = options.vehicle;
    this.factionValue = String(options.faction);
    this.element = document.createElement('section');
    this.element.className = 'vt-screen vt-garage';
    this.element.dataset.testid = 'garage';

    this.list = document.createElement('div');
    this.list.className = 'vt-garage__vehicles';
    this.list.setAttribute('role', 'radiogroup');
    this.cards = VEHICLE_IDS.map((id) => this.buildCard(id));
    this.list.append(...this.cards.map((card) => card.element));
    this.scope.addListener(this.list, 'keydown', (event: KeyboardEvent) => this.onKey(event));

    this.name = new Input({
      value: options.name,
      onCommit: (value) => options.onName(value),
      onEnter: () => this.submit(),
      enterKeyHint: 'go',
    });
    this.name.element.maxLength = NAME_MAX_LENGTH;
    this.name.element.dataset.testid = 'garage-name';
    this.faction = new SegmentedControl({
      options: this.factionOptions(),
      value: String(options.faction),
      onCommit: (value) => {
        this.factionValue = value;
        options.onFaction(Number(value));
      },
    });
    this.faction.element.dataset.testid = 'garage-faction';
    this.join = new Button('', { variant: 'primary', onClick: () => this.submit() });
    this.join.element.dataset.testid = 'garage-join';
    this.practice = new Button('', { onClick: () => options.onPractice() });
    this.practice.element.dataset.testid = 'garage-practice';
    this.back = new Button('', { onClick: () => options.onBack() });
    this.back.element.dataset.testid = 'garage-back';
    this.status.element.dataset.testid = 'garage-status';
    this.status.element.setAttribute('role', 'status');
    this.status.element.classList.add('vt-screen__status');

    const actions = document.createElement('div');
    actions.className = 'vt-screen__actions';
    actions.append(this.join.element, this.practice.element, this.back.element);
    this.element.append(
      this.title.element,
      this.vehicleLabel.element,
      this.list,
      this.nameLabel.element,
      this.name.element,
      this.factionLabel.element,
      this.faction.element,
      this.status.element,
      actions,
    );
    this.select(options.vehicle, false);
    this.refreshLabels();
    const onLanguage = (): void => this.refreshLabels();
    i18next.on('languageChanged', onLanguage);
    this.scope.addSubscription(() => i18next.off('languageChanged', onLanguage));
  }

  /** Klavye ve kol gezintisi seçili araçtan başlasın. */
  focus(): void {
    this.cards.find((card) => card.id === this.selected)?.element.focus({ preventScroll: true });
  }

  /** Bağlanırken seçimler kilitlenir ve durum satırı "bağlanıyor" der. */
  setBusy(busy: boolean): void {
    this.busy = busy;
    this.join.setDisabled(busy);
    this.practice.setDisabled(busy);
    this.name.setDisabled(busy);
    this.faction.setDisabled(busy);
    for (const card of this.cards) card.element.disabled = busy;
    if (busy) this.setStatus('voltest:online.connecting');
    else if (this.statusKey === 'voltest:online.connecting') this.setStatus(undefined);
  }

  /** Katılım hatasını durum satırında gösterir ve seçimleri açar. */
  showError(key: MessageKey): void {
    this.setBusy(false);
    this.setStatus(key, true);
  }

  refreshLabels(): void {
    this.title.setContent(i18next.t('voltest:garage.title'));
    this.vehicleLabel.setContent(i18next.t('voltest:garage.vehicle'));
    this.nameLabel.setContent(i18next.t('voltest:online.name'));
    this.name.element.placeholder = i18next.t('voltest:online.namePlaceholder');
    this.name.element.setAttribute('aria-label', i18next.t('voltest:online.name'));
    this.factionLabel.setContent(i18next.t('voltest:online.faction'));
    this.faction.setOptions(this.factionOptions());
    this.faction.setValue(this.factionValue);
    this.faction.setAriaLabel(i18next.t('voltest:online.faction'));
    this.join.setLabel(i18next.t('voltest:garage.join'));
    this.practice.setLabel(i18next.t('voltest:garage.practice'));
    this.back.setLabel(i18next.t('voltest:garage.back'));
    this.list.setAttribute('aria-label', i18next.t('voltest:garage.vehicle'));
    for (const card of this.cards) {
      card.name.textContent = i18next.t(NAME_KEYS[card.id]);
      card.role.textContent = i18next.t(ROLE_KEYS[card.id]);
      for (const [stat, label] of card.statLabels) label.textContent = i18next.t(STAT_KEYS[stat]);
    }
    if (this.statusKey) this.status.setContent(i18next.t(this.statusKey));
  }

  destroy(): void {
    this.scope.dispose();
    for (const part of [
      this.title,
      this.vehicleLabel,
      this.nameLabel,
      this.factionLabel,
      this.name,
      this.faction,
      this.join,
      this.practice,
      this.back,
      this.status,
    ])
      part.destroy();
    this.element.remove();
  }

  private buildCard(id: VehicleId): Card {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = 'vt-vehicle';
    element.dataset.testid = `garage-vehicle-${id}`;
    element.setAttribute('role', 'radio');
    const name = document.createElement('span');
    name.className = 'vt-vehicle__name';
    const role = document.createElement('span');
    role.className = 'vt-vehicle__role';
    const stats = document.createElement('span');
    stats.className = 'vt-vehicle__stats';
    const statLabels = new Map<keyof VehicleStats, HTMLElement>();
    const values = vehicleStats(id);
    for (const stat of Object.keys(STAT_KEYS) as Array<keyof VehicleStats>) {
      const row = document.createElement('span');
      row.className = 'vt-stat';
      const label = document.createElement('span');
      label.className = 'vt-stat__label';
      const bar = document.createElement('span');
      bar.className = 'vt-stat__bar';
      bar.style.setProperty('--vt-stat', String(values[stat]));
      row.append(label, bar);
      stats.append(row);
      statLabels.set(stat, label);
    }
    element.append(name, role, stats);
    this.scope.addListener(element, 'click', () => this.select(id, true));
    return { id, element, name, role, statLabels };
  }

  private select(id: VehicleId, notify: boolean): void {
    this.selected = id;
    for (const card of this.cards) {
      const checked = card.id === id;
      card.element.setAttribute('aria-checked', String(checked));
      card.element.tabIndex = checked ? 0 : -1;
    }
    if (notify) this.options.onVehicle(id);
  }

  /** Ok tuşları seçimi gezdirir (radyo grubu davranışı); seçim odağı da taşır. */
  private onKey(event: KeyboardEvent): void {
    const step =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0;
    if (step === 0 || this.busy) return;
    event.preventDefault();
    const index = this.cards.findIndex((card) => card.id === this.selected);
    const next = this.cards[(index + step + this.cards.length) % this.cards.length];
    this.select(next.id, true);
    next.element.focus({ preventScroll: true });
  }

  private submit(): void {
    if (this.busy) return;
    const name = this.name.getValue();
    this.options.onName(name);
    this.options.onJoin({ name, faction: Number(this.factionValue) });
  }

  private factionOptions(): Array<{ value: string; label: string }> {
    return [
      { value: String(FACTION_AUTO), label: i18next.t('voltest:online.factionAuto') },
      ...FACTION_KEYS.slice(0, WAR.factions).map((key, index) => ({
        value: String(index),
        label: i18next.t(key),
      })),
    ];
  }

  private setStatus(key: MessageKey | undefined, danger = false): void {
    this.statusKey = key;
    this.status.setContent(key ? i18next.t(key) : '');
    this.status.element.dataset.tone = danger ? 'danger' : '';
  }
}
