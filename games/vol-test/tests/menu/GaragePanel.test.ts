import { afterEach, describe, expect, it, vi } from 'vitest';
import { i18next } from '@volstudio/core/i18n';
import { NAME_MAX_LENGTH } from '@volstudio/network/protocol';
import { FACTION_AUTO } from '@/app/GameSettings';
import { VEHICLE_IDS, type VehicleId } from '@/config/vehicles';
import { GaragePanel, type GarageChoice } from '@/menu/GaragePanel';
import { vehicleStats } from '@/menu/vehicleStats';

const panels: GaragePanel[] = [];

function mount(vehicle: VehicleId = 'striker', faction = FACTION_AUTO, name = 'Kaptan') {
  const picked: VehicleId[] = [];
  const factions: number[] = [];
  const names: string[] = [];
  const joined: GarageChoice[] = [];
  const onPractice = vi.fn();
  const onBack = vi.fn();
  const panel = new GaragePanel({
    vehicle,
    faction,
    name,
    onVehicle: (id) => picked.push(id),
    onFaction: (value) => factions.push(value),
    onName: (value) => names.push(value),
    onJoin: (choice) => joined.push(choice),
    onPractice,
    onBack,
  });
  document.body.append(panel.element);
  panels.push(panel);
  const find = <T extends HTMLElement = HTMLElement>(id: string): T =>
    panel.element.querySelector<T>(`[data-testid="${id}"]`)!;
  const card = (id: VehicleId): HTMLButtonElement =>
    find<HTMLButtonElement>(`garage-vehicle-${id}`);
  const factionButton = (label: string): HTMLButtonElement =>
    [...find('garage-faction').querySelectorAll<HTMLButtonElement>('[role="radio"]')].find(
      (button) => button.textContent === label,
    )!;
  return { panel, picked, factions, names, joined, onPractice, onBack, find, card, factionButton };
}

afterEach(async () => {
  for (const panel of panels.splice(0)) panel.destroy();
  await i18next.changeLanguage('tr');
});

describe('GaragePanel', () => {
  it('her araç için bir kart kurar; kayıtlı araç seçili ve odak sırasındadır', () => {
    const { card } = mount('dart');
    expect(VEHICLE_IDS.map((id) => card(id).getAttribute('aria-checked'))).toEqual(
      VEHICLE_IDS.map((id) => String(id === 'dart')),
    );
    expect(card('dart').tabIndex).toBe(0);
    expect(card('striker').tabIndex).toBe(-1);
    expect(card('bulwark').textContent).toContain(
      i18next.t('voltest:garage.vehicles.bulwark.name'),
    );
    expect(card('bulwark').textContent).toContain(
      i18next.t('voltest:garage.vehicles.bulwark.role'),
    );
  });

  it('ölçü çubukları katalog oranını taşır', () => {
    const { card } = mount();
    for (const id of VEHICLE_IDS) {
      const bars = [...card(id).querySelectorAll<HTMLElement>('.vt-stat__bar')].map((bar) =>
        Number(bar.style.getPropertyValue('--vt-stat')),
      );
      const stats = vehicleStats(id);
      expect(bars).toEqual([stats.durability, stats.speed, stats.firepower]);
    }
  });

  it('karta tıklamak aracı seçer ve bildirir; aynı kart tekrar bildirir ama tek seçili kalır', () => {
    const { card, picked } = mount();
    card('arachnid').click();
    expect(picked).toEqual(['arachnid']);
    expect(card('arachnid').getAttribute('aria-checked')).toBe('true');
    expect(card('striker').getAttribute('aria-checked')).toBe('false');
    expect(card('arachnid').tabIndex).toBe(0);
  });

  it('ok tuşları seçimi gezdirir ve uçlarda başa sarar', () => {
    const { card, picked } = mount('striker');
    const press = (key: string, id: VehicleId): void => {
      card(id).dispatchEvent(
        new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
      );
    };
    press('ArrowRight', 'striker');
    press('ArrowRight', 'bulwark');
    press('ArrowLeft', 'dart');
    press('ArrowLeft', 'bulwark');
    press('ArrowLeft', 'striker');
    expect(picked).toEqual(['bulwark', 'dart', 'bulwark', 'striker', 'arachnid']);
    expect(document.activeElement).toBe(card('arachnid'));
    press('Enter', 'arachnid');
    expect(picked).toHaveLength(5);
  });

  it('katıl: adı ve istenen cepheyi verir; ad alanı sınırlıdır', () => {
    const { find, factionButton, joined, names, factions } = mount('striker', FACTION_AUTO, 'Ada');
    expect(find<HTMLInputElement>('garage-name').value).toBe('Ada');
    expect(find<HTMLInputElement>('garage-name').maxLength).toBe(NAME_MAX_LENGTH);
    find('garage-join').click();
    expect(joined).toEqual([{ name: 'Ada', faction: FACTION_AUTO }]);
    expect(names).toEqual(['Ada']);
    factionButton(i18next.t('voltest:war.faction.blue')).click();
    expect(factions).toEqual([1]);
    find('garage-join').click();
    expect(joined[1]).toEqual({ name: 'Ada', faction: 1 });
  });

  it('kayıtlı cephe seçili açılır', () => {
    const { factionButton } = mount('striker', 0);
    expect(factionButton(i18next.t('voltest:war.faction.amber')).getAttribute('aria-checked')).toBe(
      'true',
    );
  });

  it('bağlanırken seçimler kilitlenir, durum görünür; hata durumu açar', () => {
    const { panel, find, card, joined } = mount();
    panel.setBusy(true);
    expect(find('garage-status').textContent).toBe(i18next.t('voltest:online.connecting'));
    expect(find<HTMLButtonElement>('garage-join').disabled).toBe(true);
    expect(find<HTMLButtonElement>('garage-practice').disabled).toBe(true);
    expect(find<HTMLInputElement>('garage-name').disabled).toBe(true);
    expect(card('dart').disabled).toBe(true);
    // Geri dönüş bağlanırken de açık kalır: vazgeçmek mümkündür.
    expect(find<HTMLButtonElement>('garage-back').disabled).toBe(false);
    find('garage-join').click();
    expect(joined).toHaveLength(0);

    panel.showError('voltest:online.error.unreachable');
    expect(find('garage-status').textContent).toBe(i18next.t('voltest:online.error.unreachable'));
    expect(find('garage-status').dataset.tone).toBe('danger');
    expect(find<HTMLButtonElement>('garage-join').disabled).toBe(false);
    expect(card('dart').disabled).toBe(false);
  });

  it('alıştırma ve geri niyetlerini bildirir', () => {
    const { find, onPractice, onBack } = mount();
    find('garage-practice').click();
    find('garage-back').click();
    expect(onPractice).toHaveBeenCalledTimes(1);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('dil değişince araç adları, durum ve cephe seçimi korunarak yenilenir', async () => {
    const { panel, find, card, factionButton } = mount('striker', FACTION_AUTO);
    factionButton(i18next.t('voltest:war.faction.blue')).click();
    panel.setBusy(true);
    await i18next.changeLanguage('en');
    expect(find('garage-join').textContent).toBe('Join the war');
    expect(card('arachnid').textContent).toContain('Legged war beast');
    expect(find('garage-status').textContent).toBe('Connecting…');
    expect(factionButton('Blue').getAttribute('aria-checked')).toBe('true');
  });
});
