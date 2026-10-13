import { classifyJoinError, type JoinFailure } from '@volstudio/network/client';
import { modelOf, STRIKER, VEHICLES } from '@/config/vehicles';
import type { Hud } from '@/hud/Hud';
import { LobbyPanel, type LobbyChoice } from '@/hud/LobbyPanel';
import type { MessageKey } from '@/i18n/keys';
import { resolveEndpoint } from '@/network/endpoint';
import { OnlineSession } from '@/network/OnlineSession';
import { OnlineDriver } from './OnlineDriver';
import type { DriverContext } from './WorldDriver';

const ERROR_KEYS = {
  protocol: 'voltest:online.error.protocol',
  code: 'voltest:online.error.code',
  full: 'voltest:online.error.full',
  'not-found': 'voltest:online.error.notFound',
  unreachable: 'voltest:online.error.unreachable',
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

/**
 * Lobiyi kurar (açmaz). Seçim sunucuya bağlanır; oturum kurulunca sahne çevrimiçi sürücüyle yeniden
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
    let session: OnlineSession;
    try {
      session = await OnlineSession.open({
        endpoint: sessionEndpoint(),
        name: choice.name,
        model: modelOf(VEHICLES[services?.settings.get().vehicle ?? STRIKER.id]),
        request: choice.request,
      });
    } catch (error) {
      if (alive && mine === attempt) lobby.showError(lobbyErrorKey(error));
      return;
    }
    if (!alive || mine !== attempt) {
      session.dispose();
      return;
    }
    lobby.close();
    context.restart({
      createDriver: (next) => new OnlineDriver(next, session),
      weather: 'clear',
    });
  }

  return lobby;
}
