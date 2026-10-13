import type { ToolId } from '@/config/game';
import { toolForKey } from './tools';

export type HotkeyAction =
  | { readonly type: 'tool'; readonly tool: ToolId }
  | { readonly type: 'rotate' }
  | { readonly type: 'clear' };

/** Tuş → eylem: `1`-`6` araç, `r` döndür, `Escape` seçimi bırak. Değiştirici tuşlu basışlar tarayıcıya aittir. */
export function actionForKey(event: {
  readonly key: string;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly altKey?: boolean;
}): HotkeyAction | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  if (event.key === 'Escape') return { type: 'clear' };
  if (event.key === 'r' || event.key === 'R') return { type: 'rotate' };
  const tool = toolForKey(event.key);
  return tool === null ? null : { type: 'tool', tool };
}

/** Yazı alanındaki basış oyun kısayolu değildir. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable === true
  );
}
