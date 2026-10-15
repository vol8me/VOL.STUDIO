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
  const card = (id: VehicleId): HTMLElement => find(`garage-vehicle-${id}`);
  const pick = (id: VehicleId): HTMLButtonElement =>
    card(id).querySelector<HTMLButtonElement>('.vol-card__action')!;
  const factionButton = (label: string): HTMLButtonElement =>
    [...find('garage-faction').querySelectorAll<HTMLButtonElement>('[role="radio"]')].find(
      (button) => button.textContent === label,
    )!;
  return {
    panel,
    picked,
    factions,
    names,
    joined,
    onPractice,
    onBack,
    find,
    card,
    pick,
    factionButton,
  };
}

afterEach(async () => {
  for (const panel of panels.splice(0)) panel.destroy();
  await i18next.changeLanguage('tr');
});

describe('GaragePanel', () => {
  it('her araç için bir CORE kartı kurar; kayıtlı araç seçili ve basılı görünür', () => {
    const { card, pick } = mount('dart');
    expect(VEHICLE_IDS.map((id) => pick(id).getAttribute('aria-pressed'))).toEqual(
      VEHICLE_IDS.map((id) => String(id === 'dart')),
    );
    expect(card('dart').classList.contains('vol-card--selected')).toBe(true);
    expect(card('striker').classList.contains('vol-card--selected')).toBe(false);
    expect(pick('dart').textContent).toBe(i18next.t('voltest:garage.selected'));
    expect(pick('striker').textContent).toBe(i18next.t('voltest:garage.select'));
    expect(card('bulwark').textContent).toContain(
      i18next.t('voltest:garage.vehicles.bulwark.name'),
    );
    // Araç açıklama metni yoktur; kartta ad, sınıf rozeti ve ölçüler kalır.
    expect(card('bulwark').querySelector('.vol-card__description')!.textContent).toBe('');
    expect(card('bulwark').textContent).toContain(
      i18next.t('voltest:garage.vehicles.bulwark.class'),
    );
  });

  it('ölçü çubukları katalog oranını taşır', () => {
    const { card } = mount();
    for (const id of VEHICLE_IDS) {
      const bars = [...card(id).querySelectorAll<HTMLElement>('.vol-bar[data-stat]')].map((bar) =>
        Number(bar.getAttribute('aria-valuenow')),
      );
      const stats = vehicleStats(id);
      expect(bars).toEqual(
        [stats.durability, stats.speed, stats.firepower].map((ratio) => Math.round(ratio * 100)),
      );
    }
  });

  it('seç düğmesi aracı seçer ve bildirir; tek kart seçili kalır', () => {
    const { card, pick, picked } = mount();
    pick('arachnid').click();
    expect(picked).toEqual(['arachnid']);
    expect(pick('arachnid').getAttribute('aria-pressed')).toBe('true');
    expect(pick('striker').getAttribute('aria-pressed')).toBe('false');
    expect(card('arachnid').classList.contains('vol-card--selected')).toBe(true);
    expect(pick('arachnid').textContent).toBe(i18next.t('voltest:garage.selected'));
    expect(pick('striker').textContent).toBe(i18next.t('voltest:garage.select'));
  });

  it('kartın gövdesine tıklamak araç seçmez: eylem her zaman açık düğmedir', () => {
    const { card, picked } = mount();
    card('bulwark').click();
    expect(picked).toEqual([]);
  });

  it('ad ve cephe formu araç kartlarının üstündedir; eylemler altta, vitrin bölgesi yoktur', () => {
    const { panel } = mount();
    const layout = panel.element.querySelector('.vt-garage__layout')!;
    expect([...layout.children].map((child) => child.className)).toEqual([
      'vt-garage__join',
      'vt-garage__vehicles',
    ]);
    expect(panel.element.querySelector('.vt-garage__stage')).toBeNull();
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
    const { panel, find, pick, joined } = mount();
    panel.setBusy(true);
    expect(find('garage-status').textContent).toBe(i18next.t('voltest:online.connecting'));
    expect(find<HTMLButtonElement>('garage-join').disabled).toBe(true);
    expect(find<HTMLButtonElement>('garage-practice').disabled).toBe(true);
    expect(find<HTMLInputElement>('garage-name').disabled).toBe(true);
    expect(pick('dart').disabled).toBe(true);
    // Geri dönüş bağlanırken de açık kalır: vazgeçmek mümkündür.
    expect(find<HTMLButtonElement>('garage-back').disabled).toBe(false);
    find('garage-join').click();
    expect(joined).toHaveLength(0);

    panel.showError('voltest:online.error.unreachable');
    expect(find('garage-status').textContent).toBe(i18next.t('voltest:online.error.unreachable'));
    expect(find('garage-status').dataset.tone).toBe('danger');
    expect(find<HTMLButtonElement>('garage-join').disabled).toBe(false);
    expect(pick('dart').disabled).toBe(false);
  });

  it('alıştırma ve geri niyetlerini bildirir', () => {
    const { find, onPractice, onBack } = mount();
    find('garage-practice').click();
    find('garage-back').click();
    expect(onPractice).toHaveBeenCalledTimes(1);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('dil değişince araç adları, durum ve cephe seçimi korunarak yenilenir', async () => {
    const { panel, find, factionButton } = mount('striker', FACTION_AUTO);
    factionButton(i18next.t('voltest:war.faction.blue')).click();
    panel.setBusy(true);
    await i18next.changeLanguage('en');
    expect(find('garage-join').textContent).toBe('Join the war');
    expect(find('garage-vehicle-arachnid').textContent).toContain('WALKER');
    expect(find('garage-vehicle-arachnid').textContent).toContain('WALKER');
    expect(find('garage-status').textContent).toBe('Connecting…');
    expect(factionButton('Blue').getAttribute('aria-checked')).toBe('true');
  });
});
