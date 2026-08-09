export interface BaseEntity {
  id: string;
  update(delta: number): void;
  /** Timer, tween, event listener gibi kaynakları serbest bırakır. */
  destroy(): void;
}
