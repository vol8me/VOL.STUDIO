import type { AssetEvent } from '../shared/contracts.js';

type EventInput =
  | { type: 'created'; asset: Extract<AssetEvent, { type: 'created' }>['asset'] }
  | { type: 'changed'; asset: Extract<AssetEvent, { type: 'changed' }>['asset'] }
  | { type: 'deleted'; assetId: string };

export type AssetEventListener = (event: AssetEvent) => void;

/** SSE yeniden bağlanmalarını taşıyan sınırlı revizyon günlüğü. */
export class AssetEventJournal {
  readonly #events: AssetEvent[] = [];
  readonly #listeners = new Set<AssetEventListener>();
  #revision = 1;

  public constructor(private readonly capacity = 256) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) throw new RangeError('capacity');
  }

  public get revision(): number {
    return this.#revision;
  }

  public publish(input: EventInput): AssetEvent {
    this.#revision += 1;
    const event = { ...input, revision: this.#revision } as AssetEvent;
    this.#events.push(event);
    if (this.#events.length > this.capacity) this.#events.shift();
    for (const listener of this.#listeners) listener(event);
    return event;
  }

  public publishResync(): AssetEvent {
    this.#revision += 1;
    const event: AssetEvent = { type: 'resync', revision: this.#revision };
    this.#events.length = 0;
    for (const listener of this.#listeners) listener(event);
    return event;
  }

  public since(lastRevision: number): AssetEvent[] {
    if (!Number.isSafeInteger(lastRevision) || lastRevision < 0) {
      return [{ type: 'resync', revision: this.#revision }];
    }
    if (lastRevision === this.#revision) return [];
    if (lastRevision > this.#revision) {
      return [{ type: 'resync', revision: this.#revision }];
    }
    const oldest = this.#events[0]?.revision;
    if (oldest === undefined || lastRevision < oldest - 1) {
      return [{ type: 'resync', revision: this.#revision }];
    }
    return this.#events.filter((event) => event.revision > lastRevision);
  }

  public subscribe(listener: AssetEventListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
}
