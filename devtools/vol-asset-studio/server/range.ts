export interface ByteRange {
  start: number;
  end: number;
  length: number;
}

/** Yalnız tek HTTP byte range kabul eder; çoklu range kasıtlı olarak desteklenmez. */
export function parseByteRange(header: string | undefined, size: number): ByteRange | null {
  if (header === undefined) return null;
  if (!Number.isSafeInteger(size) || size < 0 || !header.startsWith('bytes=')) return null;

  const value = header.slice('bytes='.length).trim();
  if (value.includes(',')) return null;
  const match = /^(\d*)-(\d*)$/.exec(value);
  if (match === null || (match[1] === '' && match[2] === '') || size === 0) return null;

  let start: number;
  let end: number;
  if (match[1] === '') {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === '' ? size - 1 : Number(match[2]);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size) return null;
    end = Math.min(end, size - 1);
  }

  if (start < 0 || end < start) return null;
  return { start, end, length: end - start + 1 };
}
