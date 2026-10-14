import type { GameServices } from '@/app/GameServices';
import { VEHICLES } from '@/config/vehicles';
import { WAR } from '@/config/war';
import { GaragePanel, type GarageChoice } from '@/menu/GaragePanel';
import { ScreenScene, type ScreenPanel } from './ScreenScene';
import type { WarConnection } from './world/online';

/**
 * Garaj: araç, cephe ve ad seçilir; savaşa katılınca sunucuya bağlanılır ve dünya sahnesi çevrimiçi
 * sürücüyle açılır. Çevrimiçi kod ilk katılımda tembel yüklenir. Bağlanırken geri dönülürse ya da
 * ekran kapanırsa geç gelen oturum bırakılır (odada hayalet kalmaz).
 */
export class GarageScene extends ScreenScene {
  private attempt = 0;

  constructor(services: GameServices) {
    super('Garage', services);
  }

  protected override createScreen(): ScreenPanel {
    const { settings } = this.services;
    const preferences = settings.get();
    this.attempt++;
    this.scope.addSubscription(() => this.attempt++);
    const panel: GaragePanel = new GaragePanel({
      vehicle: preferences.vehicle,
      faction: preferences.faction,
      name: preferences.playerName,
      onVehicle: (vehicle) => {
        void settings.update({ vehicle });
        this.setShowcase(VEHICLES[vehicle]);
      },
      onFaction: (faction) => void settings.update({ faction }),
      onName: (playerName) => void settings.update({ playerName }),
      onJoin: (choice) => void this.join(panel, choice),
      onPractice: () => this.goto('World'),
      onBack: () => this.leave(),
    });
    return panel;
  }

  protected override onBack(): boolean {
    this.leave();
    return true;
  }

  private leave(): void {
    this.attempt++;
    this.goto('Menu');
  }

  private async join(panel: GaragePanel, choice: GarageChoice): Promise<void> {
    const mine = ++this.attempt;
    panel.setBusy(true);
    const online = await import('./world/online').catch(() => undefined);
    if (!online) {
      if (mine === this.attempt) panel.showError('voltest:online.error.failed');
      return;
    }
    let connection: WarConnection;
    try {
      connection = await online.connectWar(this.services, {
        name: choice.name,
        faction: choice.faction >= 0 && choice.faction < WAR.factions ? choice.faction : undefined,
      });
    } catch (error) {
      if (mine === this.attempt) panel.showError(online.lobbyErrorKey(error));
      return;
    }
    if (mine !== this.attempt) {
      connection.abandon();
      return;
    }
    this.goto('World', connection.start);
  }
}
