/** GameStateDb islemlerinde olusan hatalari temsil eder. */
export class GameStateDbError extends Error {
  override readonly cause?: unknown;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'GameStateDbError';
    this.cause = options?.cause;
  }
}
