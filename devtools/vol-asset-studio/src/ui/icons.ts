import { Icon, type IconName as CoreIconName } from '@volstudio/core/ui';

export type IconName = CoreIconName;

/** Asset Studio ikonlarını tek birinci taraf CORE kaydından üretir. */
export function icon(name: IconName, className = ''): SVGSVGElement {
  const instance = new Icon({ name });
  instance.element.classList.add('asset-icon');
  if (className) instance.element.classList.add(className);
  return instance.element;
}
