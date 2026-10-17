/**
 * Protokol hatasının sınıfı — çağıran (CLI, agent, test) mesajı
 * ayrıştırmadan karar verebilsin. `path` repo köküne göreli yoldur.
 */
export type ProtocolErrorCode =
  | 'path'
  | 'symlink'
  | 'destination'
  | 'overwrite'
  | 'stage'
  | 'stale'
  | 'corrupt'
  | 'locked'
  | 'identity'
  | 'policy'
  | 'toolchain'
  | 'not-found'
  | 'invalid';

export class ProtocolError extends Error {
  readonly code: ProtocolErrorCode;
  readonly path: string | undefined;

  constructor(code: ProtocolErrorCode, message: string, path?: string) {
    super(path === undefined ? message : `${path}: ${message}`);
    this.name = 'ProtocolError';
    this.code = code;
    this.path = path;
  }
}
