import { vi } from 'vitest';
import { i18n, i18next } from '@volstudio/core/i18n';
import en from '../src/i18n/en.json';
import tr from '../src/i18n/tr.json';

i18n.addResources('tr', 'voltest', tr);
i18n.addResources('en', 'voltest', en);
await i18n.init();
await i18next.changeLanguage('tr');

/**
 * jsdom 2B canvas uygulamaz. Karo seti, minimap ve CORE HUD bileşenleri
 * çizim çağrısı yapar; kayıt tutan bir sahte bağlam çağrıları doğrulanabilir kılar.
 */
export function createContextStub(): CanvasRenderingContext2D {
  const calls: string[] = [];
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(target, key: string) {
      if (key === '__calls') return calls;
      if (key in target) return target[key];
      return (...args: unknown[]) => {
        calls.push(key);
        if (key === 'createImageData') {
          const [width, height] = args as [number, number];
          return { data: new Uint8ClampedArray(width * height * 4), width, height };
        }
        if (key === 'getImageData') return { data: new Uint8ClampedArray(4) };
        if (key === 'measureText') return { width: 0 };
        if (key === 'createRadialGradient' || key === 'createLinearGradient') {
          return { addColorStop: () => undefined };
        }
        return undefined;
      };
    },
    set(target, key: string, value) {
      target[key] = value;
      return true;
    },
  };
  return new Proxy({}, handler) as unknown as CanvasRenderingContext2D;
}

vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
  this: HTMLCanvasElement,
) {
  const self = this as HTMLCanvasElement & { __context?: CanvasRenderingContext2D };
  self.__context ??= createContextStub();
  return self.__context;
} as unknown as HTMLCanvasElement['getContext']);

/** jsdom işaretçi yakalamayı uygulamaz; CORE `HoldButton` onu çağırır. */
for (const method of ['setPointerCapture', 'releasePointerCapture'] as const) {
  if (!(method in HTMLElement.prototype)) {
    Object.defineProperty(HTMLElement.prototype, method, { value: () => undefined });
  }
}
if (!('hasPointerCapture' in HTMLElement.prototype)) {
  Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', { value: () => false });
}
