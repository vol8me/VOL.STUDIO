/** Oda adları: sunucu kaydı ve istemci katılımı aynı tabloyu okur. */
export const ROOM = {
  /** Herkese açık hızlı maç; moda göre eşleşir. */
  match: 'match',
  /** Kodla katılınan özel oda. */
  private: 'private',
} as const;

export type RoomName = (typeof ROOM)[keyof typeof ROOM];
