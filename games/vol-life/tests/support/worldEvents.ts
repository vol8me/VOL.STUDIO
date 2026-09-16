import type { WorldEvent, WorldEventSink } from '@/runtime/sim/WorldEvents';

/** Testte dünya tarihini toplayan sink; üretim yolu `noopWorldEventSink`tir. */
export class CollectingWorldEventSink implements WorldEventSink {
  readonly events: WorldEvent[] = [];

  emit(event: WorldEvent): void {
    this.events.push(event);
  }
}
