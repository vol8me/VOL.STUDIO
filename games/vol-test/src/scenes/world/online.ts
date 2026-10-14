import { classifyJoinError, type JoinFailure } from '@volstudio/network/client';
import { modelOf, STRIKER, VEHICLES } from '@/config/vehicles';
import type { Hud } from '@/hud/Hud';
import { LobbyPanel, type LobbyChoice } from '@/hud/LobbyPanel';
import type { MessageKey } from '@/i18n/keys';
import { resolveEndpoint } from '@/network/endpoint';
import { OnlineSession } from '@/network/OnlineSession';
import { OnlineDriver } from './OnlineDriver';
import type { GameServices } from '@/app/GameServices';
import type { DriverContext, WorldStartData } from './WorldDriver';

const ERROR_KEYS = {
  protocol: 'voltest:online.error.protocol',
  code: 'voltest:online.error.failed',
  full: 'voltest:online.error.full',
  'not-found': 'voltest:online.error.notFound',
  unreachable: 'voltest:online.error.unreachable',
  busy: 'voltest:online.error.busy',
  failed: 'voltest:online.error.failed',
} as const satisfies Record<JoinFailure, MessageKey>;

/** Çevrimiçi kod ayrı parçada yaşar; çevrimdışı sahne yalnız bu girişi tembel yükler. */
export function lobbyErrorKey(error: unknown): MessageKey {
  return ERROR_KEYS[classifyJoinError(error)];
}

/** Bu oturumun sunucu adresi: `?server=`, derleme zamanı değeri ya da geliştirme adresi. */
export function sessionEndpoint(): string {
  return resolveEndpoint(
    location.search,
    import.meta.env.VITE_VOLTEST_SERVER as string | undefined,
  );
}

/** Kurulmuş bir savaş oturumu: sahne başlatma verisi ve sahne başlamadan vazgeçilirse bırakma. */
export interface WarConnection {
  readonly start: WorldStartData;
  /** Sahne bu oturumu devralmadan vazgeçildi; sunucuda hayalet kalmaması için bağlantıyı bırakır. */
  abandon(): void;
}

/**
 * Savaş dünyasına bağlanır. Menüdeki garaj ve oyun içi katılım paneli aynı yolu kullanır: seçilen araç
 * tercihlerden, ad ve cephe çağıranın seçiminden gelir. Hata `JoinError` olarak fırlar
 * (`lobbyErrorKey` ile iletiye çevrilir).
 */
export async function connectWar(
  services: GameServices | undefined,
  choice: LobbyChoice,
): Promise<WarConnection> {
  const session = await OnlineSession.open({
    endpoint: sessionEndpoint(),
    name: choice.name,
    model: modelOf(VEHICLES[services?.settings.get().vehicle ?? STRIKER.id]),
    faction: choice.faction,
  });
  return {
    start: { createDriver: (next) => new OnlineDriver(next, session), weather: 'clear' },
    abandon: () => session.dispose(),
  };
}

/**
 * Katılım panelini kurar (açmaz). Seçim sunucuya bağlanır; oturum kurulunca sahne çevrimiçi sürücüyle yeniden
 * başlar. Vazgeçilirse ya da sahne kapanırsa geç gelen oturum bırakılır (odada hayalet bırakmaz).
 */
export function createLobby(hud: Hud, context: DriverContext): LobbyPanel {
  const { scope, services } = context;
  let alive = true;
  let attempt = 0;
  const lobby = new LobbyPanel({
    name: services?.settings.get().playerName ?? '',
    onName: (playerName) => void services?.settings.update({ playerName }),
    onCancel: () => {
      attempt++;
      lobby.setBusy(false);
    },
    onSubmit: (choice: LobbyChoice) => void connect(choice),
  });
  const unmount = hud.mountOverlay(lobby.element);
  scope.addSubscription(() => {
    alive = false;
    unmount();
    lobby.destroy();
  });

  async function connect(choice: LobbyChoice): Promise<void> {
    const mine = ++attempt;
    lobby.setBusy(true);
    let connection: WarConnection;
    try {
      connection = await connectWar(services, choice);
    } catch (error) {
      if (alive && mine === attempt) lobby.showError(lobbyErrorKey(error));
      return;
    }
    if (!alive || mine !== attempt) {
      connection.abandon();
      return;
    }
    lobby.close();
    context.restart(connection.start);
  }

  return lobby;
}
