import './net/installWebSocketShim';
import '@volstudio/core/ui/styles.css';
import { DisposableScope } from '@volstudio/core/lifecycle';
import { createVolGame, i18n, showFatalStartupError, suppressNativeMenus } from '@volstudio/core';
import { App } from './app/App';
import { loadSettings, type KeyValueStore } from './app/connect';
import { host } from './app/host';
import { ForgeScene } from './scenes/ForgeScene';
import { ForgeSession } from './net/session';
import { GAME } from './config/game';
import en from './i18n/en.json';
import tr from './i18n/tr.json';
import './i18n/i18next-augment';
import './style.css';

/** Gizli pencere ya da engelli depolamada erişim hata fırlatır; bu durumda depolamasız çalışılır. */
function browserStorage(): KeyValueStore | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Oyuncu anahtarı hesabın kendisidir: tahmin edilemez olmalı, bu yüzden `Math.random` değil. */
function secureRandom(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
}

export async function boot(): Promise<void> {
  i18n.addResources('tr', 'voltest2', tr);
  i18n.addResources('en', 'voltest2', en);
  await i18n.init();
  const storage = browserStorage();
  const scope = new DisposableScope();
  let game: Awaited<ReturnType<typeof createVolGame>> | undefined;
  try {
    scope.addDestroyable(
      new App(document.getElementById('hud')!, {
        host,
        settings: loadSettings(window.location.search, storage, secureRandom),
        storage,
        connect: (options) => ForgeSession.connect(options),
      }),
    );
    game = await createVolGame({
      parent: 'game',
      backgroundColor: GAME.backgroundColor,
      strategy: 'resize',
      maxDpr: GAME.maxDpr,
      scenes: [ForgeScene],
    });
    scope.addSubscription(suppressNativeMenus(document));
    game.events.once('destroy', () => scope.dispose());
  } catch (error) {
    try {
      game?.destroy(true);
    } finally {
      scope.dispose();
    }
    throw error;
  }
}

void boot().catch((error: unknown) => showFatalStartupError({ title: tr.app.fatal, error }));
