const activeTargets = new Set<HTMLElement>();
const intentEvents = new WeakSet<Event>();
let activating = false;

export function isActivationIntent(event: Event): boolean {
  return intentEvents.has(event);
}

export function isFocusActivating(element: HTMLElement): boolean {
  return activeTargets.has(element);
}

export function activateWithIntent(element: HTMLElement): void {
  if (activating) return;
  const event = new Event('vol:focusactivate', { bubbles: true, cancelable: true });
  intentEvents.add(event);
  activeTargets.add(element);
  activating = true;
  try {
    if (element.dispatchEvent(event)) element.click();
  } finally {
    activeTargets.delete(element);
    intentEvents.delete(event);
    activating = false;
  }
}
