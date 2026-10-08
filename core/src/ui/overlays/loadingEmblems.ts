/**
 * Yükleme ekranının SÜS göstergeleri. Gerçek ilerleme plakadaki segmentli çubuktadır; bunlar yalnız
 * "çalışıyor" hissi verir. Hepsi `transform`/`opacity` ile hareket eder (bileşik katman, yeniden boyama yok);
 * parlama (`drop-shadow`), maske ve ilerlemeye bağlı `conic-gradient` yoktur.
 */
export type LoadingEmblemType =
  'orbital-rings' | 'energy-core' | 'particle-orbit' | 'hexagon-pulse';

function div(className: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = className;
  return el;
}

const BUILDERS: Record<LoadingEmblemType, (host: HTMLElement) => void> = {
  'orbital-rings': (host) => {
    host.classList.add('vol-loading__indicator--orbital');
    host.append(
      div('vol-loading__ring vol-loading__ring--outer'),
      div('vol-loading__ring vol-loading__ring--mid'),
      div('vol-loading__ring vol-loading__ring--inner'),
    );
  },
  'energy-core': (host) => {
    host.classList.add('vol-loading__indicator--energy');
    host.append(
      div('vol-loading__arc vol-loading__arc--1'),
      div('vol-loading__arc vol-loading__arc--2'),
      div('vol-loading__arc vol-loading__arc--3'),
      div('vol-loading__core'),
    );
  },
  'particle-orbit': (host) => {
    host.classList.add('vol-loading__indicator--particle');
    const orbit = div('vol-loading__particle-orbit');
    const particleCount = 6;
    for (let i = 0; i < particleCount; i++) {
      const particle = div('vol-loading__particle');
      particle.style.setProperty('--vol-loading-particle-angle', `${(360 / particleCount) * i}deg`);
      particle.style.setProperty('--vol-loading-particle-delay', `${(1.5 / particleCount) * i}s`);
      orbit.appendChild(particle);
    }
    host.append(orbit, div('vol-loading__particle-center'));
  },
  'hexagon-pulse': (host) => {
    host.classList.add('vol-loading__indicator--hexagon');
    host.append(div('vol-loading__hexagon'), div('vol-loading__hexagon-inner'));
  },
};

/** `host` içine süs göstergesini kurar. */
export function buildLoadingEmblem(type: LoadingEmblemType, host: HTMLElement): void {
  BUILDERS[type](host);
}
