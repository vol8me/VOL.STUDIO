/**
 * Test belgelerini yol üzerinden düzenleme yardımcıları. Geçersiz belge
 * üretmek testlerin işidir; tip sistemi bunu engellemesin diye düzenleme
 * `unknown` üzerinden yapılır (`any` kullanılmaz).
 */
export type Path = readonly (string | number)[];
export type Edit = readonly [Path, unknown];

type Container = Record<string | number, unknown>;

function container(value: unknown, path: Path): Container {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError(`yol nesneye inmiyor: ${path.join('.')}`);
  }
  return value as Container;
}

export function getAt(doc: unknown, path: Path): unknown {
  let cursor = doc;
  for (const key of path) cursor = container(cursor, path)[key];
  return cursor;
}

/** `value === undefined` alanı siler. */
export function setAt(doc: unknown, path: Path, value: unknown): void {
  const parent = container(getAt(doc, path.slice(0, -1)), path);
  const key = path[path.length - 1];
  if (value === undefined) delete parent[key];
  else parent[key] = value;
}

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Belgenin kopyasına düzenlemeleri sırayla uygular. */
export function edited(doc: unknown, ...edits: readonly Edit[]): unknown {
  const copy = clone(doc);
  for (const [path, value] of edits) setAt(copy, path, value);
  return copy;
}
