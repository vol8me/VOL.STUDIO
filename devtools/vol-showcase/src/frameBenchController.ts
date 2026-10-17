import { i18n, i18next } from '@volstudio/core/i18n';
import {
  benchSlot,
  readBenchEnvironment,
  bisectTab,
  styleBisectTab,
  runFrameBench,
  type BenchEnvironment,
  type BisectResult,
  type StyleBisectResult,
  type BenchHooks,
  type BenchResult,
} from './frameBench';

/**
 * Kare ölçerin kabuk tarafı: `Shift+B` (kol/klavye, Deck'te URL yazmadan) ya da `?bench` (otomasyon) ölçümü
 * başlatır; ilerleme köşede küçük bir şeritte, sonuç Esc ile kapanan bir tabloda görünür ve `window.__volFrameBench`e
 * yazılır. Şerit ölçümü bozmamak için küçüktür (sayfanın boyama maliyetini değiştirmez).
 */
export class FrameBenchController {
  private chip: HTMLDivElement | null = null;
  private panel: HTMLDivElement | null = null;
  private running = false;
  private readonly onKeydown = (event: KeyboardEvent): void => {
    if (event.shiftKey && event.key.toLowerCase() === 'b' && !isEditing(event.target)) {
      event.preventDefault();
      void this.start();
    } else if (event.key === 'Escape' && this.panel) {
      this.closePanel();
    }
  };
  private autoStart: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly hooks: () => BenchHooks) {
    window.addEventListener('keydown', this.onKeydown);
    if (new URLSearchParams(window.location.search).has('bench')) {
      this.autoStart = setTimeout(() => void this.start(), 1500);
    }
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.closePanel();
    const slot = benchSlot();
    slot.running = true;
    slot.done = false;
    slot.results = [];
    slot.bisect = [];
    slot.styleBisect = [];
    this.showChip();
    const results = await runFrameBench(this.hooks(), {
      onProgress: (tab, index, total) =>
        this.updateChip(
          i18next.t('volui:bench.running', {
            tab: i18n.tDynamic(`volui:tabs.${tab}`),
            index: index + 1,
            total,
          }),
        ),
    });
    // Yavaş sekmeler (< 50 FPS, en çok 3): hangi kartın pahalı olduğu kart kart gizlenerek ölçülür.
    const bisect: BisectResult[] = [];
    const styleBisect: StyleBisectResult[] = [];
    for (const slow of results.filter((r) => r.fps < 50).slice(0, 3)) {
      this.updateChip(
        i18next.t('volui:bench.bisecting', { tab: i18n.tDynamic(`volui:tabs.${slow.tab}`) }),
      );
      bisect.push(await bisectTab(this.hooks(), slow.tab));
      styleBisect.push(await styleBisectTab(this.hooks(), slow.tab));
    }
    const environment = readBenchEnvironment();
    slot.results = results;
    slot.bisect = bisect;
    slot.styleBisect = styleBisect;
    slot.environment = environment;
    slot.running = false;
    slot.done = true;
    this.running = false;
    this.hideChip();
    this.showPanel(results, environment, bisect, styleBisect);
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeydown);
    if (this.autoStart) clearTimeout(this.autoStart);
    this.hideChip();
    this.closePanel();
  }

  private showChip(): void {
    this.chip = document.createElement('div');
    this.chip.className = 'vol-showcase-bench-chip';
    this.chip.setAttribute('role', 'status');
    document.body.appendChild(this.chip);
  }

  private updateChip(text: string): void {
    if (this.chip && this.chip.textContent !== text) this.chip.textContent = text;
  }

  private hideChip(): void {
    this.chip?.remove();
    this.chip = null;
  }

  private closePanel(): void {
    this.panel?.remove();
    this.panel = null;
  }

  private showPanel(
    results: readonly BenchResult[],
    environment: BenchEnvironment,
    bisect: readonly BisectResult[],
    styleBisect: readonly StyleBisectResult[],
  ): void {
    const panel = document.createElement('div');
    panel.className = 'vol-showcase-bench';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', i18next.t('volui:bench.title'));

    const title = document.createElement('h2');
    title.textContent = i18next.t('volui:bench.title');
    panel.appendChild(title);

    const fpsValues = results.map((r) => r.fps).sort((a, b) => a - b);
    const weakest = results.reduce((worst, r) => (r.fps < worst.fps ? r : worst), results[0]);
    const summary = document.createElement('p');
    summary.textContent = i18next.t('volui:bench.summary', {
      fps: (fpsValues[Math.floor(fpsValues.length / 2)] ?? 0).toFixed(1),
      tab: i18n.tDynamic(`volui:tabs.${weakest.tab}`),
      weak: weakest.fps.toFixed(1),
    });
    panel.appendChild(summary);

    const table = document.createElement('table');
    const head = table.createTHead().insertRow();
    const columns = [
      i18next.t('volui:bench.tab'),
      i18next.t('volui:bench.fps'),
      i18next.t('volui:bench.p50'),
      i18next.t('volui:bench.p95'),
      i18next.t('volui:bench.worst'),
      i18next.t('volui:bench.slow'),
    ];
    for (const label of columns) {
      const cell = document.createElement('th');
      cell.scope = 'col';
      cell.textContent = label;
      head.appendChild(cell);
    }
    const body = table.createTBody();
    for (const r of results) {
      const row = body.insertRow();
      row.insertCell().textContent = i18n.tDynamic(`volui:tabs.${r.tab}`);
      row.insertCell().textContent = r.fps.toFixed(1);
      row.insertCell().textContent = r.p50Ms.toFixed(1);
      row.insertCell().textContent = r.p95Ms.toFixed(1);
      row.insertCell().textContent = r.worstMs.toFixed(0);
      row.insertCell().textContent = `${Math.round(r.slowShare * 100)}%`;
    }
    panel.appendChild(table);

    for (const entry of bisect) {
      const heading = document.createElement('h3');
      heading.textContent = i18next.t('volui:bench.bisectTitle', {
        tab: i18n.tDynamic(`volui:tabs.${entry.tab}`),
        fps: entry.baselineFps.toFixed(1),
      });
      panel.appendChild(heading);
      const list = document.createElement('ul');
      for (const row of entry.rows) {
        const item = document.createElement('li');
        item.textContent = i18next.t('volui:bench.bisectRow', {
          title: row.title,
          gain: row.gain.toFixed(1),
          fps: row.fps.toFixed(1),
        });
        list.appendChild(item);
      }
      panel.appendChild(list);
    }

    for (const entry of styleBisect) {
      const heading = document.createElement('h3');
      heading.textContent = i18next.t('volui:bench.styleTitle', {
        tab: i18n.tDynamic(`volui:tabs.${entry.tab}`),
        fps: entry.baselineFps.toFixed(1),
      });
      panel.appendChild(heading);
      const list = document.createElement('ul');
      for (const row of entry.rows) {
        const item = document.createElement('li');
        item.textContent = i18next.t('volui:bench.styleRow', {
          id: row.id,
          gain: row.gain.toFixed(1),
          fps: row.fps.toFixed(1),
        });
        list.appendChild(item);
      }
      panel.appendChild(list);
    }

    const env = document.createElement('p');
    env.className = 'vol-showcase-bench__env';
    env.textContent = i18next.t('volui:bench.env', {
      viewport: environment.viewport,
      dpr: environment.devicePixelRatio,
      cores: environment.cores,
      agent: environment.userAgent,
    });
    panel.appendChild(env);

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'vol-button';
    close.textContent = i18next.t('volui:bench.close');
    close.addEventListener('click', () => this.closePanel());
    panel.appendChild(close);

    document.body.appendChild(panel);
    this.panel = panel;
    close.focus();
  }
}

function isEditing(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
  );
}
