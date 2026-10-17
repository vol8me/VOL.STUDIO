import type { DisposableScope } from '@volstudio/core/lifecycle';
import { uiIntentBusFor } from '@volstudio/core/ui';
import { i18next } from '@volstudio/core/i18n';

/** Sondada gösterilen son niyet sayısı (kart genişliğini aşmasın). */
const PROBE_MAX = 6;

/**
 * Niyet sondası: kartın içinde ÜRETİLEN her anlamsal niyet ("tür:kaynak") sırayla görünür. Tek eylemin tek niyet ürettiğini
 * (çift ses/titreşim olmadığını) gözle ve e2e'de `data-log` ile doğrulamak içindir; ses/titreşim kararı yine kök veriyolundadır.
 *
 * Veriyolu kök elemanına bağlıdır ve kart kuruluşunda henüz DOM'da değildir: abonelik ilk etkileşimde (odak, basış, tuş)
 * kurulur; bir niyet bu olaylardan önce oluşamaz.
 */
export function intentProbe(owner: HTMLElement, disposables: DisposableScope): HTMLElement {
  const element = document.createElement('div');
  element.className = 'vol-showcase-intent-probe';
  element.dataset.probe = 'intents';
  element.dataset.log = '';
  element.textContent = i18next.t('volui:hud.probe.none');

  const log: string[] = [];
  let attached = false;
  const attach = (): void => {
    if (attached) return;
    const root = owner.closest<HTMLElement>('.vol-showcase-root');
    if (!root) return;
    attached = true;
    const handle = uiIntentBusFor(root);
    const subscription = handle.bus.subscribe({
      onIntent: (intent) => {
        if (!owner.contains(intent.target)) return;
        log.push(`${intent.kind}:${intent.origin}`);
        if (log.length > PROBE_MAX) log.shift();
        element.dataset.log = log.join(' ');
        element.textContent = i18next.t('volui:hud.probe.list', { list: log.join(' · ') });
      },
    });
    disposables.add({
      dispose: () => {
        subscription.dispose();
        handle.release();
      },
    });
  };
  for (const type of ['pointerdown', 'keydown', 'focusin']) {
    disposables.addListener(owner, type, attach, { capture: true });
  }
  return element;
}
