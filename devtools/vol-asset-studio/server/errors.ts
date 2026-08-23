import type { ApiErrorCode, ApiErrorResponse } from '../shared/contracts.js';

/** HTTP katmanına taşınabilen, kullanıcı metni içermeyen yapılandırılmış hata. */
export class AssetStudioError extends Error {
  public constructor(
    public readonly code: ApiErrorCode,
    public readonly statusCode: number,
    public readonly details?: Record<string, unknown>,
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.name = 'AssetStudioError';
  }
}

export function toApiError(error: unknown): {
  statusCode: number;
  body: ApiErrorResponse;
} {
  if (error instanceof AssetStudioError) {
    return {
      statusCode: error.statusCode,
      body: {
        error: {
          code: error.code,
          ...(error.details === undefined ? {} : { details: error.details }),
        },
      },
    };
  }

  if (typeof error === 'object' && error !== null && 'statusCode' in error) {
    const statusCode = Reflect.get(error, 'statusCode');
    if (typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500) {
      return {
        statusCode,
        body: { error: { code: 'invalid_request' } },
      };
    }
  }

  return {
    statusCode: 500,
    body: { error: { code: 'internal_error' } },
  };
}
