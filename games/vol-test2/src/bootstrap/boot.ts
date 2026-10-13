import { DisposableScope } from '@volstudio/core/lifecycle';
import { createVolGame, i18n, suppressNativeMenus } from '@volstudio/core';
import { App } from '@/app/App';
import { loadSettings, type KeyValueStore } from '@/app/connect';
import { host } from '@/app/host';
import { GAME } from '@/config/game';
import en from '@/i18n/en.json';
import tr from '@/i18n/tr.json';
import { FactorySession } from '@/net/session';
import { FactoryScene } from '@/scenes/FactoryScene';
import { LAB_MODES, parseBootMode } from './mode';

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

/**
 * Açılış. Kaynaklar tek `DisposableScope`ta toplanır; kurulum herhangi bir adımda düşerse hepsi geri
 * alınır. Laboratuvar yalnız `?lab=` kipinde ve tembel yüklenir: oyuncu paketinde yoktur.
 */
export async function boot(search: string = window.location.search): Promise<void> {
  const mode = parseBootMode(search);
  if (mode.kind === 'invalid')
    throw new Error(`Bilinmeyen lab kipi: "${mode.value}" (geçerli: ${LAB_MODES.join(', ')})`);

  i18n.addResources('tr', 'voltest2', tr);
  i18n.addResources('en', 'voltest2', en);
  await i18n.init();
  const storage = browserStorage();
  const scope = new DisposableScope();
  let game: Awaited<ReturnType<typeof createVolGame>> | undefined;
  try {
    // Laboratuvar oyundan önce kurulur: açılış hataları günlüğe düşer ve oyun kendi teşhis örneğini alır.
    const kit =
      mode.kind === 'lab' ? (await import('@/lab/install')).createLabKit(mode.lab) : undefined;
    if (kit) scope.addSubscription(() => kit.dispose());
    // `run` kipi bir yük sunucusudur: bağlantı kartı ve oyuncu arayüzü yoktur. `observe` canlı oyundur.
    if (mode.kind === 'play' || mode.lab === 'observe') {
      scope.addDestroyable(
        new App(document.getElementById('hud')!, {
          host,
          settings: loadSettings(window.location.search, storage, secureRandom),
          storage,
          connect: (options) => FactorySession.connect(options),
        }),
      );
    }
    const runMode = mode.kind === 'lab' && mode.lab === 'run';
    game = await createVolGame({
      parent: 'game',
      backgroundColor: GAME.backgroundColor,
      strategy: 'resize',
      maxDpr: GAME.maxDpr,
      scenes: runMode && kit ? [...kit.scenes, FactoryScene] : [FactoryScene],
      // Ölçüm koşusu WebGL ister: sessiz canvas geri düşüşü bütün sayıları anlamsız yapardı.
      ...(runMode ? { renderer: 'webgl' as const } : {}),
      ...(kit ? { diagnostics: kit.diagnostics } : {}),
    });
    if (kit) {
      const handle = kit.attach(game, host);
      scope.addSubscription(() => handle.destroy());
    }
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
