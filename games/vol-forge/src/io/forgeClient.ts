import type { PresetCategory } from '@volstudio/core/visual';
import type { QaMetric, SpriteDoc } from '@volstudio/core/visual';

/**
 * Çıktı ucunun istemcisi — §8.11.
 *
 * İstemci PNG ÜRETMEZ: yalnızca belgeyi gönderir, sunucu render edip yazar.
 * Böylece kaydedilen dosya CLI'ın yazacağıyla aynı koddan çıkar ve tarayıcı
 * paketine PNG kodlayıcı girmez (D8).
 */

export interface SaveResult {
  docPath: string;
  pngPath: string;
  width: number;
  height: number;
  qaPass: boolean;
  qaMetrics: readonly QaMetric[];
}

export interface OutputListing {
  categories: readonly PresetCategory[];
  outputs: Record<string, string[]>;
}

async function parse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
  return payload;
}

export async function saveOutput(
  category: PresetCategory,
  name: string,
  doc: SpriteDoc,
): Promise<SaveResult> {
  const response = await fetch('/api/forge/save', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ category, name, doc }),
  });
  return parse<SaveResult>(response);
}

export async function listOutputs(): Promise<OutputListing> {
  return parse<OutputListing>(await fetch('/api/forge/list'));
}

export async function loadOutput(path: string): Promise<SpriteDoc> {
  const payload = await parse<{ doc: SpriteDoc }>(
    await fetch(`/api/forge/load?path=${encodeURIComponent(path)}`),
  );
  return payload.doc;
}
