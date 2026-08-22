import type { SpriteDoc } from '@volstudio/core/visual';

/**
 * Belge içinde bir konum — `['layers', 0, 'source', 'a']`.
 *
 * Yapısal bir yol, dizgi yoldan iki nedenle üstün: ayrıştırma gerekmez ve
 * sayı ile ad karışmaz (`indices[0]` ile `indices.0` aynı şey değildir).
 * Doğrulayıcının ürettiği DİZGİ yollar (`layers[0].source.freq`) tek yönlü
 * olarak buna çevrilir; sorun panelinden seçime geçişin yolu budur (§8.10).
 */
export type DocPath = readonly (string | number)[];

function isIndexable(value: unknown): value is Record<string | number, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Yoldaki değeri okur; yol kırıksa `undefined`. */
export function getAt(root: unknown, path: DocPath): unknown {
  let current: unknown = root;
  for (const key of path) {
    if (!isIndexable(current)) return undefined;
    current = current[key];
  }
  return current;
}

/**
 * Yoldaki değeri DEĞİŞTİRMEDEN yeni bir kök döndürür.
 *
 * Yol üzerindeki her düğüm kopyalanır, kardeşler PAYLAŞILIR. Geri alma yığını
 * (§8.3) tam anlık görüntü tuttuğu için bu yapısal paylaşım belleği de
 * ucuzlatır: elli adımlık geçmiş elli kopya değil, elli ince zincir demektir.
 */
export function setAt<T>(root: T, path: DocPath, value: unknown): T {
  if (path.length === 0) return value as T;
  const [key, ...rest] = path;

  if (Array.isArray(root)) {
    const index = typeof key === 'number' ? key : Number(key);
    const copy = [...root];
    copy[index] = setAt(copy[index] as unknown, rest, value);
    return copy as unknown as T;
  }

  if (isIndexable(root)) {
    return { ...root, [key]: setAt(root[key], rest, value) } as T;
  }

  throw new Error(`Yol çözümlenemedi: ${path.join('.')}`);
}

/** Yoldaki anahtarı TAMAMEN kaldırır — opsiyonel parametre kapatma (§8.6). */
export function removeAt<T>(root: T, path: DocPath): T {
  if (path.length === 0) throw new Error('Kökün kendisi kaldırılamaz');
  const parentPath = path.slice(0, -1);
  const key = path[path.length - 1];
  const parent = getAt(root, parentPath);

  if (Array.isArray(parent)) {
    const index = typeof key === 'number' ? key : Number(key);
    return setAt(
      root,
      parentPath,
      parent.filter((_, i) => i !== index),
    );
  }
  if (isIndexable(parent)) {
    const copy = { ...parent };
    delete copy[key];
    return setAt(root, parentPath, copy);
  }
  throw new Error(`Yol çözümlenemedi: ${path.join('.')}`);
}

const SEGMENT = /([^[.\]]+)|\[(\d+)\]/g;

/**
 * Doğrulayıcının dizgi yolunu yapısal yola çevirir.
 *
 * `layers[0].source.freq` → `['layers', 0, 'source', 'freq']`. Sayıya
 * benzeyen ADLAR indekse çevrilmez; ayrım köşeli parantezden gelir.
 */
export function parsePath(text: string): DocPath {
  const out: (string | number)[] = [];
  for (const match of text.matchAll(SEGMENT)) {
    if (match[2] !== undefined) out.push(Number(match[2]));
    else out.push(match[1]);
  }
  return out;
}

/** Sorun satırındaki (`yol: mesaj`) yolu ayıklar. */
export function pathFromIssue(issue: string): DocPath {
  const colon = issue.indexOf(':');
  return parsePath(colon < 0 ? issue : issue.slice(0, colon).trim());
}

/** İki yol aynı yeri mi gösteriyor? */
export function samePath(a: DocPath, b: DocPath): boolean {
  return a.length === b.length && a.every((key, i) => key === b[i]);
}

export type LayerField = 'source' | 'mask' | 'height' | 'materialMask';

/** Katmanın bir alanının kökü. */
export function layerFieldPath(layerPath: DocPath, field: LayerField): DocPath {
  return [...layerPath, field];
}

/** Belgedeki katman sayısı — üst yığın. */
export function layerCount(doc: SpriteDoc): number {
  return doc.layers.length;
}
