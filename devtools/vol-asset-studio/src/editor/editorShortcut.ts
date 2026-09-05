export type EditorShortcut =
  | 'save'
  | 'undo'
  | 'redo'
  | 'pencil'
  | 'eraser'
  | 'fill'
  | 'eyedropper'
  | 'fit'
  | 'actualSize'
  | 'brushDown'
  | 'brushUp'
  | 'cancel';

const SHORTCUTS = new Map<string, EditorShortcut>([
  ['b', 'pencil'],
  ['e', 'eraser'],
  ['g', 'fill'],
  ['i', 'eyedropper'],
  ['f', 'fit'],
  ['1', 'actualSize'],
  ['[', 'brushDown'],
  [']', 'brushUp'],
  ['escape', 'cancel'],
]);

/** Form alanındaki yazım editör komutuna dönüşmez. */
export function editorShortcut(event: KeyboardEvent): EditorShortcut | null {
  const target = event.target;
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  )
    return null;
  const key = event.key.toLowerCase();
  if (event.ctrlKey || event.metaKey) {
    if (key === 's') return 'save';
    if (key === 'z') return event.shiftKey ? 'redo' : 'undo';
  }
  return SHORTCUTS.get(key) ?? null;
}
