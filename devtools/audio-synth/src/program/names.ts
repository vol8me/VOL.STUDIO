import { AudioParamError } from '../guard/errors';

/** Programdaki adların (katman, bus, gesture, sample…) ortak kalıbı — yaprak modül. */
const NAME = /^[A-Za-z][A-Za-z0-9_-]{0,47}$/;

export function checkName(value: unknown, path: string): string {
  if (typeof value !== 'string' || !NAME.test(value)) {
    throw new AudioParamError(path, 'type', `ad ${NAME.source} kalıbına uymalı`, value);
  }
  return value;
}
