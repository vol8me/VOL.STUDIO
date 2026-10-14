/** Oda adları: sunucu kaydı ve istemci katılımı aynı tabloyu okur. */
export const ROOM = {
  /** Kalıcı savaş dünyası: sunucu açıldığı sürece kapanmaz, taşarsa yenisi kurulur. */
  world: 'world',
} as const;

export type RoomName = (typeof ROOM)[keyof typeof ROOM];
