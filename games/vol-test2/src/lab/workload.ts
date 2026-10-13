import type Phaser from 'phaser';
import type { FactoryHost } from '@/app/host';
import type { Invariant } from './judge';
import type { LabLog } from './log';
import type { ParamSpec, ParamValues } from './params';

/** Bir yükün koşuya girerken ihtiyaç duyduğu dünya: oyun, sahne, günlük, denetleyici köprüsü. */
export interface WorkloadContext {
  readonly game: Phaser.Game;
  /** Yükün sahnesi: `WorkloadDef.scene` için başlatılmış ve kurulmuştur. */
  readonly scene: Phaser.Scene;
  readonly log: LabLog;
  readonly host: FactoryHost;
}

/** Çalışan bir yük. Kare başına `update` runtime tarafından `prestep`te çağrılır. */
export interface WorkloadInstance {
  update?(deltaMs: number): void;
  /** Sayısal sayaçlar: kare başına yük ölçüleri (sprite sayısı, adım süresi...). */
  counters(): Record<string, number>;
  /** Koşu boyunca değişmeyen olgular: karmaşıklık, boyut, ayar. Ajan sonuca yorum yaparken okur. */
  facts(): Record<string, string | number | boolean>;
  /** Yükün kendi doğruluk koşulları; biri bozulursa yargı fail olur. */
  invariants(): Invariant[];
  /** Yükün adlandırılmış eylemleri (`WorkloadDef.actions`). */
  act?(name: string, args: Record<string, unknown>): unknown;
  destroy(): void;
}

export interface ActionSpec {
  readonly name: string;
  readonly summary: string;
  readonly args: readonly ParamSpec[];
}

export interface WorkloadDef {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  /** Yükün çalışacağı sahne anahtarı. */
  readonly scene: string;
  readonly params: readonly ParamSpec[];
  readonly actions: readonly ActionSpec[];
  create(context: WorkloadContext, params: ParamValues): Promise<WorkloadInstance>;
}
