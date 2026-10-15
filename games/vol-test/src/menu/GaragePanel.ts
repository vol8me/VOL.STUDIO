import { i18next } from '@volstudio/core/i18n';
import { DisposableScope } from '@volstudio/core/lifecycle';
import {
  Bar,
  Button,
  CardTile,
  Input,
  SegmentedControl,
  SettingsForm,
  SettingsRow,
  Text,
  type CardRarity,
} from '@volstudio/core/ui';
import { NAME_MAX_LENGTH } from '@volstudio/network/protocol';
import { FACTION_AUTO } from '@/app/GameSettings';
import { VEHICLE_IDS, type VehicleId } from '@/config/vehicles';
import { WAR } from '@/config/war';
import type { MessageKey } from '@/i18n/keys';
import { ScreenFrame } from './ScreenFrame';
import { vehicleStats, type VehicleStats } from './vehicleStats';

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
  widow: 'voltest:garage.vehicles.widow.name',
  goliath: 'voltest:garage.vehicles.goliath.name',
  manta: 'voltest:garage.vehicles.manta.name',
  barracuda: 'voltest:garage.vehicles.barracuda.name',
  leviathan: 'voltest:garage.vehicles.leviathan.name',
  warhound: 'voltest:garage.vehicles.warhound.name',
  templar: 'voltest:garage.vehicles.templar.name',
  juggernaut: 'voltest:garage.vehicles.juggernaut.name',
} as const satisfies Record<VehicleId, MessageKey>;

const CLASS_KEYS = {
  striker: 'voltest:garage.vehicles.striker.class',
  bulwark: 'voltest:garage.vehicles.bulwark.class',
  dart: 'voltest:garage.vehicles.dart.class',
  arachnid: 'voltest:garage.vehicles.arachnid.class',
  widow: 'voltest:garage.vehicles.widow.class',
  goliath: 'voltest:garage.vehicles.goliath.class',
  manta: 'voltest:garage.vehicles.manta.class',
  barracuda: 'voltest:garage.vehicles.barracuda.class',
  leviathan: 'voltest:garage.vehicles.leviathan.class',
  warhound: 'voltest:garage.vehicles.warhound.class',
  templar: 'voltest:garage.vehicles.templar.class',
  juggernaut: 'voltest:garage.vehicles.juggernaut.class',
} as const satisfies Record<VehicleId, MessageKey>;

/** Kart kademesi: CORE kartın nadirlik gösterimi araç sınıfının ağırlığını taşır. */
const TIER = {
  dart: 'rare',
  striker: 'rare',
  bulwark: 'epic',
  arachnid: 'legendary',
  widow: 'legendary',
  goliath: 'legendary',
  manta: 'epic',
  barracuda: 'rare',
  leviathan: 'legendary',
  warhound: 'rare',
  templar: 'epic',
  juggernaut: 'legendary',
} as const satisfies Record<VehicleId, CardRarity>;

const STAT_KEYS = {
  durability: 'voltest:garage.stat.durability',
  speed: 'voltest:garage.stat.speed',
  firepower: 'voltest:garage.stat.firepower',
} as const satisfies Record<keyof VehicleStats, MessageKey>;

const FACTION_KEYS: readonly MessageKey[] = [
  'voltest:war.faction.amber',
  'voltest:war.faction.blue',
] as const;

interface Entry {
  readonly id: VehicleId;
  readonly card: CardTile;
  readonly statLabels: Map<keyof VehicleStats, Text>;
}

/**
 * Garaj (tam ekran): araç, cephe ve ad seçimi. Araçlar CORE `CardTile`dır (ad, sınıf rozeti, üç
 * ölçü `Bar`ı), katılım alanı `SettingsRow`lardır. Ortadaki `stage` bölgesi boş bırakılır: canlı araç
 * vitrini oraya kurulur. Panel ağa dokunmaz: katılma niyetini `onJoin`e verir, sonucu sahibi bildirir.
 */
export class GaragePanel {
  private readonly frame: ScreenFrame;
  private readonly scope = new DisposableScope();
  private readonly name: Input;
  private readonly nameRow: SettingsRow;
  private readonly faction: SegmentedControl;
  private readonly factionRow: SettingsRow;
  private readonly join: Button;
  private readonly practice: Button;
  private readonly status: Text;
  private readonly vehiclesLabel: Text;
  private readonly entries: Entry[];
  private readonly cards: HTMLElement;
  private readonly stageElement: HTMLElement;
  private selected: VehicleId;
  private factionValue: string;
  private statusKey: MessageKey | undefined;
  private busy = false;

  constructor(private readonly options: GarageOptions) {
    this.selected = options.vehicle;
    this.factionValue = String(options.faction);
    this.frame = new ScreenFrame({ testid: 'garage', variant: 'full', onBack: options.onBack });
    this.status = this.scope.addDestroyable(new Text('', { variant: 'body', tag: 'p' }));
    this.vehiclesLabel = this.scope.addDestroyable(new Text('', { variant: 'muted', tag: 'h2' }));

    this.cards = document.createElement('div');
    this.cards.className = 'vt-garage__cards';
    this.cards.setAttribute('role', 'group');
    this.entries = VEHICLE_IDS.map((id) => this.buildEntry(id));
    this.cards.append(...this.entries.map((entry) => entry.card.element));
    const vehicles = document.createElement('section');
    vehicles.className = 'vt-garage__vehicles';
    vehicles.append(this.vehiclesLabel.element, this.cards);

    this.stageElement = document.createElement('div');
    this.stageElement.className = 'vt-garage__stage';
    this.stageElement.setAttribute('aria-hidden', 'true');

    this.name = this.scope.addDestroyable(
      new Input({
        value: options.name,
        onCommit: (value) => options.onName(value),
        onEnter: () => this.submit(),
        enterKeyHint: 'go',
      }),
    );
    this.name.element.maxLength = NAME_MAX_LENGTH;
    this.name.element.dataset.testid = 'garage-name';
    this.faction = this.scope.addDestroyable(
      new SegmentedControl({
        options: this.factionOptions(),
        value: String(options.faction),
        onCommit: (value) => {
          this.factionValue = value;
          options.onFaction(Number(value));
        },
      }),
    );
    this.faction.element.dataset.testid = 'garage-faction';
    this.nameRow = this.scope.addDestroyable(
      new SettingsRow({
        label: i18next.t('voltest:online.name'),
        control: this.name,
        stackOnNarrow: true,
      }),
    );
    this.factionRow = this.scope.addDestroyable(
      new SettingsRow({
        label: i18next.t('voltest:online.faction'),
        control: this.faction,
        stackOnNarrow: true,
      }),
    );
    const form = this.scope.addDestroyable(new SettingsForm({ className: 'vt-garage__form' }));
    form.add(this.nameRow);
    form.add(this.factionRow);
    this.status.element.dataset.testid = 'garage-status';
    this.status.element.setAttribute('role', 'status');
    this.status.element.classList.add('vt-screen__status');
    const joinSection = document.createElement('section');
    joinSection.className = 'vt-garage__join';
    joinSection.append(form.element, this.status.element);

    const layout = document.createElement('div');
    layout.className = 'vt-garage__layout';
    layout.append(vehicles, this.stageElement, joinSection);
    this.frame.body.add({ element: layout });

    this.join = this.scope.addDestroyable(
      new Button('', { variant: 'primary', onClick: () => this.submit() }),
    );
    this.join.element.dataset.testid = 'garage-join';
    this.practice = this.scope.addDestroyable(
      new Button('', { onClick: () => options.onPractice() }),
    );
    this.practice.element.dataset.testid = 'garage-practice';
    this.frame.footer.append(this.join.element, this.practice.element);

    this.select(options.vehicle, false);
    this.refreshLabels();
    const onLanguage = (): void => this.refreshLabels();
    i18next.on('languageChanged', onLanguage);
    this.scope.addSubscription(() => i18next.off('languageChanged', onLanguage));
  }

  get element(): HTMLElement {
    return this.frame.element;
  }

  /** Vitrinin kurulacağı boş bölge. */
  get stage(): HTMLElement {
    return this.stageElement;
  }

  /** Klavye ve kol gezintisi seçili araçtan başlasın. */
  focus(): void {
    this.entry(this.selected)
      .card.element.querySelector<HTMLElement>('.vol-card__action')
      ?.focus({ preventScroll: true });
  }

  /** Bağlanırken seçimler kilitlenir ve durum satırı "bağlanıyor" der. */
  setBusy(busy: boolean): void {
    this.busy = busy;
    this.join.setDisabled(busy);
    this.practice.setDisabled(busy);
    this.name.setDisabled(busy);
    this.faction.setDisabled(busy);
    for (const { card } of this.entries) card.setDisabled(busy);
    if (busy) this.setStatus('voltest:online.connecting');
    else if (this.statusKey === 'voltest:online.connecting') this.setStatus(undefined);
  }

  /** Katılım hatasını durum satırında gösterir ve seçimleri açar. */
  showError(key: MessageKey): void {
    this.setBusy(false);
    this.setStatus(key, true);
  }

  refreshLabels(): void {
    this.frame.setTitle(i18next.t('voltest:garage.title'));
    this.frame.setBackLabel(i18next.t('voltest:garage.back'));
    this.vehiclesLabel.setContent(i18next.t('voltest:garage.vehicle'));
    this.nameRow.setLabel(i18next.t('voltest:online.name'));
    this.name.element.placeholder = i18next.t('voltest:online.namePlaceholder');
    this.factionRow.setLabel(i18next.t('voltest:online.faction'));
    this.faction.setOptions(this.factionOptions());
    this.faction.setValue(this.factionValue);
    this.join.setLabel(i18next.t('voltest:garage.join'));
    this.practice.setLabel(i18next.t('voltest:garage.practice'));
    this.cards.setAttribute('aria-label', i18next.t('voltest:garage.vehicle'));
    for (const entry of this.entries) {
      entry.card.update({
        title: i18next.t(NAME_KEYS[entry.id]),
        rarityLabel: i18next.t(CLASS_KEYS[entry.id]),
      });
      for (const [stat, label] of entry.statLabels) label.setContent(i18next.t(STAT_KEYS[stat]));
      this.syncSelect(entry);
    }
    if (this.statusKey) this.status.setContent(i18next.t(this.statusKey));
  }

  destroy(): void {
    this.scope.dispose();
    for (const { card } of this.entries) card.destroy();
    this.frame.destroy();
  }

  private entry(id: VehicleId): Entry {
    return this.entries.find((candidate) => candidate.id === id)!;
  }

  private buildEntry(id: VehicleId): Entry {
    const card = new CardTile({
      data: { id, title: '', description: '', rarity: TIER[id], rarityLabel: '-' },
      actionLabel: '',
      selected: false,
      onAction: () => this.select(id, true),
    });
    card.element.dataset.testid = `garage-vehicle-${id}`;
    card.element.classList.add('vt-garage__card');
    const stats = document.createElement('div');
    stats.className = 'vt-garage__stats';
    const statLabels = new Map<keyof VehicleStats, Text>();
    const values = vehicleStats(id);
    for (const stat of Object.keys(STAT_KEYS) as Array<keyof VehicleStats>) {
      const label = this.scope.addDestroyable(new Text('', { variant: 'muted', tag: 'span' }));
      const bar = this.scope.addDestroyable(
        new Bar({
          max: 100,
          value: Math.round(values[stat] * 100),
          variant: 'stat',
          fillColor: 'var(--vol-ui-accent-solid)',
          lowThreshold: null,
          animateMs: 0,
          ariaLabel: '',
        }),
      );
      bar.element.dataset.stat = stat;
      const row = document.createElement('div');
      row.className = 'vt-garage__stat';
      row.append(label.element, bar.element);
      stats.append(row);
      statLabels.set(stat, label);
    }
    card.addDetail({ element: stats });
    return { id, card, statLabels };
  }

  private select(id: VehicleId, notify: boolean): void {
    this.selected = id;
    for (const entry of this.entries) {
      entry.card.setSelected(entry.id === id);
      this.syncSelect(entry);
    }
    if (notify) this.options.onVehicle(id);
  }

  /** Düğme metni durumu söyler: seçili araç "Seçili", diğerleri "Seç". */
  private syncSelect(entry: Entry): void {
    entry.card.setActionLabel(
      i18next.t(entry.id === this.selected ? 'voltest:garage.selected' : 'voltest:garage.select'),
    );
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
