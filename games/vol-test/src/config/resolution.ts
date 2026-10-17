/**
 * Çözünürlük tercihleri. İki ayrı kavram vardır:
 * - **Çizim ölçeği** (`RenderScaleChoice`): canvas'ın piksel yoğunluğu çarpanı. Dünya ve ekran boyutu AYNI kalır,
 *   yalnız netlik ve GPU yükü değişir (CORE `renderScale`). Her platformda geçerlidir. `auto` uyarlanır ölçektir
 *   (yavaş kareler ölçeği kısar), sayı ise sabit ölçektir.
 * - **Pencere boyutu** (`WindowSizeChoice`): yalnız native masaüstü penceresinde, pencereli kipte içerik boyutudur.
 *
 * Ölçek 1'in üstüne çıkmaz (süper-örnekleme CORE'da kapalıdır) ve en düşük basamak 0,5'tir: daha altı kenarları
 * belirgin kalınlaştırır. Piksel tavanı (`GAME.maxPixels`) ve DPR tavanı (`GAME.maxDpr`) bunların üstünde sert sınırdır.
 */
export const RESOLUTION_AUTO = 'auto';

/** Sabit çizim ölçeği basamakları (çizilen piksel payı ölçeğin karesidir: 0,7 → ~%49). */
export const RENDER_SCALES = [1, 0.85, 0.7, 0.5] as const;
export type RenderScaleChoice = typeof RESOLUTION_AUTO | (typeof RENDER_SCALES)[number];

export function isRenderScaleChoice(value: unknown): value is RenderScaleChoice {
  return (
    value === RESOLUTION_AUTO || RENDER_SCALES.includes(value as (typeof RENDER_SCALES)[number])
  );
}

/** Pencere boyutu ön ayarları (CSS/mantıksal piksel). Steam Deck'in 1280×800'ü kendi oturumunda tam ekrandır. */
export const WINDOW_SIZES = [
  { width: 1280, height: 720 },
  { width: 1600, height: 900 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
] as const;

export type WindowSizeChoice = typeof RESOLUTION_AUTO | `${number}x${number}`;

const SIZE_IDS: readonly WindowSizeChoice[] = WINDOW_SIZES.map(
  ({ width, height }) => `${width}x${height}` as const,
);

export function isWindowSizeChoice(value: unknown): value is WindowSizeChoice {
  return value === RESOLUTION_AUTO || SIZE_IDS.includes(value as WindowSizeChoice);
}

/** Seçimin piksel boyutu; `auto` pencerenin boyutuna dokunulmaz demektir (`undefined`). */
export function windowSizeOf(
  choice: WindowSizeChoice,
): { readonly width: number; readonly height: number } | undefined {
  const index = SIZE_IDS.indexOf(choice);
  return index < 0 ? undefined : WINDOW_SIZES[index];
}

/** Ekrana sığan ön ayarlar (ekranı aşan pencere kenarları dışarıda bırakırdı); `auto` her zaman vardır. */
export function fittingWindowSizes(screen: {
  readonly width: number;
  readonly height: number;
}): WindowSizeChoice[] {
  return [
    RESOLUTION_AUTO,
    ...SIZE_IDS.filter((id) => {
      const size = windowSizeOf(id);
      return size !== undefined && size.width <= screen.width && size.height <= screen.height;
    }),
  ];
}
